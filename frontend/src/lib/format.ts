import type { Job, JobData } from '../types';

export const initials = (n: string) => n.split(' ').map((s) => s[0]).join('').slice(0, 2);

export const categoryOf = (job: Job) => (/new grad/i.test(job.term || '') ? 'New Grad' : 'Internship');

export function syncedLabel(generatedAt: Date | null): string {
  if (!generatedAt) return 'synced just now';
  const mins = Math.max(0, Math.round((Date.now() - generatedAt.getTime()) / 60000));
  if (mins < 1) return 'synced just now';
  if (mins < 60) return 'synced ' + mins + ' min ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return 'synced ' + hrs + 'h ago';
  return 'synced ' + Math.round(hrs / 24) + 'd ago';
}

export function statusOf(d: JobData | undefined): { text: string; cls: string } {
  if (!d) return { text: 'Not collected', cls: 'pill pill-neutral' };
  if (d.status === 'collecting') return { text: 'Collecting…', cls: 'pill pill-warn' };
  const sent = d.contacts.filter((c) => c.status !== 'Not sent').length;
  return {
    text: d.contacts.length + ' people' + (sent ? ' · ' + sent + ' sent' : ''),
    cls: 'pill pill-accent',
  };
}

export function jobMeta(job: Job): string {
  return job.hasListing
    ? job.term + ' · posted ' + job.posted + ' · via ' + job.repo
    : 'No listing — general referral outreach';
}

// Company search; `warmline` + `wl_mode=company` tell the extension to register this tab.
export const linkedInCompanySearchUrl = (company: string) => {
  const q = encodeURIComponent(company);
  return 'https://www.linkedin.com/search/results/companies/?keywords=' + q + '&warmline=' + q + '&wl_mode=company';
};

// F/S/O people at the saved LinkedIn company `ids`; `warmline` tells the extension to capture this tab.
export const linkedInPeopleUrl = (company: string, network: Array<'F' | 'S' | 'O'>, ids: string[]) =>
  'https://www.linkedin.com/search/results/people/?currentCompany=' + encodeURIComponent(JSON.stringify(ids)) +
  '&network=' + encodeURIComponent(JSON.stringify(network)) +
  '&origin=' + encodeURIComponent('COMPANY_PAGE_CANNED_SEARCH') +
  '&warmline=' + encodeURIComponent(company);

export const gridCols = (showRepo: boolean) => showRepo
  ? 'minmax(0,1fr) minmax(0,1.8fr) minmax(0,1.1fr) 64px minmax(0,1.4fr) 140px'
  : 'minmax(0,1fr) minmax(0,2fr) minmax(0,1.2fr) 64px 140px';
