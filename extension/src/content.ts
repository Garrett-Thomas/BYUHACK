import { extractForPage, pageKind } from './extractors';
import { companySlugFromPath, registrationFromUrl } from './registration';
import { mountSaveButton, type SaveButtonHandle } from './saveButton';
import { loadSettings } from './settings';
import type { CapturedPerson, CompanyPageResponse, Message, ShouldCaptureResponse } from './types';

const POLL_MS = 1000;
// Measured from when capture is approved. The script starts at document_start, so results
// can take a while to render after that.
const MAX_WAIT_MS = 15000;
const SETTLE_MS = 1000;

let lastHref = '';
let cancelVisit: (() => void) | null = null;
let saveUi: SaveButtonHandle | null = null;

function send(visitId: string, url: string, record: CapturedPerson): void {
  const msg: Message = { type: 'capture', visitId, url, record };
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
 * The extension acts on three kinds of page, and nothing else on LinkedIn is read or messaged about:
 * - A URL carrying the `warmline` marker (a company search in company mode, or a company-scoped
 *   people search) registers the tab with the background worker.
 * - A company page `/company/<slug>/` asks whether this tab is in company mode; if so, the Save
 *   button is injected.
 * - A people search asks whether this tab may be captured (people mode, `currentCompany` matches the
 *   registered ids). If not, nothing is extracted or sent. If so, wait (bounded) for the page to
 *   render extractable records, let results settle briefly, then capture exactly once.
 * A canceller is kept for when the SPA navigates away. The only navigation this script ever makes is
 * the `location.replace` after the user clicks Save (see saveButton.ts).
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
  const slug = companySlugFromPath(url.pathname);
  // Leaving the company page (or moving to another one) removes the button; a new one is injected below.
  if (saveUi && saveUi.slug !== slug) {
    saveUi.destroy();
    saveUi = null;
  }
  const registers = registrationFromUrl(href, 0) !== null;
  const isPeopleSearch = pageKind(url.pathname) === 'search';
  if (!registers && !isPeopleSearch && !slug) return;
  // Same company page (e.g. its About tab): keep the button, or its dismissal, as is.
  if (!registers && slug && saveUi) return;

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
    for (const r of extractForPage(document, href)) send(visitId, href, r);
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
    // Register first and wait for the reply so the checks below see it.
    if (registers) await ask({ type: 'register', url: href });
    if (isPeopleSearch) {
      const answer = await ask<ShouldCaptureResponse>({ type: 'shouldCapture', url: href });
      if (done || !answer?.company) return;
      // Hard stop: capture whatever is there (possibly nothing) after the wait.
      deadline = setTimeout(finish, MAX_WAIT_MS);
      // Observe the document, not documentElement, which may not exist yet at document_start.
      observer.observe(document, { childList: true, subtree: true });
      check();
    } else if (slug) {
      const answer = await ask<CompanyPageResponse>({ type: 'companyPage', url: href });
      if (done || !answer?.company || saveUi) return;
      saveUi = mountSaveButton({ slug, company: answer.company });
    }
  })();
}

function tick(): void {
  if (location.href === lastHref) return;
  lastHref = location.href;
  startVisit(lastHref);
}

setInterval(tick, POLL_MS);
tick();
