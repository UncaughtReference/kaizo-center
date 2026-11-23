export type NotificationKind = "hack" | "coop_hack" | "progress"

export type AppNotification = {
    id: number
    kind: NotificationKind
    hack_kind: "hack" | "coop"
    item_name: string
    title: string
    message: string
    created_at: string
    read_at: string | null
}
