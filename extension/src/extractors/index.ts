import type { CapturedPerson } from '../types';
import { extractSearchResults } from './search';

export { extractSearchResults };

export type PageKind = 'search' | null;

export function pageKind(pathname: string): PageKind {
  if (/^\/search\/results\/people(\/|$)/.test(pathname)) return 'search';
  return null;
}

/** Pure: (document, url) -> records for a people-search page, nothing for any other page. */
export function extractForPage(doc: Document, url: string): CapturedPerson[] {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return [];
  }
  switch (pageKind(pathname)) {
    case 'search':
      return extractSearchResults(doc);
    default:
      return [];
  }
}
