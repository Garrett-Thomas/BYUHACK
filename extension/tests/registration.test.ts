import { describe, expect, it } from 'vitest';
import {
  REGISTRATION_TTL_MS,
  companySlugFromPath,
  firstDegreePeopleUrl,
  registrationFromUrl,
  shouldCapture,
  showSaveButton,
} from '../src/registration';
import type { Registration } from '../src/types';

const T0 = 1_700_000_000_000;
const people: Registration = { mode: 'people', company: 'Acme Corp', ids: ['101', '202', '303'], registeredAt: T0 };
const company: Registration = { mode: 'company', company: 'Acme Corp', registeredAt: T0 };

const ids = (list: string[]): string => encodeURIComponent(JSON.stringify(list));
const peopleUrl = (list: string[], extra = ''): string =>
  `https://www.linkedin.com/search/results/people/?currentCompany=${ids(list)}&network=%5B%22F%22%5D${extra}`;

describe('shouldCapture', () => {
  it('returns the registered company for a fresh people registration and matching ids', () => {
    expect(shouldCapture(people, peopleUrl(['101', '202', '303']), T0)).toBe('Acme Corp');
    expect(shouldCapture(people, peopleUrl(['101', '202', '303']), T0 + 60_000)).toBe('Acme Corp');
  });

  it('compares the currentCompany ids as a set, ignoring order and duplicates', () => {
    expect(shouldCapture(people, peopleUrl(['303', '101', '202']), T0)).toBe('Acme Corp');
    expect(shouldCapture(people, peopleUrl(['202', '202', '303', '101']), T0)).toBe('Acme Corp');
  });

  it('accepts unencoded brackets and ignores the warmline marker being present or not', () => {
    const raw = 'https://www.linkedin.com/search/results/people/?currentCompany=["303","101","202"]&network=["S"]&warmline=Acme%20Corp';
    expect(shouldCapture(people, raw, T0)).toBe('Acme Corp');
  });

  it('returns null when the ids differ (subset, superset or different)', () => {
    expect(shouldCapture(people, peopleUrl(['101', '202']), T0)).toBeNull();
    expect(shouldCapture(people, peopleUrl(['101', '202', '303', '404']), T0)).toBeNull();
    expect(shouldCapture(people, peopleUrl(['101', '202', '999']), T0)).toBeNull();
  });

  it('never captures an unscoped people search, including a keyword search', () => {
    expect(shouldCapture(people, 'https://www.linkedin.com/search/results/people/?keywords=Acme%20Corp', T0)).toBeNull();
    expect(shouldCapture(people, 'https://www.linkedin.com/search/results/people/?keywords=Acme%20Corp&warmline=Acme%20Corp', T0)).toBeNull();
    expect(shouldCapture(people, 'https://www.linkedin.com/search/results/people/', T0)).toBeNull();
    expect(shouldCapture(people, 'https://www.linkedin.com/search/results/people/?currentCompany=%5B%5D', T0)).toBeNull();
    expect(shouldCapture(people, 'https://www.linkedin.com/search/results/people/?currentCompany=garbage', T0)).toBeNull();
  });

  it('never matches an empty registered id list', () => {
    expect(shouldCapture({ ...people, ids: [] } as Registration, peopleUrl(['101']), T0)).toBeNull();
    expect(shouldCapture({ ...people, ids: [] } as Registration, 'https://www.linkedin.com/search/results/people/', T0)).toBeNull();
  });

  it('returns null for a tab that was never registered', () => {
    expect(shouldCapture(undefined, peopleUrl(['101', '202', '303']), T0)).toBeNull();
    expect(shouldCapture(null, peopleUrl(['101', '202', '303']), T0)).toBeNull();
  });

  it('returns null for a company-mode registration', () => {
    expect(shouldCapture(company, peopleUrl(['101', '202', '303']), T0)).toBeNull();
  });

  it('returns null for a pre-1.2 registration with no mode', () => {
    const old = { company: 'Acme Corp', keywords: 'Acme Corp', registeredAt: T0 } as unknown as Registration;
    expect(shouldCapture(old, 'https://www.linkedin.com/search/results/people/?keywords=Acme%20Corp', T0)).toBeNull();
  });

  it('expires after 2 hours', () => {
    expect(REGISTRATION_TTL_MS).toBe(2 * 60 * 60 * 1000);
    const url = peopleUrl(['101', '202', '303']);
    expect(shouldCapture(people, url, T0 + REGISTRATION_TTL_MS - 1)).toBe('Acme Corp');
    expect(shouldCapture(people, url, T0 + REGISTRATION_TTL_MS)).toBeNull();
    expect(shouldCapture(people, url, T0 + REGISTRATION_TTL_MS + 1)).toBeNull();
  });

  it('returns null for pages that are not people searches or not on linkedin.com', () => {
    const q = `?currentCompany=${ids(['101', '202', '303'])}`;
    expect(shouldCapture(people, `https://www.linkedin.com/search/results/companies/${q}`, T0)).toBeNull();
    expect(shouldCapture(people, `https://www.linkedin.com/in/someone/${q}`, T0)).toBeNull();
    expect(shouldCapture(people, `https://example.com/search/results/people/${q}`, T0)).toBeNull();
    expect(shouldCapture(people, `http://www.linkedin.com/search/results/people/${q}`, T0)).toBeNull();
    expect(shouldCapture(people, 'not a url', T0)).toBeNull();
    expect(shouldCapture(people, null, T0)).toBeNull();
    expect(shouldCapture(people, undefined, T0)).toBeNull();
  });

  it('returns null for a registration with no company or a corrupt timestamp', () => {
    const url = peopleUrl(['101', '202', '303']);
    expect(shouldCapture({ ...people, company: '' }, url, T0)).toBeNull();
    expect(shouldCapture({ ...people, registeredAt: Number.NaN }, url, T0)).toBeNull();
  });
});

