import { useState } from 'react';
import type { Contact, Job, Profile } from '../types';
import { STATUS_CLASS, STATUS_CYCLE } from '../data/constants';
import { draftContact } from '../lib/drafting';
import AiToolbar from '../components/AiToolbar';
import CopyOpenLink from '../components/CopyOpenLink';
import CardHead from './CardHead';

interface Props {
  job: Job;
  contact: Contact;
  profile: Profile;
  onChange: (patch: Partial<Contact>) => void;
}

export default function ContactCard({ job, contact: c, profile, onChange }: Props) {
  const key = job.id + ':' + c.id;
  const bodyId = 'note-body-' + key.replace(':', '-');
  const [open, setOpen] = useState(false);
  const len = c.text.length;

  return (
    <div className="ccard">
      <CardHead name={c.name} deg={c.degree} title={c.title} open={open} controls={bodyId}
        onToggle={() => setOpen(!open)}
        note={<div className="reason">{c.reason}</div>}
        right={
          <button className={STATUS_CLASS[c.status]} type="button"
            aria-label={'Outreach status for ' + c.name + ': ' + c.status + '. Click to change.'}
            onClick={(e) => { e.stopPropagation(); onChange({ status: STATUS_CYCLE[c.status] }); }}>
            {c.status}
          </button>
        } />
      {open && (
        <div id={bodyId}>
          <div className="ccard-body">
            <textarea className="ta" id={'note-' + key.replace(':', '-')} rows={5} value={c.text}
              aria-label={'Referral note to ' + c.name}
              onChange={(e) => onChange({ text: e.target.value })} />
            <div className="count-row">
              <span>connection note</span>
              <span className={'num' + (len > 300 ? ' count-over' : '')}>{len + '/300'}</span>
            </div>
          </div>
          <AiToolbar aiKey={key} text={c.text} profile={profile} onApply={(text) => onChange({ text })}
            extra={
              <div className="links">
                <CopyOpenLink text={c.text} href={c.profileUrl} />
                {c.edited && (
                  <button className="btn-text" type="button"
                    onClick={() => onChange({ text: draftContact(c, job, profile), edited: false })}>
                    Reset to draft
                  </button>
                )}
              </div>
            } />
        </div>
      )}
    </div>
  );
}
