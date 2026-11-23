import { useEffect, useState } from "react"
import { LogIn, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"
import HackCard from "@/components/HackCard"
import CoopHackCard from "@/components/CoopHackCard"
import type { Hack } from "@/types/Hack"
import type { CoopHack } from "@/types/CoopHack"
import { getAuthors } from "@/lib/authors"
import { useProfile } from "@/contexts/ProfileContext"
import { getProfileRoleName } from "@/types/Profile"
import type { HackProgress } from "@/types/Progress"
import HackStatusBadge from "@/components/HackStatusBadge"
import XpProgress from "@/components/XpProgress"

export default function Account({ onNavigate }: { onNavigate: (href: string) => void }) {
    const { profile, discordId, loading: profileLoading, error: profileError, refreshProfile } = useProfile()
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)
    const [working, setWorking] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [yourHacks, setYourHacks] = useState<Hack[]>([])
    const [yourCoopHacks, setYourCoopHacks] = useState<CoopHack[]>([])
    const [hacksLoading, setHacksLoading] = useState(false)
    const [hacksError, setHacksError] = useState<string | null>(null)
    const [yourProgress, setYourProgress] = useState<HackProgress[]>([])
    const [progressLoading, setProgressLoading] = useState(false)
    const [progressError, setProgressError] = useState<string | null>(null)
    const [privacySaving, setPrivacySaving] = useState(false)
    const [privacyError, setPrivacyError] = useState<string | null>(null)

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
            setLoading(false)
        })

        void supabase.auth.getSession().then(({ data, error: sessionError }) => {
            if (sessionError) setError(sessionError.message)
            setUser(data.session?.user ?? null)
            setLoading(false)
        })

        return () => subscription.unsubscribe()
    }, [])

    async function signInWithDiscord() {
        setError(null)
        setWorking(true)

        const redirectTo = new URL(`${import.meta.env.BASE_URL}account`, window.location.origin).toString()
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "discord",
            options: { redirectTo },
        })

        if (error) {
            setError(error.message)
            setWorking(false)
        }
    }

    async function signOut() {
        setError(null)
        setWorking(true)

        const { error } = await supabase.auth.signOut()
        if (error) setError(error.message)
        setWorking(false)
    }

    async function updatePrivacySetting(setting: "private_xp" | "private_progress" | "private_profile", checked: boolean) {
        if (!profile) return
        setPrivacySaving(true)
        setPrivacyError(null)
        const nextPrivateXp = setting === "private_xp" ? checked : Boolean(profile.private_xp)
        const nextPrivateProgress = setting === "private_progress" ? checked : Boolean(profile.private_progress)
        const nextPrivateProfile = setting === "private_profile" ? checked : Boolean(profile.private_profile)
        const { data, error: updateError } = await supabase.rpc("update_profile_privacy", {
            p_private_xp: nextPrivateXp,
            p_private_progress: nextPrivateProgress,
            p_private_profile: nextPrivateProfile,
        })
        if (updateError) setPrivacyError(updateError.message)
        else if (!data) setPrivacyError("Your privacy settings could not be updated.")
        else {
            try {
                await refreshProfile()
            } catch (refreshError) {
                setPrivacyError(refreshError && typeof refreshError === "object" && "message" in refreshError
                    ? String(refreshError.message)
                    : "Your settings were saved, but your profile could not be refreshed.")
            }
        }
        setPrivacySaving(false)
    }

    const displayName = user?.user_metadata?.global_name
        ?? user?.user_metadata?.full_name
        ?? user?.user_metadata?.name
        ?? user?.user_metadata?.username
        ?? user?.email
        ?? "Discord user"
    const avatarUrl = user?.user_metadata?.avatar_url
    const avatarFallback = String(displayName).trim().split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase()

    useEffect(() => {
        if (!user) {
            setYourHacks([])
            setYourCoopHacks([])
            setHacksLoading(false)
            setHacksError(null)
            return
        }

        let isActive = true
        setHacksLoading(true)
        setHacksError(null)

        async function fetchAllRows<T>(table: "hacks" | "coop_hacks"): Promise<T[]> {
            const pageSize = 1000
            const rows: T[] = []

            for (let from = 0; ; from += pageSize) {
                const { data, error: queryError } = await supabase
                    .from(table)
                    .select("*")
                    .range(from, from + pageSize - 1)

                if (queryError) throw queryError

                const page = (data ?? []) as T[]
                rows.push(...page)
                if (page.length < pageSize) return rows
            }
        }

        async function loadYourHacks() {
            try {
                const [hacks, coopHacks] = await Promise.all([
                    fetchAllRows<Hack>("hacks"),
                    fetchAllRows<CoopHack>("coop_hacks"),
                ])

                if (!isActive) return

                const normalizedDisplayName = displayName.trim().toLocaleLowerCase()
                const matchesDisplayName = (author: { name: string }) =>
                    author.name.trim().toLocaleLowerCase() === normalizedDisplayName

                setYourHacks(hacks.filter((hack) => getAuthors(hack.authors).some(matchesDisplayName)))
                setYourCoopHacks(coopHacks.filter((hack) => getAuthors(hack.authors).some(matchesDisplayName)))
            } catch (loadError) {
                const message = loadError && typeof loadError === "object" && "message" in loadError
                    ? String(loadError.message)
                    : "Unknown error"
                if (isActive) setHacksError(message)
            } finally {
                if (isActive) setHacksLoading(false)
            }
        }

        void loadYourHacks()

        return () => {
            isActive = false
        }
    }, [user?.id, displayName])

    useEffect(() => {
        if (!user || profileLoading || !discordId) {
            setYourProgress([])
            setProgressLoading(Boolean(user && profileLoading))
            setProgressError(null)
            return
        }

        let isActive = true
        setProgressLoading(true)
        setProgressError(null)
        void (async () => {
            try {
                const pageSize = 1000
                const allProgress: HackProgress[] = []
                for (let from = 0; ; from += pageSize) {
                    const { data, error: queryError } = await supabase.rpc("get_my_progress", {
                        p_offset: from,
                        p_limit: pageSize,
                    })
                    if (queryError) throw queryError
                    const page = (data ?? []) as HackProgress[]
                    allProgress.push(...page)
                    if (page.length < pageSize) break
                }
                if (isActive) setYourProgress(allProgress)
            } catch (loadError) {
                if (isActive) setProgressError(loadError && typeof loadError === "object" && "message" in loadError
                    ? String(loadError.message)
                    : "Could not load your progress.")
            } finally {
                if (isActive) setProgressLoading(false)
            }
        })()

        return () => { isActive = false }
    }, [user?.id, discordId, profileLoading])

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-5 py-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight text-white">Account</h1>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle>{loading ? "Loading account" : user ? "Your profile" : "Connect your account"}</CardTitle>
                    <CardDescription>
                        {loading ? "Checking your sign-in status..." : user ? "Signed in with Discord" : "Sign in with Discord to connect your account."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {loading ? (
                        <p className="text-muted-foreground">Loading account...</p>
                    ) : user ? (
                        <div className="flex items-center gap-4">
                            <Avatar className="size-16">
                                {avatarUrl && <AvatarImage src={avatarUrl} alt={`${displayName} avatar`} />}
                                <AvatarFallback>{avatarFallback || "U"}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col items-start gap-2">
                                <h2 className="text-xl font-semibold">{displayName}</h2>
                                {profile && <Button variant="outline" size="sm" onClick={() => onNavigate(`/profiles/${encodeURIComponent(profile.username)}`)}>View public profile</Button>}
                            </div>
                        </div>
                    ) : (
                        <p className="text-muted-foreground">You are not signed in.</p>
                    )}
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    {profileLoading && user && <p className="text-sm text-muted-foreground">Creating your profile...</p>}
                    {profileError && <p role="alert" className="text-sm text-destructive">Could not load profile: {profileError}</p>}
                    {profile && (
                        <div className="flex flex-col gap-3">
                            <p className="text-sm text-muted-foreground">Role: {getProfileRoleName(profile.role)}</p>
                            <div className="flex flex-col gap-1">
                                <p className="text-sm font-medium text-foreground">Regular XP</p>
                                <XpProgress xp={profile.xp ?? 0} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <p className="text-sm font-medium text-foreground">Co-op XP</p>
                                <XpProgress xp={profile.coop_xp ?? 0} />
                            </div>
                        </div>
                    )}
                </CardContent>
                {!loading && (
                    <CardFooter>
                        {user ? (
                            <Button variant="outline" onClick={() => void signOut()} disabled={working}>
                                <LogOut />{working ? "Signing out..." : "Sign out"}
                            </Button>
                        ) : (
                            <Button onClick={() => void signInWithDiscord()} disabled={working}>
                                <LogIn />{working ? "Connecting..." : "Continue with Discord"}
                            </Button>
                        )}
                    </CardFooter>
                )}
            </Card>
            {user && (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle>Privacy settings</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <label className="flex cursor-pointer items-start gap-3">
                                <Checkbox
                                    id="private-xp"
                                    checked={Boolean(profile?.private_xp)}
                                    disabled={!profile || privacySaving}
                                    onCheckedChange={(checked) => void updatePrivacySetting("private_xp", checked === true)}
                                />
                                <span className="flex flex-col gap-1">
                                    <span className="text-sm font-medium">Make my XP private</span>
                                </span>
                            </label>
                            <label className="flex cursor-pointer items-start gap-3">
                                <Checkbox
                                    id="private-progress"
                                    checked={Boolean(profile?.private_progress)}
                                    disabled={!profile || privacySaving}
                                    onCheckedChange={(checked) => void updatePrivacySetting("private_progress", checked === true)}
                                />
                                <span className="flex flex-col gap-1">
                                    <span className="text-sm font-medium">Make my progress submissions private</span>
                                </span>
                            </label>
                            <label className="flex cursor-pointer items-start gap-3">
                                <Checkbox
                                    id="private-profile"
                                    checked={Boolean(profile?.private_profile)}
                                    disabled={!profile || privacySaving}
                                    onCheckedChange={(checked) => void updatePrivacySetting("private_profile", checked === true)}
                                />
                                <span className="flex flex-col gap-1">
                                    <span className="text-sm font-medium">Make my profile private</span>
                                    <span className="text-sm text-muted-foreground">Your profile will not appear in the Users list.</span>
                                </span>
                            </label>
                            {privacySaving && <p className="text-sm text-muted-foreground">Saving privacy settings...</p>}
                            {privacyError && <p role="alert" className="text-sm text-destructive">{privacyError}</p>}
                        </CardContent>
                    </Card>
                    <section className="flex flex-col gap-4" aria-labelledby="your-hacks-heading">
                        <header>
                            <h2 id="your-hacks-heading" className="text-2xl font-bold tracking-tight text-white">Your Hacks</h2>
                        </header>
                        {hacksLoading ? (
                            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Loading your hacks...</p>
                        ) : hacksError ? (
                            <p role="alert" className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Could not load your hacks: {hacksError}</p>
                        ) : yourHacks.length === 0 ? (
                            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No visible hacks are listed under your display name.</p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {yourHacks.map((hack) => (
                                    <HackCard key={`hack-${hack.id}`} hack={hack} hasCoopPort={yourCoopHacks.some((coopHack) => coopHack.name.toLocaleLowerCase() === hack.name.toLocaleLowerCase())} onNavigate={onNavigate} showStatus />
                                ))}
                            </div>
                        )}
                    </section>
                    <section className="flex flex-col gap-4" aria-labelledby="your-coop-hacks-heading">
                        <header>
                            <h2 id="your-coop-hacks-heading" className="text-2xl font-bold tracking-tight text-white">Your Co-op Hacks</h2>
                        </header>
                        {hacksLoading ? (
                            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Loading your co-op hacks...</p>
                        ) : hacksError ? (
                            <p role="alert" className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Could not load your co-op hacks: {hacksError}</p>
                        ) : yourCoopHacks.length === 0 ? (
                            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No visible co-op hacks are listed under your display name.</p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {yourCoopHacks.map((hack) => (
                                    <CoopHackCard key={`coop-${hack.name}`} hack={hack} onNavigate={onNavigate} showStatus />
                                ))}
                            </div>
                        )}
                    </section>
                    <section className="flex flex-col gap-4" aria-labelledby="your-progress-heading">
                        <header>
                            <h2 id="your-progress-heading" className="text-2xl font-bold tracking-tight text-white">Your Progress</h2>
                        </header>
                        {progressLoading ? (
                            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Loading your progress...</p>
                        ) : progressError ? (
                            <p role="alert" className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Could not load your progress: {progressError}</p>
                        ) : yourProgress.length === 0 ? (
                            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">You have not submitted any progress yet.</p>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {yourProgress.map((entry) => (
                                    <Card key={entry.id}>
                                        <CardHeader>
                                            <div className="flex items-center justify-between gap-3">
                                                <CardTitle>{entry.hack_kind === "coop" ? "Co-op: " : ""}{entry.hack_name}</CardTitle>
                                                <HackStatusBadge status={entry.status} />
                                            </div>
                                            <CardDescription>{entry.star_count} {entry.star_count === 1 ? "star" : "stars"} collected · Submitted {new Date(entry.created_at).toLocaleDateString()}</CardDescription>
                                            {entry.is_helper && <p className="text-xs text-muted-foreground">Helper on {entry.submitter_username ?? "another user's"} submission</p>}
                                            {!!entry.helper_names?.length && <p className="text-xs text-muted-foreground">Helpers: {entry.helper_names.join(", ")}</p>}
                                        </CardHeader>
                                        <CardContent className="flex flex-col gap-2">
                                            {entry.video_proof?.videos?.length ? (
                                                entry.video_proof.videos.map((video, videoIndex) => (
                                                    <a key={`${video}-${videoIndex}`} href={video} target="_blank" rel="noreferrer" className="break-all text-primary underline">Video proof {videoIndex + 1}</a>
                                                ))
                                            ) : <p className="text-sm text-muted-foreground">No video proof required.</p>}
                                            <Button variant="outline" className="self-start" onClick={() => onNavigate(`/${entry.hack_kind === "coop" ? "coop-hacks" : "hacks"}/${encodeURIComponent(entry.hack_name)}`)}>
                                                View {entry.hack_kind === "coop" ? "co-op hack" : "hack"}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    )
}