describe('showSaveButton', () => {
  const page = 'https://www.linkedin.com/company/example-corp/';

  it('shows only for a fresh company-mode registration on a company page', () => {
    expect(showSaveButton(company, page, T0)).toBe(true);
    expect(showSaveButton(company, `${page}about/`, T0 + 60_000)).toBe(true);
    expect(showSaveButton(company, 'https://www.linkedin.com/company/example-corp', T0)).toBe(true);
  });

  it('does not show for a people-mode or missing registration', () => {
    expect(showSaveButton(people, page, T0)).toBe(false);
    expect(showSaveButton(undefined, page, T0)).toBe(false);
    expect(showSaveButton(null, page, T0)).toBe(false);
  });

  it('does not show on other pages or hosts', () => {
    expect(showSaveButton(company, 'https://www.linkedin.com/feed/', T0)).toBe(false);
    expect(showSaveButton(company, 'https://www.linkedin.com/company/', T0)).toBe(false);
    expect(showSaveButton(company, 'https://www.linkedin.com/in/company/x/', T0)).toBe(false);
    expect(showSaveButton(company, 'https://www.linkedin.com/search/results/companies/?keywords=x', T0)).toBe(false);
    expect(showSaveButton(company, 'https://www.linkedin.com/example-corp/', T0)).toBe(false);
    expect(showSaveButton(company, 'https://example.com/company/example-corp/', T0)).toBe(false);
    expect(showSaveButton(company, 'junk', T0)).toBe(false);
    expect(showSaveButton(company, null, T0)).toBe(false);
  });

  it('expires after 2 hours', () => {
    expect(showSaveButton(company, page, T0 + REGISTRATION_TTL_MS - 1)).toBe(true);
    expect(showSaveButton(company, page, T0 + REGISTRATION_TTL_MS)).toBe(false);
  });
});

