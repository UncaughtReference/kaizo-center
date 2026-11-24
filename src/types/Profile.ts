export type ProfileRole = 0 | 1 | 2 | 3

export type Profile = {
    user_id: string
    username: string
    display_name?: string | null
    avatar_url?: string | null
    xp?: number
    coop_xp?: number
    private_xp?: boolean
    private_progress?: boolean
    private_profile?: boolean
    role: ProfileRole
}

export function getProfileRoleName(role: number) {
    switch (role) {
        case 0: return "User"
        case 1: return "Trusted user"
        case 2: return "Moderator"
        case 3: return "Banned"
        default: return "Unknown role"
    }
}
