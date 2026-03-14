DELETE FROM scraped_jobs WHERE mode = 'vc' AND (
  title ~* '\btechnical\s+business\s+analyst\b' OR
  title ~* '\bbusiness\s+analyst\b' OR
  title ~* 'macro\s*data' OR
  title ~* '\bresearch\s+sales\b' OR
  title ~* '\bassociate\s+general\s+counsel\b' OR
  title ~* '\bgrant\s+writer\b' OR
  title ~* '\bmember\s+of\s+technical\s+staff\b' OR
  title ~* '\bwriter\b' OR
  title ~* '\bpre[\s\-]?training\b'
);