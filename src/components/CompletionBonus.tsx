import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useProfile } from "@/contexts/ProfileContext"
import { supabase } from "@/lib/supabase"

export default function CompletionBonus({
    kind,
    hackName,
    bonus,
    onSaved,
}: {
    kind: "hack" | "coop"
    hackName: string
    bonus: number | null
    onSaved: (bonus: number | null) => void
}) {
    const { profile } = useProfile()
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState(bonus === null ? "" : String(bonus))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const isModerator = profile?.role === 2

    async function save() {
        const parsed = value.trim() === "" ? null : Number(value)
        if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0 || parsed > 2147483647)) {
            setError("Enter a non-negative whole number, or leave it blank for To Be Determined.")
            return
        }
        setSaving(true)
        setError(null)
        try {
            const { data, error: updateError } = await supabase.rpc("set_completion_bonus", {
                p_kind: kind,
                p_name: hackName,
                p_bonus: parsed,
            })
            if (updateError) throw updateError
            if (!data) throw new Error("The hack was not found or the bonus was not changed.")
            onSaved(parsed)
            setEditing(false)
        } catch (saveError) {
            setError(saveError && typeof saveError === "object" && "message" in saveError
                ? String(saveError.message)
                : "Could not update the completion XP bonus.")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-col items-start gap-2">
            <p><strong>Completion XP bonus:</strong> {bonus ?? "To Be Determined"}</p>
            {isModerator && !editing && <Button type="button" variant="outline" size="sm" onClick={() => {
                setValue(bonus === null ? "" : String(bonus))
                setError(null)
                setEditing(true)
            }}>Edit completion XP bonus</Button>}
            {isModerator && editing && <div className="flex flex-col items-start gap-2">
                <label htmlFor={`completion-bonus-${kind}`} className="text-sm font-medium">Completion XP bonus (blank means To Be Determined)</label>
                <Input id={`completion-bonus-${kind}`} type="number" min="0" step="1" value={value} onChange={(event) => setValue(event.target.value)} className="max-w-48" />
                <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save bonus"}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
                </div>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>}
        </div>
    )
}
