/**
 * Persistent lyrics lookup cache (session + localStorage, 90-day TTL).
 */
const STORAGE_KEY = 'spinstage_lyrics_cache_v1';
const MAX_ENTRIES = 200;
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** @type {Map<string, 'none' | { lrcLines: any[]|null, plainLines: string[]|null, trackKey: string }>} */
const memoryCache = new Map();
let storageLoaded = false;

function loadStorage() {
    if (storageLoaded) return;
    storageLoaded = true;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        const now = Date.now();
        const entries = data?.entries && typeof data.entries === 'object' ? data.entries : {};
        for (const [key, entry] of Object.entries(entries)) {
            if (!entry || typeof entry !== 'object') continue;
            if (entry.at != null && now - entry.at > TTL_MS) continue;
            if (entry.status === 'none') {
                memoryCache.set(key, 'none');
            } else if (entry.status === 'hit') {
                memoryCache.set(key, {
                    lrcLines: entry.lrcLines || null,
                    plainLines: entry.plainLines || null,
                    trackKey: key,
                });
            }
        }
    } catch {
        /* ignore corrupt cache */
    }
}

function persistStorage() {
    try {
        const entries = {};
        const now = Date.now();
        for (const [key, value] of memoryCache.entries()) {
            if (value === 'none') {
                entries[key] = { status: 'none', at: now };
            } else {
                entries[key] = {
                    status: 'hit',
                    at: now,
                    lrcLines: value.lrcLines,
                    plainLines: value.plainLines,
                };
            }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries }));
    } catch {
        /* quota / private mode */
    }
}

function trimLyricsCache() {
    while (memoryCache.size > MAX_ENTRIES) {
        const oldest = memoryCache.keys().next().value;
        if (oldest === undefined) break;
        memoryCache.delete(oldest);
    }
}

export function getLyricsCacheEntry(trackKey) {
    if (!trackKey) return undefined;
    loadStorage();
    return memoryCache.get(trackKey);
}

export function cacheLyricsMiss(trackKey) {
    if (!trackKey) return;
    loadStorage();
    memoryCache.set(trackKey, 'none');
    trimLyricsCache();
    persistStorage();
}

export function cacheLyricsHit(trackKey, content) {
    if (!trackKey) return;
    loadStorage();
    memoryCache.set(trackKey, {
        lrcLines: content.lrcLines || null,
        plainLines: content.plainLines || null,
        trackKey,
    });
    trimLyricsCache();
    persistStorage();
}
