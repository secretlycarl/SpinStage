/**
 * Nav menu (go-to artist/album/podcast/playlist/details) and go-to resolution.
 * Cross-module callbacks use ui/handlers.js (wired in spinstage-app.js).
 */
import { state } from '../state.js';
import { IS_WEBOS } from '../constants.js';
import {
    mainBody,
    navBtn,
    navMenu,
    navGoArtistBtn,
    navGoAlbumBtn,
    navGoPodcastBtn,
    navGoPlaylistBtn,
    navGoGenresBtn,
    navGoOtherVersionsBtn,
    navGoSimilarTracksBtn,
    navGoDetailsBtn,
    navCloseBtn,
    navGenresMenu,
    navGenresList,
    navGenresCloseBtn,
} from '../dom.js';
import { maClient } from '../ma/client.js';
import { itemStoredProviderId } from '../util/providers.js';
import { getDefaultPlayerName } from '../util/server.js';
import { getShowConnection } from './settings.js';
import {
    resolveBrowseItemRaw,
    getCurrentBrowseEntry,
    navigateBrowseToArtist,
    navigateBrowseToAlbum,
    navigateBrowseToPodcast,
    navigateBrowseToPlaylist,
    navigateBrowseToGenre,
} from './browse.js';
import { openDetailsPanel } from './details.js';
import { uiH } from './handlers.js';
import { npH } from '../playback/handlers.js';

const navMenuItems = [
    navGoArtistBtn,
    navGoAlbumBtn,
    navGoPodcastBtn,
    navGoPlaylistBtn,
    navGoOtherVersionsBtn,
    navGoSimilarTracksBtn,
    navGoGenresBtn,
    navGoDetailsBtn,
    navCloseBtn,
];

function canGoToArtist(media) {
            if (!media || uiH('isAudiobookItem', media)) return false;
            const mt = uiH('inferMediaType', media);
            if (mt === 'artist') return !!(media.uri || media.item_id || media.name);
            if (mt === 'album') {
                return !!uiH('pickDisplayArtistName', media);
            }
            return !!uiH('trackArtistName', media);
        }

function canGoToAlbum(media) {
            if (!media || uiH('isAudiobookItem', media)) return false;
            const mt = uiH('inferMediaType', media);
            if (mt === 'album') return !!(media.uri || media.item_id || media.name);
            return !!(media.album?.uri || media.album?.item_id || media.album?.name
                || uiH('trackAlbumName', media));
        }

function canGoToPodcast(media) {
            if (!media) return false;
            const mt = uiH('inferMediaType', media);
            if (mt === 'podcast') return !!(media.uri || media.item_id || media.name);
            if (!uiH('isPodcastEpisode', media)) return false;
            return !!(media.podcast?.item_id || media.podcast?.uri
                || media.album?.item_id || media.album?.uri || uiH('pickPodcastName', media));
        }

function canGoToPlaylist(media) {
            if (!media) return false;
            const mt = uiH('inferMediaType', media);
            if (mt === 'playlist') return !!(media.uri || media.item_id || media.name);
            return false;
        }

function getGoToTargetsForMedia(media, opts = {}) {
            const targets = [];
            if (canGoToArtist(media)) {
                targets.push({ id: 'go_artist', label: 'Go to Artist', icon: 'go-to.svg' });
            }
            if (canGoToAlbum(media)) {
                targets.push({ id: 'go_album', label: 'Go to Album', icon: 'go-to.svg' });
            }
            if (canGoToPodcast(media)) {
                targets.push({ id: 'go_podcast', label: 'Go to Podcast', icon: 'go-to.svg' });
            }
            if (opts.includePlaylist && canGoToPlaylist(media)) {
                targets.push({ id: 'go_playlist', label: 'Go to Playlist', icon: 'go-to.svg' });
            }
            targets.push(...uiH('getTrackExtrasGoToTargets', media));
            return targets;
        }

