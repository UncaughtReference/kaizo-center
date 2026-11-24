import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const distRoot = path.join(projectRoot, "dist")
const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/, "")
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const template = await readFile(path.join(distRoot, "index.html"), "utf8")

// GitHub Pages serves a 404 for client-side routes unless a matching static
// entry point exists. Copy the app shell for the top-level routes so direct
// visits and refreshes return HTTP 200.
for (const route of ["account", "users", "hacks", "coop-hacks", "progress-submissions"]) {
    const routeDirectory = path.join(distRoot, route)
    await mkdir(routeDirectory, { recursive: true })
    await writeFile(path.join(routeDirectory, "index.html"), template)
}

if (!supabaseUrl || !publishableKey) {
    console.warn("Skipping route-specific social pages: Supabase build variables are unavailable.")
    process.exit(0)
}

const repository = process.env.GITHUB_REPOSITORY || "UncaughtReference/kaizo-center"
const [owner, repo] = repository.split("/")
const siteBase = (process.env.VITE_SITE_URL || `https://${owner.toLowerCase()}.github.io/${repo}/`).replace(/\/$/, "")
const supabase = createClient(supabaseUrl, publishableKey)
const basePath = "/kaizo-center/"
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character])
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/\r?\n/g, "&#10;")
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

async function writeRoute(route, title, image = null, description = null) {
    const segments = route.split("/")
    const target = path.resolve(distRoot, ...segments, "index.html")
    if (!target.startsWith(`${distRoot}${path.sep}`)) return
    await mkdir(path.dirname(target), { recursive: true })
    const canonicalUrl = `${siteBase}${basePath}${segments.map((segment) => encodeURIComponent(segment)).join("/")}/`
    const shareImages = [...new Set((Array.isArray(image) ? image : [image]).filter(Boolean))]
    if (!shareImages.length) shareImages.push(`${siteBase}${basePath}logo.png`)
    const titleValue = escapeHtml(title)
    const descriptionTags = description
        ? `    <meta name="description" content="${escapeAttribute(description)}" />\n    <meta property="og:description" content="${escapeAttribute(description)}" />\n    <meta name="twitter:description" content="${escapeAttribute(description)}" />\n`
        : ""
    const imageTags = shareImages.map((source) => `    <meta property="og:image" content="${escapeHtml(source)}" />`).join("\n")
    const firstImage = escapeHtml(shareImages[0])
    const metadata = `<!-- SOCIAL_METADATA_START -->
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${titleValue}" />
${descriptionTags}    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
${imageTags}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${titleValue}" />
    <meta name="twitter:image" content="${firstImage}" />
    <!-- SOCIAL_METADATA_END -->`
    const html = template
        .replace(/<title>.*?<\/title>/s, `<title>${titleValue}</title>`)
        .replace(/<!-- SOCIAL_METADATA_START -->[\s\S]*?<!-- SOCIAL_METADATA_END -->/, metadata)
    await writeFile(target, html)
}

function difficultyName(value) {
    return ["Light Kaizo", "Normal Kaizo", "Super Kaizo"][Number(value)] || "Kaizo hack"
}

async function signedHackImages(hackName, imageData) {
    const filenames = [...new Set([imageData?.main, ...(Array.isArray(imageData?.images) ? imageData.images : [])]
        .filter((filename) => typeof filename === "string" && filename.trim()))]
    const signedImages = []
    for (const filename of filenames) {
        const objectPath = `${hackName}/${filename}`
        try {
            const { data, error } = await supabase.storage
                .from("hack_images")
                .createSignedUrl(objectPath, 31_536_000)
            if (error) throw error
            if (data?.signedUrl) signedImages.push(data.signedUrl)
        } catch (error) {
            console.warn(`Could not sign hack image ${objectPath}: ${error.message}`)
        }
    }
    return signedImages
}

try {
    const [hacks, coopHacks] = await Promise.all([
        fetchTable("hacks", "name,difficulty,star_count,authors,images"),
        fetchTable("coop_hacks", "name,difficulty,star_count,authors,images"),
    ])

    for (const hack of hacks) {
        const name = routeSegment(hack.name)
        if (!name) continue
        const images = await signedHackImages(name, hack.images)
        await writeRoute(`hacks/${name}`, `${name} | Kaizo Center`, images, `Difficulty: ${difficultyName(hack.difficulty)}\n⭐ ${hack.star_count}`)
    }
    for (const hack of coopHacks) {
        const name = routeSegment(hack.name)
        if (!name) continue
        const images = await signedHackImages(name, hack.images)
        await writeRoute(`coop-hacks/${name}`, `${name} Co-op | Kaizo Center`, images, `Difficulty: ${difficultyName(hack.difficulty)}\n⭐ ${hack.star_count}`)
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
        await writeRoute(`profiles/${username}`, `${displayName} | Kaizo Center`, profile.avatar_url)
    }

    console.log(`Generated social preview pages for ${hacks.length} hacks, ${coopHacks.length} co-op hacks, and ${profiles.length} public profiles.`)
} catch (error) {
    console.warn(`Could not generate route-specific social previews: ${error.message}`)
}
