import { useEffect, useState, type FormEvent } from "react"
import { Eye, Plus, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Combobox,
    ComboboxContent,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "@/components/ui/combobox"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabase"
import type { Hack } from "@/types/Hack"
import type { CoopHack } from "@/types/CoopHack"
import type { HackAuthor } from "@/types/HackAuthor"
import { useProfile } from "@/contexts/ProfileContext"

type HackKind = "hack" | "coop"
type ImageDraft = { id: string; file: File }
type AuthorDraft = HackAuthor & { id: string }

const MAX_IMAGE_BYTES = 1024 * 1024
const MAX_PATCH_BYTES = 30 * 1024 * 1024
const difficultyOptions = [
    { label: "Light Kaizo", value: 0 },
    { label: "Normal Kaizo", value: 1 },
    { label: "Super Kaizo", value: 2 },
]

function newAuthor(): AuthorDraft {
    return {
        id: crypto.randomUUID(),
        name: "",
        allow_edit: false,
        allow_delete: false,
    }
}

function validateYouTubeUrl(value: string) {
    try {
        const url = new URL(value)
        const host = url.hostname.replace(/^www\./, "").toLowerCase()
        if (host === "youtu.be") return url.pathname.split("/").filter(Boolean).length > 0
        if (["youtube.com", "m.youtube.com"].includes(host)) {
            return Boolean(url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/[^/]+/))
        }
        return false
    } catch {
        return false
    }
}

function getErrorMessage(error: unknown) {
    return error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "An unexpected error occurred."
}

