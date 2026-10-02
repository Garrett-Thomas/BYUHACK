import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Branch, Contact, Email, Job, JobData, LogEntry, Profile } from '../types';
import type { ApiConnection } from '../lib/api';
import { ApiError, draftEmail, findContact, getConnections } from '../lib/api';
import { draftNote } from '../lib/drafting';

type SetData = Dispatch<SetStateAction<Record<string, JobData>>>;
type State = LogEntry['state'];
type Result = { email: Email | null; error: string | null };
interface Log { add: (text: string, state?: State) => number; set: (n: number, state: State, text?: string) => void }

const NO_LOG: Log = { add: () => 0, set: () => {} };
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong');

const toContact = (c: ApiConnection, job: Job, p: Profile): Contact => ({
  id: c.id, name: c.name, title: c.headline ?? '', degree: c.degree ?? 'Saved',
  reason: c.notes ?? c.location ?? '', profileUrl: c.sourceProfileUrl,
  status: 'Not sent', text: draftNote({ name: c.name, degree: c.degree ?? 'Saved' }, job, p),
  updatedAt: c.updatedAt,
});

// Merge by id: append new people; existing ones keep their note text and status
// but take the refreshed name, title, degree and updatedAt. If the degree changed
// and the note is still the untouched draft, it is redrafted for the new degree.
const mergeContacts = (cur: Contact[], next: Contact[], job: Job, p: Profile): Contact[] => {
  const byId = new Map(next.map((c) => [c.id, c]));
  const have = new Set(cur.map((c) => c.id));
  const refresh = (c: Contact, n: Contact): Contact => ({
    ...c, name: n.name, title: n.title, degree: n.degree, updatedAt: n.updatedAt,
    text: n.degree !== c.degree && c.text === draftNote(c, job, p) ? n.text : c.text,
  });
  return [
    ...cur.map((c) => { const n = byId.get(c.id); return n ? refresh(c, n) : c; }),
    ...next.filter((c) => !have.has(c.id)),
  ];
};

export function useCollector(setData: SetData) {
  // Per-job run id: bumped on every collect(). Async results carry the id they
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
          email: { to, toName: label, confidence: 'found via web search', subject: draft.subject, text: draft.body },
          error: null,
        };
      } catch (e) {
        log.set(n, 'error', 'Email search failed: ' + errMsg(e));
        return { email: null, error: errMsg(e) };
      }
    };

    return { patch, mkLog, loadContacts, loadEmail };
  }, [setData]);

  const collect = useCallback((job: Job, profile: Profile) => {
    const r = (runs.current[job.id] ?? 0) + 1;
    runs.current[job.id] = r;
    const { patch, mkLog, loadContacts, loadEmail } = run(job, profile);
    setData((prev) => ({ ...prev, [job.id]: { status: 'collecting', log: [], contacts: [] } }));
    const log = mkLog(r);
    // Both branches run in parallel; each handles its own failure.
    Promise.all([loadContacts(r, log), loadEmail(log)]).then(([cErr, e]) =>
      patch(r, (d) => (d.status === 'collecting' ? {
        status: 'done', contacts: d.contacts, email: e.email,
        err: { contacts: cErr, email: e.error }, busy: { contacts: false, email: false },
      } : d)));
  }, [run, setData]);

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

  return { collect, retry, ensureIdle, sync };
}
