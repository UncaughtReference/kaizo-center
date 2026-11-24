import { supabase } from "@/lib/supabase"

type PendingName = {
    username: string
    waiters: ((displayName: string) => void)[]
    loading: boolean
}

const cache = new Map<string, string>()
const pending = new Map<string, PendingName>()
let flushScheduled = false

export function updateCachedProfileDisplayName(username: string, displayName: string) {
    cache.set(username.trim().toLocaleLowerCase(), displayName.trim())
    window.dispatchEvent(new Event("profile-display-name-updated"))
}

function scheduleFlush() {
    if (flushScheduled) return
    flushScheduled = true
    queueMicrotask(() => { void flushPendingNames() })
}

async function flushPendingNames() {
    flushScheduled = false
    const batch = [...pending.entries()].filter(([, entry]) => !entry.loading)
    if (!batch.length) return
    batch.forEach(([, entry]) => { entry.loading = true })
    try {
        const { data, error } = await supabase.rpc("resolve_profile_display_names", {
            p_usernames: batch.map(([, entry]) => entry.username),
        })
        if (error) throw error
        const rows = (data ?? []) as { username: string; display_name: string | null }[]
        const returnedNames = new Map<string, string>(rows.map((entry) => [
            entry.username.toLocaleLowerCase(),
            entry.display_name ?? "",
        ]))
        for (const [key, entry] of batch) {
            const displayName = returnedNames.get(key) || entry.username
            cache.set(key, displayName)
            pending.delete(key)
            entry.waiters.forEach((resolve) => resolve(displayName))
        }
    } catch {
        for (const [key, entry] of batch) {
            cache.set(key, entry.username)
            pending.delete(key)
            entry.waiters.forEach((resolve) => resolve(entry.username))
        }
    }
    if ([...pending.values()].some((entry) => !entry.loading)) scheduleFlush()
}

export function resolveProfileDisplayNames(usernames: string[]): Promise<Map<string, string>> {
    const names = [...new Set(usernames.map((name) => name.trim()).filter(Boolean))]
    return Promise.all(names.map((username) => {
        const key = username.toLocaleLowerCase()
        const known = cache.get(key)
        if (known) return Promise.resolve([key, known] as const)
        return new Promise<readonly [string, string]>((resolve) => {
            const waiter = (displayName: string) => resolve([key, displayName] as const)
            const existing = pending.get(key)
            if (existing) existing.waiters.push(waiter)
            else pending.set(key, { username, waiters: [waiter], loading: false })
            scheduleFlush()
        })
    })).then((entries) => new Map(entries))
}
