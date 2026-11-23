import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import HackStatusBadge from "@/components/HackStatusBadge"
import { supabase } from "@/lib/supabase"
import { useProfile } from "@/contexts/ProfileContext"
import type { HackProgress, ProgressHackKind } from "@/types/Progress"
import type { Profile } from "@/types/Profile"

function formatDate(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    const year = date.getFullYear()
    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")
    return `${year}-${day}-${month}`
}

export default function ProgressSection({
    hackName,
    hackKind,
    starCount,
}: {
    hackName: string
    hackKind: ProgressHackKind
    starCount: number
}) {
    const { profile, discordId, user } = useProfile()
    const [progressStars, setProgressStars] = useState("")
    const [progressVideos, setProgressVideos] = useState([""])
    const [progressSubmitting, setProgressSubmitting] = useState(false)
    const [progressMessage, setProgressMessage] = useState<string | null>(null)
    const [progressError, setProgressError] = useState<string | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [currentProgress, setCurrentProgress] = useState<HackProgress | null>(null)
    const [progressLoading, setProgressLoading] = useState(false)
    const [availableHelpers, setAvailableHelpers] = useState<Pick<Profile, "user_id" | "username" | "role">[]>([])
    const [selectedHelpers, setSelectedHelpers] = useState<string[]>([])
    const [helperSearch, setHelperSearch] = useState("")
    const [helpersLoading, setHelpersLoading] = useState(false)
    const [helpersError, setHelpersError] = useState<string | null>(null)
    const itemLabel = hackKind === "coop" ? "co-op hack" : "hack"

    useEffect(() => {
        if (!dialogOpen || hackKind !== "coop" || availableHelpers.length > 0) return
        let isActive = true
        setHelpersLoading(true)
        setHelpersError(null)
        void (async () => {
            try {
                const pageSize = 1000
                const allHelpers: Pick<Profile, "user_id" | "username" | "role">[] = []
                for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase.rpc("get_visible_user_directory", {
                        p_offset: from,
                        p_limit: pageSize,
                    })
                    if (error) throw error
                    const page = (data ?? []) as Pick<Profile, "user_id" | "username" | "role">[]
                    allHelpers.push(...page.filter((entry) => entry.user_id && entry.user_id !== profile?.user_id && entry.role !== 3))
                    if (page.length < pageSize) break
                }
                if (isActive) setAvailableHelpers(allHelpers)
            } catch (error) {
                if (isActive) setHelpersError(error && typeof error === "object" && "message" in error
                    ? String(error.message)
                    : "Could not load site users.")
            } finally {
                if (isActive) setHelpersLoading(false)
            }
        })()
        return () => { isActive = false }
    }, [dialogOpen, hackKind, profile?.user_id, availableHelpers.length])

    async function loadCurrentProgress() {
        if (!discordId) return
        const { data, error } = await supabase.rpc("get_my_progress", { p_offset: 0, p_limit: 1000 })
        if (error) throw error
        const matches = ((data ?? []) as HackProgress[]).filter((entry) =>
            entry.hack_name === hackName && entry.hack_kind === hackKind,
        )
        setCurrentProgress(matches.find((entry) => !entry.is_helper) ?? matches[0] ?? null)
    }

    useEffect(() => {
        if (!user || !discordId) {
            setCurrentProgress(null)
            setProgressLoading(false)
            return
        }

        let isActive = true
        setProgressLoading(true)
        setProgressError(null)
        setCurrentProgress(null)
        void (async () => {
            try {
                const { data, error } = await supabase.rpc("get_my_progress", { p_offset: 0, p_limit: 1000 })
                if (error) throw error
                if (!isActive) return
                const matches = ((data ?? []) as HackProgress[]).filter((entry) =>
                    entry.hack_name === hackName && entry.hack_kind === hackKind,
                )
                setCurrentProgress(matches.find((entry) => !entry.is_helper) ?? matches[0] ?? null)
            } catch (error: unknown) {
                if (isActive) setProgressError(error && typeof error === "object" && "message" in error
                    ? String(error.message)
                    : "Could not load your progress.")
            } finally {
                if (isActive) setProgressLoading(false)
            }
        })()

        return () => { isActive = false }
    }, [hackName, hackKind, discordId, user?.id])

    function updateProgressVideo(index: number, value: string) {
        setProgressVideos((current) => current.map((video, i) => i === index ? value : video))
    }

    async function submitProgress(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setProgressError(null)
        setProgressMessage(null)
        const stars = Number(progressStars)
        const proofVideos = progressVideos.map((video) => video.trim()).filter(Boolean)

        if (!Number.isInteger(stars) || stars < 0 || stars > starCount) {
            setProgressError(`Enter a whole number of stars from 0 to ${starCount}.`)
            return
        }
        if (!profile || !user || !discordId) {
            setProgressError("Sign in with Discord and wait for your profile to load before submitting progress.")
            return
        }
        if (profile.role === 3) {
            setProgressError("Banned accounts cannot submit progress.")
            return
        }
        if (profile.role === 0 && proofVideos.length === 0) {
            setProgressError("Add at least one video link to prove your progress.")
            return
        }
        if (proofVideos.some((video) => {
            try { const url = new URL(video); return url.protocol !== "https:" && url.protocol !== "http:" }
            catch { return true }
        })) {
            setProgressError("Enter valid video links beginning with http:// or https://.")
            return
        }

        setProgressSubmitting(true)
        try {
            const submissionStatus = profile.role === 1 || profile.role === 2 ? 0 : 1
            const { error } = hackKind === "coop"
                ? await supabase.rpc("submit_coop_progress", {
                    p_hack_name: hackName,
                    p_star_count: stars,
                    p_video_proof: { videos: proofVideos },
                    p_helpers: selectedHelpers,
                })
                : await supabase.from("progress").insert({
                    hack_name: hackName,
                    hack_kind: hackKind,
                    user_discord_id: discordId,
                    star_count: stars,
                    video_proof: { videos: proofVideos },
                    status: submissionStatus,
                })
            if (error) throw error
            setProgressMessage(submissionStatus === 0 ? "Progress approved and recorded." : "Progress submitted for review.")
            setProgressStars("")
            setProgressVideos([""])
            setSelectedHelpers([])
            setHelperSearch("")
            setDialogOpen(false)
            try {
                await loadCurrentProgress()
            } catch {
                setProgressError("Progress was submitted, but the latest entry could not be refreshed.")
            }
        } catch (error) {
            setProgressError(error && typeof error === "object" && "message" in error
                ? String(error.message)
                : "Could not submit your progress.")
        } finally {
            setProgressSubmitting(false)
        }
    }

    return (
        <section className="flex flex-col gap-3">
            <header><h2 className="text-xl font-semibold">Progress</h2></header>
            {!user ? (
                <p className="text-sm text-muted-foreground">Sign in with Discord to track your progress.</p>
            ) : progressLoading ? (
                <p className="text-sm text-muted-foreground">Loading your progress...</p>
            ) : currentProgress ? (
                <Card className="max-w-xl">
                    <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <CardTitle>{currentProgress.star_count} {currentProgress.star_count === 1 ? "star" : "stars"} collected</CardTitle>
                            <HackStatusBadge status={currentProgress.status} />
                        </div>
                        <CardDescription>Submitted {currentProgress.created_at ? formatDate(currentProgress.created_at) : "date unavailable"}</CardDescription>
                        {currentProgress.is_helper && <p className="text-xs text-muted-foreground">You were selected as a helper for this submission.</p>}
                        {!!currentProgress.helper_names?.length && <p className="text-xs text-muted-foreground">Helpers: {currentProgress.helper_names.join(", ")}</p>}
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        {currentProgress.video_proof?.videos?.length ? currentProgress.video_proof.videos.map((video, index) => (
                            <a key={`${video}-${index}`} href={video} target="_blank" rel="noreferrer" className="break-all text-primary underline">Video proof {index + 1}</a>
                        )) : <p className="text-sm text-muted-foreground">No video proof required.</p>}
                    </CardContent>
                </Card>
            ) : (
                <p className="text-sm text-muted-foreground">You have not submitted progress for this {itemLabel} yet.</p>
            )}
            {progressError && <p role="alert" className="text-sm text-destructive">{progressError}</p>}
            {progressMessage && <p role="status" className="text-sm text-emerald-300">{progressMessage}</p>}
            {user && (
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                    setDialogOpen(open)
                    if (open) setProgressError(null)
                }}>
                    <DialogTrigger render={<Button className="w-fit self-start" disabled={!profile || profile.role === 3}>Submit progress</Button>} />
                    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Submit your progress</DialogTitle>
                            <DialogDescription>
                                Enter your collected stars. {profile?.role === 1 || profile?.role === 2 ? "Video proof is optional for trusted users." : "Regular users need at least one video link as proof."}
                            </DialogDescription>
                        </DialogHeader>
                        <form className="flex flex-col gap-4" onSubmit={(event) => void submitProgress(event)}>
                            <label className="flex flex-col gap-1.5 text-sm font-medium">
                                Stars collected
                                <Input type="number" min={0} max={starCount} step={1} required value={progressStars} onChange={(event) => setProgressStars(event.target.value)} />
                            </label>
                            {hackKind === "coop" && (
                                <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
                                    <legend className="px-1 text-sm font-medium">Helpers (optional)</legend>
                                    <p className="text-xs text-muted-foreground">Selected helpers will receive co-op XP if this submission is approved.</p>
                                    <Input
                                        aria-label="Search helpers"
                                        placeholder="Search site users..."
                                        value={helperSearch}
                                        onChange={(event) => setHelperSearch(event.target.value)}
                                    />
                                    {helpersLoading ? <p className="text-sm text-muted-foreground">Loading site users...</p>
                                        : helpersError ? <p role="alert" className="text-sm text-destructive">{helpersError}</p>
                                            : availableHelpers.length === 0 ? <p className="text-sm text-muted-foreground">No other eligible users found.</p>
                                                : <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                                                    {availableHelpers
                                                        .filter((helper) => helper.username.toLocaleLowerCase().includes(helperSearch.trim().toLocaleLowerCase()))
                                                        .map((helper) => (
                                                            <label key={helper.user_id} className="flex cursor-pointer items-center gap-2 text-sm">
                                                                <Checkbox
                                                                    checked={selectedHelpers.includes(helper.user_id)}
                                                                    onCheckedChange={(checked) => setSelectedHelpers((current) => checked === true
                                                                        ? [...current, helper.user_id]
                                                                        : current.filter((id) => id !== helper.user_id))}
                                                                />
                                                                <span>{helper.username}</span>
                                                            </label>
                                                        ))}
                                                </div>}
                                    {selectedHelpers.length > 0 && <p className="text-xs text-muted-foreground">{selectedHelpers.length} helper{selectedHelpers.length === 1 ? "" : "s"} selected</p>}
                                </fieldset>
                            )}
                            {progressVideos.map((video, index) => (
                                <label key={index} className="flex flex-col gap-1.5 text-sm font-medium">
                                    Video proof link {index + 1}{profile?.role === 1 || profile?.role === 2 ? " (optional)" : ""}
                                    <Input type="url" placeholder="https://..." value={video} onChange={(event) => updateProgressVideo(index, event.target.value)} required={profile?.role === 0 && index === 0} />
                                </label>
                            ))}
                            {progressVideos.length < 3 && (
                                <Button type="button" variant="outline" className="self-start" onClick={() => setProgressVideos((current) => [...current, ""])}>Add another video link</Button>
                            )}
                            {progressError && <p role="alert" className="text-sm text-destructive">{progressError}</p>}
                            <DialogFooter>
                                <Button type="submit" className="w-fit self-end" disabled={progressSubmitting || !profile || profile.role === 3}>
                                    {progressSubmitting ? "Submitting..." : "Submit progress"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            )}
        </section>
    )
}