function dedupeGoToTargets(targets) {
            const seen = new Set();
            return targets.filter((target) => {
                if (seen.has(target.id)) return false;
                seen.add(target.id);
                return true;
            });
        }

function browseEntrySameAsItem(entry, item) {
            if (!entry?.item || !item) return false;
            const raw = resolveBrowseItemRaw(item) || item;
            const entryRaw = entry.item;
            const rawUri = raw.uri || raw.path;
            const entryUri = entryRaw.uri || entryRaw.path;
            if (rawUri && entryUri && rawUri === entryUri) return true;
            if (raw.item_id != null && entryRaw.item_id != null
                && String(raw.item_id) === String(entryRaw.item_id)) return true;
            return false;
        }

function filterBrowseSelfGoToTargets(targets, item, entry) {
            const entryCtx = entry || getCurrentBrowseEntry();
            const raw = resolveBrowseItemRaw(item);
            const mt = item?.mediaType || uiH('inferMediaType', raw);
            let filtered = targets;

            if (item?.kind === 'nav') {
                const navSuppress = {
                    artist: 'go_artist',
                    album: 'go_album',
                    playlist: 'go_playlist',
                    podcast: 'go_podcast',
                };
                const navId = navSuppress[mt];
                if (navId) filtered = filtered.filter((target) => target.id !== navId);
            }

            if (entryCtx?.item) {
                const entitySuppress = {
                    artist: 'go_artist',
                    album: 'go_album',
                    playlist: 'go_playlist',
                    podcast: 'go_podcast',
                };
                const entityId = entitySuppress[mt];
                if (entityId && browseEntrySameAsItem(entryCtx, item)) {
                    filtered = filtered.filter((target) => target.id !== entityId);
                }
            }

            const contextSuppress = {
                artist: 'go_artist',
                album: 'go_album',
                playlist: 'go_playlist',
                podcast: 'go_podcast',
            };
            const contextId = contextSuppress[entryCtx?.type];
            if (contextId) {
                filtered = filtered.filter((target) => target.id !== contextId);
            }

            return filtered;
        }

function getBrowseContextGoToTargets(_item, _entry) {
            return [];
        }

function trackHasResolvableArtist(raw) {
            const artist = uiH('pickPrimaryArtistRef', raw);
            return !!(artist?.item_id || artist?.uri);
        }

function trackHasResolvableAlbum(raw) {
            const album = raw?.album;
            return !!(album && typeof album === 'object' && (album.item_id || album.uri));
        }

function albumHasResolvableArtist(raw) {
            const artist = uiH('pickPrimaryArtistRef', raw);
            return !!(artist?.item_id || artist?.uri);
        }

async function fetchFullMaMedia(raw, mt) {
            if (!raw) return null;
            const mediaType = mt || uiH('inferMediaType', raw) || 'track';
            const provider = itemStoredProviderId(raw) || raw.provider_instance_id || raw.provider || 'library';
            if (raw.uri) {
                try {
                    const full = await maClient.send('music/item_by_uri', { uri: raw.uri });
                    if (full) return { ...raw, ...full, media_type: uiH('inferMediaType', full) || mediaType };
                } catch (err) { /* try item_id */ }
            }
            if (raw.item_id) {
                try {
                    const full = await maClient.send('music/item', {
                        media_type: mediaType,
                        item_id: raw.item_id,
                        provider_instance_id_or_domain: provider,
                    });
                    if (full) return { ...raw, ...full, media_type: uiH('inferMediaType', full) || mediaType };
                } catch (err) { /* fall through */ }
            }
            return null;
        }

