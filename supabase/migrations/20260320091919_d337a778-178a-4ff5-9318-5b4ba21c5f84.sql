DELETE FROM scraped_jobs WHERE mode = 'vc' AND (
  title ILIKE '%investment banking%'
  OR title ILIKE '%investment bank %'
);