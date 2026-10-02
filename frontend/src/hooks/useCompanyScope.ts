import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompanyScope } from '../lib/api';
import { deleteCompanyScope, getCompanyScope } from '../lib/api';

// The saved LinkedIn company for `company`. `scope` is undefined until the first
// fetch settles (so the screen doesn't flash the Find-company state), then the
// scope or null. refresh() re-fetches (called on every poll tick); clear() is
// "change". Results from a superseded fetch (company changed, or clear() ran)
// are dropped via `ver`.
export function useCompanyScope(company: string) {
  const [st, setSt] = useState<{ company: string; scope: CompanyScope | null } | null>(null);
  const ver = useRef(0);

  const refresh = useCallback(() => {
    const v = ver.current;
    getCompanyScope(company).then(
      (scope) => { if (ver.current === v) setSt({ company, scope }); },
      // A failed first fetch settles to "no scope"; a failed tick keeps what we had.
      () => { if (ver.current === v) setSt((s) => (s && s.company === company ? s : { company, scope: null })); },
    );
  }, [company]);

  useEffect(() => {
    refresh();
    return () => { ver.current++; };
  }, [refresh]);

  // Resolves true once the scope is gone on the server and cleared locally.
  const clear = useCallback(async () => {
    ver.current++;
    try {
      await deleteCompanyScope(company);
    } catch {
      return false;
    }
    ver.current++;
    setSt({ company, scope: null });
    return true;
  }, [company]);

  return { scope: st && st.company === company ? st.scope : undefined, refresh, clear };
}
