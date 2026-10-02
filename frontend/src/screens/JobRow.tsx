import type { Job, JobData } from '../types';
import { statusOf } from '../lib/format';

interface Props {
  job: Job;
  data: JobData | undefined;
  cols: string;
  showRepo: boolean;
  onOpen: (job: Job) => void;
}

export default function JobRow({ job: j, data, cols, showRepo, onOpen }: Props) {
  const st = statusOf(data);
  // A <div role="button"> rather than a real <button>, so the repo link below
  // (a real <a>, for proper ctrl/cmd-click and middle-click) can nest inside
  // it — a <button> can't legally contain interactive content.
  return (
    <div className="tbl-row" role="button" tabIndex={0} style={{ gridTemplateColumns: cols }}
      onClick={() => onOpen(j)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(j); }
      }}>
      <div className="c-company">{j.company}</div>
      <div className="c-role">
        <div className="c-role-title">{j.role}</div>
        <div className="c-term">{j.term}</div>
      </div>
      <div className="c-loc">{j.location}</div>
      <div className="c-posted num">{j.posted}</div>
      {showRepo && (
        <div className="c-repo">
          <a href={j.url || ('https://github.com/' + j.repo)} target="_blank" rel="noopener"
            title={j.url ? 'Open the listing: ' + j.url : j.repo}
            onClick={(e) => e.stopPropagation()}>{j.repo}</a>
        </div>
      )}
      <div className="c-status"><span className={st.cls}>{st.text}</span></div>
    </div>
  );
}
