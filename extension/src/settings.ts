import { DEFAULT_SETTINGS, type Settings } from './types';

export async function loadSettings(): Promise<Settings> {
  try {
    const { settings } = await chrome.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

export function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/** Returns a normalized base URL (no trailing slash) or null if unusable. */
export function parseServerUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.protocol === 'http:' && !isLocalHost(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

export function baseUrl(raw: string): string {
  const u = parseServerUrl(raw);
  return u ? u.origin + u.pathname.replace(/\/+$/, '') : '';
}
