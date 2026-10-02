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
 * Company = text after the first " at " in the headline, cut at a separator such as " | ".
 * Returns null when there is no " at " or nothing follows it.
 */
export function companyFromHeadline(headline: string | null): string | null {
  if (!headline) return null;
  const idx = headline.indexOf(' at ');
  if (idx < 0) return null;
  let rest = headline.slice(idx + 4);
  rest = rest.split(/\s+[|·•]\s+/)[0] ?? rest;
  rest = clean(rest);
  return rest ? rest : null;
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
