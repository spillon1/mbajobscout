
CREATE OR REPLACE FUNCTION public.preserve_alerted_flag()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.alerted = true THEN
    NEW.alerted = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER preserve_alerted
BEFORE UPDATE ON public.scraped_jobs
FOR EACH ROW
EXECUTE FUNCTION public.preserve_alerted_flag();
