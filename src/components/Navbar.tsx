import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import Notifications from "@/components/pages/Notifications"

import { useCallback, useEffect, useState, type MouseEvent } from "react"

import { Bell, House, Gamepad2, Headset, User, Users, ClipboardCheck } from "lucide-react"
import { useProfile } from "@/contexts/ProfileContext"
import { supabase } from "@/lib/supabase"

export default function Navbar({ onNavigate }: { onNavigate: (href: string) => void }) {
    const { setOpenMobile } = useSidebar()
    const { profile, user } = useProfile()
    const [unreadCount, setUnreadCount] = useState(0)
    const [notificationsOpen, setNotificationsOpen] = useState(false)
    const refreshUnreadCount = useCallback(async () => {
        if (!user) {
            setUnreadCount(0)
            return
        }
        const { count, error } = await supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .is("read_at", null)
        if (!error) setUnreadCount(count ?? 0)
    }, [user])

    useEffect(() => {
        void refreshUnreadCount()
        const refreshAfterNotificationChange = () => void refreshUnreadCount()
        window.addEventListener("notifications-changed", refreshAfterNotificationChange)
        return () => {
            window.removeEventListener("notifications-changed", refreshAfterNotificationChange)
        }
    }, [refreshUnreadCount])
    const followLink = (event: MouseEvent<HTMLElement>, href: string) => {
        event.preventDefault()
        onNavigate(href)
        setOpenMobile(false)
    }

    return (
        <div className="bg-gradient-to-r from-violet-500 via-pink-500 to-blue-400 p-[1px]">
            <div className="bg-background">
                <Sidebar>
                    <SidebarHeader>
                        <div className="flex gap-2 items-center">
                            <img src={`${import.meta.env.BASE_URL}logo.png`} className="w-[30px]" />Kaizo Center
                        </div>
                    </SidebarHeader>
                    <SidebarContent>
                        <SidebarGroup>
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton render={<a href={import.meta.env.BASE_URL} />} onClick={(event) => followLink(event, "/")}>
                                        <House />Home
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton render={<a href={`${import.meta.env.BASE_URL}hacks`} />} onClick={(event) => followLink(event, "/hacks")}>
                                        <Gamepad2 />Hacks
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton render={<a href={`${import.meta.env.BASE_URL}coop-hacks`} />} onClick={(event) => followLink(event, "/coop-hacks")}>
                                        <Headset />Co-op Hacks
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton render={<a href={`${import.meta.env.BASE_URL}account`} />} onClick={(event) => followLink(event, "/account")}>
                                        <User />Account
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                {profile && (
                                    <SidebarMenuItem>
                                        <SidebarMenuButton render={<a href={`${import.meta.env.BASE_URL}users`} />} onClick={(event) => followLink(event, "/users")}>
                                            <Users />Users
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                )}
                                {profile?.role === 2 && (
                                    <SidebarMenuItem>
                                        <SidebarMenuButton render={<a href={`${import.meta.env.BASE_URL}progress-submissions`} />} onClick={(event) => followLink(event, "/progress-submissions")}>
                                            <ClipboardCheck />Progress Submissions
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                )}
                            </SidebarMenu>
                        </SidebarGroup>
                    </SidebarContent>
                    <SidebarFooter>
                        {profile && (
                            <Button variant="ghost" className="w-full justify-start" onClick={() => setNotificationsOpen(true)}>
                                <Bell />
                                <span>Notifications</span>
                                {unreadCount > 0 && <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{unreadCount > 99 ? "99+" : unreadCount}</span>}
                            </Button>
                        )}
                    </SidebarFooter>
                </Sidebar>
                <Notifications
                    open={notificationsOpen}
                    onOpenChange={setNotificationsOpen}
                    onNavigate={(href) => {
                        setNotificationsOpen(false)
                        onNavigate(href)
                        setOpenMobile(false)
                    }}
                />
            </div>
        </div >
    )

}