async function enrichBrowseItemForGoTo(item) {
            const raw = resolveBrowseItemRaw(item);
            if (!raw) return item;
            const mt = item.mediaType || uiH('inferMediaType', raw);
            const isTrack = mt === 'track' || (!mt && (raw.uri || raw.item_id));
            const isAlbum = mt === 'album';
            const needsArtist = (isTrack && (!canGoToArtist(raw) || !trackHasResolvableArtist(raw)))
                || (isAlbum && (!canGoToArtist(raw) || !albumHasResolvableArtist(raw)));
            const needsAlbum = isTrack && (!canGoToAlbum(raw) || !trackHasResolvableAlbum(raw));
            if (!needsArtist && !needsAlbum) return item;
            try {
                await maClient.ensureReady();
                const full = await fetchFullMaMedia(raw, mt);
                if (!full) return item;
                return {
                    ...item,
                    raw: full,
                    mediaType: uiH('inferMediaType', full) || mt,
                };
            } catch (err) {
                return item;
            }
        }

async function ensureGoToMediaResolved(media) {
            if (!media) return null;
            await maClient.ensureReady();
            let resolved = await maClient.resolveMaItem(media);
            const mt = uiH('inferMediaType', resolved);
            if (mt === 'track' && (resolved.uri || resolved.item_id)) {
                resolved = await npH('enrichTrackArtistMetadata', resolved);
                const full = await fetchFullMaMedia(resolved, mt);
                if (full) resolved = await npH('enrichTrackArtistMetadata', full);
            }
            return resolved;
        }

async function resolveBrowseGoToNavigationMedia(actionId, item, entry) {
            const media = resolveBrowseGoToMedia(actionId, item, entry);
            if (!media) return null;
            return ensureGoToMediaResolved(media);
        }

function getBrowseGoToTargets(item, entry) {
            const media = resolveBrowseItemRaw(item);
            const fromMedia = media ? getGoToTargetsForMedia(media, { includePlaylist: true }) : [];
            const fromContext = getBrowseContextGoToTargets(item, entry);
            return filterBrowseSelfGoToTargets(
                dedupeGoToTargets([...fromMedia, ...fromContext]),
                item,
                entry,
            );
        }

function resolveBrowseGoToMedia(actionId, item, entry) {
            const entryCtx = entry || getCurrentBrowseEntry();
            const raw = resolveBrowseItemRaw(item);
            if (!entryCtx) return raw;
            if (actionId === 'go_playlist' && entryCtx.type === 'playlist' && entryCtx.item) {
                return entryCtx.item;
            }
            if (actionId === 'go_album' && entryCtx.type === 'album' && entryCtx.item) {
                return entryCtx.item;
            }
            if (actionId === 'go_podcast' && entryCtx.type === 'podcast' && entryCtx.item) {
                return entryCtx.item;
            }
            if (actionId === 'go_artist') {
                if (raw) return raw;
                if (entryCtx.type === 'album' && entryCtx.item) return entryCtx.item;
            }
            return raw;
        }

function canNavigateToArtist() {
            return canGoToArtist(npH('getNowPlayingMedia'));
        }

function canNavigateToAlbum() {
            return canGoToAlbum(npH('getNowPlayingMedia'));
        }

function canNavigateToPodcast() {
            return canGoToPodcast(npH('getNowPlayingMedia'));
        }

function getEnqueuedPlaylists() {
            const enqueued = maClient.activeQueue?.enqueued_media_items;
            if (!Array.isArray(enqueued)) return [];
            return enqueued.filter((i) => uiH('inferMediaType', i) === 'playlist');
        }

function canNavigateToPlaylist() {
            if (getEnqueuedPlaylists().length >= 1) return true;
            return !!state._navPlaylistContext;
        }

function getNavGoToTargets() {
            const media = npH('getNowPlayingMedia');
            const targets = getGoToTargetsForMedia(media, { includePlaylist: false });
            if (canNavigateToPlaylist()) {
                targets.push({ id: 'go_playlist', label: 'Go to Playlist', icon: 'go-to.svg' });
            }
            return targets;
        }

function hasNavGoToOptions() {
            return navMenuItems.some((el) => el !== navCloseBtn && isNavMenuItemVisible(el));
        }

