export const DEFAULT_ACADEMIC_YEAR = '2026/2027';

export const DEFAULT_ACADEMIC_YEARS: readonly string[] = [
  '2026/2027',
  '2027/2028',
  '2028/2029',
  '2029/2030',
];

export function resolveAcademicYear(
  value?: string | null,
  fallback: string = DEFAULT_ACADEMIC_YEAR
): string {
  const trimmed = typeof value === 'string' ? value.replace(/^[\s"]+|[\s"]+$/g, '') : '';
  return trimmed || fallback;
}

export function isValidAcademicYearFormat(value: string): boolean {
  const trimmed = value.trim();
  const match = /^(\d{4})\/(\d{4})$/.exec(trimmed);
  if (!match) return false;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  return endYear === startYear + 1;
}

export function formatAcademicYearShort(year?: string | null): string {
  const resolved = resolveAcademicYear(year);
  const match = /^(\d{4})\/(\d{4})$/.exec(resolved);
  if (!match) return resolved;
  return `${match[1].slice(2)}/${match[2].slice(2)}`;
}

export function sortAcademicYears(years: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const item of years) {
    const trimmed = typeof item === 'string' ? item.trim() : '';
    if (trimmed) set.add(trimmed);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function parseAcademicYearsSetting(
  rawValue: unknown,
  activeYear?: string | null
): string[] {
  let parsed: unknown = rawValue;
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (trimmed.startsWith('[')) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = [];
      }
    } else if (trimmed) {
      parsed = [trimmed];
    }
  }

  const extra = Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return sortAcademicYears([
    ...DEFAULT_ACADEMIC_YEARS,
    ...extra,
    ...(activeYear && activeYear.trim() ? [activeYear.trim()] : []),
  ]);
}

export function buildAcademicYearOptions(
  configuredYears: readonly string[],
  extraYears: Array<string | null | undefined> = [],
  activeYear?: string | null
): string[] {
  const collected: string[] = [...DEFAULT_ACADEMIC_YEARS, ...configuredYears];
  if (activeYear && activeYear.trim()) {
    collected.push(activeYear.trim());
  }
  for (const yr of extraYears) {
    if (yr && yr.trim()) {
      collected.push(yr.trim());
    }
  }
  return sortAcademicYears(collected);
}

export function getPreviousAcademicYear(
  currentYear: string,
  availableYears: readonly string[] = []
): string | null {
  const resolved = resolveAcademicYear(currentYear);
  const sorted = sortAcademicYears([
    ...DEFAULT_ACADEMIC_YEARS,
    ...availableYears,
    resolved,
  ]);
  const idx = sorted.indexOf(resolved);
  if (idx > 0) {
    return sorted[idx - 1];
  }
  const match = /^(\d{4})\/(\d{4})$/.exec(resolved);
  if (!match) return null;
  const prevStart = Number(match[1]) - 1;
  const prevEnd = Number(match[2]) - 1;
  if (prevStart < 2000) return null;
  return `${prevStart}/${prevEnd}`;
}
