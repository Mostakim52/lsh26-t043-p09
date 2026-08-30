import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { backendBaseUrl, backendConfigured } from './api';

// ---------------------------------------------------------------- types
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'workshop' | 'viewer';
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

const TOKEN_KEY = 'servicedesk.auth.token.v1';
const USER_KEY = 'servicedesk.auth.user.v1';
const DEV_FLAG = import.meta.env.VITE_DEV_AUTH === 'true' || import.meta.env.DEV;

// ---------------------------------------------------------------- storage helpers
function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function readUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch { return null; }
}
function writeSession(token: string, user: AuthUser) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch { /* ignore */ }
}
function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------- backend calls
export async function loginViaBackend(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  if (!backendConfigured) throw new Error('Backend not configured');

  const res = await fetch(`${backendBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // Map common statuses to friendly messages
    if (res.status === 401) throw new Error('Invalid email or password.');
    if (res.status === 422) throw new Error(detail || 'Please check your details.');
    throw new Error(detail || `Login failed (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as { token: string; user: AuthUser } | { access_token: string; user: AuthUser };
  // Support both { token } and { access_token } shapes
  const token = (data as { token?: string }).token ?? (data as { access_token?: string }).access_token;
  const user = (data as { user: AuthUser }).user;
  if (!token || !user) throw new Error('Malformed login response.');
  return { token: token!, user };
}

export async function fetchMe(token: string): Promise<AuthUser | null> {
  if (!backendConfigured) return null;
  try {
    const res = await fetch(`${backendBaseUrl}/auth/me`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AuthUser | { user: AuthUser };
    if ((data as { user?: AuthUser }).user) return (data as { user: AuthUser }).user;
    return data as AuthUser;
  } catch {
    return null;
  }
}

export async function logoutViaBackend(token: string | null) {
  if (!backendConfigured || !token) return;
  try {
    await fetch(`${backendBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch { /* best effort */ }
}

// ---------------------------------------------------------------- dev dummy
const DEV_USER: AuthUser = {
  id: 'dev-user',
  email: 'dev@shahjalal.local',
  name: 'Dev Workshop',
  role: 'admin',
};

function devToken(): string {
  return 'dev-token-' + Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------- context
interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  isDevMode: boolean;
  devBypassEnabled: boolean;
  login: (email: string, password: string) => Promise<void>;
  devLogin: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    user: readUser(),
    token: readToken(),
    loading: true,
    error: null,
  }));

  // Validate stored token against backend on mount (if backend is live).
  useEffect(() => {
    let cancelled = false;
    async function validate() {
      const token = readToken();
      if (!token || !backendConfigured) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }
      // Dev tokens are local-only — don't validate against backend
      if (token.startsWith('dev-token-')) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }
      const user = await fetchMe(token);
      if (cancelled) return;
      if (!user) {
        clearSession();
        setState({ user: null, token: null, loading: false, error: null });
      } else {
        // Refresh stored user
        writeSession(token, user);
        setState({ user, token, loading: false, error: null });
      }
    }
    void validate();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, error: null }));
    // Dev fallback: if backend unreachable, allow devBypass only via devLogin button.
    // Normal login must hit backend — no silent bypass.
    const { token, user } = await loginViaBackend(email.trim(), password);
    writeSession(token, user);
    setState({ user, token, loading: false, error: null });
  }, []);

  const devLogin = useCallback(async () => {
    const token = devToken();
    writeSession(token, DEV_USER);
    setState({ user: DEV_USER, token, loading: false, error: null });
  }, []);

  const logout = useCallback(async () => {
    const token = readToken();
    await logoutViaBackend(token);
    clearSession();
    setState({ user: null, token: null, loading: false, error: null });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    isAuthenticated: Boolean(state.user && state.token),
    isDevMode: DEV_FLAG,
    // Dev bypass available in dev builds, or when no backend is configured (so the UI is still viewable offline).
    devBypassEnabled: DEV_FLAG || !backendConfigured,
    login,
    devLogin,
    logout,
  }), [state, login, devLogin, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// Helper for api.ts to attach Authorization header
export function getAuthToken(): string | null {
  return readToken();
}
