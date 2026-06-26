/**
 * Browse side panel: library navigation, search results view, playback actions.
 * Search UI lives in ui/browse-search.js.
 * Cross-module callbacks use ui/handlers.js (wired in spinstage-app.js).
 */
import { state } from '../state.js';
import { resolveGenreIconSync } from '../util/genre-icon.js';
import {
    BROWSE_PAGE_SIZE,
    BROWSE_VIEWS_MAX,
    BROWSE_ROOT_SHORTCUTS,
    BROWSE_ROOT_COLS,
    ALPHA_GRID_COLS,
    ALPHA_VIEW_ITEM_THRESHOLD,
    BROWSE_PROVIDER_DEFAULTS,
    RADIO_BROWSE_FOLDER_HINTS,
    RADIO_BROWSE_TIME_BUDGET_MS,
    RADIO_BROWSE_MAX_CALLS,
    RADIO_BROWSE_MAX_STATIONS,
    CONTAINER_ACTION_ENTRY_TYPES,
    BROWSE_SECTION_FEATURES,
    BROWSE_SECTION_LIBRARY_TYPE,
    BROWSE_PROVIDER_PREFS_KEY,
    DISCOGRAPHY_ALBUM_SECTIONS,
    RECOMMENDED_MEDIA_FILTERS,
    ARTIST_PROVIDERS_CACHE_VERSION,
    ARTIST_PROVIDERS_CACHE_MAX,
    BROWSE_PROVIDER_CACHE_MAX,
} from '../constants.js';
import {
    mainBody,
    browseBtn,
    browsePanel,
    browseList,
    browsePanelBackBtn,
    browsePanelTitle,
    browsePanelHint,
    browseSearchInput,
    browseRowMenu,
} from '../dom.js';
import { maClient } from '../ma/client.js';
import { getDefaultPlayerName } from '../util/server.js';
import { getArtUrl } from '../util/art.js';
import { episodeDateMs, trimMapCache } from '../util/format.js';
import {
    itemProviderId,
    itemStoredProviderId,
    formatMaDuration,
    providerIcon,
    providerIconMono,
    providerIconDomain,
    normalizeProviderId,
    providerDomainIncludes,
    isSpotifyLibraryProviderId,
    spotifyLibraryBaseProviderId,
    makeSpotifyLibraryProviderId,
    spotifyLibraryProviderLabel,
    isLibraryLikeProvider,
    isInMaLibrary,
    isSpotifyProvider,
    itemHasSpotifyInLibraryMapping,
    spotifyProviderIdsMatch,
    isRadioCapableProvider,
    normalizeProviderDisplayName,
} from '../util/providers.js';
import { getShowConnection } from './settings.js';
import { loadQueueItems, rememberQueueContext } from './queue.js';
import { openDetailsPanel, supportsDetailsItem } from './details.js';
import { isRadioMedia, requestNowPlayingVisuals } from '../playback/now-playing.js';
import {
    loadSearchPage,
    syncBrowseSearchChrome,
    isBrowseSearchActive,
    isBrowseRecommendedActive,
    refreshBrowseFilterChipStates,
    syncSearchInputValue,
    ensureSearchProviders,
    runBrowseSearch,
    rerunBrowseSearch,
    closeProviderMenu,
    showBrowseRecommendedFilters,
} from './browse-search.js';
import {
    ensureGoToMediaResolved,
    canNavigateToArtist,
    canNavigateToAlbum,
    canNavigateToPodcast,
    canNavigateToPlaylist,
    canGoToPlaylist,
    getEnqueuedPlaylists,
} from './nav.js';
import { uiH } from './handlers.js';
import { syncAllAndroidChipSections } from './android-chip-sections.js';
import { findPlaylistTrackIndex, resolveMaStartItem, filterDistinctPlaylistTracks } from '../playback/playlist-playback.js';
import { escapeHtml } from '../util/escape-html.js';
import { npH } from '../playback/handlers.js';

const alphaLetterCache = new Map();

function getBrowseSectionKey(entry) {
    if (!entry) return '';
    if (entry.type === 'artist_letter') return 'artists';
    if (entry.type === 'audiobook_letter') return 'audiobooks';
    if (entry.type === 'genre_letter') return 'genres';
    if (entry.type === 'shortcut') return entry.key || '';
    return '';
}



function entrySupportsBrowseProviders(entry) {
    const section = getBrowseSectionKey(entry);
    return ['audiobooks', 'radio', 'playlists', 'podcasts', 'recently_added'].includes(section);
}



function providerSupportsBrowseSection(provider, feature) {
    if (!feature) return true;
    const features = provider?.supported_features;
    if (!Array.isArray(features) || !features.length) return true;
    return features.includes(feature);
}



function getProvidersForBrowseSection(section) {
    const providers = state.musicProvidersCache.list || [];
    if (section === 'recently_added') {
        return providers
            .filter((p) => providerSupportsBrowseSection(p, 'library_albums')
                || providerSupportsBrowseSection(p, 'library_audiobooks'))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }
    const feature = BROWSE_SECTION_FEATURES[section];
    return providers
        .filter((p) => {
            if (section === 'radio') return isRadioCapableProvider(p);
            return providerSupportsBrowseSection(p, feature);
        })
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}



async function providerHasBrowseContent(section, providerId) {
    const cacheKey = `${section}:${providerId}`;
    if (state.browseProviderContentCache.has(cacheKey)) {
        return state.browseProviderContentCache.get(cacheKey);
    }
    let has = false;
    try {
        await maClient.ensureReady();
        if (section === 'radio') {
            if (providerId === 'library') {
                const items = await maClient.loadLibraryRadioStations();
                has = items.length > 0;
            } else if (providerId === 'all') {
                has = true;
            } else {
                const stations = await maClient.browseProviderRadioStations(providerId);
                has = stations.length > 0;
            }
        } else if (section === 'recently_added') {
            const addedOrder = { order_by: 'timestamp_added_desc' };
            const libTypes = providerId === 'library' ? ['albums'] : ['albums', 'audiobooks'];
            for (const libType of libTypes) {
                const extra = { ...addedOrder };
                if (providerId !== 'all' && providerId !== 'library'
                    && !isSpotifyLibraryProviderId(providerId)) {
                    extra.provider = providerId;
                }
                const raw = await maClient.libraryItems(libType, 0, 8, extra);
                if (providerId === 'all') {
                    if (raw.length > 0) { has = true; break; }
                } else if (providerId === 'library') {
                    if (raw.some((i) => uiH('isLocalLibraryItem', i)
                        && uiH('inferMediaType', i) !== 'audiobook')) {
                        has = true;
                        break;
                    }
                } else if (raw.some((i) => itemMatchesBrowseProvider(i, providerId))) {
                    has = true;
                    break;
                }
            }
        } else {
            const libType = BROWSE_SECTION_LIBRARY_TYPE[section];
            if (!libType) {
                has = true;
            } else {
                const extra = {};
                if (providerId !== 'all' && providerId !== 'library'
                    && !isSpotifyLibraryProviderId(providerId)) {
                    extra.provider = providerId;
                }
                const raw = await maClient.libraryItems(libType, 0, 50, extra);
                has = providerId === 'all'
                    ? raw.length > 0
                    : providerId === 'library'
                        ? raw.some((i) => uiH('isLocalLibraryItem', i))
                        : raw.some((i) => itemMatchesBrowseProvider(i, providerId));
            }
        }
    } catch (err) {
        console.warn('provider content probe failed:', section, providerId, err);
        has = false;
    }
    state.browseProviderContentCache.set(cacheKey, has);
    trimMapCache(state.browseProviderContentCache, BROWSE_PROVIDER_CACHE_MAX);
    return has;
}



function browsePageHasMore(raw, filtered, limit, providerId) {
    if (!providerId || providerId === 'all') return raw.length >= limit;
    if (filtered.length > 0) return raw.length >= limit;
    return raw.length >= limit;
}



function browseProviderOptionsWithAllFirst(options) {
    const allIdx = options.findIndex((o) => o.id === 'all');
    if (allIdx <= 0) return options;
    const next = options.slice();
    const [all] = next.splice(allIdx, 1);
    next.unshift(all);
    return next;
}



async function getBrowseProviderOptionsForEntry(entry) {
    await uiH('ensureMusicProvidersCached');
    const section = getBrowseSectionKey(entry);
    const options = [];
    const add = (id, label) => {
        if (!id || options.some((o) => o.id === id)) return;
        options.push({ id, label: normalizeProviderDisplayName(label, id) });
    };
    if (section === 'artists') {
        add('library', 'Library');
        (state.musicProvidersCache.list || []).filter((p) => isSpotifyProvider(p.id))
            .forEach((p) => add(p.id, p.name));
    } else if (['playlists', 'radio', 'podcasts', 'audiobooks', 'recently_added', 'genres'].includes(section)) {
        const capable = getProvidersForBrowseSection(section);
        const spotifyProviders = capable.filter((p) => isSpotifyProvider(p.id));
        let anyContent = false;
        if (section === 'playlists') {
            if (await providerHasBrowseContent(section, 'library')) {
                add('library', 'Library');
                anyContent = true;
            }
            for (const p of capable) {
                if (isSpotifyProvider(p.id)) {
                    const libId = makeSpotifyLibraryProviderId(p.id);
                    if (await providerHasBrowseContent(section, libId)) {
                        add(libId, spotifyLibraryProviderLabel(
                            p.name, spotifyProviders.length > 1,
                        ));
                        anyContent = true;
                    }
                } else if (await providerHasBrowseContent(section, p.id)) {
                    add(p.id, p.name);
                    anyContent = true;
                }
            }
        } else if (section === 'radio') {
            // Radio is a library-only view of live internet radio. Chips
            // are derived from the providers actually present in the
            // user's library radios (e.g. TuneIn, BBC Sounds); music,
            // audiobook and podcast providers (Spotify, Audiobookshelf,
            // Internet Archive, …) never appear here, and we never crawl
            // a provider's full catalogue. Public stations are reachable
            // via search, where they can be added to the library.
            add('library', 'Library');
            const libRadios = await maClient.loadLibraryRadioStations().catch(() => []);
            capable.forEach((p) => {
                if (libRadios.some((st) => itemMatchesBrowseProvider(st, p.id))) {
                    add(p.id, p.name);
                }
            });
        } else if (section === 'recently_added') {
            if (await providerHasBrowseContent(section, 'library')) {
                add('library', 'Library');
                anyContent = true;
            }
            for (const p of capable) {
                if (await providerHasBrowseContent(section, p.id)) {
                    add(p.id, p.name);
                    anyContent = true;
                }
            }
        } else {
            for (const p of capable) {
                if (await providerHasBrowseContent(section, p.id)) {
                    add(p.id, p.name);
                    anyContent = true;
                }
            }
        }
        if (anyContent) {
            options.unshift({ id: 'all', label: 'All' });
        }
    }
    if (section === 'playlists') {
        return browseProviderOptionsWithAllFirst(options.length ? options : [{ id: 'all', label: 'All' }]);
    }
    if (['radio', 'podcasts', 'audiobooks', 'recently_added', 'genres'].includes(section)) {
        return browseProviderOptionsWithAllFirst(options.length ? options : [{ id: 'all', label: 'All' }]);
    }
    return options.length ? options : [{ id: 'library', label: 'Library' }];
}



