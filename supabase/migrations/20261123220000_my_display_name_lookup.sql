create or replace function public.get_my_display_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(nullif(trim(p.display_name), ''), p.username)
    from public.profiles p
    where p.user_id = (select auth.uid())
    limit 1
$$;

revoke all on function public.get_my_display_name() from public;
grant execute on function public.get_my_display_name() to authenticated;

notify pgrst, 'reload schema';
