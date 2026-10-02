import type { Job, JobData } from '../types';
import { gridCols } from '../lib/format';
import JobRow from './JobRow';

interface Props {
  rows: Job[];
  data: Record<string, JobData>;
  showRepo: boolean;
  onOpen: (job: Job) => void;
  onFindCompany: () => void;
}

export default function JobsTable({ rows, data, showRepo, onOpen, onFindCompany }: Props) {
  const cols = gridCols(showRepo);
  return (
    <div className="card" id="tbl">
      <div className="tbl-head" style={{ gridTemplateColumns: cols }}>
        <div>Company</div><div>Role</div><div>Location</div><div>Posted</div>
        {showRepo && <div>Source</div>}
        <div>Outreach</div>
      </div>
      {rows.length ? rows.map((j) => (
        <JobRow key={j.id} job={j} data={data[j.id]} cols={cols} showRepo={showRepo} onOpen={onOpen} />
      )) : (
        <div className="empty-rows">
          <div>No listings match these filters.</div>
          <button className="btn btn-solid" type="button" onClick={onFindCompany}>
            Find connections at a company instead
          </button>
        </div>
      )}
    </div>
  );
}
