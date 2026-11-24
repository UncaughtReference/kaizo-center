import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import { type CoopHack } from "@/types/CoopHack"
import { getAuthors } from "@/lib/authors"
import HackStatusBadge from "@/components/HackStatusBadge"
import useDisplayNames from "@/hooks/useDisplayNames"

function formatDate(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    const year = date.getFullYear()
    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")
    return `${year}-${day}-${month}`
}

function getDifficultyName(value: number) {
    switch (value) {
        case 0: return "Light Kaizo"
        case 1: return "Normal Kaizo"
        case 2: return "Super Kaizo"
        default: return `Unknown (${value})`
    }
}

export default function CoopHackCard({ hack, onNavigate, showStatus = false }: { hack: CoopHack; onNavigate: (href: string) => void; showStatus?: boolean }) {
    const imagePath = `${hack.name}/${hack.images.main}`
    const detailPath = `/coop-hacks/${encodeURIComponent(hack.name)}`
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const authors = getAuthors(hack.authors)
    const displayNames = useDisplayNames(authors.map((author) => author.name))

    useEffect(() => {
        let isActive = true

        async function loadImage() {
            const { data, error } = await supabase.storage
                .from("hack_images")
                .createSignedUrl(imagePath, 60 * 60)

            if (isActive && !error) setImageUrl(data.signedUrl)
        }

        void loadImage()

        return () => {
            isActive = false
        }
    }, [imagePath])

    return (
        <a
            href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}${detailPath}`}
            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                event.preventDefault()
                onNavigate(detailPath)
            }}
        >
            <div className="rounded-xl bg-gradient-to-r from-violet-500 via-pink-500 to-blue-400 p-1 bg-background">
                <Card>
                    <CardContent className="p-3 sm:p-4">
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                            {imageUrl && (
                                <div className="w-full shrink-0 overflow-hidden rounded-xl bg-background sm:w-48">
                                    <img src={imageUrl} alt={`${hack.name} cover`} className="block h-auto w-full object-contain" />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="break-words text-base sm:text-xl">{hack.name}</p>
                                    {showStatus && <HackStatusBadge status={hack.status} />}
                                </div>
                                <p className="break-words text-sm sm:text-base"><strong>Authors:</strong> {authors.map((author) => displayNames[author.name.toLocaleLowerCase()] ?? author.name).join(", ")}</p>
                                <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 sm:gap-4 sm:text-base">
                                    <div className="min-w-0">
                                        <div className="flex items-center">
                                            <img src={`${import.meta.env.BASE_URL}star.webp`} alt="" className="size-7 shrink-0 object-contain" />
                                            <p className="text-base sm:text-lg">{hack.star_count}</p>
                                        </div>
                                        <p className="break-words"><strong>Difficulty:</strong> {getDifficultyName(hack.difficulty)}</p>
                                        <p className="break-words"><strong>Completion XP Bonus:</strong> {hack.completion_bonus ?? "To Be Determined"}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="break-words"><strong>Upload Date:</strong> {formatDate(hack.upload_date)}</p>
                                        <p className="break-words"><strong>Creation Date:</strong> {formatDate(hack.creation_date)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </a>
    )
}
