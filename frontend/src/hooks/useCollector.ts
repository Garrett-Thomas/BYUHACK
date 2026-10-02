import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Job, JobData, Profile, Speed } from '../types';
import { SPEEDS, logLines } from '../data/constants';
import { buildDone } from '../lib/drafting';

type SetData = Dispatch<SetStateAction<Record<string, JobData>>>;
type Timer = ReturnType<typeof setTimeout>;

export function useCollector(setData: SetData, speed: Speed) {
  const intervals = useRef<Record<string, Timer>>({});
  const finishers = useRef<Record<string, Timer>>({});

  useEffect(() => () => {
    Object.values(intervals.current).forEach(clearInterval);
    Object.values(finishers.current).forEach(clearTimeout);
  }, []);

  return useCallback((job: Job, profile: Profile) => {
    const lines = logLines(job.company);
    const done = buildDone(job, profile);
    clearInterval(intervals.current[job.id]);
    clearTimeout(finishers.current[job.id]);
    setData((prev) => ({ ...prev, [job.id]: { status: 'collecting', step: 0, contacts: [] } }));

    const tick = SPEEDS[speed] || SPEEDS.Normal;
    let step = 0;
    let aborted = false;
    intervals.current[job.id] = setInterval(() => {
      if (aborted) { clearInterval(intervals.current[job.id]); return; }
      step++;
      const atEnd = step >= lines.length;
      if (atEnd) clearInterval(intervals.current[job.id]);
      setData((prev) => {
        const d = prev[job.id];
        if (!d || d.status !== 'collecting') { aborted = true; return prev; }
        const contacts = atEnd ? d.contacts
          : step < 3 ? [] : done.contacts.slice(0, Math.min(5, (step - 2) * 2));
        return { ...prev, [job.id]: { ...d, step, contacts } };
      });
      if (atEnd) {
        finishers.current[job.id] = setTimeout(() => {
          setData((prev) => ({ ...prev, [job.id]: done }));
        }, 500);
      }
    }, tick);
  }, [setData, speed]);
}
