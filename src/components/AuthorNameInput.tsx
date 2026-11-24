import { useId } from "react"
import { Input } from "@/components/ui/input"
import type { VisibleSiteUser } from "@/lib/userDirectory"

export default function AuthorNameInput({
    value,
    onChange,
    users,
    required = false,
    disabled = false,
}: {
    value: string
    onChange: (value: string) => void
    users: VisibleSiteUser[]
    required?: boolean
    disabled?: boolean
}) {
    const id = useId()
    const listId = `site-author-suggestions-${id}`

    return <>
        <Input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            list={listId}
            placeholder="Type a name or search site users..."
            maxLength={100}
            required={required}
            disabled={disabled}
        />
        <datalist id={listId}>
            {users.map((user) => <option key={user.username} value={user.username} label={user.display_name} />)}
        </datalist>
    </>
}
