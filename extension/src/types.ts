export const EXTRACTOR_VERSION = '1.1.0';

/** Network distance kept from a search result. 3rd-degree and "LinkedIn Member" results are never sent. */
export type Degree = '1st' | '2nd';

/** Body of POST /api/v1/connections (see connections-finder/spec.md). */
export interface ConnectionInput {
  source: 'linkedin';
  sourceProfileUrl: string;
  name: string;
  headline: string | null;
  company: string | null;
  degree: Degree;
  location: string | null;
  notes: string | null;
  tags: string[];
  capturedAt: string;
  extractorVersion: string;
}

/** What the extractor reads off a results card. The company comes from the tab registration, not the card. */
export type CapturedPerson = Omit<ConnectionInput, 'company'>;

/** A tab opened from a Warmline link. Kept in chrome.storage.session, keyed by tab id. */
export interface Registration {
  company: string;
  keywords: string;
  /** Epoch milliseconds. */
  registeredAt: number;
}

export interface Settings {
  serverUrl: string;
  enabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: 'http://127.0.0.1:3001',
  enabled: true,
};

export interface QueueItem {
  /** Idempotency-Key. Generated once at capture time and reused on every retry. */
  key: string;
  record: ConnectionInput;
  attempts: number;
  queuedAt: string;
}

export type Message =
  | { type: 'register'; company: string; keywords: string }
  | { type: 'shouldCapture'; keywords: string }
  | { type: 'capture'; visitId: string; keywords: string; record: CapturedPerson }
  | { type: 'retryNow' }
  | { type: 'clearQueue' };

export interface ShouldCaptureResponse {
  company: string | null;
}

export interface Status {
  queued: number;
  failed: number;
}
