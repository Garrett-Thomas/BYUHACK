import type { Job } from '../types';

interface Props {
  job: Job;
  onCollect: () => void;
}

export default function NonePanel({ job, onCollect }: Props) {
  return (
    <div className="none-panel">
      <div className="none-title">No connections collected yet</div>
      <p className="none-body">
        {"We'll open a browser, find people at " + job.company +
          ' you can reach out to, draft a referral note for each using your resume, and look up a recruiter or HR email.'}
      </p>
      <button className="btn btn-accent" type="button" style={{ marginTop: 6 }} onClick={onCollect}>
        Collect connections &amp; HR email
      </button>
      <div className="eyebrow" style={{ textTransform: 'none', letterSpacing: 0 }}>
        takes ~1–2 min · uses your LinkedIn session
      </div>
    </div>
  );
}
