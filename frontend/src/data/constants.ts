import type { ContactStatus, Job, Profile } from '../types';

// Seed used only if jobs.json can't be loaded (e.g. the scraper hasn't run
// yet). The real list is produced daily by scraper/scrape-jobs.js — see
// .github/workflows/scrape-jobs.yml.
export const FALLBACK_JOBS: Job[] = [
  ['Stripe', 'Software Engineer Intern', 'San Francisco, CA', 'SimplifyJobs/Summer2027-Internships', 'Summer 2027'],
  ['Figma', 'Product Engineer, New Grad', 'New York, NY', 'SimplifyJobs/New-Grad-Positions', 'New Grad 2027'],
  ['Ramp', 'Software Engineer Intern', 'New York, NY', 'vanshb03/Summer2027-Internships', 'Summer 2027'],
  ['Notion', 'Software Engineer Intern, AI', 'San Francisco, CA', 'speedyapply/2027-SWE-College-Jobs', 'Summer 2027'],
].map(([company, role, location, repo, term], i) => ({
  id: 'j' + i, company, role, location, posted: '—', repo, term, hasListing: true, url: '',
}));

export const DEFAULT_PROFILE: Profile = {
  name: 'Alex Rivera',
  school: "UC Berkeley '27, Computer Science",
  highlight: 'built a real-time collaborative code editor used by 2,000+ students',
  resume: [
    'ALEX RIVERA',
    'UC Berkeley — B.S. Computer Science, May 2027',
    '',
    'EXPERIENCE',
    'Software Engineering Intern, Brex (Summer 2026)',
    '- Shipped card-controls API used by 400+ customers',
    '- Cut p95 latency of spend-limit checks by 38%',
    '',
    'PROJECTS',
    'PairPad — real-time collaborative editor (CRDTs, WebSockets), 2k+ users',
    '',
    'SKILLS',
    'TypeScript, Go, Python, Postgres, React',
  ].join('\n'),
};

export const STATUS_CYCLE: Record<ContactStatus, ContactStatus> = {
  'Not sent': 'Sent', 'Sent': 'Replied', 'Replied': 'Not sent',
};
export const STATUS_CLASS: Record<ContactStatus, string> = {
  'Not sent': 'st st-notsent', 'Sent': 'st st-sent', 'Replied': 'st st-replied',
};