async function canNavigateToGenres() {
            const media = npH('getNowPlayingMedia');
            if (!media || uiH('isAudiobookItem', media)) return false;
            const mt = uiH('inferMediaType', media);
            if (['podcast', 'podcast_episode', 'episode', 'radio', 'audiobook'].includes(mt)) return false;
            try {
                await maClient.ensureReady();
                const genres = await maClient.getGenresForMediaItem(media);
                return genres.length > 0;
            } catch {
                return false;
            }
        }

async function loadNavGenresCache() {
            const media = npH('getNowPlayingMedia');
            if (!media) {
                state.navGenresCache = [];
                return;
            }
            try {
                await maClient.ensureReady();
                state.navGenresCache = await maClient.getGenresForMediaItem(media);
            } catch (err) {
                console.warn('load nav genres failed:', err);
                state.navGenresCache = [];
            }
        }

function renderNavGenresMenu() {
            if (!navGenresList) return;
            navGenresList.innerHTML = '';
            state.navGenreMenuEls = [];
            const genres = state.navGenresCache || [];
            if (!genres.length) {
                const empty = document.createElement('div');
                empty.className = 'panel-divider panel-status';
                empty.textContent = 'No genres for this item';
                navGenresList.appendChild(empty);
                return;
            }
            genres.forEach((genre, i) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'settings-menu-item';
                btn.textContent = genre.name || 'Genre';
                btn.addEventListener('click', () => {
                    state.navGenreFocusIndex = i;
                    void activateNavGenreItem();
                });
                navGenresList.appendChild(btn);
                state.navGenreMenuEls.push(btn);
            });
        }

function updateNavGenresMenuFocus() {
            state.navGenreMenuEls.forEach((el, i) => {
                el.classList.toggle('focused', i === state.navGenreFocusIndex);
            });
            if (!IS_WEBOS) state.navGenreMenuEls[state.navGenreFocusIndex]?.focus();
        }

function moveNavGenresMenuFocus(delta) {
            const total = state.navGenreMenuEls.length;
            if (!total) return;
            state.navGenreFocusIndex = (state.navGenreFocusIndex + delta + total) % total;
            updateNavGenresMenuFocus();
        }

async function openNavGenresMenu() {
            await loadNavGenresCache();
            navMenu.classList.remove('open');
            navMenu.setAttribute('aria-hidden', 'true');
            state.navGenresMenuOpen = true;
            mainBody.classList.add('show-ui', 'nav-menu-open');
            navGenresMenu.classList.add('open');
            navGenresMenu.setAttribute('aria-hidden', 'false');
            uiH('positionOverlayMenu', navBtn, navGenresMenu, 'left');
            renderNavGenresMenu();
            state.navGenreFocusIndex = 0;
            updateNavGenresMenuFocus();
        }

function closeNavGenresMenu(opts = {}) {
            if (!state.navGenresMenuOpen) return;
            state.navGenresMenuOpen = false;
            navGenresMenu.classList.remove('open');
            navGenresMenu.setAttribute('aria-hidden', 'true');
            state.navGenreMenuEls.forEach((el) => el.classList.remove('focused'));
            state.navGenreMenuEls = [];
            if (!opts.skipReturn && state.navMenuOpen) {
                navMenu.classList.add('open');
                navMenu.setAttribute('aria-hidden', 'false');
                updateNavMenuFocus();
            }
        }

async function activateNavGenreItem() {
            const genre = state.navGenresCache[state.navGenreFocusIndex];
            if (!genre) return;
            closeNavGenresMenu({ skipReturn: true });
            closeNavMenu();
            await navigateBrowseToGenre(genre);
        }

