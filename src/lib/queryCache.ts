/**
 * Global in-memory cache with TTL for Supabase query results.
 * Prevents duplicate fetches and provides instant data on tab switch.
 * Enhanced with stale-while-revalidate and background refresh.
 */

interface CacheEntry<T = unknown> {
    data: T;
    timestamp: number;
    ttl: number;
    staleWhileRevalidate: boolean;
}

const store = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
const backgroundRefreshes = new Map<string, Promise<unknown>>();

/** Default TTL: 60 seconds */
const DEFAULT_TTL = 60_000;
/** Stale-while-revalidate window: 5 minutes */
const STALE_TTL = 300_000;

export function getCached<T>(key: string, allowStale = false): T | null {
    const entry = store.get(key);
    if (!entry) return null;
    
    const age = Date.now() - entry.timestamp;
    
    // Check if expired
    if (!allowStale && age > entry.ttl) {
        // But allow stale data if within stale window
        if (age > STALE_TTL) {
            store.delete(key);
            return null;
        }
    }
    
    return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttl = DEFAULT_TTL, staleWhileRevalidate = true): void {
    store.set(key, { data, timestamp: Date.now(), ttl, staleWhileRevalidate });
}

export function invalidate(key: string): void {
    store.delete(key);
    backgroundRefreshes.delete(key);
}

export function invalidatePrefix(prefix: string): void {
    for (const k of store.keys()) {
        if (k.startsWith(prefix)) {
            store.delete(k);
            backgroundRefreshes.delete(k);
        }
    }
}

export function clearAll(): void {
    store.clear();
    inFlight.clear();
    backgroundRefreshes.clear();
}

/**
 * Check if data is stale but still usable for immediate display
 */
export function isStale(key: string): boolean {
    const entry = store.get(key);
    if (!entry) return false;
    const age = Date.now() - entry.timestamp;
    return age > entry.ttl && age < STALE_TTL;
}

/**
 * Check if data is completely expired
 */
export function isExpired(key: string): boolean {
    const entry = store.get(key);
    if (!entry) return true;
    return Date.now() - entry.timestamp > STALE_TTL;
}

/**
 * Runs one request for a stable cache key, even if React StrictMode or two
 * consumers ask for it at the same time. This deliberately caches only
 * successful responses; failures are never retained or retried here.
 */
export async function fetchCached<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl = DEFAULT_TTL,
    force = false,
): Promise<T> {
    const cached = !force ? getCached<T>(key) : null;
    if (cached !== null) {
        // Trigger background refresh if stale but usable
        if (isStale(key) && !backgroundRefreshes.has(key)) {
            triggerBackgroundRefresh(key, fetcher, ttl);
        }
        return cached;
    }

    const pending = inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const request = fetcher()
        .then((data) => {
            setCached(key, data, ttl);
            return data;
        })
        .finally(() => {
            if (inFlight.get(key) === request) inFlight.delete(key);
        });

    inFlight.set(key, request);
    return request;
}

/**
 * Trigger background refresh without blocking current response
 */
function triggerBackgroundRefresh<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number
): void {
    if (backgroundRefreshes.has(key)) return;
    
    const refreshPromise = fetcher()
        .then((data) => {
            setCached(key, data, ttl);
            return data;
        })
        .catch((error) => {
            console.warn(`[QueryCache] Background refresh failed for ${key}:`, error);
        })
        .finally(() => {
            backgroundRefreshes.delete(key);
        });
    
    backgroundRefreshes.set(key, refreshPromise);
}

export function getCacheAge(key: string): number | null {
    const entry = store.get(key);
    return entry ? Date.now() - entry.timestamp : null;
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats() {
    return {
        size: store.size,
        inFlight: inFlight.size,
        backgroundRefreshes: backgroundRefreshes.size,
        keys: Array.from(store.keys()),
    };
}
