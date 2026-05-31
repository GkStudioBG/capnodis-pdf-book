CREATE TABLE IF NOT EXISTS public.visits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page         text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  fbclid       text,
  referrer     text,
  user_agent   text,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits NO FORCE ROW LEVEL SECURITY;
