import { Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import CoopHackCard from "@/components/CoopHackCard"
import { supabase } from "@/lib/supabase"
import { type CoopHack } from "@/types/CoopHack"
import { getAuthors } from "@/lib/authors"
import HackSubmissionDialog from "@/components/HackSubmissionDialog"
import { useProfile } from "@/contexts/ProfileContext"
import HackSortSelect from "@/components/HackSortSelect"
import { sortHacks, type HackSortOption } from "@/lib/hackSorting"
import { Separator } from "../ui/separator"

export default function CoopHacks({ onNavigate }: { onNavigate: (href: string) => void }) {
    const { profile, user } = useProfile()
    const [hacks, setHacks] = useState<CoopHack[]>([])
    const [query, setQuery] = useState("")
    const [sortOption, setSortOption] = useState<HackSortOption>("upload-desc")
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [reviewError, setReviewError] = useState<string | null>(null)
    const [workingName, setWorkingName] = useState<string | null>(null)

    async function moderateHack(hack: CoopHack, status: 0 | 2) {
        setWorkingName(hack.name)
        setReviewError(null)
        try {
            const { data, error: rpcError } = await supabase.rpc("moderate_hack", {
                p_kind: "coop",
                p_id: 0,
                p_name: hack.name,
                p_status: status,
            })
            if (rpcError) throw rpcError
            if (!data) throw new Error("The co-op hack could not be found to update.")
            setHacks((current) => current.map((item) => item.name === hack.name ? { ...item, status } : item))
        } catch (moderationError) {
            setReviewError(moderationError && typeof moderationError === "object" && "message" in moderationError
                ? String(moderationError.message)
                : "Could not update the co-op hack status.")
        } finally {
            setWorkingName(null)
        }
    }

    useEffect(() => {
        let isActive = true

        async function fetchHacks() {
            const pageSize = 1000
            const allHacks: CoopHack[] = []

            for (let from = 0; ; from += pageSize) {
                const { data, error } = await supabase
                    .from("coop_hacks")
                    .select("*")
                    .range(from, from + pageSize - 1)

                if (!isActive) return

                if (error) {
                    setError(error.message)
                    break
                }

                const page = (data ?? []) as CoopHack[]
                allHacks.push(...page)

                if (page.length < pageSize) break
            }

            if (isActive) {
                setHacks(allHacks)
                setLoading(false)
            }
        }

        void fetchHacks()

        return () => {
            isActive = false
        }
    }, [])

    const filteredHacks = useMemo(() => {
        const approvedHacks = hacks.filter((hack) => hack.status === 0)
        const normalizedQuery = query.trim().toLowerCase()
        const matchingHacks = !normalizedQuery
            ? approvedHacks
            : approvedHacks.filter((hack) => [hack.name, getAuthors(hack.authors).map((author) => author.name).join(" ")]
                .some((value) => value.toLowerCase().includes(normalizedQuery)))
        return sortHacks(matchingHacks, sortOption)
    }, [hacks, query, sortOption])

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-4 py-4 sm:gap-5 sm:py-8">
            <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
                <h1 className="text-3xl font-bold tracking-tight text-white">Co-op Hacks</h1>
                {profile?.role === 3 ? (
                    <p className="text-sm text-destructive">Banned accounts cannot submit co-op hacks.</p>
                ) : user ? (
                    <HackSubmissionDialog
                        kind="coop"
                        onNavigate={onNavigate}
                        onSubmitted={(submitted) => setHacks((current) => [submitted as CoopHack, ...current])}
                    />
                ) : null}
            </header>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="relative w-full max-w-xl">
                    <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        aria-label="Search co-op hacks"
                        placeholder="Search by hack or author..."
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="h-10 pl-10"
                    />
                </div>
                <HackSortSelect value={sortOption} onChange={setSortOption} />
            </div>
            {profile?.role === 2 && (
                <section className="flex flex-col gap-3" aria-labelledby="coop-review-heading">
                    <header>
                        <h2 id="coop-review-heading" className="text-2xl font-semibold text-white">Co-op submissions to review</h2>
                    </header>
                    {reviewError && <p role="alert" className="text-sm text-destructive">{reviewError}</p>}
                    {loading ? <p className="text-sm text-muted-foreground">Loading review queue...</p> : hacks.filter((hack) => hack.status === 1 || hack.status === 2).length === 0 ? (
                        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No co-op hack submissions need review.</p>
                    ) : hacks.filter((hack) => hack.status === 1 || hack.status === 2).map((hack) => (
                        <div key={`review-${hack.name}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="min-w-0 flex-1">
                                <CoopHackCard
                                    hack={hack}
                                    onNavigate={onNavigate}
                                    showStatus
                                />
                            </div>
                            <div className="flex shrink-0 gap-2 sm:flex-col">
                                <Button className="flex-1 sm:flex-none" disabled={workingName === hack.name} onClick={() => void moderateHack(hack, 0)}>Approve</Button>
                                <Button className="flex-1 sm:flex-none" variant="destructive" disabled={workingName === hack.name} onClick={() => void moderateHack(hack, 2)}>Reject</Button>
                            </div>
                        </div>
                    ))}
                    <Separator className="mt-2" />
                </section>
            )}
            <div className="flex flex-col gap-3">
                {loading ? (
                    <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                        Loading co-op hacks...
                    </p>
                ) : error ? (
                    <p role="alert" className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                        Could not load co-op hacks: {error}
                    </p>
                ) : filteredHacks.length > 0 ? filteredHacks.map((hack) => (
                    <CoopHackCard key={hack.name} hack={hack} onNavigate={onNavigate} />
                )) : (
                    <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                        No co-op hacks found.
                    </p>
                )}
            </div>
        </div>
    )
}
