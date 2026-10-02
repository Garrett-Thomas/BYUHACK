import { describe, expect, it } from 'vitest';
import { REGISTRATION_TTL_MS, normalizeKeywords, shouldCapture } from '../src/registration';
import type { Registration } from '../src/types';

const T0 = 1_700_000_000_000;
const reg: Registration = { company: 'Acme Corp', keywords: 'Acme Corp', registeredAt: T0 };

describe('shouldCapture', () => {
  it('returns the registered company for a fresh registration and matching keywords', () => {
    expect(shouldCapture(reg, 'Acme Corp', T0)).toBe('Acme Corp');
    expect(shouldCapture(reg, 'Acme Corp', T0 + 60_000)).toBe('Acme Corp');
  });

  it('returns null for a tab that was never registered', () => {
    expect(shouldCapture(undefined, 'Acme Corp', T0)).toBeNull();
    expect(shouldCapture(null, 'Acme Corp', T0)).toBeNull();
  });

  it('expires after 2 hours', () => {
    expect(REGISTRATION_TTL_MS).toBe(2 * 60 * 60 * 1000);
    expect(shouldCapture(reg, 'Acme Corp', T0 + REGISTRATION_TTL_MS - 1)).toBe('Acme Corp');
    expect(shouldCapture(reg, 'Acme Corp', T0 + REGISTRATION_TTL_MS)).toBeNull();
    expect(shouldCapture(reg, 'Acme Corp', T0 + REGISTRATION_TTL_MS + 1)).toBeNull();
  });

  it('ignores case and surrounding or repeated whitespace in keywords', () => {
    expect(shouldCapture(reg, '  acme   CORP ', T0)).toBe('Acme Corp');
    expect(shouldCapture({ ...reg, keywords: ' ACME corp  ' }, 'Acme Corp', T0)).toBe('Acme Corp');
  });

  it('returns null when the search keywords differ', () => {
    expect(shouldCapture(reg, 'Globex', T0)).toBeNull();
    expect(shouldCapture(reg, 'Acme', T0)).toBeNull();
    expect(shouldCapture(reg, '', T0)).toBeNull();
    expect(shouldCapture(reg, null, T0)).toBeNull();
    expect(shouldCapture(reg, undefined, T0)).toBeNull();
  });

  it('never matches empty keywords, even against an empty registration', () => {
    expect(shouldCapture({ ...reg, keywords: '  ' }, '', T0)).toBeNull();
  });

  it('returns null for a registration with no company or a corrupt timestamp', () => {
    expect(shouldCapture({ ...reg, company: '' }, 'Acme Corp', T0)).toBeNull();
    expect(shouldCapture({ ...reg, registeredAt: Number.NaN }, 'Acme Corp', T0)).toBeNull();
  });
});

describe('normalizeKeywords', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(normalizeKeywords('  Acme \t Corp\n')).toBe('acme corp');
    expect(normalizeKeywords(null)).toBe('');
  });
});
