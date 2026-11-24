create or replace function public.notify_hack_authors_of_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_authors jsonb;
    v_reviewer_name text;
    v_author_name text;
begin
    if new.hack_kind = 'coop' then
        select to_jsonb(hack.authors) into v_authors
        from public.coop_hacks hack
        where hack.name = new.hack_name;
    else
        select to_jsonb(hack.authors) into v_authors
        from public.hacks hack
        where hack.name = new.hack_name;
    end if;
    if v_authors is null then return new; end if;

    select coalesce(nullif(trim(profile.display_name), ''), profile.username)
    into v_reviewer_name
    from public.profiles profile
    where profile.user_id = new.user_id;
    v_reviewer_name := coalesce(v_reviewer_name, 'A user');

    for v_author_name in
        select distinct trim(author->>'name')
        from jsonb_array_elements(
            case
                when jsonb_typeof(v_authors) = 'array' then v_authors
                when jsonb_typeof(v_authors) = 'object' and jsonb_typeof(v_authors->'authors') = 'array' then v_authors->'authors'
                when jsonb_typeof(v_authors) = 'object' and v_authors ? 'author' then
                    case when jsonb_typeof(v_authors->'author') = 'array' then v_authors->'author' else jsonb_build_array(v_authors->'author') end
                when jsonb_typeof(v_authors) = 'object' and v_authors ? 'name' then jsonb_build_array(v_authors)
                else '[]'::jsonb
            end
        ) author
        where trim(coalesce(author->>'name', '')) <> ''
    loop
        insert into public.notifications (user_id, kind, hack_kind, item_name, title, message)
        select profile.user_id,
               case when new.hack_kind = 'coop' then 'coop_hack' else 'hack' end,
               new.hack_kind,
               new.hack_name,
               'New review on your hack',
               v_reviewer_name || ' left a review for ' || new.hack_name
        from public.profiles profile
        where lower(trim(profile.username)) = lower(v_author_name)
          and profile.user_id <> new.user_id;
    end loop;

    return new;
end
$$;

revoke all on function public.notify_hack_authors_of_review() from public, anon, authenticated;

create trigger reviews_notify_hack_authors
after insert on public.reviews
for each row execute function public.notify_hack_authors_of_review();
