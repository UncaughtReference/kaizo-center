export type CoopHack = {
    upload_date: string,
    creation_date: string,
    name: string,
    authors: {
        name: string,
        allow_edit: boolean,
        allow_delete: boolean,
    }[],
    difficulty: number,
    star_count: number,
    completion_bonus: number | null,
    status: 0 | 1 | 2,
    images: { main: string, images?: string[] },
    zip: string,
    videos: { videos: string[] } | null,
}
