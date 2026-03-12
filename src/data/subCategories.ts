export type SubCategory = {
  value: string;
  label: string;
  patterns: RegExp[];
};

export type ScrapeMode = 'vc' | 'pe' | 'ib' | 'mc' | 'st' | 'im' | 'tech' | 'startups';

export const SUB_CATEGORIES: Record<ScrapeMode, SubCategory[]> = {
  vc: [
    { value: 'analyst-associate', label: 'Analyst / Associate', patterns: [/\b(analyst|associate)\b/i] },
    { value: 'principal-partner', label: 'Principal / Partner', patterns: [/\b(principal|partner|director|managing director|vp|vice president)\b/i] },
    { value: 'portfolio', label: 'Portfolio Support', patterns: [/\bportfolio\b/i, /\bvalue\s+creation\b/i, /\boperating\s+partner\b/i] },
    { value: 'investment', label: 'Investment Team', patterns: [/\binvestment\b/i, /\bdeal\b/i, /\borigination\b/i] },
  ],
  pe: [
    { value: 'buyout', label: 'Buyout', patterns: [/\bbuyout\b/i, /\blbo\b/i, /\bleveraged\b/i] },
    { value: 'growth', label: 'Growth Equity', patterns: [/\bgrowth\b/i, /\bgrowth\s+equity\b/i] },
    { value: 'credit', label: 'Credit / Debt', patterns: [/\bcredit\b/i, /\bdebt\b/i, /\bprivate\s+credit\b/i, /\bmezzanine\b/i] },
    { value: 'analyst-associate', label: 'Analyst / Associate', patterns: [/\b(analyst|associate)\b/i] },
    { value: 'vp-director', label: 'VP / Director', patterns: [/\b(vp|vice\s+president|director|principal|partner)\b/i] },
  ],
  ib: [
    { value: 'ma', label: 'M&A', patterns: [/\bm&a\b/i, /\bmergers?\s*(and|&)\s*acquisitions?\b/i] },
    { value: 'ecm-dcm', label: 'ECM / DCM', patterns: [/\becm\b/i, /\bdcm\b/i, /\bcapital\s+markets\b/i, /\bequity\s+capital\b/i, /\bdebt\s+capital\b/i] },
    { value: 'levfin', label: 'Leveraged Finance', patterns: [/\blevfin\b/i, /\bleveraged\s+finance\b/i, /\bhigh\s+yield\b/i] },
    { value: 'corp-fin', label: 'Corporate Finance', patterns: [/\bcorporate\s+finance\b/i, /\badvisory\b/i] },
    { value: 'analyst-associate', label: 'Analyst / Associate', patterns: [/\b(analyst|associate)\b/i] },
  ],
  mc: [
    { value: 'strategy', label: 'Strategy', patterns: [/\bstrategy\b/i, /\bstrategic\b/i] },
    { value: 'operations', label: 'Operations', patterns: [/\boperations\b/i, /\boperational\b/i, /\bprocess\b/i] },
    { value: 'digital', label: 'Digital / Technology', patterns: [/\bdigital\b/i, /\btechnology\b/i, /\btransformation\b/i] },
    { value: 'implementation', label: 'Implementation', patterns: [/\bimplementation\b/i, /\bdelivery\b/i, /\bexecution\b/i] },
    { value: 'analyst-consultant', label: 'Analyst / Consultant', patterns: [/\b(analyst|consultant|associate)\b/i] },
  ],
  st: [
    { value: 'equity-sales', label: 'Equity Sales', patterns: [/\bequity\s+sales\b/i, /\bequities\b/i] },
    { value: 'ficc', label: 'FICC', patterns: [/\bficc\b/i, /\bfixed\s+income\b/i, /\brates\b/i, /\bcredit\s+trading\b/i] },
    { value: 'fx', label: 'FX', patterns: [/\bfx\b/i, /\bforeign\s+exchange\b/i, /\bcurrenc/i] },
    { value: 'derivatives', label: 'Derivatives', patterns: [/\bderivativ/i, /\boptions\b/i, /\bstructured\s+products\b/i] },
    { value: 'structuring', label: 'Structuring', patterns: [/\bstructur(er|ing)\b/i] },
  ],
  im: [
    { value: 'hedge-fund', label: 'Hedge Fund', patterns: [/\bhedge\s+fund\b/i, /\bhf\b/i] },
    { value: 'asset-mgmt', label: 'Asset Management', patterns: [/\basset\s+management\b/i, /\bfund\s+management\b/i] },
    { value: 'portfolio-mgmt', label: 'Portfolio Management', patterns: [/\bportfolio\s+manag/i, /\bfund\s+manag/i, /\bpm\b/i] },
    { value: 'research', label: 'Research / Analysis', patterns: [/\bresearch\b/i, /\bequity\s+research\b/i, /\binvestment\s+research\b/i] },
    { value: 'quant', label: 'Quantitative', patterns: [/\bquant/i, /\balgorithm/i, /\bsystematic\b/i] },
  ],
  tech: [
    { value: 'product', label: 'Product Management', patterns: [/\bproduct\s+(manager|management|lead|director|owner|head)\b/i, /\bpm\b/i] },
    { value: 'strategy-ops', label: 'Strategy & Operations', patterns: [/\bstrategy\s*((&|and)\s*)?operations\b/i, /\bstratops\b/i, /\bstrategy\b/i] },
    { value: 'corp-dev', label: 'Corporate Development', patterns: [/\bcorporate\s+development\b/i, /\bcorp\s*dev\b/i, /\bm&a\b/i] },
    { value: 'gtm-sales', label: 'GTM / Sales', patterns: [/\bgtm\b/i, /\bgo.to.market\b/i, /\bsales\b/i, /\baccount\s+executive\b/i] },
    { value: 'growth', label: 'Growth', patterns: [/\bgrowth\b/i, /\bgrowth\s+(manager|lead|marketing)\b/i] },
    { value: 'bizops', label: 'BizOps', patterns: [/\bbiz\s*ops\b/i, /\bbusiness\s+operations\b/i] },
  ],
  startups: [
    { value: 'strategy-cos', label: 'Strategy / Chief of Staff', patterns: [/\bchief\s+of\s+staff\b/i, /\bcos\b/i, /\bstrategy\b/i] },
    { value: 'founder-assoc', label: 'Founder Associate', patterns: [/\bfounder\s+associate\b/i, /\bfounder'?s?\s+associate\b/i, /\bceo\s+office\b/i] },
    { value: 'product', label: 'Product', patterns: [/\bproduct\b/i] },
    { value: 'growth-gtm', label: 'Growth / GTM', patterns: [/\bgrowth\b/i, /\bgtm\b/i, /\bgo.to.market\b/i, /\bmarketing\b/i] },
    { value: 'operations', label: 'Operations', patterns: [/\boperations\b/i, /\bops\b/i] },
  ],
};

export function jobMatchesSubCategories(
  job: { title: string; description?: string },
  mode: ScrapeMode,
  selectedSubCategories: string[],
): boolean {
  if (selectedSubCategories.length === 0) return true;
  const cats = SUB_CATEGORIES[mode] || [];
  const text = `${job.title} ${job.description || ''}`;
  return selectedSubCategories.some((val) => {
    const cat = cats.find((c) => c.value === val);
    if (!cat) return false;
    return cat.patterns.some((p) => p.test(text));
  });
}
