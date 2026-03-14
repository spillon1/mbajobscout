export type SubCategory = {
  value: string;
  label: string;
  patterns: RegExp[];
};

export type ScrapeMode = 'vc' | 'pe' | 'ib' | 'mc' | 'st' | 'im' | 'tech' | 'startups';

export const SUB_CATEGORIES: Record<ScrapeMode, SubCategory[]> = {
  vc: [
    { value: 'investment', label: 'Investment', patterns: [/\binvestment\b(?!\s+(admin|operat|account|support|report|service|compli|process|back\s*office|strategist|trust|consult|counsel|manag|direct|officer|writer|market))/i, /\bdeal\b/i, /\borigination\b/i, /\binvestment\s+analyst\b/i, /\binvestment\s+associate\b/i, /\bvc\s+analyst\b/i, /\bvc\s+associate\b/i, /\bventure\s+(capital\s+)?(analyst|associate|principal|partner)\b/i] },
    { value: 'platform', label: 'Platform', patterns: [/\bplatform\b/i, /\bportfolio\s+(support|operations|success)\b/i, /\bvalue\s+creation\b/i, /\boperating\s+partner\b/i, /\bportfolio\b/i] },
    { value: 'investor-relations', label: 'Investor Relations', patterns: [/\binvestor\s+relations\b/i, /\bir\b/i, /\bfundraising\b/i, /\blp\s+relations\b/i, /\bcapital\s+raising\b/i] },
    { value: 'fund-ops', label: 'Fund Operations', patterns: [/\bfund\s+operations\b/i, /\bfund\s+admin/i, /\bfund\s+accounting\b/i, /\bfund\s+manag/i, /\bcompliance\b/i, /\boperations\b/i, /\bfinance\b/i, /\binvestment\s+(strategist|trust|consult|counsel|manag|writer|market)/i, /\basset\s+manag/i, /\bwealth\s+manag/i, /\bportfolio\s+manag/i] },
  ],
  pe: [
    { value: 'investment', label: 'Investment', patterns: [/\binvestment\b(?!\s+(admin|operat|account|support|report|service|compli|process|back\s*office))/i, /\bdeal\b/i, /\borigination\b/i, /\banalyst\b/i, /\bassociate\b/i, /\bprincipal\b/i] },
    { value: 'portfolio-ops', label: 'Portfolio Operations', patterns: [/\bportfolio\b/i, /\bvalue\s+creation\b/i, /\boperating\s+partner\b/i] },
    { value: 'investor-relations', label: 'Investor Relations', patterns: [/\binvestor\s+relations\b/i, /\bir\b/i, /\bfundraising\b/i, /\blp\s+relations\b/i, /\bcapital\s+raising\b/i] },
    { value: 'fund-ops', label: 'Fund Operations', patterns: [/\bfund\s+operations\b/i, /\bfund\s+admin/i, /\bfund\s+accounting\b/i, /\bcompliance\b/i, /\boperations\b/i, /\bfinance\b/i] },
  ],
  ib: [
    { value: 'ma', label: 'M&A', patterns: [/\bm&a\b/i, /\bmergers?\s*(and|&)\s*acquisitions?\b/i] },
    { value: 'levfin', label: 'Leveraged Finance', patterns: [/\blevfin\b/i, /\bleveraged\s+finance\b/i, /\bhigh\s+yield\b/i] },
    { value: 'ecm-dcm', label: 'ECM / DCM', patterns: [/\becm\b/i, /\bdcm\b/i, /\bcapital\s+markets\b/i, /\bequity\s+capital\b/i, /\bdebt\s+capital\b/i] },
    { value: 'industry-coverage', label: 'Industry Coverage', patterns: [/\bcoverage\b/i, /\bindustry\b/i, /\bsector\b/i, /\btmt\b/i, /\bhealthcare\b/i, /\benergy\b/i, /\bfig\b/i, /\breal\s+estate\b/i, /\bconsumer\b/i, /\bindustrials\b/i] },
    { value: 'restructuring', label: 'Restructuring', patterns: [/\brestructuring\b/i, /\bturnaround\b/i, /\bdistressed\b/i, /\binsolvency\b/i] },
  ],
  mc: [
    { value: 'strategy', label: 'Strategy', patterns: [/\bstrategy\b/i, /\bstrategic\b/i] },
    { value: 'operations', label: 'Operations', patterns: [/\boperations\b/i, /\boperational\b/i, /\bprocess\b/i] },
    { value: 'digital', label: 'Digital / Technology', patterns: [/\bdigital\b/i, /\btechnology\b/i, /\btransformation\b/i] },
    { value: 'implementation', label: 'Implementation', patterns: [/\bimplementation\b/i, /\bdelivery\b/i, /\bexecution\b/i] },
  ],
  st: [
    { value: 'sales', label: 'Sales', patterns: [/\bsales\b/i, /\bequity\s+sales\b/i] },
    { value: 'trading', label: 'Trading', patterns: [/\btrad(er|ing)\b/i] },
    { value: 'structuring', label: 'Structuring', patterns: [/\bstructur(er|ing)\b/i] },
    { value: 'quant-electronic', label: 'Quant / Electronic', patterns: [/\bquant\b/i, /\belectronic\b/i, /\balgo\b/i, /\bsystematic\b/i, /\be[\-\s]?trading\b/i] },
  ],
  im: [
    { value: 'portfolio-mgmt', label: 'Portfolio Management', patterns: [/\bportfolio\s+manag/i, /\bfund\s+manag/i, /\bpm\b/i] },
    { value: 'research', label: 'Investment Research', patterns: [/\bresearch\b/i, /\bequity\s+research\b/i, /\binvestment\s+research\b/i, /\banalyst\b/i] },
    { value: 'quant', label: 'Quantitative', patterns: [/\bquant/i, /\balgorithm/i, /\bsystematic\b/i] },
    { value: 'trading', label: 'Trading', patterns: [/\btrad(er|ing)\b/i, /\bexecution\b/i] },
    { value: 'wealth-mgmt', label: 'Wealth Management', patterns: [/\bwealth\s+manag/i, /\bprivate\s+bank/i, /\bprivate\s+wealth/i] },
  ],
  tech: [
    { value: 'product', label: 'Product', patterns: [/\bproduct\s+(manager|management|lead|director|owner|head)\b/i, /\bpm\b/i] },
    { value: 'strategy-ops', label: 'Strategy & Operations', patterns: [/\bstrategy\s*((&|and)\s*)?operations\b/i, /\bstratops\b/i, /\bbiz\s*ops\b/i, /\bbusiness\s+operations\b/i] },
    { value: 'corp-dev', label: 'Corporate Development', patterns: [/\bcorporate\s+development\b/i, /\bcorp\s*dev\b/i, /\bm&a\b/i] },
    { value: 'growth', label: 'Growth', patterns: [/\bgrowth\b/i, /\bgrowth\s+(manager|lead|marketing)\b/i] },
    { value: 'gtm-sales', label: 'GTM / Sales', patterns: [/\bgtm\b/i, /\bgo.to.market\b/i, /\bsales\b/i, /\baccount\s+executive\b/i] },
  ],
  startups: [
    { value: 'founder-assoc', label: 'Founder Associate', patterns: [/\bfounder\s+associate\b/i, /\bfounder'?s?\s+associate\b/i, /\bceo\s+office\b/i] },
    { value: 'cos', label: 'Chief of Staff', patterns: [/\bchief\s+of\s+staff\b/i, /\bcos\b/i] },
    { value: 'strategy', label: 'Strategy', patterns: [/\bstrategy\b/i] },
    { value: 'product', label: 'Product', patterns: [/\bproduct\b/i] },
    { value: 'growth-gtm', label: 'Growth / GTM', patterns: [/\bgrowth\b/i, /\bgtm\b/i, /\bgo.to.market\b/i, /\bmarketing\b/i] },
    { value: 'operations', label: 'Operations', patterns: [/\boperations\b/i, /\bops\b/i] },
  ],
};

export const SECONDARY_FILTERS: Partial<Record<ScrapeMode, { label: string; options: SubCategory[] }>> = {
  vc: {
    label: 'Stage',
    options: [
      { value: 'pre-seed-seed', label: 'Pre-Seed / Seed', patterns: [/\bpre[\s\-]?seed\b/i, /\bseed\s+(stage|fund|round)\b/i, /\bseed\b/i, /\bearly[\s\-]?stage\b/i] },
      { value: 'series-ab', label: 'Series A / B', patterns: [/\bseries\s+[ab]\b/i, /\bearly\s+growth\b/i] },
      { value: 'growth-late', label: 'Growth / Late Stage', patterns: [/\bgrowth\s+(stage|equity|fund)\b/i, /\blate[\s\-]?stage\b/i, /\bseries\s+[c-z]\b/i, /\bgrowth\b/i] },
      { value: 'multi-stage', label: 'Multi-Stage', patterns: [/\bmulti[\s\-]?stage\b/i, /\bfull[\s\-]?lifecycle\b/i, /\ball[\s\-]?stage/i, /\bcross[\s\-]?stage\b/i] },
    ],
  },
  st: {
    label: 'Asset Class',
    options: [
      { value: 'equities', label: 'Equities', patterns: [/\bequit(y|ies)\b/i] },
      { value: 'fx', label: 'FX', patterns: [/\bfx\b/i, /\bforeign\s+exchange\b/i, /\bcurrenc/i] },
      { value: 'rates', label: 'Rates', patterns: [/\brates\b/i, /\bfixed\s+income\b/i, /\bficc\b/i, /\bgovt?\s+bond/i] },
      { value: 'credit', label: 'Credit', patterns: [/\bcredit\b/i, /\bhigh\s+yield\b/i, /\binvestment\s+grade\b/i] },
      { value: 'commodities', label: 'Commodities', patterns: [/\bcommodit/i, /\benergy\b/i, /\bmetals\b/i, /\boil\b/i, /\bgas\b/i] },
    ],
  },
  pe: {
    label: 'Strategy',
    options: [
      { value: 'buyout', label: 'Buyout', patterns: [/\bbuyout\b/i, /\blbo\b/i, /\bleveraged\b/i] },
      { value: 'growth-equity', label: 'Growth Equity', patterns: [/\bgrowth\b/i, /\bgrowth\s+equity\b/i] },
      { value: 'credit', label: 'Credit / Debt', patterns: [/\bcredit\b/i, /\bdebt\b/i, /\bprivate\s+credit\b/i, /\bmezzanine\b/i] },
      { value: 'infrastructure', label: 'Infrastructure', patterns: [/\binfrastructure\b/i, /\binfra\b/i] },
      { value: 'secondaries', label: 'Secondaries', patterns: [/\bsecondari/i, /\bsecondary\b/i] },
    ],
  },
  ib: {
    label: 'Firm Type',
    options: [
      { value: 'bulge-bracket', label: 'Bulge Bracket', patterns: [/\b(goldman\s+sachs|morgan\s+stanley|j\.?p\.?\s*morgan|bank\s+of\s+america|citigroup|citi\b|barclays|deutsche\s+bank|ubs|credit\s+suisse|hsbc)\b/i] },
      { value: 'elite-boutique', label: 'Elite Boutique', patterns: [/\b(lazard|evercore|centerview|pjt\s+partners|moelis|guggenheim|perella\s+weinberg|pwp|greenhill|rothschild|qatalyst)\b/i] },
      { value: 'middle-market', label: 'Middle Market', patterns: [/\b(houlihan\s+lokey|william\s+blair|raymond\s+james|jefferies|piper\s+sandler|baird|lincoln\s+international|harris\s+williams|dc\s+advisory|numis|liberum|stifel|canaccord)\b/i] },
    ],
  },
  im: {
    label: 'Company Type',
    options: [
      { value: 'hedge-fund', label: 'Hedge Fund', patterns: [/\bhedge\s+fund\b/i, /\bhf\b/i] },
      { value: 'asset-mgmt', label: 'Asset Management', patterns: [/\basset\s+management\b/i, /\bfund\s+management\b/i, /\basset\s+manager\b/i] },
      { value: 'wealth-manager', label: 'Wealth Manager', patterns: [/\bwealth\s+manag/i, /\bprivate\s+bank/i, /\bprivate\s+wealth/i] },
      { value: 'family-office', label: 'Family Office', patterns: [/\bfamily\s+office\b/i, /\bsfo\b/i, /\bmfo\b/i] },
      { value: 'institutional', label: 'Institutional Investor', patterns: [/\binstitutional\b/i, /\bpension\b/i, /\bendowment\b/i, /\bsovereign\s+wealth\b/i, /\binsurance\b/i] },
    ],
  },
};

export const TERTIARY_FILTERS: Partial<Record<ScrapeMode, { label: string; options: SubCategory[] }>> = {
  pe: {
    label: 'Firm Type',
    options: [
      { value: 'mega-fund', label: 'Mega Fund', patterns: [/\b(kkr|blackstone|carlyle|apollo|tpg|warburg\s+pincus|advent|bain\s+capital|cvc|eqt|permira|cinven|bc\s+partners|bridgepoint|pai\s+partners|silver\s+lake|thoma\s+bravo|vista\s+equity|hellman\s+&?\s*friedman)\b/i] },
      { value: 'upper-mid', label: 'Upper Mid-Market', patterns: [/\b(hg\s+capital|montagu|charterhouse|ici|apax|graphite|intermediate\s+capital|3i|livingbridge|inflexion|palatine|lyceum|oakley|sovereign|exponent|bowmark)\b/i] },
      { value: 'mid-market', label: 'Mid-Market', patterns: [/\bmid[\s\-]?market\b/i, /\b(ldc|nvp|endless|kester|dunedin|august\s+equity|key\s+capital|mercia|foresight|mobeus|ypf|primary|pricoa|beechbrook|phoenix\s+equity)\b/i] },
      { value: 'growth-equity-fund', label: 'Growth Equity Fund', patterns: [/\bgrowth\s+equity\b/i, /\bgrowth\s+fund\b/i, /\b(general\s+atlantic|insight\s+partners|summit\s+partners|ta\s+associates|jmi\s+equity)\b/i] },
      { value: 'private-credit-fund', label: 'Private Credit Fund', patterns: [/\bprivate\s+credit\b/i, /\bdirect\s+lending\b/i, /\bcredit\s+fund\b/i, /\b(ares|golub|owl\s+rock|blue\s+owl|hayfin|arcmont|pemberton|tikehau|muzinich)\b/i] },
    ],
  },
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

export function jobMatchesSecondaryFilter(
  job: { title: string; description?: string; company?: string },
  mode: ScrapeMode,
  selectedValues: string[],
): boolean {
  if (selectedValues.length === 0) return true;
  const filter = SECONDARY_FILTERS[mode];
  if (!filter) return true;
  const text = `${job.title} ${job.description || ''} ${(job as any).company || ''}`;
  return selectedValues.some((val) => {
    const opt = filter.options.find((c) => c.value === val);
    if (!opt) return false;
    return opt.patterns.some((p) => p.test(text));
  });
}

export function jobMatchesTertiaryFilter(
  job: { title: string; description?: string; company?: string },
  mode: ScrapeMode,
  selectedValues: string[],
): boolean {
  if (selectedValues.length === 0) return true;
  const filter = TERTIARY_FILTERS[mode];
  if (!filter) return true;
  const text = `${job.title} ${job.description || ''} ${(job as any).company || ''}`;
  return selectedValues.some((val) => {
    const opt = filter.options.find((c) => c.value === val);
    if (!opt) return false;
    return opt.patterns.some((p) => p.test(text));
  });
}
