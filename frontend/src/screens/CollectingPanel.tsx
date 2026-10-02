import type { Contact, LogEntry } from '../types';
import { initials } from '../lib/format';

const EXPECTED = 5;

interface Props {
  log: LogEntry[];
  contacts: Contact[];
}

export default function CollectingPanel({ log, contacts }: Props) {
  // Done entries over the expected total (~5), clamped so extra entries can't overflow the bar.
  const pct = Math.min(100, Math.round((log.filter((l) => l.state === 'done').length / EXPECTED) * 100));

  return (
    <div className="collect-col">
      <div className="term" id="term">
        <div className="term-top">
          <span>search</span>
          <span className="num" id="pct">{pct + '%'}</span>
        </div>
        <div className="term-track"><div className="term-bar" id="bar" style={{ width: pct + '%' }} /></div>
        <div id="log">
          {log.map((l) => (
            <div className="term-line" key={l.id}>
              <span className="term-mark">{l.state === 'done' ? '✓' : l.state === 'error' ? '✗' : '›'}</span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
        <span className="cursor" aria-hidden="true"></span>
      </div>
      <div className="found">
        <div className="eyebrow" id="found-count">{'Saved connections · ' + contacts.length}</div>
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
