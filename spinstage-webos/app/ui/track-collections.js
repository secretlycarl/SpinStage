/**
 * Other Versions / Similar Tracks — MA probes, go-to targets, browse panels.
 */
import { maClient } from '../ma/client.js';
import { state } from '../state.js';
import { uiH } from './handlers.js';
import { openBrowsePanelWithStack } from './browse.js';
import { ensureGoToMediaResolved } from './nav.js';
import { filterDistinctPlaylistTracks } from '../playback/playlist-playback.js';

const EXTRAS_CACHE_MS = 5 * 60 * 1000;
const MENU_PROBE_SIMILAR_LIMIT = 20;
const SIMILAR_TRACKS_PAGE_SIZE = 20;
const extrasProbeInflight = new Map();

function probeInflightKey(track, kind) {
    return `${trackExtrasCacheKey(track)}:${kind}`;
}

function trackExtrasCacheKey(media) {
    if (!media) return '';
    if (media.item_id != null && media.item_id !== '') {
        return `id:${media.item_id}:${media.provider || media.provider_instance_id || ''}`;
    }
    const uri = media.uri || media.path;
    return uri ? `uri:${uri}` : '';
}

function lookupTrackExtrasCache(media) {
    if (!media) return null;
    const keys = new Set();
    const add = (m) => {
        const k = trackExtrasCacheKey(m);
        if (k) keys.add(k);
    };
    add(media);
    if (media.uri) add({ ...media, item_id: null });
    if (media.path && media.path !== media.uri) add({ uri: media.path, item_id: null });
    if (media.item_id != null) {
        add({ item_id: media.item_id, provider: media.provider || media.provider_instance_id });
    }
    for (const key of keys) {
        const hit = state.trackExtrasCache.get(key);
        if (hit) return hit;
    }
    for (const cached of state.trackExtrasCache.values()) {
        if (!cached?.track) continue;
        if (filterDistinctPlaylistTracks(media, [cached.track]).length === 0) return cached;
    }
    return null;
}

function isTrackMedia(media) {
    if (!media) return false;
    return uiH('inferMediaType', media) === 'track';
}

async function resolveTrackMedia(media) {
    await maClient.ensureReady();
    return ensureGoToMediaResolved(media) || media;
}

function applyDistinctTrackLists(track, otherVersions, similarTracks) {
    const versions = filterDistinctPlaylistTracks(track, otherVersions);
    const similar = filterDistinctPlaylistTracks(track, similarTracks);
    return {
        otherVersions: versions,
        similarTracks: similar,
        hasOtherVersions: versions.length > 0,
        hasSimilarTracks: similar.length > 0,
    };
}

export async function probeTrackExtras(media, opts = {}) {
    const trackInput = media;
    if (!trackInput) {
        return {
            hasOtherVersions: false,
            hasSimilarTracks: false,
            otherVersions: [],
            similarTracks: [],
        };
    }

    const track = opts.resolved ? trackInput : await resolveTrackMedia(trackInput);
    const key = trackExtrasCacheKey(track);
    if (!key || !isTrackMedia(track)) {
        return {
            hasOtherVersions: false,
            hasSimilarTracks: false,
            otherVersions: [],
            similarTracks: [],
        };
    }

    const menuProbe = opts.menuProbe === true;
    const kinds = opts.kinds || ['versions', 'similar'];
    const needVersions = kinds.includes('versions');
    const needSimilar = kinds.includes('similar');
    if (!opts.force) {
        const cached = lookupTrackExtrasCache(track);
        if (cached && Date.now() - cached.at < EXTRAS_CACHE_MS) {
            const sameTrack = cached.track?.item_id != null && track.item_id != null
                ? String(cached.track.item_id) === String(track.item_id)
                : !!(cached.track?.uri && track.uri && cached.track.uri === track.uri);
            if (sameTrack) {
                if (menuProbe && cached.similarTracks?.length) return cached;
                if (!menuProbe && cached.fullProbe) return cached;
                if (!menuProbe && needSimilar && !needVersions && cached.similarTracks?.length) return cached;
                if (!menuProbe && needVersions && !needSimilar && cached.otherVersions?.length) return cached;
            }
        }
    }

    const itemId = track?.item_id;
    if (!itemId) {
        const empty = {
            at: Date.now(),
            menuProbe,
            fullProbe: !menuProbe && needVersions && needSimilar,
            hasOtherVersions: false,
            hasSimilarTracks: false,
            otherVersions: [],
            similarTracks: [],
            track,
        };
        state.trackExtrasCache.set(key, empty);
        return empty;
    }

    const prev = lookupTrackExtrasCache(track);
    let otherVersions = prev?.otherVersions || [];
    let similarTracks = prev?.similarTracks || [];
    const fetches = [];
    if (needVersions) {
        fetches.push(
            maClient.getTrackVersions(track)
                .then((rows) => { otherVersions = Array.isArray(rows) ? rows : []; })
                .catch((err) => {
                    console.warn('track versions probe failed:', err);
                    otherVersions = prev?.otherVersions || [];
                }),
        );
    }
    if (needSimilar && uiH('seedSupportsAutoplay', track)) {
        fetches.push(
            maClient.getSimilarTracks(track, {
                limit: menuProbe ? MENU_PROBE_SIMILAR_LIMIT : (opts.limit ?? 50),
                allowLookup: opts.allowLookup ?? true,
            })
                .then((rows) => { similarTracks = Array.isArray(rows) ? rows : []; })
                .catch((err) => {
                    console.warn('similar tracks probe failed:', err);
                    similarTracks = prev?.similarTracks || [];
                }),
        );
    }
    if (fetches.length) await Promise.all(fetches);

    const distinct = applyDistinctTrackLists(track, otherVersions, similarTracks);
    const result = {
        at: Date.now(),
        menuProbe,
        fullProbe: !menuProbe && needVersions && needSimilar,
        hasOtherVersions: distinct.hasOtherVersions,
        hasSimilarTracks: distinct.hasSimilarTracks,
        otherVersions: distinct.otherVersions,
        similarTracks: distinct.similarTracks,
        track,
    };
    state.trackExtrasCache.set(key, result);
    return result;
}

