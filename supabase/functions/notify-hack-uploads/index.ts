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

Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return jsonResponse("Method not allowed", 405)

    const expectedSecret = Deno.env.get("HACK_WEBHOOK_SECRET")
    const suppliedSecret = req.headers.get("X-Hack-Webhook-Secret")
    if (!expectedSecret || suppliedSecret !== expectedSecret) {
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

    const discordWebhookUrl = Deno.env.get("DISCORD_HACK_WEBHOOK_URL")
    const siteUrl = Deno.env.get("HACK_SITE_URL")?.replace(/\/+$/, "")
    if (!discordWebhookUrl || !siteUrl) {
        console.error("Missing Discord webhook or public site URL secret.")
        return jsonResponse("Notification service is not configured", 500)
    }

    const isCoop = payload.table === "coop_hacks"
    const kindLabel = isCoop ? "Co-op hack" : "Hack"
    const route = isCoop ? "coop-hacks" : "hacks"
    const hackUrl = `${siteUrl}/${route}/${encodeURIComponent(record.name)}`
    const starCount = typeof record.star_count === "number" ? record.star_count : "?"
    const difficulty = getDifficultyName(record.difficulty)

    try {
        const discordResponse = await fetch(discordWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content: `New ${kindLabel} released: **${record.name}**\nDifficulty: ${difficulty}\n⭐ ${starCount}\n${hackUrl}`,
                allowed_mentions: { parse: [] }, // prevent pings
            }),
        })

        if (!discordResponse.ok) {
            console.error(`Discord notification failed with HTTP ${discordResponse.status}.`)
            return jsonResponse("Failed to send Discord notification", 502)
        }

        return jsonResponse("Notification sent", 200)
    } catch (error) {
        console.error("Error sending Discord notification:", error)
        return jsonResponse("Internal server error", 500)
    }
})
