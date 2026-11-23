create or replace function public.author_has_hack_permission(
    p_authors jsonb,
    p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(public.current_profile_role() = 2, false) or exists (
        select 1
        from public.profiles p
        cross join lateral jsonb_array_elements(
            case
                when jsonb_typeof(p_authors) = 'array' then p_authors
                when jsonb_typeof(p_authors) = 'object' and jsonb_typeof(p_authors->'authors') = 'array' then p_authors->'authors'
                when jsonb_typeof(p_authors) = 'object' and p_authors ? 'author' then
                    case when jsonb_typeof(p_authors->'author') = 'array' then p_authors->'author' else jsonb_build_array(p_authors->'author') end
                when jsonb_typeof(p_authors) = 'object' and p_authors ? 'name' then jsonb_build_array(p_authors)
                else '[]'::jsonb
            end
        ) author
        where p.user_id = (select auth.uid())
          and lower(trim(coalesce(author->>'name', ''))) = lower(trim(p.username))
          and coalesce((author->>p_permission)::boolean, false)
    )
$$;

revoke all on function public.author_has_hack_permission(jsonb, text) from public;
