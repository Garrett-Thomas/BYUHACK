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
      'Sam Singlemutual',
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
      ['Sam Singlemutual', '2nd'],
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
      'https://www.linkedin.com/in/sam-singlemutual-8a9b0c/',
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
      expect(r.extractorVersion).toBe('1.3.0');
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
       <div role="listitem"><p><a href="https://www.linkedin.com/in/has-degree-2/">Has Degree</a><span>\u00b7 2nd</span></p><div><p><span>Engineer</span></p></div><p><a href="https://www.linkedin.com/in/friend-1/">Friend One</a> is a mutual connection</p></div>`,
      'text/html',
    );
    expect(extractSearchResults(doc).map((r) => [r.name, r.degree])).toEqual([['Has Degree', '2nd']]);
  });
});

describe('mutual connections', () => {
  const records = extractSearchResults(load('people-search.html'));
  const by = Object.fromEntries(records.map((r) => [r.name, r]));

  it('reads "A & B are mutual connections" (with a followers suffix) as two mutuals, count 2', () => {
    expect(by['Casey Sample']?.mutuals).toEqual([
      { name: 'Pat Mutual', profileUrl: 'https://www.linkedin.com/in/pat-mutual-2a/' },
      { name: 'Sky Connector', profileUrl: 'https://www.linkedin.com/in/sky-connector-2b/' },
    ]);
    expect(by['Casey Sample']?.mutualCount).toBe(2);
  });

  it('reads "A is a mutual connection" as one mutual, count 1', () => {
    expect(by['Sam Singlemutual']?.mutuals).toEqual([
      { name: 'Quinn Common', profileUrl: 'https://www.linkedin.com/in/quinn-common-8a/' },
    ]);
    expect(by['Sam Singlemutual']?.mutualCount).toBe(1);
  });

  it('reads "A, B & 7 other mutual connections" as two mutuals, count 9', () => {
    expect(by['Taylor Fakename']?.mutuals.map((m) => m.name)).toEqual(['Pat Mutual', 'Robin Shared']);
    expect(by['Taylor Fakename']?.mutualCount).toBe(9);
  });

  it('drops a 2nd-degree card whose mutual line has no links', () => {
    expect(records.map((r) => r.name)).not.toContain('Drew Linkless');
  });

  it('drops a 2nd-degree card with no mutual line at all', () => {
    const doc = new DOMParser().parseFromString(
      `<div role="listitem"><p><a href="https://www.linkedin.com/in/second-1/">Second One</a><span>\u00b7 2nd</span></p><div><p><span>Engineer</span></p></div></div>`,
      'text/html',
    );
    expect(extractSearchResults(doc)).toEqual([]);
  });

  it('sends mutuals [] and mutualCount null for 1st and 3rd degree, even when the card has a mutual line', () => {
    for (const name of ['Jordan Example', 'Riley Placeholder', 'Morgan Testperson', 'Avery Nobody']) {
      expect(by[name]?.mutuals).toEqual([]);
      expect(by[name]?.mutualCount).toBeNull();
    }
  });

  it('excludes the person\'s own profile link from the mutuals and the count', () => {
    const doc = new DOMParser().parseFromString(
      `<div role="listitem">
         <p><a href="https://www.linkedin.com/in/target-1/">Target One</a><span>\u00b7 2nd</span></p>
         <div><p><span>Engineer</span></p></div>
         <p><a href="https://www.linkedin.com/in/target-1/?x=1">Target One</a> <a href="https://www.linkedin.com/in/friend-a/">Friend A</a> is a mutual connection</p>
       </div>`,
      'text/html',
    );
    const [r] = extractSearchResults(doc);
    expect(r?.mutuals).toEqual([{ name: 'Friend A', profileUrl: 'https://www.linkedin.com/in/friend-a/' }]);
    expect(r?.mutualCount).toBe(1);
  });

  it('drops a 2nd-degree card whose only mutual link is the person themselves', () => {
    const doc = new DOMParser().parseFromString(
      `<div role="listitem">
         <p><a href="https://www.linkedin.com/in/target-1/">Target One</a><span>\u00b7 2nd</span></p>
         <p><a href="https://www.linkedin.com/in/target-1/">Target One</a> is a mutual connection</p>
       </div>`,
      'text/html',
    );
    expect(extractSearchResults(doc)).toEqual([]);
  });

  it('reads only the smallest element with the mutual text, not links elsewhere in the card', () => {
    const doc = new DOMParser().parseFromString(
      `<div role="listitem"><div>
         <p><a href="https://www.linkedin.com/in/target-1/">Target One</a><span>\u00b7 2nd</span></p>
         <div><p><span>Engineer at Example Corp</span></p></div>
         <div><p><span>Exampleville</span></p></div>
         <a href="https://www.linkedin.com/in/decoy-1/">Decoy One</a>
         <div><p><span><a href="https://www.linkedin.com/in/friend-a/">Friend A</a> &amp; <a href="https://www.linkedin.com/in/friend-b/">Friend B</a> are mutual connections</span></p></div>
         <a href="https://www.linkedin.com/in/decoy-2/">Decoy Two</a>
       </div></div>`,
      'text/html',
    );
    const [r] = extractSearchResults(doc);
    expect(r?.mutuals.map((m) => m.name)).toEqual(['Friend A', 'Friend B']);
    expect(r?.mutualCount).toBe(2);
  });

  it('keeps at most 2 mutuals but counts every named one, and skips mutuals without a usable link', () => {
    const doc = new DOMParser().parseFromString(
      `<div role="listitem">
         <p><a href="https://www.linkedin.com/in/target-1/">Target One</a><span>\u00b7 2nd</span></p>
         <p><a href="/in/friend-a/">Friend A</a>, <span>Friend B</span> &amp; 3 other mutual connections \u00b7 1,204 followers</p>
       </div>`,
      'text/html',
    );
    const [r] = extractSearchResults(doc);
    expect(r?.mutuals).toEqual([{ name: 'Friend A', profileUrl: 'https://www.linkedin.com/in/friend-a/' }]);
    expect(r?.mutualCount).toBe(5); // 2 named (one unlinked) + 3 others
  });

  it('caps mutuals at 2 in page order', () => {
    const doc = new DOMParser().parseFromString(
      `<div role="listitem">
         <p><a href="https://www.linkedin.com/in/target-1/">Target One</a><span>\u00b7 2nd</span></p>
         <p><a href="/in/a/">A</a>, <a href="/in/b/">B</a>, <a href="/in/c/">C</a> &amp; 4 other mutual connections</p>
       </div>`,
      'text/html',
    );
    const [r] = extractSearchResults(doc);
    expect(r?.mutuals.map((m) => m.name)).toEqual(['A', 'B']);
    expect(r?.mutualCount).toBe(7);
  });
});

describe('extractForPage routing', () => {
  it('extracts only on people-search pages', () => {
    expect(extractForPage(load('people-search.html'), 'https://www.linkedin.com/search/results/people/?keywords=x')).toHaveLength(7);
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

  it('ignores other currentCompany links in main, like a leftover search card', () => {
    // After LinkedIn renders a company page in place, a company-search card's
    // "1 person from your school was hired here" link (another company's id) can remain in <main>.
    const d = new DOMParser().parseFromString(
      '<main><a href="/search/results/people/?currentCompany=%5B%22900500%22%5D">1 person from your school was hired here</a>' +
      '<a href="/search/results/people/?currentCompany=%5B%22900501%22%2C%22900502%22%5D">201-500 employees</a></main>', 'text/html');
    expect(parseEmployeesLinkIds(d)).toEqual(['900501', '900502']);
    const onlyDecoy = new DOMParser().parseFromString(
      '<main><a href="/search/results/people/?currentCompany=%5B%22900500%22%5D">1 person from your school was hired here</a></main>', 'text/html');
    expect(parseEmployeesLinkIds(onlyDecoy)).toEqual([]);
  });

  it('accepts the employee-count formats LinkedIn uses', () => {
    for (const text of ['10K+ employees', '501-1K employees', '201–500 employees', '2 employees', '1 employee']) {
      const d = new DOMParser().parseFromString(`<main><a href="/x?currentCompany=%5B%22900600%22%5D">${text}</a></main>`, 'text/html');
      expect(parseEmployeesLinkIds(d), text).toEqual(['900600']);
    }
  });

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
      `<main><a href='/search/results/people/?currentCompany=["1","1","22"]'>11-50 employees</a></main>`,
      'text/html',
    );
    expect(parseEmployeesLinkIds(d)).toEqual(['1', '22']);
  });

  it('skips a link with an unusable value and uses the next one', () => {
    const d = new DOMParser().parseFromString(
      `<main>
         <a href="/search/results/people/?currentCompany=%5B%22abc%22%5D">1K+ employees</a>
         <a href="/search/results/people/?currentCompany=not-json">1K+ employees</a>
         <a href="/search/results/people/?currentCompany=%5B%5D">1K+ employees</a>
         <a href="/search/results/people/?currentCompany=%5B%22777%22%5D">1K+ employees</a>
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
