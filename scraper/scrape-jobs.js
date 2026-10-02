// Pulls intern / new-grad SWE listings from the public GitHub job-board repos
// Warmline points at, normalizes them into one shape, and writes data/jobs.json
// for the frontend to fetch. Run daily by .github/workflows/scrape-jobs.yml.

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'data', 'jobs.json');

const REPOS = [
  'SimplifyJobs/Summer2027-Internships',
  'SimplifyJobs/New-Grad-Positions',
  'speedyapply/2027-SWE-College-Jobs',
  'vanshb03/Summer2027-Internships',
];

// Sources to actually fetch from. Two repos (SimplifyJobs, vanshb03 fork) publish
// a structured JSON feed; speedyapply only publishes markdown tables in its README.
const SOURCES = [
  { repo: 'SimplifyJobs/Summer2027-Internships', branch: 'dev', type: 'json', term: 'Summer 2027' },
  { repo: 'SimplifyJobs/New-Grad-Positions', branch: 'dev', type: 'json', term: 'New Grad 2027' },
  { repo: 'vanshb03/Summer2027-Internships', branch: 'dev', type: 'json', term: 'Summer 2027' },
  { repo: 'speedyapply/2027-SWE-College-Jobs', branch: 'main', file: 'README.md', type: 'markdown', term: 'Summer 2027' },
  { repo: 'speedyapply/2027-SWE-College-Jobs', branch: 'main', file: 'NEW_GRAD_USA.md', type: 'markdown', term: 'New Grad 2027' },
];

const SWE_INCLUDE_RE = /software|\bswe\b|front.?end|back.?end|full.?stack|platform engineer|site reliability|\bsre\b|devops|cloud engineer|data engineer|machine learning|\bml\b engineer|applied scientist|web developer|mobile (?:developer|engineer)|ios engineer|android engineer/i;
const SWE_EXCLUDE_RE = /hardware|firmware|electrical|mechanical|civil|chemical|manufacturing|physical ai|rf engineer|asic/i;
const isSweRole = (title) => SWE_INCLUDE_RE.test(title) && !SWE_EXCLUDE_RE.test(title);
const MAX_JOBS = 40;
const MAX_AGE_DAYS = 120;

// Collapses city shorthand so "SF" and "San Francisco, CA" end up as one
// filterable value instead of two. Built from what SimplifyJobs' and
// vanshb03's own listings.json feeds actually emit as bare abbreviations
// (confirmed by querying them directly, not guessed) that also appear
// spelled out in full elsewhere in the same feeds. Keyed by the lowercased,
// "+N"-stripped location string, since e.g. "LA" is unambiguous alone but
// is also the state abbreviation inside "Bossier City, LA" — an exact-string
// match against the whole field avoids colliding with those.
const LOCATION_ALIASES = new Map([
  ['sf', 'San Francisco, CA'],
  ['nyc', 'New York, NY'],
  ['new york city, ny', 'New York, NY'],
  ['la', 'Los Angeles, CA'],
]);

function normalizeLocation(raw) {
  let loc = (raw || '').trim();
  if (!loc) return 'Remote';
  loc = loc.replace(/\s*\+\d+$/, '').trim(); // "Austin, TX +1" -> "Austin, TX"

  // Covers every variant seen across the feeds — "Remote in USA" (SimplifyJobs),
  // "Remote - San Francisco, CA" (speedyapply), bare "Remote" — as just "Remote",
  // dropping the region instead of carrying it through.
  if (/^Remote\b/i.test(loc)) return 'Remote';

  return LOCATION_ALIASES.get(loc.toLowerCase()) || loc;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'warmline-scraper' } });
  if (!res.ok) throw new Error(url + ' -> ' + res.status);
  return res.text();
}

