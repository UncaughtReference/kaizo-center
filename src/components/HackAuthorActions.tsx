import { useEffect, useState, type FormEvent } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Combobox,
    ComboboxContent,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "@/components/ui/combobox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabase"
import { getAuthors } from "@/lib/authors"
import { useProfile } from "@/contexts/ProfileContext"
import type { Hack } from "@/types/Hack"
import type { CoopHack } from "@/types/CoopHack"
import AuthorNameInput from "@/components/AuthorNameInput"
import { fetchVisibleUsers, type VisibleSiteUser } from "@/lib/userDirectory"

type Kind = "hack" | "coop"
type HackRow = Hack | CoopHack
type AuthorDraft = { name: string; allow_edit: boolean; allow_delete: boolean }
type ImageDraft = { id: string; filename: string; file?: File }

const maxImageBytes = 1024 * 1024
const maxDownloadBytes = 30 * 1024 * 1024

function getMessage(error: unknown) {
    return error && typeof error === "object" && "message" in error ? String(error.message) : "Unexpected error."
}

export default function HackAuthorActions({ kind, hack, onUpdated, onDeleted }: {
    kind: Kind
    hack: HackRow
    onUpdated: (hack: HackRow) => void
    onDeleted: () => void
}) {
    const { profile } = useProfile()
    const myName = profile?.username.trim().toLocaleLowerCase()
    const myAuthor = getAuthors(hack.authors).find((author) => author.name.trim().toLocaleLowerCase() === myName)
    const isModerator = profile?.role === 2
    const canEdit = isModerator || myAuthor?.allow_edit === true
    const canDelete = isModerator || myAuthor?.allow_delete === true
    const [editOpen, setEditOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [authors, setAuthors] = useState<AuthorDraft[]>([])
    const [description, setDescription] = useState("")
    const [difficulty, setDifficulty] = useState("0")
    const [starCount, setStarCount] = useState("0")
    const [creationDate, setCreationDate] = useState("")
    const [videos, setVideos] = useState<string[]>([""])
    const [images, setImages] = useState<ImageDraft[]>([])
    const [mainImageId, setMainImageId] = useState("")
    const [downloadFile, setDownloadFile] = useState<File | null>(null)
    const [siteUsers, setSiteUsers] = useState<VisibleSiteUser[]>([])

    useEffect(() => {
        if (!editOpen) return
        let isActive = true
        void fetchVisibleUsers().then((users) => {
            if (isActive) setSiteUsers(users)
        }).catch(() => {
            // Author names remain editable as free text if the directory is unavailable.
        })
        return () => { isActive = false }
    }, [editOpen])

    function openEditor() {
        setAuthors(getAuthors(hack.authors).map((author) => ({ ...author })))
        setDescription("description" in hack ? hack.description : "")
        setDifficulty(String(hack.difficulty))
        setStarCount(String(hack.star_count))
        setCreationDate(hack.creation_date.slice(0, 10))
        setVideos(hack.videos?.videos?.length ? [...hack.videos.videos] : [""])
        const imageNames = [...new Set([hack.images.main, ...(hack.images.images ?? [])].filter(Boolean))]
        const imageDrafts = imageNames.map((filename) => ({ id: crypto.randomUUID(), filename }))
        setImages(imageDrafts)
        setMainImageId(imageDrafts.find((image) => image.filename === hack.images.main)?.id ?? imageDrafts[0]?.id ?? "")
        setDownloadFile(null)
        setError(null)
        setEditOpen(true)
    }

    function addImages(files: FileList | null) {
        if (!files?.length) return
        const selected = Array.from(files)
        if (images.length + selected.length > 4) return setError("You can use up to 4 images.")
        const invalid = selected.find((file) => !file.type.startsWith("image/") || file.size >= maxImageBytes)
        if (invalid) return setError(`${invalid.name} must be an image smaller than 1 MB.`)
        const additions = selected.map((file) => ({ id: crypto.randomUUID(), filename: "", file }))
        setImages((current) => [...current, ...additions])
        setMainImageId((current) => current || additions[0]?.id || "")
        setError(null)
    }

    async function uploadDownload(file: File) {
        const { data, error: invokeError } = await supabase.functions.invoke<{ url?: string; fileName?: string; error?: string }>("create-hack-upload-url", {
            body: { name: hack.name, kind, originalFileName: file.name, size: file.size },
        })
        if (invokeError || !data?.url || !data.fileName) throw new Error(data?.error ?? invokeError?.message ?? "Could not prepare the file upload.")
        let response: Response
        try {
            response = await fetch(data.url, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: file })
        } catch {
            throw new Error("Could not reach the hackfiles R2 upload URL. Check the bucket CORS settings.")
        }
        if (!response.ok) {
            const details = (await response.text().catch(() => "")).trim().slice(0, 500)
            throw new Error(`File upload failed (HTTP ${response.status})${details ? `: ${details}` : "."}`)
        }
        return data.fileName
    }

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError(null)
        const cleanAuthors = authors.map((author) => ({ ...author, name: author.name.trim() })).filter((author) => author.name)
        const cleanVideos = videos.map((video) => video.trim()).filter(Boolean)
        const stars = Number(starCount)
        const date = new Date(`${creationDate}T00:00:00.000Z`)
        const selectedMainImage = images.find((image) => image.id === mainImageId)
        if (!cleanAuthors.length) return setError("Add at least one author.")
        if (new Set(cleanAuthors.map((author) => author.name.toLocaleLowerCase())).size !== cleanAuthors.length) return setError("Author names must be unique.")
        if (!Number.isInteger(stars) || stars < 0 || stars > 32767) return setError("Star count must be from 0 to 32767.")
        if (!Number.isFinite(date.getTime())) return setError("Choose a valid creation date.")
        if (!/^[0-2]$/.test(difficulty)) return setError("Choose a valid difficulty.")
        if (cleanVideos.length > 3) return setError("You can add up to 3 videos.")
        if (images.length < 1 || !selectedMainImage) return setError("Keep or upload at least one image and select a main thumbnail.")
        if (downloadFile && (downloadFile.size === 0 || downloadFile.size > maxDownloadBytes)) return setError("The BPS/ZIP file must be 30 MB or smaller.")
        if (downloadFile && (kind === "coop" ? !downloadFile.name.toLowerCase().endsWith(".zip") : !downloadFile.name.toLowerCase().endsWith(".bps"))) {
            return setError(`Choose a ${kind === "coop" ? "ZIP" : "BPS"} file.`)
        }
        setSaving(true)
        const uploadedImagePaths: string[] = []
        try {
            const imageNames: string[] = []
            for (const image of images) {
                if (!image.file) {
                    imageNames.push(image.filename)
                    continue
                }
                const extension = image.file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ""
                const filename = `${crypto.randomUUID()}${extension.toLowerCase()}`
                const path = `${hack.name}/${filename}`
                const { error: imageError } = await supabase.storage.from("hack_images").upload(path, image.file, { contentType: image.file.type, upsert: false })
                if (imageError) throw new Error(`Could not upload ${image.file.name}: ${imageError.message}`)
                uploadedImagePaths.push(path)
                imageNames.push(filename)
            }
            const mainIndex = images.findIndex((image) => image.id === selectedMainImage.id)
            const imageData = { main: imageNames[mainIndex], images: imageNames }
            const uploadedDownloadName = downloadFile ? await uploadDownload(downloadFile) : null
            const { data, error: rpcError } = await supabase.rpc("edit_authored_hack", {
                p_kind: kind,
                p_id: kind === "hack" ? (hack as Hack).id : null,
                p_name: hack.name,
                p_data: {
                    authors: cleanAuthors,
                    description: description.trim(),
                    difficulty: Number(difficulty),
                    star_count: stars,
                    creation_date: date.toISOString(),
                    videos: { videos: cleanVideos },
                    images: imageData,
                    ...(downloadFile ? kind === "coop" ? { zip: uploadedDownloadName } : { bps: uploadedDownloadName } : {}),
                },
            })
            if (rpcError) throw rpcError
            if (!data) throw new Error("The hack was not updated.")
            onUpdated(data as HackRow)
            setEditOpen(false)
        } catch (saveError) {
            if (uploadedImagePaths.length) await supabase.storage.from("hack_images").remove(uploadedImagePaths)
            setError(getMessage(saveError))
        } finally {
            setSaving(false)
        }
    }

    async function removeHack() {
        if (!window.confirm(`Delete "${hack.name}" permanently?`)) return
        setError(null)
        setDeleting(true)
        try {
            const { data, error: rpcError } = await supabase.rpc("delete_authored_hack", {
                p_kind: kind,
                p_id: kind === "hack" ? (hack as Hack).id : null,
                p_name: hack.name,
            })
            if (rpcError) throw rpcError
            if (data !== true) throw new Error("The hack was not deleted.")
            onDeleted()
        } catch (deleteError) {
            setError(getMessage(deleteError))
        } finally {
            setDeleting(false)
        }
    }

    if (!canEdit && !canDelete) return null

    return <>
        <div className="flex flex-wrap gap-2">
            {canEdit && <Button type="button" variant="outline" onClick={openEditor}><Pencil />Edit hack</Button>}
            {canDelete && <Button type="button" variant="destructive" onClick={() => void removeHack()} disabled={deleting}><Trash2 />{deleting ? "Deleting..." : "Delete hack"}</Button>}
        </div>
        {error && !editOpen && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Dialog open={editOpen} onOpenChange={(open) => { if (!saving) setEditOpen(open) }}>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto sm:max-w-3xl">
                <DialogHeader><DialogTitle>Edit {kind === "coop" ? "co-op " : ""}hack</DialogTitle></DialogHeader>
                <form className="flex flex-col gap-5" onSubmit={(event) => void save(event)}>
                    <fieldset className="flex flex-col gap-3">
                        <legend className="mb-1 text-sm font-medium">Authors</legend>
                        {authors.map((author, index) => <div key={index} className="rounded-lg border p-3">
                            <div className="flex items-end gap-2">
                                <label className="flex flex-1 flex-col gap-1.5 text-sm">
                                    Author {index + 1}
                                    <AuthorNameInput value={author.name} onChange={(value) => setAuthors((current) => current.map((item, i) => i === index ? { ...item, name: value } : item))} users={siteUsers} required={index === 0} />
                                </label>
                                {authors.length > 1 && <Button type="button" variant="outline" size="icon" aria-label={`Remove author ${index + 1}`} onClick={() => setAuthors((current) => current.filter((_, i) => i !== index))}><Trash2 /></Button>}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                                {(["allow_edit", "allow_delete"] as const).map((key) => <label key={key} className="flex items-center gap-2 text-sm"><Checkbox checked={author[key]} onCheckedChange={(checked) => setAuthors((current) => current.map((item, i) => i === index ? { ...item, [key]: checked === true } : item))} />{key === "allow_edit" ? "Allow edit" : "Allow delete"}</label>)}
                            </div>
                        </div>)}
                        <Button type="button" variant="outline" className="self-start" onClick={() => setAuthors((current) => [...current, { name: "", allow_edit: false, allow_delete: false }])}><Plus />Add author</Button>
                    </fieldset>
                    {kind === "hack" && <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">Description<Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} /></label>}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium">Difficulty</span>
                            <Combobox
                                value={difficulty}
                                onValueChange={(value) => setDifficulty(typeof value === "string" ? value : "")}
                                itemToStringLabel={(value) => ({ "0": "Light Kaizo", "1": "Normal Kaizo", "2": "Super Kaizo" }[value] ?? "")}
                            >
                                <ComboboxInput placeholder="Choose difficulty" />
                                <ComboboxContent>
                                    <ComboboxList>
                                        <ComboboxItem value="0">Light Kaizo</ComboboxItem>
                                        <ComboboxItem value="1">Normal Kaizo</ComboboxItem>
                                        <ComboboxItem value="2">Super Kaizo</ComboboxItem>
                                    </ComboboxList>
                                </ComboboxContent>
                            </Combobox>
                        </div>
                        <label className="flex flex-col gap-1.5 text-sm font-medium">Star Count<Input type="number" min="0" max="32767" step="1" value={starCount} onChange={(event) => setStarCount(event.target.value)} required /></label>
                        <label className="flex flex-col gap-1.5 text-sm font-medium">Creation Date<Input type="date" value={creationDate} onChange={(event) => setCreationDate(event.target.value)} required /></label>
                    </div>
                    <fieldset className="flex flex-col gap-2">
                        <legend className="text-sm font-medium">Images (1–4, each under 1 MB)</legend>
                        <Input type="file" accept="image/*" multiple onChange={(event) => {
                            addImages(event.target.files)
                            event.target.value = ""
                        }} />
                        <p className="text-xs text-muted-foreground">Choose one image as the main thumbnail. Existing images are kept unless removed.</p>
                        {images.map((image, index) => {
                            const label = image.file?.name ?? image.filename
                            return <div key={image.id} className="flex min-w-0 items-center gap-2 text-sm">
                                <input type="radio" name={`edit-main-image-${kind}`} aria-label={`Use ${label} as the main thumbnail`} checked={mainImageId === image.id} onChange={() => setMainImageId(image.id)} />
                                <span className="min-w-0 flex-1 truncate">{label}</span>
                                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${label}`} onClick={() => {
                                    const remaining = images.filter((item) => item.id !== image.id)
                                    setImages(remaining)
                                    if (mainImageId === image.id) setMainImageId(remaining[0]?.id ?? "")
                                }}><Trash2 /></Button>
                                {index === 0 && <span className="sr-only">First image</span>}
                            </div>
                        })}
                    </fieldset>
                    <label className="flex flex-col gap-1.5 text-sm font-medium">
                        {kind === "coop" ? "ZIP" : "BPS"} replacement (up to 30 MB)
                        <Input type="file" accept={kind === "coop" ? ".zip,application/zip" : ".bps,application/octet-stream"} onChange={(event) => setDownloadFile(event.target.files?.[0] ?? null)} />
                        <span className="text-xs font-normal text-muted-foreground">Current file: {kind === "coop" ? (hack as CoopHack).zip : (hack as Hack).bps}{downloadFile ? ` · Replacement: ${downloadFile.name}` : " · Leave empty to keep it"}</span>
                    </label>
                    <fieldset className="flex flex-col gap-2">
                        <legend className="text-sm font-medium">Videos (up to 3 YouTube links)</legend>
                        {videos.map((video, index) => <div key={index} className="flex items-center gap-2">
                            <Input type="url" placeholder="https://www.youtube.com/watch?v=..." value={video} onChange={(event) => setVideos((current) => current.map((item, i) => i === index ? event.target.value : item))} />
                            {videos.length > 1 && <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove video ${index + 1}`} onClick={() => setVideos((current) => current.filter((_, i) => i !== index))}><Trash2 /></Button>}
                        </div>)}
                        {videos.length < 3 && <Button type="button" variant="outline" className="self-start" onClick={() => setVideos((current) => [...current, ""])}><Plus />Add video</Button>}
                    </fieldset>
                    <p className="text-xs text-muted-foreground">The hack name stays the same so its storage folder remains valid.</p>
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button></DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    </>
}
