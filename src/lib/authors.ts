import type { HackAuthor } from "@/types/HackAuthor"

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function getAuthors(value: unknown): HackAuthor[] {
    if (Array.isArray(value)) {
        return value.flatMap((author): HackAuthor[] => {
            if (typeof author === "string") {
                return [{ name: author, allow_edit: false, allow_delete: false }]
            }

            if (!isRecord(author) || typeof author.name !== "string") return []

            return [{
                name: author.name,
                allow_edit: author.allow_edit === true,
                allow_delete: author.allow_delete === true,
            }]
        })
    }

    if (!isRecord(value)) return []

    if ("author" in value) return getAuthors(value.author)
    if ("authors" in value) return getAuthors(value.authors)

    return typeof value.name === "string" ? getAuthors([value]) : []
}
