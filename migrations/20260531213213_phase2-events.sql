-- Phase 2: persisted funnel events (view -> checkout -> purchase)
-- Additive. New table only.

CREATE TABLE IF NOT EXISTS public.events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_id   text,           -- optional client id (can later match Meta event_id)
  visitor_id text,
  session_id text,
  page       text,
  payload    jsonb,
  is_bot     boolean DEFAULT false,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_visitor_id ON public.events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_events_event_name ON public.events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON public.events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_is_bot     ON public.events(is_bot);

-- Same RLS posture as `visits`: enabled, not forced, no public policies ->
-- only the service-role edge functions (admin client) can read/write.
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events NO FORCE ROW LEVEL SECURITY;
