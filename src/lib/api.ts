import {
  cacheGet,
  cacheSet,
  enqueueOfflineAction,
  getPendingQueue,
  removeQueueItems,
  setLastSyncTimestamp,
} from './offlineDb';

const TOKEN_KEY = 'km_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  cacheKey?: string
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const resp = await fetch(url, { ...options, headers, credentials: 'include' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error((data as { error?: string }).error || `Request failed (${resp.status})`);
    }
    if (cacheKey && (!options.method || options.method === 'GET')) {
      await cacheSet(cacheKey, data);
    }
    return data as T;
  } catch (err) {
    if (cacheKey && (!options.method || options.method === 'GET')) {
      const cached = await cacheGet<T>(cacheKey);
      if (cached) {
        return { ...(cached.value as object), _fromOfflineCache: true, _cachedAt: cached.cachedAt } as T;
      }
    }
    throw err;
  }
}

export async function syncPendingOfflineActions(): Promise<{ synced: number; conflicts: number; syncedAt: string | null }> {
  if (!navigator.onLine) return { synced: 0, conflicts: 0, syncedAt: null };
  const queue = await getPendingQueue();
  if (queue.length === 0) return { synced: 0, conflicts: 0, syncedAt: null };

  const res = await apiFetch<{
    synced_at: string;
    results: Array<{ id: string; status: 'applied' | 'skipped_conflict' | 'error' }>;
  }>('/api/sync', {
    method: 'POST',
    body: JSON.stringify({ actions: queue }),
  });

  const doneIds = res.results
    .filter((r) => r.status === 'applied' || r.status === 'skipped_conflict')
    .map((r) => r.id);
  if (doneIds.length > 0) {
    await removeQueueItems(doneIds);
  }
  await setLastSyncTimestamp(res.synced_at);

  return {
    synced: res.results.filter((r) => r.status === 'applied').length,
    conflicts: res.results.filter((r) => r.status === 'skipped_conflict').length,
    syncedAt: res.synced_at,
  };
}

export { enqueueOfflineAction, getPendingQueue };
