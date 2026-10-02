/** Shared helpers for the pure DOM extractors. Nothing here touches chrome.* or the network. */

export function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Text of an element, ignoring svg and visually-hidden helper text. */
export function textOf(el: Element | null | undefined): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('svg, script, style, .visually-hidden, .a11y-text').forEach((n) => n.remove());
  return clean(clone.textContent);
}

export function orNull(s: string): string | null {
  return s ? s : null;
}

/**
 * Absolute linkedin.com/in/<slug>/ URL (query, hash and deeper path dropped), or null.
 * The server does the authoritative normalization; this just avoids sending junk.
 */
export function profileUrlFrom(href: string | null | undefined, base = 'https://www.linkedin.com/'): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, base);
    if (u.hostname !== 'linkedin.com' && !u.hostname.endsWith('.linkedin.com')) return null;
    const m = /^\/in\/([^/]+)/.exec(u.pathname);
    if (!m || !m[1]) return null;
    return `https://www.linkedin.com/in/${m[1]}/`;
  } catch {
    return null;
  }
}

/** LinkedIn company ids come as a JSON array of digit strings in the `currentCompany` param. */
export const MAX_COMPANY_IDS = 50;
const COMPANY_ID = /^\d{1,15}$/;

export function isCompanyId(s: unknown): s is string {
  return typeof s === 'string' && COMPANY_ID.test(s);
}

/**
 * Parse a `currentCompany` value like `["1441","16140"]` into de-duplicated digit-string ids.
 * Anything unusable (not JSON, not an array, empty, over 50 ids, or any entry that is not
 * 1-15 digits) gives [] so a malformed scope is never half-applied.
 */
export function parseCompanyIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_COMPANY_IDS) return [];
  const out: string[] = [];
  for (const entry of value) {
    const id = typeof entry === 'number' && Number.isSafeInteger(entry) && entry >= 0 ? String(entry) : entry;
    if (!isCompanyId(id)) return [];
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
