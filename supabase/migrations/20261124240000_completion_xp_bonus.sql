alter table public.hacks alter column completion_bonus drop not null;
alter table public.coop_hacks add column if not exists completion_bonus integer;

create or replace function public.protect_completion_bonus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        new.completion_bonus := null;
    elsif new.completion_bonus is distinct from old.completion_bonus
        and (auth.uid() is null or coalesce(public.current_profile_role(), 0) <> 2) then
        raise exception 'Only moderators can edit the completion XP bonus.';
    end if;
    return new;
end
$$;

revoke all on function public.protect_completion_bonus() from public, anon, authenticated;
create trigger hacks_protect_completion_bonus
before insert or update of completion_bonus on public.hacks
for each row execute function public.protect_completion_bonus();
create trigger coop_hacks_protect_completion_bonus
before insert or update of completion_bonus on public.coop_hacks
for each row execute function public.protect_completion_bonus();

create or replace function public.set_completion_bonus(p_kind text, p_name text, p_bonus integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_affected integer;
begin
    if auth.uid() is null or coalesce(public.current_profile_role(), 0) <> 2 then
        raise exception 'Only moderators can edit the completion XP bonus.';
    end if;
    if p_bonus is not null and p_bonus < 0 then
        raise exception 'The completion XP bonus cannot be negative.';
    end if;
    if p_kind = 'hack' then
        update public.hacks set completion_bonus = p_bonus where name = p_name;
    elsif p_kind = 'coop' then
        update public.coop_hacks set completion_bonus = p_bonus where name = p_name;
    else
        raise exception 'Invalid hack type.';
    end if;
    get diagnostics v_affected = row_count;
    return v_affected > 0;
end
$$;

revoke all on function public.set_completion_bonus(text, text, integer) from public, anon;
grant execute on function public.set_completion_bonus(text, text, integer) to authenticated;

create table public.completion_bonus_awards (
    progress_id bigint not null references public.progress(id) on delete cascade,
    user_id uuid not null references public.profiles(user_id) on delete cascade,
    amount integer not null check (amount > 0),
    created_at timestamptz not null default now(),
    primary key (progress_id, user_id)
);
alter table public.completion_bonus_awards enable row level security;
revoke all on public.completion_bonus_awards from anon, authenticated;

create table public.progress_completion_bonus_helpers (
    progress_id bigint not null references public.progress(id) on delete cascade,
    user_id uuid not null references public.profiles(user_id) on delete cascade,
    primary key (progress_id, user_id)
);
alter table public.progress_completion_bonus_helpers enable row level security;
revoke all on public.progress_completion_bonus_helpers from anon, authenticated;

create or replace function public.award_completion_bonus_to_user(p_progress_id bigint, p_user_id uuid, p_bonus integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_kind text;
    v_inserted integer;
begin
    if p_user_id is null or p_bonus is null or p_bonus <= 0 then return; end if;
    select hack_kind into v_kind from public.progress where id = p_progress_id;
    if not found then return; end if;

    insert into public.completion_bonus_awards (progress_id, user_id, amount)
    values (p_progress_id, p_user_id, p_bonus)
    on conflict (progress_id, user_id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then return; end if;

    if v_kind = 'coop' then
        update public.profiles set coop_xp = coalesce(coop_xp, 0) + p_bonus where user_id = p_user_id;
    else
        update public.profiles set xp = coalesce(xp, 0) + p_bonus where user_id = p_user_id;
    end if;
end
$$;

revoke all on function public.award_completion_bonus_to_user(bigint, uuid, integer) from public, anon, authenticated;

create or replace function public.record_progress_completion_helpers(p_progress_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_offset integer := 0;
    v_page_count integer;
    v_progress record;
    v_found boolean := false;
    v_helper_name text;
    v_helper_user_id uuid;
    v_star_total integer;
    v_bonus integer;
begin
    if auth.uid() is null or coalesce(public.current_profile_role(), 0) = 3 then
        raise exception 'A non-banned signed-in user is required.';
    end if;

    loop
        v_page_count := 0;
        for v_progress in select * from public.get_my_progress(v_offset, 1000) loop
            v_page_count := v_page_count + 1;
            if v_progress.id = p_progress_id
                and v_progress.hack_kind = 'coop'
                and not coalesce(v_progress.is_helper, false) then
                v_found := true;
                foreach v_helper_name in array coalesce(v_progress.helper_names, array[]::text[])
                loop
                    select profile.user_id into v_helper_user_id
                    from public.profiles profile
                    where lower(trim(profile.username)) = lower(trim(v_helper_name));
                    if v_helper_user_id is not null then
                        insert into public.progress_completion_bonus_helpers (progress_id, user_id)
                        values (p_progress_id, v_helper_user_id)
                        on conflict (progress_id, user_id) do nothing;
                        if v_progress.status = 0 then
                            select hack.star_count, hack.completion_bonus into v_star_total, v_bonus
                            from public.coop_hacks hack where hack.name = v_progress.hack_name;
                            if found and v_progress.star_count = v_star_total then
                                perform public.award_completion_bonus_to_user(p_progress_id, v_helper_user_id, v_bonus);
                            end if;
                        end if;
                    end if;
                end loop;
                exit;
            end if;
        end loop;
        exit when v_found or v_page_count < 1000;
        v_offset := v_offset + 1000;
    end loop;
    if not v_found then
        raise exception 'The co-op progress submission was not found for this user.';
    end if;
    return true;
end
$$;

revoke all on function public.record_progress_completion_helpers(bigint) from public, anon;
grant execute on function public.record_progress_completion_helpers(bigint) to authenticated;

create or replace function public.award_progress_completion_bonus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_star_total integer;
    v_bonus integer;
    v_submitter uuid;
    v_helper_user_id uuid;
begin
    if new.status <> 0 then return new; end if;

    if new.hack_kind = 'coop' then
        select hack.star_count, hack.completion_bonus into v_star_total, v_bonus
        from public.coop_hacks hack where hack.name = new.hack_name;
    else
        select hack.star_count, hack.completion_bonus into v_star_total, v_bonus
        from public.hacks hack where hack.name = new.hack_name;
    end if;
    if not found or v_bonus is null or v_bonus <= 0 or new.star_count <> v_star_total then return new; end if;

    select profile.user_id into v_submitter
    from public.profiles profile
    where profile.discord_id = new.user_discord_id;
    perform public.award_completion_bonus_to_user(new.id, v_submitter, v_bonus);

    if new.hack_kind <> 'coop' then return new; end if;

    for v_helper_user_id in
        select helper.user_id from public.progress_completion_bonus_helpers helper where helper.progress_id = new.id
    loop
        perform public.award_completion_bonus_to_user(new.id, v_helper_user_id, v_bonus);
    end loop;

    return new;
end
$$;

revoke all on function public.award_progress_completion_bonus() from public, anon, authenticated;
create trigger progress_award_completion_bonus
after insert or update of status, star_count on public.progress
for each row execute function public.award_progress_completion_bonus();
