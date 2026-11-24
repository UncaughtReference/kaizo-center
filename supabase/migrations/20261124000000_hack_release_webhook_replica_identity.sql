-- Include the previous row values in UPDATE Database Webhook payloads so the
-- notify-hack-uploads function can distinguish approvals from edits to public hacks.
ALTER TABLE public.hacks REPLICA IDENTITY FULL;
ALTER TABLE public.coop_hacks REPLICA IDENTITY FULL;
