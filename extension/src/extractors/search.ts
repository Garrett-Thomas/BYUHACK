import { EXTRACTOR_VERSION, type CapturedPerson, type Degree } from '../types';
import { clean, orNull, profileUrlFrom, textOf } from './common';

const IN_LINK = 'a[href*="/in/"]';

/**
 * Selectors, in priority order.
 * PRIMARY (seen in the saved page): result cards are [role="listitem"] elements; the name is
 *   `p > a[href*="/in/"]`, and the headline and location are the next two sibling <div><p><span>.
 *   LinkedIn's class names are hashed per build, so classes are never used.
 * FALLBACK (guesses, older "entity-result" markup): li.reusable-search__result-container,
 *   .entity-result__title-text a, .entity-result__primary-subtitle, .entity-result__secondary-subtitle.
 */
function cardRoots(doc: Document): Element[] {
  const sel = '[role="listitem"], li.reusable-search__result-container, li.entity-result, li';
  return Array.from(doc.querySelectorAll(sel));
}

function nameAnchor(card: Element): HTMLAnchorElement | null {
  const strict = Array.from(card.querySelectorAll<HTMLAnchorElement>(`p > ${IN_LINK}`));
  const classic = Array.from(card.querySelectorAll<HTMLAnchorElement>(`.entity-result__title-text ${IN_LINK}`));
  for (const a of [...strict, ...classic, ...Array.from(card.querySelectorAll<HTMLAnchorElement>(IN_LINK))]) {
    if (textOf(a) && profileUrlFrom(a.getAttribute('href'))) return a;
  }
  return null;
}

function stripDegree(s: string): string {
  return clean(s.replace(/[•·]\s*(1st|2nd|3rd\+?)\s*$/i, ''));
}

/**
 * Degree from the name line ("Name • 2nd"), read before the marker is stripped. Only 1st and 2nd
 * are returned; "3rd" / "3rd+" and anything unparseable give null, and those cards are dropped.
 */
function degreeOf(anchor: Element): Degree | null {
  const line = anchor.closest('p, .entity-result__title-text') ?? anchor;
  const m = /[•·]\s*(1st|2nd|3rd)\+?(?![a-z0-9])/i.exec(textOf(line));
  const d = m?.[1]?.toLowerCase();
  return d === '1st' || d === '2nd' ? d : null;
}

function subtitles(anchor: Element, card: Element): { headline: string; location: string } {
  // Primary: siblings that follow the name <p> inside its parent container.
  const p = anchor.closest('p');
  if (p?.parentElement) {
    const rest = Array.from(p.parentElement.children).filter((c) => c !== p && textOf(c));
    if (rest.length > 0) {
      return { headline: textOf(rest[0]), location: textOf(rest[1]) };
    }
  }
  // Fallback: classic class names.
  return {
    headline: textOf(card.querySelector('.entity-result__primary-subtitle')),
    location: textOf(card.querySelector('.entity-result__secondary-subtitle')),
  };
}

export function extractSearchResults(doc: Document, now: () => Date = () => new Date()): CapturedPerson[] {
  const seen = new Set<string>();
  const out: CapturedPerson[] = [];
  for (const card of cardRoots(doc)) {
    const a = nameAnchor(card);
    if (!a) continue;
    const url = profileUrlFrom(a.getAttribute('href'));
    if (!url || seen.has(url)) continue;
    const degree = degreeOf(a);
    if (!degree) continue;
    const name = stripDegree(textOf(a)) || clean(card.querySelector('img[alt]')?.getAttribute('alt'));
    if (!name || /^linkedin member$/i.test(name)) continue;
    seen.add(url);
    const { headline, location } = subtitles(a, card);
    const h = orNull(headline);
    out.push({
      source: 'linkedin',
      sourceProfileUrl: url,
      name,
      headline: h,
      degree,
      location: orNull(location),
      notes: null,
      tags: [],
      capturedAt: now().toISOString(),
      extractorVersion: EXTRACTOR_VERSION,
    });
  }
  return out;
}
