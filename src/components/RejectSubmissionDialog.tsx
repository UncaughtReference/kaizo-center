import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

export default function RejectSubmissionDialog({
    itemType,
    itemName,
    disabled,
    onReject,
}: {
    itemType: string
    itemName: string
    disabled: boolean
    onReject: (message: string) => Promise<boolean>
}) {
    const [open, setOpen] = useState(false)
    const [message, setMessage] = useState("")
    const [submitting, setSubmitting] = useState(false)

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setSubmitting(true)
        try {
            if (await onReject(message.trim())) {
                setOpen(false)
                setMessage("")
            }
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!submitting) setOpen(nextOpen) }}>
            <DialogTrigger render={<Button className="flex-1 sm:flex-none" variant="destructive" disabled={disabled} />}>
                Reject
            </DialogTrigger>
            <DialogContent>
                <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
                    <DialogHeader>
                        <DialogTitle>Reject {itemType}</DialogTitle>
                        <DialogDescription>
                            Add an optional message for the submitter about “{itemName}”. It will be included in their notification.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        aria-label="Message to submitter"
                        placeholder="Add a message (optional)..."
                        maxLength={2000}
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        disabled={submitting}
                    />
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={submitting} onClick={() => setOpen(false)}>Cancel</Button>
                        <Button type="submit" variant="destructive" disabled={submitting}>
                            {submitting ? "Rejecting..." : "Reject submission"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
