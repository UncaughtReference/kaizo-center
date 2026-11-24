import { createClient } from "npm:@supabase/supabase-js@2"
import { DeleteObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3"
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors"

type DeleteRequest = {
    kind?: unknown
    name?: unknown
}

type HackFiles = {
    id?: number
    name: string
    authors?: unknown
    images?: { main?: unknown; images?: unknown } | null
    bps?: unknown
    zip?: unknown
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
}

function getImagePaths(name: string, images: HackFiles["images"]) {
    if (!images || typeof images !== "object") return []
    const filenames = [images.main, ...(Array.isArray(images.images) ? images.images : [])]
    return [...new Set(filenames.filter((filename): filename is string =>
        typeof filename === "string" && filename.length > 0 && !filename.includes("/") && !filename.includes("\\")
    ).map((filename) => `${name}/${filename}`))]
}

Deno.serve(async (request: Request) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405)

    const authorization = request.headers.get("Authorization")
    if (!authorization) return jsonResponse({ error: "Sign in to delete a hack." }, 401)

    const body = await request.json().catch(() => null) as DeleteRequest | null
    if (
        !body ||
        (body.kind !== "hack" && body.kind !== "coop") ||
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name === "." ||
        body.name === ".." ||
        body.name.includes("/") ||
        body.name.includes("\\")
    ) {
        return jsonResponse({ error: "A valid hack name and type are required." }, 400)
    }

    const kind = body.kind
    const name = body.name.trim()
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>
    const publishableKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY")
    let secretKeys: Record<string, string> = {}
    try {
        secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>
    } catch {
        // Older projects may only have the legacy service role environment variable.
    }
    const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? secretKeys.default
    if (!supabaseUrl || !publishableKey || !adminKey) {
        console.error("Missing Supabase configuration for hack deletion.")
        return jsonResponse({ error: "Hack deletion is not configured." }, 500)
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
        global: { headers: { Authorization: authorization } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return jsonResponse({ error: "Sign in to delete a hack." }, 401)

    const adminClient = createClient(supabaseUrl, adminKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
    const table = kind === "coop" ? "coop_hacks" : "hacks"
    const selection = kind === "coop" ? "name, authors, images, zip" : "id, name, authors, images, bps"
    const { data: hack, error: lookupError } = await adminClient
        .from(table)
        .select(selection)
        .eq("name", name)
        .maybeSingle()

    if (lookupError) {
        console.error("Could not look up hack files before deletion:", lookupError.message)
        return jsonResponse({ error: "Could not load the hack files for deletion." }, 500)
    }
    if (!hack) return jsonResponse({ error: "Hack not found." }, 404)

    const files = hack as HackFiles
    const { data: profile, error: profileError } = await adminClient
        .from("profiles")
        .select("username, role")
        .eq("user_id", user.id)
        .maybeSingle()
    if (profileError || !profile || typeof profile.username !== "string") {
        console.error("Could not verify hack deletion permissions:", profileError?.message)
        return jsonResponse({ error: "Could not verify your permission to delete this hack." }, 500)
    }

    const authorCanDelete = Array.isArray(files.authors) && files.authors.some((author) =>
        typeof author === "object" && author !== null &&
        "name" in author && typeof author.name === "string" &&
        author.name.trim().toLocaleLowerCase() === profile.username.trim().toLocaleLowerCase() &&
        "allow_delete" in author && author.allow_delete === true
    )
    if (profile.role !== 2 && !authorCanDelete) {
        return jsonResponse({ error: "You do not have permission to delete this hack." }, 403)
    }

    const imagePaths = getImagePaths(files.name, files.images)
    const downloadFile = kind === "coop" ? files.zip : files.bps
    const downloadKey = typeof downloadFile === "string" && downloadFile.trim()
        ? `${files.name}/${downloadFile}`
        : null

    const accountId = Deno.env.get("R2_ACCOUNT_ID")
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")
    if (downloadKey && (!accountId || !accessKeyId || !secretAccessKey)) {
        console.error("Missing R2 configuration for hack download cleanup.")
        return jsonResponse({ error: "R2 file cleanup is not configured; the hack was not deleted." }, 500)
    }

    // Authorization above matches the site's moderator/author delete rule.
    // Delete with the admin client because coop_hacks does not grant direct
    // DELETE access to the authenticated role.
    let deleteQuery = adminClient.from(table).delete().eq("name", name)
    if (kind === "hack" && typeof files.id === "number") {
        deleteQuery = deleteQuery.eq("id", files.id)
    }
    const { data: deletedRows, error: deleteError } = await deleteQuery.select("name")
    if (deleteError) {
        console.error("Could not delete hack row:", deleteError.message)
        return jsonResponse({ error: "Could not delete the hack from the database." }, 500)
    }
    if (!deletedRows?.length) return jsonResponse({ error: "The hack was not deleted." }, 404)

    // A regular hack and its co-op port can share the same storage folder.
    // Keep any object still referenced by another hack row.
    const [{ data: remainingHacks, error: hacksError }, { data: remainingCoopHacks, error: coopError }] = await Promise.all([
        adminClient.from("hacks").select("name, images, bps"),
        adminClient.from("coop_hacks").select("name, images, zip"),
    ])
    const cleanupErrors: string[] = []
    if (hacksError || coopError) {
        console.error("Could not check whether hack files are still referenced.")
        cleanupErrors.push("reference-check")
    } else {
        const allRemainingHacks = [...(remainingHacks ?? []), ...(remainingCoopHacks ?? [])]
        const referencedImagePaths = new Set(allRemainingHacks.flatMap((row) => getImagePaths(row.name, row.images)))
        const unreferencedImagePaths = imagePaths.filter((path) => !referencedImagePaths.has(path))
        const referencedDownloadKeys = new Set(allRemainingHacks.flatMap((row) => {
            const fileName = "bps" in row ? row.bps : row.zip
            return typeof fileName === "string" && fileName.trim() ? [`${row.name}/${fileName}`] : []
        }))
        const downloadIsUnreferenced = downloadKey !== null && !referencedDownloadKeys.has(downloadKey)

        if (unreferencedImagePaths.length > 0) {
            const { error } = await adminClient.storage.from("hack_images").remove(unreferencedImagePaths)
            if (error) {
                console.error("Could not remove hack images:", error.message)
                cleanupErrors.push("hack_images")
            }
        }

        if (downloadIsUnreferenced && downloadKey && accountId && accessKeyId && secretAccessKey) {
            try {
                const s3 = new S3Client({
                    region: "auto",
                    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
                    credentials: { accessKeyId, secretAccessKey },
                })
                await s3.send(new DeleteObjectCommand({ Bucket: "hackfiles", Key: downloadKey }))
            } catch (error) {
                console.error("Could not remove hack download from R2:", error)
                cleanupErrors.push("hackfiles")
            }
        }
    }

    return jsonResponse({ deleted: true, cleanupComplete: cleanupErrors.length === 0, cleanupErrors })
})
