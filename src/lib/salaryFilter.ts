export type PayRange = 'not-stated' | '0-30k' | '30-50k' | '50-75k' | '75-100k' | '100k+';

export const PAY_RANGE_OPTIONS: { value: PayRange; label: string }[] = [
  { value: 'not-stated', label: 'Not Stated' },
  { value: '0-30k', label: '£0–30k' },
  { value: '30-50k', label: '£30–50k' },
  { value: '50-75k', label: '£50–75k' },
  { value: '75-100k', label: '£75–100k' },
  { value: '100k+', label: '£100k+' },
];

/**
 * Extract a numeric annual salary (in £k) from a freetext salary string.
 * Returns null if no salary can be parsed.
 */
function extractSalaryK(salary: string): number | null {
  if (!salary) return null;
  const s = salary.replace(/,/g, '').toLowerCase();

  // Match patterns like "£50,000", "$75k", "50000", "£50k - £60k"
  const matches = [...s.matchAll(/[£$€]?\s*(\d+(?:\.\d+)?)\s*(k|000|per\s+annum|pa|p\.a\.)?/gi)];
  if (matches.length === 0) return null;

  const values: number[] = [];
  for (const m of matches) {
    let val = parseFloat(m[1]);
    const suffix = (m[2] || '').toLowerCase();
    if (suffix === 'k') {
      // already in k
    } else if (val >= 1000) {
      val = val / 1000;
    }
    // Ignore very small numbers (likely not salary)
    if (val >= 10) values.push(val);
  }

  if (values.length === 0) return null;
  // Use the average of min/max if range, or just the first value
  if (values.length >= 2) return (values[0] + values[1]) / 2;
  return values[0];
}

/**
 * Check if a job matches any of the selected pay ranges.
 * If no ranges selected, all jobs pass.
 */
export function jobMatchesPayRange(salary: string | undefined, selectedRanges: PayRange[]): boolean {
  if (selectedRanges.length === 0) return true;

  const hasValue = salary && salary.trim().length > 0;
  const salaryK = hasValue ? extractSalaryK(salary) : null;

  return selectedRanges.some((range) => {
    switch (range) {
      case 'not-stated':
        return !hasValue || salaryK === null;
      case '0-30k':
        return salaryK !== null && salaryK < 30;
      case '30-50k':
        return salaryK !== null && salaryK >= 30 && salaryK < 50;
      case '50-75k':
        return salaryK !== null && salaryK >= 50 && salaryK < 75;
      case '75-100k':
        return salaryK !== null && salaryK >= 75 && salaryK < 100;
      case '100k+':
        return salaryK !== null && salaryK >= 100;
      default:
        return true;
    }
  });
}
