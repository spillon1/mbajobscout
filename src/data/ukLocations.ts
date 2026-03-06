export interface UkLocation {
  city: string;
  label: string; // "City, Country"
  /** Source-specific URL overrides keyed by source name */
  sourceUrls: Record<string, string>;
}

/** Build source URLs for a given UK city */
function buildSourceUrls(city: string, cityLower: string): Record<string, string> {
  const cityEncoded = encodeURIComponent(city);
  const cityPlusEncoded = city.replace(/\s/g, '+');

  return {
    eFinancialCareers: `https://www.efinancialcareers.co.uk/jobs/%22venture-capital%22/in-${cityLower.replace(/\s/g, '-')}%2C-uk?q=%22venture+capital%22&location=${cityEncoded}%2C+UK&countryCode=GB&locationPrecision=City&radius=40&radiusUnit=km&pageSize=15&currencyCode=GBP&language=en&includeUnspecifiedSalary=true&enableVectorSearch=true`,
    'Glassdoor UK': `https://www.glassdoor.co.uk/Job/jobs.htm?sc.occupationParam=%22venture+capital%22&sc.keyword=%22venture+capital%22+${cityPlusEncoded}`,
    'Google Jobs': `https://www.google.com/search?udm=8&q=venture+capital+jobs+${cityLower.replace(/\s/g, '+')}`,
    'Indeed UK': `https://uk.indeed.com/jobs?q=%22venture+capital%22&l=${cityEncoded}`,
    'John Gannon Blog': `https://johngannonblog.com/?feed=job_feed&job_types&search_location=${cityEncoded}&job_categories&search_keywords`,
    'LinkedIn Jobs': `https://www.linkedin.com/jobs/search/?keywords=%22venture+capital%22&location=${cityEncoded}`,
    'VC Careers': `https://venturecapitalcareers.com/jobs/locations/${cityLower.replace(/\s/g, '-')}-eng-united-kingdom`,
    // These sources don't support location filtering
    InnovatorsRoom: 'https://innovatorsroom.beehiiv.com/archive?tags=%F0%9F%92%B6+Junior+Investor+JobDrop',
    'Startup & VC': 'https://www.startupandvc.com/venture-capital-jobs',
    Venture5: 'https://venture5.com/jobs/',
  };
}

export const UK_CITIES: { value: string; label: string }[] = [
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
];

export function getLocationString(city: string): string {
  return `${city}, United Kingdom`;
}

export function getSourceUrlForLocation(sourceName: string, city: string): string | undefined {
  const urls = buildSourceUrls(city, city.toLowerCase());
  return urls[sourceName];
}
