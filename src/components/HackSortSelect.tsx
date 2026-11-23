import type { HackSortOption } from "@/lib/hackSorting"
import {
    Combobox,
    ComboboxContent,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "@/components/ui/combobox"

const sortOptions: { value: HackSortOption; label: string }[] = [
    { value: "name-asc", label: "Name (A to Z)" },
    { value: "name-desc", label: "Name (Z to A)" },
    { value: "creation-desc", label: "Creation date (newest)" },
    { value: "creation-asc", label: "Creation date (oldest)" },
    { value: "upload-desc", label: "Upload date (newest)" },
    { value: "upload-asc", label: "Upload date (oldest)" },
    { value: "difficulty-asc", label: "Difficulty (easiest)" },
    { value: "difficulty-desc", label: "Difficulty (hardest)" },
    { value: "stars-desc", label: "Star count (most)" },
    { value: "stars-asc", label: "Star count (fewest)" },
]

export default function HackSortSelect({
    value,
    onChange,
}: {
    value: HackSortOption
    onChange: (value: HackSortOption) => void
}) {
    return (
        <label className="flex w-full flex-col gap-1.5 sm:w-auto">
            <span className="text-xs font-medium text-muted-foreground">Sort by</span>
            <Combobox
                value={value}
                onValueChange={(selected) => {
                    if (typeof selected === "string" && sortOptions.some((option) => option.value === selected)) {
                        onChange(selected as HackSortOption)
                    }
                }}
                itemToStringLabel={(selected) => sortOptions.find((option) => option.value === selected)?.label ?? ""}
            >
                <ComboboxInput aria-label="Sort hacks" placeholder="Choose sorting..." className="h-10 w-full sm:min-w-56" />
                <ComboboxContent>
                    <ComboboxList>
                        {sortOptions.map((option) => (
                            <ComboboxItem key={option.value} value={option.value}>{option.label}</ComboboxItem>
                        ))}
                    </ComboboxList>
                </ComboboxContent>
            </Combobox>
        </label>
    )
}
