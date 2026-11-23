alter table public.profiles
    add column if not exists private_profile boolean not null default false;

create or replace function public.update_profile_privacy(
    p_private_xp boolean,
    p_private_progress boolean,
    p_private_profile boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_affected integer;
begin
    if auth.uid() is null then
        raise exception 'Sign in to update your privacy settings.';
    end if;
    update public.profiles p
    set private_xp = p_private_xp,
        private_progress = p_private_progress,
        private_profile = p_private_profile
    where p.user_id = (select auth.uid());
    get diagnostics v_affected = row_count;
    return v_affected > 0;
end
$$;

revoke all on function public.update_profile_privacy(boolean, boolean, boolean) from public;
grant execute on function public.update_profile_privacy(boolean, boolean, boolean) to authenticated;

create or replace function public.get_visible_user_directory(
    p_offset integer default 0,
    p_limit integer default 1000
)
returns table (
    user_id uuid,
    username text,
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
    order by lower(p.username), p.user_id
    limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.get_visible_user_directory(integer, integer) from public;
grant execute on function public.get_visible_user_directory(integer, integer) to authenticated;
