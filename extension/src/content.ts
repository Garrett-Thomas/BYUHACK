import { extractForPage, pageKind } from './extractors';
import { loadSettings } from './settings';
import type { ConnectionInput, Message } from './types';

const POLL_MS = 1000;
const MAX_WAIT_MS = 8000;
const SETTLE_MS = 1000;

let lastHref = '';
let cancelVisit: (() => void) | null = null;

function send(visitId: string, record: ConnectionInput): void {
  const msg: Message = { type: 'capture', visitId, record };
  // Fire and forget; the background worker owns queueing and retries.
  chrome.runtime.sendMessage(msg).catch(() => undefined);
}

/**
 * Wait (bounded) for the page to render extractable records, let results settle briefly, then
 * capture exactly once. Resolves to a canceller used when the SPA navigates away.
 */
function startVisit(href: string): void {
  cancelVisit?.();
  cancelVisit = null;
  let pathname: string;
  try {
    pathname = new URL(href).pathname;
  } catch {
    return;
  }
  if (!pageKind(pathname)) return;

  const visitId = crypto.randomUUID();
  let done = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(check, 250);
  });

  const finish = (): void => {
    if (done) return;
    done = true;
    cleanup();
    for (const r of extractForPage(document, href)) send(visitId, r);
  };
  const cleanup = (): void => {
    observer.disconnect();
    clearTimeout(settleTimer);
    clearTimeout(debounce);
    clearTimeout(deadline);
  };
  const check = (): void => {
    if (done) return;
    if (extractForPage(document, href).length > 0) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(finish, SETTLE_MS);
    }
  };
  // Hard stop: capture whatever is there (possibly nothing) after 8s.
  const deadline = setTimeout(finish, MAX_WAIT_MS);

  cancelVisit = () => {
    done = true;
    cleanup();
  };

  void loadSettings().then((s) => {
    if (done) return;
    if (!s.enabled) {
      cancelVisit?.();
      return;
    }
    observer.observe(document.documentElement, { childList: true, subtree: true });
    check();
  });
}

function tick(): void {
  if (location.href === lastHref) return;
  lastHref = location.href;
  startVisit(lastHref);
}

setInterval(tick, POLL_MS);
tick();
