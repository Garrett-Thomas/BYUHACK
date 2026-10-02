import { EXTRACTOR_VERSION, type ConnectionInput } from '../types';
import { clean, companyFromHeadline, orNull, profileUrlFrom, textOf } from './common';

function first(doc: Document, selectors: string[]): Element | null {
  for (const s of selectors) {
    const el = doc.querySelector(s);
    if (el && textOf(el)) return el;
  }
  return null;
}

/**
 * ALL profile selectors are GUESSES: the saved page held only a search-results page.
 * They follow LinkedIn's long-standing profile top-card conventions, with several fallbacks.
 */
export function extractProfile(
  doc: Document,
  pageUrl: string = doc.location?.href ?? '',
  now: () => Date = () => new Date(),
): ConnectionInput[] {
  const url =
    profileUrlFrom(pageUrl) ??
    profileUrlFrom(doc.querySelector('a[href*="/in/"][href*="contact-info"]')?.getAttribute('href'));
  if (!url) return [];

  const nameEl = first(doc, [
    'main section h1.text-heading-xlarge',
    'h1.text-heading-xlarge',
    '.pv-top-card h1',
    'main h1',
    'h1',
  ]);
  let name = textOf(nameEl);
  if (!name) {
    const title = clean(doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? doc.title);
    name = clean(title.split(/\s[|\-–]\s/)[0]);
  }
  if (!name || /^linkedin$/i.test(name)) return [];

  let headlineEl = first(doc, [
    '.pv-top-card .text-body-medium.break-words',
    'div.text-body-medium.break-words',
    '[data-generated-suggestion-target]',
    '.pv-text-details__left-panel .text-body-medium',
  ]);
  if (!headlineEl && nameEl) {
    // Structural fallback: the next non-empty block after the name's container.
    let n: Element | null = nameEl.parentElement?.parentElement ?? null;
    n = n?.nextElementSibling ?? null;
    if (n && textOf(n)) headlineEl = n;
  }
  const headline = orNull(textOf(headlineEl));

  const locationEl = first(doc, [
    '.pv-top-card span.text-body-small.inline.t-black--light.break-words',
    'span.text-body-small.inline.t-black--light.break-words',
    '.pv-text-details__left-panel span.text-body-small',
  ]);

  return [
    {
      source: 'linkedin',
      sourceProfileUrl: url,
      name,
      headline,
      company: companyFromHeadline(headline),
      location: orNull(textOf(locationEl)),
      notes: null,
      tags: [],
      capturedAt: now().toISOString(),
      extractorVersion: EXTRACTOR_VERSION,
    },
  ];
}
