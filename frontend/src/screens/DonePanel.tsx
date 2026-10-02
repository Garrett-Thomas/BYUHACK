import type { Branch, Contact, Email, Job, JobData, Profile } from '../types';
import { linkedInPeopleUrl } from '../lib/format';
import ContactCard from './ContactCard';
import EmailComposer from './EmailComposer';

interface Props {
  job: Job;
  d: Extract<JobData, { status: 'done' }>;
  profile: Profile;
  onRetry: (b: Branch) => void;
  onContact: (contactId: string, patch: Partial<Contact>) => void;
  onEmail: (patch: Partial<Email>) => void;
}

export default function DonePanel({ job, d, profile, onRetry, onContact, onEmail }: Props) {
  const { contacts, email, err, busy } = d;
  const sent = contacts.filter((c) => c.status !== 'Not sent').length;
  const retryBtn = (b: Branch) => (
    <button className="btn btn-ghost" type="button" disabled={busy[b]} onClick={() => onRetry(b)}>
      {busy[b] ? 'Retrying…' : 'Retry'}
    </button>
  );
  return (
    <div className="two-col">
      <section>
        <div className="sec-head">
          <h2>LinkedIn connections <span className="sec-count">{'· ' + contacts.length}</span></h2>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sent + ' sent'}</span>
        </div>
        {err.contacts || busy.contacts ? (
          <div className="empty-rows">
            <div>{busy.contacts ? 'Looking up saved connections…' : "Couldn't load saved connections: " + err.contacts}</div>
            {retryBtn('contacts')}
          </div>
        ) : contacts.length === 0 ? (
          <div className="empty-rows">
            <div>{'No saved connections at ' + job.company + ' yet. Browse their LinkedIn people page with the Warmline extension on, then re-run.'}</div>
            <a className="btn btn-solid" href={linkedInPeopleUrl(job.company)} target="_blank" rel="noopener">
              Find people on LinkedIn ↗
            </a>
          </div>
        ) : (
          <div className="ccards">
            {contacts.map((c) => (
              <ContactCard key={c.id} jobId={job.id} contact={c} profile={profile}
                onChange={(patch) => onContact(c.id, patch)} />
            ))}
          </div>
        )}
      </section>
      {email && !err.email && !busy.email
        ? <EmailComposer jobId={job.id} email={email} profile={profile} onChange={onEmail} />
        : (
          <section className="sticky-col">
            <h2 style={{ marginBottom: 12 }}>Email to hiring team</h2>
            <div className="empty-rows">
              <div>{busy.email ? 'Searching for a recruiting email…'
                : err.email ? "Couldn't find or draft an email: " + err.email
                : 'No public recruiting email found for ' + job.company}</div>
              {retryBtn('email')}
            </div>
          </section>
        )}
    </div>
  );
}
