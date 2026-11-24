import {
    Card,
    CardHeader,
    CardContent,
    CardFooter,
} from "@/components/ui/card"
import type { ReactNode } from "react"

type News = {
    date_posted: string,
    title: string,
    post: ReactNode,
}

const communityNews: News[] = [
    {
        date_posted: "24-11-2026",
        title: "Kaizo Center is now open!",
        post: <p>This was a fairly big project but it took much less time than anticipated! I hope this site will be useful for the community, especially the co-op side. Have fun! 💜</p>
    }
]

export default function Home({ onNavigate: _onNavigate }: { onNavigate: (href: string) => void }) {
    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-4 py-4 sm:gap-5 sm:py-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight text-white">Welcome to Kaizo Center!!</h1>
            </header>
            <p>This is a place meant for high quality SM64 kaizo hacks with co-op integration!</p>
            <h2 className="text-2xl font-bold tracking-tight text-white">News</h2>
            {communityNews.map((news, index) => (
                <Card key={index}>
                    <CardHeader>
                        <h3 className="text-lg font-semibold">{news.title}</h3>
                    </CardHeader>
                    <CardContent>
                        <div>{news.post}</div>
                    </CardContent>
                    <CardFooter>
                        <p className="text-sm text-muted-foreground">Posted on {news.date_posted} by UncaughtReference</p>
                    </CardFooter>
                </Card>
            ))}
        </div>
    )
}
