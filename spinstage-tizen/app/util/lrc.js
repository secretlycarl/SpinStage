/**
 * Parse LRC synced lyrics and plain lyric text into line arrays.
 */

const LRC_TIME_TAG = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g;

/** @returns {{ time: number, text: string }[]} sorted by time */
export function parseLrc(raw) {
    if (!raw || typeof raw !== 'string') return [];
    const entries = [];
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        LRC_TIME_TAG.lastIndex = 0;
        const parts = trimmed.split(LRC_TIME_TAG);
        // split with capture: ["", "00", "08.92", " phrase ", "00", "10.95", " next", ...]
        if (parts.length < 4) continue;
        for (let i = 1; i + 2 < parts.length; i += 3) {
            const min = Number(parts[i]);
            const sec = Number(parts[i + 1]);
            if (!Number.isFinite(min) || !Number.isFinite(sec)) continue;
            let text = (parts[i + 2] || '').trim();
            if (!text) text = '…';
            entries.push({ time: min * 60 + sec, text });
        }
    }
    entries.sort((a, b) => a.time - b.time || a.text.localeCompare(b.text));
    return entries;
}

/** @returns {string[]} */
export function splitPlainLyrics(raw) {
    if (!raw || typeof raw !== 'string') return [];
    return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

export function findLrcLineIndex(lines, positionSec) {
    if (!lines?.length || !Number.isFinite(positionSec)) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].time <= positionSec) idx = i;
        else break;
    }
    return idx;
}
