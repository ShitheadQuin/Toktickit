import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface Requester {
  id: number;
  name: string;
}

interface RequesterContextValue {
  requester: Requester | null;
  selectRequester: (requester: Requester) => void;
  clearRequester: () => void;
}

const STORAGE_KEY = 'toktickit.selectedRequester';

const RequesterContext = createContext<RequesterContextValue | undefined>(undefined);

function readStoredRequester(): Requester | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.id === 'number' && typeof parsed?.name === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<Requester | null>(() => readStoredRequester());

  const selectRequester = useCallback((next: Requester) => {
    setRequester(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // sessionStorage may be unavailable (e.g. private browsing); selection still
      // works in-memory for the current page load.
    }
  }, []);

  const clearRequester = useCallback(() => {
    setRequester(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // see above
    }
  }, []);

  return (
    <RequesterContext.Provider value={{ requester, selectRequester, clearRequester }}>
      {children}
    </RequesterContext.Provider>
  );
}

export function useRequester() {
  const context = useContext(RequesterContext);
  if (!context) {
    throw new Error('useRequester must be used within a RequesterProvider');
  }
  return context;
}