describe('registrationFromUrl', () => {
  it('registers company mode from a company search with warmline and wl_mode=company', () => {
    expect(
      registrationFromUrl('https://www.linkedin.com/search/results/companies/?keywords=Acme%20Corp&warmline=Acme%20Corp&wl_mode=company', T0),
    ).toEqual({ mode: 'company', company: 'Acme Corp', registeredAt: T0 });
  });

  it('does not register a company search without wl_mode=company or without warmline', () => {
    expect(registrationFromUrl('https://www.linkedin.com/search/results/companies/?keywords=x&warmline=Acme', T0)).toBeNull();
    expect(registrationFromUrl('https://www.linkedin.com/search/results/companies/?keywords=x&wl_mode=company', T0)).toBeNull();
    expect(registrationFromUrl('https://www.linkedin.com/search/results/companies/?keywords=x&warmline=%20&wl_mode=company', T0)).toBeNull();
  });

  it('registers people mode from a people search with warmline and currentCompany', () => {
    expect(registrationFromUrl(peopleUrl(['101', '202'], '&origin=COMPANY_PAGE_CANNED_SEARCH&warmline=Acme%20Corp'), T0)).toEqual({
      mode: 'people',
      company: 'Acme Corp',
      ids: ['101', '202'],
      registeredAt: T0,
    });
  });

  it('does not register a people search without currentCompany (keyword searches never register)', () => {
    expect(registrationFromUrl('https://www.linkedin.com/search/results/people/?keywords=Acme&warmline=Acme', T0)).toBeNull();
    expect(registrationFromUrl(peopleUrl(['abc'], '&warmline=Acme'), T0)).toBeNull();
  });

  it('does not register a people search with currentCompany but no warmline marker', () => {
    expect(registrationFromUrl(peopleUrl(['101']), T0)).toBeNull();
  });

  it('registers nothing on other pages, hosts, or an over-long company', () => {
    expect(registrationFromUrl('https://www.linkedin.com/feed/?warmline=Acme&wl_mode=company', T0)).toBeNull();
    expect(registrationFromUrl('https://www.linkedin.com/company/acme/?warmline=Acme&wl_mode=company', T0)).toBeNull();
    expect(registrationFromUrl('https://example.com/search/results/companies/?warmline=Acme&wl_mode=company', T0)).toBeNull();
    expect(registrationFromUrl(`https://www.linkedin.com/search/results/companies/?warmline=${'a'.repeat(201)}&wl_mode=company`, T0)).toBeNull();
    expect(registrationFromUrl('nope', T0)).toBeNull();
    expect(registrationFromUrl(undefined, T0)).toBeNull();
  });
});

describe('companySlugFromPath', () => {
  it('reads the slug from /company/<slug>/ paths only', () => {
    expect(companySlugFromPath('/company/example-corp/')).toBe('example-corp');
    expect(companySlugFromPath('/company/example-corp')).toBe('example-corp');
    expect(companySlugFromPath('/company/example-corp/about/')).toBe('example-corp');
    expect(companySlugFromPath('/company/')).toBeNull();
    expect(companySlugFromPath('/companyx/foo/')).toBeNull();
    expect(companySlugFromPath('/in/company/foo/')).toBeNull();
  });
});

describe('firstDegreePeopleUrl', () => {
  it('builds the 1st-degree scoped search with every param encoded and the warmline marker', () => {
    const url = firstDegreePeopleUrl('Acme & Sons, Inc.', ['101', '202']);
    expect(url).toBe(
      'https://www.linkedin.com/search/results/people/?currentCompany=%5B%22101%22%2C%22202%22%5D&network=%5B%22F%22%5D&origin=COMPANY_PAGE_CANNED_SEARCH&warmline=Acme%20%26%20Sons%2C%20Inc.',
    );
    const u = new URL(url);
    expect(u.searchParams.get('currentCompany')).toBe('["101","202"]');
    expect(u.searchParams.get('network')).toBe('["F"]');
    expect(u.searchParams.get('warmline')).toBe('Acme & Sons, Inc.');
  });

  it('round-trips into a people-mode registration that shouldCapture accepts', () => {
    const url = firstDegreePeopleUrl('Acme Corp', ['101', '202', '303']);
    const reg = registrationFromUrl(url, T0);
    expect(reg).toEqual({ mode: 'people', company: 'Acme Corp', ids: ['101', '202', '303'], registeredAt: T0 });
    expect(shouldCapture(reg, url, T0)).toBe('Acme Corp');
  });
});
