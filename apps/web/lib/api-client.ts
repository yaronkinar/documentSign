/**
 * Typed fetch wrapper for the DocFlow API.
 *
 * - Server Components: pass a Clerk-issued token via `token` option.
 *   (Use `await auth().getToken()` from @clerk/nextjs/server.)
 * - Client Components: use the `useApiClient()` hook below.
 */

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_URL =
  typeof window === 'undefined'
    ? (process.env.API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:3001')
    : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001');

const SERVER_BYPASS_TOKEN =
  process.env.BYPASS_AUTH === 'true'
    ? (process.env.BYPASS_TOKEN ?? null)
    : null;

interface RequestOptions {
  token?: string | null;
  query?: Record<string, string | number | undefined>;
}

function formatApiErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(', ');
  }
  return fallback;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = SERVER_BYPASS_TOKEN ?? opts.token;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (err) {
    const hint =
      err instanceof TypeError
        ? ` Cannot reach the API at ${API_URL}. Is "npm run dev:api" running?`
        : '';
    throw new Error(
      `Network error calling ${method} ${path}.${hint}`,
      { cause: err },
    );
  }
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      message = formatApiErrorMessage(data, message);
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiClient = {
  get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return request<T>('GET', path, undefined, opts);
  },
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return request<T>('POST', path, body, opts);
  },
  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return request<T>('PATCH', path, body, opts);
  },
  delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    return request<T>('DELETE', path, undefined, opts);
  },
};

// ---------------------------------------------------------------------------
// Client-side hook that automatically attaches the Clerk token
// ---------------------------------------------------------------------------

import { useAuth } from '@clerk/nextjs';
import { useCallback, useMemo } from 'react';

const CLIENT_BYPASS_TOKEN =
  process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true'
    ? (process.env.NEXT_PUBLIC_BYPASS_TOKEN ?? null)
    : null;

export function useApiClient() {
  const { getToken } = useAuth();

  const withToken = useCallback(
    async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
      const token = CLIENT_BYPASS_TOKEN ?? (await getToken());
      if (!token) throw new ApiError(401, 'Not authenticated');
      return fn(token);
    },
    [getToken],
  );

  return useMemo(
    () => ({
      get<T>(path: string, query?: RequestOptions['query']) {
        return withToken<T>((token) =>
          apiClient.get<T>(path, { token, query }),
        );
      },
      post<T>(
        path: string,
        body?: unknown,
        query?: RequestOptions['query'],
      ) {
        return withToken<T>((token) =>
          apiClient.post<T>(path, body, { token, query }),
        );
      },
      patch<T>(
        path: string,
        body?: unknown,
        query?: RequestOptions['query'],
      ) {
        return withToken<T>((token) =>
          apiClient.patch<T>(path, body, { token, query }),
        );
      },
      delete<T>(path: string) {
        return withToken<T>((token) => apiClient.delete<T>(path, { token }));
      },
    }),
    [withToken],
  );
}
