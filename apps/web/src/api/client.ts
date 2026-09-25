import { AuthResponse } from '@roomies/contracts';

export const API_BASE_URL = '/api';

export class ApiError extends Error {
  public status: number;
  public data: any;

  constructor(status: number, message: string, data: any = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: any;
}

let accessToken: string | null = null;

/** Registered by AuthContext so any 401 anywhere triggers the same graceful logout, not just /users/me. */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

let onSession: ((session: AuthResponse | null) => void) | null = null;
export const setSessionHandler = (fn: ((session: AuthResponse | null) => void) | null) => {
  onSession = fn;
};

export function applySession(session: AuthResponse | null) {
  accessToken = session?.token ?? null;
  onSession?.(session);
}

let refreshing: Promise<AuthResponse | null> | null = null;

export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= (async () => {
    try {
      const post = () => fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST' });
      const res = navigator.locks ? await navigator.locks.request('roomies-auth-refresh', post) : await post();
      const session: AuthResponse | null = res.ok ? await res.json() : null;
      applySession(session);
      return session;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request(endpoint: string, options: ApiOptions) {
  const headers = new Headers(options.headers || {});
  let body = options.body;

  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    body
  });
}

export async function fetchApi(endpoint: string, options: ApiOptions = {}) {
  let response = await request(endpoint, options);

  if (response.status === 401 && await refreshSession().catch(() => null)) {
    response = await request(endpoint, options);
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    if (response.status === 401) {
      onUnauthorized?.();
    }
    throw new ApiError(response.status, data.message || data.error || 'API Request Failed', data);
  }

  return data;
}
