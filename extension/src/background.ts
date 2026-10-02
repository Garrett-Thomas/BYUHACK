import { clearQueue, drainQueue, submit } from './queue';
import { loadSettings } from './settings';
import type { Message } from './types';

const ALARM = 'warmline-retry';
const SEEN_KEY = 'seenVisits';
const MAX_SEEN = 2000;

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

function isValidCapture(m: Message): m is Extract<Message, { type: 'capture' }> {
  if (m.type !== 'capture') return false;
  const r = m.record;
  return (
    typeof m.visitId === 'string' &&
    !!r &&
    r.source === 'linkedin' &&
    typeof r.sourceProfileUrl === 'string' &&
    typeof r.name === 'string' &&
    r.name.length > 0
  );
}

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  switch (message?.type) {
    case 'capture': {
      void (async () => {
        if (!isValidCapture(message)) return;
        // Content scripts only run on linkedin.com; ignore anything else.
        if (!sender.tab?.url?.startsWith('https://www.linkedin.com/')) return;
        if (!(await loadSettings()).enabled) return;
        if (!(await markSeen(`${message.visitId}|${message.record.sourceProfileUrl}`))) return;
        await submit(message.record);
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
