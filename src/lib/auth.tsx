import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Admin credentials now live server-side (Vercel env vars) and are checked
// by api/auth.ts — nothing secret ships in this bundle. This context just
// talks to that endpoint and mirrors the HttpOnly session cookie's state.

interface AuthContextValue {
  isAdmin: boolean;
  authReady: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    fetch("/api/auth", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { isAdmin: false }))
      .then((data) => setIsAdmin(Boolean(data.isAdmin)))
      .catch(() => setIsAdmin(false))
      .finally(() => setAuthReady(true));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/auth", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) setIsAdmin(true);
    return res.ok;
  }, []);

  const logout = useCallback(() => {
    setIsAdmin(false);
    void fetch("/api/auth", { method: "DELETE", credentials: "include" });
  }, []);

  const value = useMemo(
    () => ({ isAdmin, authReady, login, logout }),
    [isAdmin, authReady, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