function loadBrowseProviderPrefs() {
    try {
        const raw = localStorage.getItem(BROWSE_PROVIDER_PREFS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}



function saveBrowseProviderPref(section, providerId) {
    if (!section || !providerId) return;
    const prefs = loadBrowseProviderPrefs();
    prefs[section] = providerId;
    localStorage.setItem(BROWSE_PROVIDER_PREFS_KEY, JSON.stringify(prefs));
}



function resolveBrowseProviderId(entry, options) {
    const section = getBrowseSectionKey(entry);
    const saved = loadBrowseProviderPrefs()[section];
    if (saved && options.some((o) => o.id === saved)) return saved;
    return getDefaultBrowseProviderId(entry, options);
}



function getDefaultBrowseProviderId(entry, options) {
    const section = getBrowseSectionKey(entry);
    const want = BROWSE_PROVIDER_DEFAULTS[section] || 'all';
    if (want === 'all') {
        return options.find((o) => o.id === 'all')?.id || options[0]?.id;
    }
    if (want === 'audiobookshelf') {
        return options.find((o) => providerDomainIncludes(o.id, 'audiobookshelf'))?.id
            || options[0]?.id;
    }
    if (want === 'tunein') {
        return options.find((o) => providerDomainIncludes(o.id, 'tunein'))?.id
            || options[0]?.id;
    }
    if (want === 'spotify') {
        return options.find((o) => isSpotifyProvider(o.id))?.id || options[0]?.id;
    }
    return options.find((o) => o.id === want)?.id || options[0]?.id;
}



function itemMatchesBrowseProvider(item, providerId) {
    if (!providerId || providerId === 'all') return true;
    if (isSpotifyLibraryProviderId(providerId)) {
        const baseIds = [spotifyLibraryBaseProviderId(providerId)];
        return itemHasSpotifyInLibraryMapping(item, baseIds)
            || baseIds.some((pid) => spotifyProviderIdsMatch(pid, itemProviderId(item)));
    }
    if (providerId === 'library') return uiH('isLocalLibraryItem', item);
    return spotifyProviderIdsMatch(providerId, itemProviderId(item))
        || spotifyProviderIdsMatch(providerId, itemStoredProviderId(item));
}



function pickDefaultDiscographyOpenSection(albumRows) {
    for (const section of DISCOGRAPHY_ALBUM_SECTIONS) {
        const has = (albumRows || []).some(
            (row) => normalizeAlbumType(row.raw || row) === section.type,
        );
        if (has) return section.type;
    }
    return 'album';
}



function defaultDiscographyCollapsedSections(albumRows) {
    if ((albumRows || []).length < 15) return new Set();
    const open = pickDefaultDiscographyOpenSection(albumRows);
    return new Set(
        DISCOGRAPHY_ALBUM_SECTIONS.filter((s) => s.type !== open).map((s) => s.type),
    );
}



function normalizeAlbumType(item) {
    const raw = item?.album_type ?? item?.raw?.album_type ?? 'album';
    const type = String(raw).toLowerCase();
    return DISCOGRAPHY_ALBUM_SECTIONS.some((s) => s.type === type) ? type : 'unknown';
}



function buildGroupedDiscographyItems(albumRows, collapsedSections) {
    const groups = new Map(DISCOGRAPHY_ALBUM_SECTIONS.map((s) => [s.type, []]));
    for (const row of albumRows) {
        const type = normalizeAlbumType(row.raw || row);
        groups.get(type).push(row);
    }
    const items = [];
    for (const section of DISCOGRAPHY_ALBUM_SECTIONS) {
        const sectionItems = groups.get(section.type);
        if (!sectionItems.length) continue;
        const collapsed = collapsedSections?.has(section.type);
        items.push({
            kind: 'section',
            sectionKey: section.type,
            title: section.title,
            subtitle: String(sectionItems.length),
            icon: section.icon,
            collapsed,
        });
        if (!collapsed) items.push(...sectionItems);
    }
    return items;
}



function recommendedTotalItemCount(sections) {
    return (sections || []).reduce((sum, section) => sum + (section.rows?.length || 0), 0);
}



function defaultRecommendedCollapsedSections(sections) {
    const list = sections || [];
    if (!list.length) return new Set();
    // >25 items total: start collapsed; otherwise expand everything.
    if (recommendedTotalItemCount(list) > 25) {
        return new Set(list.map((s) => s.key));
    }
    return new Set();
}



function inferRecommendedFolderMediaIcon(items) {
    const counts = new Map();
    for (const it of (items || []).slice(0, 25)) {
        if (!it) continue;
        let bucket = uiH('inferMediaType', it) || (it.media_type || '').toLowerCase();
        if (!bucket) continue;
        if (bucket === 'episode') bucket = 'podcast_episode';
        if (bucket === 'folder') {
            const provider = `${it.provider || ''} ${it.provider_instance_id || ''}`.toLowerCase();
            if (provider.includes('audiobookshelf') || (it.name || '').toLowerCase().includes('author')) {
                bucket = 'audiobook';
            }
        } else if (uiH('isAudiobookItem', it)) {
            bucket = 'audiobook';
        }
        counts.set(bucket, (counts.get(bucket) || 0) + 1);
    }
    if (!counts.size) return '';
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const icons = {
        track: 'tracks.svg',
        album: 'albums.svg',
        artist: 'artists.svg',
        playlist: 'playlists.svg',
        radio: 'radio.svg',
        audiobook: 'audiobooks.svg',
        podcast: 'podcasts.svg',
        podcast_episode: 'podcasts.svg',
        folder: 'folder.svg',
    };
    return icons[dominant] || '';
}



function recommendedFolderIcon(tkey, name, items) {
    const key = (tkey || '').toLowerCase();
    const n = (name || '').toLowerCase();
    const keyIcons = {
        in_progress_items: 'clock.svg',
        trending_stations: 'radio.svg',
        recently_played: 'recently-played.svg',
        recently_added_tracks: 'tracks.svg',
        recently_added_albums: 'albums.svg',
        recent_series: 'audiobooks.svg',
        random_artists: 'artists.svg',
        random_albums: 'albums.svg',
        newest_authors: 'audiobooks.svg',
        libraries: 'audiobooks.svg',
        favorite_playlists: 'playlists.svg',
        favorite_radio_stations: 'radio.svg',
        recent_favorite_tracks: 'tracks.svg',
    };
    if (keyIcons[key]) return keyIcons[key];
    if (n.includes('continue') || n.includes('in progress')) return 'clock.svg';
    const fromItems = inferRecommendedFolderMediaIcon(items);
    if (fromItems) return fromItems;
    if (n.includes('radio') || n.includes('station')) return 'radio.svg';
    if (n.includes('playlist')) return 'playlists.svg';
    if (n.includes('podcast')) return 'podcasts.svg';
    if (n.includes('artist')) return 'artists.svg';
    if (n.includes('album')) return 'albums.svg';
    if (n.includes('track')) return 'tracks.svg';
    if (n.includes('author') || n.includes('series') || n.includes('libraries')) return 'audiobooks.svg';
    if (n.includes('audiobook') || /\bbooks?\b/.test(n)) return 'audiobooks.svg';
    if (n.includes('recently played')) return 'recently-played.svg';
    if (n.includes('recently added')) return 'recently-added.svg';
    if (n.includes('listen again')) return 'audiobooks.svg';
    if (n.includes('favorit')) return 'favorites.svg';
    return 'compass.svg';
}



function recommendItemMediaBucket(row) {
    if (!row) return '';
    const raw = row.raw || row;
    let mt = row.mediaType || uiH('inferMediaType', raw) || (raw.media_type || '').toLowerCase();
    if (mt === 'episode') mt = 'podcast_episode';
    if (mt === 'folder') {
        const provider = `${raw.provider || ''} ${raw.provider_instance_id || ''}`.toLowerCase();
        if (provider.includes('audiobookshelf')) return 'audiobook';
    }
    if (uiH('isAudiobookItem', raw)) return 'audiobook';
    if (['track', 'album', 'artist', 'playlist'].includes(mt)) return 'music';
    if (mt === 'radio') return 'radio';
    if (mt === 'podcast' || mt === 'podcast_episode') return 'podcast';
    return '';
}



function filterRecommendedSectionRows(section, filterId) {
    if (!section) return null;
    if (!filterId || filterId === 'all') return section;
    const rows = (section.rows || []).filter((row) => recommendItemMediaBucket(row) === filterId);
    if (!rows.length) return null;
    return { ...section, rows };
}



function filterRecommendedSections(sections, filterId) {
    if (!filterId || filterId === 'all') return sections || [];
    return (sections || [])
        .map((section) => filterRecommendedSectionRows(section, filterId))
        .filter(Boolean);
}



function buildRecommendedBrowseItems(entry) {
    const filtered = filterRecommendedSections(entry.recSections, entry.recommendedMediaFilter || 'all');
    if (!filtered.length) {
        return [{ title: 'No recommendations for this filter', subtitle: '', kind: 'empty' }];
    }
    return buildGroupedRecommendedItems(filtered, entry.collapsedSections);
}



function buildGroupedRecommendedItems(sections, collapsedSections) {
    const items = [];
    for (const section of (sections || [])) {
        if (!section.rows || !section.rows.length) continue;
        const collapsed = collapsedSections?.has(section.key);
        items.push({
            kind: 'section',
            sectionKey: section.key,
            title: section.title,
            subtitle: String(section.rows.length),
            icon: section.icon,
            collapsed,
        });
        if (!collapsed) items.push(...section.rows);
    }
    return items;
}



function toggleRecommendedSection(sectionKey) {
    const entry = getCurrentBrowseEntry();
    if (!entry?.recSections) return;
    if (!entry.collapsedSections) {
        entry.collapsedSections = defaultRecommendedCollapsedSections(entry.recSections);
    }
    if (entry.collapsedSections.has(sectionKey)) entry.collapsedSections.delete(sectionKey);
    else entry.collapsedSections.add(sectionKey);
    state.browseStack[state.browseStack.length - 1] = entry;
    const view = getBrowseView();
    view.items = buildRecommendedBrowseItems(entry);
    storeBrowseView(entry.key, view);
    renderBrowsePanel(true);
    uiH('updatePanelFocus');
}



function setRecommendedMediaFilter(filterId) {
    const entry = getCurrentBrowseEntry();
    if (!entry?.recSections) return;
    entry.recommendedMediaFilter = filterId || 'all';
    state.browseStack[state.browseStack.length - 1] = entry;
    state.searchFilterFocusIndex = Math.max(0, RECOMMENDED_MEDIA_FILTERS.findIndex((f) => f.id === filterId));
    const view = getBrowseView();
    view.items = buildRecommendedBrowseItems(entry);
    storeBrowseView(entry.key, view);
    renderBrowsePanel(true);
    state.panelFocusIndex = 0;
    state.browseRowSubFocus = 0;
    state.browseFocusZone = 'list';
    showBrowseRecommendedFilters(true);
    uiH('updatePanelFocus');
}



function toggleDiscographySection(sectionKey) {
    const entry = getCurrentBrowseEntry();
    if (entry?.recSections) { toggleRecommendedSection(sectionKey); return; }
    if (entry.type !== 'artist' || !entry.discographyAlbums) return;
    if (!entry.collapsedSections) {
        entry.collapsedSections = defaultDiscographyCollapsedSections(entry.discographyAlbums);
    }
    if (entry.collapsedSections.has(sectionKey)) {
        entry.collapsedSections.delete(sectionKey);
    } else {
        entry.collapsedSections.add(sectionKey);
    }
    state.browseStack[state.browseStack.length - 1] = entry;
    const view = getBrowseView();
    view.items = buildGroupedDiscographyItems(entry.discographyAlbums, entry.collapsedSections);
    storeBrowseView(entry.key, view);
    renderBrowsePanel(true);
    uiH('updatePanelFocus');
}



function invalidateAlphaLetterCache(libraryType, browseProviderId) {
    const suffix = `${libraryType}:${browseProviderId || 'all'}`;
    alphaLetterCache.delete(suffix);
    alphaLetterCache.delete(`count:${suffix}`);
}



async function countLibraryItems(libraryType, browseProviderId = null) {
    const cacheKey = `count:${libraryType}:${browseProviderId || 'all'}`;
    if (alphaLetterCache.has(cacheKey)) return alphaLetterCache.get(cacheKey);

    let count = 0;
    let offset = 0;
    const batchSize = 200;
    while (true) {
        const extra = libraryType === 'genres'
            ? genreLibraryQuery()
            : { order_by: 'name_sort' };
        if (browseProviderId && browseProviderId !== 'all' && browseProviderId !== 'library'
            && !isSpotifyLibraryProviderId(browseProviderId)) {
            extra.provider = browseProviderId;
        }
        const raw = await maClient.libraryItems(libraryType, offset, batchSize, extra);
        if (!raw.length) break;
        for (const item of raw) {
            if (libraryType === 'artists' && !uiH('shouldShowArtistItem', item)) continue;
            if (browseProviderId && browseProviderId !== 'all'
                && !itemMatchesBrowseProvider(item, browseProviderId)) continue;
            count += 1;
        }
        offset += raw.length;
        if (raw.length < batchSize) break;
    }
    alphaLetterCache.set(cacheKey, count);
    return count;
}



function isAlphaListEntry(entry) {
    return entry?.type === 'shortcut'
        && (entry.key === 'artists' || entry.key === 'audiobooks' || entry.key === 'genres');
}



function getAlphaListLibraryType(entry) {
    if (entry?.key === 'audiobooks') return 'audiobooks';
    if (entry?.key === 'genres') return 'genres';
    return 'artists';
}



async function ensureAlphaViewMode(entry) {
    if (entry.alphaViewMode === 'grid' || entry.alphaViewMode === 'list') {
        return entry.alphaViewMode;
    }
    if (entry?.key === 'genres') {
        entry.alphaViewMode = 'grid';
        state.browseStack[state.browseStack.length - 1] = entry;
        return 'grid';
    }
    const libraryType = getAlphaListLibraryType(entry);
    const count = await countLibraryItems(libraryType, entry.browseProviderId || null);
    entry.alphaViewMode = count > ALPHA_VIEW_ITEM_THRESHOLD ? 'grid' : 'list';
    state.browseStack[state.browseStack.length - 1] = entry;
    return entry.alphaViewMode;
}



function hideAlphaViewBar() {
    const bar = document.getElementById('browse-alpha-view-bar');
    if (!bar) return;
    bar.style.display = 'none';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '';
    syncAllAndroidChipSections();
}



function updateAlphaViewFocus() {
    const bar = document.getElementById('browse-alpha-view-bar');
    if (!bar) return;
    getBrowseRows().forEach((row) => {
        row.classList.remove('focused');
        row.querySelectorAll('.sub-focused').forEach((el) => el.classList.remove('sub-focused'));
    });
    const entry = getCurrentBrowseEntry();
    const mode = entry?.alphaViewMode || 'grid';
    Array.from(bar.children).forEach((chip, i) => {
        chip.classList.toggle('focused', uiH('panelKeyboardFocusActive')
            && state.browseFocusZone === 'alpha_view' && i === state.alphaViewFocusIndex);
        chip.classList.toggle('active', chip.dataset.alphaView === mode);
    });
    if (state.browseFocusZone === 'alpha_view') {
        uiH('focusPanelTarget', bar.children[state.alphaViewFocusIndex]);
    }
}



function renderAlphaViewBar(entry) {
    const bar = document.getElementById('browse-alpha-view-bar');
    if (!bar || !isAlphaListEntry(entry)) {
        hideAlphaViewBar();
        return;
    }
    const mode = entry.alphaViewMode || 'grid';
    bar.style.display = 'flex';
    bar.setAttribute('aria-hidden', 'false');
    bar.innerHTML = '';
    const options = [
        { id: 'grid', label: 'Grid', icon: 'grid.svg' },
        { id: 'list', label: 'List', icon: 'menu.svg' },
    ];
    state.alphaViewFocusIndex = Math.max(0, options.findIndex((o) => o.id === mode));
    options.forEach((opt) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'artist-provider-chip' + (opt.id === mode ? ' active' : '');
        chip.dataset.alphaView = opt.id;
        chip.setAttribute('aria-label', opt.label);
        chip.innerHTML = `<img src="icons/${opt.icon}" alt=""><span>${opt.label}</span>`;
        chip.addEventListener('click', () => void switchAlphaViewMode(opt.id));
        bar.appendChild(chip);
    });
    updateAlphaViewFocus();
    syncAllAndroidChipSections();
}



async function switchAlphaViewMode(mode) {
    const entry = getCurrentBrowseEntry();
    if (!isAlphaListEntry(entry) || entry.alphaViewMode === mode) return;
    entry.alphaViewMode = mode;
    state.browseStack[state.browseStack.length - 1] = entry;
    delete state.browseViews[entry.key];
    const orderIdx = state._browseViewOrder.indexOf(entry.key);
    if (orderIdx >= 0) state._browseViewOrder.splice(orderIdx, 1);
    state._lastBrowseRenderKey = '';
    renderAlphaViewBar(entry);
    await loadCurrentBrowseView();
}



async function scanLibraryLetters(libraryType, browseProviderId = null) {
    const cacheKey = `${libraryType}:${browseProviderId || 'all'}`;
    if (alphaLetterCache.has(cacheKey)) return alphaLetterCache.get(cacheKey);

    const letters = new Set();
    let offset = 0;
    const batchSize = 200;
    while (true) {
        const extra = libraryType === 'genres'
            ? genreLibraryQuery()
            : { order_by: 'name_sort' };
        if (browseProviderId && browseProviderId !== 'all' && browseProviderId !== 'library'
            && !isSpotifyLibraryProviderId(browseProviderId)) {
            extra.provider = browseProviderId;
        }
        const raw = await maClient.libraryItems(libraryType, offset, batchSize, extra);
        if (!raw.length) break;
        for (const item of raw) {
            if (libraryType === 'artists' && !uiH('shouldShowArtistItem', item)) continue;
            if (browseProviderId && browseProviderId !== 'all'
                && !itemMatchesBrowseProvider(item, browseProviderId)) continue;
            letters.add(artistLetterForName(browseItemSortKey(item)));
        }
        offset += raw.length;
        if (raw.length < batchSize) break;
    }
    alphaLetterCache.set(cacheKey, letters);
    return letters;
}



async function buildDynamicAlphaIndex(alphaType, icon, label, libraryType, browseProviderId) {
    const letters = await scanLibraryLetters(libraryType, browseProviderId);
    const result = [];
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        if (letters.has(letter)) {
            result.push({ title: letter, subtitle: label, icon, kind: 'nav', letter, alphaType });
        }
    }
    if (letters.has('0-9')) {
        result.push({ title: '0-9', subtitle: label, icon, kind: 'nav', letter: '0-9', alphaType });
    }
    if (letters.has('!')) {
        result.push({ title: '!-奇', subtitle: label, icon, kind: 'nav', letter: '!', alphaType });
    }
    return result;
}



function matchesArtistLetter(name, letter) {
    if (!name) return false;
    const ch = name.trim().charAt(0);
    if (!ch) return false;
    if (letter === '0-9') return ch >= '0' && ch <= '9';
    if (letter === '!' || letter === '#') return !/[A-Za-z0-9]/.test(ch);
    return ch.toUpperCase() === letter;
}



function artistLetterForName(name) {
    if (!name) return '!';
    const ch = name.trim().charAt(0);
    if (!ch) return '!';
    if (ch >= '0' && ch <= '9') return '0-9';
    if (/[A-Za-z]/.test(ch)) return ch.toUpperCase();
    return '!';
}



function artistLetterForBrowseItem(item) {
    return artistLetterForName(browseItemSortKey(item));
}



function artistLetterTitle(letter) {
    if (letter === '0-9') return '0-9';
    if (letter === '!') return '!-奇';
    return letter;
}



async function openBrowsePanelWithStack(stack, options = {}) {
    uiH('closeSettingsMenu');
    uiH('closeNavMenu');
    uiH('closeVolumeMenu');
    uiH('closeBrowseRowMenu');
    uiH('closeQueuePanel');
    uiH('closePlayersPanel');
    uiH('closeDetailsPanel');
    uiH('syncPanelInputModeForOpen');
    state.browsePanelOpen = true;
    state.browseStack = stack;
    state.browseEntryMode = options.entryMode || 'manual';
    state.panelFocusIndex = 0;
    state.browseRowSubFocus = 0;
    state.browseFocusZone = 'list';
    browsePanel.classList.add('open');
    browsePanel.setAttribute('aria-hidden', 'false');
    browseBtn.classList.add('active');
    mainBody.classList.add('show-ui', 'panel-open', 'browse-open');
    syncBrowsePanelBack();
    uiH('invalidateIdleProgressVisibility');
    uiH('syncIdleProgressVisibility');
    uiH('refreshTitleLayout');
    uiH('pauseUiHideTimer');
    uiH('stopDvdFloater');
    uiH('updateFloatState');
    await loadCurrentBrowseView();
}



async function navigateBrowseToArtist(fromMedia) {
    let media = fromMedia || npH('getNowPlayingMedia');
    if (!media || uiH('isAudiobookItem', media)) return;
    if (!fromMedia && !canNavigateToArtist()) return;
    try {
        await maClient.ensureReady();
        media = await ensureGoToMediaResolved(media) || media;
        const artistItem = await uiH('resolveArtistItem', media);
        if (!artistItem?.name) {
            uiH('setStatus', 'artist not found', 'error');
            return;
        }
        const playingProvider = seedArtistBrowseProvider(artistItem, media);
        const letter = artistLetterForBrowseItem(artistItem);
        uiH('closeNavMenu');
        await openBrowsePanelWithStack([
            { key: 'root', title: 'Browse', type: 'root' },
            { key: 'artists', title: 'Artists', type: 'shortcut' },
            { key: `artists-${letter}`, title: artistLetterTitle(letter), type: 'artist_letter', letter },
            {
                key: artistItem.uri || String(artistItem.item_id),
                title: artistItem.name,
                type: 'artist',
                item: artistItem,
                preferredProvider: playingProvider,
            },
        ], { entryMode: 'shortcut' });
        uiH('clearGoToErrorStatus');
    } catch (err) {
        console.warn('navigate to artist failed:', err);
        uiH('setStatus', 'could not open artist', 'error');
    }
}



async function navigateBrowseToAlbum(fromMedia) {
    let media = fromMedia || npH('getNowPlayingMedia');
    if (!media || uiH('isAudiobookItem', media)) return;
    if (!fromMedia && !canNavigateToAlbum()) return;
    try {
        await maClient.ensureReady();
        media = await ensureGoToMediaResolved(media) || media;
        const artistItem = await uiH('resolveArtistItem', media);
        const albumItem = await uiH('resolveAlbumItem', media);
        if (!albumItem?.name) {
            uiH('setStatus', 'album not found', 'error');
            return;
        }
        const stack = [
            { key: 'root', title: 'Browse', type: 'root' },
            { key: 'artists', title: 'Artists', type: 'shortcut' },
        ];
        let playingProvider = null;
        if (artistItem?.name) {
            playingProvider = seedArtistBrowseProvider(artistItem, media);
            const letter = artistLetterForBrowseItem(artistItem);
            stack.push(
                { key: `artists-${letter}`, title: artistLetterTitle(letter), type: 'artist_letter', letter },
                {
                    key: artistItem.uri || String(artistItem.item_id),
                    title: artistItem.name,
                    type: 'artist',
                    item: artistItem,
                    preferredProvider: playingProvider,
                },
            );
        }
        stack.push({
            key: albumItem.uri || String(albumItem.item_id),
            title: albumItem.name,
            type: 'album',
            item: albumItem,
            activeArtistProvider: playingProvider || undefined,
        });
        uiH('closeNavMenu');
        await openBrowsePanelWithStack(stack, { entryMode: 'shortcut' });
        uiH('clearGoToErrorStatus');
    } catch (err) {
        console.warn('navigate to album failed:', err);
        uiH('setStatus', 'could not open album', 'error');
    }
}



async function navigateBrowseToPodcast(fromMedia) {
    const media = fromMedia || npH('getNowPlayingMedia');
    if (!fromMedia && !canNavigateToPodcast()) return;
    if (!media) return;
    try {
        await maClient.ensureReady();
        const podcastItem = await uiH('resolvePodcastShowItem', media);
        if (!podcastItem?.name) {
            uiH('setStatus', 'podcast not found', 'error');
            return;
        }
        uiH('closeNavMenu');
        await openBrowsePanelWithStack([
            { key: 'root', title: 'Browse', type: 'root' },
            { key: 'podcasts', title: 'Podcasts', type: 'shortcut' },
            {
                key: podcastItem.uri || String(podcastItem.item_id),
                title: podcastItem.name,
                type: 'podcast',
                item: podcastItem,
            },
        ], { entryMode: 'shortcut' });
    } catch (err) {
        console.warn('navigate to podcast failed:', err);
        uiH('setStatus', 'could not open podcast', 'error');
    }
}



async function navigateBrowseToPlaylist(fromMedia) {
    try {
        await maClient.ensureReady();
        let playlistItem;
        if (fromMedia) {
            const entry = getCurrentBrowseEntry();
            const fromContext = entry?.type === 'playlist' && entry.item ? entry.item : null;
            const source = canGoToPlaylist(fromMedia) ? fromMedia : fromContext;
            if (!source) return;
            playlistItem = await uiH('resolvePlaylistItem', source);
        } else {
            if (!canNavigateToPlaylist()) return;
            const playlists = getEnqueuedPlaylists();
            const source = playlists[playlists.length - 1] || state._navPlaylistContext;
            playlistItem = await uiH('resolvePlaylistItem', source);
        }
        if (!playlistItem?.name) {
            uiH('setStatus', 'playlist not found', 'error');
            return;
        }
        uiH('closeNavMenu');
        await openBrowsePanelWithStack([
            { key: 'root', title: 'Browse', type: 'root' },
            { key: 'playlists', title: 'Playlists', type: 'shortcut' },
            {
                key: playlistItem.uri || String(playlistItem.item_id),
                title: playlistItem.name,
                type: 'playlist',
                item: playlistItem,
            },
        ], { entryMode: 'shortcut' });
    } catch (err) {
        console.warn('navigate to playlist failed:', err);
        uiH('setStatus', 'could not open playlist', 'error');
    }
}



function collectGenrePlaybackUris(entry) {
    const providerId = entry?.browseProviderId;
    if (!providerId || providerId === 'all' || !entry?.recSections?.length) return [];
    const uris = [];
    for (const section of entry.recSections) {
        for (const row of section.rows || []) {
            const mt = row.mediaType || uiH('inferMediaType', row.raw || row);
            if (mt !== 'track') continue;
            const raw = row.raw || row;
            if (!itemMatchesBrowseProvider(raw, providerId)) continue;
            const uri = row.uri || raw?.uri;
            if (uri) uris.push(uri);
        }
    }
    return uris;
}



async function navigateBrowseToGenre(genreItem, fromMedia) {
    try {
        await maClient.ensureReady();
        let genre = genreItem;
        if (!genre && fromMedia) {
            const genres = await maClient.getGenresForMediaItem(fromMedia);
            genre = genres[0];
        }
        if (!genre?.name) {
            uiH('setStatus', 'genre not found', 'error');
            return;
        }
        genre = await maClient.resolveMaItem(genre);
        const letter = artistLetterForBrowseItem(genre);
        uiH('closeNavMenu');
        uiH('closeNavGenresMenu');
        await openBrowsePanelWithStack([
            { key: 'root', title: 'Browse', type: 'root' },
            { key: 'genres', title: 'Genres', type: 'shortcut' },
            {
                key: `genres-${letter}`,
                title: artistLetterTitle(letter),
                type: 'genre_letter',
                letter,
            },
            {
                key: genre.uri || String(genre.item_id),
                title: genre.name,
                type: 'genre',
                item: genre,
            },
        ], { entryMode: 'shortcut' });
        uiH('clearGoToErrorStatus');
    } catch (err) {
        console.warn('navigate to genre failed:', err);
        uiH('setStatus', 'could not open genre', 'error');
    }
}



function sortPodcastEpisodes(episodes) {
    const list = [...episodes];
    const hasDates = list.some((ep) => episodeDateMs(ep) > 0);
    if (!hasDates) return list.reverse();
    return list.sort((a, b) => {
        const da = episodeDateMs(a);
        const db = episodeDateMs(b);
        if (da !== db) return db - da;
        const pa = Number(a.position ?? a.metadata?.position ?? 0);
        const pb = Number(b.position ?? b.metadata?.position ?? 0);
        return pb - pa;
    });
}



function browseItemSortKey(item) {
    if (!item) return '';
    const mt = uiH('inferMediaType', item) || (item.media_type || '').toLowerCase();
    if (mt === 'artist') {
        return uiH('cleanArtistDisplayName', item.name || item.sort_name || '');
    }
    if (mt === 'audiobook') {
        return (item.name || item.title || '').trim();
    }
    return (item?.sort_name || item?.name || '').trim();
}



