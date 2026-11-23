import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors"
import { GetObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3"
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3"

function jsonResponse(body: Record<string, string>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
}

Deno.serve(async (request) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405)

    try {
        const body = await request.json().catch(() => null) as { name?: unknown; kind?: unknown } | null
        if (typeof body?.name !== "string" || !body.name.trim()) {
            return jsonResponse({ error: "A hack name is required." }, 400)
        }
        const kind = body.kind ?? "hack"
        if (kind !== "hack" && kind !== "coop") {
            return jsonResponse({ error: "Invalid hack type." }, 400)
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")
        const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>
        const publishableKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY")
        const accountId = Deno.env.get("R2_ACCOUNT_ID")
        const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")
        const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")

        if (!supabaseUrl || !publishableKey || !accountId || !accessKeyId || !secretAccessKey) {
            console.error("Missing Supabase or R2 function configuration.")
            return jsonResponse({ error: "Download service is not configured." }, 500)
        }

        const supabase = createClient(supabaseUrl, publishableKey)
        const { data: hack, error } = kind === "coop"
            ? await supabase
                .from("coop_hacks")
                .select("name, zip")
                .eq("name", body.name.trim())
                .maybeSingle()
            : await supabase
                .from("hacks")
                .select("name, bps")
                .eq("name", body.name.trim())
                .maybeSingle()

        if (error) {
            console.error("Could not look up hack patch:", error.message)
            return jsonResponse({ error: "Could not find the hack download." }, 500)
        }
        const fileName = kind === "coop" ? hack?.zip : hack?.bps
        if (!hack || typeof fileName !== "string" || !fileName.trim()) {
            return jsonResponse({ error: "No download is available for this hack." }, 404)
        }

        const objectKey = `${hack.name}/${fileName}`
        const downloadName = fileName.split("/").pop()?.replace(/["\\\r\n]/g, "_") || "download"
        const s3 = new S3Client({
            region: "auto",
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey },
        })
        const command = new GetObjectCommand({
            Bucket: "hackfiles",
            Key: objectKey,
            ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
        })
        const url = await getSignedUrl(s3, command, { expiresIn: 600 })

        return jsonResponse({ url })
    } catch (error) {
        console.error("Could not create R2 download URL:", error)
        return jsonResponse({ error: "Could not create a download link." }, 500)
    }
})
