import { useEffect } from "react"

export type PageMetadata = {
    title: string
    description: string
    image?: string | null
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

export function setPageMetadata({ title, description, image }: PageMetadata) {
    const fallbackImage = new URL(`${import.meta.env.BASE_URL}logo.png`, window.location.origin).toString()
    const imageUrl = image || fallbackImage
    const currentUrl = window.location.href
    document.title = title
    setMeta("name", "description", description)
    setMeta("property", "og:type", "website")
    setMeta("property", "og:title", title)
    setMeta("property", "og:description", description)
    setMeta("property", "og:url", currentUrl)
    setMeta("property", "og:image", imageUrl)
    setMeta("property", "og:image:alt", `${title} — Kaizo Center`)
    setMeta("name", "twitter:card", "summary_large_image")
    setMeta("name", "twitter:title", title)
    setMeta("name", "twitter:description", description)
    setMeta("name", "twitter:image", imageUrl)
}

export function usePageMetadata(metadata: PageMetadata) {
    useEffect(() => setPageMetadata(metadata), [metadata.title, metadata.description, metadata.image])
}