function browseItemDedupeKey(item) {
    return item?.uri || `${item?.item_id || ''}:${item?.provider || ''}`;
}



function sortBrowsePanelRows(rows) {
    const sortKey = (row) => browseItemSortKey(row.raw || {
        name: row.title,
        sort_name: row.sort_name || row.title,
    });
    return [...rows].sort((a, b) => sortKey(a).localeCompare(
        sortKey(b),
        undefined,
        { sensitivity: 'base' },
    ));
}



function letterLibraryCacheKey(entry, libraryType) {
    return `${libraryType}:${entry.letter}:${entry.browseProviderId || 'all'}`;
}



async function loadLetterLibraryItems(entry, libraryType) {
    const cacheKey = letterLibraryCacheKey(entry, libraryType);
    if (entry._letterCacheKey === cacheKey && Array.isArray(entry._letterItemsFull)) {
        return entry._letterItemsFull;
    }
    const matched = [];
    const seen = new Set();
    let offset = 0;
    const batchSize = 200;
    let exhausted = false;
    const browseProviderId = entry.browseProviderId || null;
    while (!exhausted) {
        const extra = libraryType === 'genres'
            ? genreLibraryQuery()
            : { order_by: 'name_sort' };
        if (browseProviderId && browseProviderId !== 'all' && browseProviderId !== 'library'
            && !isSpotifyLibraryProviderId(browseProviderId)) {
            extra.provider = browseProviderId;
        }
        const raw = await maClient.libraryItems(libraryType, offset, batchSize, extra);
        if (!raw.length) {
            exhausted = true;
            break;
        }
        for (const item of raw) {
            if (libraryType === 'artists' && !uiH('shouldShowArtistItem', item)) continue;
            if (browseProviderId && browseProviderId !== 'all'
                && !itemMatchesBrowseProvider(item, browseProviderId)) continue;
            const sortName = browseItemSortKey(item);
            if (!matchesArtistLetter(sortName, entry.letter)) continue;
            const key = libraryType === 'artists'
                ? uiH('cleanArtistDisplayName', item.name).toLowerCase()
                : browseItemDedupeKey(item);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            matched.push(item);
        }
        offset += raw.length;
        if (raw.length < batchSize) exhausted = true;
    }
    matched.sort((a, b) => browseItemSortKey(a).localeCompare(
        browseItemSortKey(b),
        undefined,
        { sensitivity: 'base' },
    ));
    entry._letterItemsFull = matched;
    entry._letterCacheKey = cacheKey;
    state.browseStack[state.browseStack.length - 1] = entry;
    return matched;
}



async function fetchLetterBrowsePage(entry, libraryType, wantCount) {
    const all = await loadLetterLibraryItems(entry, libraryType);
    const slice = all.slice(0, wantCount);
    let mapFn = maItemToPanelRow;
    if (libraryType === 'artists') {
        mapFn = (i) => maItemToPanelRow(i, { preferStoredProvider: true });
    } else if (libraryType === 'genres') {
        mapFn = (i) => genreBrowseRow(i);
    }
    return {
        items: slice.map(mapFn),
        hasMore: wantCount < all.length,
        nextOffset: slice.length,
    };
}



async function fetchFilteredLibraryPage(
    libraryType, letter, startOffset, wantCount, seenKeys,
    orderBy = 'name_sort', browseProviderId = null,
) {
    const matched = [];
    const seen = seenKeys || new Set();
    let offset = startOffset;
    let exhausted = false;
    const batchSize = 200;
    while (matched.length < wantCount && !exhausted) {
        const extra = { order_by: orderBy };
        if (browseProviderId && browseProviderId !== 'all' && browseProviderId !== 'library'
            && !isSpotifyLibraryProviderId(browseProviderId)) {
            extra.provider = browseProviderId;
        }
        const raw = await maClient.libraryItems(libraryType, offset, batchSize, extra);
        if (!raw.length) {
            exhausted = true;
            break;
        }
        for (const item of raw) {
            if (libraryType === 'artists' && !uiH('shouldShowArtistItem', item)) continue;
            if (browseProviderId && browseProviderId !== 'all'
                && !itemMatchesBrowseProvider(item, browseProviderId)) continue;
            const sortName = browseItemSortKey(item);
            if (!matchesArtistLetter(sortName, letter)) continue;
            const key = libraryType === 'artists'
                ? uiH('cleanArtistDisplayName', item.name).toLowerCase()
                : browseItemDedupeKey(item);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            matched.push(item);
            if (matched.length >= wantCount) break;
        }
        offset += raw.length;
        if (raw.length < batchSize) exhausted = true;
    }
    matched.sort((a, b) => browseItemSortKey(a).localeCompare(
        browseItemSortKey(b),
        undefined,
        { sensitivity: 'base' },
    ));
    return {
        items: matched,
        nextOffset: offset,
        hasMore: !exhausted,
        seenKeys: seen,
    };
}



async function fetchFilteredBrowseLibraryPage(
    libraryType, startOffset, wantCount, seenKeys,
    orderBy = 'name_sort', browseProviderId = null,
) {
    const matched = [];
    const seen = seenKeys || new Set();
    let offset = startOffset;
    let exhausted = false;
    const batchSize = 200;
    while (matched.length < wantCount && !exhausted) {
        const extra = libraryType === 'genres'
            ? genreLibraryQuery({ order_by: orderBy })
            : { order_by: orderBy };
        if (browseProviderId && browseProviderId !== 'all' && browseProviderId !== 'library'
            && !isSpotifyLibraryProviderId(browseProviderId)) {
            extra.provider = browseProviderId;
        }
        const raw = await maClient.libraryItems(libraryType, offset, batchSize, extra);
        if (!raw.length) {
            exhausted = true;
            break;
        }
        for (const item of raw) {
            if (libraryType === 'artists' && !uiH('shouldShowArtistItem', item)) continue;
            if (browseProviderId && browseProviderId !== 'all'
                && !itemMatchesBrowseProvider(item, browseProviderId)) continue;
            const key = browseItemDedupeKey(item);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            matched.push(item);
            if (matched.length >= wantCount) break;
        }
        offset += raw.length;
        if (raw.length < batchSize) exhausted = true;
    }
    return {
        items: matched,
        nextOffset: offset,
        hasMore: !exhausted,
        seenKeys: seen,
    };
}



function isMaPlayable(item) {
    if (!item || item.name === '..') return false;
    const mediaType = uiH('inferMediaType', item);
    if (mediaType === 'podcast') return false;
    if (['track', 'playlist', 'radio', 'audiobook', 'podcast_episode', 'episode'].includes(mediaType)) {
        return !!item.uri;
    }
    if (item.is_playable === true && item.uri) return true;
    return false;
}



function isMaBrowsable(item) {
    if (!item || item.name === '..') return false;
    const mediaType = uiH('inferMediaType', item);
    if (mediaType === 'folder') return true;
    if (['artist', 'album', 'playlist', 'podcast'].includes(mediaType)) return true;
    if (item.path || (item.uri && !isMaPlayable(item))) return true;
    return false;
}



function maItemToPanelRow(item, opts = {}) {
    const isRadio = !!opts.isRadio || uiH('inferMediaType', item) === 'radio';
    const mediaType = isRadio ? 'radio' : uiH('inferMediaType', item);
    const playable = isMaPlayable(item) || isRadio;
    const browsable = isMaBrowsable(item);
    let kind = playable ? 'playable' : (browsable ? 'nav' : 'empty');
    if (['artist', 'album', 'playlist'].includes(mediaType) && !isRadio) kind = 'nav';
    if (mediaType === 'podcast' || mediaType === 'genre') kind = 'nav';
    let providerBadge;
    if (opts.activeArtistProvider) {
        providerBadge = normalizeProviderId(opts.activeArtistProvider);
    } else if (opts.preferStoredProvider) {
        providerBadge = itemStoredProviderId(item);
    } else {
        providerBadge = itemProviderId(item);
    }
    const thumbUrl = uiH('getBrowseThumbUrl', item) || '';
    return {
        title: uiH('getItemDisplayName', item) || 'Unknown',
        subtitle: uiH('maItemSubtitle', item, opts),
        icon: uiH('mediaTypeIcon', mediaType, item.provider),
        thumbUrl,
        providerBadge,
        kind,
        uri: item.uri,
        path: item.path || item.uri,
        mediaType,
        raw: item,
        isRadio,
        isFavorite: !!item.favorite,
    };
}



function genreBrowseRow(item, opts = {}) {
    const row = maItemToPanelRow({ ...item, media_type: 'genre' }, opts);
    row.thumbUrl = '';
    row.icon = resolveGenreIconSync({ ...item, title: row.title });
    row.genreIcon = true;
    row.genreIconSpecific = row.icon !== 'genres.svg';
    return row;
}



function genreLibraryQuery(extra = {}) {
    return {
        order_by: 'name_sort',
        hide_empty: true,
        media_type: 'track',
        ...extra,
    };
}



function getCurrentBrowseEntry() {
    if (!state.browseStack?.length) return null;
    return state.browseStack[state.browseStack.length - 1];
}



function getBrowseView() {
    const entry = getCurrentBrowseEntry();
    return state.browseViews[entry.key] || { title: entry.title, hint: '', items: [] };
}



function stripRawFromBrowseItems(items) {
    if (!Array.isArray(items)) return items;
    return items.map((item) => {
        if (!item || !item.raw) return item;
        const { raw, ...rest } = item;
        return {
            ...rest,
            sort_name: raw.sort_name || raw.name || rest.title,
            item_id: rest.item_id ?? raw.item_id,
            provider: rest.provider ?? raw.provider ?? raw.provider_instance_id,
        };
    });
}



function storeBrowseView(key, view) {
    const stored = { ...view };
    if (stored.items) stored.items = stripRawFromBrowseItems(stored.items);
    state.browseViews[key] = stored;
    const idx = state._browseViewOrder.indexOf(key);
    if (idx >= 0) state._browseViewOrder.splice(idx, 1);
    state._browseViewOrder.push(key);
    while (state._browseViewOrder.length > BROWSE_VIEWS_MAX) {
        const old = state._browseViewOrder.shift();
        if (old && old !== key) delete state.browseViews[old];
    }
}



function resolveBrowseItemRaw(item) {
    if (!item) return null;
    if (item.raw) return item.raw;
    if (!item.uri && !item.path && item.item_id == null) return null;
    return {
        uri: item.uri || item.path,
        path: item.path || item.uri,
        name: item.title,
        media_type: item.mediaType,
        provider: item.provider || item.providerBadge,
        item_id: item.item_id,
    };
}



function getBrowseGridCols() {
    const layout = getBrowseView().layout;
    if (layout !== 'root_grid' && layout !== 'alpha_grid') return 1;
    if (browseList) {
        const tmpl = getComputedStyle(browseList).gridTemplateColumns;
        if (tmpl && tmpl !== 'none') {
            const tracks = tmpl.split(/\s+/).filter(Boolean);
            if (tracks.length > 0) return tracks.length;
        }
    }
    if (layout === 'root_grid') return BROWSE_ROOT_COLS;
    if (layout === 'alpha_grid') return ALPHA_GRID_COLS;
    return 1;
}



function isBrowseGridView() {
    const layout = getBrowseView().layout;
    return layout === 'alpha_grid' || layout === 'root_grid';
}



function moveBrowseGridFocus(deltaRow, deltaCol) {
    const cols = getBrowseGridCols();
    const rows = getBrowseRows();
    const total = rows.length;
    if (!total) return;
    const row = Math.floor(state.panelFocusIndex / cols);
    const col = state.panelFocusIndex % cols;
    const maxRow = Math.max(0, Math.ceil(total / cols) - 1);
    const newRow = Math.max(0, Math.min(row + deltaRow, maxRow));
    const newCol = Math.max(0, Math.min(col + deltaCol, cols - 1));
    let newIndex = newRow * cols + newCol;
    if (newIndex >= total) newIndex = total - 1;
    state.panelFocusIndex = newIndex;
    state.browseRowSubFocus = 0;
    uiH('updatePanelFocus');
}



function isBrowsePageable(entry) {
    if (entry.type === 'search_results') return true;
    if (isAlphaListEntry(entry) && entry.alphaViewMode === 'list') return true;
    if (entry.type === 'shortcut' && ['podcasts', 'playlists', 'radio', 'favorites'].includes(entry.key)) {
        return true;
    }
    if (entry.type === 'artist_letter' || entry.type === 'audiobook_letter' || entry.type === 'genre_letter') return true;
    if (entry.type === 'podcast') return true;
    return false;
}



async function fetchBrowsePage(entry, apiOffset, limit = BROWSE_PAGE_SIZE) {
    if (entry.type === 'shortcut' && entry.key === 'artists') {
        const providerId = entry.browseProviderId || null;
        if (!providerId || providerId === 'all' || providerId === 'library') {
            const extra = { order_by: 'name_sort' };
            if (providerId && providerId !== 'all' && providerId !== 'library'
                && !isSpotifyLibraryProviderId(providerId)) {
                extra.provider = providerId;
            }
            const raw = await maClient.libraryItems('artists', apiOffset, limit, extra);
            const filtered = raw.filter((item) => uiH('shouldShowArtistItem', item));
            return {
                items: filtered.map((i) => maItemToPanelRow(i, { preferStoredProvider: true })),
                hasMore: raw.length >= limit,
                apiAdvance: raw.length,
            };
        }
        const page = await fetchFilteredBrowseLibraryPage(
            'artists', apiOffset, limit, entry.seenKeys, 'name_sort', providerId,
        );
        return {
            items: page.items
                .filter((item) => uiH('shouldShowArtistItem', item))
                .map((i) => maItemToPanelRow(i, { preferStoredProvider: true })),
            hasMore: page.hasMore,
            nextOffset: page.nextOffset,
            seenKeys: page.seenKeys,
        };
    }
    if (entry.type === 'shortcut' && entry.key === 'audiobooks') {
        const providerId = entry.browseProviderId || null;
        if (!providerId || providerId === 'all') {
            const raw = await maClient.libraryItems('audiobooks', apiOffset, limit, { order_by: 'name_sort' });
            return {
                items: raw.map((i) => maItemToPanelRow(i)),
                hasMore: raw.length >= limit,
                apiAdvance: raw.length,
            };
        }
        const page = await fetchFilteredBrowseLibraryPage(
            'audiobooks', apiOffset, limit, entry.seenKeys, 'name_sort', providerId,
        );
        return {
            items: page.items.map((i) => maItemToPanelRow(i)),
            hasMore: page.hasMore,
            nextOffset: page.nextOffset,
            seenKeys: page.seenKeys,
        };
    }
    if (entry.type === 'shortcut' && entry.key === 'genres') {
        const providerId = entry.browseProviderId || null;
        if (!providerId || providerId === 'all') {
            const raw = await maClient.libraryItems('genres', apiOffset, limit, genreLibraryQuery());
            return {
                items: raw.map((i) => genreBrowseRow(i)),
                hasMore: raw.length >= limit,
                apiAdvance: raw.length,
            };
        }
        const page = await fetchFilteredBrowseLibraryPage(
            'genres', apiOffset, limit, entry.seenKeys, 'name_sort', providerId,
        );
        return {
            items: page.items.map((i) => genreBrowseRow(i)),
            hasMore: page.hasMore,
            nextOffset: page.nextOffset,
            seenKeys: page.seenKeys,
        };
    }
    if (entry.type === 'shortcut' && entry.key === 'podcasts') {
        const providerId = entry.browseProviderId || null;
        if (!providerId || providerId === 'all') {
            const raw = await maClient.libraryItems('podcasts', apiOffset, limit);
            return {
                items: raw.map((i) => maItemToPanelRow({
                    ...i,
                    media_type: uiH('inferMediaType', i) || 'podcast',
                })),
                hasMore: raw.length >= limit,
                apiAdvance: raw.length,
            };
        }
        const page = await fetchFilteredBrowseLibraryPage(
            'podcasts', apiOffset, limit, entry.seenKeys, 'name_sort', providerId,
        );
        return {
            items: page.items.map((i) => maItemToPanelRow({
                ...i,
                media_type: uiH('inferMediaType', i) || 'podcast',
            })),
            hasMore: page.hasMore,
            nextOffset: page.nextOffset,
            seenKeys: page.seenKeys,
        };
    }
    if (entry.type === 'shortcut' && entry.key === 'playlists') {
        const providerId = entry.browseProviderId || null;
        if (!providerId || providerId === 'all') {
            const raw = await maClient.libraryItems('playlists', apiOffset, limit);
            return {
                items: raw.map((i) => maItemToPanelRow(
                    { ...i, media_type: i.media_type || 'playlist' },
                )),
                hasMore: raw.length >= limit,
                apiAdvance: raw.length,
            };
        }
        const page = await fetchFilteredBrowseLibraryPage(
            'playlists', apiOffset, limit, entry.seenKeys, 'name_sort', providerId,
        );
        return {
            items: page.items.map((i) => maItemToPanelRow(
                { ...i, media_type: i.media_type || 'playlist' },
            )),
            hasMore: page.hasMore,
            nextOffset: page.nextOffset,
            seenKeys: page.seenKeys,
        };
    }
    if (entry.type === 'shortcut' && entry.key === 'radio') {
        const providerId = entry.browseProviderId || 'all';
        const page = await maClient.loadRadioStationsPage(providerId, apiOffset, limit);
        return {
            items: page.items.map((i) => maItemToPanelRow(i, { isRadio: true })),
            hasMore: page.hasMore,
            apiAdvance: page.items.length || limit,
        };
    }
    if (entry.type === 'shortcut' && entry.key === 'favorites') {
        const all = await uiH('loadFavoritesListCached');
        if (!all.length) {
            return {
                items: [{
                    title: 'No favorites yet',
                    subtitle: 'Heart albums, playlists, and stations in Music Assistant',
                    kind: 'empty',
                }],
                hasMore: false,
                apiAdvance: 0,
            };
        }
        const slice = all.slice(apiOffset, apiOffset + limit);
        return {
            items: slice.map((i) => {
                const mediaType = uiH('inferMediaType', i) || (i.media_type || '').toLowerCase();
                // Show the item's true source provider (e.g. Spotify) for
                // the badge, not "library" just because it's saved. Local
                // items still resolve to library via itemProviderId().
                return maItemToPanelRow(i, { isRadio: mediaType === 'radio' });
            }),
            hasMore: apiOffset + limit < all.length,
            apiAdvance: slice.length || limit,
        };
    }
    if (entry.type === 'artist_letter') {
        const wantCount = apiOffset + limit;
        const page = await fetchLetterBrowsePage(entry, 'artists', wantCount);
        return {
            items: page.items,
            hasMore: page.hasMore,
            nextOffset: page.nextOffset,
        };
    }
    if (entry.type === 'audiobook_letter') {
        const wantCount = apiOffset + limit;
        const page = await fetchLetterBrowsePage(entry, 'audiobooks', wantCount);
        return {
            items: page.items,
            hasMore: page.hasMore,
            nextOffset: page.nextOffset,
        };
    }
    if (entry.type === 'genre_letter') {
        const wantCount = apiOffset + limit;
        const page = await fetchLetterBrowsePage(entry, 'genres', wantCount);
        return {
            items: page.items,
            hasMore: page.hasMore,
            nextOffset: page.nextOffset,
        };
    }
    if (entry.type === 'podcast') {
        entry.item = await maClient.resolveMaItem(entry.item);
        state.browseStack[state.browseStack.length - 1] = entry;
        const raw = await maClient.podcastEpisodes(entry.item, {
            limit,
            offset: apiOffset,
        });
        const sorted = sortPodcastEpisodes(raw).slice(0, limit);
        const showName = entry.item?.name || entry.title || '';
        return {
            items: sorted.map((i) => maItemToPanelRow(i, { podcastShowName: showName })),
            hasMore: raw.length >= limit,
            apiAdvance: limit,
        };
    }
    return { items: [], hasMore: false, apiAdvance: 0 };
}



