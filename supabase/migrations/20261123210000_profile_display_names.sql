alter table public.profiles
    add column if not exists display_name text;

create or replace function public.update_my_display_name(p_display_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_name text := nullif(trim(p_display_name), '');
    v_affected integer;
begin
    if auth.uid() is null then raise exception 'Sign in to change your display name.'; end if;
    if v_name is null then raise exception 'Enter a display name.'; end if;
    if char_length(v_name) > 40 then raise exception 'Display names must be 40 characters or fewer.'; end if;

    update public.profiles p
    set display_name = v_name
    where p.user_id = (select auth.uid());
    get diagnostics v_affected = row_count;
    return v_affected > 0;
end
$$;

revoke all on function public.update_my_display_name(text) from public;
grant execute on function public.update_my_display_name(text) to authenticated;

create or replace function public.get_public_profile_display_name(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(nullif(trim(p.display_name), ''), p.username)
    from public.profiles p
    where lower(p.username) = lower(trim(p_username))
    limit 1
$$;

revoke all on function public.get_public_profile_display_name(text) from public;
grant execute on function public.get_public_profile_display_name(text) to anon, authenticated;

create or replace function public.resolve_profile_display_names(p_usernames text[])
returns table (username text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
    select p.username, coalesce(nullif(trim(p.display_name), ''), p.username)
    from public.profiles p
    join unnest(coalesce(p_usernames, array[]::text[])) requested(name)
      on lower(p.username) = lower(trim(requested.name))
$$;

revoke all on function public.resolve_profile_display_names(text[]) from public;
grant execute on function public.resolve_profile_display_names(text[]) to anon, authenticated;

create or replace function public.get_visible_user_directory_with_display_name(
    p_offset integer default 0,
    p_limit integer default 1000
)
returns table (
    user_id uuid,
    username text,
    display_name text,
    avatar_url text,
    xp integer,
    coop_xp integer,
    private_xp boolean,
    private_progress boolean,
    private_profile boolean,
    role smallint
)
language sql
stable
security definer
set search_path = ''
as $$
    select p.user_id,
           p.username,
           coalesce(nullif(trim(p.display_name), ''), p.username),
           p.avatar_url,
           coalesce(p.xp, 0)::integer,
           coalesce(p.coop_xp, 0)::integer,
           coalesce(p.private_xp, false),
           coalesce(p.private_progress, false),
           coalesce(p.private_profile, false),
           p.role::smallint
    from public.profiles p
    where p.private_profile is not true
      and p.user_id is not null
    order by lower(coalesce(nullif(trim(p.display_name), ''), p.username)), p.user_id
    limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.get_visible_user_directory_with_display_name(integer, integer) from public;
grant execute on function public.get_visible_user_directory_with_display_name(integer, integer) to authenticated;
