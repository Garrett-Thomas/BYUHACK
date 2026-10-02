import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Branch, Contact, Email, Job, JobData, LogEntry, Profile } from '../types';
import type { ApiConnection } from '../lib/api';
import { ApiError, draftEmail, findContact, getConnections } from '../lib/api';
import { draftContact, profileKey } from '../lib/drafting';

type SetData = Dispatch<SetStateAction<Record<string, JobData>>>;
type State = LogEntry['state'];
type Result = { email: Email | null; error: string | null };
interface Log { add: (text: string, state?: State) => number; set: (n: number, state: State, text?: string) => void }

const NO_LOG: Log = { add: () => 0, set: () => {} };
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong');

const toContact = (c: ApiConnection, job: Job, p: Profile): Contact => {
  const base = {
    id: c.id, name: c.name, title: c.headline ?? '', degree: c.degree ?? 'Saved',
    reason: c.notes ?? c.location ?? '', profileUrl: c.sourceProfileUrl,
    status: 'Not sent' as const, updatedAt: c.updatedAt,
    mutuals: c.mutuals ?? [], mutualCount: c.mutualCount ?? null, mutualIndex: 0, edited: false,
  };
  return { ...base, text: draftContact(base, job, p) };
};

// Merge by id: append new people; existing ones keep their text, status and
// mutualIndex (clamped) but take the refreshed name, title, degree, mutuals,
// mutualCount and updatedAt. If the text was never edited, it is redrafted when
// the name, degree or mutuals changed; edited text is never touched.
const mergeContacts = (cur: Contact[], next: Contact[], job: Job, p: Profile): Contact[] => {
  const byId = new Map(next.map((c) => [c.id, c]));
  const have = new Set(cur.map((c) => c.id));
  const refresh = (c: Contact, n: Contact): Contact => {
    const u: Contact = {
      ...c, name: n.name, title: n.title, degree: n.degree, updatedAt: n.updatedAt,
      mutuals: n.mutuals, mutualCount: n.mutualCount,
      mutualIndex: Math.min(c.mutualIndex, Math.max(0, n.mutuals.length - 1)),
    };
    const changed = c.name !== n.name || c.degree !== n.degree || JSON.stringify(c.mutuals) !== JSON.stringify(n.mutuals);
    return !c.edited && changed ? { ...u, text: draftContact(u, job, p) } : u;
  };
  return [
    ...cur.map((c) => { const n = byId.get(c.id); return n ? refresh(c, n) : c; }),
    ...next.filter((c) => !have.has(c.id)),
  ];
};

