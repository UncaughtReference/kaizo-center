import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors"
import { AwsClient } from "npm:aws4fetch@1"

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
        const authorization = request.headers.get("Authorization")
        if (!authorization) return jsonResponse({ error: "Sign in to submit a hack." }, 401)

        const body = await request.json().catch(() => null) as {
            name?: unknown
            kind?: unknown
            originalFileName?: unknown
            size?: unknown
        } | null
        if (typeof body?.name !== "string" || !body.name.trim()) {
            return jsonResponse({ error: "A hack name is required." }, 400)
        }
        const name = body.name.trim()
        if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
            return jsonResponse({ error: "Hack names cannot contain slashes." }, 400)
        }
        const kind = body.kind
        if (kind !== "hack" && kind !== "coop") return jsonResponse({ error: "Invalid hack type." }, 400)
        if (typeof body.originalFileName !== "string") return jsonResponse({ error: "A patch or ZIP file is required." }, 400)
        if (typeof body.size !== "number" || !Number.isInteger(body.size) || body.size <= 0 || body.size > 30 * 1024 * 1024) {
            return jsonResponse({ error: "The BPS/ZIP file must be 30 MB or smaller." }, 400)
        }

        const extension = kind === "coop" ? ".zip" : ".bps"
        if (!body.originalFileName.toLowerCase().endsWith(extension)) {
            return jsonResponse({ error: `Upload a ${extension.slice(1).toUpperCase()} file.` }, 400)
        }
        const fileName = body.originalFileName
        if (
            fileName.length > 255 ||
            fileName === "." ||
            fileName === ".." ||
            fileName.includes("/") ||
            fileName.includes("\\") ||
            /[\u0000-\u001f\u007f]/.test(fileName)
        ) {
            return jsonResponse({ error: "The uploaded filename is invalid." }, 400)
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")
        const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>
        const publishableKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY")
        const accountId = Deno.env.get("R2_ACCOUNT_ID")
        const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")
        const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")

        if (!supabaseUrl || !publishableKey || !accountId || !accessKeyId || !secretAccessKey) {
            console.error("Missing Supabase or R2 upload configuration.")
            return jsonResponse({ error: "Upload service is not configured." }, 500)
        }

        const userClient = createClient(supabaseUrl, publishableKey, {
            global: { headers: { Authorization: authorization } },
        })
        const { data: { user }, error: userError } = await userClient.auth.getUser()
        if (userError || !user) return jsonResponse({ error: "Sign in to submit a hack." }, 401)

        const { data: profile, error: profileError } = await userClient
            .from("profiles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle()
        if (profileError || !profile || ![0, 1, 2].includes(profile.role)) {
            return jsonResponse({ error: profile?.role === 3 ? "Banned accounts cannot upload hacks." : "Your profile could not be verified." }, 403)
        }

        const signer = new AwsClient({
            service: "s3",
            region: "auto",
            accessKeyId,
            secretAccessKey,
        })
        const objectUrl = new URL(
            `/hackfiles/${encodeURIComponent(name)}/${encodeURIComponent(fileName)}?X-Amz-Expires=300`,
            `https://${accountId}.r2.cloudflarestorage.com`,
        )
        const signedRequest = await signer.sign(
            new Request(objectUrl, {
                method: "PUT",
                headers: { "Content-Type": "application/octet-stream" },
            }),
            { aws: { signQuery: true, allHeaders: true } },
        )

        return jsonResponse({ url: signedRequest.url.toString(), fileName })
    } catch (error) {
        console.error("Could not create R2 upload URL:", error)
        return jsonResponse({ error: "Could not prepare the file upload." }, 500)
    }
})
