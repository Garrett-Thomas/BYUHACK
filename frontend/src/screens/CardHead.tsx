import type { ReactNode } from 'react';
import { initials } from '../lib/format';

interface Props {
  name: string;
  deg: string;
  title: string;
  note?: ReactNode;
  right?: ReactNode; // status button and the like; stop its own click propagating
  open: boolean;
  controls: string; // id of the body this header expands
  onToggle: () => void;
}

/**
 * The avatar + name row of a contact card, and the disclosure that opens its
 * message. A <div role="button"> rather than a real <button>, so the status
 * button can nest inside it — a <button> can't legally contain another.
 */
export default function CardHead({ name, deg, title, note, right, open, controls, onToggle }: Props) {
  return (
    <div className="ccard-top ccard-click" role="button" tabIndex={0}
      aria-expanded={open} aria-controls={controls}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
      }}>
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
      <span className="ccard-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
    </div>
  );
}
