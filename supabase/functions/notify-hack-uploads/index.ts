type HackRecord = {
    name?: unknown
    status?: unknown
    difficulty?: unknown
    star_count?: unknown
}

type DatabaseWebhookPayload = {
    type?: unknown
    table?: unknown
    schema?: unknown
    record?: HackRecord | null
    old_record?: HackRecord | null
}

const PUBLIC_STATUS = 0
const ALLOWED_TABLES = new Set(["hacks", "coop_hacks"])

function jsonResponse(message: string, status: number) {
    return new Response(message, {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
}

function getDifficultyName(value: unknown) {
    switch (value) {
        case 0: return "Light Kaizo"
        case 1: return "Normal Kaizo"
        case 2: return "Super Kaizo"
        default: return typeof value === "number" ? `Unknown (${value})` : "Unknown"
    }
}

function isAuthorizedWebhook(req: Request) {
    // Custom HTTP Request webhooks can use this dedicated shared-secret header.
    const expectedWebhookSecret = Deno.env.get("HACK_WEBHOOK_SECRET")
    if (
        expectedWebhookSecret &&
        req.headers.get("X-Hack-Webhook-Secret") === expectedWebhookSecret
    ) return true

    // The Dashboard's "Supabase Edge Functions > Add secret key" option sends
    // the project's default secret key in `apikey`. Supabase provides the key
    // values to Edge Functions in this built-in environment variable.
    const suppliedApiKey = req.headers.get("apikey")
    if (!suppliedApiKey) return false
    try {
        const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, unknown>
        return typeof secretKeys.default === "string" && suppliedApiKey === secretKeys.default
    } catch {
        return false
    }
}

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return jsonResponse("Method not allowed", 405)

    if (!isAuthorizedWebhook(req)) {
        return jsonResponse("Unauthorized", 401)
    }

    let payload: DatabaseWebhookPayload
    try {
        payload = await req.json() as DatabaseWebhookPayload
    } catch {
        return jsonResponse("Bad request: invalid JSON", 400)
    }

    if (
        payload.schema !== "public" ||
        typeof payload.table !== "string" ||
        !ALLOWED_TABLES.has(payload.table) ||
        (payload.type !== "INSERT" && payload.type !== "UPDATE")
    ) {
        return jsonResponse("Ignored unsupported database event", 200)
    }

    const record = payload.record
    if (!record || typeof record.name !== "string" || !record.name.trim()) {
        return jsonResponse("Bad request: event is missing the hack name", 400)
    }

    const previousStatus = payload.old_record?.status
    const becamePublic = record.status === PUBLIC_STATUS && (
        payload.type === "INSERT" ||
        (typeof previousStatus === "number" && previousStatus !== PUBLIC_STATUS)
    )
    if (!becamePublic) return jsonResponse("No public release to announce", 200)

    const discordBotToken = Deno.env.get("DISCORD_BOT_TOKEN")
    const discordChannelId = Deno.env.get("DISCORD_CHANNEL_ID")
    const siteUrl = Deno.env.get("HACK_SITE_URL")?.replace(/\/+$/, "")
    if (!discordBotToken || !discordChannelId || !/^\d{17,20}$/.test(discordChannelId) || !siteUrl) {
        console.error("Missing or invalid Discord bot, channel, or public site configuration.")
        return jsonResponse("Notification service is not configured", 500)
    }

    const isCoop = payload.table === "coop_hacks"
    const kindLabel = isCoop ? "Co-op hack" : "Hack"
    const route = isCoop ? "coop-hacks" : "hacks"
    const displayName = record.name.length > 300 ? `${record.name.slice(0, 297)}...` : record.name
    const hackUrl = `${siteUrl}/${route}/${encodeURIComponent(record.name)}`
    const starCount = typeof record.star_count === "number" ? record.star_count : "?"
    const difficulty = getDifficultyName(record.difficulty)
    const content = `New ${kindLabel} released: **${displayName}**\nDifficulty: ${difficulty}\n\u{2B50} ${starCount}\n${hackUrl}`

    try {
        const discordResponse = await fetch(`https://discord.com/api/v10/channels/${discordChannelId}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bot ${discordBotToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                content,
                allowed_mentions: { parse: [] }, // prevent pings
            }),
        })

        if (!discordResponse.ok) {
            console.error(`Discord bot message failed with HTTP ${discordResponse.status}.`)
            return jsonResponse("Failed to send Discord notification", 502)
        }

        return jsonResponse("Notification sent", 200)
    } catch (error) {
        console.error("Error sending Discord notification:", error)
        return jsonResponse("Internal server error", 500)
    }
})
