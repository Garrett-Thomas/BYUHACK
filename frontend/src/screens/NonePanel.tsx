import type { ReactNode } from 'react';
import type { Job } from '../types';

interface Props {
  job: Job;
  onCollect: () => void;
  children?: ReactNode;
}

export default function NonePanel({ job, onCollect, children }: Props) {
  return (
    <div className="none-panel">
      <div className="none-title">No connections collected yet</div>
      <p className="none-body">
        {"We'll look up people at " + job.company +
          " you've saved with the Warmline extension, draft a referral note for each using your resume, and search the web for a recruiter or HR email."}
      </p>
      <button className="btn btn-accent" type="button" style={{ marginTop: 6 }} onClick={onCollect}>
        Collect connections &amp; HR email
      </button>
      <div className="eyebrow" style={{ textTransform: 'none', letterSpacing: 0 }}>
        takes about a minute
      </div>
      {children && (
        <div style={{ borderTop: '1px solid var(--hair)', paddingTop: 16, marginTop: 6, display: 'flex',
          flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--ink-3)', fontSize: 14 }}>
          {children}
        </div>
      )}
    </div>
  );
}