async function loadBrowsePage(reset = false) {
    if (state.browseListLoading) {
        state.browsePagePending = true;
        state.browsePagePendingReset = reset || state.browsePagePendingReset;
        return;
    }
    const entry = getCurrentBrowseEntry();
    if (entry.type === 'search_results') {
        await loadSearchPage(reset);
        return;
    }
    if (!isBrowsePageable(entry)) return;
    state.browseListLoading = true;
    try {
        await maClient.ensureReady();
        const view = state.browseViews[entry.key] || {
            title: entry.title,
            hint: entry.hint || '',
            items: [],
            layout: 'list',
            hasMore: false,
            apiOffset: 0,
        };
        const isLetterPage = entry.type === 'artist_letter'
            || entry.type === 'audiobook_letter'
            || entry.type === 'genre_letter';
        const apiOffset = reset ? 0 : (view.apiOffset || 0);
        if (reset) {
            entry.seenKeys = new Set();
            if (isLetterPage) {
                entry._letterItemsFull = null;
                entry._letterCacheKey = null;
            }
        } else if (!entry.seenKeys && view.seenKeys) {
            entry.seenKeys = new Set(view.seenKeys);
        } else if (!entry.seenKeys) {
            entry.seenKeys = new Set();
        }
        const page = await fetchBrowsePage(entry, apiOffset, BROWSE_PAGE_SIZE);
        if (isLetterPage) {
            view.items = page.items;
        } else {
            view.items = reset ? page.items : (view.items || []).concat(page.items);
        }
        const alphaListMode = isAlphaListEntry(entry) && entry.alphaViewMode === 'list' && !isLetterPage;
        if (alphaListMode && view.items?.length) {
            view.items = sortBrowsePanelRows(view.items);
        }
        view.apiOffset = page.nextOffset != null
            ? page.nextOffset
            : apiOffset + (page.apiAdvance || 0);
        view.seenKeys = page.seenKeys ? Array.from(page.seenKeys) : view.seenKeys;
        if (page.seenKeys) entry.seenKeys = page.seenKeys;
        view.hasMore = page.hasMore;
        view.title = entry.title;
        view.hint = entry.hint || '';
        storeBrowseView(entry.key, view);
        if (isLetterPage) {
            state._lastBrowseRenderKey = '';
        }
        renderBrowsePanel(isLetterPage);
        if (reset) {
            state.panelFocusIndex = 0;
            state.browseRowSubFocus = 0;
        }
        uiH('updatePanelFocus');
    } catch (err) {
        console.warn('browse page load failed:', err);
    } finally {
        state.browseListLoading = false;
        if (state.browsePagePending) {
            const pendingReset = state.browsePagePendingReset;
            state.browsePagePending = false;
            state.browsePagePendingReset = false;
            void loadBrowsePage(pendingReset);
        }
    }
}



async function getSampleTrackTitleForArtist(artistItem) {
    const prov = itemStoredProviderId(artistItem);
    try {
        const albums = await maClient.artistAlbums(artistItem, {
            inLibraryOnly: true,
            preferredProvider: prov,
        });
        const album = albums[0];
        if (!album) return '';
        const tracks = await maClient.albumTracks(album, { preferredProvider: prov });
        return tracks.find((t) => t?.name && t.name !== '..')?.name || '';
    } catch (err) {
        console.warn('sample track from albums failed:', err);
        return '';
    }
}



async function findSpotifyArtistByTrackHint(artistItem) {
    const artistName = uiH('cleanArtistDisplayName', artistItem?.name || '');
    if (!artistName) return null;
    const trackTitle = await getSampleTrackTitleForArtist(artistItem);
    const query = trackTitle ? `${artistName} ${trackTitle}` : artistName;
    try {
        const result = await maClient.send('music/search', {
            search_query: query,
            media_types: ['track'],
            limit: 20,
            library_only: false,
        });
        for (const track of (result?.tracks || [])) {
            if (!isSpotifyProvider(itemProviderId(track))) continue;
            if (trackTitle && !uiH('titlesRoughlyMatch', track.name, trackTitle)) continue;
            const artist = track.artists?.[0];
            if (!artist?.name) continue;
            try {
                const full = await maClient.resolveMaItem({ ...artist, media_type: 'artist' });
                if (full?.name) return full;
            } catch (err) {
                console.warn('resolve hinted spotify artist failed:', err);
            }
            return artist;
        }
    } catch (err) {
        console.warn('spotify artist track-hint search failed:', err);
    }
    return null;
}



async function getLibraryAlbumNames(artistItem) {
    try {
        const albums = await maClient.artistAlbums(artistItem, {
            inLibraryOnly: true,
            preferredProvider: itemStoredProviderId(artistItem),
        });
        return albums.slice(0, 30).map((a) => a.name).filter(Boolean);
    } catch (err) {
        return [];
    }
}



async function scoreArtistAlbumMatch(candidateArtist, libraryAlbums) {
    if (!libraryAlbums.length) return 0;
    try {
        const albums = await maClient.artistAlbums(candidateArtist, {
            inLibraryOnly: false,
            preferredProvider: itemProviderId(candidateArtist),
        });
        let score = 0;
        for (const album of albums.slice(0, 30)) {
            for (const libName of libraryAlbums) {
                if (uiH('titlesRoughlyMatch', libName, album.name)) score += 1;
            }
        }
        return score;
    } catch (err) {
        return 0;
    }
}



async function pickBestSpotifyArtistCandidate(artistItem, candidates, addFn) {
    if (!candidates.length) return;
    if (candidates.length === 1) {
        addFn(candidates[0]);
        return;
    }
    const libraryAlbums = await getLibraryAlbumNames(artistItem);
    if (!libraryAlbums.length) return;
    const scored = await Promise.all(candidates.map(async (cand) => ({
        cand,
        score: await scoreArtistAlbumMatch(cand, libraryAlbums),
    })));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best?.cand && best.score > 0) addFn(best.cand);
}



function seedArtistBrowseProvider(artistItem, fromMedia) {
    if (isInMaLibrary(artistItem) || uiH('isLocalLibraryItem', artistItem)) {
        return itemStoredProviderId(artistItem);
    }
    if (fromMedia) {
        const fromProv = itemProviderId(fromMedia) || itemStoredProviderId(fromMedia);
        if (fromProv) return normalizeProviderId(fromProv);
    }
    return normalizeProviderId(
        itemStoredProviderId(artistItem) || itemProviderId(artistItem) || 'library',
    );
}



function buildSeedArtistProviders(artistItem, preferredProvider) {
    const prov = normalizeProviderId(
        preferredProvider || itemStoredProviderId(artistItem) || itemProviderId(artistItem),
    );
    const label = isLibraryLikeProvider(prov) ? 'Library' : uiH('formatProviderLabel', prov);
    return [{ item: artistItem, provider: prov, label }];
}



function artistProviderListsEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((opt, i) => opt.provider === b[i]?.provider);
}



function sortArtistProviderOptions(options) {
    const providerSortWeight = (opt) => {
        if (isLibraryLikeProvider(opt.provider)) return 0;
        if (isSpotifyProvider(opt.provider)) return 1;
        return 2;
    };
    return [...options].sort((a, b) => {
        const d = providerSortWeight(a) - providerSortWeight(b);
        if (d) return d;
        return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
}



function mergeArtistProviderOptions(existing, incoming) {
    if (!Array.isArray(incoming) || !incoming.length) return existing || incoming || [];
    if (!Array.isArray(existing) || !existing.length) return incoming;
    const merged = [...incoming];
    const hasProv = (list, test) => list.some(test);
    for (const opt of existing) {
        if (isLibraryLikeProvider(opt.provider)) {
            if (!hasProv(merged, (o) => isLibraryLikeProvider(o.provider))) {
                merged.unshift(opt);
            }
        } else if (isSpotifyProvider(opt.provider)) {
            if (!hasProv(merged, (o) => isSpotifyProvider(o.provider))) {
                const insertAt = merged.findIndex((o) => !isLibraryLikeProvider(o.provider));
                merged.splice(insertAt >= 0 ? insertAt : merged.length, 0, opt);
            }
        } else if (!merged.some((o) => o.provider === opt.provider)) {
            merged.push(opt);
        }
    }
    return sortArtistProviderOptions(merged);
}



function applyArtistProviderOptions(entry, options) {
    const prevIdx = entry.selectedProviderIndex || 0;
    const prevProv = entry.artistProviders?.[prevIdx]?.provider;
    entry.artistProviders = mergeArtistProviderOptions(entry.artistProviders, options);
    let newIdx = options.findIndex((o) => o.provider === prevProv);
    if (newIdx < 0) newIdx = Math.min(prevIdx, options.length - 1);
    if (newIdx < 0) newIdx = 0;
    entry.selectedProviderIndex = newIdx;
    entry.item = options[newIdx].item;
    state.browseStack[state.browseStack.length - 1] = entry;
}



async function refreshArtistProviderDiscovery(entry) {
    if (!entry || entry.type !== 'artist' || entry._providerDiscoveryInFlight) return;
    entry._providerDiscoveryPending = true;
    entry._providerDiscoveryInFlight = true;
    const entryKey = entry.key;
    if (getCurrentBrowseEntry()?.key === entryKey) {
        renderArtistProviderBar(getCurrentBrowseEntry());
    }
    try {
        const options = await discoverArtistProviders(entry.item, (progressOptions) => {
            const current = getCurrentBrowseEntry();
            if (!current || current.key !== entryKey || current.type !== 'artist') return;
            current.artistProviders = progressOptions;
            state.browseStack[state.browseStack.length - 1] = current;
            renderArtistProviderBar(current);
        });
        const current = getCurrentBrowseEntry();
        if (!current || current.key !== entryKey || current.type !== 'artist') return;
        const idxBefore = current.selectedProviderIndex || 0;
        const provBefore = current.artistProviders?.[idxBefore]?.provider;
        const itemUriBefore = current.item?.uri;
        if (!artistProviderListsEqual(current.artistProviders, options)) {
            applyArtistProviderOptions(current, options);
        }
        const idxAfter = current.selectedProviderIndex || 0;
        const provAfter = current.artistProviders?.[idxAfter]?.provider;
        const itemUriAfter = current.item?.uri;
        renderArtistProviderBar(current);
        if (provBefore !== provAfter || itemUriBefore !== itemUriAfter) {
            await refreshArtistDiscographyView(current);
        }
    } catch (err) {
        console.warn('artist provider discovery failed:', err);
    } finally {
        entry._providerDiscoveryInFlight = false;
        entry._providerDiscoveryPending = false;
        const current = getCurrentBrowseEntry();
        if (current?.key === entryKey && current.type === 'artist') {
            renderArtistProviderBar(current);
        }
    }
}



async function discoverArtistProviders(artistItem, onProgress) {
    const cacheKey = `${ARTIST_PROVIDERS_CACHE_VERSION}:`
        + (artistItem?.uri || artistItem?.item_id
        || uiH('cleanArtistDisplayName', artistItem?.name || ''));
    if (cacheKey && state.artistProvidersCache.has(cacheKey)) {
        const cached = state.artistProvidersCache.get(cacheKey);
        if (onProgress) onProgress(cached);
        return cached;
    }
    const name = uiH('cleanArtistDisplayName', artistItem?.name || '');
    if (!name) {
        const prov = normalizeProviderId(itemStoredProviderId(artistItem));
        const fallback = [{ item: artistItem, provider: prov, label: 'Library' }];
        if (cacheKey) {
            state.artistProvidersCache.set(cacheKey, fallback);
            trimMapCache(state.artistProvidersCache, ARTIST_PROVIDERS_CACHE_MAX);
        }
        return fallback;
    }
    const options = [];
    let hasLibraryChip = false;
    let hasSpotifyChip = false;
    const seenExternalDomains = new Set();
    const notify = () => {
        if (!onProgress) return;
        onProgress(sortArtistProviderOptions(options));
    };
    const add = (item, providerOverride) => {
        if (!item || !uiH('shouldShowArtistItem', item)) return;
        const prov = normalizeProviderId(providerOverride || itemProviderId(item));
        if (isLibraryLikeProvider(prov)) {
            if (hasLibraryChip) return;
            hasLibraryChip = true;
        } else if (isSpotifyProvider(prov)) {
            if (hasSpotifyChip) return;
            hasSpotifyChip = true;
        } else {
            const dom = providerIconDomain(prov);
            if (seenExternalDomains.has(dom)) return;
            seenExternalDomains.add(dom);
        }
        const label = isLibraryLikeProvider(prov) ? 'Library' : uiH('formatProviderLabel', prov);
        const prevLen = options.length;
        options.push({ item, provider: prov, label });
        if (options.length > prevLen) notify();
    };
    add(artistItem, itemStoredProviderId(artistItem));

    let searchArtists = [];
    try {
        const result = await maClient.send('music/search', {
            search_query: name,
            media_types: ['artist'],
            limit: 25,
            library_only: false,
        });
        searchArtists = result?.artists || [];
    } catch (err) {
        console.warn('artist provider search failed:', err);
    }

    const nameLower = name.toLowerCase();
    const strictSpotify = [];
    const otherExternals = [];
    for (const artist of searchArtists) {
        if (!uiH('shouldShowArtistItem', artist)) continue;
        const prov = normalizeProviderId(itemProviderId(artist));
        const candidateName = uiH('cleanArtistDisplayName', artist.name).toLowerCase();
        if (isLibraryLikeProvider(prov)) {
            if (candidateName === nameLower) add(artist, itemStoredProviderId(artist));
        } else if (isSpotifyProvider(prov)) {
            if (candidateName === nameLower) strictSpotify.push(artist);
        } else if (candidateName === nameLower) {
            otherExternals.push(artist);
        }
    }

    const spotifyDiscovery = (async () => {
        await pickBestSpotifyArtistCandidate(artistItem, strictSpotify, (c) => add(c));
        if (!options.some((o) => isSpotifyProvider(o.provider))) {
            const fuzzySpotify = searchArtists.filter((artist) => {
                if (!uiH('shouldShowArtistItem', artist)) return false;
                if (!isSpotifyProvider(itemProviderId(artist))) return false;
                return uiH('namesMatchForArtist', artist.name, name);
            });
            await pickBestSpotifyArtistCandidate(artistItem, fuzzySpotify, (c) => add(c));
        }
        if (!options.some((o) => isSpotifyProvider(o.provider))) {
            const hinted = await findSpotifyArtistByTrackHint(artistItem);
            if (hinted) add(hinted);
        }
    })();
    const externalDiscovery = (async () => {
        for (const artist of otherExternals) add(artist);
    })();
    await Promise.all([spotifyDiscovery, externalDiscovery]);

    const sorted = sortArtistProviderOptions(options);
    if (cacheKey) {
        state.artistProvidersCache.set(cacheKey, sorted);
        trimMapCache(state.artistProvidersCache, ARTIST_PROVIDERS_CACHE_MAX);
    }
    notify();
    return sorted;
}



function hasArtistProviderBar() {
    const bar = document.getElementById('browse-artist-providers');
    return !!(bar && bar.style.display !== 'none' && bar.children.length);
}



function hasAlphaViewBar() {
    const bar = document.getElementById('browse-alpha-view-bar');
    return !!(bar && bar.style.display !== 'none' && bar.children.length);
}



function entrySupportsContainerActions(entry) {
    return CONTAINER_ACTION_ENTRY_TYPES.includes(entry?.type);
}



function getContainerActionSourceItem(entry) {
    if (!entry?.item) return null;
    return maItemToPanelRow(entry.item, {
        activeArtistProvider: entry.activeArtistProvider
            || entry.artistProviders?.[entry.selectedProviderIndex || 0]?.provider,
    });
}



function hideContainerActionsBar() {
    const bar = document.getElementById('browse-container-actions');
    if (!bar) return;
    bar.style.display = 'none';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '';
    state.containerMenuActions = [];
    state.containerActionQueuedState.clear();
    syncAllAndroidChipSections();
}



function containerActionsStateKey(entry) {
    if (!entry) return '';
    return entry.key || `${entry.type || ''}:${entry.title || ''}`;
}



function markContainerActionQueued(actionId) {
    const entry = getCurrentBrowseEntry();
    const key = containerActionsStateKey(entry);
    if (key) state.containerActionQueuedState.set(key, actionId);
    refreshContainerActionChipLabels();
}



function refreshContainerActionChipLabels() {
    const bar = document.getElementById('browse-container-actions');
    if (!bar || bar.style.display === 'none') return;
    const entry = getCurrentBrowseEntry();
    const queuedId = state.containerActionQueuedState.get(containerActionsStateKey(entry));
    Array.from(bar.children).forEach((chip) => {
        const actionId = chip.dataset.actionId;
        const isQueued = queuedId && actionId === queuedId;
        chip.classList.toggle('queued', !!isQueued);
        const icon = chip.querySelector('img');
        const label = chip.querySelector('span');
        if (isQueued && icon && label) {
            icon.src = actionId === 'queue_top' ? 'icons/queued-top.svg' : 'icons/queued-bottom.svg';
            label.textContent = 'Queued';
        } else if (icon && label) {
            if (actionId === 'queue_top') {
                icon.src = 'icons/queue-top.svg';
                label.textContent = 'Queue (Top)';
            } else if (actionId === 'queue_end') {
                icon.src = 'icons/queue-bottom.svg';
                label.textContent = 'Queue (End)';
            }
        }
    });
}



function hasContainerActionsBar() {
    const bar = document.getElementById('browse-container-actions');
    return !!(bar && bar.style.display !== 'none' && bar.children.length);
}



function updateContainerActionFocus() {
    const bar = document.getElementById('browse-container-actions');
    if (!bar) return;
    getBrowseRows().forEach((row) => {
        row.classList.remove('focused');
        row.querySelectorAll('.sub-focused').forEach((el) => el.classList.remove('sub-focused'));
    });
    Array.from(bar.children).forEach((chip, i) => {
        chip.classList.toggle('focused', uiH('panelKeyboardFocusActive')
            && state.browseFocusZone === 'container_actions' && i === state.containerActionFocusIndex);
    });
    if (state.browseFocusZone === 'container_actions') {
        uiH('focusPanelTarget', bar.children[state.containerActionFocusIndex]);
    }
}



function filterContainerSelfGoToActions(actions, entry) {
    if (!entry?.item || !entrySupportsContainerActions(entry)) return actions;
    const suppressByType = {
        artist: 'go_artist',
        album: 'go_album',
        playlist: 'go_playlist',
        podcast: 'go_podcast',
    };
    const suppressId = suppressByType[entry.type];
    if (!suppressId) return actions;
    return actions.filter((action) => action.id !== suppressId);
}


function renderContainerActionsBar(entry) {
    const bar = document.getElementById('browse-container-actions');
    if (!bar || !entrySupportsContainerActions(entry)) {
        hideContainerActionsBar();
        return;
    }
    if (uiH('isTrackCollectionEntry', entry)) {
        state.containerMenuActions = uiH('getTrackCollectionContainerActions', entry);
        if (!state.containerMenuActions.length) {
            hideContainerActionsBar();
            return;
        }
        bar.style.display = 'flex';
        bar.setAttribute('aria-hidden', 'false');
        bar.innerHTML = '';
        state.containerActionFocusIndex = 0;
        state.containerMenuActions.forEach((action, i) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'search-filter-chip container-action-chip';
            chip.dataset.actionIndex = String(i);
            chip.dataset.actionId = action.id;
            chip.innerHTML = `<img src="icons/${action.icon}" alt=""><span>${panelRowActionLabel(action.label)}</span>`;
            chip.addEventListener('click', () => {
                state.containerActionFocusIndex = i;
                void activateContainerAction();
            });
            bar.appendChild(chip);
        });
        refreshContainerActionChipLabels();
        updateContainerActionFocus();
        syncAllAndroidChipSections();
        return;
    }
    const source = getContainerActionSourceItem(entry);
    if (!source) {
        hideContainerActionsBar();
        return;
    }
    state.containerMenuActions = filterContainerSelfGoToActions(
        getBrowseMenuActions(source, entry),
        entry,
    );
    if (!state.containerMenuActions.length) {
        hideContainerActionsBar();
        return;
    }
    bar.style.display = 'flex';
    bar.setAttribute('aria-hidden', 'false');
    bar.innerHTML = '';
    state.containerActionFocusIndex = 0;
    state.containerMenuActions.forEach((action, i) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'search-filter-chip container-action-chip';
        chip.dataset.actionIndex = String(i);
        chip.dataset.actionId = action.id;
        chip.innerHTML = `<img src="icons/${action.icon}" alt=""><span>${panelRowActionLabel(action.label)}</span>`;
        chip.addEventListener('click', () => {
            state.containerActionFocusIndex = i;
            void activateContainerAction();
        });
        bar.appendChild(chip);
    });
    refreshContainerActionChipLabels();
    updateContainerActionFocus();
    syncAllAndroidChipSections();
}



