import { useEffect, useState } from "react"
import { ArrowLeft, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { normalizeHackName } from "@/lib/utils"
import { type Hack } from "@/types/Hack"
import { getAuthors } from "@/lib/authors"
import ProgressSection from "@/components/ProgressSection"
import HackAuthorActions from "@/components/HackAuthorActions"
import useDisplayNames from "@/hooks/useDisplayNames"
import HackReviews from "@/components/HackReviews"
import CompletionBonus from "@/components/CompletionBonus"
import { usePageMetadata } from "@/lib/pageMetadata"

function formatDate(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    const year = date.getFullYear()
    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")
    return `${year}-${day}-${month}`
}

// should probably be in a utils file but whatever
function getDifficultyName(value: number) {
    switch (value) {
        case 0: return "Light Kaizo"
        case 1: return "Normal Kaizo"
        case 2: return "Super Kaizo"
        default: return `Unknown (${value})`
    }
}

function getYouTubeEmbedUrl(value: string) {
    try {
        const url = new URL(value)
        const host = url.hostname.replace(/^www\./, "").toLowerCase()
        let videoId: string | null = null

        if (host === "youtu.be") {
            videoId = url.pathname.split("/").filter(Boolean)[0] ?? null
        } else if (host === "youtube.com" || host === "m.youtube.com") {
            if (url.pathname === "/watch") {
                videoId = url.searchParams.get("v")
            } else {
                const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)
                videoId = match?.[1] ?? null
            }
        }

        return videoId && /^[\w-]{11}$/.test(videoId)
            ? `https://www.youtube-nocookie.com/embed/${videoId}`
            : null
    } catch {
        return null
    }
}

async function doesCoopHackExist(name: string): Promise<boolean | null> {
    const targetName = normalizeHackName(name)
    const pageSize = 1000

    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from("coop_hacks")
            .select("name")
            .range(from, from + pageSize - 1)

        if (error) return null

        const page = data ?? []
        if (page.some((coopHack) => normalizeHackName(coopHack.name) === targetName)) return true
        if (page.length < pageSize) return false
    }
}

