import { baseUrl, loadSettings } from './settings';
import type { ConnectionInput, QueueItem, Status } from './types';

const MAX_QUEUE = 1000;
const SEND_TIMEOUT_MS = 15000;

export type SendResult = 'ok' | 'retry' | 'drop';

export async function sendRecord(serverUrl: string, key: string, record: ConnectionInput): Promise<SendResult> {
  const base = baseUrl(serverUrl);
  if (!base) return 'drop';
  try {
    const res = await fetch(`${base}/api/v1/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.status === 200 || res.status === 201) return 'ok';
    if (res.status === 429 || res.status >= 500) return 'retry';
    return 'drop';
  } catch {
    return 'retry';
  }
}

// Serialize all read-modify-write cycles on chrome.storage.local.
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function readQueue(): Promise<QueueItem[]> {
  const { queue } = await chrome.storage.local.get('queue');
  return Array.isArray(queue) ? (queue as QueueItem[]) : [];
}

async function bumpFailed(n: number): Promise<void> {
  const { failedCount } = await chrome.storage.local.get('failedCount');
  await chrome.storage.local.set({ failedCount: (Number(failedCount) || 0) + n });
}

/** Try to send a freshly captured record now; queue it (with its Idempotency-Key) if that fails. */
export function submit(record: ConnectionInput): Promise<void> {
  const item: QueueItem = {
    key: crypto.randomUUID(),
    record,
    attempts: 0,
    queuedAt: new Date().toISOString(),
  };
  return locked(async () => {
    const settings = await loadSettings();
    const result = await sendRecord(settings.serverUrl, item.key, record);
    if (result === 'ok') return;
    if (result === 'drop') return bumpFailed(1);
    const queue = await readQueue();
    queue.push({ ...item, attempts: 1 });
    await chrome.storage.local.set({ queue: queue.slice(-MAX_QUEUE) });
  });
}

/** Retry queued items in order; stop at the first transient failure so a down server is not hammered. */
export function drainQueue(): Promise<void> {
  return locked(async () => {
    const settings = await loadSettings();
    const queue = await readQueue();
    if (queue.length === 0) return;
    const remaining: QueueItem[] = [];
    let dropped = 0;
    let stopped = false;
    for (const item of queue) {
      if (stopped) {
        remaining.push(item);
        continue;
      }
      const result = await sendRecord(settings.serverUrl, item.key, item.record);
      if (result === 'ok') continue;
      if (result === 'drop') {
        dropped++;
        continue;
      }
      remaining.push({ ...item, attempts: item.attempts + 1 });
      stopped = true;
    }
    await chrome.storage.local.set({ queue: remaining });
    if (dropped) await bumpFailed(dropped);
  });
}

export function clearQueue(): Promise<void> {
  return locked(async () => {
    await chrome.storage.local.set({ queue: [], failedCount: 0 });
  });
}

export async function getStatus(): Promise<Status> {
  const { queue, failedCount } = await chrome.storage.local.get(['queue', 'failedCount']);
  return { queued: Array.isArray(queue) ? queue.length : 0, failed: Number(failedCount) || 0 };
}
