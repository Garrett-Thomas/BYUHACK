/** Returns https://www.linkedin.com/in/<slug>/ or null if the URL isn't a LinkedIn profile URL. */
export function normalizeProfileUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  const match = /^\/in\/([^/]+)/.exec(url.pathname);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return null;
  }
  if (!slug) return null;
  return `https://www.linkedin.com/in/${encodeURIComponent(slug)}/`;
}

const TRAILING_PUNCT = /[,.\s]+$/;
const SUFFIX = /[,\s]+(?:inc|llc|ltd|corp|co)$/;

/** Lowercased, whitespace-collapsed company name with one legal suffix removed ("Stripe, Inc." -> "stripe"). */
export function normalizeCompany(raw: string): string {
  let s = raw.trim().replace(/\s+/g, " ").toLowerCase();
  s = s.replace(TRAILING_PUNCT, "");
  const stripped = s.replace(SUFFIX, "");
  if (stripped) s = stripped.replace(TRAILING_PUNCT, "");
  return s;
}
