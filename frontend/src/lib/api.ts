import { useAuthStore } from '@/stores/auth';

const API_BASE = '/api';

let refreshPromise: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) {
    throw new Error('Session expired');
  }
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message ?? json?.message ?? 'Session expired');
  }
  const data = json.data ?? json;
  useAuthStore.getState().setAuth(data.accessToken, data.user, data.refreshToken);
}

export async function api<T>(
  path: string,
  options?: RequestInit & { token?: string }
): Promise<{ data: T; ok: boolean; meta?: unknown }> {
  const { token, ...init } = options ?? {};
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  let res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  let json = await res.json().catch(() => ({}));

  if (res.status === 401 && token) {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (refreshToken) {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      await refreshPromise;
      const newToken = useAuthStore.getState().accessToken;
      if (newToken) {
        const retryHeaders: HeadersInit = {
          'Content-Type': 'application/json',
          ...(init.headers as Record<string, string>),
          Authorization: `Bearer ${newToken}`,
        };
        res = await fetch(`${API_BASE}${path}`, { ...init, headers: retryHeaders });
        json = await res.json().catch(() => ({}));
      }
    }
  }

  if (!res.ok) {
    throw new Error(json?.error?.message ?? json?.message ?? `HTTP ${res.status}`);
  }
  return {
    data: json.data ?? json,
    ok: res.ok,
    ...(json.meta != null && { meta: json.meta }),
  };
}

export function getWsUrl(instanceId: number, token: string): string {
  const base = window.location.origin.replace(/^http/, 'ws');
  return `${base}/ws/instance/${instanceId}?token=${encodeURIComponent(token)}`;
}
