import type { Branch, Contact, Email, Job, JobData, Profile } from '../types';
import type { CompanyScope } from '../lib/api';
import { linkedInPeopleUrl } from '../lib/format';
import ContactCard from './ContactCard';
import FindCompany from './FindCompany';
import EmailComposer from './EmailComposer';

interface Props {
  job: Job;
  d: Extract<JobData, { status: 'done' }>;
  profile: Profile;
  scope: CompanyScope | null | undefined; // undefined: not fetched yet
  polling: boolean;
  onFind: () => void;
  onRetry: (b: Branch) => void;
  onContact: (contactId: string, patch: Partial<Contact>) => void;
  onEmail: (patch: Partial<Email>) => void;
}

const newestFirst = (a: Contact, b: Contact) => b.updatedAt.localeCompare(a.updatedAt);

export default function DonePanel({ job, d, profile, scope, polling, onFind, onRetry, onContact, onEmail }: Props) {
  const { contacts, email, err, busy } = d;
  const sent = contacts.filter((c) => c.status !== 'Not sent').length;
  const retryBtn = (b: Branch) => (
    <button className="btn btn-ghost" type="button" disabled={busy[b]} onClick={() => onRetry(b)}>
      {busy[b] ? 'Retrying…' : 'Retry'}
    </button>
  );
  const sections = [
    { net: 'F' as const, title: '1st-degree connections', sub: 'Ask for a referral directly.', none: 'No 1st-degree connections saved yet.',
      list: contacts.filter((c) => c.degree === '1st') },
    { net: 'S' as const, title: '2nd-degree connections', sub: 'Reach them through a mutual connection.', none: 'No 2nd-degree connections saved yet.',
      list: contacts.filter((c) => c.degree === '2nd') },
    { net: 'O' as const, title: 'Other people at ' + job.company, sub: '3rd-degree, and saved profiles with no degree.', none: 'No other people saved yet.',
      list: contacts.filter((c) => c.degree !== '1st' && c.degree !== '2nd') },
  ];
  return (
    <div className="two-col">
      <section>
        {polling && (
          <div className="eyebrow" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 10 }}>
            checking LinkedIn for new people…
          </div>
        )}
        {scope === undefined ? null : err.contacts || busy.contacts ? (
          <div className="empty-rows">
            <div>{busy.contacts ? 'Looking up saved connections…' : "Couldn't load saved connections: " + err.contacts}</div>
            {retryBtn('contacts')}
          </div>
        ) : scope === null ? (
          <div className="empty-rows">
            <FindCompany job={job} onFind={onFind} />
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 14 }}>{sent + ' sent'}</div>
            {sections.map((s) => (
              <div key={s.net} style={{ marginBottom: 28 }}>
                <div className="sec-head" style={{ marginBottom: 4 }}>
                  <h2 style={{ fontSize: 18 }}>{s.title} <span className="sec-count">{'· ' + s.list.length}</span></h2>
                  <a style={{ fontSize: 12, whiteSpace: 'nowrap' }} href={linkedInPeopleUrl(job.company, s.net, scope.linkedinIds)}
                    target="_blank" rel="noopener" onClick={onFind}>
                    Find on LinkedIn ↗
                  </a>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>{s.sub}</div>
                {s.list.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{s.none}</div>
                ) : (
                  <div className="ccards">
                    {[...s.list].sort(newestFirst).map((c) => (
                      <ContactCard key={c.id} jobId={job.id} contact={c} profile={profile}
                        onChange={(patch) => onContact(c.id, patch)} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </section>
      {email && email !== 'idle' && !err.email && !busy.email
        ? <EmailComposer jobId={job.id} email={email} profile={profile} onChange={onEmail} />
        : (
          <section className="sticky-col">
            <h2 style={{ marginBottom: 12 }}>Email to hiring team</h2>
            <div className="empty-rows">
              {email === 'idle' && !err.email && !busy.email ? (
                <>
                  <div>{'Search the web for a recruiting email at ' + job.company + ' and draft a note to them.'}</div>
                  <button className="btn btn-solid" type="button" onClick={() => onRetry('email')}>
                    Find HR email
                  </button>
                </>
              ) : (
                <>
                  <div>{busy.email ? 'Searching for a recruiting email…'
                    : err.email ? "Couldn't find or draft an email: " + err.email
                    : 'No public recruiting email found for ' + job.company}</div>
                  {retryBtn('email')}
                </>
              )}
            </div>
          </section>
        )}
    </div>
  );
}
