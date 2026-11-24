import './App.css'
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import Navbar from "@/components/Navbar"
import Home from "@/components/pages/Home"
import Hacks from "@/components/pages/Hacks"
import HackDetails from "@/components/pages/HackDetails"
import CoopHackDetails from "@/components/pages/CoopHackDetails"
import CoopHacks from "@/components/pages/CoopHacks"
import Account from "@/components/pages/Account"
import Users from "@/components/pages/Users"
import ProfileDetails from "@/components/pages/ProfileDetails"
import ProgressSubmissions from "@/components/pages/ProgressSubmissions"
import { ProfileProvider } from "@/contexts/ProfileContext"
import { setPageMetadata } from "@/lib/pageMetadata"

import { useEffect, useState } from 'react'

const appBase = import.meta.env.BASE_URL.replace(/\/$/, "")
const routeFromLocation = () => {
    const pathname = window.location.pathname.replace(/\/$/, "") || "/"
    return (appBase && pathname.startsWith(appBase) ? pathname.slice(appBase.length) : pathname) || "/"
}

export default function App() {
    const [pathname, setPathname] = useState(routeFromLocation)
    const hackDetailsMatch = pathname.match(/^\/hacks\/(.+)$/)
    const hackName = hackDetailsMatch ? decodeURIComponent(hackDetailsMatch[1]) : null
    const coopHackDetailsMatch = pathname.match(/^\/coop-hacks\/(.+)$/)
    const coopHackName = coopHackDetailsMatch ? decodeURIComponent(coopHackDetailsMatch[1]) : null
    const profileDetailsMatch = pathname.match(/^\/profiles\/(.+)$/)
    const profileUsername = profileDetailsMatch ? decodeURIComponent(profileDetailsMatch[1]) : null

    useEffect(() => {
        const syncPathname = () => setPathname(routeFromLocation())
        window.addEventListener("popstate", syncPathname)
        return () => window.removeEventListener("popstate", syncPathname)
    }, [])

    useEffect(() => {
        if (hackDetailsMatch || coopHackDetailsMatch || profileDetailsMatch) return
        const titles: Record<string, string> = {
            "/": "Kaizo Center",
            "/hacks": "Kaizo Hacks | Kaizo Center",
            "/coop-hacks": "Co-op Hacks | Kaizo Center",
            "/users": "Players | Kaizo Center",
            "/account": "Account | Kaizo Center",
            "/progress-submissions": "Progress Submissions | Kaizo Center",
        }
        setPageMetadata({
            title: titles[pathname] ?? "Kaizo Center",
        })
    }, [pathname, hackDetailsMatch, coopHackDetailsMatch, profileDetailsMatch])

    const navigate = (href: string) => {
        const route = href
        const destination = new URL(`${appBase}${route}`, window.location.origin)
        window.history.pushState({ kaizoCenterFrom: routeFromLocation() }, "", destination)
        setPathname(routeFromLocation())

        if (destination.hash) {
            requestAnimationFrame(() => {
                document.getElementById(decodeURIComponent(destination.hash.slice(1)))?.scrollIntoView({ behavior: "smooth" })
            })
        } else {
            window.scrollTo({ top: 0 })
        }
    }

    const backFromDetails = (fallbackRoute: string) => {
        const previousRoute = window.history.state?.kaizoCenterFrom
        if (typeof previousRoute === "string" && previousRoute.length > 0) {
            window.history.back()
        } else {
            navigate(fallbackRoute)
        }
    }

    return (<main className="min-h-svh animated-gradient dark">
        <SidebarProvider>
          <ProfileProvider>
            <div className="flex min-h-svh w-full">

                <Navbar onNavigate={navigate} />
                <div className="min-w-0 flex-1 p-4">
                    <div className="fixed top-2 left-2 z-50 md:hidden">
                        <SidebarTrigger className="bg-background shadow-md" />
                    </div>
                    {profileUsername ? <ProfileDetails username={profileUsername} onNavigate={navigate} />
                        : coopHackName ? <CoopHackDetails name={coopHackName} onBack={() => backFromDetails("/coop-hacks")} onNavigate={navigate} />
                        : hackName ? <HackDetails name={hackName} onBack={() => backFromDetails("/hacks")} onNavigate={navigate} />
                        : pathname === "/coop-hacks" ? <CoopHacks onNavigate={navigate} />
                        : pathname === "/account" ? <Account onNavigate={navigate} />
                            : pathname === "/users" ? <Users onNavigate={navigate} />
                            : pathname === "/progress-submissions" ? <ProgressSubmissions onNavigate={navigate} />
                            : pathname === "/hacks" ? <Hacks onNavigate={navigate} />
                                : <Home onNavigate={navigate} />}
                </div>
            </div>
          </ProfileProvider>
        </SidebarProvider>
    </main>);
}
