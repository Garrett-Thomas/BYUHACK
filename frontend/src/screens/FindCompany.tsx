import type { Job } from '../types';
import { linkedInCompanySearchUrl } from '../lib/format';

interface Props {
  job: Job;
  onFind: () => void;
}

// No LinkedIn company saved yet: the user picks it once, via the extension.
export default function FindCompany({ job, onFind }: Props) {
  return (
    <>
      <div>Pick the right company on LinkedIn once, and Warmline will remember it</div>
      <a className="btn btn-solid" href={linkedInCompanySearchUrl(job.company)} target="_blank" rel="noopener"
        onClick={onFind}>
        {'Find ' + job.company + ' on LinkedIn ↗'}
      </a>
    </>
  );
}
