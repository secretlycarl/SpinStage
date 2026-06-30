/**
 * Music Assistant WebSocket client.
 * Side effects on queue/players/now-playing go through ma/handlers.js (wired in spinstage-app.js).
 */
import { state } from '../state.js';
import {
  DEFAULT_PLAYER_NAME,
  SEARCH_PAGE_SIZE,
  BROWSE_PAGE_SIZE,
  QUEUE_PAGE_SIZE,
  RADIO_BROWSE_TIME_BUDGET_MS,
  RADIO_BROWSE_MAX_CALLS,
  RADIO_BROWSE_MAX_STATIONS,
  MA_WS_SEND_TIMEOUT_MS,
  RADIO_CATALOG_CACHE_MAX,
} from '../constants.js';
import { buildMaWsUrl, findMaPlayer } from '../util/server.js';
import { trimMapCache } from '../util/format.js';
import {
  normalizeProviderId,
  isLibraryLikeProvider,
  isInMaLibrary,
  isSpotifyLibraryProviderId,
  spotifyLibraryBaseProviderId,
  spotifyProviderIdsMatch,
  itemProviderId,
  itemHasSpotifyInLibraryMapping,
  itemStoredProviderId,
  normalizeProviderDisplayName,
} from '../util/providers.js';
import { callHandler, h } from './handlers.js';

