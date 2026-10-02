import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractForPage, extractSearchResults, pageKind } from '../src/extractors';

function load(name: string): Document {
  const html = readFileSync(join(process.cwd(), 'fixtures', name), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('people-search extractor', () => {
  const records = extractSearchResults(load('people-search.html'));

  it('keeps one record per 1st/2nd-degree person card and ignores everything else', () => {
    expect(records.map((r) => r.name)).toEqual(['Jordan Example', 'Casey Sample', 'Morgan Testperson', 'Taylor Fakename']);
  });

  it('returns the degree parsed from the name line', () => {
    expect(records.map((r) => [r.name, r.degree])).toEqual([
      ['Jordan Example', '1st'],
      ['Casey Sample', '2nd'],
      ['Morgan Testperson', '1st'],
      ['Taylor Fakename', '2nd'],
    ]);
  });

  it('drops 3rd-degree, 3rd+ and "LinkedIn Member" cards', () => {
    const names = records.map((r) => r.name);
    expect(names).not.toContain('Riley Placeholder'); // 3rd
    expect(names).not.toContain('Avery Nobody'); // 3rd+
    expect(names).not.toContain('LinkedIn Member'); // 2nd, but anonymous
    expect(records.map((r) => r.sourceProfileUrl)).not.toContain('https://www.linkedin.com/in/ACoAAFAKE00000007/');
  });

  it('returns clean profile URLs (no query) and never the mutual-connection decoys', () => {
    expect(records.map((r) => r.sourceProfileUrl)).toEqual([
      'https://www.linkedin.com/in/jordan-example-1a2b3c/',
      'https://www.linkedin.com/in/casey-sample-4d5e6f/',
      'https://www.linkedin.com/in/morgan-testperson-0d1e2f/',
      'https://www.linkedin.com/in/taylor-fakename-3a4b5c/',
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
      expect(r.extractorVersion).toBe('1.1.0');
      expect(r.tags).toEqual([]);
      expect(Number.isNaN(Date.parse(r.capturedAt))).toBe(false);
    }
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
    expect(extractForPage(load('people-search.html'), 'https://www.linkedin.com/search/results/people/?keywords=x')).toHaveLength(4);
    expect(extractForPage(load('people-search.html'), 'https://www.linkedin.com/in/jordan-example-1a2b3c/')).toEqual([]);
    expect(extractForPage(load('people-search.html'), 'https://www.linkedin.com/feed/')).toEqual([]);
  });

  it('has no profile page kind', () => {
    expect(pageKind('/in/jordan-example-1a2b3c/')).toBeNull();
    expect(pageKind('/search/results/people/')).toBe('search');
    expect(pageKind('/search/results/companies/')).toBeNull();
  });
});
