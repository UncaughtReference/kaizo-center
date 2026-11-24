import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const distRoot = path.join(projectRoot, "dist")
const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/, "")
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !publishableKey) {
    console.warn("Skipping route-specific social pages: Supabase build variables are unavailable.")
    process.exit(0)
}

const repository = process.env.GITHUB_REPOSITORY || "UncaughtReference/kaizo-center"
const [owner, repo] = repository.split("/")
const siteBase = (process.env.VITE_SITE_URL || `https://${owner.toLowerCase()}.github.io/${repo}/`).replace(/\/$/, "")
const basePath = "/kaizo-center/"
const template = await readFile(path.join(distRoot, "index.html"), "utf8")
const defaultDescription = "Explore Kaizo hacks, track progress, earn XP, and share reviews on Kaizo Center."

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character])
}

async function request(pathname, options = {}) {
    const response = await fetch(`${supabaseUrl}${pathname}`, {
        ...options,
        headers: {
            apikey: publishableKey,
            Authorization: `Bearer ${publishableKey}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
        },
    })
    if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
    return response.json()
}

async function fetchTable(table, fields) {
    const rows = []
    for (let offset = 0; ; offset += 1000) {
        const query = new URLSearchParams({ select: fields, status: "eq.0", order: "name.asc", limit: "1000", offset: String(offset) })
        const page = await request(`/rest/v1/${table}?${query}`)
        rows.push(...page)
        if (page.length < 1000) return rows
    }
}

function routeSegment(value) {
    const name = String(value ?? "").trim()
    if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") return null
    return name
}

async function writeRoute(route, title, description, image = null) {
    const segments = route.split("/")
    const target = path.resolve(distRoot, ...segments, "index.html")
    if (!target.startsWith(`${distRoot}${path.sep}`)) return
    await mkdir(path.dirname(target), { recursive: true })
    const canonicalUrl = `${siteBase}${basePath}${segments.map((segment) => encodeURIComponent(segment)).join("/")}/`
    const shareImage = image || `${siteBase}${basePath}logo.png`
    const titleValue = escapeHtml(title)
    const descriptionValue = escapeHtml((description || defaultDescription).slice(0, 300))
    const imageValue = escapeHtml(shareImage)
    const metadata = `<!-- SOCIAL_METADATA_START -->
    <meta name="description" content="${descriptionValue}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${titleValue}" />
    <meta property="og:description" content="${descriptionValue}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:image" content="${imageValue}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${titleValue}" />
    <meta name="twitter:description" content="${descriptionValue}" />
    <meta name="twitter:image" content="${imageValue}" />
    <!-- SOCIAL_METADATA_END -->`
    const html = template
        .replace(/<title>.*?<\/title>/s, `<title>${titleValue}</title>`)
        .replace(/<!-- SOCIAL_METADATA_START -->[\s\S]*?<!-- SOCIAL_METADATA_END -->/, metadata)
    await writeFile(target, html)
}

function difficultyName(value) {
    return ["Light Kaizo", "Normal Kaizo", "Super Kaizo"][Number(value)] || "Kaizo hack"
}

try {
    const [hacks, coopHacks] = await Promise.all([
        fetchTable("hacks", "name,description,difficulty,star_count,authors"),
        fetchTable("coop_hacks", "name,difficulty,star_count,authors"),
    ])

    for (const hack of hacks) {
        const name = routeSegment(hack.name)
        if (!name) continue
        const description = [hack.description?.trim(), `${hack.star_count} stars`, difficultyName(hack.difficulty)]
            .filter(Boolean).join(" · ")
        await writeRoute(`hacks/${name}`, `${name} | Kaizo Center`, description)
    }
    for (const hack of coopHacks) {
        const name = routeSegment(hack.name)
        if (!name) continue
        const description = `Co-op Kaizo hack · ${hack.star_count} stars · ${difficultyName(hack.difficulty)}`
        await writeRoute(`coop-hacks/${name}`, `${name} Co-op | Kaizo Center`, description)
    }

    const profiles = []
    for (let offset = 0; ; offset += 1000) {
        const page = await request("/rest/v1/rpc/get_public_profile_metadata", {
            method: "POST",
            body: JSON.stringify({ p_offset: offset, p_limit: 1000 }),
        })
        profiles.push(...page)
        if (page.length < 1000) break
    }
    for (const profile of profiles) {
        const username = routeSegment(profile.username)
        if (!username) continue
        const displayName = profile.display_name?.trim() || profile.username
        const description = `View ${displayName}'s Kaizo Center profile, XP, hacks, and approved progress.`
        await writeRoute(`profiles/${username}`, `${displayName} | Kaizo Center`, description, profile.avatar_url)
    }

    console.log(`Generated social preview pages for ${hacks.length} hacks, ${coopHacks.length} co-op hacks, and ${profiles.length} public profiles.`)
} catch (error) {
    console.warn(`Could not generate route-specific social previews: ${error.message}`)
}
