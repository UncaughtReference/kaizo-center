import { useEffect, useMemo, useState } from "react"
import { resolveProfileDisplayNames } from "@/lib/displayNames"

export default function useDisplayNames(usernames: string[]) {
    const key = useMemo(() => [...new Set(usernames.map((name) => name.trim()).filter(Boolean))].join("\u0000"), [usernames.join("\u0000")])
    const stableNames = useMemo(() => key ? key.split("\u0000") : [], [key])
    const [displayNames, setDisplayNames] = useState<Record<string, string>>({})

    useEffect(() => {
        let isActive = true
        const load = () => void resolveProfileDisplayNames(stableNames).then((resolved) => {
            if (isActive) setDisplayNames(Object.fromEntries(resolved))
        })
        load()
        window.addEventListener("profile-display-name-updated", load)
        return () => {
            isActive = false
            window.removeEventListener("profile-display-name-updated", load)
        }
    }, [key])

    return displayNames
}
