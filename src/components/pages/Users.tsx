import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { useProfile } from "@/contexts/ProfileContext"
import { type Profile, type ProfileRole } from "@/types/Profile"
import { Search } from "lucide-react"

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
                setProfiles(allProfiles)
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

    const isModerator = profile?.role === 2
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
    const filteredProfiles = normalizedQuery
        ? profiles.filter((person) => person.username.toLocaleLowerCase().includes(normalizedQuery)
            || (person.display_name ?? "").toLocaleLowerCase().includes(normalizedQuery))
        : profiles

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
                <div className="relative w-full max-w-xl">
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
                                <Button variant="destructive" disabled={workingKey === `user-${person.user_id}`} onClick={() => void banUser(person)}>
                                    {workingKey === `user-${person.user_id}` ? "Banning..." : "Ban user"}
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                ))}
            </section>
        </div>
    )
}
