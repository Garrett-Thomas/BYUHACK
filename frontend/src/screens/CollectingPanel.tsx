import type { Contact, Job } from '../types';
import { logLines } from '../data/constants';
import { initials } from '../lib/format';

interface Props {
  job: Job;
  step: number;
  contacts: Contact[];
}

export default function CollectingPanel({ job, step, contacts }: Props) {
  const lines = logLines(job.company);
  // The source design evaluates this once more at step === lines.length, which
  // yields 111% and spills the fill past the panel edge — clamped here.
  const pct = Math.min(100, Math.round((step / (lines.length - 1)) * 100));

  return (
    <div className="collect-col">
      <div className="term" id="term">
        <div className="term-top">
          <span>browser agent</span>
          <span className="num" id="pct">{pct + '%'}</span>
        </div>
        <div className="term-track"><div className="term-bar" id="bar" style={{ width: pct + '%' }} /></div>
        <div id="log">
          {lines.slice(0, step + 1).map((t, i) => (
            <div className="term-line" key={i}>
              <span className="term-mark">{i < step ? '✓' : '›'}</span>
              <span>{t}</span>
            </div>
          ))}
        </div>
        <span className="cursor" aria-hidden="true"></span>
      </div>
      <div className="found">
        <div className="eyebrow" id="found-count">{'People found · ' + contacts.length}</div>
        <div className="found" id="found-list">
          {contacts.map((c) => (
            <div className="found-row" key={c.id}>
              <div className="av av-36">{initials(c.name)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.title}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
