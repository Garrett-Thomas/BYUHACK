import { clearQueue, drainQueue, submit } from './queue';
import { isCompanyId, MAX_COMPANY_IDS, profileUrlFrom } from './extractors/common';
import { isFresh, registrationFromUrl, shouldCapture, showSaveButton } from './registration';
import { putCompanyScope } from './scopes';
import { loadSettings } from './settings';
import type { CompanyPageResponse, Message, Registration, SaveCompanyResponse, ShouldCaptureResponse } from './types';

const ALARM = 'warmline-retry';
const SEEN_KEY = 'seenVisits';
const MAX_SEEN = 2000;
const REG_PREFIX = 'registration:';
const MAX_NAME_LENGTH = 200;
const MAX_MUTUALS = 2;

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

/** The tab's registration, or undefined. An expired one (2 hours) is removed rather than returned. */
async function getRegistration(tabId: number): Promise<Registration | undefined> {
  const got = await chrome.storage.session.get(regKey(tabId));
  const registration = got[regKey(tabId)] as Registration | undefined;
  if (registration && !isFresh(registration, Date.now())) {
    await chrome.storage.session.remove(regKey(tabId));
    return undefined;
  }
  return registration;
}

// Closing a tab drops its registration. This event needs no "tabs" permission.
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(regKey(tabId));
});

function isLinkedInTab(sender: chrome.runtime.MessageSender): sender is chrome.runtime.MessageSender & { tab: chrome.tabs.Tab & { id: number } } {
  // Content scripts only run on linkedin.com; ignore anything else.
  return typeof sender.tab?.id === 'number' && !!sender.tab.url?.startsWith('https://www.linkedin.com/');
}

function isValidSave(m: Message): m is Extract<Message, { type: 'saveCompany' }> {
  if (m.type !== 'saveCompany') return false;
  return (
    typeof m.slug === 'string' &&
    m.slug.length > 0 &&
    m.slug.length <= MAX_NAME_LENGTH &&
    typeof m.linkedinName === 'string' &&
    m.linkedinName.length <= MAX_NAME_LENGTH &&
    Array.isArray(m.ids) &&
    m.ids.length >= 1 &&
    m.ids.length <= MAX_COMPANY_IDS &&
    m.ids.every(isCompanyId)
  );
}

function isValidMutual(x: unknown): boolean {
  if (typeof x !== 'object' || x === null) return false;
  const { name, profileUrl } = x as { name?: unknown; profileUrl?: unknown };
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    typeof profileUrl === 'string' &&
    profileUrlFrom(profileUrl) !== null
  );
}

function isValidCapture(m: Message): m is Extract<Message, { type: 'capture' }> {
  if (m.type !== 'capture') return false;
  const r = m.record;
  return (
    typeof m.visitId === 'string' &&
    typeof m.url === 'string' &&
    !!r &&
    r.source === 'linkedin' &&
    (r.degree === '1st' || r.degree === '2nd' || r.degree === '3rd') &&
    typeof r.sourceProfileUrl === 'string' &&
    typeof r.name === 'string' &&
    r.name.length > 0 &&
    Array.isArray(r.mutuals) &&
    r.mutuals.length <= MAX_MUTUALS &&
    r.mutuals.every(isValidMutual) &&
    (r.mutualCount === null || (typeof r.mutualCount === 'number' && Number.isInteger(r.mutualCount) && r.mutualCount >= 0))
  );
}

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  switch (message?.type) {
    case 'register': {
      void (async () => {
        if (!isLinkedInTab(sender) || typeof message.url !== 'string') return;
        const registration = registrationFromUrl(message.url, Date.now());
        if (!registration) return;
        await chrome.storage.session.set({ [regKey(sender.tab.id)]: registration });
      })().finally(() => sendResponse({ ok: true }));
      return true;
    }
    case 'shouldCapture': {
      void (async (): Promise<ShouldCaptureResponse> => {
        if (!isLinkedInTab(sender) || typeof message.url !== 'string') return { company: null };
        const registration = await getRegistration(sender.tab.id);
        return { company: shouldCapture(registration, message.url, Date.now()) };
      })()
        .catch((): ShouldCaptureResponse => ({ company: null }))
        .then(sendResponse);
      return true;
    }
    case 'companyPage': {
      void (async (): Promise<CompanyPageResponse> => {
        if (!isLinkedInTab(sender) || typeof message.url !== 'string') return { company: null };
        const registration = await getRegistration(sender.tab.id);
        const show = !!registration && showSaveButton(registration, message.url, Date.now());
        return { company: show && registration ? registration.company : null };
      })()
        .catch((): CompanyPageResponse => ({ company: null }))
        .then(sendResponse);
      return true;
    }
    case 'saveCompany': {
      void (async (): Promise<SaveCompanyResponse> => {
        if (!isLinkedInTab(sender) || !isValidSave(message)) return { ok: false };
        const settings = await loadSettings();
        if (!settings.enabled) return { ok: false };
        // Only a fresh company-mode tab may save; the content script is not trusted to decide this.
        const registration = await getRegistration(sender.tab.id);
        if (!registration || registration.mode !== 'company') return { ok: false };
        const saved = await putCompanyScope(settings.serverUrl, registration.company, {
          linkedinSlug: message.slug,
          linkedinName: message.linkedinName.trim() || null,
          linkedinIds: message.ids,
        });
        if (!saved) return { ok: false };
        // Switch the tab to people mode before the content script navigates to the scoped search.
        const next: Registration = {
          mode: 'people',
          company: registration.company,
          ids: message.ids,
          registeredAt: Date.now(),
        };
        await chrome.storage.session.set({ [regKey(sender.tab.id)]: next });
        return { ok: true, company: next.company, ids: next.ids };
      })()
        .catch((): SaveCompanyResponse => ({ ok: false }))
        .then(sendResponse);
      return true;
    }
    case 'capture': {
      void (async () => {
        if (!isValidCapture(message)) return;
        if (!isLinkedInTab(sender)) return;
        if (!(await loadSettings()).enabled) return;
        // Re-check the registration here: the content script is not trusted to decide this.
        const company = shouldCapture(await getRegistration(sender.tab.id), message.url, Date.now());
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