export function useCollector(setData: SetData) {
  // Per-job run id. Async results carry the id they
  // started with and are dropped if the job has since been re-run.
  const runs = useRef<Record<string, number>>({});
  const seq = useRef(0);

  const run = useCallback((job: Job, profile: Profile) => {
    const id = job.id;
    // Functional update, applied only if `r` is still the job's current run.
    const patch = (r: number, fn: (d: JobData) => JobData) => {
      if ((runs.current[id] ?? 0) !== r) return;
      setData((prev) => (prev[id] ? { ...prev, [id]: fn(prev[id]) } : prev));
    };
    const mkLog = (r: number): Log => ({
      add(text, state = 'active') {
        const n = ++seq.current;
        patch(r, (d) => (d.status === 'collecting' ? { ...d, log: [...d.log, { id: n, text, state }] } : d));
        return n;
      },
      set(n, state, text) {
        patch(r, (d) => (d.status === 'collecting'
          ? { ...d, log: d.log.map((l) => (l.id === n ? { ...l, state, text: text ?? l.text } : l)) } : d));
      },
    });

    const loadContacts = async (r: number, log: Log): Promise<string | null> => {
      const n = log.add('Looking up saved connections at ' + job.company);
      try {
        const { data } = await getConnections(job.company);
        const contacts = data.map((c) => toContact(c, job, profile));
        log.set(n, 'done');
        log.add('Found ' + contacts.length + ' saved connection' + (contacts.length === 1 ? '' : 's'), 'done');
        patch(r, (d) => ({ ...d, contacts }));
        return null;
      } catch (e) {
        log.set(n, 'error', 'Could not load saved connections: ' + errMsg(e));
        return errMsg(e);
      }
    };

    const loadEmail = async (log: Log): Promise<Result> => {
      let n = log.add('Searching the web for a recruiting email');
      const info = { company: job.company, role: job.role, location: job.location, term: job.term };
      try {
        const found = await findContact(info);
        if (!found.email) {
          log.set(n, 'done');
          log.add('No public recruiting email found', 'done');
          return { email: null, error: null };
        }
        const to = found.email, label = found.label || 'Recruiting team';
        log.set(n, 'done');
        log.add('Found ' + label, 'done');
        n = log.add('Drafting email');
        const draft = await draftEmail({ ...info, email: to, label, ...profile });
        log.set(n, 'done');
        return {
          email: { to, toName: label, confidence: 'found via web search', subject: draft.subject, text: draft.body,
            profileKey: profileKey(profile), edited: false },
          error: null,
        };
      } catch (e) {
        log.set(n, 'error', 'Email search failed: ' + errMsg(e));
        return { email: null, error: errMsg(e) };
      }
    };

    return { patch, mkLog, loadContacts, loadEmail };
  }, [setData]);

  // Reruns a single branch of a finished job.
  const retry = useCallback((job: Job, profile: Profile, branch: Branch) => {
    const r = runs.current[job.id] ?? 0;
    const { patch, loadContacts, loadEmail } = run(job, profile);
    const finish = (error: string | null, extra: { email?: Result['email'] } = {}) =>
      patch(r, (d) => (d.status === 'done'
        ? { ...d, ...extra, err: { ...d.err, [branch]: error }, busy: { ...d.busy, [branch]: false } } : d));
    patch(r, (d) => (d.status === 'done'
      ? { ...d, err: { ...d.err, [branch]: null }, busy: { ...d.busy, [branch]: true } } : d));
    if (branch === 'contacts') loadContacts(r, NO_LOG).then((error) => finish(error));
    else loadEmail(NO_LOG).then((e) => finish(e.error, { email: e.email }));
  }, [run]);

  // Redrafts the email to the address already found, e.g. after a profile change: one
  // draft-email call, no new web search, so the recipient can't change. On failure the old
  // draft stays and the error shows with the email section's Retry.
  const redraftEmail = useCallback((job: Job, profile: Profile, sent: Email) => {
    const r = runs.current[job.id] ?? 0;
    const { patch } = run(job, profile);
    patch(r, (d) => (d.status === 'done' ? { ...d, err: { ...d.err, email: null }, busy: { ...d.busy, email: true } } : d));
    const info = { company: job.company, role: job.role, location: job.location, term: job.term };
    draftEmail({ ...info, email: sent.to, label: sent.toName, ...profile }).then(
      (draft) => patch(r, (d) => (d.status === 'done' && d.email && d.email !== 'idle' ? {
        ...d, busy: { ...d.busy, email: false },
        email: { ...d.email, subject: draft.subject, text: draft.body, profileKey: profileKey(profile), edited: false },
      } : d)),
      (e) => patch(r, (d) => (d.status === 'done'
        ? { ...d, busy: { ...d.busy, email: false }, err: { ...d.err, email: errMsg(e) } } : d)),
    );
  }, [run]);

  // Creates the finished-but-empty state for a job with no data, without running
  // either (paid) email branch.
  const ensureIdle = useCallback((job: Job) => setData((prev) => (prev[job.id] ? prev : {
    ...prev,
    [job.id]: {
      status: 'done', contacts: [], email: 'idle',
      err: { contacts: null, email: null }, busy: { contacts: false, email: false },
    },
  })), [setData]);

  // One poll tick: fetch saved connections and merge them in. Dropped if the job
  // was re-run meanwhile; fetch errors are ignored (the next tick retries).
  const sync = useCallback((job: Job, profile: Profile) => {
    const r = runs.current[job.id] ?? 0;
    const { patch } = run(job, profile);
    getConnections(job.company).then(({ data }) => {
      const next = data.map((c) => toContact(c, job, profile));
      patch(r, (d) => (d.status === 'done'
        ? { ...d, contacts: mergeContacts(d.contacts, next, job, profile), err: next.length ? { ...d.err, contacts: null } : d.err }
        : { ...d, contacts: mergeContacts(d.contacts, next, job, profile) }));
    }, () => {});
  }, [run]);

  return { retry, redraftEmail, ensureIdle, sync };
}
