export interface Job {
  id: string;
  company: string;
  role: string;
  location: string;
  posted: string;
  repo: string;
  term: string;
  hasListing: boolean;
  url?: string;
}

export type ContactStatus = 'Not sent' | 'Sent' | 'Replied';

export interface Contact {
  id: string;
  name: string;
  title: string;
  degree: string;
  reason: string;
  profileUrl: string;
  status: ContactStatus;
  text: string;
  updatedAt: string;
}

export interface Email {
  to: string;
  toName: string;
  confidence: string;
  subject: string;
  text: string;
}

export interface LogEntry {
  id: number;
  text: string;
  state: 'active' | 'done' | 'error';
}

export type Branch = 'contacts' | 'email';

export type JobData =
  | { status: 'collecting'; log: LogEntry[]; contacts: Contact[] }
  | {
      status: 'done';
      contacts: Contact[];
      email: Email | null | 'idle'; // 'idle': email search not run yet
      err: Record<Branch, string | null>;
      busy: Record<Branch, boolean>;
    };

export interface Profile {
  name: string;
  school: string;
  highlight: string;
  resume: string;
}

export type Screen = 'jobs' | 'company' | 'job' | 'profile';