export default function HackDetails({ name, onBack, onNavigate }: { name: string; onBack: () => void; onNavigate: (href: string) => void }) {
    const [hack, setHack] = useState<Hack | null>(null)
    const [imageUrls, setImageUrls] = useState<{ filename: string; url: string; isMain: boolean }[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [downloading, setDownloading] = useState(false)
    const [downloadError, setDownloadError] = useState<string | null>(null)
    const [coopPortStatus, setCoopPortStatus] = useState<"checking" | "available" | "unavailable" | "error">("checking")
    useEffect(() => {
        if (!hack) return
        let isActive = true
        const filenames = [...new Set([hack.images.main, ...(hack.images.images ?? [])].filter((filename): filename is string => typeof filename === "string" && filename.length > 0))]
        void Promise.all(filenames.map(async (filename) => {
            const { data, error: imageError } = await supabase.storage.from("hack_images").createSignedUrl(`${hack.name}/${filename}`, 60 * 60)
            return imageError ? null : { filename, url: data.signedUrl, isMain: filename === hack.images.main }
        })).then((signedImages) => {
            if (isActive) setImageUrls(signedImages.filter((image): image is { filename: string; url: string; isMain: boolean } => image !== null))
        })
        return () => { isActive = false }
    }, [hack?.name, hack?.images])

    useEffect(() => {
        let isActive = true

        async function fetchHack() {
            const { data, error } = await supabase
                .from("hacks")
                .select("*")
                .eq("name", name)
                .maybeSingle()

            if (!isActive) return

            if (error) {
                setError(error.message)
                setLoading(false)
                return
            }

            if (!data) {
                setLoading(false)
                return
            }

            const result = data as Hack
            setHack(result)

            const filenames = [...new Set([
                result.images.main,
                ...(result.images.images ?? []),
            ].filter((filename): filename is string => typeof filename === "string" && filename.length > 0))]
            const [signedImages, coopAvailable] = await Promise.all([
                Promise.all(filenames.map(async (filename) => {
                    const { data: image, error: imageError } = await supabase.storage
                        .from("hack_images")
                        .createSignedUrl(`${result.name}/${filename}`, 60 * 60)
                    return imageError ? null : { filename, url: image.signedUrl, isMain: filename === result.images.main }
                })),
                doesCoopHackExist(result.name),
            ])

            if (isActive) setImageUrls(signedImages.filter((image): image is { filename: string; url: string; isMain: boolean } => image !== null))
            if (isActive) {
                setCoopPortStatus(coopAvailable === null ? "error" : coopAvailable ? "available" : "unavailable")
            }
            if (isActive) setLoading(false)
        }

        void fetchHack()

        return () => {
            isActive = false
        }
    }, [name])

    const videos = hack?.videos?.videos ?? []
    const authors = useDisplayNames(hack ? getAuthors(hack.authors).map((author) => author.name) : [])
    const mainImage = imageUrls.find((image) => image.isMain)
    const galleryImages = imageUrls.filter((image) => !image.isMain)
    usePageMetadata({
        title: hack ? `${hack.name} | Kaizo Center` : "Hack | Kaizo Center",
        description: hack ? `Difficulty: ${getDifficultyName(hack.difficulty)}\n⭐ ${hack.star_count}` : null,
        image: mainImage?.url,
        images: [mainImage?.url, ...galleryImages.map((galleryImage) => galleryImage.url)].filter((url): url is string => Boolean(url)),
    })

    async function downloadPatch() {
        if (!hack?.bps) return

        setDownloadError(null)
        setDownloading(true)

        try {
            const { data, error } = await supabase.functions.invoke<{ url: string }>("get-hack-download", {
                body: { name: hack.name },
            })

            if (error || !data?.url) {
                setDownloadError(error?.message ?? "Could not create a download link.")
                return
            }

            window.location.assign(data.url)
        } catch {
            setDownloadError("Could not create a download link. Please try again.")
        } finally {
            setDownloading(false)
        }
    }

    if (loading) {
        return <div className="mx-auto max-w-5xl py-8"><Button variant="outline" onClick={onBack}><ArrowLeft />Back</Button><p className="mt-4 text-muted-foreground">Loading hack...</p></div>
    }

    if (error) {
        return <div className="mx-auto max-w-5xl py-8"><Button variant="outline" onClick={onBack}><ArrowLeft />Back</Button><p role="alert" className="mt-4 text-muted-foreground">Could not load hack: {error}</p></div>
    }

    if (!hack) {
        return <div className="mx-auto max-w-5xl py-8"><Button variant="outline" onClick={onBack}><ArrowLeft />Back</Button><p className="mt-4 text-muted-foreground">Hack not found.</p></div>
    }

    return (
        <article className="mx-auto flex max-w-5xl flex-col gap-6 py-8">
            <div><Button variant="outline" onClick={onBack}><ArrowLeft />Back</Button></div>
            <header className="flex flex-col gap-3 sm:flex-row sm:items-start">
                {mainImage && <img src={mainImage.url} alt={`${hack.name} cover`} className="max-h-80 max-w-full rounded-xl object-contain sm:max-w-sm" />}
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-white">{hack.name}</h1>
                    <p><strong>Authors:</strong> {getAuthors(hack.authors).map((author, index) => (
                        <span key={`${author.name}-${index}`}>{index > 0 && ", "}<a href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/profiles/${encodeURIComponent(author.name)}`} className="text-primary underline" onClick={(event) => {
                                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                                event.preventDefault()
                                onNavigate(`/profiles/${encodeURIComponent(author.name)}`)
                            }}>{authors[author.name.toLocaleLowerCase()] ?? author.name}</a></span>
                    ))}</p>
                    <p><strong>Difficulty:</strong> {getDifficultyName(hack.difficulty)}</p>
                    <p className="flex items-center gap-1">
                        <img src={`${import.meta.env.BASE_URL}star.webp`} alt="Stars" className="size-6 object-contain" />
                        <span>{hack.star_count}</span>
                    </p>
                    <CompletionBonus kind="hack" hackName={hack.name} bonus={hack.completion_bonus} onSaved={(completion_bonus) => setHack({ ...hack, completion_bonus })} />
                    <p><strong>Co-op port:</strong> {
                        coopPortStatus === "available" ? (
                            <a
                                href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/coop-hacks/${encodeURIComponent(hack.name)}`}
                                className="text-primary underline"
                                onClick={(event) => {
                                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                                    event.preventDefault()
                                    onNavigate(`/coop-hacks/${encodeURIComponent(hack.name)}`)
                                }}
                            >Available</a>
                        )
                            : coopPortStatus === "unavailable" ? "Unavailable"
                                : coopPortStatus === "error" ? "Could not check"
                                    : "Checking..."
                    }</p>
                    <p><strong>Upload date:</strong> {formatDate(hack.upload_date)}</p>
                    <p><strong>Creation date:</strong> {formatDate(hack.creation_date)}</p>
                </div>
            </header>

            <HackAuthorActions kind="hack" hack={hack} onUpdated={(updated) => setHack(updated as Hack)} onDeleted={onBack} />

            <section className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold">Description</h2>
                <p className="whitespace-pre-wrap">{hack.description || "No description provided."}</p>
            </section>

            <ProgressSection hackName={hack.name} hackKind="hack" starCount={hack.star_count} />

            <section className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold">BPS patch</h2>
                {hack.bps ? (
                    <div className="flex flex-col items-start gap-2">
                        <p>{hack.bps}</p>
                        <Button onClick={() => void downloadPatch()} disabled={downloading}>
                            <Download />{downloading ? "Preparing download..." : "Download"}
                        </Button>
                        {downloadError && <p role="alert" className="text-sm text-destructive">{downloadError}</p>}
                    </div>
                ) : <p>No BPS patch available.</p>}
            </section>

            <section className="flex flex-col gap-3">
                <h2 className="text-xl font-semibold">Videos</h2>
                {videos.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                        {videos.map((video, index) => {
                            const embedUrl = getYouTubeEmbedUrl(video)

                            return embedUrl ? (
                                <iframe
                                    key={`${video}-${index}`}
                                    src={embedUrl}
                                    title={`${hack.name} video ${index + 1}`}
                                    className="aspect-video w-full rounded-xl"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                    allowFullScreen
                                />
                            ) : (
                                <a key={`${video}-${index}`} href={video} target="_blank" rel="noreferrer" className="text-primary underline">
                                    Open video {index + 1}
                                </a>
                            )
                        })}
                    </div>
                ) : <p>No videos available.</p>}
            </section>

            {galleryImages.length > 0 && (
                <section className="flex flex-col gap-3">
                    <h2 className="text-xl font-semibold">Images</h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {galleryImages.map((image) => (
                            <img key={image.filename} src={image.url} alt={`${hack.name} - ${image.filename}`} className="max-h-[32rem] w-full rounded-xl object-contain" />
                        ))}
                    </div>
                </section>
            )}

            <HackReviews hackName={hack.name} hackKind="hack" starCount={hack.star_count} />
        </article>
    )
}

