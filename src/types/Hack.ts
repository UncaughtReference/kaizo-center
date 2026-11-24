export type Hack = {
    id: number,
    upload_date: string,
    name: string,
    authors: {
        name: string,
        allow_edit: boolean,
        allow_delete: boolean,
    }[],
    description: string,
    difficulty: number,
    star_count: number,
    status: 0 | 1 | 2,
    completion_bonus: number | null,
    creation_date: string,
    images: { main: string, images?: string[] },
    bps: string,
    videos: { videos: string[] } | null,
}
