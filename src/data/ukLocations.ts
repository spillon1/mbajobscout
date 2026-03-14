export interface UkLocation {
  city: string;
  label: string; // "City, Country"
  /** Source-specific URL overrides keyed by source name */
  sourceUrls: Record<string, string>;
}

/** Build source URLs for a given UK city (or "United Kingdom" for all-UK) */
function buildSourceUrls(city: string, cityLower: string): Record<string, string> {
  const isAllUk = city === 'United Kingdom';
  const cityEncoded = encodeURIComponent(city);
  const cityPlusEncoded = city.replace(/\s/g, '+');

  if (isAllUk) {
    return {
      eFinancialCareers: `https://www.efinancialcareers.co.uk/jobs/%22venture-capital%22?q=%22venture+capital%22&countryCode=GB&pageSize=50&currencyCode=GBP&language=en&includeUnspecifiedSalary=true&enableVectorSearch=true`,
      'Glassdoor UK': `https://www.glassdoor.co.uk/Job/jobs.htm?sc.occupationParam=%22venture+capital%22&sc.keyword=%22venture+capital%22`,
      'Google Jobs': `https://www.google.com/search?udm=8&q=venture+capital+jobs+United+Kingdom`,
      'Indeed UK': `https://uk.indeed.com/jobs?q=%22venture+capital%22`,
      'John Gannon Blog': `https://johngannonblog.com/?feed=job_feed&job_types&search_location&job_categories&search_keywords`,
      'LinkedIn Jobs': `https://www.linkedin.com/jobs/search/?keywords=%22venture+capital%22&location=United+Kingdom`,
      'VC Careers': `https://venturecapitalcareers.com/jobs/locations/united-kingdom`,
      InnovatorsRoom: 'https://innovatorsroom.beehiiv.com/archive?tags=%F0%9F%92%B6+Junior+Investor+JobDrop',
      'Startup & VC': 'https://www.startupandvc.com/venture-capital-jobs',
      Venture5: 'https://venture5.com/jobs/',
    };
  }

  // For ambiguous city names (exist in both UK and US), append ", UK" or ", England" to disambiguate
  const ukQualified = `${city}, UK`;
  const ukQualifiedEncoded = encodeURIComponent(ukQualified);
  const ukQualifiedPlus = ukQualified.replace(/\s/g, '+');

  return {
    eFinancialCareers: `https://www.efinancialcareers.co.uk/jobs/%22venture-capital%22/in-${cityLower.replace(/\s/g, '-')}%2C-uk?q=%22venture+capital%22&location=${cityEncoded}%2C+UK&countryCode=GB&locationPrecision=City&radius=40&radiusUnit=km&pageSize=15&currencyCode=GBP&language=en&includeUnspecifiedSalary=true&enableVectorSearch=true`,
    'Glassdoor UK': `https://www.glassdoor.co.uk/Job/jobs.htm?sc.occupationParam=%22venture+capital%22&sc.keyword=%22venture+capital%22+${cityPlusEncoded}`,
    'Google Jobs': `https://www.google.com/search?udm=8&q=venture+capital+jobs+${cityPlusEncoded}+UK`,
    'Indeed UK': `https://uk.indeed.com/jobs?q=%22venture+capital%22&l=${cityEncoded}`,
    'John Gannon Blog': `https://johngannonblog.com/?feed=job_feed&job_types&search_location=${ukQualifiedEncoded}&job_categories&search_keywords`,
    'LinkedIn Jobs': `https://www.linkedin.com/jobs/search/?keywords=%22venture+capital%22&location=${ukQualifiedEncoded}`,
    'VC Careers': `https://venturecapitalcareers.com/jobs/locations/${cityLower.replace(/\s/g, '-')}-eng-united-kingdom`,
    // These sources don't support location filtering
    InnovatorsRoom: 'https://innovatorsroom.beehiiv.com/archive?tags=%F0%9F%92%B6+Junior+Investor+JobDrop',
    'Startup & VC': 'https://www.startupandvc.com/venture-capital-jobs',
    Venture5: 'https://venture5.com/jobs/',
  };
}

export const UK_CITIES: { value: string; label: string }[] = [
  { value: 'United Kingdom', label: 'All UK' },
  { value: 'London', label: 'London' },
  { value: 'Manchester', label: 'Manchester' },
  { value: 'Birmingham', label: 'Birmingham' },
  { value: 'Edinburgh', label: 'Edinburgh' },
  { value: 'Bristol', label: 'Bristol' },
  { value: 'Leeds', label: 'Leeds' },
  { value: 'Glasgow', label: 'Glasgow' },
  { value: 'Cambridge', label: 'Cambridge' },
  { value: 'Oxford', label: 'Oxford' },
  { value: 'Cardiff', label: 'Cardiff' },
  { value: 'Liverpool', label: 'Liverpool' },
  { value: 'Newcastle', label: 'Newcastle' },
  { value: 'Nottingham', label: 'Nottingham' },
  { value: 'Sheffield', label: 'Sheffield' },
  { value: 'Southampton', label: 'Southampton' },
  { value: 'Belfast', label: 'Belfast' },
  { value: 'Aberdeen', label: 'Aberdeen' },
  { value: 'Bath', label: 'Bath' },
  { value: 'Remote', label: 'Remote' },
];

const CITY_ALIASES: Record<string, string[]> = {
  oxford: ['oxfordshire'],
  cambridge: ['cambridgeshire'],
  bristol: ['avon'],
  newcastle: ['tyne and wear', 'tyneside'],
  nottingham: ['nottinghamshire'],
  sheffield: ['south yorkshire'],
  leeds: ['west yorkshire'],
  liverpool: ['merseyside'],
  manchester: ['greater manchester'],
  birmingham: ['west midlands'],
  southampton: ['hampshire'],
  bath: ['somerset', 'bath and north east somerset'],
  aberdeen: ['aberdeenshire'],
};

/** Returns true if the job's location text indicates a remote role */
function isRemoteLocation(loc: string): boolean {
  return /\bremote\b/i.test(loc);
}

/** Filter a job by selected city. Returns true if job should be included. */
export function jobMatchesCity(jobLocation: string, selectedCity: string): boolean {
  if (selectedCity === 'United Kingdom') return true;

  const loc = jobLocation.toLowerCase();

  if (selectedCity === 'Remote') {
    return isRemoteLocation(loc);
  }

  const cityLower = selectedCity.toLowerCase();
  const aliases = CITY_ALIASES[cityLower] || [];

  if (loc.includes(cityLower)) return true;
  if (aliases.some((a) => loc.includes(a))) return true;
  // Generic UK-wide listings match any city, but NOT remote-only
  if (loc.includes('united kingdom') || loc === 'uk' || loc.includes('various')) return true;
  // Drop if it mentions a different UK city
  const otherCities = UK_CITIES
    .filter((c) => c.value !== 'United Kingdom' && c.value !== 'Remote' && c.value.toLowerCase() !== cityLower)
    .map((c) => c.value.toLowerCase());
  if (otherCities.some((c) => loc.includes(c))) return false;
  return false;
}

export function getLocationString(city: string): string {
  if (city === 'United Kingdom') return 'United Kingdom';
  return `${city}, United Kingdom`;
}

export function getSourceUrlForLocation(sourceName: string, city: string): string | undefined {
  const urls = buildSourceUrls(city, city.toLowerCase());
  return urls[sourceName];
}
