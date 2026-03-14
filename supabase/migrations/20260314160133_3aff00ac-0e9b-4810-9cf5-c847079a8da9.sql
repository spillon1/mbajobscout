DELETE FROM scraped_jobs WHERE mode = 'vc' AND (
  title ~* '\msales\s+trader' OR
  title ~* '\mderivatives' OR
  title ~* '\mtrader\M' OR
  title ~* '\mtrading\M' OR
  title ~* '\mficc\M' OR
  title ~* '\mrisk\s+manag' OR
  title ~* '\mmacro\s+strategist' OR
  title ~* '\mresearch\s+associate' OR
  title ~* '\mfixed\s+income' OR
  title ~* '\mrfp\s+writer' OR
  title ~* '\mcorporate\s+access' OR
  title ~* '\mclient\s+transition' OR
  title ~* '\mtrade\s+coordinator' OR
  title ~* '\mentrepreneur\s+in\s+residence' OR
  title ~* '\mfinancial\s+report' OR
  title ~* '\mfinancial\s+control' OR
  title ~* '\mfounders?\s+associate' OR
  title ~* '\mfutures\M'
);