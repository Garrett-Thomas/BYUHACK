export const EXTRACTOR_VERSION = '1.3.0';

/** Network distance kept from a search result ("3rd+" is stored as "3rd"). "LinkedIn Member" results are never sent. */
export type Degree = '1st' | '2nd' | '3rd';

/** A named mutual connection shown on a 2nd-degree search card. */
export interface Mutual {
  name: string;
  profileUrl: string;
}

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
  /** At most 2 named, linked mutual connections (2nd degree only; [] otherwise). */
  mutuals: Mutual[];
  /** Named mutuals plus "& N other" from the card's mutual line; null when there is none (always null unless 2nd degree). */
  mutualCount: number | null;
  capturedAt: string;
  extractorVersion: string;
}

/** What the extractor reads off a results card. The company comes from the tab registration, not the card. */
export type CapturedPerson = Omit<ConnectionInput, 'company'>;

/**
 * A tab opened from a Warmline link. Kept in chrome.storage.session, keyed by tab id.
 * Company mode: the user is picking the LinkedIn company page; nothing is captured.
 * People mode: a company-scoped people search; people are captured when the URL's `currentCompany`
 * set equals `ids`.
 */
export type Registration =
  | {
      mode: 'company';
      company: string;
      /** Epoch milliseconds. */
      registeredAt: number;
    }
  | {
      mode: 'people';
      company: string;
      /** LinkedIn company ids (digit strings) that the people search is scoped to. */
      ids: string[];
      /** Epoch milliseconds. */
      registeredAt: number;
    };

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
  | { type: 'register'; url: string }
  | { type: 'shouldCapture'; url: string }
  | { type: 'companyPage'; url: string }
  | { type: 'saveCompany'; slug: string; linkedinName: string; ids: string[] }
  | { type: 'capture'; visitId: string; url: string; record: CapturedPerson }
  | { type: 'retryNow' }
  | { type: 'clearQueue' };

export interface ShouldCaptureResponse {
  company: string | null;
}

/** The Warmline company to show the Save button for, or null when this tab/page should not show it. */
export interface CompanyPageResponse {
  company: string | null;
}

/** On success the tab is already registered in people mode; the content script then navigates. */
export interface SaveCompanyResponse {
  ok: boolean;
  company?: string;
  ids?: string[];
}

export interface Status {
  queued: number;
  failed: number;
}
