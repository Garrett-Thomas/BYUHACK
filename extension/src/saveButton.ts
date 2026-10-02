import { companyNameFrom, parseEmployeesLinkIds } from './extractors';
import { connectionsPeopleUrl } from './registration';
import type { Message, SaveCompanyResponse } from './types';

/** How long to wait for the "N employees" link before showing the disabled state. */
export const EMPLOYEES_WAIT_MS = 10000;
const DEBOUNCE_MS = 250;

const NO_EMPLOYEES = "LinkedIn doesn't list employees for this page";
const SERVER_ERROR = "Couldn't reach Warmline — is the server running?";

export interface SaveButtonHandle {
  slug: string;
  destroy(): void;
}

export interface SaveButtonOptions {
  slug: string;
  /** The Warmline company the user is linking. */
  company: string;
  /** Message to the background worker. Defaults to chrome.runtime.sendMessage. */
  send?: (msg: Message) => Promise<unknown>;
  /** Navigation after a successful save. Defaults to location.replace. */
  navigate?: (url: string) => void;
  /** Whether this company page was rendered in place by LinkedIn's SPA. Defaults to landedInPlace(slug). */
  inPlace?: boolean;
  /** Full reload of the page. Defaults to location.reload. */
  reload?: () => void;
}

/** How long an in-place company page gets to show its employees link before the one-time reload. */
export const IN_PLACE_WAIT_MS = 3000;

/**
 * LinkedIn renders a company page reached from search results in place, and that version shows the
 * employee count as plain text, without the `currentCompany` link. A full load of the same URL has
 * the link. True when the document was originally loaded for a different page than this company.
 */
export function landedInPlace(slug: string): boolean {
  const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
  if (!nav?.name) return false;
  try {
    return new URL(nav.name).pathname.split('/')[2]?.toLowerCase() !== slug.toLowerCase();
  } catch {
    return false;
  }
}

/** Reload at most once per company per tab, so a page that truly has no link can't loop. */
function claimReload(slug: string): boolean {
  const key = 'warmline-reloaded:' + slug.toLowerCase();
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}

// A company page reached by SPA navigation can briefly still show the previous company's
// employees link. Remember the last one seen so it is ignored when the slug has changed.
let lastSlug = '';
let lastIdsKey = '';

const idsKey = (ids: readonly string[]): string => [...ids].sort().join(',');

const HOST_CSS = [
  'all:initial',
  'position:fixed',
  'right:16px',
  'top:72px', // below LinkedIn's fixed nav bar
  'z-index:2147483647',
  'box-sizing:border-box',
  'max-width:min(360px,calc(100vw - 32px))',
  'padding:8px',
  'background:#ffffff',
  'border:1px solid #d0d7de',
  'border-radius:10px',
  'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
  'font:600 14px/1.3 system-ui,-apple-system,Segoe UI,sans-serif',
  'color:#1f2328',
].join(';');
const ROW_CSS = 'display:flex;align-items:flex-start;gap:6px';
const SAVE_CSS = [
  'flex:1 1 auto',
  'padding:8px 12px',
  'border:0',
  'border-radius:8px',
  'background:#0a66c2',
  'color:#ffffff',
  'font:inherit',
  'text-align:left',
  'cursor:pointer',
  'white-space:normal',
  'word-break:break-word',
].join(';');
const CLOSE_CSS = 'flex:none;width:28px;height:28px;border:0;border-radius:6px;background:transparent;color:#57606a;font:20px/1 system-ui,sans-serif;cursor:pointer';
const NOTE_CSS = 'margin:6px 4px 0;font:400 12px/1.3 system-ui,sans-serif;color:#b42318';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  return e;
}

/** Avoid needless DOM writes: this page is observed with a MutationObserver. */
function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * Inject the fixed-position "Save <LinkedIn name> as <company>" button on a company page. Inline
 * styles only; every name goes in through textContent. The button appears once the page's employees
 * link (`main a[href*="currentCompany"]`) is present, or disabled after 10s without one. A page LinkedIn
 * rendered in place gets one full reload first (see landedInPlace). It reads nothing else, clicks
 * nothing, scrolls nothing. Besides that reload, the only navigation is `location.replace` to the
 * scoped people search, after the user clicks and the server confirms.
 */
