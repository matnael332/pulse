// Who is signed in: /api/me, loaded once and refreshed after anything that changes it.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { ApiError, getMe, type Me } from "./api";

interface Session {
  me: Me | null; // null: not signed in
  loading: boolean;
  failed: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setMe(await getMe());
      setFailed(false);
    } catch (error) {
      setMe(null);
      setFailed(!(error instanceof ApiError && error.status === 401));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <SessionContext.Provider value={{ me, loading, failed, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession outside SessionProvider");
  return value;
}