function extrasToGoToTargets(extras) {
    const targets = [];
    if (extras?.hasOtherVersions) {
        targets.push({ id: 'go_other_versions', label: 'Other Versions', icon: 'versions.svg' });
    }
    if (extras?.hasSimilarTracks) {
        targets.push({ id: 'go_similar_tracks', label: 'Similar Tracks', icon: 'dna.svg' });
    }
    return targets;
}

export function getTrackExtrasAvailability(media) {
    if (!isTrackMedia(media)) {
        return { hasOtherVersions: false, hasSimilarTracks: false };
    }
    const cached = lookupTrackExtrasCache(media);
    return {
        hasOtherVersions: !!cached?.hasOtherVersions,
        hasSimilarTracks: !!cached?.hasSimilarTracks,
    };
}

export function getTrackExtrasGoToTargets(media) {
    if (!isTrackMedia(media)) return [];
    const cached = lookupTrackExtrasCache(media);
    return cached ? extrasToGoToTargets(cached) : [];
}

export async function warmTrackExtrasCache(media, opts = {}) {
    if (!media) return null;
    const track = await resolveTrackMedia(media);
    if (!isTrackMedia(track)) return null;
    return probeTrackExtras(track, {
        menuProbe: true,
        force: opts.force === true,
        resolved: true,
    });
}

export async function enrichTrackExtrasMenuActions(actions, media) {
    return actions;
}

export async function refreshNowPlayingTrackExtras(media, trackKey) {
    if (!trackKey || !isTrackMedia(media)) {
        state.nowPlayingTrackExtras = {
            trackKey: '',
            hasOtherVersions: false,
            hasSimilarTracks: false,
        };
        void uiH('syncNavMenuState');
        return;
    }
    const gen = (state.trackExtrasProbeGen = (state.trackExtrasProbeGen || 0) + 1);
    const track = await resolveTrackMedia(media);
    if (gen !== state.trackExtrasProbeGen) return;
    const extras = await probeTrackExtras(track, { menuProbe: true, force: false, resolved: true });
    if (gen !== state.trackExtrasProbeGen) return;
    state.nowPlayingTrackExtras = {
        trackKey,
        hasOtherVersions: extras.hasOtherVersions,
        hasSimilarTracks: extras.hasSimilarTracks,
    };
    void uiH('syncNavMenuState');
}

function buildCollectionEntry(type, track, tracks, titlePrefix) {
    const name = uiH('getItemDisplayName', track) || track.name || 'Track';
    return {
        key: `${type}-${track.uri || track.item_id}`,
        title: `${titlePrefix} - ${name}`,
        type,
        item: track,
        sourceMedia: track,
        _playlistTracksCache: tracks,
    };
}

async function probeTrackExtrasDeduped(track, kind) {
    const key = probeInflightKey(track, kind);
    if (extrasProbeInflight.has(key)) return extrasProbeInflight.get(key);
    const kinds = kind === 'similar' ? ['similar'] : kind === 'versions' ? ['versions'] : ['versions', 'similar'];
    const promise = probeTrackExtras(track, {
        kinds,
        menuProbe: false,
        force: true,
        resolved: true,
    }).finally(() => extrasProbeInflight.delete(key));
    extrasProbeInflight.set(key, promise);
    return promise;
}

