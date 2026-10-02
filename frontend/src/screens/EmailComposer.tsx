import type { HTMLAttributes } from 'react';
import type { Email, Profile } from '../types';
import AiToolbar from '../components/AiToolbar';
import CopyButton from '../components/CopyButton';

interface Props {
  jobId: string;
  email: Email;
  profile: Profile;
  onChange: (patch: Partial<Email>) => void;
  panel?: HTMLAttributes<HTMLElement>; // tabpanel wiring from DonePanel
}

export default function EmailComposer({ jobId, email, profile, onChange, panel }: Props) {
  const mailto = 'mailto:' + email.to +
    '?subject=' + encodeURIComponent(email.subject) +
    '&body=' + encodeURIComponent(email.text);

  return (
    <section {...panel}>
      <h2 style={{ marginBottom: 12 }}>Email to hiring team</h2>
      <div className="card card-18">
        <div className="ehead">
          <span className="ehead-k">To</span>
          <div className="eto">
            <span className="eto-addr">{email.to}</span>
            <span className="conf">{email.confidence}</span>
          </div>
          <span className="ehead-k">Name</span>
          <span>{email.toName}</span>
          <span className="ehead-k">Subject</span>
          <input className="inp-flat" id={'email-subject-' + jobId} type="text" value={email.subject}
            aria-label="Email subject" onChange={(e) => onChange({ subject: e.target.value })} />
        </div>
        <textarea className="ta-flat" id={'email-body-' + jobId} rows={13} value={email.text}
          aria-label="Email body" onChange={(e) => onChange({ text: e.target.value })} />
        <AiToolbar aiKey={jobId + ':email'} text={email.text} profile={profile} onApply={(text) => onChange({ text })}
          extra={
            <div className="esend">
              <a className="btn btn-accent-sm" href={mailto}>Open in mail app</a>
              <CopyButton className="btn btn-outline" label="Copy" text={email.text} />
            </div>
          } />
      </div>
      <div className="esource">
        {'Found via web search. ' + profile.name + "'s resume will be attached."}
      </div>
    </section>
  );
}
