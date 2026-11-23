import { Badge } from "@/components/ui/badge"

export default function HackStatusBadge({ status }: { status: 0 | 1 | 2 }) {
    if (status === 0) {
        return <Badge className="border-transparent bg-emerald-700 text-white dark:bg-emerald-700">Approved</Badge>
    }

    if (status === 1) {
        return <Badge className="border-transparent bg-amber-600 text-white dark:bg-amber-600">Pending</Badge>
    }

    return <Badge variant="destructive">Rejected</Badge>
}