async function resolveActivePlaylistContext() {
            const enqueued = getEnqueuedPlaylists();
            if (enqueued.length >= 1) return enqueued[enqueued.length - 1];

            const activeName = maClient.activeQueue?.extra_attributes?.active_playlist?.trim();
            if (!activeName) return null;

            const parts = activeName.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
            for (let i = parts.length - 1; i >= 0; i--) {
                const name = parts[i];
                try {
                    await maClient.ensureReady();
                    const playlists = await maClient.libraryItems('playlists', 0, 200, { search: name });
                    const lower = name.toLowerCase();
                    const exact = playlists.find((p) => p.name === name || p.name?.toLowerCase() === lower);
                    if (exact) return exact;
                    const rough = playlists.find((p) => uiH('titlesRoughlyMatch', p.name, name));
                    if (rough) return rough;
                } catch (err) {
                    console.warn('resolve active playlist fallback failed:', err);
                }
            }
            return null;
        }

async function refreshNavPlaylistContext() {
    state._navPlaylistContext = await resolveActivePlaylistContext();
    return state._navPlaylistContext;
        }

async function resolveArtistItem(media) {
            if (uiH('inferMediaType', media) === 'artist') {
                const provider = itemStoredProviderId(media) || media.provider_instance_id || media.provider || 'library';
                if (media.item_id) {
                    try {
                        const full = await maClient.send('music/item', {
                            media_type: 'artist',
                            item_id: media.item_id,
                            provider_instance_id_or_domain: provider,
                        });
                        if (full?.name) return full;
                    } catch (err) {
                        console.warn('resolve artist self item failed:', err);
                    }
                }
                if (media.uri) {
                    try {
                        const full = await maClient.send('music/item_by_uri', { uri: media.uri });
                        if (full?.name) return full;
                    } catch (err) {
                        console.warn('resolve artist self uri failed:', err);
                    }
                }
                if (media.name) return media;
            }
            const artist = uiH('pickPrimaryArtistRef', media);
            const provider = artist?.provider_instance_id || artist?.provider
                || itemStoredProviderId(media) || media.provider_instance_id || media.provider || 'library';
            if (artist?.item_id) {
                try {
                    const full = await maClient.send('music/item', {
                        media_type: 'artist',
                        item_id: artist.item_id,
                        provider_instance_id_or_domain: provider,
                    });
                    if (full?.name) return full;
                } catch (err) {
                    console.warn('resolve artist item failed:', err);
                }
            }
            if (artist?.uri) {
                try {
                    const full = await maClient.send('music/item_by_uri', { uri: artist.uri });
                    if (full?.name) return full;
                } catch (err) {
                    console.warn('resolve artist uri failed:', err);
                }
            }
            const name = uiH('cleanArtistDisplayName', artist?.name || uiH('pickDisplayArtistName', media) || '');
            if (!name) return null;
            const all = await maClient.libraryItems('artists', 0, 2000, { order_by: 'name_sort', search: name });
            const lower = name.toLowerCase();
            const exact = all.find((a) => a.name === name || a.name?.toLowerCase() === lower);
            if (exact) return exact;
            return all.find((a) => uiH('titlesRoughlyMatch', a.name, name)) || null;
        }

