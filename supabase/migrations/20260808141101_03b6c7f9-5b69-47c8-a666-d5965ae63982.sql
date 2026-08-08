CREATE TABLE public.alert_checkpoints (
  alert_key text PRIMARY KEY,
  last_alerted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.alert_checkpoints TO service_role;
ALTER TABLE public.alert_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.alert_sent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL,
  dedupe_key text NOT NULL,
  job_title text NOT NULL,
  job_company text NOT NULL,
  job_url text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_key, dedupe_key)
);
GRANT ALL ON public.alert_sent_log TO service_role;
ALTER TABLE public.alert_sent_log ENABLE ROW LEVEL SECURITY;

INSERT INTO public.alert_checkpoints (alert_key, last_alerted_at) VALUES ('vc-growth-secondaries', now() - interval '7 days');