-- Remove FORCE RLS — it blocks admin/service-role queries from edge functions.
-- ENABLE RLS alone is enough: anon key gets no access (deny by default, no policies).
-- Admin API key retains full access via service role bypass.

ALTER TABLE public.orders NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.download_tokens NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contacts NO FORCE ROW LEVEL SECURITY;
