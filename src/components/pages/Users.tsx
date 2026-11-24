import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { useProfile } from "@/contexts/ProfileContext"
import { type Profile, type ProfileRole } from "@/types/Profile"
import { ArrowDown, ArrowUp, Search } from "lucide-react"
import {
    Combobox,
    ComboboxContent,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "@/components/ui/combobox"

type SortKey = "name" | "regularXp" | "coopXp" | "totalXp"

const sortOptions: { value: SortKey; label: string }[] = [
    { value: "name", label: "Name" },
    { value: "regularXp", label: "Regular XP" },
    { value: "coopXp", label: "Co-op XP" },
    { value: "totalXp", label: "Total XP" },
]

function getErrorMessage(error: unknown) {
    return error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "An unexpected error occurred."
}

function RoleBadge({ role }: { role: ProfileRole }) {
    if (role === 2) return <Badge>Moderator</Badge>
    if (role === 1) return <Badge className="border-transparent bg-sky-700 text-white dark:bg-sky-700">Trusted user</Badge>
    if (role === 3) return <Badge variant="destructive">Banned</Badge>
    return <Badge variant="outline">User</Badge>
}

export default function Users({ onNavigate }: { onNavigate: (href: string) => void }) {
    const { profile, loading: profileLoading } = useProfile()
    const [profiles, setProfiles] = useState<Profile[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [workingKey, setWorkingKey] = useState<string | null>(null)
    const [actionMessage, setActionMessage] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [sortKey, setSortKey] = useState<SortKey>("name")
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")

    useEffect(() => {
        if (profileLoading) return
        if (!profile) {
            setProfiles([])
            setLoading(false)
            return
        }

        let isActive = true
        setLoading(true)
        setError(null)

        async function loadUsersAndQueue() {
            try {
                const pageSize = 1000
                const allProfiles: Profile[] = []
                for (let from = 0; ; from += pageSize) {
                    const { data, error: queryError } = await supabase.rpc("get_visible_user_directory_with_display_name", {
                        p_offset: from,
                        p_limit: pageSize,
                    })
                    if (queryError) throw queryError
                    const page = (data ?? []) as Profile[]
                    allProfiles.push(...page)
                    if (page.length < pageSize) break
                }

                if (!isActive) return
                setProfiles(allProfiles.filter((person) => person.private_profile !== true))
            } catch (loadError) {
                if (isActive) setError(getErrorMessage(loadError))
            } finally {
                if (isActive) setLoading(false)
            }
        }

        void loadUsersAndQueue()
        return () => { isActive = false }
    }, [profile?.user_id, profile?.role, profileLoading])

    async function banUser(target: Profile) {
        setWorkingKey(`user-${target.user_id}`)
        setError(null)
        setActionMessage(null)
        try {
            const { data, error: rpcError } = await supabase.rpc("ban_profile", { p_user_id: target.user_id })
            if (rpcError) throw rpcError
            if (!data) throw new Error("This user could not be banned. They may be a moderator already.")
            setProfiles((current) => current.map((item) => item.user_id === target.user_id ? { ...item, role: 3 } : item))
            setActionMessage(`${target.display_name?.trim() || target.username} has been banned.`)
        } catch (banError) {
            setError(getErrorMessage(banError))
        } finally {
            setWorkingKey(null)
        }
    }

    async function promoteToTrustedUser(target: Profile) {
        setWorkingKey(`user-${target.user_id}`)
        setError(null)
        setActionMessage(null)
        try {
            const { data, error: rpcError } = await supabase.rpc("promote_profile", { p_user_id: target.user_id })
            if (rpcError) throw rpcError
            if (!data) throw new Error("This user could not be promoted.")
            setProfiles((current) => current.map((item) => item.user_id === target.user_id ? { ...item, role: 1 } : item))
            setActionMessage(`${target.display_name?.trim() || target.username} has been promoted to Trusted user.`)
        } catch (promoteError) {
            setError(getErrorMessage(promoteError))
        } finally {
            setWorkingKey(null)
        }
    }

    async function demoteTrustedUser(target: Profile) {
        setWorkingKey(`user-${target.user_id}`)
        setError(null)
        setActionMessage(null)
        try {
            const { data, error: rpcError } = await supabase.rpc("demote_profile", { p_user_id: target.user_id })
            if (rpcError) throw rpcError
            if (!data) throw new Error("This user could not be demoted.")
            setProfiles((current) => current.map((item) => item.user_id === target.user_id ? { ...item, role: 0 } : item))
            setActionMessage(`${target.display_name?.trim() || target.username} has been demoted from Trusted user.`)
        } catch (demoteError) {
            setError(getErrorMessage(demoteError))
        } finally {
            setWorkingKey(null)
        }
    }

    async function unbanUser(target: Profile) {
        setWorkingKey(`user-${target.user_id}`)
        setError(null)
        setActionMessage(null)
        try {
            const { data, error: rpcError } = await supabase.rpc("unban_profile", { p_user_id: target.user_id })
            if (rpcError) throw rpcError
            if (!data) throw new Error("This user could not be unbanned.")
            setProfiles((current) => current.map((item) => item.user_id === target.user_id ? { ...item, role: 0 } : item))
            setActionMessage(`${target.display_name?.trim() || target.username} has been unbanned.`)
        } catch (unbanError) {
            setError(getErrorMessage(unbanError))
        } finally {
            setWorkingKey(null)
        }
    }

    const isModerator = profile?.role === 2
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
    const filteredProfiles = profiles.filter((person) => !normalizedQuery
        || person.username.toLocaleLowerCase().includes(normalizedQuery)
            || (person.display_name ?? "").toLocaleLowerCase().includes(normalizedQuery))
        .sort((first, second) => {
            let comparison = 0
            if (sortKey === "name") {
                const firstName = first.display_name?.trim() || first.username
                const secondName = second.display_name?.trim() || second.username
                comparison = firstName.localeCompare(secondName, undefined, { sensitivity: "base" })
            } else if (sortKey === "regularXp") {
                comparison = (first.xp ?? 0) - (second.xp ?? 0)
            } else if (sortKey === "coopXp") {
                comparison = (first.coop_xp ?? 0) - (second.coop_xp ?? 0)
            } else {
                comparison = ((first.xp ?? 0) + (first.coop_xp ?? 0)) - ((second.xp ?? 0) + (second.coop_xp ?? 0))
            }

            if (comparison === 0) comparison = first.user_id.localeCompare(second.user_id)
            return sortDirection === "asc" ? comparison : -comparison
        })

    if (profileLoading || loading) {
        return <div className="mx-auto max-w-5xl py-8"><p className="text-muted-foreground">Loading users...</p></div>
    }

    if (!profile) {
        return <div className="mx-auto max-w-5xl py-8"><h1 className="text-3xl font-bold tracking-tight text-white">Users</h1><p className="mt-4 text-muted-foreground">Sign in with Discord to view user profiles.</p></div>
    }

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-6 py-8">
            {(error || actionMessage) && (
                <p role={error ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${error ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-700/40 bg-emerald-900/20 text-emerald-200"}`}>
                    {error ?? actionMessage}
                </p>
            )}

            <section className="flex flex-col gap-3" aria-labelledby="users-list-heading">
                <h2 id="users-list-heading" className="text-3xl font-semibold text-white">Users</h2>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative w-full max-w-xl mt-5">
                        <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="search"
                            aria-label="Search users"
                            placeholder="Search users by display name or username..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            className="h-10 pl-10"
                        />
                    </div>
                    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
                        <span className="text-xs font-medium text-muted-foreground">Sort by</span>
                        <div className="flex gap-2">
                            <Combobox
                                value={sortKey}
                                onValueChange={(value) => { if (value) setSortKey(value) }}
                                itemToStringLabel={(value) => sortOptions.find((option) => option.value === value)?.label ?? ""}
                            >
                                <ComboboxInput aria-label="Sort users by" placeholder="Choose sorting..." className="h-10 w-full sm:min-w-56" />
                                <ComboboxContent>
                                    <ComboboxList>
                                        {sortOptions.map((option) => (
                                            <ComboboxItem key={option.value} value={option.value}>{option.label}</ComboboxItem>
                                        ))}
                                    </ComboboxList>
                                </ComboboxContent>
                            </Combobox>
                            <Button
                                className="h-10"
                                type="button"
                                variant="outline"
                                aria-label={sortDirection === "asc" ? "Sort ascending" : "Sort descending"}
                                title={sortDirection === "asc" ? "Ascending" : "Descending"}
                                onClick={() => setSortDirection((direction) => direction === "asc" ? "desc" : "asc")}
                            >
                                {sortDirection === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
                                {sortDirection === "asc" ? "Ascending" : "Descending"}
                            </Button>
                        </div>
                    </div>
                </div>
                {profiles.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No profiles found.</p>
                ) : filteredProfiles.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No users match “{searchQuery.trim()}”.</p>
                ) : filteredProfiles.map((person) => (
                    <Card key={person.user_id}>
                        <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <Avatar>
                                        {person.avatar_url && <AvatarImage src={person.avatar_url} alt={`${person.display_name?.trim() || person.username} avatar`} />}
                                        <AvatarFallback>{(person.display_name?.trim() || person.username).trim().slice(0, 2).toUpperCase() || "U"}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <CardTitle>{person.display_name?.trim() || person.username}</CardTitle>
                                        <CardDescription>
                                            {person.private_xp
                                                ? "XP is private"
                                                : `${person.xp ?? 0} regular XP · ${person.coop_xp ?? 0} co-op XP`}
                                        </CardDescription>
                                    </div>
                                </div>
                                <RoleBadge role={person.role} />
                            </div>
                        </CardHeader>
                        <CardFooter className="gap-2">
                            <Button variant="outline" onClick={() => onNavigate(`/profiles/${encodeURIComponent(person.username)}`)}>View profile</Button>
                            {isModerator && person.role !== 3 && person.role !== 2 && person.user_id !== profile.user_id && (
                                <>
                                    {person.role === 0 && (
                                        <Button variant="outline" disabled={workingKey === `user-${person.user_id}`} onClick={() => void promoteToTrustedUser(person)}>
                                            {workingKey === `user-${person.user_id}` ? "Promoting..." : "Promote to Trusted User"}
                                        </Button>
                                    )}
                                    <Button variant="destructive" disabled={workingKey === `user-${person.user_id}`} onClick={() => void banUser(person)}>
                                        {workingKey === `user-${person.user_id}` ? "Banning..." : "Ban user"}
                                    </Button>
                                </>
                            )}
                            {isModerator && person.role === 3 && person.user_id !== profile.user_id && (
                                <Button variant="outline" disabled={workingKey === `user-${person.user_id}`} onClick={() => void unbanUser(person)}>
                                    {workingKey === `user-${person.user_id}` ? "Unbanning..." : "Unban user"}
                                </Button>
                            )}
                            {isModerator && person.role === 1 && person.user_id !== profile.user_id && (
                                <Button variant="outline" disabled={workingKey === `user-${person.user_id}`} onClick={() => void demoteTrustedUser(person)}>
                                    {workingKey === `user-${person.user_id}` ? "Demoting..." : "Demote from Trusted User"}
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                ))}
            </section>
        </div>
    )
}
