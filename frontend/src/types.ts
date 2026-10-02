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
  status: ContactStatus;
  text: string;
}

export interface Email {
  to: string;
  toName: string;
  confidence: string;
  subject: string;
  text: string;
}

export type JobData =
  | { status: 'collecting'; step: number; contacts: Contact[] }
  | { status: 'done'; contacts: Contact[]; email: Email };

export interface Profile {
  name: string;
  school: string;
  highlight: string;
  resume: string;
}

export type Screen = 'jobs' | 'company' | 'job' | 'profile';
export type Speed = 'Fast' | 'Normal' | 'Slow';
