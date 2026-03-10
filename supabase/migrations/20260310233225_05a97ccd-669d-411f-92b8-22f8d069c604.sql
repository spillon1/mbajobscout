
ALTER TABLE public.job_actions ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Anyone can delete job actions" ON public.job_actions;
DROP POLICY IF EXISTS "Anyone can insert job actions" ON public.job_actions;
DROP POLICY IF EXISTS "Anyone can read job actions" ON public.job_actions;

CREATE POLICY "Users can read own job actions"
  ON public.job_actions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own job actions"
  ON public.job_actions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own job actions"
  ON public.job_actions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.job_actions DROP CONSTRAINT IF EXISTS job_actions_job_url_action_key;
CREATE UNIQUE INDEX job_actions_user_url_action_idx ON public.job_actions (user_id, job_url, action);
