export const EXTRACTOR_VERSION = '1.0.0';

/** Body of POST /api/v1/connections (see connections-finder/spec.md). */
export interface ConnectionInput {
  source: 'linkedin';
  sourceProfileUrl: string;
  name: string;
  headline: string | null;
  company: string | null;
  location: string | null;
  notes: string | null;
  tags: string[];
  capturedAt: string;
  extractorVersion: string;
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
  | { type: 'capture'; visitId: string; record: ConnectionInput }
  | { type: 'retryNow' }
  | { type: 'clearQueue' };

export interface Status {
  queued: number;
  failed: number;
}
