import type { HackSortOption } from "@/lib/hackSorting"
import { Button } from "@/components/ui/button"
import {
    Combobox,
    ComboboxContent,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "@/components/ui/combobox"
import { ArrowDown, ArrowUp } from "lucide-react"

type HackSortField = "name" | "creation" | "upload" | "difficulty" | "stars"

const sortOptions: { value: HackSortField; label: string }[] = [
    { value: "name", label: "Name" },
    { value: "creation", label: "Creation date" },
    { value: "upload", label: "Upload date" },
    { value: "difficulty", label: "Difficulty" },
    { value: "stars", label: "Star count" },
]

function isHackSortField(value: string): value is HackSortField {
    return sortOptions.some((option) => option.value === value)
}

export default function HackSortSelect({
    value,
    onChange,
}: {
    value: HackSortOption
    onChange: (value: HackSortOption) => void
}) {
    const [field, direction] = value.split("-") as [HackSortField, "asc" | "desc"]

    return (
        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
            <span className="text-xs font-medium text-muted-foreground">Sort by</span>
            <div className="flex gap-2">
                <Combobox
                    value={field}
                    onValueChange={(selected) => {
                        if (typeof selected === "string" && isHackSortField(selected)) {
                            onChange(`${selected}-${direction}` as HackSortOption)
                        }
                    }}
                    itemToStringLabel={(selected) => sortOptions.find((option) => option.value === selected)?.label ?? ""}
                >
                    <ComboboxInput aria-label="Sort hacks by" placeholder="Choose sorting..." className="h-10 w-full sm:min-w-56" />
                    <ComboboxContent>
                        <ComboboxList>
                            {sortOptions.map((option) => (
                                <ComboboxItem key={option.value} value={option.value}>{option.label}</ComboboxItem>
                            ))}
                        </ComboboxList>
                    </ComboboxContent>
                </Combobox>
                <Button
                    className="h-10"
                    type="button"
                    variant="outline"
                    aria-label={direction === "asc" ? "Sort ascending" : "Sort descending"}
                    title={direction === "asc" ? "Ascending" : "Descending"}
                    onClick={() => onChange(`${field}-${direction === "asc" ? "desc" : "asc"}` as HackSortOption)}
                >
                    {direction === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
                    {direction === "asc" ? "Ascending" : "Descending"}
                </Button>
            </div>
        </div>
    )
}
