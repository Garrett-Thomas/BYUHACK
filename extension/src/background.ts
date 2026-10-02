import { clearQueue, drainQueue, submit } from './queue';
import { shouldCapture } from './registration';
import { loadSettings } from './settings';
import type { Message, Registration, ShouldCaptureResponse } from './types';

const ALARM = 'warmline-retry';
const SEEN_KEY = 'seenVisits';
const MAX_SEEN = 2000;
const REG_PREFIX = 'registration:';
const MAX_COMPANY_LENGTH = 200;

function ensureAlarm(): void {
  void chrome.alarms.get(ALARM).then((a) => {
    if (!a) chrome.alarms.create(ALARM, { periodInMinutes: 5, delayInMinutes: 5 });
  });
}

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
ensureAlarm();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void drainQueue();
});

// Per-visit dedupe: profile URL + visit id. Kept in session storage so it survives worker restarts.
const seenStore = chrome.storage.session ?? chrome.storage.local;
let seenChain: Promise<unknown> = Promise.resolve();
function markSeen(id: string): Promise<boolean> {
  const run = seenChain.then(async () => {
    const got = await seenStore.get(SEEN_KEY);
    const seen: string[] = Array.isArray(got[SEEN_KEY]) ? (got[SEEN_KEY] as string[]) : [];
    if (seen.includes(id)) return false;
    seen.push(id);
    await seenStore.set({ [SEEN_KEY]: seen.slice(-MAX_SEEN) });
    return true;
  });
  seenChain = run.catch(() => undefined);
  return run;
}

// Tabs opened from a Warmline link, keyed by tab id. Session storage is cleared when the browser
// closes, survives worker restarts, and is not readable from content scripts.
const regKey = (tabId: number): string => `${REG_PREFIX}${tabId}`;

async function getRegistration(tabId: number): Promise<Registration | undefined> {
  const got = await chrome.storage.session.get(regKey(tabId));
  return got[regKey(tabId)] as Registration | undefined;
}

// Closing a tab drops its registration. This event needs no "tabs" permission.
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(regKey(tabId));
});

function isLinkedInTab(sender: chrome.runtime.MessageSender): sender is chrome.runtime.MessageSender & { tab: chrome.tabs.Tab & { id: number } } {
  // Content scripts only run on linkedin.com; ignore anything else.
  return typeof sender.tab?.id === 'number' && !!sender.tab.url?.startsWith('https://www.linkedin.com/');
}

function isValidCapture(m: Message): m is Extract<Message, { type: 'capture' }> {
  if (m.type !== 'capture') return false;
  const r = m.record;
  return (
    typeof m.visitId === 'string' &&
    typeof m.keywords === 'string' &&
    !!r &&
    r.source === 'linkedin' &&
    (r.degree === '1st' || r.degree === '2nd') &&
    typeof r.sourceProfileUrl === 'string' &&
    typeof r.name === 'string' &&
    r.name.length > 0
  );
}

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  switch (message?.type) {
    case 'register': {
      void (async () => {
        if (!isLinkedInTab(sender)) return;
        const company = typeof message.company === 'string' ? message.company.trim() : '';
        if (!company || company.length > MAX_COMPANY_LENGTH || typeof message.keywords !== 'string') return;
        const registration: Registration = { company, keywords: message.keywords, registeredAt: Date.now() };
        await chrome.storage.session.set({ [regKey(sender.tab.id)]: registration });
      })().finally(() => sendResponse({ ok: true }));
      return true;
    }
    case 'shouldCapture': {
      void (async (): Promise<ShouldCaptureResponse> => {
        if (!isLinkedInTab(sender) || typeof message.keywords !== 'string') return { company: null };
        const registration = await getRegistration(sender.tab.id);
        return { company: shouldCapture(registration, message.keywords, Date.now()) };
      })()
        .catch((): ShouldCaptureResponse => ({ company: null }))
        .then(sendResponse);
      return true;
    }
    case 'capture': {
      void (async () => {
        if (!isValidCapture(message)) return;
        if (!isLinkedInTab(sender)) return;
        if (!(await loadSettings()).enabled) return;
        // Re-check the registration here: the content script is not trusted to decide this.
        const company = shouldCapture(await getRegistration(sender.tab.id), message.keywords, Date.now());
        if (!company) return;
        if (!(await markSeen(`${message.visitId}|${message.record.sourceProfileUrl}`))) return;
        await submit({ ...message.record, company });
      })().finally(() => sendResponse({ ok: true }));
      return true;
    }
    case 'retryNow':
      void drainQueue().finally(() => sendResponse({ ok: true }));
      return true;
    case 'clearQueue':
      void clearQueue().finally(() => sendResponse({ ok: true }));
      return true;
    default:
      return false;
  }
});
