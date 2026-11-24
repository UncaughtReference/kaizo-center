-- Add the profile moderation actions used by the Users page.
-- Only moderators may change roles, and each function only permits its
-- specific transition so other roles cannot be overwritten accidentally.

CREATE OR REPLACE FUNCTION public.unban_profile(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.profiles AS actor
        WHERE actor.user_id = auth.uid()
          AND actor.role = 2
    ) THEN
        RAISE EXCEPTION 'Only moderators can unban users.';
    END IF;

    UPDATE public.profiles
    SET role = 0
    WHERE user_id = p_user_id
      AND user_id <> auth.uid()
      AND role = 3;

    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_profile(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.profiles AS actor
        WHERE actor.user_id = auth.uid()
          AND actor.role = 2
    ) THEN
        RAISE EXCEPTION 'Only moderators can promote users.';
    END IF;

    UPDATE public.profiles
    SET role = 1
    WHERE user_id = p_user_id
      AND user_id <> auth.uid()
      AND role = 0;

    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.demote_profile(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.profiles AS actor
        WHERE actor.user_id = auth.uid()
          AND actor.role = 2
    ) THEN
        RAISE EXCEPTION 'Only moderators can demote users.';
    END IF;

    UPDATE public.profiles
    SET role = 0
    WHERE user_id = p_user_id
      AND user_id <> auth.uid()
      AND role = 1;

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.unban_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.promote_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.demote_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unban_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demote_profile(uuid) TO authenticated;