export function mountSaveButton(opts: SaveButtonOptions): SaveButtonHandle {
  const { slug, company } = opts;
  const send = opts.send ?? ((msg: Message) => chrome.runtime.sendMessage(msg));
  const navigate = opts.navigate ?? ((url: string) => location.replace(url));
  const reload = opts.reload ?? (() => location.reload());
  const inPlace = opts.inPlace ?? landedInPlace(slug);
  const stale = lastSlug && lastSlug !== slug ? lastIdsKey : '';

  let destroyed = false;
  let busy = false;
  let timedOut = false;
  let ids: string[] = [];
  let error = '';
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let waitTimer: ReturnType<typeof setTimeout> | undefined;
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;

  const host = el('div', HOST_CSS);
  host.setAttribute('data-warmline', 'save-company');
  const row = el('div', ROW_CSS);
  const save = el('button', SAVE_CSS);
  save.type = 'button';
  const close = el('button', CLOSE_CSS);
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Dismiss');
  const note = el('div', NOTE_CSS);
  note.setAttribute('role', 'status');
  row.append(save, close);
  host.append(row, note);

  const currentIds = (): string[] => {
    const found = parseEmployeesLinkIds(document);
    return found.length > 0 && idsKey(found) !== stale ? found : [];
  };

  const render = (): void => {
    const name = companyNameFrom(document, slug);
    const ready = ids.length > 0;
    setText(save, busy ? 'Saving…' : ready ? `Save "${name}" as "${company}"` : NO_EMPLOYEES);
    save.disabled = busy || !ready;
    save.style.opacity = save.disabled ? '0.6' : '1';
    save.style.cursor = save.disabled ? 'default' : 'pointer';
    setText(note, error);
    note.style.display = error ? 'block' : 'none';
    if (!host.isConnected) (document.body ?? document.documentElement)?.append(host);
  };

  const check = (): void => {
    if (destroyed || busy) return;
    ids = currentIds();
    if (ids.length > 0) {
      lastSlug = slug;
      lastIdsKey = idsKey(ids);
    }
    if (ids.length > 0 || timedOut || host.isConnected) render();
  };

  const observer = new MutationObserver((records) => {
    if (records.every((r) => host.contains(r.target))) return;
    clearTimeout(debounce);
    debounce = setTimeout(check, DEBOUNCE_MS);
  });

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    observer.disconnect();
    clearTimeout(debounce);
    clearTimeout(waitTimer);
    clearTimeout(reloadTimer);
    host.remove();
  };

  save.addEventListener('click', () => {
    void (async () => {
      if (busy || destroyed) return;
      // Re-read at click time: the user may have moved on since the button rendered.
      const now = currentIds();
      if (now.length === 0) {
        ids = [];
        timedOut = true;
        render();
        return;
      }
      ids = now;
      busy = true;
      error = '';
      render();
      let res: SaveCompanyResponse | undefined;
      try {
        res = (await send({ type: 'saveCompany', slug, linkedinName: companyNameFrom(document, slug), ids })) as SaveCompanyResponse | undefined;
      } catch {
        res = undefined;
      }
      if (destroyed) return;
      if (res?.ok && typeof res.company === 'string' && Array.isArray(res.ids) && res.ids.length > 0) {
        navigate(connectionsPeopleUrl(res.company, res.ids));
        return;
      }
      busy = false;
      error = SERVER_ERROR;
      render();
    })();
  });
  close.addEventListener('click', destroy);

  // Observe the document, not documentElement, which may not exist yet at document_start.
  observer.observe(document, { childList: true, subtree: true });
  if (inPlace) {
    reloadTimer = setTimeout(() => {
      if (!destroyed && !busy && currentIds().length === 0 && claimReload(slug)) reload();
    }, IN_PLACE_WAIT_MS);
  }
  waitTimer = setTimeout(() => {
    timedOut = true;
    check();
  }, EMPLOYEES_WAIT_MS);
  check();

  return { slug, destroy };
}
