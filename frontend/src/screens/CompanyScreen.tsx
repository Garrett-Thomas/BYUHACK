import { useState } from 'react';
import type { Job, JobData } from '../types';
import RecentSearches from './RecentSearches';

interface Props {
  companyJobs: Job[];
  data: Record<string, JobData>;
  onSearch: (name: string) => void;
  onOpen: (job: Job) => void;
}

export default function CompanyScreen({ companyJobs, data, onSearch, onOpen }: Props) {
  const [name, setName] = useState('');
  return (
    <div className="col-640">
      <h1>Find connections by company</h1>
      <p className="sub" style={{ margin: '8px 0 24px' }}>
        No posted listing? We'll find people at the company and draft general referral asks plus an email to their recruiting team.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <input className="inp inp-lg" id="co-input" type="text" value={name}
          placeholder="Company name, e.g. Linear" aria-label="Company name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSearch(name); } }} />
        <button className="btn btn-accent-sm" type="button" style={{ padding: '0 18px', fontWeight: 500 }}
          onClick={() => onSearch(name)}>Find people</button>
      </div>
      {companyJobs.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Recent company searches</div>
          <RecentSearches jobs={companyJobs} data={data} onOpen={onOpen} />
        </div>
      )}
    </div>
  );
}
