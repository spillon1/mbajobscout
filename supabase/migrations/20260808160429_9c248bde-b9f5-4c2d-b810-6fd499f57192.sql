select cron.schedule(
  'enrich-job-descriptions',
  '*/10 * * * *',
  $$
  select net.http_post(
    url:='https://ojtredjreiajjrgcwcuy.supabase.co/functions/v1/enrich-descriptions',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qdHJlZGpyZWlhampyZ2N3Y3V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzExMTcsImV4cCI6MjA4ODIwNzExN30.au5FIjdjtuTQkJJl9f9P5N_rx3RhLjFVSGJql3UyRIk"}'::jsonb,
    body:='{"limit": 120, "mode": "vc"}'::jsonb
  );
  $$
);