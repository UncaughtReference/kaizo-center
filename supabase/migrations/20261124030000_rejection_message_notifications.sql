-- Store the authenticated submitter for hack rows so rejection notifications
-- can be sent to the uploader rather than guessed from the author list.
ALTER TABLE public.hacks
    ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.coop_hacks
    ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS hacks_submitted_by_idx ON public.hacks (submitted_by);
CREATE INDEX IF NOT EXISTS coop_hacks_submitted_by_idx ON public.coop_hacks (submitted_by);

-- Replace the old four-argument function with a five-argument function whose
-- optional message parameter preserves calls that omit the rejection note.
DROP FUNCTION IF EXISTS public.moderate_hack(text, bigint, text, smallint);
CREATE FUNCTION public.moderate_hack(
    p_kind text,
    p_id bigint,
    p_name text,
    p_status smallint,
    p_rejection_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_affected integer;
    v_old_status smallint;
    v_submitter_id uuid;
    v_item_name text;
    v_note text;
BEGIN
    IF public.current_profile_role() IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION 'Moderator access is required.';
    END IF;
    IF p_status NOT IN (0, 2) THEN
        RAISE EXCEPTION 'Only approved or rejected status values are allowed.';
    END IF;

    IF p_kind = 'hack' THEN
        SELECT h.status, h.submitted_by, h.name
        INTO v_old_status, v_submitter_id, v_item_name
        FROM public.hacks AS h
        WHERE h.id = p_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RETURN false;
        END IF;
        UPDATE public.hacks AS h
        SET status = p_status
        WHERE h.id = p_id;
    ELSIF p_kind = 'coop' THEN
        SELECT h.status, h.submitted_by, h.name
        INTO v_old_status, v_submitter_id, v_item_name
        FROM public.coop_hacks AS h
        WHERE h.name = p_name
        FOR UPDATE;
        IF NOT FOUND THEN
            RETURN false;
        END IF;
        UPDATE public.coop_hacks AS h
        SET status = p_status
        WHERE h.name = p_name;
    ELSE
        RAISE EXCEPTION 'Invalid hack type.';
    END IF;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected = 0 THEN
        RETURN false;
    END IF;

    IF p_status = 2 AND v_old_status IS DISTINCT FROM 2 AND v_submitter_id IS NOT NULL THEN
        v_note := left(btrim(coalesce(p_rejection_message, '')), 2000);
        INSERT INTO public.notifications (user_id, kind, item_name, title, message, hack_kind)
        VALUES (
            v_submitter_id,
            CASE WHEN p_kind = 'coop' THEN 'coop_hack' ELSE 'hack' END,
            v_item_name,
            CASE WHEN p_kind = 'coop' THEN 'Co-op hack rejected' ELSE 'Hack rejected' END,
            CASE WHEN v_note = ''
                THEN format('Your submission "%s" was rejected.', v_item_name)
                ELSE format('Your submission "%s" was rejected: %s', v_item_name, v_note)
            END,
            p_kind
        );
    END IF;

    RETURN true;
END;
$function$;

DROP FUNCTION IF EXISTS public.moderate_progress(bigint, smallint);
CREATE FUNCTION public.moderate_progress(
    p_progress_id bigint,
    p_status smallint,
    p_rejection_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_affected integer;
    v_old_status smallint;
    v_discord_id bigint;
    v_submitter_id uuid;
    v_item_name text;
    v_hack_kind text;
    v_note text;
BEGIN
    IF public.current_profile_role() IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION 'Moderator access is required.';
    END IF;
    IF p_status NOT IN (0, 2) THEN
        RAISE EXCEPTION 'Only approved or rejected status values are allowed.';
    END IF;

    SELECT p.status, p.user_discord_id, p.hack_name, p.hack_kind
    INTO v_old_status, v_discord_id, v_item_name, v_hack_kind
    FROM public.progress AS p
    WHERE p.id = p_progress_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    UPDATE public.progress AS p
    SET status = p_status
    WHERE p.id = p_progress_id;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected = 0 THEN
        RETURN false;
    END IF;

    IF p_status = 2 AND v_old_status IS DISTINCT FROM 2 THEN
        SELECT pr.user_id INTO v_submitter_id
        FROM public.profiles AS pr
        WHERE pr.discord_id = v_discord_id
        LIMIT 1;

        IF v_submitter_id IS NOT NULL THEN
            v_note := left(btrim(coalesce(p_rejection_message, '')), 2000);
            INSERT INTO public.notifications (user_id, kind, item_name, title, message, hack_kind)
            VALUES (
                v_submitter_id,
                'progress',
                v_item_name,
                'Progress submission rejected',
                CASE WHEN v_note = ''
                    THEN format('Your progress submission for "%s" was rejected.', v_item_name)
                    ELSE format('Your progress submission for "%s" was rejected: %s', v_item_name, v_note)
                END,
                v_hack_kind
            );
        END IF;
    END IF;

    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.moderate_hack(text, bigint, text, smallint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.moderate_progress(bigint, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_hack(text, bigint, text, smallint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_progress(bigint, smallint, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
