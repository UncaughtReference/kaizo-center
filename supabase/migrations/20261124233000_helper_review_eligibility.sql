create or replace function public.can_review_hack(p_user_id uuid, p_hack_name text, p_hack_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_role smallint;
    v_star_total integer;
    v_offset integer := 0;
    v_page_count integer;
    v_progress record;
begin
    if auth.uid() is null or p_user_id <> (select auth.uid()) or p_hack_kind not in ('hack', 'coop') then
        return false;
    end if;
    select profile.role into v_role from public.profiles profile where profile.user_id = p_user_id;
    if not found or v_role = 3 then return false; end if;

    if p_hack_kind = 'coop' then
        select hack.star_count into v_star_total from public.coop_hacks hack where hack.name = p_hack_name;
    else
        select hack.star_count into v_star_total from public.hacks hack where hack.name = p_hack_name;
    end if;
    if not found or v_star_total is null then return false; end if;

    loop
        v_page_count := 0;
        for v_progress in select * from public.get_my_progress(v_offset, 1000) loop
            v_page_count := v_page_count + 1;
            if v_progress.hack_name = p_hack_name
                and v_progress.hack_kind = p_hack_kind
                and (not coalesce(v_progress.is_helper, false) or p_hack_kind = 'coop')
                and v_progress.star_count::numeric >= v_star_total::numeric * 0.5 then
                return true;
            end if;
        end loop;
        exit when v_page_count < 1000;
        v_offset := v_offset + 1000;
    end loop;
    return false;
end
$$;

revoke all on function public.can_review_hack(uuid, text, text) from public, anon, authenticated;
