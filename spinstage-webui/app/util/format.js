/** Time / progress display helpers */

export const PROGRESS_THUMB_PX = 18;

export const PROGRESS_THUMB_VISIBLE_PX = 26;

export function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function progressFillWidth(ratio) {
    const r = Math.max(0, Math.min(1, ratio));
    if (r <= 0) return '0%';
    const thumbHalf = PROGRESS_THUMB_PX / 2;
    return `calc(${thumbHalf}px + (100% - ${PROGRESS_THUMB_PX}px) * ${r})`;
}

export function progressThumbLeft(ratio) {
    const r = Math.max(0, Math.min(1, ratio));
    const half = PROGRESS_THUMB_VISIBLE_PX / 2;
    return `calc(${half}px + (100% - ${PROGRESS_THUMB_VISIBLE_PX}px) * ${r})`;
}

export function episodeDateMs(ep) {
    if (!ep) return 0;
    const raw = ep.metadata?.release_date || ep.release_date || ep.published_at
        || ep.metadata?.published || ep.datetime || ep.metadata?.pubdate || ep.year || '';
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? 0 : ms;
}

export function trimMapCache(map, max) {
    while (map.size > max) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
    }
}