async function loadSimilarExtrasForPanel(track) {
    const cached = lookupTrackExtrasCache(track);
    if (cached?.similarTracks?.length && Date.now() - cached.at < EXTRAS_CACHE_MS) {
        return cached;
    }
    return probeTrackExtrasDeduped(track, 'similar');
}

async function loadVersionsExtrasForPanel(track) {
    const cached = lookupTrackExtrasCache(track);
    if (cached?.otherVersions?.length && Date.now() - cached.at < EXTRAS_CACHE_MS) {
        return cached;
    }
    return probeTrackExtrasDeduped(track, 'versions');
}

export function getCachedTrackCollectionLists(track, kind) {
    const cached = lookupTrackExtrasCache(track);
    if (!cached) return [];
    if (kind === 'similar_tracks') return cached.similarTracks || [];
    if (kind === 'track_versions') return cached.otherVersions || [];
    return [];
}

async function openTrackCollectionPanel(fromMedia, kind) {
    const isSimilar = kind === 'similar_tracks';
    const titlePrefix = isSimilar ? 'Similar Tracks' : 'Other Versions';
    const emptyMsg = isSimilar ? 'no similar tracks found' : 'no other versions found';
    const track = await resolveTrackMedia(fromMedia);
    const cached = lookupTrackExtrasCache(track);
    const cachedList = isSimilar ? cached?.similarTracks : cached?.otherVersions;
    if (cachedList?.length) {
        uiH('closeNavMenu');
        uiH('restoreConnectedStatus');
        await openBrowsePanelWithStack([
            buildCollectionEntry(kind, track, cachedList, titlePrefix),
        ], { entryMode: 'shortcut' });
        const stale = !cached?.fullProbe || Date.now() - cached.at > EXTRAS_CACHE_MS / 2;
        if (stale) {
            void (isSimilar ? loadSimilarExtrasForPanel(track) : loadVersionsExtrasForPanel(track));
        }
        return;
    }
    const extras = await (isSimilar ? loadSimilarExtrasForPanel(track) : loadVersionsExtrasForPanel(track));
    const list = isSimilar ? extras.similarTracks : extras.otherVersions;
    if (!list?.length) {
        uiH('setStatus', emptyMsg, 'error');
        uiH('scheduleStatusRestore', 3500);
        return;
    }
    uiH('closeNavMenu');
    uiH('restoreConnectedStatus');
    await openBrowsePanelWithStack([
        buildCollectionEntry(kind, track, list, titlePrefix),
    ], { entryMode: 'shortcut' });
}

export async function openOtherVersionsPanel(fromMedia) {
    await openTrackCollectionPanel(fromMedia, 'track_versions');
}

export async function openSimilarTracksPanel(fromMedia) {
    await openTrackCollectionPanel(fromMedia, 'similar_tracks');
}

export function isTrackCollectionEntry(entry) {
    return entry?.type === 'track_versions' || entry?.type === 'similar_tracks';
}

export function getTrackCollectionContainerActions(entry) {
    const actions = [
        { id: 'play', label: 'Play', icon: 'play-now.svg' },
        { id: 'shuffle', label: 'Shuffle', icon: 'shuffle_active.svg' },
        { id: 'save_track_collection', label: 'Save as Playlist', icon: 'playlists.svg' },
        { id: 'queue_top', label: 'Queue (Top)', icon: 'queue-top.svg' },
        { id: 'queue_end', label: 'Queue (End)', icon: 'queue-bottom.svg' },
    ];
    const src = entry?.sourceMedia || entry?.item;
    if (src && uiH('seedSupportsAutoplay', src)) {
        actions.push({ id: 'radio_mode', label: 'Track Radio', icon: 'radio.svg' });
    }
    return actions;
}

export async function saveTrackCollectionAsPlaylist(entry) {
    const tracks = entry?._playlistTracksCache || [];
    if (!tracks.length) throw new Error('no tracks');
    const base = entry?.title?.replace(/^(Other Versions|Similar Tracks) - /, '') || 'Collection';
    const prefix = entry?.type === 'similar_tracks' ? 'Similar' : 'Versions';
    const name = `${prefix}: ${base}`.slice(0, 120);
    uiH('setStatus', 'Saving playlist…', 'connected');
    const playlist = await maClient.createPlaylist(name);
    const uris = tracks.map((t) => t.uri).filter(Boolean);
    if (playlist?.item_id && uris.length) {
        await maClient.addTracksToPlaylist(playlist.item_id, uris);
    }
    uiH('setStatus', `Saved “${name}”`, 'connected');
}

export async function handleTrackExtrasGoTo(actionId, media) {
    if (actionId === 'go_other_versions') await openOtherVersionsPanel(media);
    else if (actionId === 'go_similar_tracks') await openSimilarTracksPanel(media);
}
