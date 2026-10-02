import type { Job, JobData, Screen } from '../types';
import { categoryOf, syncedLabel } from '../lib/format';
import MultiSelect from '../components/MultiSelect';
import PillToggle from '../components/PillToggle';
import JobsTable from './JobsTable';

interface Props {
  jobs: Job[];
  repoCount: number;
  generatedAt: Date | null;
  data: Record<string, JobData>;
  showRepo: boolean;
  query: string;
  companyFilters: string[];
  locationFilters: string[];
  termFilters: string[];
  onQuery: (q: string) => void;
  onCompanyFilters: (v: string[]) => void;
  onLocationFilters: (v: string[]) => void;
  onTermFilters: (v: string[]) => void;
  onOpen: (job: Job) => void;
  onCompanySearch: (name: string) => void;
  go: (s: Screen) => void;
}

const uniq = (xs: string[]) => Array.from(new Set(xs)).sort();

export default function JobsScreen(p: Props) {
  const { jobs, query, companyFilters, locationFilters, termFilters } = p;
  const hasFilters = !!(query || companyFilters.length || locationFilters.length || termFilters.length);

  const q = query.trim().toLowerCase();
  const rows = jobs.filter((j) =>
    (!q || (j.role + ' ' + j.company).toLowerCase().includes(q)) &&
    (!companyFilters.length || companyFilters.includes(j.company)) &&
    (!locationFilters.length || locationFilters.includes(j.location)) &&
    (!termFilters.length || termFilters.includes(categoryOf(j))));

  const toggleTerm = (label: string) => p.onTermFilters(
    termFilters.includes(label) ? termFilters.filter((t) => t !== label) : [...termFilters, label]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Open roles</h1>
          <p className="sub">{jobs.length + ' listings pulled from ' + p.repoCount +
            ' GitHub repos · ' + syncedLabel(p.generatedAt)}</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={() => p.go('company')}>
          No listing? Search a company →
        </button>
      </div>
      <div className="filters">
        <input className="inp" id="q" type="search" value={query}
          placeholder="Search role title…" aria-label="Search role title"
          onChange={(e) => p.onQuery(e.target.value)} />
        <MultiSelect id="f-company" allLabel="All companies" ariaLabel="Filter by company"
          options={uniq(jobs.map((j) => j.company))} selected={companyFilters} onChange={p.onCompanyFilters} />
        <MultiSelect id="f-location" allLabel="All locations" ariaLabel="Filter by location"
          options={uniq(jobs.map((j) => j.location))} selected={locationFilters} onChange={p.onLocationFilters} />
        <div className="pill-group" role="group" aria-label="Filter by internship or new grad">
          {['Internship', 'New Grad'].map((label) => (
            <PillToggle key={label} label={label} on={termFilters.includes(label)} onToggle={() => toggleTerm(label)} />
          ))}
        </div>
        <button className="btn btn-under" type="button" hidden={!hasFilters}
          onClick={() => {
            p.onQuery(''); p.onCompanyFilters([]); p.onLocationFilters([]); p.onTermFilters([]);
          }}>Clear</button>
      </div>
      <JobsTable rows={rows} data={p.data} showRepo={p.showRepo} onOpen={p.onOpen}
        onFindCompany={() => p.onCompanySearch(companyFilters[0] || query || 'Linear')} />
    </>
  );
}
