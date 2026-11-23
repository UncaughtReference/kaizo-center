import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import type { Profile } from "@/types/Profile"

type ProfileContextValue = {
    user: User | null
    discordId: string | null
    profile: Profile | null
    loading: boolean
    error: string | null
    refreshProfile: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

function getDiscordProfileData(user: User) {
    const metadata = user.user_metadata as Record<string, unknown>
    const discordIdentity = user.identities?.find((identity) => identity.provider === "discord")
    const identityData = discordIdentity?.identity_data as Record<string, unknown> | undefined
    const rawDiscordId = [
        discordIdentity?.provider_id,
        identityData?.provider_id,
        identityData?.sub,
        identityData?.id,
        metadata.provider_id,
        metadata.sub,
        metadata.id,
    ].find((value) => typeof value === "string" && /^\d+$/.test(value))

    const username = [metadata.global_name, metadata.username, metadata.user_name, metadata.full_name, metadata.name, user.email]
        .find((value) => typeof value === "string" && value.trim().length > 0)

    return {
        discordId: typeof rawDiscordId === "string" ? rawDiscordId : null,
        username: typeof username === "string" ? username.trim() : "Discord user",
    }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [discordId, setDiscordId] = useState<string | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let isActive = true
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            const nextUser = session?.user ?? null
            setUser((current) => {
                if (current?.id === nextUser?.id && event !== "USER_UPDATED") return current
                return nextUser
            })
        })

        void supabase.auth.getSession().then(({ data, error: sessionError }) => {
            if (!isActive) return
            if (sessionError) setError(sessionError.message)
            const nextUser = data.session?.user ?? null
            setUser((current) => current?.id === nextUser?.id ? current : nextUser)
        })

        return () => {
            isActive = false
            subscription.unsubscribe()
        }
    }, [])

    const refreshProfile = useCallback(async () => {
        if (!user) {
            setProfile(null)
            setLoading(false)
            return
        }

        const { data, error: profileError } = await supabase.rpc("get_my_profile")

        if (profileError) throw profileError
        const row = Array.isArray(data) ? data[0] : data
        setProfile((row as Profile | null) ?? null)
    }, [user])

    useEffect(() => {
        let isActive = true

        async function ensureProfile() {
            if (!user) {
                setProfile(null)
                setDiscordId(null)
                setError(null)
                setLoading(false)
                return
            }

            setLoading(true)
            setError(null)
            try {
                const { discordId, username } = getDiscordProfileData(user)
                if (!discordId) throw new Error("Could not read your Discord ID. Sign out and sign in with Discord again.")
                if (isActive) setDiscordId(discordId)

                const { data, error: rpcError } = await supabase.rpc("ensure_profile", {
                    p_username: username,
                    p_discord_id: discordId,
                })
                if (rpcError) throw rpcError
                const row = Array.isArray(data) ? data[0] : data
                if (!row) throw new Error("Your profile could not be loaded.")
                if (isActive) setProfile(row as Profile)
            } catch (profileError) {
                if (isActive) setError(profileError && typeof profileError === "object" && "message" in profileError
                    ? String(profileError.message)
                    : "Could not create or load your profile.")
            } finally {
                if (isActive) setLoading(false)
            }
        }

        void ensureProfile()

        return () => {
            isActive = false
        }
    }, [user])

    return (
        <ProfileContext.Provider value={{ user, discordId, profile, loading, error, refreshProfile }}>
            {children}
        </ProfileContext.Provider>
    )
}

export function useProfile() {
    const context = useContext(ProfileContext)
    if (!context) throw new Error("useProfile must be used inside ProfileProvider.")
    return context
}
