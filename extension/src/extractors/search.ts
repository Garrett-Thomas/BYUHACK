import { EXTRACTOR_VERSION, type CapturedPerson, type Degree, type Mutual } from '../types';
import { clean, orNull, profileUrlFrom, textOf } from './common';

const IN_LINK = 'a[href*="/in/"]';
const MUTUAL_TEXT = /mutual connection/i;
const MAX_MUTUALS = 2;

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
 * Degree from the name line ("Name • 2nd"), read before the marker is stripped. "3rd" and "3rd+"
 * are both returned as "3rd"; anything unparseable gives null and that card is dropped.
 */
function degreeOf(anchor: Element): Degree | null {
  const line = anchor.closest('p, .entity-result__title-text') ?? anchor;
  const m = /[•·]\s*(1st|2nd|3rd)\+?(?![a-z0-9])/i.exec(textOf(line));
  const d = m?.[1]?.toLowerCase();
  return d === '1st' || d === '2nd' || d === '3rd' ? d : null;
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

/**
 * The mutual-connection line of a card: the SMALLEST element whose text matches /mutual connection/i
 * (no element inside it matches). A large ancestor also matches, but it holds the person's name,
 * headline, location and buttons, so its links and text must never be read as the mutual line.
 */
function mutualLine(card: Element, personUrl: string): Element | null {
  const matching = Array.from(card.querySelectorAll('*')).filter(
    (el) => MUTUAL_TEXT.test(el.textContent ?? '') && MUTUAL_TEXT.test(textOf(el)),
  );
  let line = matching.find((el) => !matching.some((other) => other !== el && el.contains(other))) ?? null;
  // In the "A, B & 7 other mutual connections" form, LinkedIn makes "7 other mutual connections"
  // its own link, so the smallest match holds no names. Climb (a few levels, never past the card)
  // to the element that also holds a mutual's profile link.
  const hasMutualLink = (el: Element) => Array.from(el.querySelectorAll(IN_LINK))
    .some((a) => { const u = profileUrlFrom(a.getAttribute('href')); return !!u && u !== personUrl; });
  for (let hops = 0; line && !hasMutualLink(line) && hops < 3 && line.parentElement && line !== card; hops++) {
    line = line.parentElement;
  }
  return line;
}

/** Number of names in "A", "A & B" or "A, B" (also with "and"). */
function countNames(prefix: string): number {
  return prefix.split(/\s*,\s*|\s+(?:&|and)\s+/).filter((n) => clean(n)).length;
}

/**
 * Names and "other" count from the line's text. Forms (a "· 675 followers" suffix may follow):
 *   "A & B are mutual connections", "A is a mutual connection", "A, B & 7 other mutual connections".
 * Returns null when the text is none of these (the caller then counts the links alone).
 */
function parseMutualText(text: string): { named: number; others: number } | null {
  const other = /^(.*?)\s*(?:&|and)\s+(\d[\d,]*)\s+others?\s+mutual connections?/i.exec(text);
  if (other) return { named: countNames(other[1] ?? ''), others: Number((other[2] ?? '0').replace(/,/g, '')) };
  const named = /^(.*?)\s+(?:are|is a)\s+mutual connections?/i.exec(text);
  if (named) return { named: countNames(named[1] ?? ''), others: 0 };
  return null;
}

/**
 * Linked mutuals (at most 2, page order, normalized, never the person themselves) and the total count
 * from the card's mutual line. `mutualCount` is null when the card has no mutual line.
 */
function mutualsOf(card: Element, personUrl: string): { mutuals: Mutual[]; mutualCount: number | null } {
  const line = mutualLine(card, personUrl);
  if (!line) return { mutuals: [], mutualCount: null };
  const linked: Mutual[] = [];
  for (const a of Array.from(line.querySelectorAll<HTMLAnchorElement>(IN_LINK))) {
    const profileUrl = profileUrlFrom(a.getAttribute('href'));
    const name = textOf(a);
    if (!profileUrl || !name || profileUrl === personUrl || linked.some((m) => m.profileUrl === profileUrl)) continue;
    linked.push({ name, profileUrl });
  }
  const parsed = parseMutualText(textOf(line));
  const named = Math.max(parsed?.named ?? 0, linked.length);
  return { mutuals: linked.slice(0, MAX_MUTUALS), mutualCount: named + (parsed?.others ?? 0) };
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
    // Only 2nd-degree cards carry mutuals we use. A 2nd-degree person with none linked is dropped.
    const { mutuals, mutualCount } = degree === '2nd' ? mutualsOf(card, url) : { mutuals: [], mutualCount: null };
    if (degree === '2nd' && mutuals.length === 0) continue;
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
      mutuals,
      mutualCount,
      capturedAt: now().toISOString(),
      extractorVersion: EXTRACTOR_VERSION,
    });
  }
  return out;
}
