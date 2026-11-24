import { useEffect } from "react"

export type PageMetadata = {
    title: string
    description?: string | null
    image?: string | null
    images?: string[]
}

function setMeta(attribute: "name" | "property", key: string, value: string) {
    let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
    if (!element) {
        element = document.createElement("meta")
        element.setAttribute(attribute, key)
        document.head.append(element)
    }
    element.content = value
}

export function setPageMetadata({ title, description, image, images: pageImages = [] }: PageMetadata) {
    const fallbackImage = new URL(`${import.meta.env.BASE_URL}logo.png`, window.location.origin).toString()
    const imageUrl = image || fallbackImage
    const images = [...new Set([imageUrl, ...pageImages].filter(Boolean))]
    const currentUrl = window.location.href
    document.title = title
    setMeta("property", "og:type", "website")
    setMeta("property", "og:title", title)
    setMeta("property", "og:url", currentUrl)
    if (description) {
        setMeta("name", "description", description)
        setMeta("property", "og:description", description)
        setMeta("name", "twitter:description", description)
    } else {
        document.head.querySelector('meta[name="description"]')?.remove()
        document.head.querySelector('meta[property="og:description"]')?.remove()
        document.head.querySelector('meta[name="twitter:description"]')?.remove()
    }
    document.head.querySelectorAll('meta[property="og:image"]').forEach((element) => element.remove())
    for (const source of images) {
        const element = document.createElement("meta")
        element.setAttribute("property", "og:image")
        element.content = source
        document.head.append(element)
    }
    setMeta("property", "og:image:alt", `${title} — Kaizo Center`)
    setMeta("name", "twitter:card", "summary_large_image")
    setMeta("name", "twitter:title", title)
    setMeta("name", "twitter:image", images[0] ?? imageUrl)
}

export function usePageMetadata(metadata: PageMetadata) {
    useEffect(() => setPageMetadata(metadata), [metadata.title, metadata.description, metadata.image, metadata.images?.join("|")])
}
