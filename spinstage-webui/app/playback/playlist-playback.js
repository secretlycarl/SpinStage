/** Playlist track identity + start-index helpers for browse playback. */

function maItemIdFromUri(uri) {
    if (!uri || typeof uri !== 'string') return '';
    try {
        const withoutScheme = uri.includes('://') ? uri.split('://').slice(1).join('://') : uri;
        const segments = withoutScheme.split('/').filter(Boolean);
        const last = segments[segments.length - 1] || '';
        return last && last !== '..' ? last : '';
    } catch {
        return '';
    }
}

function playlistTrackIdentityKeys(track) {
    if (!track) return [];
    const keys = new Set();
    const add = (v) => {
        if (v == null || v === '') return;
        keys.add(String(v));
    };
    add(track.uri);
    add(track.path);
    add(track.item_id);
    add(maItemIdFromUri(track.uri || track.path || ''));
    return [...keys];
}

function playlistTracksShareIdentity(a, b) {
    if (!a || !b) return false;
    const keysB = new Set(playlistTrackIdentityKeys(b));
    return playlistTrackIdentityKeys(a).some((k) => keysB.has(k));
}

export function findPlaylistTrackIndex(tracks, item, uris) {
    const clicked = item?.raw || item;
    if (!clicked || !tracks?.length) return -1;
    for (let i = 0; i < tracks.length; i++) {
        if (playlistTracksShareIdentity(clicked, tracks[i])) return i;
        if (uris?.[i] && playlistTracksShareIdentity(clicked, { uri: uris[i] })) return i;
    }
    return -1;
}

export function filterDistinctPlaylistTracks(source, tracks) {
    if (!Array.isArray(tracks)) return [];
    return tracks.filter((track) => !tracksLikelySameRecording(source, track));
}

function normalizeTrackName(name) {
    return String(name || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

function tracksLikelySameRecording(a, b) {
    if (!a || !b) return false;
    if (playlistTracksShareIdentity(a, b)) return true;
    const nameA = normalizeTrackName(a.name || a.title);
    const nameB = normalizeTrackName(b.name || b.title);
    if (!nameA || !nameB || nameA !== nameB) return false;
    const durA = Number(a.duration ?? a.media_item?.duration ?? 0);
    const durB = Number(b.duration ?? b.media_item?.duration ?? 0);
    if (durA > 0 && durB > 0) return Math.abs(durA - durB) <= 4;
    return true;
}

export function resolveMaStartItem(item, playlistTracks) {
    const direct = item?.uri || item?.raw?.uri || item?.path || '';
    if (!playlistTracks?.length) return direct;
    const idx = findPlaylistTrackIndex(playlistTracks, item, null);
    if (idx < 0) return direct;
    const match = playlistTracks[idx];
    return match?.uri || direct;
}
