import { extractForPage, pageKind } from './extractors';
import { loadSettings } from './settings';
import type { CapturedPerson, Message, ShouldCaptureResponse } from './types';

const POLL_MS = 1000;
// Measured from when capture is approved. The script starts at document_start, so results
// can take a while to render after that.
const MAX_WAIT_MS = 15000;
const SETTLE_MS = 1000;

let lastHref = '';
let cancelVisit: (() => void) | null = null;

function send(visitId: string, keywords: string, record: CapturedPerson): void {
  const msg: Message = { type: 'capture', visitId, keywords, record };
  // Fire and forget; the background worker owns queueing and retries.
  chrome.runtime.sendMessage(msg).catch(() => undefined);
}

async function ask<T>(msg: Message): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as T;
  } catch {
    return undefined;
  }
}

/**
 * Only capture in tabs opened from a Warmline link. A URL carrying the `warmline` marker registers
 * the tab; every people-search visit then asks the background whether this tab may be captured.
 * If not, nothing is extracted or sent. If so, wait (bounded) for the page to render extractable
 * records, let results settle briefly, then capture exactly once. A canceller is kept for when the
 * SPA navigates away.
 */
function startVisit(href: string): void {
  cancelVisit?.();
  cancelVisit = null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return;
  }
  if (!pageKind(url.pathname)) return;
  const keywords = url.searchParams.get('keywords') ?? '';
  const company = (url.searchParams.get('warmline') ?? '').trim();

  const visitId = crypto.randomUUID();
  let done = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(check, 250);
  });

  const finish = (): void => {
    if (done) return;
    done = true;
    cleanup();
    for (const r of extractForPage(document, href)) send(visitId, keywords, r);
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

  cancelVisit = () => {
    done = true;
    cleanup();
  };

  void (async () => {
    const s = await loadSettings();
    if (done || !s.enabled) return;
    // Register first and wait for the reply so the check below sees it.
    if (company) await ask({ type: 'register', company, keywords });
    const answer = await ask<ShouldCaptureResponse>({ type: 'shouldCapture', keywords });
    if (done || !answer?.company) return;
    // Hard stop: capture whatever is there (possibly nothing) after the wait.
    deadline = setTimeout(finish, MAX_WAIT_MS);
    // Observe the document, not documentElement, which may not exist yet at document_start.
    observer.observe(document, { childList: true, subtree: true });
    check();
  })();
}

function tick(): void {
  if (location.href === lastHref) return;
  lastHref = location.href;
  startVisit(lastHref);
}

setInterval(tick, POLL_MS);
tick();
