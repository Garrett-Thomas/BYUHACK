import { useCallback, useEffect, useRef, useState } from 'react';

const EVERY = 5000;
const FOR = 10 * 60 * 1000;

// Polls `tick` every 5s for 10 min after start(). Calling start() again restarts
// the window (one timer, never two). Stops on unmount, job change, or expiry.
export function useConnectionPoll(jobId: string, tick: () => void) {
  const [win, setWin] = useState<{ jobId: string; until: number } | null>(null);
  const tickRef = useRef(tick);
  useEffect(() => { tickRef.current = tick; });

  const start = useCallback(() => setWin({ jobId, until: Date.now() + FOR }), [jobId]);

  useEffect(() => {
    if (!win || win.jobId !== jobId) return;
    tickRef.current();
    const iv = setInterval(() => tickRef.current(), EVERY);
    const end = setTimeout(() => setWin(null), Math.max(0, win.until - Date.now()));
    return () => { clearInterval(iv); clearTimeout(end); };
  }, [win, jobId]);

  return { polling: !!win && win.jobId === jobId, start };
}
