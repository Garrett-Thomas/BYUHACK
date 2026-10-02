import { pageKind } from './extractors';
import { parseCompanyIds } from './extractors/common';
import type { Registration } from './types';

/** A Warmline-opened tab stops being used this long after it was registered. */
export const REGISTRATION_TTL_MS = 2 * 60 * 60 * 1000;

export const MAX_COMPANY_LENGTH = 200;

function parseLinkedInUrl(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    if (u.hostname !== 'linkedin.com' && !u.hostname.endsWith('.linkedin.com')) return null;
    return u;
  } catch {
    return null;
  }
}

/** Pure: is the registration under 2 hours old (and does it have a usable company and timestamp)? */
export function isFresh(registration: Registration | null | undefined, now: number): registration is Registration {
  if (!registration || !registration.company) return false;
  const age = now - registration.registeredAt;
  return Number.isFinite(age) && age < REGISTRATION_TTL_MS;
}

/** The `<slug>` of a `/company/<slug>/...` path, or null for any other path. */
export function companySlugFromPath(pathname: string): string | null {
  const m = /^\/company\/([^/]+)(\/|$)/.exec(pathname);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * Pure: the registration a URL asks for, or null.
 * - Company search (`/search/results/companies/`) with `warmline` and `wl_mode=company`: company mode.
 * - People search with `warmline` and a valid `currentCompany`: people mode, ids from that param.
 * Anything else, including a people search with no `currentCompany`, registers nothing.
 */
export function registrationFromUrl(url: string | null | undefined, now: number): Registration | null {
  const u = parseLinkedInUrl(url);
  if (!u) return null;
  const company = (u.searchParams.get('warmline') ?? '').trim();
  if (!company || company.length > MAX_COMPANY_LENGTH) return null;
  if (/^\/search\/results\/companies(\/|$)/.test(u.pathname)) {
    return u.searchParams.get('wl_mode') === 'company' ? { mode: 'company', company, registeredAt: now } : null;
  }
  if (pageKind(u.pathname) === 'search') {
    const ids = parseCompanyIds(u.searchParams.get('currentCompany'));
    return ids.length > 0 ? { mode: 'people', company, ids, registeredAt: now } : null;
  }
  return null;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

/**
 * Pure: should this people-search visit be captured? Returns the company to attribute people to, or
 * null. Requires a people-mode registration under 2 hours old and a people-search URL whose
 * `currentCompany` ids equal the registered ids (order-insensitive). A people search with no
 * `currentCompany` is never captured.
 */
export function shouldCapture(
  registration: Registration | null | undefined,
  url: string | null | undefined,
  now: number,
): string | null {
  if (!isFresh(registration, now) || registration.mode !== 'people') return null;
  const u = parseLinkedInUrl(url);
  if (!u || pageKind(u.pathname) !== 'search') return null;
  if (!Array.isArray(registration.ids)) return null;
  return sameSet(registration.ids, parseCompanyIds(u.searchParams.get('currentCompany'))) ? registration.company : null;
}

/** Pure: should the "Save as <company>" button appear on this page? Company mode, fresh, `/company/<slug>/`. */
export function showSaveButton(registration: Registration | null | undefined, url: string | null | undefined, now: number): boolean {
  if (!isFresh(registration, now) || registration.mode !== 'company') return false;
  const u = parseLinkedInUrl(url);
  return !!u && companySlugFromPath(u.pathname) !== null;
}

/** The 1st-degree, company-scoped people search that follows a successful Save. Every param is encoded. */
export function firstDegreePeopleUrl(company: string, ids: readonly string[]): string {
  const params: Array<[string, string]> = [
    ['currentCompany', JSON.stringify(ids)],
    ['network', JSON.stringify(['F'])],
    ['origin', 'COMPANY_PAGE_CANNED_SEARCH'],
    ['warmline', company],
  ];
  return `https://www.linkedin.com/search/results/people/?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}
