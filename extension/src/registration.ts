import type { Registration } from './types';

/** A Warmline-opened tab stops being captured this long after it was registered. */
export const REGISTRATION_TTL_MS = 2 * 60 * 60 * 1000;

/** Trim, collapse inner whitespace and lowercase, so "  Acme  Corp " matches "acme corp". */
export function normalizeKeywords(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Pure: should this people-search visit be captured? Returns the company to attribute people to,
 * or null. Requires a registration that is under 2 hours old and whose keywords match the
 * search's keywords (case/whitespace-insensitive). Empty keywords never match.
 */
export function shouldCapture(
  registration: Registration | null | undefined,
  keywords: string | null | undefined,
  now: number,
): string | null {
  if (!registration) return null;
  if (!registration.company) return null;
  const age = now - registration.registeredAt;
  if (!Number.isFinite(age) || age >= REGISTRATION_TTL_MS) return null;
  const wanted = normalizeKeywords(registration.keywords);
  if (!wanted || wanted !== normalizeKeywords(keywords)) return null;
  return registration.company;
}
