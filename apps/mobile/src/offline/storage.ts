/**
 * Storage abstraction for the mobile offline layer.
 *
 * The offline modules never import a native storage package directly. Anything
 * that implements the {@link KeyValueStorage} shape can be injected, which
 * keeps the cache/wishlist/sync logic pure and unit-testable off-device.
 *
 * In a real Expo app the host calls `configureOfflineStorage(...)` once at
 * startup with `@react-native-async-storage/async-storage` (or an MMKV-backed
 * shim). When nothing is configured we fall back to an in-process memory store
 * so the cache still works for the lifetime of the session.
 */

/** Minimal AsyncStorage-compatible contract used by the offline layer. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys?(): Promise<readonly string[]>;
}

/** Create an in-memory {@link KeyValueStorage}, optionally seeded with data. */
export function createMemoryStorage(
  initial: Record<string, string> = {},
): KeyValueStorage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    async getItem(key: string): Promise<string | null> {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      map.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      map.delete(key);
    },
    async getAllKeys(): Promise<readonly string[]> {
      return [...map.keys()];
    },
  };
}

let defaultStorage: KeyValueStorage | null = null;

/**
 * Register the storage backend used by {@link getOfflineStorage}. Call this
 * before the first `getOfflineServices()` so the services bind to the real
 * (persisted) store rather than the in-memory fallback.
 */
export function configureOfflineStorage(storage: KeyValueStorage): void {
  defaultStorage = storage;
}

/** Resolve the configured storage, lazily creating the in-memory fallback. */
export function getOfflineStorage(): KeyValueStorage {
  if (!defaultStorage) defaultStorage = createMemoryStorage();
  return defaultStorage;
}

/** Read and JSON-parse a value, returning `null` when absent or corrupt. */
export async function readJSON<T>(
  storage: KeyValueStorage,
  key: string,
): Promise<T | null> {
  const raw = await storage.getItem(key);
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** JSON-serialize a value into storage. */
export async function writeJSON<T>(
  storage: KeyValueStorage,
  key: string,
  value: T,
): Promise<void> {
  await storage.setItem(key, JSON.stringify(value));
}
