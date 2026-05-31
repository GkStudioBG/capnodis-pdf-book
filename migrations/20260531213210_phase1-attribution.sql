-- Phase 1: attribution join (source -> sale), bot filtering, unique visitors
-- All additive. Safe to re-run (IF NOT EXISTS everywhere).

-- orders: attribution snapshot taken at the moment of purchase
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS visitor_id   text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_source   text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_medium   text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_content  text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_term     text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fbclid       text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referrer     text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS landing_time timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_visitor_id   ON public.orders(visitor_id);
CREATE INDEX IF NOT EXISTS idx_orders_utm_source   ON public.orders(utm_source);
CREATE INDEX IF NOT EXISTS idx_orders_utm_campaign ON public.orders(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_orders_utm_content  ON public.orders(utm_content);

-- visits: stable visitor identity, per-session id, and server-side bot flag
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS visitor_id text;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS is_bot     boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_visits_visitor_id ON public.visits(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visits_created_at ON public.visits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_is_bot     ON public.visits(is_bot);
