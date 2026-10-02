import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { companyNameFrom, extractForPage, extractSearchResults, pageKind, parseEmployeesLinkIds } from '../src/extractors';

function load(name: string): Document {
  const html = readFileSync(join(process.cwd(), 'fixtures', name), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('people-search extractor', () => {
  const records = extractSearchResults(load('people-search.html'));

  it('keeps one record per named person card (1st, 2nd and 3rd) and ignores everything else', () => {
    expect(records.map((r) => r.name)).toEqual([
      'Jordan Example',
      'Casey Sample',
      'Riley Placeholder',
      'Morgan Testperson',
      'Taylor Fakename',
      'Avery Nobody',
    ]);
  });

  it('returns the degree parsed from the name line', () => {
    expect(records.map((r) => [r.name, r.degree])).toEqual([
      ['Jordan Example', '1st'],
      ['Casey Sample', '2nd'],
      ['Riley Placeholder', '3rd'],
      ['Morgan Testperson', '1st'],
      ['Taylor Fakename', '2nd'],
      ['Avery Nobody', '3rd'], // "3rd+" is stored as "3rd"
    ]);
  });

  it('still drops "LinkedIn Member" cards', () => {
    const names = records.map((r) => r.name);
    expect(names).not.toContain('LinkedIn Member'); // 2nd, but anonymous
    expect(records.map((r) => r.sourceProfileUrl)).not.toContain('https://www.linkedin.com/in/ACoAAFAKE00000007/');
  });

  it('returns clean profile URLs (no query) and never the mutual-connection decoys', () => {
    expect(records.map((r) => r.sourceProfileUrl)).toEqual([
      'https://www.linkedin.com/in/jordan-example-1a2b3c/',
      'https://www.linkedin.com/in/casey-sample-4d5e6f/',
      'https://www.linkedin.com/in/riley-placeholder-7a8b9c/',
      'https://www.linkedin.com/in/morgan-testperson-0d1e2f/',
      'https://www.linkedin.com/in/taylor-fakename-3a4b5c/',
      'https://www.linkedin.com/in/avery-nobody-6d7e8f/',
    ]);
  });

  it('extracts headline and location, and leaves company to the tab registration', () => {
    const by = Object.fromEntries(records.map((r) => [r.name, r]));
    expect(by['Jordan Example']).toMatchObject({
      headline: 'Software Engineer at Example Corp',
      location: 'Exampleville, Testland',
    });
    expect(by['Casey Sample']?.headline).toBe('Technical Recruiter at Sample Labs, Inc.');
    for (const r of records) expect(r).not.toHaveProperty('company');
  });

  it('sets constant fields', () => {
    for (const r of records) {
      expect(r.source).toBe('linkedin');
      expect(r.extractorVersion).toBe('1.2.0');
      expect(r.tags).toEqual([]);
      expect(Number.isNaN(Date.parse(r.capturedAt))).toBe(false);
    }
  });

  it('keeps a 3rd-degree card whose degree text has no plus', () => {
    const doc = new DOMParser().parseFromString(
      `<div role="listitem"><p><a href="https://www.linkedin.com/in/third-1/">Third One</a><span>\u00b7 3rd</span></p><div><p><span>Engineer</span></p></div></div>
       <div role="listitem"><p><a href="https://www.linkedin.com/in/third-2/">Third Two</a><span>\u00b7 3rd+</span></p><div><p><span>Engineer</span></p></div></div>`,
      'text/html',
    );
    expect(extractSearchResults(doc).map((r) => [r.name, r.degree])).toEqual([
      ['Third One', '3rd'],
      ['Third Two', '3rd'],
    ]);
  });

  it('drops a card with no degree text', () => {
    const doc = new DOMParser().parseFromString(
      `<div role="listitem"><p><a href="https://www.linkedin.com/in/no-degree-1/">No Degree</a></p><div><p><span>Engineer</span></p></div></div>
       <div role="listitem"><p><a href="https://www.linkedin.com/in/has-degree-2/">Has Degree</a><span>\u00b7 2nd</span></p><div><p><span>Engineer</span></p></div></div>`,
      'text/html',
    );
    expect(extractSearchResults(doc).map((r) => [r.name, r.degree])).toEqual([['Has Degree', '2nd']]);
  });
});

describe('extractForPage routing', () => {
  it('extracts only on people-search pages', () => {
    expect(extractForPage(load('people-search.html'), 'https://www.linkedin.com/search/results/people/?keywords=x')).toHaveLength(6);
    expect(extractForPage(load('people-search.html'), 'https://www.linkedin.com/in/jordan-example-1a2b3c/')).toEqual([]);
    expect(extractForPage(load('people-search.html'), 'https://www.linkedin.com/feed/')).toEqual([]);
  });

  it('does not extract on company pages or company search', () => {
    expect(extractForPage(load('company-page.html'), 'https://www.linkedin.com/company/example-corp/')).toEqual([]);
    expect(extractForPage(load('people-search.html'), 'https://www.linkedin.com/search/results/companies/?keywords=x')).toEqual([]);
  });

  it('has no profile page kind', () => {
    expect(pageKind('/in/jordan-example-1a2b3c/')).toBeNull();
    expect(pageKind('/search/results/people/')).toBe('search');
    expect(pageKind('/search/results/companies/')).toBeNull();
  });
});

describe('parseEmployeesLinkIds', () => {
  const doc = load('company-page.html');

  it('reads the ids from the employees link inside main', () => {
    expect(parseEmployeesLinkIds(doc)).toEqual(['900001', '900002', '900003']);
  });

  it('ignores urn:li:company decoys and currentCompany links outside main', () => {
    const ids = parseEmployeesLinkIds(doc);
    for (const decoy of ['900011', '900012', '900013', '900014', '900015', '900016', '900090', '900091']) {
      expect(ids).not.toContain(decoy);
    }
    expect(doc.documentElement.outerHTML).toContain('urn:li:company:900012');
  });

  it('returns [] when main has no employees link, even if other company links exist', () => {
    const d = new DOMParser().parseFromString(
      `<a href="/search/results/people/?currentCompany=%5B%22900090%22%5D">outside</a>
       <main><a data-urn="urn:li:company:900012" href="/company/decoy/">Decoy</a></main>`,
      'text/html',
    );
    expect(parseEmployeesLinkIds(d)).toEqual([]);
  });

  it('accepts unencoded and relative hrefs and de-duplicates ids', () => {
    const d = new DOMParser().parseFromString(
      `<main><a href='/search/results/people/?currentCompany=["1","1","22"]'>x</a></main>`,
      'text/html',
    );
    expect(parseEmployeesLinkIds(d)).toEqual(['1', '22']);
  });

  it('skips a link with an unusable value and uses the next one', () => {
    const d = new DOMParser().parseFromString(
      `<main>
         <a href="/search/results/people/?currentCompany=%5B%22abc%22%5D">bad</a>
         <a href="/search/results/people/?currentCompany=not-json">bad</a>
         <a href="/search/results/people/?currentCompany=%5B%5D">empty</a>
         <a href="/search/results/people/?currentCompany=%5B%22777%22%5D">good</a>
       </main>`,
      'text/html',
    );
    expect(parseEmployeesLinkIds(d)).toEqual(['777']);
  });

  it('rejects more than 50 ids rather than truncating the scope', () => {
    const many = JSON.stringify(Array.from({ length: 51 }, (_, i) => String(i + 1)));
    const d = new DOMParser().parseFromString(
      `<main><a href="/search/results/people/?currentCompany=${encodeURIComponent(many)}">x</a></main>`,
      'text/html',
    );
    expect(parseEmployeesLinkIds(d)).toEqual([]);
  });
});

describe('companyNameFrom', () => {
  it('uses the h1 text', () => {
    expect(companyNameFrom(load('company-page.html'), 'example-corp')).toBe('Example Corp');
  });

  it('falls back to the title minus " | LinkedIn" and a leading "(N) "', () => {
    const d = new DOMParser().parseFromString('<title>(12) Fake  Labs | LinkedIn</title><main></main>', 'text/html');
    expect(companyNameFrom(d, 'fake-labs')).toBe('Fake Labs');
    const plain = new DOMParser().parseFromString('<title>Fake Labs | LinkedIn</title><h1> </h1>', 'text/html');
    expect(companyNameFrom(plain, 'fake-labs')).toBe('Fake Labs');
  });

  it('strips the company tab name from the title', () => {
    const d = new DOMParser().parseFromString('<title>(5) Fake Labs: Overview | LinkedIn</title><main></main>', 'text/html');
    expect(companyNameFrom(d, 'fake-labs')).toBe('Fake Labs');
    const people = new DOMParser().parseFromString('<title>Fake Labs: People | LinkedIn</title>', 'text/html');
    expect(companyNameFrom(people, 'fake-labs')).toBe('Fake Labs');
  });

  it('falls back to the given slug when there is no h1 or title', () => {
    const d = new DOMParser().parseFromString('<main></main>', 'text/html');
    expect(companyNameFrom(d, 'fake-labs')).toBe('fake-labs');
  });
});
