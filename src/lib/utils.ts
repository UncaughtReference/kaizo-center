export { cn } from "cn"

export function normalizeHackName(name: string) {
    return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()
}
