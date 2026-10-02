import type { Contact, Profile } from '../types';
import { STATUS_CLASS, STATUS_CYCLE } from '../data/constants';
import { initials } from '../lib/format';
import AiToolbar from '../components/AiToolbar';
import CopyButton from '../components/CopyButton';

interface Props {
  jobId: string;
  contact: Contact;
  profile: Profile;
  onChange: (patch: Partial<Contact>) => void;
}

export default function ContactCard({ jobId, contact: c, profile, onChange }: Props) {
  const key = jobId + ':' + c.id;
  const len = c.text.length;

  return (
    <div className="ccard">
      <div className="ccard-top">
        <div className="av av-40">{initials(c.name)}</div>
        <div className="ccard-id">
          <div className="ccard-name-row">
            <span className="ccard-name">{c.name}</span>
            <span className="deg">{c.degree}</span>
          </div>
          <div className="ccard-title">{c.title}</div>
          <div className="reason">{c.reason}</div>
        </div>
        <button className={STATUS_CLASS[c.status]} type="button"
          aria-label={'Outreach status for ' + c.name + ': ' + c.status + '. Click to change.'}
          onClick={() => onChange({ status: STATUS_CYCLE[c.status] })}>
          {c.status}
        </button>
      </div>
      <div className="ccard-body">
        <textarea className="ta" id={'note-' + key.replace(':', '-')} rows={5} value={c.text}
          aria-label={'Referral note to ' + c.name}
          onChange={(e) => onChange({ text: e.target.value })} />
        <div className="count-row">
          <span>connection note</span>
          <span className={'num' + (len > 300 ? ' count-over' : '')}>{len + '/300'}</span>
        </div>
      </div>
      <AiToolbar aiKey={key} presets={['Shorter', 'Warmer', 'More formal', 'Mention my project']}
        text={c.text} profile={profile} onApply={(text) => onChange({ text })}
        extra={
          <div className="links">
            <CopyButton className="btn-text" label="Copy message" text={c.text} />
            <a href="#" onClick={(e) => e.preventDefault()}>Open LinkedIn profile ↗</a>
          </div>
        } />
    </div>
  );
}
