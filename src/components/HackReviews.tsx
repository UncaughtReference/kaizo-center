import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useProfile } from "@/contexts/ProfileContext"
import { supabase } from "@/lib/supabase"
import type { HackProgress } from "@/types/Progress"

type HackReview = {
    id: number
    user_id: string
    username: string
    display_name: string | null
    body: string
    created_at: string
    updated_at: string
}

function errorMessage(error: unknown) {
    return error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "An unexpected error occurred."
}

async function loadMyProgress() {
    const pageSize = 1000
    const entries: HackProgress[] = []
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.rpc("get_my_progress", { p_offset: offset, p_limit: pageSize })
        if (error) throw error
        const page = (data ?? []) as HackProgress[]
        entries.push(...page)
        if (page.length < pageSize) return entries
    }
}

export default function HackReviews({ hackName, hackKind, starCount }: {
    hackName: string
    hackKind: "hack" | "coop"
    starCount: number
}) {
    const { user, profile } = useProfile()
    const [reviews, setReviews] = useState<HackReview[]>([])
    const [eligible, setEligible] = useState(false)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [draft, setDraft] = useState("")
    const [editing, setEditing] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [{ data, error: reviewError }, progressResult] = await Promise.all([
                supabase.rpc("get_hack_reviews", { p_hack_name: hackName, p_hack_kind: hackKind }),
                user && profile?.role !== 3 ? loadMyProgress() : Promise.resolve([] as HackProgress[]),
            ])
            if (reviewError) throw reviewError
            const loadedReviews = (data ?? []) as HackReview[]
            setReviews(loadedReviews)
            const ownProgress = progressResult.some((entry) =>
                entry.hack_name === hackName
                && entry.hack_kind === hackKind
                && (!entry.is_helper || hackKind === "coop")
                && entry.star_count >= starCount * 0.5,
            )
            setEligible(Boolean(user && profile?.role !== 3 && ownProgress))
            const ownReview = loadedReviews.find((review) => review.user_id === user?.id)
            setDraft(ownReview?.body ?? "")
            setEditing(false)
        } catch (loadError) {
            setError(errorMessage(loadError))
        } finally {
            setLoading(false)
        }
    }, [hackName, hackKind, starCount, user, profile?.role])

    useEffect(() => { void load() }, [load])

    const ownReview = reviews.find((review) => review.user_id === user?.id)
    const canModerate = profile?.role === 2

    async function saveReview() {
        setBusy(true)
        setError(null)
        try {
            const result = ownReview
                ? await supabase.rpc("update_hack_review", { p_review_id: ownReview.id, p_body: draft })
                : await supabase.rpc("create_hack_review", { p_hack_name: hackName, p_hack_kind: hackKind, p_body: draft })
            if (result.error) throw result.error
            await load()
        } catch (saveError) {
            setError(errorMessage(saveError))
        } finally {
            setBusy(false)
        }
    }

    async function deleteReview(review: HackReview) {
        setBusy(true)
        setError(null)
        try {
            const { error: deleteError } = await supabase.rpc("delete_hack_review", { p_review_id: review.id })
            if (deleteError) throw deleteError
            if (review.user_id === user?.id) setDraft("")
            await load()
        } catch (deleteError) {
            setError(errorMessage(deleteError))
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="flex flex-col gap-4" aria-labelledby="hack-reviews-heading">
            <h2 id="hack-reviews-heading" className="text-2xl font-semibold">Reviews</h2>
            {loading ? <p className="text-sm text-muted-foreground">Loading reviews...</p> : reviews.length ? (
                <div className="flex flex-col gap-3">
                    {reviews.map((review) => (
                        <Card key={review.id}>
                            <CardHeader className="flex flex-row items-center justify-between gap-3">
                                <CardTitle className="text-base">{review.display_name?.trim() || review.username}</CardTitle>
                                <span className="text-xs text-muted-foreground">{new Date(review.updated_at).toLocaleDateString()}</span>
                            </CardHeader>
                            <CardContent className="flex flex-col items-start gap-3">
                                {ownReview?.id === review.id && editing ? (
                                    <textarea className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" maxLength={5000} value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Edit your review" />
                                ) : <p className="whitespace-pre-wrap break-words text-sm">{review.body}</p>}
                                {ownReview?.id === review.id && (
                                    <div className="flex flex-wrap gap-2">
                                        {editing ? <>
                                            <Button size="sm" onClick={() => void saveReview()} disabled={busy || !draft.trim()}>Save review</Button>
                                            <Button size="sm" variant="outline" onClick={() => { setDraft(review.body); setEditing(false) }} disabled={busy}>Cancel</Button>
                                        </> : <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>}
                                        <Button size="sm" variant="destructive" onClick={() => void deleteReview(review)} disabled={busy}>Delete</Button>
                                    </div>
                                )}
                                {canModerate && ownReview?.id !== review.id && <Button size="sm" variant="destructive" onClick={() => void deleteReview(review)} disabled={busy}>Delete review</Button>}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : <p className="text-sm text-muted-foreground">No reviews yet.</p>}

            {!loading && !ownReview && eligible && (
                <div className="flex flex-col items-start gap-2">
                    <label htmlFor="new-hack-review" className="text-sm font-medium">Write a review</label>
                    <textarea id="new-hack-review" className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" maxLength={5000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Share your thoughts about this hack! Please keep the criticism constructive and polite." />
                    <Button onClick={() => void saveReview()} disabled={busy || !draft.trim()}>Post review</Button>
                </div>
            )}
            {!loading && user && profile?.role === 3 && <p className="text-sm text-muted-foreground">Banned accounts cannot post reviews.</p>}
            {!loading && user && profile?.role !== 3 && !eligible && <p className="text-sm text-muted-foreground">A progress submission with at least half the stars is required to post a review.</p>}
            {!user && <p className="text-sm text-muted-foreground">Sign in and submit at least half the stars to post a review.</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </section>
    )
}
