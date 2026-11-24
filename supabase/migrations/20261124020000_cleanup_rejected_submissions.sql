-- Record when a submission is rejected so cleanup uses the rejection time,
-- rather than the original submission time.
ALTER TABLE public.hacks
    ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE public.coop_hacks
    ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE public.progress
    ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

-- Give already-rejected rows a five-day grace period from this migration.
UPDATE public.hacks SET rejected_at = now() WHERE status = 2 AND rejected_at IS NULL;
UPDATE public.coop_hacks SET rejected_at = now() WHERE status = 2 AND rejected_at IS NULL;
UPDATE public.progress SET rejected_at = now() WHERE status = 2 AND rejected_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_rejected_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 2 THEN
            NEW.rejected_at := now();
        ELSE
            NEW.rejected_at := NULL;
        END IF;
    ELSIF NEW.status = 2 THEN
        IF OLD.status IS DISTINCT FROM 2 OR NEW.rejected_at IS NULL THEN
            NEW.rejected_at := now();
        END IF;
    ELSE
        NEW.rejected_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hacks_set_rejected_at ON public.hacks;
CREATE TRIGGER hacks_set_rejected_at
    BEFORE INSERT OR UPDATE OF status ON public.hacks
    FOR EACH ROW EXECUTE FUNCTION public.set_rejected_at();

DROP TRIGGER IF EXISTS coop_hacks_set_rejected_at ON public.coop_hacks;
CREATE TRIGGER coop_hacks_set_rejected_at
    BEFORE INSERT OR UPDATE OF status ON public.coop_hacks
    FOR EACH ROW EXECUTE FUNCTION public.set_rejected_at();

DROP TRIGGER IF EXISTS progress_set_rejected_at ON public.progress;
CREATE TRIGGER progress_set_rejected_at
    BEFORE INSERT OR UPDATE OF status ON public.progress
    FOR EACH ROW EXECUTE FUNCTION public.set_rejected_at();

CREATE INDEX IF NOT EXISTS hacks_rejected_at_idx
    ON public.hacks (rejected_at) WHERE status = 2;
CREATE INDEX IF NOT EXISTS coop_hacks_rejected_at_idx
    ON public.coop_hacks (rejected_at) WHERE status = 2;
CREATE INDEX IF NOT EXISTS progress_rejected_at_idx
    ON public.progress (rejected_at) WHERE status = 2;
