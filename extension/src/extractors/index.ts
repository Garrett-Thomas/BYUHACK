import type { ConnectionInput } from '../types';
import { extractProfile } from './profile';
import { extractSearchResults } from './search';

export { extractProfile, extractSearchResults };
export { companyFromHeadline } from './common';

export type PageKind = 'profile' | 'search' | null;

export function pageKind(pathname: string): PageKind {
  if (/^\/in\/[^/]+/.test(pathname)) return 'profile';
  if (/^\/search\/results\/people(\/|$)/.test(pathname)) return 'search';
  return null;
}

/** Pure: (document, url) -> records for whatever supported page this is. */
export function extractForPage(doc: Document, url: string): ConnectionInput[] {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return [];
  }
  switch (pageKind(pathname)) {
    case 'profile':
      return extractProfile(doc, url);
    case 'search':
      return extractSearchResults(doc);
    default:
      return [];
  }
}
