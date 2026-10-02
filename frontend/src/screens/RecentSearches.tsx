import type { Job, JobData } from '../types';
import { statusOf } from '../lib/format';

interface Props {
  jobs: Job[];
  data: Record<string, JobData>;
  onOpen: (job: Job) => void;
}

export default function RecentSearches({ jobs, data, onOpen }: Props) {
  return (
    <div className="card" id="recents">
      {jobs.map((j) => (
        <button key={j.id} className="recent-row" type="button" onClick={() => onOpen(j)}>
          <span style={{ fontWeight: 500 }}>{j.company}</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{statusOf(data[j.id]).text}</span>
        </button>
      ))}
    </div>
  );
}