async function resolveAlbumItem(media) {
            if (uiH('inferMediaType', media) === 'album') {
                const provider = itemStoredProviderId(media) || media.provider_instance_id || media.provider || 'library';
                if (media.item_id) {
                    try {
                        const full = await maClient.send('music/item', {
                            media_type: 'album',
                            item_id: media.item_id,
                            provider_instance_id_or_domain: provider,
                        });
                        if (full?.name) return full;
                    } catch (err) {
                        console.warn('resolve album self item failed:', err);
                    }
                }
                if (media.uri) {
                    try {
                        const full = await maClient.send('music/item_by_uri', { uri: media.uri });
                        if (full?.name) return full;
                    } catch (err) {
                        console.warn('resolve album self uri failed:', err);
                    }
                }
                if (media.name) return media;
            }
            const album = (media.album && typeof media.album === 'object') ? media.album : null;
            const provider = album?.provider_instance_id || album?.provider
                || itemStoredProviderId(media) || media.provider_instance_id || media.provider || 'library';
            if (album?.item_id) {
                try {
                    const full = await maClient.send('music/item', {
                        media_type: 'album',
                        item_id: album.item_id,
                        provider_instance_id_or_domain: provider,
                    });
                    if (full?.name) return full;
                } catch (err) {
                    console.warn('resolve album item failed:', err);
                }
            }
            if (album?.uri) {
                try {
                    const full = await maClient.send('music/item_by_uri', { uri: album.uri });
                    if (full?.name) return full;
                } catch (err) {
                    console.warn('resolve album uri failed:', err);
                }
            }
            if (album?.name && (album.item_id || album.uri)) return album;
            const albumName = uiH('trackAlbumName', media);
            if (!albumName) return null;
            const artistName = uiH('trackArtistName', media);
            const all = await maClient.libraryItems('albums', 0, 500, {
                order_by: 'name_sort',
                search: albumName,
            });
            const lower = albumName.toLowerCase();
            const matches = all.filter((a) => a.name === albumName || a.name?.toLowerCase() === lower);
            if (artistName) {
                const withArtist = matches.filter((a) => {
                    const aName = uiH('pickDisplayArtistName', a);
                    return aName && uiH('titlesRoughlyMatch', aName, artistName);
                });
                if (withArtist.length === 1) return withArtist[0];
                if (withArtist.length > 1) return withArtist[0];
            }
            if (matches.length === 1) return matches[0];
            const rough = all.find((a) => uiH('titlesRoughlyMatch', a.name, albumName));
            return rough || null;
        }

function clearGoToErrorStatus() {
            const playerName = getDefaultPlayerName();
            uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : '');
        }

async function resolvePodcastShowItem(media) {
            if (uiH('inferMediaType', media) === 'podcast') {
                const provider = media.provider_instance_id || media.provider || 'library';
                if (media.item_id) {
                    try {
                        const full = await maClient.send('music/item', {
                            media_type: 'podcast',
                            item_id: media.item_id,
                            provider_instance_id_or_domain: provider,
                        });
                        if (full?.name) return full;
                    } catch (err) {
                        console.warn('resolve podcast self item failed:', err);
                    }
                }
                if (media.uri) {
                    try {
                        const full = await maClient.send('music/item_by_uri', { uri: media.uri });
                        if (full?.name) return full;
                    } catch (err) {
                        console.warn('resolve podcast self uri failed:', err);
                    }
                }
                if (media.name) return media;
            }
            const podcast = media.podcast;
            const provider = podcast?.provider_instance_id || podcast?.provider
                || media.provider_instance_id || media.provider || 'library';
            if (podcast?.item_id) {
                try {
                    const full = await maClient.send('music/item', {
                        media_type: 'podcast',
                        item_id: podcast.item_id,
                        provider_instance_id_or_domain: provider,
                    });
                    if (full?.name) return full;
                } catch (err) {
                    console.warn('resolve podcast item failed:', err);
                }
            }
            if (podcast?.uri) {
                try {
                    const full = await maClient.send('music/item_by_uri', { uri: podcast.uri });
                    if (full?.name) return full;
                } catch (err) {
                    console.warn('resolve podcast uri failed:', err);
                }
            }
            const album = media.album;
            const albumProvider = album?.provider_instance_id || album?.provider || provider;
            if (album?.item_id) {
                try {
                    const full = await maClient.send('music/item', {
                        media_type: 'podcast',
                        item_id: album.item_id,
                        provider_instance_id_or_domain: albumProvider,
                    });
                    if (full?.name) return full;
                } catch (err) {
                    console.warn('resolve podcast album item failed:', err);
                }
            }
            if (album?.uri) {
                try {
                    const full = await maClient.send('music/item_by_uri', { uri: album.uri });
                    if (full?.name) return full;
                } catch (err) {
                    console.warn('resolve podcast album uri failed:', err);
                }
            }
            const name = uiH('pickPodcastName', media);
            if (!name) return null;
            const all = await maClient.libraryItems('podcasts', 0, 500, { order_by: 'name_sort' });
            const lower = name.toLowerCase();
            return all.find((p) => p.name === name || p.name?.toLowerCase() === lower) || null;
        }

