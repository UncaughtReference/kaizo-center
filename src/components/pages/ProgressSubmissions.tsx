import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useProfile } from "@/contexts/ProfileContext"
import HackStatusBadge from "@/components/HackStatusBadge"
import { supabase } from "@/lib/supabase"
import type { HackProgress } from "@/types/Progress"
import { resolveProfileDisplayNames } from "@/lib/displayNames"

function getErrorMessage(error: unknown) {
    return error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "An unexpected error occurred."
}

function formatSubmittedDate(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
}

type ProgressSubmission = HackProgress & { hack_star_count?: number }

export default function ProgressSubmissions({ onNavigate }: { onNavigate: (href: string) => void }) {
    const { profile, loading: profileLoading } = useProfile()
    const [submissions, setSubmissions] = useState<ProgressSubmission[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [workingId, setWorkingId] = useState<number | null>(null)

    useEffect(() => {
        if (profileLoading) return
        if (profile?.role !== 2) {
            setSubmissions([])
            setLoading(false)
            return
        }

        let isActive = true
        setLoading(true)
        setError(null)

        async function loadSubmissions() {
            try {
                const pageSize = 1000
                const allSubmissions: HackProgress[] = []
                for (let from = 0; ; from += pageSize) {
                    const { data, error: queryError } = await supabase.rpc("get_progress_submissions", {
                        p_offset: from,
                        p_limit: pageSize,
                    })
                    if (queryError) throw queryError
                    const page = (data ?? []) as HackProgress[]
                    allSubmissions.push(...page)
                    if (page.length < pageSize) break
                }
                const hackNames = [...new Set(allSubmissions.filter((entry) => entry.hack_kind === "hack").map((entry) => entry.hack_name))]
                const coopHackNames = [...new Set(allSubmissions.filter((entry) => entry.hack_kind === "coop").map((entry) => entry.hack_name))]
                const [hacksResult, coopHacksResult] = await Promise.all([
                    hackNames.length
                        ? supabase.from("hacks").select("name, star_count").in("name", hackNames)
                        : Promise.resolve({ data: [], error: null }),
                    coopHackNames.length
                        ? supabase.from("coop_hacks").select("name, star_count").in("name", coopHackNames)
                        : Promise.resolve({ data: [], error: null }),
                ])
                if (hacksResult.error) throw hacksResult.error
                if (coopHacksResult.error) throw coopHacksResult.error
                const hackStarCounts = new Map([
                    ...(hacksResult.data ?? []).map((hack) => [`hack:${hack.name}`, hack.star_count] as const),
                    ...(coopHacksResult.data ?? []).map((hack) => [`coop:${hack.name}`, hack.star_count] as const),
                ])
                const names = await resolveProfileDisplayNames(allSubmissions.flatMap((entry) => [
                    ...(entry.username ? [entry.username] : []),
                    ...(entry.helper_names ?? []),
                ]))
                const withDisplayNames = allSubmissions.map((entry) => ({
                    ...entry,
                    hack_star_count: hackStarCounts.get(`${entry.hack_kind}:${entry.hack_name}`),
                    username: entry.username ? names.get(entry.username.toLocaleLowerCase()) ?? entry.username : entry.username,
                    helper_names: entry.helper_names?.map((name) => names.get(name.toLocaleLowerCase()) ?? name),
                }))
                if (isActive) setSubmissions(withDisplayNames)
            } catch (loadError) {
                if (isActive) setError(getErrorMessage(loadError))
            } finally {
                if (isActive) setLoading(false)
            }
        }

        void loadSubmissions()
        return () => { isActive = false }
    }, [profile?.role, profileLoading])

    async function moderateSubmission(submission: HackProgress, status: 0 | 2) {
        setWorkingId(submission.id)
        setError(null)
        try {
            const { data, error: rpcError } = await supabase.rpc("moderate_progress", {
                p_progress_id: submission.id,
                p_status: status,
            })
            if (rpcError) throw rpcError
            if (!data) throw new Error("This progress submission could not be found.")
            setSubmissions((current) => status === 0
                ? current.filter((item) => item.id !== submission.id)
                : current.map((item) => item.id === submission.id ? { ...item, status } : item))
        } catch (moderationError) {
            setError(getErrorMessage(moderationError))
        } finally {
            setWorkingId(null)
        }
    }

    if (profileLoading || loading) {
        return <div className="mx-auto max-w-5xl py-8"><p className="text-muted-foreground">Loading progress submissions...</p></div>
    }

    if (profile?.role !== 2) {
        return <div className="mx-auto max-w-5xl py-8"><h1 className="text-3xl font-bold tracking-tight text-white">Progress Submissions</h1><p className="mt-3 text-muted-foreground">Moderator access is required.</p></div>
    }

    return (
        <main className="mx-auto flex max-w-5xl flex-col gap-5 py-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight text-white">Progress Submissions</h1>
            </header>
            {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            {submissions.length === 0 ? (
                <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No progress submissions need review.</p>
            ) : submissions.map((submission) => (
                <Card key={submission.id}>
                    <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <Avatar>
                                    {submission.avatar_url && <AvatarImage src={submission.avatar_url} alt={`${submission.username ?? "User"} avatar`} />}
                                    <AvatarFallback>{submission.username?.trim().slice(0, 2).toUpperCase() || "U"}</AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col gap-1">
                                    <CardTitle>{submission.hack_kind === "coop" ? "Co-op: " : ""}{submission.hack_name}</CardTitle>
                                    <p className="text-sm text-muted-foreground">Submitted by {submission.username ?? "Unknown user"}</p>
                                </div>
                            </div>
                            <HackStatusBadge status={submission.status} />
                        </div>
                        <CardDescription>
                            <span className="inline-flex items-center gap-1">
                                {submission.star_count} / {submission.hack_star_count ?? "?"}
                                <img src={`${import.meta.env.BASE_URL}star.webp`} alt="stars" className="h-4 w-4 object-contain" />
                            </span>
                            <span>· Submitted {formatSubmittedDate(submission.created_at)}</span>
                        </CardDescription>
                        {!!submission.helper_names?.length && <p className="text-xs text-muted-foreground">Helpers: {submission.helper_names.join(", ")}</p>}
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        {submission.video_proof?.videos?.length ? submission.video_proof.videos.map((video, index) => (
                            <a key={`${video}-${index}`} href={video} target="_blank" rel="noreferrer" className="break-all text-primary underline">Video proof {index + 1}</a>
                        )) : <p className="text-sm text-muted-foreground">No video proof provided.</p>}
                        <Button variant="outline" className="self-start" onClick={() => onNavigate(`/${submission.hack_kind === "coop" ? "coop-hacks" : "hacks"}/${encodeURIComponent(submission.hack_name)}`)}>
                            View {submission.hack_kind === "coop" ? "co-op hack" : "hack"}
                        </Button>
                    </CardContent>
                    <CardFooter className="gap-2">
                        <Button disabled={workingId === submission.id} onClick={() => void moderateSubmission(submission, 0)}>Approve</Button>
                        <Button variant="destructive" disabled={workingId === submission.id} onClick={() => void moderateSubmission(submission, 2)}>Reject</Button>
                    </CardFooter>
                </Card>
            ))}
        </main>
    )
}