export const maClient = 
{
    ws: null,
    reconnectTimer: null,
    msgId: 0,
    pending: new Map(),
    playerId: null,
    queueId: null,
    activeQueue: null,
    bootstrapped: false,
    bootstrapPromise: null,
    connectionId: 0,
    serverAddress: null,

    _mergeQueueEvent(prev, incoming) {
        const next = { ...(prev || {}), ...incoming };
        if (!Object.hasOwn(incoming, 'current_item')) {
            next.current_item = prev?.current_item;
        }
        if (!Object.hasOwn(incoming, 'items') && prev?.items != null) {
            next.items = prev.items;
        }
        if (!Object.hasOwn(incoming, 'shuffle_enabled') && prev?.shuffle_enabled != null) {
            next.shuffle_enabled = prev.shuffle_enabled;
        }
        if (!Object.hasOwn(incoming, 'repeat_mode') && prev?.repeat_mode != null) {
            next.repeat_mode = prev.repeat_mode;
        }
        return next;
    },

    getPlaybackPlayerId() {
        return this.playerId;
    },

    getPlaybackQueueId() {
        return this.queueId;
    },

    nextId() {
        this.msgId += 1;
        return `ma-${this.msgId}`;
    },

    send(command, args = {}) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('MA websocket not connected'));
                return;
            }
            const messageId = this.nextId();
            const timeoutId = setTimeout(() => {
                if (!this.pending.has(messageId)) return;
                this.pending.delete(messageId);
                reject(new Error(`MA command timed out: ${command}`));
            }, MA_WS_SEND_TIMEOUT_MS);
            this.pending.set(messageId, {
                resolve: (result) => {
                    clearTimeout(timeoutId);
                    resolve(result);
                },
                reject: (err) => {
                    clearTimeout(timeoutId);
                    reject(err);
                },
                timeoutId,
            });
            this.ws.send(JSON.stringify({ message_id: messageId, command, args }));
        });
    },

    handleMessage(msg) {
        if (msg.message_id && this.pending.has(msg.message_id)) {
            const pending = this.pending.get(msg.message_id);
            this.pending.delete(msg.message_id);
            if (msg.error_code) pending.reject(new Error(msg.error_code));
            else pending.resolve(msg.result);
            return;
        }

        const eventName = (msg.event || msg.data?.event || '').toLowerCase();
        const objectId = msg.object_id || msg.data?.object_id;
        const queue = msg.data || {};

        if (eventName === 'queue_updated' || eventName === 'queue_added') {
            if (!h('queueEventAppliesToLocal', objectId)) return;
            if (!this.queueId && objectId) this.queueId = objectId;
            if (queue.queue_id) this.queueId = queue.queue_id;
            const prevCurrentId = this.activeQueue?.current_item?.queue_item_id;
            this.activeQueue = this._mergeQueueEvent(this.activeQueue, queue);
            state.queueTotalCount = queue.items ?? this.activeQueue?.items ?? state.queueTotalCount;
            h('updateQueuePanelHeader');
            void h('refreshNavPlaylistContext').then(() => h('syncNavMenuState'));
            h('applyRemotePlaybackModes', queue.shuffle_enabled, queue.repeat_mode);
            h('syncQueueActionChips', this.activeQueue);
            if (state.queuePanelOpen) h('syncQueuePlayingHighlight');
            const nextCurrentId = this.activeQueue?.current_item?.queue_item_id;
            if (nextCurrentId && nextCurrentId !== prevCurrentId) {
                h('onMaQueueCurrentItemChanged', prevCurrentId, nextCurrentId);
            } else if (prevCurrentId && !nextCurrentId) {
                h('applyIdleNowPlayingText');
            }
            h('syncMaNowPlayingIfChanged', prevCurrentId, { skipVisualRequest: true });
            if (h('isRadioMedia', queue.current_item?.media_item)) {
                h('syncRadioNowPlayingFromQueue', queue.current_item);
            }
            if (state.queuePanelOpen) {
                h('scheduleQueueReload', false, { skipQueueRefresh: true });
            }
        }

        if (eventName === 'queue_time_updated') {
            if (!h('queueEventAppliesToLocal', objectId)) return;
            const elapsed = typeof msg.data === 'number'
                ? msg.data
                : (msg.data?.elapsed_time ?? queue?.elapsed_time);
            if (elapsed != null && this.activeQueue) {
                this.activeQueue.elapsed_time = elapsed;
                this.activeQueue.elapsed_time_last_updated = Date.now() / 1000;
            }
            if (!h('getIsSeeking')) h('syncProgressFromMaQueue', false);
        }

        if (eventName === 'queue_items_updated') {
            if (!h('queueEventAppliesToLocal', objectId)) return;
            h('scheduleQueueReload', true);
        }

        if (eventName === 'player_added' || eventName === 'player_removed'
            || eventName === 'players_updated' || eventName === 'player_config_updated') {
            if (state.playersPanelOpen) h('schedulePlayersPanelRefresh');
        }

        if (eventName === 'player_updated') {
            const player = msg.data || {};
            if (player.player_id) {
                h('scheduleGroupOffsetDisplaySync', player.player_id);
            }
            if (state.playersPanelOpen && player.player_id) {
                if (!h('patchPlayersListFromMaEvent', player)) {
                    h('schedulePlayersPanelRefresh');
                }
            }
            if (this.playerId && player.player_id && player.player_id !== this.playerId) return;
            h('scheduleLocalPlaybackOffsetsSync');
            const syncChanged = h('applyLocalSyncLeaderFromPlayer', player);
            const media = player.current_media;
            const mediaKey = media ? `${media.uri || ''}|${media.title || ''}|${media.queue_item_id || ''}` : '';
            const mediaChanged = !!mediaKey && mediaKey !== state.lastLocalPlayerMediaKey;
            if (mediaChanged) state.lastLocalPlayerMediaKey = mediaKey;
            h('applyPlayerVolumeState', player);
            if (syncChanged || mediaChanged) {
                h('scheduleLocalPlayerVisualCatchup', syncChanged ? 'sync-state' : 'player-media');
            }
        }

    },

    async refreshActiveQueue() {
        if (!this.playerId) return;
        try {
            const prevCurrentId = this.activeQueue?.current_item?.queue_item_id;
            const queue = await this.send('player_queues/get_active_queue', {
                player_id: this.playerId,
            });
            if (queue) {
                this.activeQueue = queue;
                this.queueId = queue.queue_id || this.queueId;
                state.queueTotalCount = queue.items ?? 0;
                h('updateQueuePanelHeader');
                const nextCurrentId = queue.current_item?.queue_item_id;
                if (nextCurrentId && nextCurrentId !== prevCurrentId) {
                    h('onMaQueueCurrentItemChanged', prevCurrentId, nextCurrentId);
                } else if (prevCurrentId && !nextCurrentId) {
                    h('applyIdleNowPlayingText');
                }
                h('syncMaNowPlayingIfChanged', prevCurrentId, { skipVisualRequest: true });
                h('syncQueueActionChips', this.activeQueue);
            } else {
                if (prevCurrentId) h('applyIdleNowPlayingText');
                this.activeQueue = null;
                state.queueTotalCount = 0;
                h('syncQueueActionChips', null);
            }
        } catch (err) {
            console.warn('refresh active queue failed:', err);
        }
    },

    async ensureReady() {
        if (this.bootstrapPromise) {
            try {
                await this.bootstrapPromise;
            } catch {
                /* bootstrap caller logs */
            }
        }
        if (!this.bootstrapped) throw new Error('MA not connected');
        if (this.playerId && !this.queueId) {
            const queue = await this.send('player_queues/get_active_queue', {
                player_id: this.playerId,
            });
            if (queue) {
                this.queueId = queue.queue_id || this.playerId;
                this.activeQueue = queue;
            }
        }
    },

    async bootstrap(expectedConnId = null) {
        const token = h('getMaApiTokenSync');
        if (!token) throw new Error('MA sign-in required');
        await this.send('auth', { token });
        const playerName = localStorage.getItem('ma_player_name') || DEFAULT_PLAYER_NAME;
        let match = null;
        for (let attempt = 0; attempt < 12; attempt += 1) {
            const players = await this.send('players/all');
            match = findMaPlayer(Array.isArray(players) ? players : [], playerName);
            if (match?.player_id) break;
            if (attempt < 11) {
                await new Promise((resolve) => setTimeout(resolve, 400));
            }
        }
        if (!match?.player_id) {
            throw new Error(
                'Player not found in MA — make sure the "Hide" option is unchecked in '
                + 'MA Server → Settings → Players → Configure Player.',
            );
        }
        this.playerId = match.player_id;
        state.lastLocalSyncStateKey = '';
        h('applyLocalSyncLeaderFromPlayer', match);
        const queue = await this.send('player_queues/get_active_queue', {
            player_id: this.playerId,
        });
        if (queue) {
            this.queueId = queue.queue_id || this.playerId;
            this.activeQueue = queue;
            state.queueTotalCount = queue.items ?? 0;
            h('applyRemotePlaybackModes', queue.shuffle_enabled, queue.repeat_mode);
            h('syncQueueActionChips', this.activeQueue);
            if (queue.current_item) {
                h('applyNowPlayingFromMaItem', queue.current_item, { force: true, skipVisuals: true });
                h('requestNowPlayingVisuals', 'bootstrap', { force: true, snapAccent: true });
            }
            if (!h('isTvLazyLibraryBootstrap')) {
                h('ensureLyricsBootstrapped');
            }
        }
        if (expectedConnId != null && expectedConnId !== this.connectionId) return;
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.bootstrapped = true;
        h('onMaConnectionRestored');
        h('invalidateProviderCaches');
        if (!h('isTvLazyLibraryBootstrap')) {
            void h('ensureMusicProvidersCached').then(() => {
                h('syncQueueActionChips', this.activeQueue);
            });
            void h('syncNavMenuState');
        }
        void h('refreshPlayerVolume').then(() => h('applyDefaultPlayerVolume'));
        void h('readPlayerPlaybackOffsets', this.playerId).then(({ staticMs, trimMs }) => {
            h('applyLocalPlaybackOffsets', staticMs, trimMs);
        });
        void h('applyEqPresetFromPreference');
    },

    async browse(path) {
        const items = await this.send('music/browse', { path });
        return Array.isArray(items) ? items : [];
    },

    mapSearchResultToRows(result, filterItem, preferStoredProvider = false) {
        const rows = [];
        const groups = ['tracks', 'albums', 'artists', 'playlists', 'radio', 'audiobooks', 'podcasts'];
        groups.forEach((group) => {
            (result?.[group] || []).forEach((item) => {
                if (filterItem && !filterItem(item)) return;
                const mt = h('inferMediaType', item);
                if (mt === 'artist' && !h('shouldShowArtistItem', item)) return;
                rows.push(h('maItemToPanelRow', item, { preferStoredProvider }));
            });
        });
        return rows;
    },

    async searchSpotifyLibrary(query, filter, spotifyLibProviderIds, limit = SEARCH_PAGE_SIZE) {
        const filterTypes = {
            all: ['track', 'album', 'artist', 'playlist', 'audiobook', 'podcast'],
            artist: ['artist'],
            album: ['album'],
            track: ['track'],
            playlist: ['playlist'],
            audiobook: ['audiobook'],
            radio: ['radio'],
            podcast: ['podcast'],
        };
        const spotifyProviderIds = spotifyLibProviderIds.map(spotifyLibraryBaseProviderId);
        const result = await this.send('music/search', {
            search_query: query,
            media_types: filterTypes[filter] || filterTypes.all,
            limit,
            library_only: true,
        });
        const matchesSpotifyLibrary = (item) => spotifyProviderIds.some(
            (pid) => spotifyProviderIdsMatch(pid, itemProviderId(item)),
        ) || itemHasSpotifyInLibraryMapping(item, spotifyProviderIds);
        return this.mapSearchResultToRows(result, matchesSpotifyLibrary);
    },

    async searchLibraryItems(query, filter = 'all', limit = SEARCH_PAGE_SIZE) {
        const filterToLibTypes = {
            all: ['artists', 'albums', 'tracks', 'playlists', 'audiobooks', 'podcasts'],
            artist: ['artists'],
            album: ['albums'],
            track: ['tracks'],
            playlist: ['playlists'],
            audiobook: ['audiobooks'],
            radio: [],
            podcast: ['podcasts'],
        };
        const libGroup = {
            artists: 'artists',
            albums: 'albums',
            tracks: 'tracks',
            playlists: 'playlists',
            audiobooks: 'audiobooks',
            podcasts: 'podcasts',
        };
        const types = filterToLibTypes[filter] || filterToLibTypes.all;
        const result = {
            tracks: [], albums: [], artists: [], playlists: [], radio: [],
            audiobooks: [], podcasts: [],
        };
        if (filter === 'radio') {
            const stations = await this.loadLibraryRadioStations(limit);
            const q = query.toLowerCase();
            result.radio = stations.filter((s) => {
                if (!isInMaLibrary(s)) return false;
                const name = (s.name || '').toLowerCase();
                return !q || name.includes(q);
            }).slice(0, limit);
        } else {
            for (const libType of types) {
                const group = libGroup[libType];
                if (!group) continue;
                try {
                    const items = await this.libraryItems(libType, 0, limit, {
                        search: query,
                        order_by: 'name_sort',
                    });
                    for (const item of items) {
                        if (!isInMaLibrary(item)) continue;
                        if (libType === 'artists' && !h('shouldShowArtistItem', item)) continue;
                        result[group].push(item);
                    }
                } catch (err) {
                    console.warn('library search failed:', libType, err);
                }
            }
        }
        return this.mapSearchResultToRows(result, null, true);
    },

    async searchCatalog(query, filter = 'all', providerIds = null, limit = SEARCH_PAGE_SIZE) {
        const filterTypes = {
            all: ['track', 'album', 'artist', 'playlist', 'radio', 'audiobook', 'podcast'],
            artist: ['artist'],
            album: ['album'],
            track: ['track'],
            playlist: ['playlist'],
            audiobook: ['audiobook'],
            radio: ['radio'],
            podcast: ['podcast'],
        };
        const enabled = (providerIds || []).filter((id) => id !== 'library');
        const enabledSet = new Set(enabled);
        const catalogIds = state.searchProviderOptions
            .map((p) => p.id)
            .filter((id) => !isSpotifyLibraryProviderId(id) && id !== 'library');
        const allEnabled = catalogIds.length > 0 && catalogIds.every((id) => enabledSet.has(id));
        if (!enabled.length) return [];
        if (filter === 'radio') {
            return this.searchProviderRadioCatalog(query, enabled, limit);
        }
        const result = await this.send('music/search', {
            search_query: query,
            media_types: filterTypes[filter] || filterTypes.all,
            limit,
            library_only: false,
        });
        const filterItem = (item) => allEnabled || h('itemMatchesAnySearchProvider', item, enabledSet);
        return this.mapSearchResultToRows(result, filterItem, false);
    },

    async searchOne(query, filter = 'all', providerIds = null, limit = SEARCH_PAGE_SIZE) {
        const enabled = providerIds || h('getEnabledSearchProviderIds');
        const spotifyLibIds = enabled.filter(isSpotifyLibraryProviderId);
        const regularIds = enabled.filter((id) => !isSpotifyLibraryProviderId(id));
        let rows = [];
        if (spotifyLibIds.length) {
            rows = rows.concat(await this.searchSpotifyLibrary(query, filter, spotifyLibIds, limit));
        }
        if (regularIds.includes('library')) {
            rows = rows.concat(await this.searchLibraryItems(query, filter, limit));
        }
        const nonLibrary = regularIds.filter((id) => id !== 'library');
        if (nonLibrary.length) {
            rows = rows.concat(await this.searchCatalog(query, filter, nonLibrary, limit));
        }
        return h('dedupeSearchRows', rows);
    },

    async search(query, filter = 'all', providerIds = null, limit = SEARCH_PAGE_SIZE) {
        const variants = h('searchQueryVariants', query);
        let rows = [];
        for (const q of variants) {
            rows = rows.concat(await this.searchOne(q, filter, providerIds, limit));
        }
        return h('dedupeSearchRows', rows);
    },

    async loadMusicProviders() {
        const fromBrowse = (await this.browse('root'))
            .filter((i) => i.name !== '..')
            .map((i) => ({
                id: (i.path || i.uri || '').split('://')[0],
                name: i.name || (i.path || '').split('://')[0],
                domain: (i.path || i.uri || '').split('://')[0],
                supported_features: [],
            }))
            .filter((p) => p.id);
        const merged = new Map(fromBrowse.map((p) => [p.id, p]));
        try {
            const result = await this.send('providers');
            if (Array.isArray(result)) {
                for (const p of result) {
                    if (p.type !== 'music' || p.available === false) continue;
                    const id = p.instance_id || p.domain;
                    if (!id) continue;
                    const existing = merged.get(id);
                    merged.set(id, {
                        id,
                        name: normalizeProviderDisplayName(
                            p.name || p.default_name || existing?.name || p.domain,
                            id,
                        ),
                        domain: p.domain || existing?.domain || id.split('--')[0],
                        supported_features: Array.isArray(p.supported_features)
                            ? p.supported_features : (existing?.supported_features || []),
                    });
                }
            }
        } catch (err) {
            console.warn('providers command failed:', err);
        }
        return Array.from(merged.values());
    },

    collectItemMappings(item) {
        const mappings = [];
        const sources = [
            item?.provider_mappings,
            item?.metadata?.provider_mappings,
            item?.album?.provider_mappings,
            item?.podcast?.provider_mappings,
        ];
        for (const src of sources) {
            if (Array.isArray(src)) mappings.push(...src);
        }
        return mappings;
    },

    buildMaApiAttempts(item, opts = {}) {
        const attempts = [];
        const seen = new Set();
        const add = (itemId, provider) => {
            if (!h('isValidMaItemId', itemId)) return;
            const prov = provider || item?.provider_instance_id || item?.provider || 'library';
            const key = `${prov}:${itemId}`;
            if (seen.has(key)) return;
            seen.add(key);
            attempts.push({
                item_id: String(itemId),
                provider_instance_id_or_domain: prov,
            });
        };

        const storedProv = item?.provider_instance_id || item?.provider || 'library';
        add(item?.item_id, storedProv);
        add(h('maItemIdFromUri', item?.uri || item?.path), storedProv);

        if (item?.external_ids && typeof item.external_ids === 'object') {
            for (const [prov, extId] of Object.entries(item.external_ids)) {
                if (!isLibraryLikeProvider(prov)) add(extId, prov);
            }
        }

        for (const mapping of this.collectItemMappings(item)) {
            const prov = mapping.provider_instance || mapping.provider_instance_id
                || mapping.provider_domain || mapping.provider;
            add(mapping.provider_item_id, prov);
            add(mapping.item_id, prov);
        }

        if (opts.preferredProvider) {
            const pref = normalizeProviderId(opts.preferredProvider);
            const hit = this.collectItemMappings(item).find((mapping) => {
                const inst = mapping.provider_instance || mapping.provider_instance_id || '';
                const dom = mapping.provider_domain || mapping.provider || '';
                return spotifyProviderIdsMatch(pref, inst) || spotifyProviderIdsMatch(pref, dom);
            });
            if (hit) {
                const prov = hit.provider_instance || hit.provider_instance_id
                    || hit.provider_domain || hit.provider;
                add(hit.provider_item_id, prov);
                add(hit.item_id, prov);
            }
        }

        if (opts.preferredProvider) {
            const pref = normalizeProviderId(opts.preferredProvider);
            const matchesPref = (prov) => {
                if (isLibraryLikeProvider(pref)) return isLibraryLikeProvider(prov);
                return spotifyProviderIdsMatch(pref, prov)
                    || normalizeProviderId(prov) === pref;
            };
            const preferred = [];
            const rest = [];
            for (const attempt of attempts) {
                if (matchesPref(attempt.provider_instance_id_or_domain)) preferred.push(attempt);
                else rest.push(attempt);
            }
            if (isLibraryLikeProvider(pref)) {
                if (preferred.length) return preferred;
                return attempts.filter(
                    (a) => isLibraryLikeProvider(a.provider_instance_id_or_domain),
                );
            }
            return preferred.length ? [...preferred, ...rest] : attempts;
        }

        return attempts;
    },

    isMaSubresourceRetryable(err) {
        const msg = String(err?.message || err || '').toLowerCase();
        return msg.includes('999')
            || msg.includes('(2)')
            || msg.includes('not found')
            || msg.includes('medianotfound')
            || msg.includes('required')
            || msg.includes('invalid literal');
    },

    async resolveMaItem(item) {
        if (!item) return item;
        if (h('isValidMaItemId', item.item_id)) return item;
        const uri = item.uri || item.path;
        if (!uri) return item;
        try {
            const full = await this.send('music/item_by_uri', { uri });
            return full ? { ...item, ...full } : item;
        } catch (err) {
            return item;
        }
    },

    async resolveMaItemForProvider(item, preferredProvider) {
        if (!item) return item;
        const resolved = await this.resolveMaItem(item);
        if (!preferredProvider) return resolved;
        const attempts = this.buildMaApiAttempts(resolved, { preferredProvider });
        if (!attempts.length) return resolved;
        const mediaType = resolved.media_type || h('inferMediaType', resolved);
        for (const attempt of attempts) {
            try {
                const full = await this.send('music/item', {
                    media_type: mediaType,
                    item_id: attempt.item_id,
                    provider_instance_id_or_domain: attempt.provider_instance_id_or_domain,
                });
                if (full?.uri) return full;
            } catch (err) { /* try next mapping */ }
        }
        return resolved;
    },

    async maSubresourceCall(command, item, extraArgs = {}, opts = {}) {
        const resolved = await this.resolveMaItem(item);
        const attempts = this.buildMaApiAttempts(resolved, opts);
        if (!attempts.length) throw new Error('missing item_id');
        let lastErr;
        for (let i = 0; i < attempts.length; i++) {
            try {
                return await this.send(command, { ...attempts[i], ...extraArgs });
            } catch (err) {
                lastErr = err;
                if (i < attempts.length - 1 && this.isMaSubresourceRetryable(err)) continue;
                throw err;
            }
        }
        throw lastErr || new Error('missing item_id');
    },

    async artistAlbums(item, opts = {}) {
        const inLibraryOnly = !!opts.inLibraryOnly;
        const albums = await this.maSubresourceCall('music/artists/artist_albums', item, {
            in_library_only: inLibraryOnly,
        }, opts);
        let list = Array.isArray(albums) ? albums.filter((i) => i && i.name !== '..') : [];
        const pref = opts.preferredProvider;
        if (pref && h('providerNeedsStrictArtistDiscography', pref)) {
            const artistName = item?.name || '';
            list = list.filter((a) => h('albumMatchesBrowseArtist', a, artistName));
        }
        return list;
    },

    async setShuffle(enabled) {
        await this.ensureReady();
        return this.send('player_queues/shuffle', {
            queue_id: this.getPlaybackQueueId(),
            shuffle_enabled: !!enabled,
        });
    },

    async clearQueue(skipStop = false) {
        await this.ensureReady();
        return this.send('player_queues/clear', {
            queue_id: this.getPlaybackQueueId(),
            skip_stop: !!skipStop,
        });
    },

    async setDontStopTheMusic(enabled) {
        await this.ensureReady();
        return this.send('player_queues/dont_stop_the_music', {
            queue_id: this.getPlaybackQueueId(),
            dont_stop_the_music_enabled: !!enabled,
        });
    },

    async playMediaOrdered(uriOrUris, opts = {}) {
        await this.ensureReady();
        await this.setShuffle(false);
        return this.playMedia(uriOrUris, {
            option: opts.option || 'replace',
            start_item: opts.start_item,
            radio_mode: false,
        });
    },

    async playMediaShuffled(uri) {
        await this.ensureReady();
        return this.playMediaWithOption(uri, { option: 'replace', shuffle: true });
    },

    async collectArtistTrackUris(item, opts = {}) {
        const merged = {
            ...opts,
            ...h('providerOptsForPreferred', opts.preferredProvider),
        };
        const albums = await this.artistAlbums(item, merged);
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
                const tracks = await this.albumTracks(album, merged);
                for (const track of tracks) {
                    const uri = h('uriForProvider', track, pref);
                    if (uri) uris.push(uri);
                }
            } catch (err) {
                console.warn('artist album tracks failed:', album?.name, err);
            }
        }
        if (!uris.length) throw new Error('artist has no tracks');
        return uris;
    },

    async playArtist(item, shuffle = false, opts = {}) {
        const uris = await this.collectArtistTrackUris(item, opts);
        if (shuffle) {
            await this.setShuffle(true);
            return this.playMedia(uris, { option: 'replace', radio_mode: false });
        }
        await this.setShuffle(false);
        return this.playMedia(uris, { option: 'replace', radio_mode: false });
    },

    async loadLibraryRadioStations(limit = 500) {
        for (const type of ['radios', 'radio']) {
            try {
                const items = await this.libraryItems(type, 0, limit);
                if (items.length) return items;
            } catch (err) { /* try next */ }
        }
        return [];
    },

    async _collectRadioFromBrowse(path, providerId, depth, collected, budget) {
        if (depth > 3) return;
        if (budget) {
            if (budget.calls >= budget.maxCalls) return;
            if (Date.now() > budget.deadline) return;
            if (collected.length >= budget.maxStations) return;
            budget.calls += 1;
        }
        let kids;
        try {
            kids = await this.browse(path);
        } catch (err) {
            return;
        }
        for (const item of kids) {
            if (!item || item.name === '..') continue;
            const itemPath = item.path || item.uri;
            if (!itemPath) continue;
            if (h('isRadioBrowseItem', item)) {
                collected.push({
                    ...item,
                    media_type: item.media_type || 'radio',
                    provider: item.provider || providerId,
                });
                continue;
            }
            const mt = (item.media_type || item.type || '').toLowerCase();
            const folderish = !mt || mt === 'folder' || mt === 'directory';
            const shouldRecurse = folderish && (
                depth <= 1 || h('isRadioBrowseFolder', item)
            );
            if (shouldRecurse) {
                await this._collectRadioFromBrowse(itemPath, providerId, depth + 1, collected, budget);
            }
        }
    },

    async browseProviderRadioStations(providerId) {
        if (!providerId || providerId === 'library' || providerId === 'all') return [];
        if (state.radioCatalogCache.has(providerId)) return state.radioCatalogCache.get(providerId);
        const collected = [];
        // Bound the crawl so large remote directories (e.g. TuneIn) return
        // a useful subset quickly instead of hanging the list forever.
        const budget = {
            calls: 0,
            maxCalls: RADIO_BROWSE_MAX_CALLS,
            maxStations: RADIO_BROWSE_MAX_STATIONS,
            deadline: Date.now() + RADIO_BROWSE_TIME_BUDGET_MS,
        };
        try {
            await this._collectRadioFromBrowse(`${providerId}://`, providerId, 0, collected, budget);
        } catch (err) {
            console.warn('radio browse failed:', providerId, err);
        }
        const stations = h('dedupeRadioItems', collected).sort((a, b) => (
            a.name || ''
        ).localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
        state.radioCatalogCache.set(providerId, stations);
        trimMapCache(state.radioCatalogCache, RADIO_CATALOG_CACHE_MAX);
        return stations;
    },

    async loadRadioStationsMerged(browseProviderId = 'all') {
        const cacheKey = browseProviderId || 'all';
        if (state.radioMergedCatalogCache.has(cacheKey)) {
            return state.radioMergedCatalogCache.get(cacheKey);
        }
        // Radio is a library-only view of live internet radio. The whole
        // list comes from the library; a provider chip simply filters the
        // library to that provider. Provider catalogues are never crawled
        // (public stations are found via search and added to the library).
        const library = await this.loadLibraryRadioStations();
        let merged;
        if (browseProviderId && browseProviderId !== 'all' && browseProviderId !== 'library') {
            merged = library.filter((st) => h('itemMatchesBrowseProvider', st, browseProviderId));
        } else {
            merged = library;
        }
        state.radioMergedCatalogCache.set(cacheKey, merged);
        return merged;
    },

    async loadRadioStations() {
        return this.loadRadioStationsMerged('all');
    },

    async loadRadioStationsPage(browseProviderId = 'all', offset = 0, limit = 50) {
        const all = await this.loadRadioStationsMerged(browseProviderId);
        return {
            items: all.slice(offset, offset + limit),
            hasMore: offset + limit < all.length,
            total: all.length,
        };
    },

    async searchProviderRadioCatalog(query, providerIds, limit = SEARCH_PAGE_SIZE) {
        const q = (query || '').trim().toLowerCase();
        let stations = [];
        for (const pid of providerIds) {
            stations = stations.concat(await this.browseProviderRadioStations(pid));
        }
        stations = h('dedupeRadioItems', stations);
        if (q) {
            stations = stations.filter((s) => (s.name || '').toLowerCase().includes(q));
        }
        return this.mapSearchResultToRows({ radio: stations.slice(0, limit) }, null, false);
    },

    async libraryItems(type, offset = 0, limit = 50, extra = {}) {
        const items = await this.send(`music/${type}/library_items`, {
            limit,
            offset,
            order_by: 'name',
            ...extra,
        });
        return Array.isArray(items) ? items : [];
    },

    async loadFavorites() {
        const favOpts = { favorite: true, order_by: 'name' };
        const types = ['albums', 'playlists', 'tracks', 'artists', 'audiobooks', 'podcasts'];
        const collected = [];
        const seen = new Set();
        const addItems = (items) => {
            (items || []).forEach((item) => {
                if (!item?.name) return;
                const key = item.uri || `${item.item_id}:${item.provider || ''}`;
                if (!key || seen.has(key)) return;
                seen.add(key);
                collected.push(item);
            });
        };
        for (const type of types) {
            try {
                addItems(await this.libraryItems(type, 0, 200, favOpts));
            } catch (err) {
                console.warn(`favorites ${type} failed:`, err);
            }
        }
        for (const type of ['radios', 'radio']) {
            try {
                const items = await this.libraryItems(type, 0, 200, favOpts);
                if (items.length) {
                    addItems(items);
                    break;
                }
            } catch (err) {
                console.warn(`favorites ${type} failed:`, err);
            }
        }
        collected.sort((a, b) => (a.sort_name || a.name || '').localeCompare(b.sort_name || b.name || ''));
        return collected;
    },

    async recentlyPlayed(limit = 50) {
        const items = await this.send('music/recently_played_items', {
            limit,
            media_types: ['track', 'album', 'playlist', 'artist', 'radio', 'podcast', 'podcast_episode'],
            fully_played_only: false,
        });
        return Array.isArray(items) ? items : [];
    },

    async recentlyAdded(limit = 50, providerId = 'all') {
        const perType = limit;
        const types = providerId === 'library' ? ['albums'] : ['albums', 'audiobooks'];
        const collected = [];
        const seen = new Set();
        const addItems = (items) => {
            (items || []).forEach((item) => {
                if (!item?.name) return;
                const key = item.uri || `${item.item_id}:${item.provider || ''}`;
                if (!key || seen.has(key)) return;
                seen.add(key);
                collected.push(item);
            });
        };
        const addedOrder = { order_by: 'timestamp_added_desc' };
        const extra = { ...addedOrder };
        if (providerId && providerId !== 'all' && providerId !== 'library'
            && !isSpotifyLibraryProviderId(providerId)) {
            extra.provider = providerId;
        }
        const isLocalMusicAlbum = (item) => h('isLocalLibraryItem', item)
            && h('inferMediaType', item) !== 'audiobook';
        await Promise.all(types.map(async (type) => {
            try {
                let items = await this.libraryItems(type, 0, perType, extra);
                if (providerId === 'library') {
                    items = items.filter(isLocalMusicAlbum);
                } else if (providerId && providerId !== 'all' && !extra.provider) {
                    items = items.filter((i) => h('itemMatchesBrowseProvider', i, providerId));
                }
                addItems(items);
            } catch (err) {
                console.warn(`recently added ${type} failed:`, err);
            }
        }));
        const addedSortKey = (item) => {
            if (item.timestamp_added) return Number(item.timestamp_added);
            const da = item.date_added;
            if (!da) return 0;
            if (typeof da === 'number') return da;
            const ms = Date.parse(da);
            return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
        };
        collected.sort((a, b) => addedSortKey(b) - addedSortKey(a));
        return collected.slice(0, limit);
    },

    async albumTracks(item, opts = {}) {
        const extra = {};
        if (opts.inLibraryOnly) extra.in_library_only = true;
        const tracks = await this.maSubresourceCall('music/albums/album_tracks', item, extra, opts);
        let filtered = h('filterAlbumTracks', Array.isArray(tracks) ? tracks : [], item);
        filtered = h('filterAlbumTracksForProvider', filtered, opts.preferredProvider);
        return filtered;
    },

    async podcastEpisodes(item, opts = {}) {
        const episodes = await this.maSubresourceCall('music/podcasts/podcast_episodes', item, {
            limit: opts.limit ?? BROWSE_PAGE_SIZE,
            offset: opts.offset || 0,
        }, opts);
        return Array.isArray(episodes) ? episodes.filter((i) => i && i.name !== '..') : [];
    },

    async playlistTracks(item, opts = {}) {
        const resolved = await this.resolveMaItem(item);
        const extra = {};
        if (opts.forceRefresh) extra.force_refresh = true;
        const fetchTracks = this.maSubresourceCall('music/playlists/playlist_tracks', resolved, extra, opts);
        const timeoutMs = opts.timeout || 0;
        try {
            const tracks = timeoutMs > 0
                ? await Promise.race([
                    fetchTracks,
                    new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('playlist load timeout')), timeoutMs);
                    }),
                ])
                : await fetchTracks;
            return Array.isArray(tracks) ? tracks : [];
        } catch (err) {
            if (!opts.allowBrowseFallback) throw err;
            try {
                return await this.browse(resolved.uri || item.uri);
            } catch (err2) {
                return [];
            }
        }
    },

    async resolvePlayUri(uri) {
        if (!uri) return uri;
        try {
            const item = await this.send('music/item_by_uri', { uri });
            return item?.uri || uri;
        } catch (err) {
            return uri;
        }
    },

    async playStation(itemOrUri) {
        await this.ensureReady();
        await this.setShuffle(false);
        const raw = typeof itemOrUri === 'string' ? null : (itemOrUri?.raw || itemOrUri);
        let uri = typeof itemOrUri === 'string'
            ? itemOrUri
            : (itemOrUri?.uri || raw?.uri || itemOrUri?.path);
        const stationName = raw?.name || itemOrUri?.title || uri;
        try {
            if (raw?.item_id) {
                try {
                    const full = await this.send('music/item', {
                        media_type: raw.media_type || 'radio',
                        item_id: raw.item_id,
                        provider_instance_id_or_domain: raw.provider_instance_id || raw.provider || 'library',
                    });
                    if (full?.uri) uri = full.uri;
                } catch (err) { /* fall through */ }
            }
            if (!uri) throw new Error('no radio uri');
            const resolved = await this.resolvePlayUri(uri);
            return await this.playMedia(resolved, { option: 'replace', radio_mode: false });
        } catch (err) {
            console.warn('playStation failed:', { stationName, uri, err });
            throw err;
        }
    },

    async fetchQueueItems(offset = 0, limit = QUEUE_PAGE_SIZE) {
        await this.ensureReady();
        const items = await this.send('player_queues/items', {
            queue_id: this.getPlaybackQueueId(),
            offset,
            limit,
        });
        return Array.isArray(items) ? items : [];
    },

    async playMedia(uri, opts = {}) {
        await this.ensureReady();
        return this.send('player_queues/play_media', {
            queue_id: this.getPlaybackQueueId(),
            media: Array.isArray(uri) ? uri : [uri],
            option: opts.option || 'replace',
            radio_mode: !!opts.radio_mode,
            start_item: opts.start_item,
        });
    },

    async playMediaWithOption(uriOrUris, opts = {}) {
        await this.ensureReady();
        const radioMode = !!(opts.radio_mode ?? opts.radioMode);
        if (opts.shuffle === true) await this.setShuffle(true);
        else if (opts.shuffle === false && (opts.option || 'replace') === 'replace' && !radioMode) {
            await this.setShuffle(false);
        }
        return this.playMedia(uriOrUris, {
            option: opts.option || 'replace',
            start_item: opts.start_item,
            radio_mode: radioMode,
        });
    },

    async addFavorite(uri) {
        await this.ensureReady();
        return this.send('music/favorites/add_item', { item: uri });
    },

    async removeFavorite(itemOrUri) {
        await this.ensureReady();
        let item = itemOrUri;
        if (typeof itemOrUri === 'string') {
            item = await this.send('music/item_by_uri', { uri: itemOrUri });
        }
        if (!item?.item_id || !item?.media_type) {
            throw new Error('cannot remove favorite — item not in library');
        }
        return this.send('music/favorites/remove_item', {
            media_type: item.media_type,
            library_item_id: item.item_id,
        });
    },

    async addToLibrary(uri) {
        await this.ensureReady();
        return this.send('music/library/add_item', { item: uri });
    },

    async removeFromLibrary(itemOrUri) {
        await this.ensureReady();
        let item = itemOrUri;
        if (typeof itemOrUri === 'string') {
            item = await this.send('music/item_by_uri', { uri: itemOrUri });
        }
        if (!item?.item_id || !item?.media_type) {
            throw new Error('cannot remove — item not in library');
        }
        return this.send('music/library/remove_item', {
            media_type: item.media_type,
            library_item_id: item.item_id,
        });
    },

    async refreshItem(uriOrItem) {
        await this.ensureReady();
        return this.send('music/refresh_item', { media_item: uriOrItem });
    },

    async getRecommendations() {
        await this.ensureReady();
        const res = await this.send('music/recommendations', {});
        return Array.isArray(res) ? res : [];
    },

    async getGenreOverview(item) {
        await this.ensureReady();
        const res = await this.send('music/genres/overview', {
            item_id: item.item_id,
            provider_instance_id_or_domain: item.provider || 'library',
        });
        return Array.isArray(res) ? res : [];
    },

    async getTrackVersions(track) {
        await this.ensureReady();
        if (!track?.item_id) return [];
        const provider = track.provider || track.provider_instance_id || 'library';
        const res = await this.send('music/tracks/track_versions', {
            item_id: String(track.item_id),
            provider_instance_id_or_domain: provider,
        });
        return Array.isArray(res) ? res : [];
    },

    async getSimilarTracks(track, opts = {}) {
        await this.ensureReady();
        if (!track?.item_id) return [];
        const provider = track.provider || track.provider_instance_id || 'library';
        const res = await this.send('music/tracks/similar_tracks', {
            item_id: String(track.item_id),
            provider_instance_id_or_domain: provider,
            limit: opts.limit ?? 50,
            allow_lookup: opts.allowLookup ?? true,
        });
        return Array.isArray(res) ? res : [];
    },

    async createPlaylist(name) {
        await this.ensureReady();
        return this.send('music/playlists/create_playlist', { name });
    },

    async addTracksToPlaylist(playlistId, uris) {
        await this.ensureReady();
        return this.send('music/playlists/add_playlist_tracks', {
            db_playlist_id: playlistId,
            uris,
        });
    },

    async getTrackLyrics(track) {
        await this.ensureReady();
        if (!track?.item_id && !track?.uri) return null;
        const payload = {
            item_id: track.item_id,
            provider: track.provider || track.provider_instance_id || 'library',
            media_type: track.media_type || 'track',
            uri: track.uri,
            name: track.name,
            artists: track.artists,
            album: track.album,
            duration: track.duration,
            metadata: track.metadata,
        };
        const res = await this.send('metadata/get_track_lyrics', { track: payload });
        if (Array.isArray(res)) {
            return { plain: res[0] || null, lrc: res[1] || null };
        }
        if (res && typeof res === 'object') {
            return {
                plain: res.lyrics || res.plain || null,
                lrc: res.lrc_lyrics || res.lrc || null,
            };
        }
        return null;
    },

    async getGenresForMediaItem(item) {
        await this.ensureReady();
        const mt = h('inferMediaType', item) || item.media_type;
        const id = item?.item_id;
        if (!mt || id == null) return [];
        try {
            const res = await this.send('music/genres/genres_for_media_item', {
                media_type: mt,
                media_id: String(id),
            });
            return Array.isArray(res) ? res : [];
        } catch (err) {
            console.warn('genres for media item failed:', err);
            return [];
        }
    },

    async getInProgressItems(limit = 25) {
        await this.ensureReady();
        const res = await this.send('music/in_progress_items', { limit });
        return Array.isArray(res) ? res : [];
    },

    async saveQueueAsPlaylist(name) {
        await this.ensureReady();
        return this.send('player_queues/save_as_playlist', {
            queue_id: this.getPlaybackQueueId(),
            name,
        });
    },

    async playQueueIndex(indexOrId) {
        await this.ensureReady();
        return this.send('player_queues/play_index', {
            queue_id: this.getPlaybackQueueId(),
            index: indexOrId,
            seek_position: 0,
        });
    },

    async seek(positionSeconds) {
        await this.ensureReady();
        return this.send('player_queues/seek', {
            queue_id: this.getPlaybackQueueId(),
            position: Math.max(0, positionSeconds),
        });
    },

    async resumeQueue() {
        await this.ensureReady();
        return this.send('player_queues/resume', { queue_id: this.getPlaybackQueueId() });
    },

    async pauseQueue() {
        await this.ensureReady();
        return this.send('player_queues/pause', { queue_id: this.getPlaybackQueueId() });
    },

    async deleteQueueItem(itemIdOrIndex) {
        await this.ensureReady();
        return this.send('player_queues/delete_item', {
            queue_id: this.getPlaybackQueueId(),
            item_id_or_index: itemIdOrIndex,
        });
    },

    async moveQueueItem(queueItemId, posShift) {
        await this.ensureReady();
        return this.send('player_queues/move_item', {
            queue_id: this.getPlaybackQueueId(),
            queue_item_id: queueItemId,
            pos_shift: posShift,
        });
    },

    scheduleReconnect(address) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(address), 5000);
    },

    connect(address) {
        // Cancel any pending reconnect so it can't fire a second connect()
        // on top of this one (the orphaned timer was a source of the
        // "WebSocket is closed before the connection is established" churn).
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.disconnect(false, false);
        this.queueId = null;
        this.activeQueue = null;
        this.bootstrapPromise = null;
        this.connectionId += 1;
        const connId = this.connectionId;
        this.serverAddress = address;
        const wsUrl = buildMaWsUrl(address);
        if (!wsUrl) return;

        let sawServerInfo = false;
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        ws.onmessage = (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch (err) {
                return;
            }

            if (!sawServerInfo && msg.server_id) {
                sawServerInfo = true;
                this.bootstrapPromise = this.bootstrap(connId).catch((err) => {
                    console.warn('MA client bootstrap failed:', err);
                }).finally(() => {
                    if (this.connectionId === connId) this.bootstrapPromise = null;
                });
                return;
            }

            this.handleMessage(msg);
        };

        ws.onclose = () => {
            this.pending.forEach(({ reject, timeoutId }) => {
                clearTimeout(timeoutId);
                reject(new Error('MA websocket closed'));
            });
            this.pending.clear();
            this.bootstrapped = false;
            h('invalidateProviderCaches');
            h('onMaWebSocketClosed');
            if (this.serverAddress) {
                this.scheduleReconnect(this.serverAddress);
            }
        };

        ws.onerror = () => {
            ws.close();
        };
    },

    disconnect(clearReconnect = true, fullReset = true) {
        if (clearReconnect) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }
        this.pending.forEach(({ reject, timeoutId }) => {
            clearTimeout(timeoutId);
            reject(new Error('MA websocket disconnected'));
        });
        this.pending.clear();
        this.bootstrapped = false;
        this.bootstrapPromise = null;
        if (fullReset) {
            this.playerId = null;
            this.queueId = null;
            this.activeQueue = null;
        }
    },
}
