import { supabase } from "@/lib/supabase"
import type { Profile } from "@/types/Profile"

export type VisibleSiteUser = { username: string; display_name: string }

export async function fetchVisibleUsers(): Promise<VisibleSiteUser[]> {
    const pageSize = 1000
    const users: VisibleSiteUser[] = []
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.rpc("get_visible_user_directory_with_display_name", {
            p_offset: offset,
            p_limit: pageSize,
        })
        if (error) throw error
        const page = (data ?? []) as Pick<Profile, "username" | "display_name">[]
        users.push(...page.filter((profile) => profile.username).map((profile) => ({
            username: profile.username,
            display_name: profile.display_name?.trim() || profile.username,
        })))
        if (page.length < pageSize) return users
    }
}
