import { clean, parseCompanyIds, textOf } from './common';

const EMPLOYEES_LINK = 'main a[href*="currentCompany"]';

// The link's own text must be an employee count ("201-500 employees", "10K+ employees"). Other
// currentCompany links exist inside <main> too, e.g. "1 person from your school was hired here" on
// company-search result cards, which can linger in the DOM after LinkedIn renders a company page in
// place, and point at a different company.
const EMPLOYEE_COUNT = /^[\d.,]+[KkMm]?\+?(\s*[-–]\s*[\d.,]+[KkMm]?\+?)?\s+employees?$/;

/**
 * Pure: the LinkedIn company ids behind a company page's "N employees" link, or [] if the page has
 * none. Only `main a[href*="currentCompany"]` links whose text is an employee count are read. The
 * page also carries many unrelated `urn:li:company:N` / `fsd_company:N` ids (sidebars, suggestions)
 * and links outside <main>; those are never used.
 */
export function parseEmployeesLinkIds(doc: Document): string[] {
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>(EMPLOYEES_LINK))) {
    const href = a.getAttribute('href');
    if (!href || !EMPLOYEE_COUNT.test(textOf(a))) continue;
    let ids: string[];
    try {
      ids = parseCompanyIds(new URL(href, 'https://www.linkedin.com/').searchParams.get('currentCompany'));
    } catch {
      continue;
    }
    if (ids.length > 0) return ids;
  }
  return [];
}

/**
 * Pure: the company's display name on a company page. The first non-empty `h1`, else the document
 * title minus " | LinkedIn" and any leading "(N) " notification count, else `fallback`.
 */
export function companyNameFrom(doc: Document, fallback = ''): string {
  for (const h1 of Array.from(doc.querySelectorAll('h1'))) {
    const t = textOf(h1);
    if (t) return t;
  }
  const title = clean(doc.title)
    .replace(/\s*\|\s*LinkedIn\s*$/i, '')
    .replace(/^\(\d+\+?\)\s*/, '')
    // Company tabs are titled "Microsoft: Overview", "Microsoft: People", ...
    .replace(/:\s*(Overview|About|Posts|Jobs|People|Life|Products|Insights|Events|Videos)\s*$/i, '');
  return clean(title) || fallback;
}
