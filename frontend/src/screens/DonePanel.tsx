import type { Contact, Email, Job, Profile } from '../types';
import ContactCard from './ContactCard';
import EmailComposer from './EmailComposer';

interface Props {
  job: Job;
  contacts: Contact[];
  email: Email;
  profile: Profile;
  onContact: (contactId: string, patch: Partial<Contact>) => void;
  onEmail: (patch: Partial<Email>) => void;
}

export default function DonePanel({ job, contacts, email, profile, onContact, onEmail }: Props) {
  const sent = contacts.filter((c) => c.status !== 'Not sent').length;
  return (
    <div className="two-col">
      <section>
        <div className="sec-head">
          <h2>LinkedIn connections <span className="sec-count">{'· ' + contacts.length}</span></h2>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sent + ' sent'}</span>
        </div>
        <div className="ccards">
          {contacts.map((c) => (
            <ContactCard key={c.id} jobId={job.id} contact={c} profile={profile}
              onChange={(patch) => onContact(c.id, patch)} />
          ))}
        </div>
      </section>
      <EmailComposer jobId={job.id} email={email} profile={profile} onChange={onEmail} />
    </div>
  );
}