function moveContainerActionFocus(delta) {
    const bar = document.getElementById('browse-container-actions');
    if (!bar || !bar.children.length) return;
    state.containerActionFocusIndex = Math.max(0, Math.min(
        state.containerActionFocusIndex + delta,
        bar.children.length - 1,
    ));
    updateContainerActionFocus();
}



async function activateContainerAction() {
    const action = state.containerMenuActions[state.containerActionFocusIndex];
    const entry = getCurrentBrowseEntry();
    if (!action || !entry) return;
    if (uiH('isTrackCollectionEntry', entry)) {
        const pseudo = {
            mediaType: 'playlist',
            title: entry.title,
            uri: entry.item?.uri,
            raw: entry.item,
        };
        await executeBrowseMenuAction(action, pseudo, entry);
        return;
    }
    const item = getContainerActionSourceItem(entry);
    if (!item) return;
    await executeBrowseMenuAction(action, item, entry);
}



function updateArtistProviderFocus() {
    const bar = document.getElementById('browse-artist-providers');
    if (!bar) return;
    getBrowseRows().forEach((row) => {
        row.classList.remove('focused');
        row.querySelectorAll('.sub-focused').forEach((el) => el.classList.remove('sub-focused'));
    });
    const entry = getCurrentBrowseEntry();
    const browseProviders = entrySupportsBrowseProviders(entry);
    const selectedArtist = entry?.selectedProviderIndex || 0;
    const selectedBrowseId = entry?.browseProviderId || null;
    Array.from(bar.children).forEach((chip, i) => {
        if (chip.classList.contains('artist-provider-loading')) return;
        chip.classList.toggle('focused', uiH('panelKeyboardFocusActive')
            && state.browseFocusZone === 'artist_providers' && i === state.artistProviderFocusIndex);
        if (browseProviders) {
            chip.classList.toggle('active', chip.dataset.providerId === selectedBrowseId);
        } else {
            chip.classList.toggle('active', i === selectedArtist);
        }
    });
    if (state.browseFocusZone === 'artist_providers') {
        uiH('focusPanelTarget', bar.children[state.artistProviderFocusIndex]);
    }
}



function hideProviderBar() {
    const bar = document.getElementById('browse-artist-providers');
    if (!bar) return;
    bar.style.display = 'none';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '';
    syncAllAndroidChipSections();
}



async function renderBrowseProviderBar(entry) {
    const bar = document.getElementById('browse-artist-providers');
    if (!bar || !entrySupportsBrowseProviders(entry)) {
        hideProviderBar();
        return;
    }
    const options = await getBrowseProviderOptionsForEntry(entry);
    if (!entry.browseProviderId) {
        entry.browseProviderId = resolveBrowseProviderId(entry, options);
    }
    bar.style.display = 'flex';
    bar.setAttribute('aria-hidden', 'false');
    bar.innerHTML = '';
    const selectedId = entry.browseProviderId;
    state.artistProviderFocusIndex = Math.max(0, options.findIndex((o) => o.id === selectedId));
    options.forEach((opt, i) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'artist-provider-chip' + (opt.id === selectedId ? ' active' : '');
        const iconPath = providerIcon(opt.id);
        const monoClass = providerIconMono(opt.id) ? ' class="provider-icon-mono"' : '';
        chip.dataset.providerId = opt.id;
        chip.innerHTML = `<img src="icons/${iconPath}" alt=""${monoClass}>`
            + `<span>${escapeHtml(opt.label)}</span>`;
        chip.addEventListener('click', () => switchBrowseProvider(opt.id));
        bar.appendChild(chip);
    });
    updateArtistProviderFocus();
    syncAllAndroidChipSections();
}



async function switchBrowseProvider(providerId) {
    const entry = getCurrentBrowseEntry();
    if (!entrySupportsBrowseProviders(entry) || entry.browseProviderId === providerId) return;
    if (entry.key === 'genres' || entry.type === 'genre_letter') {
        invalidateAlphaLetterCache('genres', providerId);
    }
    if (entry.key === 'audiobooks') {
        invalidateAlphaLetterCache('audiobooks', providerId);
    }
    if (entry.key === 'artists') {
        invalidateAlphaLetterCache('artists', providerId);
    }
    entry.browseProviderId = providerId;
    saveBrowseProviderPref(getBrowseSectionKey(entry), providerId);
    state.browseStack[state.browseStack.length - 1] = entry;
    delete state.browseViews[entry.key];
    const orderIdx = state._browseViewOrder.indexOf(entry.key);
    if (orderIdx >= 0) state._browseViewOrder.splice(orderIdx, 1);
    state._lastBrowseRenderKey = '';
    await renderBrowseProviderBar(entry);
    if (isBrowsePageable(entry)) {
        await loadBrowsePage(true);
    } else {
        await loadCurrentBrowseView();
    }
}



function renderArtistProviderBar(entry) {
    const bar = document.getElementById('browse-artist-providers');
    if (!bar) return;
    if (!entry || entry.type !== 'artist' || !entry.artistProviders?.length) {
        hideProviderBar();
        return;
    }
    bar.style.display = 'flex';
    bar.setAttribute('aria-hidden', 'false');
    bar.innerHTML = '';
    const selected = entry.selectedProviderIndex || 0;
    state.artistProviderFocusIndex = selected;
    entry.artistProviders.forEach((opt, i) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'artist-provider-chip' + (i === selected ? ' active' : '');
        const iconPath = providerIcon(opt.provider);
        const monoClass = providerIconMono(opt.provider) ? ' class="provider-icon-mono"' : '';
        chip.innerHTML = `<img src="icons/${iconPath}" alt=""${monoClass}>`
            + `<span>${opt.label}</span>`;
        chip.addEventListener('click', () => switchArtistProvider(i));
        bar.appendChild(chip);
    });
    if (entry._providerDiscoveryPending || entry._providerDiscoveryInFlight) {
        const spinner = document.createElement('span');
        spinner.className = 'artist-provider-loading';
        spinner.setAttribute('aria-label', 'Finding more providers');
        bar.appendChild(spinner);
    }
    updateArtistProviderFocus();
    syncAllAndroidChipSections();
}



async function refreshArtistDiscographyView(entry) {
    delete state.browseViews[entry.key];
    const orderIdx = state._browseViewOrder.indexOf(entry.key);
    if (orderIdx >= 0) state._browseViewOrder.splice(orderIdx, 1);
    state._lastBrowseRenderKey = '';
    delete entry.discographyAlbums;
    delete entry.collapsedSections;
    state.browseStack[state.browseStack.length - 1] = entry;
    const items = await fetchBrowseItemsForEntry(entry);
    storeBrowseView(entry.key, {
        title: entry.title,
        hint: entry.hint || '',
        items,
        layout: 'list',
        hasMore: false,
        apiOffset: 0,
    });
    renderBrowsePanel();
    state.panelFocusIndex = 0;
    state.browseRowSubFocus = 0;
    uiH('updatePanelFocus');
}



async function switchArtistProvider(index) {
    const entry = getCurrentBrowseEntry();
    if (entry.type !== 'artist' || !entry.artistProviders?.[index]) return;
    entry.selectedProviderIndex = index;
    entry.item = entry.artistProviders[index].item;
    delete entry.collapsedSections;
    delete entry.discographyAlbums;
    state.browseStack[state.browseStack.length - 1] = entry;
    delete state.browseViews[entry.key];
    const orderIdx = state._browseViewOrder.indexOf(entry.key);
    if (orderIdx >= 0) state._browseViewOrder.splice(orderIdx, 1);
    state._lastBrowseRenderKey = '';
    renderArtistProviderBar(entry);
    await loadCurrentBrowseView({ skipArtistProviderDiscovery: true });
}



async function fetchBrowseItemsForEntry(entry) {
    if (entry.type === 'root') {
        return [...BROWSE_ROOT_SHORTCUTS];
    }

    if (entry.type === 'shortcut') {
        if (entry.key === 'search') return [];
        if (entry.key === 'recent') {
            const raw = await maClient.recentlyPlayed();
            const enriched = await uiH('enrichRecentPlayedList', raw);
            return enriched.map((media) => {
                const mediaType = uiH('inferMediaType', media) || (media.media_type || '').toLowerCase();
                return maItemToPanelRow({
                    ...media,
                    media_type: mediaType,
                }, {
                    isRadio: mediaType === 'radio',
                });
            });
        }
        if (entry.key === 'recently_added') {
            const providerId = entry.browseProviderId || 'all';
            const raw = await maClient.recentlyAdded(50, providerId);
            if (!raw.length) {
                return [{
                    title: 'No albums or audiobooks recently added',
                    subtitle: '',
                    kind: 'empty',
                }];
            }
            const enriched = await Promise.all(raw.map(async (i) => {
                const mediaType = uiH('inferMediaType', i) || (i.media_type || '').toLowerCase();
                if (mediaType === 'album') {
                    try {
                        return await maClient.resolveMaItem(i);
                    } catch (err) {
                        return i;
                    }
                }
                return i;
            }));
            return enriched.map((i) => maItemToPanelRow(i));
        }
        if (entry.key === 'favorites') {
            return [];
        }
        if (entry.key === 'artists') {
            return buildDynamicAlphaIndex('artist', 'artists.svg', 'Artists', 'artists', null);
        }
        if (entry.key === 'audiobooks') {
            return buildDynamicAlphaIndex(
                'audiobook',
                'audiobooks.svg',
                'Audiobooks',
                'audiobooks',
                entry.browseProviderId || null,
            );
        }
        if (entry.key === 'genres') {
            return buildDynamicAlphaIndex(
                'genre',
                'genres.svg',
                'Genres',
                'genres',
                entry.browseProviderId || null,
            );
        }
        if (entry.key === 'recommended') {
            let folders = [];
            try {
                folders = await maClient.getRecommendations();
            } catch (err) {
                console.warn('recommendations failed:', err);
            }
            const sections = folders.map((f, i) => {
                const rows = (f.items || [])
                    .filter((it) => it && it.uri)
                    .map((it) => {
                        const mediaType = uiH('inferMediaType', it) || (it.media_type || '').toLowerCase();
                        return maItemToPanelRow({ ...it, media_type: mediaType }, {
                            isRadio: mediaType === 'radio',
                        });
                    });
                return {
                    key: `${f.translation_key || 'rec'}-${i}`,
                    translationKey: f.translation_key || '',
                    title: f.name || f.translation_key || 'Recommended',
                    icon: recommendedFolderIcon(f.translation_key, f.name, f.items),
                    rows,
                };
            }).filter((s) => s.rows.length);
            if (!sections.length) {
                return [{ title: 'No recommendations available', subtitle: '', kind: 'empty' }];
            }
            for (let i = sections.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [sections[i], sections[j]] = [sections[j], sections[i]];
            }
            entry.recSections = sections;
            if (!entry.recommendedMediaFilter) entry.recommendedMediaFilter = 'all';
            if (!entry.collapsedSections) {
                entry.collapsedSections = defaultRecommendedCollapsedSections(sections);
            }
            state.browseStack[state.browseStack.length - 1] = entry;
            return buildRecommendedBrowseItems(entry);
        }
        if (entry.key === 'continue') {
            let items = [];
            try {
                items = await maClient.getInProgressItems(50);
            } catch (err) {
                console.warn('in-progress items failed:', err);
            }
            const rows = items
                .filter((it) => it && it.uri)
                .map((it) => {
                    const mediaType = uiH('inferMediaType', it) || (it.media_type || '').toLowerCase();
                    return maItemToPanelRow({ ...it, media_type: mediaType });
                });
            if (!rows.length) {
                return [{
                    title: 'Nothing in progress',
                    subtitle: 'Start an audiobook or podcast to see it here',
                    kind: 'empty',
                }];
            }
            return rows;
        }
        if (entry.key === 'podcasts' || entry.key === 'playlists' || entry.key === 'radio') {
            return [];
        }
    }

    if (entry.type === 'artist_letter' || entry.type === 'audiobook_letter' || entry.type === 'genre_letter') {
        return [];
    }

    if (entry.type === 'browse') {
        return (await maClient.browse(entry.path)).map(maItemToPanelRow);
    }

    if (entry.type === 'artist') {
        if (!entry.artistProviders?.length) {
            entry.artistProviders = buildSeedArtistProviders(
                entry.item,
                entry.preferredProvider,
            );
            entry.selectedProviderIndex = 0;
            state.browseStack[state.browseStack.length - 1] = entry;
        }
        const idx = entry.selectedProviderIndex || 0;
        const prov = entry.artistProviders[idx]?.provider;
        const artist = await maClient.resolveMaItemForProvider(
            entry.artistProviders[idx]?.item || entry.item,
            prov,
        );
        entry.item = artist;
        state.browseStack[state.browseStack.length - 1] = entry;
        const inLibraryOnly = isLibraryLikeProvider(prov);
        let albumRows;
        try {
            const albums = await maClient.artistAlbums(artist, {
                preferredProvider: prov,
                inLibraryOnly,
            });
            albumRows = albums.map((i) => maItemToPanelRow(i, {
                inArtistDiscography: true,
                activeArtistProvider: prov,
            }));
        } catch (err) {
            console.warn('artist albums failed:', err);
            albumRows = [];
            if (inLibraryOnly) {
                try {
                    const local = await maClient.libraryItems('albums', 0, 50, {
                        search: artist.name,
                    });
                    albumRows = local.filter(isInMaLibrary).map((i) => maItemToPanelRow(i, {
                        inArtistDiscography: true,
                        activeArtistProvider: prov,
                    }));
                } catch (fallbackErr) {
                    console.warn('artist albums library fallback failed:', fallbackErr);
                }
            }
        }
        entry.discographyAlbums = albumRows;
        if (!entry.collapsedSections) {
            entry.collapsedSections = defaultDiscographyCollapsedSections(albumRows);
        }
        state.browseStack[state.browseStack.length - 1] = entry;
        return buildGroupedDiscographyItems(albumRows, entry.collapsedSections);
    }

    if (entry.type === 'album') {
        entry.item = await maClient.resolveMaItem(entry.item);
        state.browseStack[state.browseStack.length - 1] = entry;
        const prov = entry.activeArtistProvider || null;
        const trackOpts = uiH('providerOptsForPreferred', prov);
        const tracks = await maClient.albumTracks(entry.item, trackOpts);
        const rowOpts = prov ? { activeArtistProvider: prov } : {};
        return tracks.map((i) => maItemToPanelRow(i, rowOpts));
    }

    if (entry.type === 'playlist') {
        entry.item = await maClient.resolveMaItem(entry.item);
        state.browseStack[state.browseStack.length - 1] = entry;
        const tracks = await uiH('getPlaylistTracksCached', entry);
        return tracks.map(maItemToPanelRow);
    }

    if (entry.type === 'track_versions' || entry.type === 'similar_tracks') {
        const track = await maClient.resolveMaItem(entry.item);
        entry.item = track;
        if (entry.type === 'similar_tracks') {
            const fetchLimit = entry._similarFetchLimit || 20;
            if (entry._similarLastFetchLimit === fetchLimit && entry._playlistTracksCache?.length) {
                return entry._playlistTracksCache.map(maItemToPanelRow);
            }
            let rawRows = uiH('getCachedTrackCollectionLists', track, entry.type);
            if (!rawRows?.length || rawRows.length < fetchLimit) {
                rawRows = await maClient.getSimilarTracks(track, {
                    limit: fetchLimit,
                    allowLookup: true,
                });
            }
            const rows = filterDistinctPlaylistTracks(track, rawRows);
            entry._playlistTracksCache = rows;
            entry._similarLastFetchLimit = fetchLimit;
            entry._similarHasMore = rawRows.length >= fetchLimit;
            state.browseStack[state.browseStack.length - 1] = entry;
            return rows.map(maItemToPanelRow);
        }
        if (!entry._playlistTracksCache?.length) {
            const cached = uiH('getCachedTrackCollectionLists', track, entry.type);
            if (cached?.length) {
                entry._playlistTracksCache = cached;
            } else {
                entry._playlistTracksCache = await maClient.getTrackVersions(track);
            }
            state.browseStack[state.browseStack.length - 1] = entry;
        }
        return (entry._playlistTracksCache || []).map(maItemToPanelRow);
    }

    if (entry.type === 'genre') {
        entry.item = await maClient.resolveMaItem(entry.item);
        state.browseStack[state.browseStack.length - 1] = entry;
        let folders = [];
        try {
            folders = await maClient.getGenreOverview(entry.item);
        } catch (err) {
            console.warn('genre overview failed:', err);
        }
        const providerId = entry.browseProviderId || null;
        const sections = folders.map((f, i) => {
            const rows = (f.items || [])
                .filter((it) => it && it.uri)
                .filter((it) => !providerId || providerId === 'all'
                    || itemMatchesBrowseProvider(it, providerId))
                .map((it) => {
                    const mediaType = uiH('inferMediaType', it) || (it.media_type || '').toLowerCase();
                    return maItemToPanelRow({ ...it, media_type: mediaType }, {
                        isRadio: mediaType === 'radio',
                    });
                });
            return {
                key: `${f.translation_key || 'genre'}-${i}`,
                translationKey: f.translation_key || '',
                title: f.name || f.translation_key || 'Genre',
                icon: recommendedFolderIcon(f.translation_key, f.name, f.items),
                rows,
            };
        }).filter((s) => s.rows.length);
        if (!sections.length) {
            return [{ title: 'No items in this genre', subtitle: '', kind: 'empty' }];
        }
        entry.recSections = sections;
        if (!entry.collapsedSections) {
            entry.collapsedSections = defaultRecommendedCollapsedSections(sections);
        }
        state.browseStack[state.browseStack.length - 1] = entry;
        return buildRecommendedBrowseItems(entry);
    }

    if (entry.type === 'podcast') {
        return [];
    }

    if (entry.type === 'search_results') {
        return entry.items || [];
    }

    return [];
}



