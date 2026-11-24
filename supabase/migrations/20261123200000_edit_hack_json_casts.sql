create or replace function public.edit_authored_hack(
    p_kind text,
    p_id bigint,
    p_name text,
    p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_hack jsonb;
begin
    if auth.uid() is null then raise exception 'Sign in to edit this hack.'; end if;
    if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid hack data.'; end if;
    if p_data ?| array['id', 'name', 'status', 'upload_date', 'completion_bonus'] then
        raise exception 'Those hack fields cannot be changed here.';
    end if;
    if p_kind not in ('hack', 'coop') then raise exception 'Invalid hack type.'; end if;
    if p_kind = 'hack' and p_data ? 'zip' then raise exception 'A regular hack uses a BPS file.'; end if;
    if p_kind = 'coop' and (p_data ? 'bps' or p_data ? 'description') then
        raise exception 'A co-op hack uses a ZIP file.';
    end if;

    if p_kind = 'hack' then
        select to_jsonb(h) into v_hack from public.hacks h where h.id = p_id for update;
    else
        select to_jsonb(h) into v_hack from public.coop_hacks h where h.name = p_name for update;
    end if;
    if v_hack is null then raise exception 'Hack not found.'; end if;
    if not public.author_has_hack_permission(v_hack->'authors', 'allow_edit') then
        raise exception 'Your author entry does not allow editing this hack.';
    end if;
    if p_data ? 'authors' and jsonb_typeof(p_data->'authors') is distinct from 'array' then
        raise exception 'Authors must be a list.';
    end if;
    if p_data ? 'images' and (
        jsonb_typeof(p_data->'images') is distinct from 'object'
        or jsonb_typeof(p_data->'images'->'images') is distinct from 'array'
        or jsonb_typeof(p_data->'images'->'main') is distinct from 'string'
    ) then
        raise exception 'Provide one to four images and a main thumbnail.';
    end if;
    if p_data ? 'images' and jsonb_array_length(p_data->'images'->'images') not between 1 and 4 then
        raise exception 'Provide one to four images and a main thumbnail.';
    end if;
    if p_data ? 'images' and not exists (
        select 1 from jsonb_array_elements_text(p_data->'images'->'images') as image_entry(filename)
        where image_entry.filename = p_data->'images'->>'main'
    ) then
        raise exception 'The main thumbnail must be included in the image list.';
    end if;

    if p_kind = 'hack' then
        update public.hacks h set
            authors = case when p_data ? 'authors' then (p_data->'authors')::json else h.authors end,
            description = case when p_data ? 'description' then p_data->>'description' else h.description end,
            difficulty = case when p_data ? 'difficulty' then (p_data->>'difficulty')::smallint else h.difficulty end,
            star_count = case when p_data ? 'star_count' then (p_data->>'star_count')::smallint else h.star_count end,
            creation_date = case when p_data ? 'creation_date' then (p_data->>'creation_date')::timestamptz else h.creation_date end,
            videos = case when p_data ? 'videos' then (p_data->'videos')::json else h.videos end,
            images = case when p_data ? 'images' then (p_data->'images')::json else h.images end,
            bps = case when p_data ? 'bps' then p_data->>'bps' else h.bps end
        where h.id = p_id returning to_jsonb(h) into v_hack;
    else
        update public.coop_hacks h set
            authors = case when p_data ? 'authors' then (p_data->'authors')::json else h.authors end,
            difficulty = case when p_data ? 'difficulty' then (p_data->>'difficulty')::smallint else h.difficulty end,
            star_count = case when p_data ? 'star_count' then (p_data->>'star_count')::smallint else h.star_count end,
            creation_date = case when p_data ? 'creation_date' then (p_data->>'creation_date')::timestamptz else h.creation_date end,
            videos = case when p_data ? 'videos' then (p_data->'videos')::json else h.videos end,
            images = case when p_data ? 'images' then (p_data->'images')::json else h.images end,
            zip = case when p_data ? 'zip' then p_data->>'zip' else h.zip end
        where h.name = p_name returning to_jsonb(h) into v_hack;
    end if;
    return v_hack;
end
$$;

revoke all on function public.edit_authored_hack(text, bigint, text, jsonb) from public;
grant execute on function public.edit_authored_hack(text, bigint, text, jsonb) to authenticated;