async function resolvePlaylistItem(enqueuedItem) {
            const provider = enqueuedItem.provider_instance_id || enqueuedItem.provider || 'library';
            if (enqueuedItem.item_id) {
                try {
                    const full = await maClient.send('music/item', {
                        media_type: 'playlist',
                        item_id: enqueuedItem.item_id,
                        provider_instance_id_or_domain: provider,
                    });
                    if (full?.name) return full;
                } catch (err) {
                    console.warn('resolve playlist item failed:', err);
                }
            }
            if (enqueuedItem.uri) {
                try {
                    const full = await maClient.send('music/item_by_uri', { uri: enqueuedItem.uri });
                    if (full?.name) return full;
                } catch (err) {
                    console.warn('resolve playlist uri failed:', err);
                }
            }
            return enqueuedItem?.name ? enqueuedItem : null;
        }

function isNavMenuItemVisible(el) {
            return el && !el.hidden;
        }

async function syncNavMenuState() {
            await refreshNavPlaylistContext();
            navGoArtistBtn.hidden = !canNavigateToArtist();
            navGoAlbumBtn.hidden = !canNavigateToAlbum();
            navGoPodcastBtn.hidden = !canNavigateToPodcast();
            navGoPlaylistBtn.hidden = !canNavigateToPlaylist();
            navGoGenresBtn.hidden = !(await canNavigateToGenres());
            const media = npH('getNowPlayingMedia');
            const avail = media
                ? uiH('getTrackExtrasAvailability', media)
                : { hasOtherVersions: false, hasSimilarTracks: false };
            navGoOtherVersionsBtn.hidden = !avail.hasOtherVersions;
            navGoSimilarTracksBtn.hidden = !avail.hasSimilarTracks;
            navGoDetailsBtn.hidden = !media;
            const showNav = hasNavGoToOptions();
            navBtn.hidden = !showNav;
            if (!showNav) {
                if (state.navMenuOpen) closeNavMenu();
                uiH('resetNavButtonFocus');
            }
            if (uiH('isAndroidPortraitBottomNav') && mainBody.classList.contains('show-ui') && !uiH('isPanelOpen')) {
                uiH('scheduleProgressLayoutRelayout');
            }
        }

function firstEnabledNavMenuIndex() {
            for (let i = 0; i < navMenuItems.length; i++) {
                if (isNavMenuItemVisible(navMenuItems[i])) return i;
            }
            return navMenuItems.length - 1;
        }

function updateNavMenuFocus() {
            navMenuItems.forEach((el, i) => {
                el.classList.toggle('focused', i === state.navMenuFocusIndex);
            });
            if (!IS_WEBOS) navMenuItems[state.navMenuFocusIndex]?.focus();
        }

function moveNavMenuFocus(delta) {
            let idx = state.navMenuFocusIndex + delta;
            while (idx >= 0 && idx < navMenuItems.length) {
                if (isNavMenuItemVisible(navMenuItems[idx])) {
                    state.navMenuFocusIndex = idx;
                    updateNavMenuFocus();
                    return;
                }
                idx += delta;
            }
        }