async function loadCurrentBrowseView(opts = {}) {
    const entry = getCurrentBrowseEntry();
    state._lastBrowseRenderKey = '';
    browsePanelTitle.textContent = entry.title;
    browsePanelHint.textContent = entry.hint || '';
    browseList.innerHTML = '';
    browseList.closest('.media-panel')?.querySelector('.panel-header')?.classList.remove('panel-header-compact');
    delete browseList.dataset.userScrolled;
    const loading = document.createElement('div');
    loading.className = 'panel-divider panel-status';
    uiH('setPanelStatusText', loading, 'Loading');
    browseList.appendChild(loading);

    try {
        await maClient.ensureReady();
        let isAlphaGrid = false;
        if (isAlphaListEntry(entry)) {
            if (entrySupportsBrowseProviders(entry)) {
                await uiH('ensureMusicProvidersCached');
                if (!entry.browseProviderId) {
                    const providerOpts = await getBrowseProviderOptionsForEntry(entry);
                    entry.browseProviderId = resolveBrowseProviderId(entry, providerOpts);
                    state.browseStack[state.browseStack.length - 1] = entry;
                }
            }
            await ensureAlphaViewMode(entry);
            isAlphaGrid = entry.alphaViewMode === 'grid';
            if (isAlphaGrid) {
                loading.textContent = 'Loading library';
            }
        }
        const isRootGrid = entry.type === 'root';
        const layout = isRootGrid ? 'root_grid' : (isAlphaGrid ? 'alpha_grid' : 'list');
        const isSearch = entry.type === 'shortcut' && entry.key === 'search';
        const isSearchResults = entry.type === 'search_results';
        if (isSearch || isSearchResults) await ensureSearchProviders();
        if (!isSearch && !isSearchResults) state._browseSearchGeneration += 1;
        syncBrowseSearchChrome();
        state.browseFocusZone = isSearch ? 'input' : 'list';
        if (isAlphaListEntry(entry)) {
            renderAlphaViewBar(entry);
        } else {
            hideAlphaViewBar();
        }
        if (entrySupportsBrowseProviders(entry)) {
            await renderBrowseProviderBar(entry);
            hideContainerActionsBar();
        } else if (entry.type === 'artist') {
            if (!entry.artistProviders?.length) {
                entry.artistProviders = buildSeedArtistProviders(
                    entry.item,
                    entry.preferredProvider,
                );
                entry.selectedProviderIndex = 0;
                state.browseStack[state.browseStack.length - 1] = entry;
            }
            renderArtistProviderBar(entry);
            renderContainerActionsBar(entry);
        } else if (entrySupportsContainerActions(entry)) {
            hideProviderBar();
            renderContainerActionsBar(entry);
        } else {
            hideProviderBar();
            hideContainerActionsBar();
        }
        if (isBrowsePageable(entry)) {
            storeBrowseView(entry.key, {
                title: entry.title,
                hint: entry.hint || '',
                items: [],
                layout,
                hasMore: false,
                apiOffset: 0,
            });
            await loadBrowsePage(true);
        } else {
            const items = await fetchBrowseItemsForEntry(entry);
            storeBrowseView(entry.key, {
                title: entry.title,
                hint: entry.hint || '',
                items,
                layout,
                hasMore: entry?.type === 'similar_tracks' ? !!entry._similarHasMore : false,
                apiOffset: 0,
            });
            syncBrowseSearchChrome();
            renderBrowsePanel();
            state.panelFocusIndex = 0;
            state.browseRowSubFocus = 0;
            uiH('updatePanelFocus');
        }
        if (getCurrentBrowseEntry().type === 'artist') {
            const artistEntry = getCurrentBrowseEntry();
            renderArtistProviderBar(artistEntry);
            if (!opts.skipArtistProviderDiscovery) {
                refreshArtistProviderDiscovery(artistEntry);
            }
        }
        if (isSearch) browseSearchInput.focus();
    } catch (err) {
        console.warn('browse load failed:', err);
        const disconnected = (err.message || '').toLowerCase().includes('ma not connected')
            || (err.message || '').toLowerCase().includes('websocket not connected');
        storeBrowseView(entry.key, {
            title: entry.title,
            hint: '',
            items: disconnected
                ? [{ kind: 'ma_disconnected', title: 'MA not connected', subtitle: err.message || 'MA not connected' }]
                : [{ title: 'Could not load', subtitle: err.message || 'Error', kind: 'empty' }],
        });
        renderBrowsePanel();
        uiH('updatePanelFocus');
    }
}



function createProviderBadgeElement(providerId) {
    const icon = document.createElement('img');
    const libraryLike = isLibraryLikeProvider(providerId);
    icon.className = 'panel-row-provider';
    if (libraryLike || providerIconMono(providerId)) {
        icon.classList.add('provider-icon-mono');
    } else {
        icon.classList.add('provider-icon-color');
    }
    icon.src = libraryLike ? 'icons/library.svg' : `icons/${providerIcon(providerId)}`;
    icon.alt = '';
    icon.draggable = false;
    icon.onerror = () => {
        icon.src = 'icons/library.svg';
        icon.classList.remove('provider-icon-color');
        icon.classList.add('provider-icon-mono');
    };
    return icon;
}



function appendProviderBadge(parent, providerId) {
    if (!providerId) return;
    const slot = document.createElement('div');
    slot.className = 'panel-row-provider-slot';
    slot.appendChild(createProviderBadgeElement(providerId));
    parent.appendChild(slot);
}



function appendRowContent(parent, item) {
    if (item.genreIcon) {
        const wrap = document.createElement('span');
        wrap.className = 'panel-row-genre-icon'
            + (item.genreIconSpecific ? ' panel-row-genre-icon-specific' : '');
        wrap.setAttribute('aria-hidden', 'true');
        const fallback = item.icon ? `icons/${item.icon}` : 'icons/genres.svg';
        for (const cls of ['panel-row-genre-icon-base', 'panel-row-genre-icon-overlay']) {
            const img = document.createElement('img');
            img.className = cls;
            img.alt = '';
            img.src = fallback;
            img.onerror = () => { img.src = 'icons/genres.svg'; };
            wrap.appendChild(img);
        }
        parent.appendChild(wrap);
    } else {
        const icon = document.createElement('img');
        icon.className = 'panel-row-icon';
        icon.alt = '';
        const fallback = item.icon ? `icons/${item.icon}` : 'icons/library.svg';
        if (item.thumbUrl) {
            icon.classList.add('panel-row-thumb');
            icon.loading = 'lazy';
            icon.src = item.thumbUrl;
            icon.onerror = () => {
                icon.classList.add('panel-row-thumb-fallback');
                icon.src = fallback;
            };
        } else if (item.icon) {
            icon.src = fallback;
            icon.onerror = () => { icon.src = 'icons/library.svg'; };
        } else {
            icon.src = 'icons/library.svg';
        }
        parent.appendChild(icon);
    }
    const text = document.createElement('div');
    text.className = 'panel-row-text';
    const title = document.createElement('span');
    title.className = 'panel-row-title';
    title.textContent = item.title;
    const subtitle = document.createElement('span');
    subtitle.className = 'panel-row-subtitle';
    subtitle.textContent = item.subtitle || item.duration || '';
    text.appendChild(title);
    text.appendChild(subtitle);
    parent.appendChild(text);
}



function createPanelRow(item, index, opts = {}) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'panel-row';
    row.dataset.index = String(index);
    if (item.letter) row.dataset.letter = item.letter;
    if (item.kind === 'load-more') row.classList.add('load-more');
    if (item.kind === 'empty') row.classList.add('empty');
    if (opts.playing) row.classList.add('playing');
    appendRowContent(row, item);
    if (item.providerBadge) appendProviderBadge(row, item.providerBadge);
    return row;
}



function shouldShowBrowseInfoButton(item) {
    if (!item || item.kind === 'section' || item.kind === 'divider'
        || item.kind === 'empty' || item.kind === 'load-more') {
        return false;
    }
    if (item.key || item.letter) return false;
    return !!(item.uri || item.path || item.raw?.uri);
}



function supportsBrowseShuffle(item) {
    const mt = item?.mediaType;
    return ['artist', 'album', 'playlist', 'podcast', 'genre'].includes(mt) && !item?.isRadio;
}



function supportsBrowseRadioMode(item) {
    const mt = item?.mediaType;
    if (!['track', 'artist', 'album', 'playlist', 'genre'].includes(mt) || item?.isRadio) return false;
    // Only offer radio when a provider can actually generate it for this
    // item (similar-tracks/dynamic-radio support), so the action is
    // consistent everywhere instead of appearing for unsupported items.
    const raw = resolveBrowseItemRaw(item) || item;
    return uiH('seedSupportsAutoplay', raw);
}



function browseRadioModeLabel(item) {
    const labels = {
        track: 'Track Radio',
        artist: 'Artist Radio',
        album: 'Album Radio',
        playlist: 'Playlist Radio',
        genre: 'Genre Radio',
    };
    return labels[item?.mediaType] || 'Radio';
}



function supportsBrowsePlayback(item) {
    if (!item || item.kind === 'empty' || item.kind === 'load-more') return false;
    if (item.key || item.letter) return false;
    const mt = item.mediaType;
    if (item.isRadio || mt === 'radio') return true;
    if (['artist', 'album', 'playlist', 'podcast', 'track', 'audiobook',
        'podcast_episode', 'episode', 'genre'].includes(mt)) {
        return !!(item.uri || item.path || item.raw?.uri);
    }
    return !!(item.uri || item.path || item.raw?.uri) && item.kind === 'playable';
}




function getBrowseMenuActions(item, entry) {
    const actions = [];
    if (supportsBrowsePlayback(item)) {
        actions.push({ id: 'play', label: 'Play', icon: 'play-now.svg' });
    }
    if (supportsBrowseShuffle(item)) {
        actions.push({ id: 'shuffle', label: 'Shuffle', icon: 'shuffle_active.svg' });
    }
    uiH('getBrowseGoToTargets', item, entry).forEach((target) => actions.push(target));
    if (supportsDetailsItem(item)) {
        actions.push({ id: 'details', label: 'Details', icon: 'search.svg' });
    }
    const uri = item.uri || item.path || item.raw?.uri;
    const favTypes = ['track', 'artist', 'album', 'playlist', 'radio', 'audiobook', 'podcast', 'genre'];
    if (uri && favTypes.includes(item.mediaType)) {
        const favorited = !!(item.isFavorite || item.raw?.favorite);
        actions.push({
            id: favorited ? 'unfavorite' : 'favorite',
            label: favorited ? 'Unfavorite' : 'Favorite',
            icon: favorited ? 'favorited.svg' : 'not-favorited.svg',
        });
    }
    // Library membership is distinct from favoriting for radio: the radio
    // page is a library-only view, so offer explicit add/remove there.
    if (uri && item.mediaType === 'radio') {
        actions.push(uiH('radioItemInLibrary', item)
            ? { id: 'remove_from_library', label: 'Remove From Library', icon: 'close.svg' }
            : { id: 'add_to_library', label: 'Add To Library', icon: 'add.svg' });
    }
    if (supportsBrowsePlayback(item)) {
        actions.push(
            { id: 'queue_top', label: 'Queue (Top)', icon: 'queue-top.svg' },
            { id: 'queue_end', label: 'Queue (End)', icon: 'queue-bottom.svg' },
        );
    }
    if (supportsBrowseRadioMode(item)) {
        actions.push({
            id: 'radio_mode',
            label: browseRadioModeLabel(item),
            icon: 'radio.svg',
        });
    }
    return actions;
}



function getBrowseItemPreferredProvider(item, entry) {
    if (item?.providerBadge) return item.providerBadge;
    if (entry?.type === 'artist') {
        const fromChip = getArtistBrowseProvider();
        if (fromChip) return fromChip;
    }
    if (entry?.browseProviderId && entry.browseProviderId !== 'all' && uiH('browseChipOverridesProvider', entry, item)) {
        return entry.browseProviderId === 'library' ? 'library' : entry.browseProviderId;
    }
    if (entry?.activeArtistProvider) return entry.activeArtistProvider;
    const raw = resolveBrowseItemRaw(item);
    if (raw && (isInMaLibrary(raw) || uiH('isLocalLibraryItem', raw))) {
        return itemStoredProviderId(raw);
    }
    if (raw && uiH('inferMediaType', raw) === 'artist') {
        const ext = itemProviderId(raw);
        if (isSpotifyProvider(ext)) return ext;
    }
    return itemStoredProviderId(raw) || itemProviderId(raw) || null;
}



async function resolveBrowsePlaybackMedia(item, entry) {
    const raw = resolveBrowseItemRaw(item);
    const preferredProvider = getBrowseItemPreferredProvider(item, entry);
    const providerOpts = uiH('providerOptsForPreferred', preferredProvider);
    let resolved = raw ? await maClient.resolveMaItem(raw) : null;
    if (resolved && preferredProvider) {
        resolved = await maClient.resolveMaItemForProvider(resolved, preferredProvider);
    }
    const uri = resolved?.uri || item?.uri || item?.path || raw?.uri;
    return {
        raw: resolved || raw,
        uri,
        preferredProvider,
        media: resolved || uri,
        providerOpts,
    };
}



function resetPanelRowMenuPosition(menuEl) {
    menuEl.style.display = '';
    menuEl.style.visibility = '';
    menuEl.style.left = '';
    menuEl.style.top = '';
    menuEl.style.transform = '';
    menuEl.style.right = '';
}



function positionPanelRowMenu(anchorEl, menuEl) {
    menuEl.style.transform = 'none';
    menuEl.style.right = 'auto';
    const rect = anchorEl.getBoundingClientRect();
    const margin = 8;
    const pad = 12;
    const prevVisibility = menuEl.style.visibility;
    menuEl.style.visibility = 'hidden';
    const menuRect = menuEl.getBoundingClientRect();
    const menuW = menuRect.width;
    const menuH = menuRect.height;
    menuEl.style.visibility = prevVisibility;
    let left = rect.right - menuW;
    left = Math.max(pad, Math.min(left, window.innerWidth - menuW - pad));
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    let top = (spaceBelow >= menuH || spaceBelow >= spaceAbove)
        ? rect.bottom + margin
        : rect.top - menuH - margin;
    top = Math.max(pad, Math.min(top, window.innerHeight - menuH - pad));
    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;
}



function panelRowActionLabel(text) {
    if (!text) return '';
    return String(text).replace(/(^|[\s(+])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}



function renderPanelRowMenu(menuEl, actions, itemClass) {
    menuEl.innerHTML = '';
    const els = [];
    actions.forEach((action, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = itemClass;
        btn.dataset.actionIndex = String(index);
        btn.tabIndex = 0;
        btn.innerHTML = `<img src="icons/${action.icon}" alt=""><span>${panelRowActionLabel(action.label)}</span>`;
        menuEl.appendChild(btn);
        els.push(btn);
    });
    return els;
}



function bindBrowseRowInteraction(rowEl, rowIndex) {
    const activateAt = async (subFocus) => {
        state.panelFocusIndex = rowIndex;
        state.browseRowSubFocus = subFocus;
        uiH('updatePanelFocus');
        if (subFocus === 1) {
            openBrowseRowMenu(rowIndex);
            return;
        }
        await activateBrowseRow(rowIndex);
    };
    if (rowEl.classList.contains('panel-row-wrap')) {
        const main = rowEl.querySelector('[data-sub="main"]');
        const menuBtn = rowEl.querySelector('[data-sub="menu"]');
        if (main) {
            main.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                void activateAt(0);
            });
        }
        if (menuBtn) {
            menuBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                void activateAt(1);
            });
        }
    } else {
        rowEl.addEventListener('click', (e) => {
            e.preventDefault();
            void activateAt(0);
        });
    }
}



function createBrowseSectionHeader(item, rowIndex, itemIndex) {
    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'panel-section-header' + (item.collapsed ? ' collapsed' : '');
    header.dataset.index = String(rowIndex);
    header.dataset.itemIndex = String(itemIndex);
    const iconHtml = item.icon
        ? `<img class="panel-section-icon" src="icons/${item.icon}" alt="">`
        : '';
    header.innerHTML = `<img class="panel-section-chevron" src="icons/back.svg" alt="">`
        + iconHtml
        + `<span class="panel-section-title">${escapeHtml(item.title)}</span>`
        + `<span class="panel-section-count">${escapeHtml(item.subtitle || '')}</span>`;
    header.addEventListener('click', (e) => {
        e.preventDefault();
        state.panelFocusIndex = rowIndex;
        state.browseRowSubFocus = 0;
        uiH('updatePanelFocus');
        toggleDiscographySection(item.sectionKey);
    });
    return header;
}



function createBrowseRow(item, rowIndex, itemIndex) {
    if (item.kind === 'ma_disconnected') {
        return uiH('createMaConnectionStatusRow', item.subtitle || item.title || 'MA not connected');
    }
    if (item.kind === 'section') {
        return createBrowseSectionHeader(item, rowIndex, itemIndex);
    }
    if (shouldShowBrowseInfoButton(item)) {
        const wrap = document.createElement('div');
        wrap.className = 'panel-row-wrap';
        wrap.dataset.index = String(rowIndex);
        wrap.dataset.itemIndex = String(itemIndex);

        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'panel-row-main';
        main.dataset.sub = 'main';
        appendRowContent(main, item);

        const actions = document.createElement('div');
        actions.className = 'panel-row-actions';

        const menuAction = document.createElement('button');
        menuAction.type = 'button';
        menuAction.className = 'panel-row-action';
        menuAction.dataset.sub = 'menu';
        menuAction.setAttribute('aria-label', 'Item actions');
        menuAction.innerHTML = '<img src="icons/info.svg" alt="">';

        actions.appendChild(menuAction);
        wrap.appendChild(main);
        if (item.providerBadge) appendProviderBadge(wrap, item.providerBadge);
        wrap.appendChild(actions);
        bindBrowseRowInteraction(wrap, rowIndex);
        return wrap;
    }

    const row = createPanelRow(item, rowIndex);
    row.dataset.itemIndex = String(itemIndex);
    bindBrowseRowInteraction(row, rowIndex);
    return row;
}



function getBrowseRows() {
    return browseList.querySelectorAll(
        ':scope > .panel-row-wrap, :scope > .panel-row, :scope > .panel-section-header',
    );
}



function patchBrowseRow(rowEl, item, rowIndex, itemIndex) {
    rowEl.dataset.index = String(rowIndex);
    rowEl.dataset.itemIndex = String(itemIndex);
    rowEl.classList.toggle('load-more', item.kind === 'load-more');
    rowEl.classList.toggle('empty', item.kind === 'empty');
    const contentRoot = rowEl.classList.contains('panel-row-wrap')
        ? (rowEl.querySelector('.panel-row-main') || rowEl)
        : rowEl;
    const titleEl = contentRoot.querySelector('.panel-row-title');
    const subtitleEl = contentRoot.querySelector('.panel-row-subtitle');
    if (titleEl) titleEl.textContent = item.title;
    if (subtitleEl) subtitleEl.textContent = item.subtitle || item.duration || '';
}



function renderBrowsePanelNow() {
    const view = getBrowseView();
    const entry = getCurrentBrowseEntry();
    const layout = view.layout || 'list';
    const items = view.items || [];
    const hasDividers = items.some((item) => item.kind === 'divider' || item.kind === 'section');
    const contentSig = items
        .filter((item) => item.kind !== 'divider' && item.kind !== 'section')
        .slice(0, 4)
        .map((item) => item.uri || item.item_id || item.title)
        .join('\0');
    const renderKey = `${entry.key}|${layout}|${items.length}|${view.hasMore ? 1 : 0}|${contentSig}`;

    browsePanelTitle.textContent = view.title || entry.title || 'Browse';
    browsePanelHint.textContent = view.hint || '';
    syncBrowsePanelBack();
    browseList.classList.toggle('panel-alpha-grid', layout === 'alpha_grid');
    browseList.classList.toggle('panel-root-grid', layout === 'root_grid');

    const existingRows = Array.from(getBrowseRows());
    const layoutChanged = layout !== state._lastBrowseLayout;
    const sameEntry = state._lastBrowseRenderKey.startsWith(`${entry.key}|${layout}|`);

    // Alpha "list" views re-sort the whole item array on every page load,
    // so new items interleave into the middle rather than appending to the
    // end. Incremental append would leave stale rows and jumble the order,
    // so force a full (scroll-preserving) re-render for these.
    const isSortedAlphaList = isAlphaListEntry(entry) && entry.alphaViewMode === 'list';

    const needsFullListRender = entry.type === 'artist_letter'
        || entry.type === 'audiobook_letter'
        || entry.type === 'genre_letter'
        || entry.type === 'search_results';
    if (!needsFullListRender && !layoutChanged && !hasDividers
        && renderKey === state._lastBrowseRenderKey && existingRows.length > 0) {
        let rowIndex = 0;
        items.forEach((item, itemIndex) => {
            if (item.kind === 'divider' || item.kind === 'section') return;
            if (existingRows[rowIndex]) patchBrowseRow(existingRows[rowIndex], item, rowIndex, itemIndex);
            rowIndex += 1;
        });
        return;
    }

    const allowIncrementalAppend = !needsFullListRender && !isSortedAlphaList;
    if (allowIncrementalAppend && !layoutChanged && !hasDividers && sameEntry
        && existingRows.length > 0) {
        const dataRows = existingRows.filter((row) => !row.classList.contains('load-more'));
        if (dataRows.length > 0 && dataRows.length < items.length) {
            const loadMoreRow = existingRows.find((row) => row.classList.contains('load-more'));
            if (loadMoreRow) loadMoreRow.remove();
            let rowIndex = dataRows.length;
            for (let itemIndex = dataRows.length; itemIndex < items.length; itemIndex += 1) {
                const item = items[itemIndex];
                if (item.kind === 'divider' || item.kind === 'section') continue;
                browseList.appendChild(createBrowseRow(item, rowIndex, itemIndex));
                rowIndex += 1;
            }
            if (view.hasMore) {
                browseList.appendChild(createBrowseRow({
                    title: 'Load more',
                    subtitle: state.browseListLoading ? 'Loading…' : 'Show more items',
                    kind: 'load-more',
                    icon: 'add.svg',
                }, rowIndex, items.length));
            }
            state._lastBrowseRenderKey = renderKey;
            state._lastBrowseLayout = layout;
            uiH('updatePanelFocus');
            return;
        }
    }

    const preserveScroll = sameEntry && !layoutChanged;
    const savedScrollTop = preserveScroll ? browseList.scrollTop : 0;
    browseList.innerHTML = '';
    let rowIndex = 0;
    items.forEach((item, itemIndex) => {
        if (item.kind === 'divider') {
            const divider = document.createElement('div');
            divider.className = 'panel-divider';
            divider.textContent = item.title;
            browseList.appendChild(divider);
            return;
        }
        browseList.appendChild(createBrowseRow(item, rowIndex, itemIndex));
        rowIndex += 1;
    });
    if (view.hasMore) {
        browseList.appendChild(createBrowseRow({
            title: 'Load more',
            subtitle: state.browseListLoading ? 'Loading…' : 'Show more items',
            kind: 'load-more',
            icon: 'add.svg',
        }, rowIndex, items.length));
    }
    if (preserveScroll) browseList.scrollTop = savedScrollTop;
    state._lastBrowseRenderKey = renderKey;
    state._lastBrowseLayout = layout;
    uiH('updatePanelFocus');
}



