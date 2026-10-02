import { baseUrl, isLocalHost, loadSettings, parseServerUrl, saveSettings } from './settings';
import { getStatus } from './queue';
import type { Message } from './types';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function setStatus(text: string): void {
  $('status').textContent = text;
}

async function refreshCounts(): Promise<void> {
  const s = await getStatus();
  $('queued').textContent = String(s.queued);
  $('failed').textContent = String(s.failed);
}

async function sendMsg(m: Message): Promise<void> {
  await chrome.runtime.sendMessage(m);
  await refreshCounts();
}

async function onSave(): Promise<void> {
  const url = parseServerUrl($<HTMLInputElement>('serverUrl').value);
  if (!url) {
    setStatus('Enter an http://localhost, http://127.0.0.1 or https:// server URL.');
    return;
  }
  // Must be the first await so the permission prompt still counts as a user gesture.
  if (url.protocol === 'https:' && !isLocalHost(url.hostname)) {
    const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
    if (!granted) {
      setStatus('Permission to reach that server was denied; settings not saved.');
      return;
    }
  }
  await saveSettings({
    serverUrl: baseUrl(url.href),
    enabled: $<HTMLInputElement>('enabled').checked,
  });
  setStatus('Saved.');
}

async function init(): Promise<void> {
  const s = await loadSettings();
  $<HTMLInputElement>('serverUrl').value = s.serverUrl;
  $<HTMLInputElement>('enabled').checked = s.enabled;
  await refreshCounts();
  $('save').addEventListener('click', () => void onSave());
  $('retry').addEventListener('click', () => void sendMsg({ type: 'retryNow' }));
  $('clear').addEventListener('click', () => void sendMsg({ type: 'clearQueue' }));
  chrome.storage.onChanged.addListener(() => void refreshCounts());
}

void init();
