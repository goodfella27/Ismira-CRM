export type ApplicationJobOption = { name: string; department?: string; state?: string; org_type?: string };
const HOTEL_DEPARTMENTS = new Set([
  'HOTEL', 'RESTAURANT', 'HOUSEKEEPING', 'BAR', 'GUEST SERVICES / SHOREX',
  'CULINARY / GALLEY', 'HOTEL ADMINISTRATION', 'ENTERTAINMENT', 'SHOPS / SALES',
  'CASINO', 'MEDICAL / BEAUTY', 'SECURITY', 'STORES / PROVISION',
]);
const TECHNICAL_DEPARTMENTS = new Set(['TECHNICAL', 'DECK', 'ENGINE', 'MAINTENANCE', 'REPAIR']);
export function applicationJobOptions(jobs: ApplicationJobOption[], department: string) {
  const departments = department === 'Hotel' ? HOTEL_DEPARTMENTS : department === 'Technical' ? TECHNICAL_DEPARTMENTS : new Set<string>();
  const names = new Map<string, string>();
  for (const job of jobs) {
    if (job.state && job.state !== 'published' || job.org_type === 'pool') continue;
    if (!departments.has((job.department ?? '').trim().toUpperCase())) continue;
    const name = job.name.trim();
    if (name && name.length <= 120) names.set(name.toLocaleLowerCase(), name);
  }
  return [...names.values()].sort((a,b)=>a.localeCompare(b));
}
