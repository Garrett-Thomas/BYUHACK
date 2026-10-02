import { useState } from 'react';
import type { Contact, Job, Profile } from '../types';
import { STATUS_CLASS, STATUS_CYCLE } from '../data/constants';
import { draftIntroRequest } from '../lib/drafting';
import AiToolbar from '../components/AiToolbar';
import CopyButton from '../components/CopyButton';
import CardHead from './CardHead';

interface Props {
  job: Job;
  contact: Contact;
  profile: Profile;
  onChange: (patch: Partial<Contact>) => void;
}

interface Open {
  open: boolean;
  onToggle: () => void;
}

const first = (n: string) => n.split(' ')[0];

// Your 1st-degree mutual: holds the intro request, its AI toolbar and the status.
function MutualCard({ job, contact: c, profile, onChange, open, onToggle }: Props & Open) {
  const key = job.id + ':' + c.id;
  const bodyId = 'note-body-' + key.replace(':', '-');
  const i = Math.min(c.mutualIndex, c.mutuals.length - 1);
  const m = c.mutuals[i];
  const other = c.mutuals.length === 2 ? c.mutuals[1 - i] : null;

  return (
    <div className="ccard">
      <CardHead name={m.name} deg="1st" title="Your 1st-degree connection" open={open} controls={bodyId}
        onToggle={onToggle}
        right={
          <button className={STATUS_CLASS[c.status]} type="button"
            aria-label={'Outreach status for ' + m.name + ': ' + c.status + '. Click to change.'}
            onClick={(e) => { e.stopPropagation(); onChange({ status: STATUS_CYCLE[c.status] }); }}>
            {c.status}
          </button>
        } />
      {open && (
        <div id={bodyId}>
          <div className="ccard-body">
            <textarea className="ta" id={'note-' + key.replace(':', '-')} rows={8} value={c.text}
              aria-label={'Intro request to ' + m.name}
              onChange={(e) => onChange({ text: e.target.value })} />
            <div className="count-row">
              <span>{'intro request to ' + first(m.name)}</span>
              <span className="num">{c.text.length}</span>
            </div>
          </div>
          <AiToolbar aiKey={key} text={c.text} profile={profile} maxChars={600}
            onApply={(text) => onChange({ text })}
            extra={
              <div className="links">
                <CopyButton className="btn-text" label="Copy message" text={c.text} />
                <a href={m.profileUrl} target="_blank" rel="noopener">Open LinkedIn profile ↗</a>
                {other && (
                  <button className="btn-text" type="button"
                    onClick={() => onChange({ mutualIndex: 1 - i, text: draftIntroRequest(other, c, job, profile) })}>
                    {'Ask ' + first(other.name) + ' instead'}
                  </button>
                )}
              </div>
            } />
        </div>
      )}
    </div>
  );
}

// The 2nd-degree person the mutual is being asked to reach: no message of its own,
// so opening it just reveals the profile link (and the intro request beside it).
function TargetCard({ contact: c, open, onToggle }: { contact: Contact } & Open) {
  const more = (c.mutualCount ?? 0) - c.mutuals.length;
  const bodyId = 'target-body-' + c.id;
  return (
    <div className="ccard">
      <CardHead name={c.name} deg="2nd" title={c.title} open={open} controls={bodyId} onToggle={onToggle}
        note={more > 0 && <div className="reason">{'+' + more + ' more mutual connection' + (more === 1 ? '' : 's')}</div>} />
      {open && (
        <div className="ccard-body" id={bodyId}>
          <div className="links">
            <a href={c.profileUrl} target="_blank" rel="noopener">Open LinkedIn profile ↗</a>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A 2nd-degree contact with at least one mutual: [ mutual ] → [ target ].
 * The pair is one outreach, so either card opens the shared intro request.
 */
export default function PairRow(props: Props) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen(!open);
  return (
    <div className="pair">
      <MutualCard {...props} open={open} onToggle={toggle} />
      <div className="pair-arrow" aria-hidden="true" />
      <TargetCard contact={props.contact} open={open} onToggle={toggle} />
    </div>
  );
}