function renderBrowsePanel(immediate = false) {
    if (immediate) {
        if (state._browseRenderRaf) {
            cancelAnimationFrame(state._browseRenderRaf);
            state._browseRenderRaf = 0;
        }
        renderBrowsePanelNow();
        return;
    }
    if (state._browseRenderRaf) return;
    state._browseRenderRaf = requestAnimationFrame(() => {
        state._browseRenderRaf = 0;
        renderBrowsePanelNow();
    });
}



function getBrowseItemForRow(rowIndex) {
    const row = getBrowseRows()[rowIndex];
    if (!row) return null;
    const view = getBrowseView();
    return view.items[Number(row.dataset.itemIndex)];
}



function getBrowseRowSubTargets(rowEl) {
    if (!rowEl) return [];
    if (rowEl.classList.contains('panel-row-wrap')) {
        return [
            rowEl.querySelector('[data-sub="main"]'),
            rowEl.querySelector('[data-sub="menu"]'),
        ].filter(Boolean);
    }
    return [rowEl];
}



async function startRadioForMedia(media) {
    if (!media) return;
    const uri = media.uri || media.media_item?.uri;
    if (!uri) return;
    const resolved = await maClient.resolvePlayUri(uri).catch(() => uri);
    await maClient.playMediaWithOption(resolved, { option: 'replace', radio_mode: true });
    uiH('showUI');
}



function renderBrowseRowMenu(actions) {
    state.browseMenuActionEls = renderPanelRowMenu(browseRowMenu, actions, 'browse-row-menu-item');
    state.browseMenuActions = actions;
    state.browseMenuActionEls.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.browseMenuFocusIndex = index;
            void activateBrowseMenuItem();
        });
    });
}



function closeBrowseRowMenu() {
    if (!state.browseRowMenuOpen) return;
    state.browseRowMenuOpen = false;
    state.browseRowMenuIndex = -1;
    state.browseRowMenuItem = null;
    state.browseMenuFocusIndex = 0;
    state.browseMenuActions = [];
    state.browseMenuActionEls = [];
    browseRowMenu.classList.remove('open');
    browseRowMenu.setAttribute('aria-hidden', 'true');
    browseRowMenu.innerHTML = '';
    resetPanelRowMenuPosition(browseRowMenu);
    uiH('updatePanelFocus');
}



async function openBrowseRowMenu(index) {
    const rows = getBrowseRows();
    const row = rows[index];
    if (!row || row.classList.contains('load-more')) return;
    let item = getBrowseItemForRow(index);
    if (!item) return;
    const entry = getCurrentBrowseEntry();
    item = await uiH('enrichBrowseItemForGoTo', item);
    let actions = getBrowseMenuActions(item, entry);
    if (!actions.length) return;
    if (state.browseRowMenuOpen && state.browseRowMenuIndex === index) {
        uiH('closeBrowseRowMenu');
        return;
    }
    uiH('closeBrowseRowMenu');
    state.browseRowMenuIndex = index;
    state.browseRowMenuItem = item;
    state.browseMenuFocusIndex = 0;
    state.browseRowMenuOpen = true;
    renderBrowseRowMenu(actions);
    browseRowMenu.classList.add('open');
    browseRowMenu.setAttribute('aria-hidden', 'false');
    positionPanelRowMenu(row, browseRowMenu);
    uiH('updatePanelFocus');

    const rawMedia = resolveBrowseItemRaw(item) || item.raw || item;
    const menuGen = (state._browseExtrasMenuGen = (state._browseExtrasMenuGen || 0) + 1);
    void uiH('warmTrackExtrasCache', rawMedia).then(() => {
        if (menuGen !== state._browseExtrasMenuGen) return;
        if (!state.browseRowMenuOpen || state.browseRowMenuIndex !== index) return;
        const updated = getBrowseMenuActions(item, entry);
        const prevIds = (state.browseMenuActions || []).map((a) => a.id).join('\0');
        const nextIds = updated.map((a) => a.id).join('\0');
        if (prevIds === nextIds) return;
        state.browseMenuFocusIndex = Math.min(state.browseMenuFocusIndex, updated.length - 1);
        renderBrowseRowMenu(updated);
        uiH('updatePanelFocus');
    });
}



function moveBrowseMenuFocus(delta) {
    let idx = state.browseMenuFocusIndex + delta;
    while (idx >= 0 && idx < state.browseMenuActionEls.length) {
        state.browseMenuFocusIndex = idx;
        uiH('updatePanelFocus');
        return;
    }
}



async function toggleBrowseFavorite(item) {
    const uri = item.uri || item.path || item.raw?.uri;
    if (!uri) return;
    const favorited = !!(item.isFavorite || item.raw?.favorite);
    try {
        await maClient.ensureReady();
        if (favorited) {
            let libItem = item.raw;
            if (!libItem?.item_id || !libItem?.media_type) {
                libItem = await maClient.send('music/item_by_uri', { uri });
            }
            await maClient.removeFavorite(libItem || uri);
            item.isFavorite = false;
            if (item.raw) item.raw.favorite = false;
        } else {
            await maClient.addFavorite(uri);
            item.isFavorite = true;
            if (item.raw) item.raw.favorite = true;
        }
        state.favoritesListCache = null;
        uiH('closeBrowseRowMenu');
        const entry = getCurrentBrowseEntry();
        if (entry?.key === 'favorites') {
            await loadCurrentBrowseView();
        } else if (entry && entrySupportsContainerActions(entry)) {
            renderContainerActionsBar(entry);
        }
    } catch (err) {
        console.warn('toggle favorite failed:', err);
        uiH('setStatus', 'favorite update failed', 'error');
    }
}



async function toggleRadioLibrary(item) {
    const uri = item.uri || item.path || item.raw?.uri;
    if (!uri) return;
    const inLibrary = uiH('radioItemInLibrary', item);
    try {
        await maClient.ensureReady();
        if (inLibrary) {
            await maClient.removeFromLibrary(item.raw || uri);
        } else {
            await maClient.addToLibrary(uri);
        }
        item._radioInLibrary = !inLibrary;
        if (item.raw) item.raw._radioInLibrary = !inLibrary;
        state.radioMergedCatalogCache.clear();
        state.radioCatalogCache.clear();
        state.favoritesListCache = null;
        uiH('closeBrowseRowMenu');
        const entry = getCurrentBrowseEntry();
        if (entry?.key === 'radio') {
            delete state.browseViews[entry.key];
            const orderIdx = state._browseViewOrder.indexOf(entry.key);
            if (orderIdx >= 0) state._browseViewOrder.splice(orderIdx, 1);
            state._lastBrowseRenderKey = '';
            await renderBrowseProviderBar(entry);
            if (isBrowsePageable(entry)) await loadBrowsePage(true);
            else await loadCurrentBrowseView();
        } else if (entry?.key === 'favorites') {
            await loadCurrentBrowseView();
        }
        uiH('setStatus', inLibrary ? 'Removed from library' : 'Added to library', 'connected');
    } catch (err) {
        console.warn('radio library update failed:', err);
        uiH('setStatus', 'library update failed', 'error');
    }
}



async function reloadCurrentBrowseView() {
    const entry = getCurrentBrowseEntry();
    if (!entry) return;
    delete state.browseViews[entry.key];
    const orderIdx = state._browseViewOrder.indexOf(entry.key);
    if (orderIdx >= 0) state._browseViewOrder.splice(orderIdx, 1);
    state._lastBrowseRenderKey = '';
    if (isBrowsePageable(entry)) await loadBrowsePage(true);
    else await loadCurrentBrowseView();
}



async function executeBrowseMenuAction(action, item, entry) {
    if (!action || !item) return;
    const entryCtx = entry || getCurrentBrowseEntry();
    const playbackActions = new Set([
        'play', 'shuffle', 'queue_top', 'queue_end', 'radio_mode',
    ]);
    try {
        if (action.id === 'play') {
            await executeBrowsePlayback(item, { queueOption: 'replace' });
        } else if (action.id === 'shuffle') {
            await executeBrowsePlayback(item, { shuffle: true, queueOption: 'replace' });
        } else if (action.id === 'go_artist') {
            const media = await uiH('resolveBrowseGoToNavigationMedia', action.id, item, entryCtx);
            if (!media) {
                uiH('setStatus', 'artist not found', 'error');
                return;
            }
            await uiH('navigateBrowseToArtist', media);
        } else if (action.id === 'go_album') {
            const media = await uiH('resolveBrowseGoToNavigationMedia', action.id, item, entryCtx);
            if (!media) {
                uiH('setStatus', 'album not found', 'error');
                return;
            }
            await uiH('navigateBrowseToAlbum', media);
        } else if (action.id === 'go_podcast') {
            const media = await uiH('resolveBrowseGoToNavigationMedia', action.id, item, entryCtx);
            if (!media) {
                uiH('setStatus', 'podcast not found', 'error');
                return;
            }
            await uiH('navigateBrowseToPodcast', media);
        } else if (action.id === 'go_playlist') {
            const media = await uiH('resolveBrowseGoToNavigationMedia', action.id, item, entryCtx);
            if (!media) {
                uiH('setStatus', 'playlist not found', 'error');
                return;
            }
            await uiH('navigateBrowseToPlaylist', media);
        } else if (action.id === 'go_other_versions' || action.id === 'go_similar_tracks') {
            const raw = resolveBrowseItemRaw(item) || item.raw || item;
            await uiH('handleTrackExtrasGoTo', action.id, raw);
        } else if (action.id === 'favorite' || action.id === 'unfavorite') {
            await toggleBrowseFavorite(item);
        } else if (action.id === 'add_to_library' || action.id === 'remove_from_library') {
            await toggleRadioLibrary(item);
        } else if (action.id === 'queue_top') {
            await executeBrowsePlayback(item, { queueOption: 'next' });
            markContainerActionQueued('queue_top');
        } else if (action.id === 'queue_end') {
            await executeBrowsePlayback(item, { queueOption: 'add' });
            markContainerActionQueued('queue_end');
        } else if (action.id === 'radio_mode') {
            await executeBrowsePlayback(item, { queueOption: 'replace', radioMode: true });
        } else if (action.id === 'save_track_collection') {
            await uiH('saveTrackCollectionAsPlaylist', entryCtx);
        } else if (action.id === 'details') {
            uiH('closeBrowseRowMenu');
            const raw = resolveBrowseItemRaw(item) || item;
            await openDetailsPanel(raw);
        }
    } catch (err) {
        console.warn('browse menu action failed:', err);
        if (playbackActions.has(action.id) && !String(err?.message || '').includes('playlist')) {
            uiH('setStatus', 'action failed — try again', 'error');
        }
        if (playbackActions.has(action.id)) await uiH('recoverMaPlayback');
    }
}



async function activateBrowseMenuItem() {
    const action = state.browseMenuActions[state.browseMenuFocusIndex];
    const item = state.browseRowMenuItem || getBrowseItemForRow(state.browseRowMenuIndex);
    if (!action || !item) return;
    const entry = getCurrentBrowseEntry();
    uiH('closeBrowseRowMenu');
    await executeBrowseMenuAction(action, item, entry);
}



function getArtistBrowseProvider() {
    for (let i = state.browseStack.length - 1; i >= 0; i -= 1) {
        const e = state.browseStack[i];
        if (e.type === 'artist' && e.artistProviders?.length) {
            const idx = e.selectedProviderIndex || 0;
            return e.artistProviders[idx]?.provider || null;
        }
    }
    return null;
}



async function openBrowseItem(item) {
    if (!item) return;
    if (item.letter) {
        const isAudiobook = item.alphaType === 'audiobook' || item.subtitle === 'Audiobooks';
        const isGenre = item.alphaType === 'genre' || item.subtitle === 'Genres';
        const parent = getCurrentBrowseEntry();
        let letterEntry;
        if (isGenre) {
            letterEntry = {
                key: `genres-${item.letter}`,
                title: item.title,
                type: 'genre_letter',
                letter: item.letter,
                browseProviderId: parent?.browseProviderId,
            };
        } else if (isAudiobook) {
            letterEntry = {
                key: `audiobooks-${item.letter}`,
                title: item.title,
                type: 'audiobook_letter',
                letter: item.letter,
                browseProviderId: parent?.browseProviderId,
            };
        } else {
            letterEntry = {
                key: `artists-${item.letter}`,
                title: item.title,
                type: 'artist_letter',
                letter: item.letter,
                browseProviderId: parent?.browseProviderId,
            };
        }
        state.browseStack.push(letterEntry);
        await loadCurrentBrowseView();
        return;
    }
    if (item.key) {
        const shortcut = BROWSE_ROOT_SHORTCUTS.find((s) => s.key === item.key);
        const savedProvider = loadBrowseProviderPrefs()[item.key];
        state.browseStack.push({
            key: item.key,
            title: shortcut?.title || item.title,
            type: 'shortcut',
            ...(savedProvider ? { browseProviderId: savedProvider } : {}),
        });
        await loadCurrentBrowseView();
        return;
    }
    const raw = resolveBrowseItemRaw(item);
    if (raw) {
        await maClient.ensureReady();
        const preferredProvider = item.providerBadge || null;
        let resolved = await maClient.resolveMaItem(raw);
        if (preferredProvider) {
            resolved = await maClient.resolveMaItemForProvider(resolved, preferredProvider);
        }
        const mt = item.mediaType || uiH('inferMediaType', resolved);
        if (mt === 'artist') {
            state.browseStack.push({
                key: item.uri || item.path,
                title: item.title,
                type: 'artist',
                item: resolved,
                preferredProvider,
            });
            await loadCurrentBrowseView();
            return;
        }
        if (mt === 'album') {
            const activeArtistProvider = getArtistBrowseProvider();
            state.browseStack.push({
                key: item.uri || item.path,
                title: item.title,
                type: 'album',
                item: resolved,
                activeArtistProvider,
            });
            await loadCurrentBrowseView();
            return;
        }
        if (mt === 'playlist') {
            state.browseStack.push({
                key: item.uri || item.path,
                title: item.title,
                type: 'playlist',
                item: resolved,
            });
            await loadCurrentBrowseView();
            return;
        }
        if (mt === 'podcast') {
            state.browseStack.push({
                key: item.uri || item.path,
                title: item.title,
                type: 'podcast',
                item: resolved,
            });
            await loadCurrentBrowseView();
            return;
        }
        if (mt === 'genre') {
            state.browseStack.push({
                key: item.uri || item.path,
                title: item.title,
                type: 'genre',
                item: resolved,
            });
            await loadCurrentBrowseView();
            return;
        }
        if (mt === 'folder' || item.path) {
            state.browseStack.push({
                key: item.path || item.uri,
                title: item.title,
                type: 'browse',
                path: item.path || item.uri,
            });
            await loadCurrentBrowseView();
            return;
        }
    }
}



async function enqueueContainerTracks(raw, providerOpts, queueOption, shuffle = false) {
    const opts = {
        ...providerOpts,
        ...uiH('providerOptsForPreferred', providerOpts?.preferredProvider),
    };
    const mt = uiH('inferMediaType', raw);
    const containerUri = raw?.uri || raw?.path || '';
    const tracks = mt === 'playlist'
        ? await maClient.playlistTracks(raw, opts)
        : await maClient.albumTracks(raw, opts);
    const pref = opts.preferredProvider;
    let uris = await uiH('collectProviderTrackUris', tracks, pref, opts);
    if (!uris.length && containerUri) {
        await maClient.playMediaWithOption(containerUri, {
            option: queueOption,
            shuffle: shuffle || undefined,
        });
        return;
    }
    if (!uris.length) throw new Error('container has no tracks for selected provider');
    await maClient.playMediaWithOption(uris, {
        option: queueOption,
        shuffle: shuffle || undefined,
    });
}



async function enqueueArtistTracks(raw, providerOpts, queueOption, shuffle = false) {
    const opts = {
        ...providerOpts,
        ...uiH('providerOptsForPreferred', providerOpts?.preferredProvider),
    };
    const merged = { ...opts, ...uiH('providerOptsForPreferred', opts.preferredProvider) };
    const albums = await maClient.artistAlbums(raw, merged);
    if (!albums.length) throw new Error('artist has no albums');
    const sorted = [...albums].sort((a, b) => {
        const ya = Number(a.year ?? a.metadata?.year) || 9999;
        const yb = Number(b.year ?? b.metadata?.year) || 9999;
        return ya - yb;
    });
    const pref = merged.preferredProvider;
    const uris = [];
    for (const album of sorted) {
        try {
            const tracks = await maClient.albumTracks(album, merged);
            uris.push(...await uiH('collectProviderTrackUris', tracks, pref, merged));
        } catch (err) {
            console.warn('artist album tracks failed:', album?.name, err);
        }
    }
    if (!uris.length) throw new Error('artist has no tracks for selected provider');
    await maClient.playMediaWithOption(uris, {
        option: queueOption,
        shuffle: shuffle || undefined,
    });
}



async function ensureOrderedPlaybackMode(requestedShuffle) {
    if (requestedShuffle || !state.shuffleEnabled) return;
    await maClient.setShuffle(false);
    state.shuffleEnabled = false;
    uiH('updateModeButtons');
}