/** SimplifyJobs-style `.github/scripts/listings.json` feed. */
async function fromJsonFeed(source) {
  const url = `https://raw.githubusercontent.com/${source.repo}/${source.branch}/.github/scripts/listings.json`;
  const entries = JSON.parse(await fetchText(url));
  const out = [];
  for (const e of entries) {
    if (e.active === false || e.is_visible === false) continue;
    if (!isSweRole(e.title || '')) continue;
    const postedAt = (e.date_posted || e.date_updated || Date.now() / 1000) * 1000;
    out.push({
      company: e.company_name,
      role: e.title,
      location: normalizeLocation(e.locations && e.locations[0]),
      postedAt,
      repo: source.repo,
      term: source.term,
      hasListing: true,
      url: e.url || '',
    });
  }
  return out;
}

/** speedyapply-style markdown tables: `<a href=co><strong>Name</strong></a> | role | loc | pay | <a href=apply>Apply</a> | age` */
function parseMarkdownTable(md, source) {
  const rowRe = /^\|\s*<a href="([^"]*)"><strong>([^<]*)<\/strong><\/a>\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|[^|]*\|\s*<a href="([^"]*)">[\s\S]*?<\/a>\s*\|\s*([^|]*?)\s*\|\s*$/gm;
  const out = [];
  let m;
  while ((m = rowRe.exec(md))) {
    const [, , company, role, location, applyUrl, age] = m;
    if (!isSweRole(role)) continue;
    out.push({
      company: company.trim(),
      role: role.trim(),
      location: normalizeLocation(location),
      postedAt: Date.now() - ageToMs(age.trim()),
      repo: source.repo,
      term: source.term,
      hasListing: true,
      url: applyUrl,
    });
  }
  return out;
}

function ageToMs(age) {
  const m = /^(\d+)\s*(h|d|mo|w)/.exec(age);
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = m[2];
  const DAY = 86400000;
  if (unit === 'h') return n * 3600000;
  if (unit === 'd') return n * DAY;
  if (unit === 'w') return n * 7 * DAY;
  if (unit === 'mo') return n * 30 * DAY;
  return 0;
}

async function fromMarkdown(source) {
  const url = `https://raw.githubusercontent.com/${source.repo}/${source.branch}/${source.file}`;
  const md = await fetchText(url);
  return parseMarkdownTable(md, source);
}

function dedupeKey(job) {
  const role = job.role.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
  return job.company.toLowerCase().trim() + '::' + role;
}

function daysAgoLabel(postedAt) {
  const days = Math.floor((Date.now() - postedAt) / 86400000);
  return days <= 0 ? 'today' : days + 'd ago';
}

async function main() {
  const seen = new Map();
  for (const source of SOURCES) {
    try {
      const jobs = source.type === 'json' ? await fromJsonFeed(source) : await fromMarkdown(source);
      for (const job of jobs) {
        if (Date.now() - job.postedAt > MAX_AGE_DAYS * 86400000) continue;
        const key = dedupeKey(job);
        const existing = seen.get(key);
        if (!existing || job.postedAt > existing.postedAt) seen.set(key, job);
      }
      console.log(`[ok] ${source.repo}${source.file ? '/' + source.file : ''} -> ${jobs.length} candidate rows`);
    } catch (err) {
      console.warn(`[skip] ${source.repo}${source.file ? '/' + source.file : ''}: ${err.message}`);
    }
  }

  const jobs = Array.from(seen.values())
    .sort((a, b) => b.postedAt - a.postedAt)
    .slice(0, MAX_JOBS)
    .map((job, i) => ({
      id: 'j' + i,
      company: job.company,
      role: job.role,
      location: job.location,
      posted: daysAgoLabel(job.postedAt),
      repo: job.repo,
      term: job.term,
      hasListing: true,
      url: job.url,
    }));

  if (jobs.length === 0) {
    throw new Error('No jobs scraped from any source — refusing to overwrite data/jobs.json with an empty list.');
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    repos: REPOS,
    jobs,
  };

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${jobs.length} jobs to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
