import { Progress } from "@/components/ui/progress"

const sublevelsPerTier = 5
const xpTiers = [
    { min: 0, max: 1_000 },
    { min: 1_000, max: 3_000 },
    { min: 3_000, max: 8_000 },
    { min: 8_000, max: 15_000 },
    { min: 15_000, max: 25_000 },
    { min: 25_000, max: 40_000 },
    { min: 40_000, max: Number.POSITIVE_INFINITY },
]

export default function XpProgress({ xp }: { xp: number }) {
    const totalXp = Math.max(0, Math.floor(xp || 0))
    const tierIndex = xpTiers.findLastIndex((tier) => totalXp >= tier.min)
    const tier = xpTiers[Math.max(tierIndex, 0)]
    const isTopTier = !Number.isFinite(tier.max)

    let sublevelIndex = 4
    let progressPercent = 100
    let nextThreshold: number | null = null

    if (!isTopTier) {
        const sublevelSize = (tier.max - tier.min) / sublevelsPerTier
        sublevelIndex = Math.min(4, Math.floor((totalXp - tier.min) / sublevelSize))
        const currentSublevelStart = tier.min + sublevelIndex * sublevelSize
        nextThreshold = Math.round(tier.min + (sublevelIndex + 1) * sublevelSize)
        progressPercent = Math.min(100, Math.max(0, ((totalXp - currentSublevelStart) / sublevelSize) * 100))
    }
    const levelNumber = Math.max(0, tierIndex) * sublevelsPerTier + sublevelIndex + 1

    return (
        <div className="flex w-full max-w-md flex-col gap-2" aria-label="Experience level">
            <div className="flex items-center gap-3">
                <p className="shrink-0 text-sm font-semibold text-foreground">Level {levelNumber}</p>
                <Progress value={progressPercent} className="xp-progress min-w-0 flex-1" aria-label={`${progressPercent.toFixed(0)} percent to next level`} />
            </div>
            <div className="flex items-baseline justify-between gap-3 text-xs tabular-nums text-muted-foreground">
                <span>{totalXp.toLocaleString()} XP</span>
                <span>{nextThreshold === null ? "Max level" : `${Math.max(0, nextThreshold - totalXp).toLocaleString()} XP to next level`}</span>
            </div>
        </div>
    )
}
