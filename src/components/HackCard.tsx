import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"

import { type Hack } from "@/types/Hack"
import { supabase } from "@/lib/supabase"
import { getAuthors } from "@/lib/authors"
import HackStatusBadge from "@/components/HackStatusBadge"

function formatDate(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    const year = date.getFullYear()
    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")
    return `${year}-${day}-${month}`
}

function getDifficultyName(value: number) {
    switch(value) {
        case 0: 
            return "Light Kaizo"
        case 1:
            return "Normal Kaizo"
        case 2:
            return "Super Kaizo"
    }
}

export default function HackCard({ hack, hasCoopPort, onNavigate, showStatus = false }: { hack: Hack; hasCoopPort: boolean; onNavigate: (href: string) => void; showStatus?: boolean }) {
    const imagePath = `${hack.name}/${hack.images.main}`
    const detailPath = `/hacks/${encodeURIComponent(hack.name)}`
    const [imageUrl, setImageUrl] = useState<string | null>(null)

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
        <div className="relative rounded-xl">
            <div className="rounded-xl bg-gradient-to-r from-violet-500 via-pink-500 to-blue-400 p-1 bg-background">
                <Card>
                    <CardContent className="p-3 sm:p-4">
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                            {imageUrl && (
                                <div className="aspect-video w-full shrink-0 overflow-hidden rounded-xl sm:aspect-auto sm:h-32 sm:w-48">
                                    <img src={imageUrl} alt={`${hack.name} cover`} className="h-full w-full rounded-xl object-contain" />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="break-words text-base sm:text-xl">{hack.name}</p>
                                    {showStatus && <HackStatusBadge status={hack.status} />}
                                </div>
                                <p className="break-words text-sm sm:text-base"><strong>Authors:</strong> {getAuthors(hack.authors).map((author) => author.name).join(", ")}</p>
                                <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 sm:gap-4 sm:text-base">
                                    <div className="min-w-0">
                                        <div className="flex items-center">
                                            <img src={`${import.meta.env.BASE_URL}star.webp`} alt="" className="size-7 shrink-0 object-contain" />
                                            <p className="text-base sm:text-lg">{hack.star_count}</p>
                                        </div>
                                        <p className="break-words"><strong>Difficulty:</strong> {getDifficultyName(hack.difficulty)}</p>
                                        <p className="break-words"><strong>Completion XP Bonus:</strong> {hack.completion_bonus}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="break-words"><strong>Upload Date:</strong> {formatDate(hack.upload_date)}</p>
                                        <p className="break-words"><strong>Creation Date:</strong> {formatDate(hack.creation_date)}</p>
                                        <p className="break-words"><strong>Co-op Port:</strong> {hasCoopPort ? (
                                            <a
                                                href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/coop-hacks/${encodeURIComponent(hack.name)}`}
                                                className="relative z-20 text-primary underline"
                                                onClick={(event) => {
                                                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                                                    event.preventDefault()
                                                    onNavigate(`/coop-hacks/${encodeURIComponent(hack.name)}`)
                                                }}
                                            >Available</a>
                                        ) : "Unavailable"}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
            <a
                href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}${detailPath}`}
                aria-label={`View ${hack.name} details`}
                className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(event) => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                    event.preventDefault()
                    onNavigate(detailPath)
                }}
            />
        </div>
    )
}