async function playTrackInContext(item, entry, opts = {}) {
    const playback = await resolveBrowsePlaybackMedia(item, entry);
    const pref = playback.providerOpts?.preferredProvider;
    const trackUri = uiH('uriForProvider', playback.raw || item.raw || item, pref)
        || item.uri || item.raw?.uri || playback.uri;
    if (entry?.title && opts.queueOption === 'replace') rememberQueueContext(entry.title);
    const isTrackList = entry?.type === 'playlist'
        || entry?.type === 'track_versions'
        || entry?.type === 'similar_tracks';
    if (isTrackList && !opts.radioMode) {
        try {
            await maClient.ensureReady();
            const queueOption = opts.queueOption || 'replace';
            const providerOpts = playback.providerOpts || uiH('providerOptsForPreferred', pref);
            const tracks = await uiH('loadPlaylistTracksForPlayback', 
                entry.item,
                item,
                entry,
                providerOpts,
            );
            const uris = await uiH('collectPlaylistPlaybackUris', tracks, pref, providerOpts);
            if (!uris.length) throw new Error('playlist has no playable tracks');
            const startIdx = findPlaylistTrackIndex(tracks, item, uris);
            const startUri = startIdx >= 0 ? uris[startIdx] : trackUri;
            if (!opts.shuffle && !opts.radioMode) {
                await ensureOrderedPlaybackMode(false);
            }
            if (queueOption === 'next' || queueOption === 'add') {
                await maClient.playMediaWithOption(startUri, {
                    option: queueOption,
                    shuffle: opts.shuffle,
                    radio_mode: opts.radioMode,
                });
            } else if (opts.shuffle) {
                await maClient.playMediaWithOption(uris, {
                    option: 'replace',
                    shuffle: true,
                });
            } else {
                const startItem = resolveMaStartItem(item, tracks) || trackUri;
                let playlistMedia = entry.item;
                if (playlistMedia?.item_id) {
                    try {
                        playlistMedia = await maClient.resolveMaItem(playlistMedia) || playlistMedia;
                    } catch (err) {
                        console.warn('resolve playlist for playback failed:', err);
                    }
                }
                await maClient.playMediaWithOption(playlistMedia || entry.item?.uri, {
                    option: 'replace',
                    start_item: startItem,
                });
            }
            if (opts.queueOption === 'replace') {
                uiH('showUI');
                await uiH('afterMaPlayback');
            }
            return;
        } catch (err) {
            console.warn('playlist track playback failed, trying parent context:', err);
        }
    }
    let parent = entry?.item ? await maClient.resolveMaItem(entry.item) : null;
    if (parent && entry?.activeArtistProvider) {
        parent = await maClient.resolveMaItemForProvider(parent, entry.activeArtistProvider);
    }
    const parentMedia = parent || entry?.item;
    const parentUri = parentMedia?.uri || entry?.item?.uri || entry?.item?.path;
    if (!trackUri || !parentUri) {
        await executeBrowsePlayback(item, opts);
        return;
    }
    try {
        await maClient.ensureReady();
        const queueOption = opts.queueOption || 'replace';
        if (!opts.shuffle && !opts.radioMode) {
            await ensureOrderedPlaybackMode(false);
        }
        let startItem = trackUri;
        if (entry?.type === 'album') {
            try {
                const albumTracks = await maClient.albumTracks(parentMedia || entry.item, playback.providerOpts);
                startItem = resolveMaStartItem(item, albumTracks) || trackUri;
            } catch (err) {
                console.warn('album track resolve for playback failed:', err);
            }
        } else if ((entry?.type === 'playlist' || uiH('isTrackCollectionEntry', entry))
            && entry._playlistTracksCache?.length) {
            startItem = resolveMaStartItem(item, entry._playlistTracksCache) || trackUri;
        }
        if (queueOption === 'next' || queueOption === 'add') {
            await maClient.playMediaWithOption(trackUri, {
                option: queueOption,
                shuffle: opts.shuffle,
                radio_mode: opts.radioMode,
            });
        } else {
            await maClient.playMediaWithOption(parentMedia || parentUri, {
                option: queueOption,
                start_item: startItem,
                shuffle: opts.shuffle,
                radio_mode: opts.radioMode,
            });
        }
        if (opts.queueOption === 'replace') {
            uiH('showUI');
            await uiH('afterMaPlayback');
        }
    } catch (err) {
        console.warn('play track in context failed:', err);
    }
}



async function playPodcastShowBrowse(item, opts = {}) {
    const entry = getCurrentBrowseEntry();
    const playback = await resolveBrowsePlaybackMedia(item, entry);
    const raw = playback.raw;
    const showMedia = playback.media;
    const showUri = playback.uri;
    if (!showUri || !raw) throw new Error('podcast has no uri');
    if (opts.queueOption === 'replace') rememberQueueContext(item.title);
    await maClient.ensureReady();
    if (opts.radioMode) {
        await maClient.playMediaWithOption(showMedia || showUri, {
            option: opts.queueOption || 'replace',
            radio_mode: true,
        });
        return;
    }
    const episodes = await maClient.podcastEpisodes(raw, { limit: 500, ...playback.providerOpts });
    const sorted = sortPodcastEpisodes(episodes);
    if (!sorted.length) throw new Error('podcast has no episodes');
    if (opts.shuffle) {
        await maClient.playMediaWithOption(showMedia || showUri, {
            option: opts.queueOption || 'replace',
            shuffle: true,
        });
        return;
    }
    const newest = sorted[0];
    await maClient.playMediaWithOption(showMedia || showUri, {
        option: opts.queueOption || 'replace',
        start_item: newest.uri,
    });
}



async function executeBrowsePlayback(item, opts = {}) {
    const {
        shuffle = false,
        queueOption = 'replace',
        radioMode = false,
    } = opts;
    try {
        await maClient.ensureReady();
        if (!shuffle && !radioMode
            && (queueOption === 'replace' || queueOption === 'next' || queueOption === 'add')) {
            await ensureOrderedPlaybackMode(false);
        }
        const entry = getCurrentBrowseEntry();
        const playback = await resolveBrowsePlaybackMedia(item, entry);
        const raw = playback.raw;
        const media = playback.media;
        const uri = playback.uri;
        const providerOpts = playback.providerOpts;
        if (queueOption === 'replace' && !radioMode
            && (['artist', 'album', 'playlist', 'podcast', 'genre'].includes(item.mediaType) || item.isRadio)) {
            rememberQueueContext(item.title);
        }
        if (item.mediaType === 'track' && item.uri
            && (entry?.type === 'album' || entry?.type === 'playlist' || entry?.type === 'podcast'
                || entry?.type === 'track_versions' || entry?.type === 'similar_tracks')
            && !uiH('isPodcastShow', raw || item) && !radioMode) {
            await playTrackInContext(item, entry, opts);
            return;
        }
        if (uiH('isPodcastShow', raw || item)) {
            await playPodcastShowBrowse(item, opts);
            if (queueOption === 'replace') {
                uiH('showUI');
                await uiH('afterMaPlayback');
            }
            return;
        }
        if (item.isRadio || item.mediaType === 'radio') {
            if (queueOption === 'replace' && !radioMode) {
                await maClient.playStation(item);
            } else {
                if (!uri) return;
                await maClient.playMediaWithOption(media || uri, {
                    option: queueOption,
                    radio_mode: radioMode,
                });
            }
            if (queueOption === 'replace') {
                uiH('showUI');
                await uiH('afterMaPlayback');
            }
            return;
        }
        if (item.mediaType === 'artist' && raw) {
            if (radioMode) {
                await maClient.playMediaWithOption(media || raw.uri, {
                    option: queueOption,
                    radio_mode: true,
                });
            } else {
                await enqueueArtistTracks(raw, providerOpts, queueOption, shuffle);
            }
            if (queueOption === 'replace') {
                uiH('showUI');
                await uiH('afterMaPlayback');
            }
            return;
        }
        if (item.mediaType === 'playlist' && raw) {
            if (radioMode) {
                await maClient.playMediaWithOption(media || uri, {
                    option: queueOption,
                    radio_mode: true,
                });
            } else if (uiH('isTrackCollectionEntry', entry)) {
                const tracks = entry._playlistTracksCache || [];
                const uris = await uiH('collectPlaylistPlaybackUris', tracks, providerOpts?.preferredProvider, providerOpts);
                if (!uris.length) throw new Error('collection has no playable tracks');
                if (queueOption === 'next' || queueOption === 'add') {
                    await maClient.playMediaWithOption(uris, {
                        option: queueOption,
                        shuffle: shuffle || undefined,
                    });
                } else if (shuffle) {
                    await maClient.playMediaWithOption(uris, {
                        option: 'replace',
                        shuffle: true,
                    });
                } else {
                    await maClient.playMediaWithOption(uris, {
                        option: 'replace',
                    });
                }
            } else if (shuffle && queueOption === 'replace') {
                await uiH('playPlaylistFromBrowse', item, true);
            } else if (queueOption === 'replace' && !shuffle) {
                await uiH('playPlaylistFromBrowse', item, false);
            } else if (queueOption === 'next' || queueOption === 'add') {
                await enqueueContainerTracks(raw, providerOpts, queueOption, shuffle);
            } else {
                await maClient.playMediaWithOption(media || uri, {
                    option: queueOption,
                    shuffle,
                });
            }
            if (queueOption === 'replace') {
                uiH('showUI');
                await uiH('afterMaPlayback');
            }
            return;
        }
        if (item.mediaType === 'genre' && raw) {
            const entry = getCurrentBrowseEntry();
            const filteredUris = entry?.type === 'genre' ? collectGenrePlaybackUris(entry) : [];
            if (filteredUris.length) {
                if (shuffle && queueOption === 'replace') {
                    await maClient.setShuffle(true);
                    await maClient.playMedia(filteredUris, { option: 'replace', radio_mode: false });
                } else {
                    await maClient.playMediaWithOption(filteredUris, {
                        option: queueOption,
                        shuffle: shuffle || undefined,
                    });
                }
                if (queueOption === 'replace') {
                    uiH('showUI');
                    await uiH('afterMaPlayback');
                }
                return;
            }
            if (radioMode) {
                await maClient.playMediaWithOption(media || uri, {
                    option: queueOption,
                    radio_mode: true,
                });
            } else if (shuffle && queueOption === 'replace') {
                await maClient.setShuffle(true);
                await maClient.playMedia(media || uri, { option: 'replace', radio_mode: false });
            } else {
                await maClient.playMediaWithOption(media || uri, {
                    option: queueOption,
                    shuffle: shuffle || undefined,
                });
            }
            if (queueOption === 'replace') {
                uiH('showUI');
                await uiH('afterMaPlayback');
            }
            return;
        }
        if (item.mediaType === 'album' && raw) {
            if (!uri) return;
            if (radioMode) {
                await maClient.playMediaWithOption(media || uri, {
                    option: queueOption,
                    radio_mode: true,
                });
            } else if (shuffle && queueOption === 'replace') {
                await maClient.setShuffle(true);
                await maClient.playMedia(media || uri, { option: 'replace', radio_mode: false });
            } else if (queueOption === 'replace' && !shuffle) {
                try {
                    const tracks = await maClient.albumTracks(raw, providerOpts);
                    const first = tracks[0];
                    if (first?.uri) {
                        await maClient.playMediaOrdered(media || uri, { start_item: first.uri });
                    } else {
                        await maClient.playMediaOrdered(media || uri);
                    }
                } catch (err) {
                    await maClient.playMediaOrdered(media || uri);
                }
            } else if (queueOption === 'next' || queueOption === 'add') {
                await enqueueContainerTracks(raw, providerOpts, queueOption, shuffle);
            } else {
                await maClient.playMediaWithOption(media || uri, {
                    option: queueOption,
                    shuffle,
                });
            }
            if (queueOption === 'replace') {
                uiH('showUI');
                await uiH('afterMaPlayback');
            }
            return;
        }
        const playUri = uri || item?.uri || item?.path || item?.raw?.uri;
        if (!playUri) return;
        if (radioMode) {
            await maClient.playMediaWithOption(media || playUri, {
                option: queueOption,
                radio_mode: true,
            });
        } else if (shuffle && queueOption === 'replace') {
            await maClient.setShuffle(true);
            await maClient.playMedia(media || playUri, { option: 'replace', radio_mode: false });
        } else {
            await maClient.playMediaWithOption(media || playUri, {
                option: queueOption,
                shuffle: shuffle || undefined,
            });
        }
        if (queueOption === 'replace') {
            uiH('showUI');
            await uiH('afterMaPlayback');
        }
    } catch (err) {
        console.warn('play media failed:', err);
        const playerName = getDefaultPlayerName();
        if (!String(err?.message || '').includes('playlist')) {
            uiH('setStatus', 'playback failed — try again', 'error');
            window.setTimeout(() => {
                uiH('setStatus', `connected · ${playerName}`, getShowConnection() ? 'connected' : '');
            }, 4000);
        }
        await uiH('recoverMaPlayback');
    }
}



async function playBrowseItem(item, shuffle = false) {
    await executeBrowsePlayback(item, { shuffle, queueOption: 'replace' });
}



async function activateBrowseRow(index) {
    const row = getBrowseRows()[index];
    if (row?.classList.contains('load-more')) {
        const entry = getCurrentBrowseEntry();
        if (entry?.type === 'similar_tracks') {
            entry._similarFetchLimit = (entry._similarFetchLimit || 20) + 20;
            entry._playlistTracksCache = null;
            entry._similarLastFetchLimit = 0;
            delete state.browseViews[entry.key];
            await loadCurrentBrowseView();
            return;
        }
        await loadBrowsePage(false);
        return;
    }

    const item = getBrowseItemForRow(index);
    if (!item || item.kind === 'divider' || item.kind === 'empty') return;
    if (item.kind === 'section') {
        toggleDiscographySection(item.sectionKey);
        return;
    }

    if (item.title === '..' || resolveBrowseItemRaw(item)?.name === '..') {
        browseBack();
        return;
    }

    const hasActions = row?.classList.contains('panel-row-wrap');

    if (hasActions && state.browseRowSubFocus === 1) {
        openBrowseRowMenu(index);
        return;
    }

    if (item.kind === 'nav' || uiH('isPodcastShow', resolveBrowseItemRaw(item))) {
        await openBrowseItem(item);
        return;
    }

    const entry = getCurrentBrowseEntry();
    if (item.uri && (entry.type === 'album' || entry.type === 'playlist' || entry.type === 'podcast'
        || entry.type === 'track_versions' || entry.type === 'similar_tracks')) {
        await playTrackInContext(item, entry);
        return;
    }

    if (item.uri) {
        await playBrowseItem(item, false);
    }
}



function moveBrowseRowSubFocus(delta) {
    const row = getBrowseRows()[state.panelFocusIndex];
    if (!row?.classList.contains('panel-row-wrap')) return false;
    const max = 1;
    state.browseRowSubFocus = Math.max(0, Math.min(state.browseRowSubFocus + delta, max));
    uiH('updatePanelFocus');
    return true;
}



function moveArtistProviderFocus(delta) {
    const bar = document.getElementById('browse-artist-providers');
    if (!bar || !bar.children.length) return;
    state.artistProviderFocusIndex = Math.max(0, Math.min(
        state.artistProviderFocusIndex + delta,
        bar.children.length - 1,
    ));
    updateArtistProviderFocus();
}



function moveAlphaViewFocus(delta) {
    const bar = document.getElementById('browse-alpha-view-bar');
    if (!bar || !bar.children.length) return;
    state.alphaViewFocusIndex = Math.max(0, Math.min(
        state.alphaViewFocusIndex + delta,
        bar.children.length - 1,
    ));
    updateAlphaViewFocus();
}



function syncBrowsePanelBack() {
    if (!browsePanelBackBtn) return;
    const entry = getCurrentBrowseEntry();
    const showBack = state.browseStack.length > 1
        || uiH('isTrackCollectionEntry', entry);
    browsePanelBackBtn.hidden = !showBack;
}



function browseBack() {
    if (state.providerMenuOpen) {
        closeProviderMenu();
        return;
    }
    if (state.browseRowMenuOpen) {
        uiH('closeBrowseRowMenu');
        return;
    }
    if (state.browseStack.length <= 1 && uiH('isTrackCollectionEntry', getCurrentBrowseEntry())) {
        closeBrowsePanel();
        return;
    }
    if (state.browseStack.length > 1) {
        state.browseStack.pop();
        state.panelFocusIndex = 0;
        state.browseRowSubFocus = 0;
        const entry = getCurrentBrowseEntry();
        const isSearch = entry.type === 'shortcut' && entry.key === 'search';
        if (!isBrowseSearchActive()) state._browseSearchGeneration += 1;
        syncBrowsePanelBack();
        syncBrowseSearchChrome();
        state.browseFocusZone = isSearch ? 'input' : 'list';
        if (entry.type !== 'artist' && state.browseFocusZone === 'artist_providers') {
            state.browseFocusZone = 'list';
        }
        if (!entrySupportsContainerActions(entry) && state.browseFocusZone === 'container_actions') {
            state.browseFocusZone = 'list';
        }
        syncSearchInputValue();
        if (state.browseViews[entry.key]) {
            renderBrowsePanel(true);
            const backEntry = getCurrentBrowseEntry();
            if (isAlphaListEntry(backEntry)) {
                renderAlphaViewBar(backEntry);
            } else {
                hideAlphaViewBar();
            }
            if (entrySupportsBrowseProviders(backEntry)) {
                void renderBrowseProviderBar(backEntry);
                hideContainerActionsBar();
            } else if (backEntry.type === 'artist') {
                renderArtistProviderBar(backEntry);
                renderContainerActionsBar(backEntry);
                refreshArtistProviderDiscovery(backEntry);
            } else if (entrySupportsContainerActions(backEntry)) {
                hideProviderBar();
                renderContainerActionsBar(backEntry);
            } else {
                renderArtistProviderBar(backEntry);
                hideContainerActionsBar();
            }
            syncAllAndroidChipSections();
            uiH('updatePanelFocus');
            if (isSearch) browseSearchInput.focus();
        } else {
            loadCurrentBrowseView();
        }
        return;
    }
    closeBrowsePanel();
}



function closeBrowsePanel() {
    if (!state.browsePanelOpen) return;
    uiH('closeBrowseRowMenu');
    renderArtistProviderBar(null);
    hideAlphaViewBar();
    hideContainerActionsBar();
    state.browsePanelOpen = false;
    browsePanel.classList.remove('open');
    browsePanel.setAttribute('aria-hidden', 'true');
    browseBtn.classList.remove('active');
    mainBody.classList.remove('browse-open');
    syncBrowsePanelBack();
    if (!state.queuePanelOpen && !state.playersPanelOpen && !state.detailsPanelOpen) mainBody.classList.remove('panel-open');
    uiH('invalidateIdleProgressVisibility');
    uiH('syncIdleProgressVisibility');
    uiH('schedulePlaybackStackRelayoutAfterStage');
    uiH('resumeUiHideTimer');
    uiH('updateFloatState');
}



function openBrowsePanel() {
    openBrowsePanelWithStack([{ key: 'root', title: 'Browse', type: 'root' }], { entryMode: 'manual' });
}



function bindBrowsePanelBack() {
    browsePanelBackBtn?.addEventListener('click', () => browseBack());
}


export {
    getBrowseSectionKey,
    entrySupportsBrowseProviders,
    itemMatchesBrowseProvider,
    maItemToPanelRow,
    getCurrentBrowseEntry,
    getBrowseView,
    storeBrowseView,
    resolveBrowseItemRaw,
    openBrowsePanelWithStack,
    openBrowsePanel,
    closeBrowsePanel,
    browseBack,
    syncBrowsePanelBack,
    bindBrowsePanelBack,
    loadCurrentBrowseView,
    loadBrowsePage,
    renderBrowsePanel,
    renderBrowsePanelNow,
    getBrowseRows,
    getBrowseRowSubTargets,
    getBrowseItemForRow,
    closeBrowseRowMenu,
    openBrowseRowMenu,
    moveBrowseMenuFocus,
    activateBrowseRow,
    activateBrowseMenuItem,
    moveBrowseRowSubFocus,
    moveBrowseGridFocus,
    moveArtistProviderFocus,
    moveAlphaViewFocus,
    moveContainerActionFocus,
    updateArtistProviderFocus,
    updateAlphaViewFocus,
    updateContainerActionFocus,
    activateContainerAction,
    navigateBrowseToArtist,
    navigateBrowseToAlbum,
    navigateBrowseToPodcast,
    navigateBrowseToPlaylist,
    navigateBrowseToGenre,
    collectGenrePlaybackUris,
    setRecommendedMediaFilter,
    toggleRecommendedSection,
    toggleDiscographySection,
    switchBrowseProvider,
    switchArtistProvider,
    switchAlphaViewMode,
    isBrowseGridView,
    getBrowseGridCols,
    isAlphaListEntry,
    hasContainerActionsBar,
    hasAlphaViewBar,
    hasArtistProviderBar,
    entrySupportsContainerActions,
    hideAlphaViewBar,
    hideContainerActionsBar,
    renderContainerActionsBar,
    renderArtistProviderBar,
    renderBrowseProviderBar,
    startRadioForMedia,
    renderPanelRowMenu,
    positionPanelRowMenu,
    resetPanelRowMenuPosition,
};
