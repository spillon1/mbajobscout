DELETE FROM scraped_jobs WHERE mode = 'vc' AND (
  title ~* '\binvestment\s+strategist\b' OR
  title ~* '\binvestment\s+trust\b' OR
  title ~* '\basset\s+manag' OR
  title ~* '\basset\s+(&|and)\s+wealth' OR
  title ~* '\bwealth\s+manag' OR
  title ~* '\bprivate\s+bank' OR
  title ~* '\bprivate\s+wealth' OR
  title ~* '\bhedge\s+fund\b' OR
  title ~* '\bportfolio\s+manag' OR
  title ~* '\bequity\s+research\b' OR
  title ~* '\bfixed\s+income\b' OR
  title ~* '\bpension\b' OR
  title ~* '\binsurance\b' OR
  title ~* '\bfund\s+of\s+hedge' OR
  title ~* '\bfund\s+accounting\b' OR
  title ~* '\bfund\s+product\b'
)