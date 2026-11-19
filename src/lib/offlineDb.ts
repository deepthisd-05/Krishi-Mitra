import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'krishi_mitra_offline_v1';
const DB_VERSION = 1;

export interface OfflineAction {
  id: string;
  type: 'TASK_UPDATE' | 'CUSTOM_TASK' | 'FIELD_NOTE' | 'SOIL_PLAN' | 'LEAF_ADD_TO_CALENDAR';
  payload: Record<string, unknown>;
  createdAt: number;
}

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache');
      }
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id' });
      }
    },
  });
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await getDb();
    await db.put('cache', { value, cachedAt: new Date().toISOString() }, key);
  } catch {
    // Ignore storage quota issues safely
  }
}

export async function cacheGet<T>(key: string): Promise<{ value: T; cachedAt: string } | null> {
  try {
    const db = await getDb();
    const record = await db.get('cache', key);
    return record ?? null;
  } catch {
    return null;
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete('cache', key);
  } catch {
    // Ignore storage errors safely
  }
}

export async function enqueueOfflineAction(action: Omit<OfflineAction, 'id' | 'createdAt'>): Promise<OfflineAction> {
  const entry: OfflineAction = {
    ...action,
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  const db = await getDb();
  await db.put('queue', entry);
  return entry;
}

export async function getPendingQueue(): Promise<OfflineAction[]> {
  try {
    const db = await getDb();
    return (await db.getAll('queue')) as OfflineAction[];
  } catch {
    return [];
  }
}

export async function removeQueueItems(ids: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('queue', 'readwrite');
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}

export async function getLastSyncTimestamp(): Promise<string | null> {
  const meta = await cacheGet<string>('last_sync_at');
  return meta?.value ?? null;
}

export async function setLastSyncTimestamp(ts: string): Promise<void> {
  await cacheSet('last_sync_at', ts);
}