async function openNavMenu() {
            uiH('closeAllPanels');
            uiH('closeSettingsMenu');
            uiH('closeVolumeMenu');
            uiH('closeEqPresetsMenu');
            uiH('closeVizModesMenu');
            state.navMenuOpen = true;
            mainBody.classList.add('show-ui', 'nav-menu-open');
            uiH('syncIdleProgressVisibility');
            navMenu.classList.add('open');
            navMenu.setAttribute('aria-hidden', 'false');
            uiH('positionOverlayMenu', navBtn, navMenu, 'left');
            try {
                await maClient.refreshActiveQueue();
            } catch (err) {
                console.warn('refresh queue for nav menu failed:', err);
            }
            await syncNavMenuState();
            state.navMenuFocusIndex = firstEnabledNavMenuIndex();
            updateNavMenuFocus();
            const queueItem = maClient.activeQueue?.current_item;
            const media = queueItem?.media_item || queueItem;
            if (media) {
                void uiH('warmTrackExtrasCache', media).then(() => {
                    if (!state.navMenuOpen) return;
                    void syncNavMenuState();
                });
            }
            uiH('stopDvdFloater');
            uiH('pauseUiHideTimer');
        }

function closeNavMenu() {
            if (!state.navMenuOpen && !state.navGenresMenuOpen) return;
            closeNavGenresMenu({ skipReturn: true });
            if (!state.navMenuOpen) return;
            state.navMenuOpen = false;
            mainBody.classList.remove('nav-menu-open');
            navMenu.classList.remove('open');
            navMenu.setAttribute('aria-hidden', 'true');
            navMenuItems.forEach((el) => el.classList.remove('focused'));
            uiH('syncIdleProgressVisibility');
            uiH('resumeUiHideTimer');
            uiH('updateFloatState');
        }

function toggleNavMenu() {
            if (state.navMenuOpen) closeNavMenu();
            else if (hasNavGoToOptions()) openNavMenu();
        }

async function openNavDetails() {
            closeNavMenu();
            const media = npH('getNowPlayingMedia');
            if (!media) return;
            const queueItem = maClient.activeQueue?.current_item;
            await openDetailsPanel(media, { queueItem });
        }

async function activateNavMenuItem() {
            const item = navMenuItems[state.navMenuFocusIndex];
            if (!item || item.hidden) return;
            if (item === navGoArtistBtn) {
                await navigateBrowseToArtist();
                return;
            }
            if (item === navGoAlbumBtn) {
                await navigateBrowseToAlbum();
                return;
            }
            if (item === navGoPodcastBtn) {
                await navigateBrowseToPodcast();
                return;
            }
            if (item === navGoPlaylistBtn) {
                await navigateBrowseToPlaylist();
                return;
            }
            if (item === navGoGenresBtn) {
                await openNavGenresMenu();
                return;
            }
            if (item === navGoOtherVersionsBtn) {
                await uiH('openOtherVersionsPanel', npH('getNowPlayingMedia'));
                return;
            }
            if (item === navGoSimilarTracksBtn) {
                await uiH('openSimilarTracksPanel', npH('getNowPlayingMedia'));
                return;
            }
            if (item === navGoDetailsBtn) {
                await openNavDetails();
                return;
            }
            if (item === navCloseBtn) {
                closeNavMenu();
            }
        }

export {
    canGoToArtist,
    canGoToAlbum,
    canGoToPodcast,
    canGoToPlaylist,
    getGoToTargetsForMedia,
    getBrowseGoToTargets,
    enrichBrowseItemForGoTo,
    fetchFullMaMedia,
    ensureGoToMediaResolved,
    resolveBrowseGoToNavigationMedia,
    refreshNavPlaylistContext,
    syncNavMenuState,
    resolveArtistItem,
    resolveAlbumItem,
    resolvePodcastShowItem,
    resolvePlaylistItem,
    clearGoToErrorStatus,
    closeNavMenu,
    openNavMenu,
    toggleNavMenu,
    moveNavMenuFocus,
    activateNavMenuItem,
    openNavDetails,
    hasNavGoToOptions,
    canNavigateToGenres,
    closeNavGenresMenu,
    openNavGenresMenu,
    moveNavGenresMenuFocus,
    activateNavGenreItem,
    canNavigateToArtist,
    canNavigateToAlbum,
    canNavigateToPodcast,
    canNavigateToPlaylist,
    getEnqueuedPlaylists,
};
