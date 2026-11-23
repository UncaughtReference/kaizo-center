export type ProgressStatus = 0 | 1 | 2
export type ProgressHackKind = "hack" | "coop"

export type HackProgress = {
    id: number
    hack_name: string
    hack_kind: ProgressHackKind
    user_discord_id: string
    star_count: number
    video_proof: { videos: string[] } | null
    status: ProgressStatus
    created_at: string
    is_helper?: boolean
    submitter_username?: string | null
    helper_names?: string[]
    username?: string | null
    avatar_url?: string | null
}

export type PublicHackProgress = {
    hack_name: string
    hack_kind: ProgressHackKind
    star_count: number
    video_proof: { videos: string[] } | null
    created_at: string
    is_helper: boolean
    submitter_username: string
    helper_names: string[]
}

