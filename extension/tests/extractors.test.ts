import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { companyFromHeadline, extractForPage, extractProfile, extractSearchResults } from '../src/extractors';

function load(name: string): Document {
  const html = readFileSync(join(process.cwd(), 'fixtures', name), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('people-search extractor', () => {
  const records = extractSearchResults(load('people-search.html'));

  it('finds one record per person card and ignores non-person items', () => {
    expect(records.map((r) => r.name)).toEqual([
      'Jordan Example',
      'Casey Sample',
      'Riley Placeholder',
      'Morgan Testperson',
      'Taylor Fakename',
      'Avery Nobody',
    ]);
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

  it('extracts headline, location and company', () => {
    const by = Object.fromEntries(records.map((r) => [r.name, r]));
    expect(by['Jordan Example']).toMatchObject({
      headline: 'Software Engineer at Example Corp',
      company: 'Example Corp',
      location: 'Exampleville, Testland',
    });
    expect(by['Casey Sample']?.company).toBe('Sample Labs, Inc.');
    expect(by['Taylor Fakename']?.company).toBe('Demo Industries');
    expect(by['Riley Placeholder']).toMatchObject({ headline: 'Student', company: null });
    expect(by['Morgan Testperson']?.company).toBeNull();
  });

  it('sets constant fields', () => {
    for (const r of records) {
      expect(r.source).toBe('linkedin');
      expect(r.extractorVersion).toBe('1.0.0');
      expect(r.tags).toEqual([]);
      expect(Number.isNaN(Date.parse(r.capturedAt))).toBe(false);
    }
  });
});

describe('profile extractor', () => {
  const url = 'https://www.linkedin.com/in/jordan-example-1a2b3c/?trk=x';
  it('extracts the profile header', () => {
    const [r, ...rest] = extractProfile(load('profile.html'), url);
    expect(rest).toHaveLength(0);
    expect(r).toMatchObject({
      sourceProfileUrl: 'https://www.linkedin.com/in/jordan-example-1a2b3c/',
      name: 'Jordan Example',
      headline: 'Software Engineer at Example Corp',
      company: 'Example Corp',
      location: 'Exampleville, Testland',
      extractorVersion: '1.0.0',
    });
  });

  it('returns nothing when the URL is not a profile', () => {
    expect(extractProfile(new DOMParser().parseFromString('<h1>X</h1>', 'text/html'), 'https://www.linkedin.com/feed/')).toEqual([]);
  });
});

describe('extractForPage routing', () => {
  it('routes by path', () => {
    expect(extractForPage(load('people-search.html'), 'https://www.linkedin.com/search/results/people/?keywords=x')).toHaveLength(6);
    expect(extractForPage(load('profile.html'), 'https://www.linkedin.com/in/jordan-example-1a2b3c/')).toHaveLength(1);
    expect(extractForPage(load('profile.html'), 'https://www.linkedin.com/feed/')).toEqual([]);
  });
});

describe('companyFromHeadline', () => {
  it('handles absent and present " at "', () => {
    expect(companyFromHeadline(null)).toBeNull();
    expect(companyFromHeadline('Student')).toBeNull();
    expect(companyFromHeadline('Engineer at ')).toBeNull();
    expect(companyFromHeadline('Engineer at Foo | Mentor')).toBe('Foo');
    expect(companyFromHeadline('Chat about data')).toBeNull();
  });
});
