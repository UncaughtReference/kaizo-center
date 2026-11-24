import { createClient } from "npm:@supabase/supabase-js@2"
import { DeleteObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3"

type HackRow = {
    id?: number
    name: string
    images: { main?: unknown; images?: unknown } | null
    bps?: unknown
    zip?: unknown
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
}

function getImagePaths(row: HackRow) {
    if (!row.images || typeof row.images !== "object") return []
    const filenames = [row.images.main, ...(Array.isArray(row.images.images) ? row.images.images : [])]
    return [...new Set(filenames.filter((filename): filename is string =>
        typeof filename === "string" && filename.length > 0 && !filename.includes("/") && !filename.includes("\\")
    ).map((filename) => `${row.name}/${filename}`))]
}

function getDownloadKey(row: HackRow) {
    const filename = "bps" in row ? row.bps : row.zip
    return typeof filename === "string" && filename.trim() && !filename.includes("/") && !filename.includes("\\")
        ? `${row.name}/${filename}`
        : null
}

function getAdminKey() {
    const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (legacyKey) return legacyKey
    try {
        const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, unknown>
        return typeof secretKeys.default === "string" ? secretKeys.default : null
    } catch {
        return null
    }
}

function isAuthorized(request: Request, adminKey: string) {
    return request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") === adminKey
}

Deno.serve(async (request: Request) => {
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405)

    const adminKey = getAdminKey()
    if (!adminKey || !isAuthorized(request, adminKey)) return jsonResponse({ error: "Unauthorized." }, 401)

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    if (!supabaseUrl) return jsonResponse({ error: "Supabase is not configured." }, 500)

    const accountId = Deno.env.get("R2_ACCOUNT_ID")
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")
    const admin = createClient(supabaseUrl, adminKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    try {
        const cutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        const [hacksResult, coopResult] = await Promise.all([
            admin.from("hacks").select("id, name, images, bps").eq("status", 2).lte("rejected_at", cutoff),
            admin.from("coop_hacks").select("name, images, zip").eq("status", 2).lte("rejected_at", cutoff),
        ])
        if (hacksResult.error) throw hacksResult.error
        if (coopResult.error) throw coopResult.error

        const rejectedHacks = (hacksResult.data ?? []) as HackRow[]
        const rejectedCoopHacks = (coopResult.data ?? []) as HackRow[]
        const rejectedNames = new Set(rejectedHacks.map((row) => row.name))
        const rejectedCoopNames = new Set(rejectedCoopHacks.map((row) => row.name))

        if (rejectedHacks.length || rejectedCoopHacks.length) {
            const pageSize = 1000
            const allHacks: HackRow[] = []
            const allCoopHacks: HackRow[] = []
            for (let from = 0; ; from += pageSize) {
                const { data, error } = await admin.from("hacks").select("id, name, images, bps").range(from, from + pageSize - 1)
                if (error) throw error
                const page = (data ?? []) as HackRow[]
                allHacks.push(...page)
                if (page.length < pageSize) break
            }
            for (let from = 0; ; from += pageSize) {
                const { data, error } = await admin.from("coop_hacks").select("name, images, zip").range(from, from + pageSize - 1)
                if (error) throw error
                const page = (data ?? []) as HackRow[]
                allCoopHacks.push(...page)
                if (page.length < pageSize) break
            }

            const otherHacks = allHacks.filter((row) => !rejectedNames.has(row.name))
            const otherCoopHacks = allCoopHacks.filter((row) => !rejectedCoopNames.has(row.name))
            const remainingRows = [...otherHacks, ...otherCoopHacks]
            const referencedImages = new Set(remainingRows.flatMap(getImagePaths))
            const referencedDownloads = new Set(remainingRows.map(getDownloadKey).filter((key): key is string => key !== null))
            const candidateImages = [...new Set([...rejectedHacks, ...rejectedCoopHacks].flatMap(getImagePaths))]
                .filter((path) => !referencedImages.has(path))
            const candidateDownloads = [...new Set([...rejectedHacks, ...rejectedCoopHacks]
                .map(getDownloadKey).filter((key): key is string => key !== null))]
                .filter((key) => !referencedDownloads.has(key))

            if (candidateDownloads.length && (!accountId || !accessKeyId || !secretAccessKey)) {
                throw new Error("R2 cleanup is not configured; rejected hack rows were retained.")
            }

            if (candidateImages.length) {
                const { error } = await admin.storage.from("hack_images").remove(candidateImages)
                if (error) throw new Error(`Could not remove rejected hack images: ${error.message}`)
            }
            if (candidateDownloads.length) {
                const s3 = new S3Client({
                    region: "auto",
                    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
                    credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
                })
                for (const key of candidateDownloads) {
                    await s3.send(new DeleteObjectCommand({ Bucket: "hackfiles", Key: key }))
                }
            }

            if (rejectedHacks.length) {
                const ids = rejectedHacks.map((row) => row.id).filter((id): id is number => typeof id === "number")
                if (ids.length !== rejectedHacks.length) throw new Error("A rejected hack is missing its database ID.")
                const { error } = await admin.from("hacks").delete().in("id", ids).eq("status", 2).lte("rejected_at", cutoff)
                if (error) throw error
            }
            if (rejectedCoopHacks.length) {
                const { error } = await admin.from("coop_hacks").delete().in("name", [...rejectedCoopNames]).eq("status", 2).lte("rejected_at", cutoff)
                if (error) throw error
            }
        }

        const { data: deletedProgress, error: progressError } = await admin
            .from("progress")
            .delete()
            .eq("status", 2)
            .lte("rejected_at", cutoff)
            .select("id")
        if (progressError) throw progressError

        return jsonResponse({
            deletedHacks: rejectedHacks.length,
            deletedCoopHacks: rejectedCoopHacks.length,
            deletedProgress: deletedProgress?.length ?? 0,
            cutoff,
        })
    } catch (error) {
        console.error("Rejected submission cleanup failed:", error)
        return jsonResponse({ error: error instanceof Error ? error.message : "Cleanup failed." }, 500)
    }
})