export default function HackSubmissionDialog({
    kind,
    onSubmitted,
    onNavigate,
}: {
    kind: HackKind
    onSubmitted: (hack: Hack | CoopHack) => void
    onNavigate: (href: string) => void
}) {
    const isCoop = kind === "coop"
    const { profile, loading: profileLoading } = useProfile()
    const [open, setOpen] = useState(false)
    const [name, setName] = useState("")
    const [authors, setAuthors] = useState<AuthorDraft[]>([newAuthor()])
    const [description, setDescription] = useState("")
    const [difficulty, setDifficulty] = useState("")
    const [starCount, setStarCount] = useState("")
    const [creationDate, setCreationDate] = useState("")
    const [images, setImages] = useState<ImageDraft[]>([])
    const [mainImageId, setMainImageId] = useState("")
    const [videos, setVideos] = useState<string[]>([""])
    const [downloadFile, setDownloadFile] = useState<File | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [previewImage, setPreviewImage] = useState<{ name: string; src: string } | null>(null)

    useEffect(() => {
        if (!previewImage) return
        return () => URL.revokeObjectURL(previewImage.src)
    }, [previewImage])

    function resetForm() {
        setName("")
        setAuthors([newAuthor()])
        setDescription("")
        setDifficulty("")
        setStarCount("")
        setCreationDate("")
        setImages([])
        setMainImageId("")
        setVideos([""])
        setDownloadFile(null)
        setError(null)
    }

    function updateAuthor(id: string, patch: Partial<AuthorDraft>) {
        setAuthors((current) => current.map((author) => author.id === id ? { ...author, ...patch } : author))
    }

    function addImages(files: FileList | null) {
        if (!files?.length) return
        const selected = Array.from(files)
        if (images.length + selected.length > 4) {
            setError("You can upload up to 4 images.")
            return
        }
        const invalid = selected.find((file) => !file.type.startsWith("image/") || file.size >= MAX_IMAGE_BYTES)
        if (invalid) {
            setError(`${invalid.name} must be an image smaller than 1 MB.`)
            return
        }
        const additions = selected.map((file) => ({ id: crypto.randomUUID(), file }))
        setImages((current) => [...current, ...additions])
        setMainImageId((current) => current || additions[0]?.id || "")
        setError(null)
    }

    function removeImage(id: string) {
        setImages((current) => {
            const next = current.filter((image) => image.id !== id)
            setMainImageId((selected) => selected === id ? (next[0]?.id ?? "") : selected)
            return next
        })
    }

    function addVideo() {
        if (videos.length < 3) setVideos((current) => [...current, ""])
    }

    function updateVideo(index: number, value: string) {
        setVideos((current) => current.map((video, itemIndex) => itemIndex === index ? value : video))
    }

    async function uploadPatch(file: File, hackName: string) {
        const { data, error: invokeError } = await supabase.functions.invoke<{
            url?: string
            fileName?: string
            error?: string
        }>("create-hack-upload-url", {
            body: { name: hackName, kind, originalFileName: file.name, size: file.size },
        })

        if (invokeError || !data?.url || !data.fileName) {
            throw new Error(data?.error ?? invokeError?.message ?? "Could not prepare the patch upload.")
        }

        let response: Response
        try {
            response = await fetch(data.url, {
                method: "PUT",
                headers: { "Content-Type": "application/octet-stream" },
                body: file,
            })
        } catch {
            throw new Error("Could not reach the hackfiles R2 upload URL. Check CORS on the hackfiles bucket for this site's origin, PUT, and the Content-Type header.")
        }
        if (!response.ok) {
            const responseDetails = (await response.text().catch(() => "")).trim().slice(0, 500)
            throw new Error(`Patch upload failed (HTTP ${response.status})${responseDetails ? `: ${responseDetails}` : "."}`)
        }
        return data.fileName
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError(null)

        const hackName = name.trim()
        const cleanAuthors = authors
            .map((author) => ({
                name: author.name.trim(),
                allow_edit: author.allow_edit,
                allow_delete: author.allow_delete,
            }))
            .filter((author) => author.name.length > 0)
        const cleanVideos = videos.map((video) => video.trim()).filter(Boolean)
        const parsedStarCount = Number(starCount)
        const selectedMainImage = images.find((image) => image.id === mainImageId)

        if (!hackName) return setError("Enter a name for the hack.")
        if (hackName.includes("/") || hackName.includes("\\") || hackName === "." || hackName === "..") {
            return setError("The hack name cannot contain slashes.")
        }
        if (cleanAuthors.length === 0) return setError("Add at least one author name.")
        if (new Set(cleanAuthors.map((author) => author.name.toLocaleLowerCase())).size !== cleanAuthors.length) {
            return setError("Each author name must be unique.")
        }
        if (!difficultyOptions.some((option) => String(option.value) === difficulty)) return setError("Choose a difficulty.")
        if (!Number.isInteger(parsedStarCount) || parsedStarCount < 0 || parsedStarCount > 32767) {
            return setError("Star count must be a whole number from 0 to 32767.")
        }
        if (!creationDate) return setError("Choose the hack's creation date.")
        if (images.length < 1 || !selectedMainImage) return setError("Upload at least one image and select a main thumbnail.")
        if (!downloadFile) return setError(`Choose a ${isCoop ? "ZIP" : "BPS"} file to upload.`)
        if (downloadFile.size === 0 || downloadFile.size > MAX_PATCH_BYTES) return setError("The BPS/ZIP file must be 30 MB or smaller.")
        if (isCoop ? !downloadFile.name.toLowerCase().endsWith(".zip") : !downloadFile.name.toLowerCase().endsWith(".bps")) {
            return setError(`Choose a ${isCoop ? "ZIP" : "BPS"} file.`)
        }
        if (cleanVideos.length > 3) return setError("You can add up to 3 YouTube videos.")
        if (cleanVideos.some((video) => !validateYouTubeUrl(video))) return setError("Each video must be a valid YouTube link.")

        setSubmitting(true)
        const uploadedImagePaths: string[] = []

        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession()
            if (sessionError) throw sessionError
            if (!session) throw new Error("Sign in with Discord before submitting a hack.")
            if (profileLoading || !profile) throw new Error("Your profile is still loading. Refresh and try again.")
            if (profile.role === 3) throw new Error("Banned accounts cannot upload hacks.")

            const imageNames: string[] = []
            for (const image of images) {
                const extension = image.file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ""
                const storedName = `${crypto.randomUUID()}${extension.toLowerCase()}`
                const path = `${hackName}/${storedName}`
                const { error: imageError } = await supabase.storage
                    .from("hack_images")
                    .upload(path, image.file, { contentType: image.file.type, upsert: false })
                if (imageError) throw new Error(`Could not upload ${image.file.name}: ${imageError.message}`)
                uploadedImagePaths.push(path)
                imageNames.push(storedName)
            }

            const mainIndex = images.findIndex((image) => image.id === selectedMainImage.id)
            const mainImageName = imageNames[mainIndex]
            const patchName = await uploadPatch(downloadFile, hackName)
            const createdAt = new Date(`${creationDate}T00:00:00.000Z`).toISOString()
            const imageData = { main: mainImageName, images: imageNames }
            const videoData = { videos: cleanVideos }
            const selectedDifficulty = Number(difficulty)
            const submissionStatus = profile.role === 1 || profile.role === 2 ? 0 : 1

            const insertData = isCoop
                ? {
                    name: hackName,
                    upload_date: new Date().toISOString(),
                    creation_date: createdAt,
                    authors: cleanAuthors,
                    difficulty: selectedDifficulty,
                    star_count: parsedStarCount,
                    status: submissionStatus,
                    images: imageData,
                    zip: patchName,
                    videos: videoData,
                }
                : {
                    name: hackName,
                    upload_date: new Date().toISOString(),
                    creation_date: createdAt,
                    authors: cleanAuthors,
                    description: description.trim(),
                    difficulty: selectedDifficulty,
                    star_count: parsedStarCount,
                    status: submissionStatus,
                    completion_bonus: 0,
                    images: imageData,
                    bps: patchName,
                    videos: videoData,
                }

            const { data: inserted, error: insertError } = isCoop
                ? await supabase.from("coop_hacks").insert(insertData).select("*").single()
                : await supabase.from("hacks").insert(insertData).select("*").single()
            if (insertError) throw insertError

            onSubmitted(inserted as Hack | CoopHack)
            resetForm()
            setOpen(false)
        } catch (submitError) {
            if (uploadedImagePaths.length > 0) {
                await supabase.storage.from("hack_images").remove(uploadedImagePaths)
            }
            setError(getErrorMessage(submitError))
        } finally {
            setSubmitting(false)
        }
    }

    function handleOpenChange(nextOpen: boolean) {
        if (!nextOpen && !submitting) resetForm()
        setOpen(nextOpen)
    }

    return (
        <>
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger render={<Button type="button" disabled={profileLoading || profile?.role === 3}><Upload />Submit</Button>} />
            <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Submit {isCoop ? "a co-op hack" : "a hack"}</DialogTitle>
                </DialogHeader>

                <form className="flex flex-col gap-5" onSubmit={(event) => void handleSubmit(event)}>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                            Name
                            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
                        </label>

                        <fieldset className="flex flex-col gap-3 sm:col-span-2">
                            <legend className="mb-1 text-sm font-medium">Authors</legend>
                            {authors.map((author, index) => (
                                <div key={author.id} className="rounded-lg border p-3">
                                    <div className="flex items-end gap-2">
                                        <label className="flex flex-1 flex-col gap-1.5 text-sm">
                                            Author {index + 1}
                                            <Input value={author.name} onChange={(event) => updateAuthor(author.id, { name: event.target.value })} maxLength={100} required={index === 0} />
                                        </label>
                                        {authors.length > 1 && (
                                            <Button type="button" variant="outline" size="icon" aria-label={`Remove author ${index + 1}`} onClick={() => setAuthors((current) => current.filter((item) => item.id !== author.id))}>
                                                <Trash2 />
                                            </Button>
                                        )}
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                                        {([
                                            ["allow_edit", "Allow edit"],
                                            ["allow_delete", "Allow delete"],
                                        ] as const).map(([key, label]) => (
                                            <label key={key} className="flex items-center gap-2 text-sm">
                                                <Checkbox checked={author[key]} onCheckedChange={(checked) => updateAuthor(author.id, { [key]: checked === true })} />
                                                {label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <Button type="button" variant="outline" className="self-start" onClick={() => setAuthors((current) => [...current, newAuthor()])}>
                                <Plus />Add author
                            </Button>
                        </fieldset>

                        {!isCoop && (
                            <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                                Description
                                <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
                            </label>
                        )}

                        <div className="flex flex-col gap-1.5 text-sm font-medium">
                            <span>Difficulty</span>
                            <Combobox
                                value={difficulty}
                                onValueChange={(value) => setDifficulty(typeof value === "string" ? value : "")}
                                itemToStringLabel={(value) => difficultyOptions.find((option) => String(option.value) === value)?.label ?? ""}
                            >
                                <ComboboxInput placeholder="Choose difficulty" />
                                <ComboboxContent>
                                    <ComboboxList>
                                        {difficultyOptions.map((option) => (
                                            <ComboboxItem key={option.value} value={String(option.value)}>{option.label}</ComboboxItem>
                                        ))}
                                    </ComboboxList>
                                </ComboboxContent>
                            </Combobox>
                        </div>

                        <label className="flex flex-col gap-1.5 text-sm font-medium">
                            Star Count
                            <Input type="number" min={0} max={32767} step={1} value={starCount} onChange={(event) => setStarCount(event.target.value)} required />
                        </label>

                        <label className="flex flex-col gap-1.5 text-sm font-medium">
                            Creation Date
                            <Input type="date" value={creationDate} onChange={(event) => setCreationDate(event.target.value)} required />
                        </label>

                        <fieldset className="flex flex-col gap-2 sm:col-span-2">
                            <legend className="text-sm font-medium">Images (1–4, each under 1 MB)</legend>
                            <Input type="file" accept="image/*" multiple onChange={(event) => {
                                addImages(event.target.files)
                                event.target.value = ""
                            }} />
                            <p className="text-xs text-muted-foreground">Select one image as the main thumbnail.</p>
                            {images.map((image) => (
                                <div key={image.id} className="flex min-w-0 items-center gap-2 text-sm">
                                    <input
                                        type="radio"
                                        name={`main-image-${kind}`}
                                        aria-label={`Use ${image.file.name} as the main thumbnail`}
                                        checked={mainImageId === image.id}
                                        onChange={() => setMainImageId(image.id)}
                                    />
                                    <span className="min-w-0 flex-1 truncate">{image.file.name} ({(image.file.size / 1024).toFixed(0)} KB)</span>
                                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Preview ${image.file.name}`} title={`Preview ${image.file.name}`} onClick={() => {
                                        setPreviewImage({ name: image.file.name, src: URL.createObjectURL(image.file) })
                                    }}><Eye /></Button>
                                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${image.file.name}`} onClick={() => removeImage(image.id)}><Trash2 /></Button>
                                </div>
                            ))}
                        </fieldset>

                        <fieldset className="flex flex-col gap-2 sm:col-span-2">
                            <legend className="text-sm font-medium">Videos (up to 3 YouTube links)</legend>
                            {videos.map((video, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <Input type="url" placeholder="https://www.youtube.com/watch?v=..." value={video} onChange={(event) => updateVideo(index, event.target.value)} />
                                    {videos.length > 1 && <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove video ${index + 1}`} onClick={() => setVideos((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button>}
                                </div>
                            ))}
                            {videos.length < 3 && <Button type="button" variant="outline" className="self-start" onClick={addVideo}><Plus />Add video</Button>}
                        </fieldset>

                        <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                            {isCoop ? "ZIP" : "BPS"} (up to 30 MB)
                            <Input type="file" accept={isCoop ? ".zip,application/zip" : ".bps,application/octet-stream"} onChange={(event) => setDownloadFile(event.target.files?.[0] ?? null)} required />
                            {downloadFile && <span className="text-xs font-normal text-muted-foreground">{downloadFile.name} ({(downloadFile.size / (1024 * 1024)).toFixed(2)} MB)</span>}
                        </label>
                    </div>

                    {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}{error.startsWith("Sign in") && <> <button type="button" className="underline" onClick={() => { setOpen(false); onNavigate("/account") }}>Go to Account</button></>}</p>}

                    <DialogFooter>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? "Submitting..." : "Submit hack"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
        <Dialog open={previewImage !== null} onOpenChange={(nextOpen) => { if (!nextOpen) setPreviewImage(null) }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{previewImage?.name ?? "Image preview"}</DialogTitle>
                </DialogHeader>
                {previewImage && <img src={previewImage.src} alt={previewImage.name} className="max-h-[75vh] w-full rounded-lg object-contain" />}
            </DialogContent>
        </Dialog>
        </>
    )
}
