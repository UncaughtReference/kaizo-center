import { Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import HackCard from "@/components/HackCard"
import { supabase } from "@/lib/supabase"
import { normalizeHackName } from "@/lib/utils"
import { type Hack } from "@/types/Hack"
import { getAuthors } from "@/lib/authors"
import HackSubmissionDialog from "@/components/HackSubmissionDialog"
import { useProfile } from "@/contexts/ProfileContext"
import { Separator } from "@/components/ui/separator"
import HackSortSelect from "@/components/HackSortSelect"
import { sortHacks, type HackSortOption } from "@/lib/hackSorting"
import RejectSubmissionDialog from "@/components/RejectSubmissionDialog"

export default function Hacks({ onNavigate }: { onNavigate: (href: string) => void }) {
    const { profile, user } = useProfile()
    const [hacks, setHacks] = useState<Hack[]>([])
    const [coopHackNames, setCoopHackNames] = useState<Set<string>>(new Set())
    const [query, setQuery] = useState("")
    const [sortOption, setSortOption] = useState<HackSortOption>("upload-desc")
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [reviewError, setReviewError] = useState<string | null>(null)
    const [workingId, setWorkingId] = useState<number | null>(null)

    async function moderateHack(hack: Hack, status: 0 | 2, rejectionMessage: string | null = null) {
        setWorkingId(hack.id)
        setReviewError(null)
        try {
            const { data, error: rpcError } = await supabase.rpc("moderate_hack", {
                p_kind: "hack",
                p_id: hack.id,
                p_name: hack.name,
                p_status: status,
                p_rejection_message: rejectionMessage,
            })
            if (rpcError) throw rpcError
            if (!data) throw new Error("The hack could not be found to update.")
            setHacks((current) => current.map((item) => item.id === hack.id ? { ...item, status } : item))
            return true
        } catch (moderationError) {
            setReviewError(moderationError && typeof moderationError === "object" && "message" in moderationError
                ? String(moderationError.message)
                : "Could not update the hack status.")
            return false
        } finally {
            setWorkingId(null)
        }
    }

    useEffect(() => {
        let isActive = true

        async function fetchHacks() {
            try {
                const pageSize = 1000
                const allHacks: Hack[] = []

                for (let from = 0; ; from += pageSize) {
                    const { data, error } = await supabase
                        .from("hacks")
                        .select("*")
                        .range(from, from + pageSize - 1)

                    if (!isActive) return
                    if (error) throw error

                    const page = (data ?? []) as Hack[]
                    allHacks.push(...page)

                    if (page.length < pageSize) break
                }

                const coopNames: string[] = []
                for (let from = 0; ; from += pageSize) {
                    const { data: coopHacks, error: coopError } = await supabase
                        .from("coop_hacks")
                        .select("name")
                        .range(from, from + pageSize - 1)

                    if (!isActive) return
                    if (coopError) throw coopError

                    const page = coopHacks ?? []
                    coopNames.push(...page.map((hack) => normalizeHackName(hack.name)))
                    if (page.length < pageSize) break
                }

                setHacks(allHacks)
                setCoopHackNames(new Set(coopNames))
            } catch (fetchError) {
                const message = fetchError && typeof fetchError === "object" && "message" in fetchError
                    ? String(fetchError.message)
                    : "Unknown error"
                if (isActive) setError(message)
            } finally {
                if (isActive) setLoading(false)
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
        const matchingHacks = normalizedQuery
            ? approvedHacks.filter((hack) => [hack.name, getAuthors(hack.authors).map((author) => author.name).join(" ")]
                .some((value) => value.toLowerCase().includes(normalizedQuery)))
            : approvedHacks
        return sortHacks(matchingHacks, sortOption)
    }, [hacks, query, sortOption])

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-4 py-4 sm:gap-5 sm:py-8">
            <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
                <h1 className="text-3xl font-bold tracking-tight text-white">Hacks</h1>
                {profile?.role === 3 ? (
                    <p className="text-sm text-destructive">Banned accounts cannot submit hacks.</p>
                ) : user ? (
                    <HackSubmissionDialog
                        kind="hack"
                        onNavigate={onNavigate}
                        onSubmitted={(submitted) => setHacks((current) => [submitted as Hack, ...current])}
                    />
                ) : null}
            </header>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="relative w-full max-w-xl">
                    <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        aria-label="Search hacks"
                        placeholder="Search by hack or author..."
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="h-10 pl-10"
                    />
                </div>
                <HackSortSelect value={sortOption} onChange={setSortOption} />
            </div>
            {profile?.role === 2 && (
                <section className="flex flex-col gap-3" aria-labelledby="hack-review-heading">
                    {reviewError && <p role="alert" className="text-sm text-destructive">{reviewError}</p>}
                    {loading ? <p className="text-sm text-muted-foreground">Loading review queue...</p> : hacks.filter((hack) => hack.status === 1 || hack.status === 2).length === 0 ? (
                        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hack submissions need review.</p>
                    ) : hacks.filter((hack) => hack.status === 1 || hack.status === 2).map((hack) => (
                        <div key={`review-${hack.id}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="min-w-0 flex-1">
                                <HackCard
                                    hack={hack}
                                    hasCoopPort={coopHackNames.has(normalizeHackName(hack.name))}
                                    onNavigate={onNavigate}
                                    showStatus
                                />
                            </div>
                            <div className="flex shrink-0 gap-2 sm:flex-col">
                                <Button className="flex-1 sm:flex-none" disabled={workingId === hack.id} onClick={() => void moderateHack(hack, 0)}>Approve</Button>
                                <RejectSubmissionDialog
                                    itemType="hack"
                                    itemName={hack.name}
                                    disabled={workingId === hack.id}
                                    onReject={(message) => moderateHack(hack, 2, message)}
                                />
                            </div>
                        </div>
                    ))}
                    <Separator className="mt-2" />
                </section>
            )}
            <div className="flex flex-col gap-3">
                {loading ? (
                    <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                        Loading hacks...
                    </p>
                ) : error ? (
                    <p role="alert" className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                        Could not load hacks: {error}
                    </p>
                ) : filteredHacks.length > 0 ? filteredHacks.map((hack) => (
                    <HackCard key={hack.id} hack={hack} hasCoopPort={coopHackNames.has(normalizeHackName(hack.name))} onNavigate={onNavigate} />
                )) : (
                    <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                        No hacks found, sorry!
                    </p>
                )}
            </div>
        </div>
    )
}
