import { AuthResponse } from '@roomies/contracts';

export class ApiError extends Error {}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | object;
}

export interface AuthStatus {
  needsBootstrap: boolean;
  hasRoot: boolean;
}

export interface ApiClient {
  getSession(): AuthResponse | null;
  subscribe(listener: () => void): () => void;
  setSession(session: AuthResponse | null): void;
  refresh(): Promise<AuthResponse | null>;
  request<T = unknown>(endpoint: string, options?: RequestOptions): Promise<T>;
  login(username: string, password: string): Promise<AuthResponse>;
  setupRoot(username: string, password: string): Promise<AuthResponse>;
  authStatus(): Promise<AuthStatus>;
  logout(): void;
  onUnauthorized(handler: () => void): () => void;
}

interface ApiClientDeps {
  base?: string;
  fetch?: typeof fetch;
  locks?: LockManager;
}

const isJsonBody = (body: RequestOptions['body']): body is object =>
  typeof body === 'object' && body !== null && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof URLSearchParams);

export function createApiClient({ base = '/api', fetch: fetchFn = fetch.bind(globalThis), locks = globalThis.navigator?.locks }: ApiClientDeps = {}): ApiClient {
  let session: AuthResponse | null = null;
  let refreshing: Promise<AuthResponse | null> | null = null;
  const listeners = new Set<() => void>();
  const unauthorizedHandlers = new Set<() => void>();

  const setSession = (next: AuthResponse | null) => {
    session = next;
    listeners.forEach((listener) => listener());
  };

  const send = (endpoint: string, { body, headers, ...init }: RequestOptions = {}) => {
    const merged = new Headers(headers);
    if (session) merged.set('Authorization', `Bearer ${session.token}`);
    if (isJsonBody(body)) merged.set('Content-Type', 'application/json');
    return fetchFn(`${base}${endpoint}`, { ...init, headers: merged, body: isJsonBody(body) ? JSON.stringify(body) : body });
  };

  const refresh = () => {
    refreshing ??= (async () => {
      try {
        const post = () => fetchFn(`${base}/auth/refresh`, { method: 'POST' });
        const res = locks ? await locks.request('roomies-auth-refresh', post) : await post();
        const next: AuthResponse | null = res.ok ? await res.json() : null;
        setSession(next);
        return next;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  };

  const request = async <T,>(endpoint: string, options?: RequestOptions): Promise<T> => {
    let res = await send(endpoint, options);
    if (res.status === 401 && (await refresh().catch(() => null))) res = await send(endpoint, options);

    const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) {
      if (res.status === 401) unauthorizedHandlers.forEach((handler) => handler());
      throw new ApiError(data?.message || data?.error || 'API Request Failed');
    }
    return data as T;
  };

  const authenticate = async (endpoint: string, username: string, password: string) => {
    const res = await fetchFn(`${base}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });
    if (!res.ok) throw new ApiError('Authentication failed');
    const next: AuthResponse = await res.json();
    setSession(next);
    return next;
  };

  return {
    getSession: () => session,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSession,
    refresh,
    request,
    login: (username, password) => authenticate('/auth/login', username, password),
    setupRoot: (username, password) => authenticate('/auth/setup', username, password),
    authStatus: async () => {
      const res = await fetchFn(`${base}/auth/status`);
      return res.json();
    },
    logout: () => {
      fetchFn(`${base}/auth/logout`, { method: 'POST' }).catch(() => {});
      setSession(null);
    },
    onUnauthorized: (handler) => {
      unauthorizedHandlers.add(handler);
      return () => unauthorizedHandlers.delete(handler);
    },
  };
}
