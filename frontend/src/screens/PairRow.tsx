import type { ReactNode } from 'react';
import type { Contact, Job, Profile } from '../types';
import { STATUS_CLASS, STATUS_CYCLE } from '../data/constants';
import { draftIntroRequest } from '../lib/drafting';
import { initials } from '../lib/format';
import AiToolbar from '../components/AiToolbar';
import CopyOpenLink from '../components/CopyOpenLink';

interface Props {
  job: Job;
  contact: Contact;
  profile: Profile;
  onChange: (patch: Partial<Contact>) => void;
}

const first = (n: string) => n.split(' ')[0];

function Head({ name, deg, title, note, right }: { name: string; deg: string; title: string; note?: ReactNode; right?: ReactNode }) {
  return (
    <div className="ccard-top">
      <div className="av av-40">{initials(name)}</div>
      <div className="ccard-id">
        <div className="ccard-name-row">
          <span className="ccard-name">{name}</span>
          <span className="deg">{deg}</span>
        </div>
        <div className="ccard-title">{title}</div>
        {note}
      </div>
      {right}
    </div>
  );
}

// Your 1st-degree mutual: holds the intro request, its AI toolbar and the status.
function MutualCard({ job, contact: c, profile, onChange }: Props) {
  const key = job.id + ':' + c.id;
  const i = Math.min(c.mutualIndex, c.mutuals.length - 1);
  const m = c.mutuals[i];
  const other = c.mutuals.length === 2 ? c.mutuals[1 - i] : null;

  return (
    <div className="ccard">
      <Head name={m.name} deg="1st" title="Your 1st-degree connection"
        right={
          <button className={STATUS_CLASS[c.status]} type="button"
            aria-label={'Outreach status for ' + m.name + ': ' + c.status + '. Click to change.'}
            onClick={() => onChange({ status: STATUS_CYCLE[c.status] })}>
            {c.status}
          </button>
        } />
      <div className="ccard-body">
        <textarea className="ta" id={'note-' + key.replace(':', '-')} rows={8} value={c.text}
          aria-label={'Intro request to ' + m.name}
          onChange={(e) => onChange({ text: e.target.value })} />
        <div className="count-row">
          <span>{'intro request to ' + first(m.name)}</span>
          <span className="num">{c.text.length}</span>
        </div>
      </div>
      <AiToolbar aiKey={key} presets={['Shorter', 'Warmer', 'More formal', 'Mention my project']}
        text={c.text} profile={profile} maxChars={600} onApply={(text) => onChange({ text })}
        extra={
          <div className="links">
            <CopyOpenLink text={c.text} href={m.profileUrl} />
            {other && (
              <button className="btn-text" type="button"
                onClick={() => onChange({ mutualIndex: 1 - i, text: draftIntroRequest(other, c, job, profile) })}>
                {'Ask ' + first(other.name) + ' instead'}
              </button>
            )}
          </div>
        } />
    </div>
  );
}

// The 2nd-degree person the mutual is being asked to reach: no message of its own.
function TargetCard({ contact: c }: { contact: Contact }) {
  const more = (c.mutualCount ?? 0) - c.mutuals.length;
  return (
    <div className="ccard">
      <Head name={c.name} deg="2nd" title={c.title}
        note={more > 0 && <div className="reason">{'+' + more + ' more mutual connection' + (more === 1 ? '' : 's')}</div>} />
      <div className="ccard-body">
        <div className="links">
          <a href={c.profileUrl} target="_blank" rel="noopener">Open LinkedIn profile ↗</a>
        </div>
      </div>
    </div>
  );
}

/** A 2nd-degree contact with at least one mutual: [ mutual ] → [ target ]. */
export default function PairRow(props: Props) {
  return (
    <div className="pair">
      <MutualCard {...props} />
      <div className="pair-arrow" aria-hidden="true" />
      <TargetCard contact={props.contact} />
    </div>
  );
}
