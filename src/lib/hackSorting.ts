export type HackSortOption =
    | "name-asc" | "name-desc"
    | "creation-asc" | "creation-desc"
    | "upload-asc" | "upload-desc"
    | "difficulty-asc" | "difficulty-desc"
    | "stars-asc" | "stars-desc"

type SortableHack = {
    name: string
    creation_date: string
    upload_date: string
    difficulty: number
    star_count: number
}

export function sortHacks<T extends SortableHack>(hacks: T[], option: HackSortOption) {
    const [field, direction] = option.split("-") as ["name" | "creation" | "upload" | "difficulty" | "stars", "asc" | "desc"]
    const multiplier = direction === "asc" ? 1 : -1

    return [...hacks].sort((a, b) => {
        let comparison = 0
        if (field === "name") {
            comparison = a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        } else if (field === "creation" || field === "upload") {
            const dateField = field === "creation" ? "creation_date" : "upload_date"
            const first = Date.parse(a[dateField])
            const second = Date.parse(b[dateField])
            if (!Number.isFinite(first) || !Number.isFinite(second)) return 0
            comparison = first - second
        } else if (field === "difficulty") {
            comparison = a.difficulty - b.difficulty
        } else {
            comparison = a.star_count - b.star_count
        }
        return comparison * multiplier
    })
}
