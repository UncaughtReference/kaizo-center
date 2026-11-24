create or replace function public.get_public_profile_metadata(
    p_offset integer default 0,
    p_limit integer default 1000
)
returns table (
    username text,
    display_name text,
    avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
    select p.username,
           coalesce(nullif(trim(p.display_name), ''), p.username),
           p.avatar_url
    from public.profiles p
    where p.private_profile is not true
      and p.user_id is not null
    order by lower(coalesce(nullif(trim(p.display_name), ''), p.username)), p.user_id
    limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.get_public_profile_metadata(integer, integer) from public;
grant execute on function public.get_public_profile_metadata(integer, integer) to anon, authenticated;

notify pgrst, 'reload schema';
