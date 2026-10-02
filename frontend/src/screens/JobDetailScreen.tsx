import type { Branch, Contact, Email, Job, JobData, Profile, Screen } from '../types';
import { jobMeta, linkedInPeopleUrl } from '../lib/format';
import { useConnectionPoll } from '../hooks/useConnectionPoll';
import NonePanel from './NonePanel';
import CollectingPanel from './CollectingPanel';
import DonePanel from './DonePanel';

interface Props {
  job: Job;
  d: JobData | undefined;
  prevScreen: Screen;
  profile: Profile;
  go: (s: Screen) => void;
  onCollect: () => void;
  onRetry: (b: Branch) => void;
  onFind: () => void;
  onSync: () => void;
  onContact: (contactId: string, patch: Partial<Contact>) => void;
  onEmail: (patch: Partial<Email>) => void;
}

export default function JobDetailScreen({ job, d, prevScreen, profile, go, onCollect, onRetry, onFind, onSync, onContact, onEmail }: Props) {
  const { polling, start } = useConnectionPoll(job.id, onSync);
  // The link itself still opens in a new tab; this just starts watching for new people.
  const find = () => { onFind(); start(); };
  return (
    <>
      <button className="btn btn-back" type="button" onClick={() => go(prevScreen)}>
        {'← ' + (prevScreen === 'company' ? 'Company search' : 'All jobs')}
      </button>
      <div className="job-head">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 500 }}>{job.company}</div>
          <h1 style={{ margin: '4px 0 10px' }}>{job.role}</h1>
          <div className="job-meta">
            <span>{job.location}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{jobMeta(job)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {d?.status === 'done' && (
            <button className="btn btn-ghost" type="button" onClick={onCollect}>Re-run search</button>
          )}
          <a className="btn btn-ghost" href={linkedInPeopleUrl(job.company)} target="_blank" rel="noopener"
            onClick={find}>
            Find people on LinkedIn ↗
          </a>
          {job.hasListing && job.url && (
            <a className="btn btn-solid" href={job.url} target="_blank" rel="noopener">Open application ↗</a>
          )}
        </div>
      </div>
      {!d ? <NonePanel job={job} onCollect={onCollect} />
        : d.status === 'collecting' ? <CollectingPanel log={d.log} contacts={d.contacts} />
        : <DonePanel job={job} d={d} profile={profile} polling={polling} onFind={find}
            onRetry={onRetry} onContact={onContact} onEmail={onEmail} />}
    </>
  );
}
