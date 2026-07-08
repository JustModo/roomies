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

export async function fetchApi(endpoint: string, options: ApiOptions = {}) {
  const token = localStorage.getItem('token');
  
  const headers = new Headers(options.headers || {});
  let body = options.body;
  
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    body
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    throw new ApiError(response.status, data.message || data.error || 'API Request Failed', data);
  }

  return data;
}
