CREATE TABLE public.job_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_url text NOT NULL,
  job_title text NOT NULL,
  job_company text NOT NULL,
  job_source text NOT NULL DEFAULT '',
  action text NOT NULL CHECK (action IN ('applied', 'not_interested')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (job_url, action)
);

ALTER TABLE public.job_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read job actions" ON public.job_actions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert job actions" ON public.job_actions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete job actions" ON public.job_actions FOR DELETE USING (true);