import { useEffect, useState } from 'react';
import type { Branch, Contact, Email, Job, JobData, Profile, Screen } from '../types';
import { jobMeta, linkedInCompanySearchUrl, linkedInPeopleUrl } from '../lib/format';
import { useConnectionPoll } from '../hooks/useConnectionPoll';
import { useCompanyScope } from '../hooks/useCompanyScope';
import DonePanel from './DonePanel';

interface Props {
  job: Job;
  d: JobData | undefined;
  prevScreen: Screen;
  profile: Profile;
  go: (s: Screen) => void;
  onRetry: (b: Branch) => void;
  onFind: () => void;
  onSync: () => void;
  onContact: (contactId: string, patch: Partial<Contact>) => void;
  onEmail: (patch: Partial<Email>) => void;
}

export default function JobDetailScreen({ job, d, prevScreen, profile, go, onRetry, onFind, onSync, onContact, onEmail }: Props) {
  const { scope, refresh, clear } = useCompanyScope(job.company);
  // Each tick also re-fetches the scope, so it shows up once the user saves it in LinkedIn.
  const { polling, start } = useConnectionPoll(job.id, () => { onSync(); refresh(); });
  const [changeFailed, setChangeFailed] = useState(false);
  // The link itself still opens in a new tab; this just starts watching for new people.
  const find = () => { onFind(); start(); };
  // Opening a job shows the connections and email columns right away and loads saved
  // connections (free). The paid email search only runs from its own button.
  useEffect(() => { onFind(); onSync(); }, [job.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = () => { setChangeFailed(false); clear().then((ok) => setChangeFailed(!ok)); };
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
          {scope && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>
              {'LinkedIn company: ' + (scope.linkedinName ?? scope.linkedinSlug ?? job.company) + ' · '}
              <button className="btn-text" type="button" onClick={change}>change</button>
              {changeFailed && ' (couldn\'t reach the Warmline server)'}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {scope === null && (
            <a className="btn btn-ghost" href={linkedInCompanySearchUrl(job.company)} target="_blank" rel="noopener"
              onClick={find}>
              {'Find ' + job.company + ' on LinkedIn ↗'}
            </a>
          )}
          {scope && (
            <a className="btn btn-ghost" href={linkedInPeopleUrl(job.company, ['F', 'S'], scope.linkedinIds)} target="_blank"
              rel="noopener" onClick={find}>
              Find people on LinkedIn ↗
            </a>
          )}
          {job.hasListing && job.url && (
            <a className="btn btn-solid" href={job.url} target="_blank" rel="noopener">Open application ↗</a>
          )}
        </div>
      </div>
      {d?.status === 'done' && <DonePanel job={job} d={d} profile={profile} scope={scope} polling={polling} onFind={find}
            onRetry={onRetry} onContact={onContact} onEmail={onEmail} />}
    </>
  );
}
