import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import HackCard from "@/components/HackCard"
import CoopHackCard from "@/components/CoopHackCard"
import { getAuthors } from "@/lib/authors"
import { supabase } from "@/lib/supabase"
import type { CoopHack } from "@/types/CoopHack"
import type { Hack } from "@/types/Hack"
import type { PublicHackProgress } from "@/types/Progress"
import XpProgress from "@/components/XpProgress"

function messageOf(error: unknown) {
    return error && typeof error === "object" && "message" in error ? String(error.message) : "An unexpected error occurred."
}

function formatDate(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    const year = date.getFullYear()
    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")
    return `${year}-${day}-${month}`
}

async function fetchApprovedRows<T>(table: "hacks" | "coop_hacks"): Promise<T[]> {
    const pageSize = 1000
    const rows: T[] = []
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from(table)
            .select("*")
            .eq("status", 0)
            .range(from, from + pageSize - 1)
        if (error) throw error
        const page = (data ?? []) as T[]
        rows.push(...page)
        if (page.length < pageSize) return rows
    }
}

export default function ProfileDetails({ username, onNavigate }: { username: string; onNavigate: (href: string) => void }) {
    const [profileName, setProfileName] = useState<string | null>(null)
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const [profileXp, setProfileXp] = useState(0)
    const [profileCoopXp, setProfileCoopXp] = useState(0)
    const [xpPrivate, setXpPrivate] = useState(false)
    const [progressPrivate, setProgressPrivate] = useState(false)
    const [hacks, setHacks] = useState<Hack[]>([])
    const [coopHacks, setCoopHacks] = useState<CoopHack[]>([])
    const [progress, setProgress] = useState<PublicHackProgress[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let isActive = true
        setLoading(true)
        setError(null)

        async function loadProfileAndHacks() {
            try {
                const { data: people, error: profileError } = await supabase.rpc("get_public_profile", { p_username: username })
                if (profileError) throw profileError
                const selected = Array.isArray(people) ? people[0] : people
                if (!selected?.username) {
                    if (isActive) {
                        setProfileName(null)
                        setAvatarUrl(null)
                        setProfileXp(0)
                        setProfileCoopXp(0)
                        setXpPrivate(false)
                        setProgressPrivate(false)
                    }
                    return
                }

                const [allHacks, allCoopHacks] = await Promise.all([
                    fetchApprovedRows<Hack>("hacks"),
                    fetchApprovedRows<CoopHack>("coop_hacks"),
                ])

                const isProgressPrivate = selected.private_progress === true
                const allProgress: PublicHackProgress[] = []
                if (!isProgressPrivate) {
                    const pageSize = 1000
                    for (let from = 0; ; from += pageSize) {
                        const { data, error: progressError } = await supabase.rpc("get_public_profile_progress", {
                            p_username: String(selected.username),
                            p_offset: from,
                            p_limit: pageSize,
                        })
                        if (progressError) throw progressError
                        const page = (data ?? []) as PublicHackProgress[]
                        allProgress.push(...page)
                        if (page.length < pageSize) break
                    }
                }

                const key = String(selected.username).trim().toLocaleLowerCase()
                const hasAuthor = (authors: unknown) => getAuthors(authors).some((author) =>
                    author.name.trim().toLocaleLowerCase() === key,
                )
                if (!isActive) return
                setProfileName(String(selected.username))
                setAvatarUrl(typeof selected.avatar_url === "string" ? selected.avatar_url : null)
                setProfileXp(typeof selected.xp === "number" ? selected.xp : 0)
                setProfileCoopXp(typeof selected.coop_xp === "number" ? selected.coop_xp : 0)
                setXpPrivate(selected.private_xp === true)
                setProgressPrivate(isProgressPrivate)
                setHacks(allHacks.filter((hack) => hasAuthor(hack.authors)))
                setCoopHacks(allCoopHacks.filter((hack) => hasAuthor(hack.authors)))
                setProgress(allProgress)
            } catch (loadError) {
                if (isActive) setError(messageOf(loadError))
            } finally {
                if (isActive) setLoading(false)
            }
        }

        void loadProfileAndHacks()
        return () => { isActive = false }
    }, [username])

    const coopNames = useMemo(() => new Set(coopHacks.map((hack) => hack.name.toLocaleLowerCase())), [coopHacks])

    if (loading) return <div className="mx-auto max-w-5xl py-8"><p className="text-muted-foreground">Loading profile...</p></div>
    if (error) return <div className="mx-auto max-w-5xl py-8"><h1 className="text-3xl font-bold text-white">Profile</h1><p role="alert" className="mt-3 text-destructive">Could not load profile: {error}</p></div>
    if (!profileName) return <div className="mx-auto max-w-5xl py-8"><h1 className="text-3xl font-bold text-white">Profile not found</h1><p className="mt-3 text-muted-foreground">No profile matches &quot;{username}&quot;.</p></div>

    return (
        <main className="mx-auto flex max-w-5xl flex-col gap-7 py-8">
            <header>
                <div className="flex items-center gap-4">
                    <Avatar className="size-16">
                        {avatarUrl && <AvatarImage src={avatarUrl} alt={`${profileName} avatar`} />}
                        <AvatarFallback>{profileName.trim().slice(0, 2).toUpperCase() || "U"}</AvatarFallback>
                    </Avatar>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white">{profileName}</h1>
                        {xpPrivate ? <p className="mt-1 text-sm text-muted-foreground">XP is private</p> : (
                            <div className="mt-2 flex flex-col gap-2">
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">Regular XP</p>
                                    <XpProgress xp={profileXp} />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">Co-op XP</p>
                                    <XpProgress xp={profileCoopXp} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>
            <section className="flex flex-col gap-3" aria-labelledby="profile-hacks-heading">
                <h2 id="profile-hacks-heading" className="text-2xl font-semibold text-white">Approved Hacks</h2>
                {hacks.length ? <div className="flex flex-col gap-3">
                    {hacks.map((hack) => <HackCard key={hack.id} hack={hack} hasCoopPort={coopNames.has(hack.name.toLocaleLowerCase())} onNavigate={onNavigate} />)}
                </div> : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">This profile has no visible approved hacks yet.</p>}
            </section>
            <section className="flex flex-col gap-3" aria-labelledby="profile-coop-hacks-heading">
                <h2 id="profile-coop-hacks-heading" className="text-2xl font-semibold text-white">Approved Co-op Hacks</h2>
                {coopHacks.length ? <div className="flex flex-col gap-3">
                    {coopHacks.map((hack) => <CoopHackCard key={hack.name} hack={hack} onNavigate={onNavigate} />)}
                </div> : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">This profile has no visible approved co-op hacks yet.</p>}
            </section>
            <section className="flex flex-col gap-3" aria-labelledby="profile-progress-heading">
                <h2 id="profile-progress-heading" className="text-2xl font-semibold text-white">Approved Progress Submissions</h2>
                {progressPrivate ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">This user keeps their progress submissions private.</p>
                    : progress.length ? progress.map((entry, index) => (
                    <Card key={`${entry.hack_name}-${entry.created_at}-${index}`}>
                        <CardHeader>
                            <CardTitle>{entry.hack_kind === "coop" ? "Co-op: " : ""}{entry.hack_name}</CardTitle>
                            <CardDescription>
                                {entry.star_count} {entry.star_count === 1 ? "star" : "stars"} collected · Submitted {formatDate(entry.created_at)}
                            </CardDescription>
                            {entry.is_helper && <p className="text-xs text-muted-foreground">Helper on {entry.submitter_username}'s submission</p>}
                            {!!entry.helper_names.length && <p className="text-xs text-muted-foreground">Helpers: {entry.helper_names.join(", ")}</p>}
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2">
                            {entry.video_proof?.videos?.length ? entry.video_proof.videos.map((video, videoIndex) => (
                                <a key={`${video}-${videoIndex}`} href={video} target="_blank" rel="noreferrer" className="break-all text-primary underline">Video proof {videoIndex + 1}</a>
                            )) : <p className="text-sm text-muted-foreground">No video proof provided.</p>}
                            <Button variant="outline" className="self-start" onClick={() => onNavigate(`/${entry.hack_kind === "coop" ? "coop-hacks" : "hacks"}/${encodeURIComponent(entry.hack_name)}`)}>
                                View {entry.hack_kind === "coop" ? "co-op hack" : "hack"}
                            </Button>
                        </CardContent>
                    </Card>
                )) : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">This profile has no approved progress submissions yet.</p>}
            </section>
        </main>
    )
}
