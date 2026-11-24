import { useCallback, useEffect, useState } from "react"
import { Bell, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useProfile } from "@/contexts/ProfileContext"
import { supabase } from "@/lib/supabase"
import type { AppNotification } from "@/types/Notification"

function getNotificationPath(notification: AppNotification) {
    const name = encodeURIComponent(notification.item_name)
    return notification.kind === "coop_hack" || (notification.kind === "progress" && notification.hack_kind === "coop")
        ? `/coop-hacks/${name}`
        : `/hacks/${name}`
}

function formatDate(value: string) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export default function Notifications({
    open,
    onOpenChange,
    onNavigate,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onNavigate: (href: string) => void
}) {
    const { profile, loading: profileLoading } = useProfile()
    const [notifications, setNotifications] = useState<AppNotification[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [working, setWorking] = useState(false)

    const loadNotifications = useCallback(async () => {
        if (profileLoading) return
        if (!profile) {
            setNotifications([])
            setLoading(false)
            return
        }
        setLoading(true)
        setError(null)
        const { data, error: queryError } = await supabase
            .from("notifications")
            .select("id, kind, hack_kind, item_name, title, message, created_at, read_at")
            .order("created_at", { ascending: false })
            .limit(100)
        if (queryError) setError(queryError.message)
        else setNotifications((data ?? []) as AppNotification[])
        setLoading(false)
        if (!queryError) window.dispatchEvent(new Event("notifications-changed"))
    }, [profile, profileLoading])

    useEffect(() => { if (open) void loadNotifications() }, [open, loadNotifications])

    async function markRead(notification: AppNotification) {
        if (notification.read_at) return
        const readAt = new Date().toISOString()
        const { error: updateError } = await supabase
            .from("notifications")
            .update({ read_at: readAt })
            .eq("id", notification.id)
        if (updateError) {
            setError(updateError.message)
            return
        }
        setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item))
        window.dispatchEvent(new Event("notifications-changed"))
    }

    async function markAllRead() {
        setWorking(true)
        setError(null)
        const readAt = new Date().toISOString()
        const { error: updateError } = await supabase
            .from("notifications")
            .update({ read_at: readAt })
            .is("read_at", null)
        if (updateError) setError(updateError.message)
        else {
            setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }))
            window.dispatchEvent(new Event("notifications-changed"))
        }
        setWorking(false)
    }

    const unreadCount = notifications.filter((item) => !item.read_at).length

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="h-[85vh] max-h-[85vh] w-[min(28rem,90vw)] max-w-none gap-0 overflow-hidden p-0">
                <SheetHeader className="shrink-0 border-b pr-12">
                    <SheetTitle className="text-xl">Notifications</SheetTitle>
                </SheetHeader>
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                    {unreadCount > 0 && <Button className="self-end" variant="outline" disabled={working} onClick={() => void markAllRead()}>Mark all as read</Button>}
                    {error && <p role="alert" className="text-sm text-destructive">Could not load or update notifications: {error}</p>}
                    {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading notifications...</p>
                        : !profile ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Sign in to view your notifications.</p>
                            : notifications.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">You have no notifications yet.</p>
                                : <div className="flex flex-col gap-3">{notifications.map((notification) => (
                                    <Card key={notification.id} className={notification.read_at ? "opacity-75" : "border-primary/50 bg-primary/5"}>
                                        <CardHeader className="flex flex-row items-start gap-3 space-y-0 p-4">
                                            <Bell aria-hidden="true" className={`mt-1 size-5 shrink-0 ${notification.read_at ? "text-muted-foreground" : "text-primary"}`} />
                                            <div className="min-w-0 flex-1">
                                                <CardTitle className="text-base">{notification.title}</CardTitle>
                                                <CardDescription className="mt-1">{notification.message}</CardDescription>
                                            </div>
                                            {!notification.read_at && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                                        </CardHeader>
                                        <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4">
                                            <p className="text-xs text-muted-foreground">{formatDate(notification.created_at)}</p>
                                            <div className="flex gap-2">
                                                {!notification.read_at && <Button size="sm" variant="ghost" onClick={() => void markRead(notification)}><Check className="mr-1 size-4" />Mark read</Button>}
                                                <Button size="sm" variant="outline" onClick={() => {
                                                    void markRead(notification)
                                                    onOpenChange(false)
                                                    onNavigate(getNotificationPath(notification))
                                                }}>View</Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}</div>}
                </div>
            </SheetContent>
        </Sheet>
    )
}
