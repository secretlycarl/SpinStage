/**
 * Media details side panel.
 * Cross-module callbacks use ui/handlers.js (wired in spinstage-app.js).
 */
import { state } from '../state.js';
import { formatTime } from '../util/format.js';
import { itemProviderId, itemStoredProviderId, normalizeProviderDisplayName } from '../util/providers.js';
import {
    detailsPanel,
    detailsPanelTitle,
    detailsPanelHint,
    detailsActionsBar,
    detailsList,
    mainBody,
    detailsPanelBackBtn,
} from '../dom.js';
import { maClient } from '../ma/client.js';
import { escapeHtml } from '../util/escape-html.js';
import { uiH } from './handlers.js';

async function fetchFullDetailsMedia(raw, mt) {
    if (!raw) return null;
    const mediaType = mt || uiH('inferMediaType', raw) || 'track';
    const provider = itemStoredProviderId(raw) || raw.provider_instance_id || raw.provider || 'library';
    try {
        await maClient.ensureReady();
        if (raw.uri) {
            const full = await maClient.send('music/item_by_uri', {
                uri: raw.uri,
                allow_update_metadata: true,
            });
            if (full) return { ...raw, ...full, media_type: uiH('inferMediaType', full) || mediaType };
        }
        if (raw.item_id) {
            const full = await maClient.send('music/item', {
                media_type: mediaType,
                item_id: raw.item_id,
                provider_instance_id_or_domain: provider,
                allow_update_metadata: true,
            });
            if (full) return { ...raw, ...full, media_type: uiH('inferMediaType', full) || mediaType };
        }
    } catch (err) {
        console.warn('fetch details media failed:', err);
    }
    return raw;
}

function pushDetailRow(rows, label, value) {
    if (value == null || value === '') return;
    const text = typeof value === 'string' ? value.trim() : String(value).trim();
    if (!text) return;
    rows.push({ label, value: text });
}

function formatProviderDisplay(id) {
    if (!id) return '';
    const fromCache = (state.musicProvidersCache?.list || []).find((p) => p.id === id);
    if (fromCache?.name) return normalizeProviderDisplayName(fromCache.name, fromCache.id);
    return uiH('formatProviderLabel', id);
}

function formatDetailsDuration(seconds) {
    const sec = Number(seconds);
    if (!sec || sec <= 0) return '';
    return formatTime(sec * 1000);
}

function joinDetailList(val) {
    if (!val) return '';
    if (Array.isArray(val)) {
        return val.map((v) => (typeof v === 'string' ? v : v?.name || '')).filter(Boolean).join(', ');
    }
    return String(val);
}

function formatDetailCodec(codecOrFormat) {
    if (codecOrFormat == null || codecOrFormat === '') return '';
    if (typeof codecOrFormat === 'string') return codecOrFormat.trim();
    if (typeof codecOrFormat !== 'object') return String(codecOrFormat).trim();
    const af = codecOrFormat;
    const parts = [];
    const type = af.content_type || af.codec || af.format || af.type;
    if (type != null && type !== '') parts.push(String(type));
    if (af.sample_rate) parts.push(`${af.sample_rate} Hz`);
    if (af.bit_depth) parts.push(`${af.bit_depth}-bit`);
    if (af.channels != null) {
        parts.push(af.channels === 2 ? 'stereo' : `${af.channels} ch`);
    }
    return parts.join(' · ');
}

function supportsDetailsMedia(media) {
    if (!media) return false;
    return !!(media.uri || media.path || media.item_id);
}

function supportsDetailsItem(item) {
    if (!item || item.kind === 'section' || item.kind === 'divider' || item.kind === 'empty') {
        return false;
    }
    const raw = uiH('resolveBrowseItemRaw', item);
    if (item.title === '..' || raw?.name === '..') return false;
    return supportsDetailsMedia(raw || item);
}

function supportsRefreshDetailsMedia(item) {
    if (!item) return false;
    const mt = uiH('inferMediaType', item);
    if (!['track', 'album', 'artist', 'playlist', 'radio', 'podcast',
        'audiobook', 'podcast_episode', 'episode'].includes(mt)) return false;
    return !!(item.uri || item.path);
}

function hideDetailsActionsBar() {
    if (!detailsActionsBar) return;
    detailsActionsBar.style.display = 'none';
    detailsActionsBar.setAttribute('aria-hidden', 'true');
    detailsActionsBar.innerHTML = '';
}

function renderDetailsActionsBar(item) {
    if (!detailsActionsBar) return;
    if (!supportsRefreshDetailsMedia(item)) {
        hideDetailsActionsBar();
        return;
    }
    detailsActionsBar.style.display = 'flex';
    detailsActionsBar.setAttribute('aria-hidden', 'false');
    detailsActionsBar.innerHTML = '';
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'search-filter-chip container-action-chip';
    chip.dataset.actionId = 'refresh_item';
    chip.innerHTML = '<img src="icons/refresh.svg" alt=""><span>Refresh Artwork</span>';
    chip.addEventListener('click', () => void refreshDetailsArtwork());
    detailsActionsBar.appendChild(chip);
}

async function refreshDetailsArtwork() {
    const item = state.detailsPanelMedia;
    const uri = item?.uri || item?.path;
    if (!uri) return;
    try {
        uiH('setStatus', 'Refreshing artwork…', 'connected');
        await maClient.refreshItem(uri);
        const full = await fetchFullDetailsMedia(item);
        const refreshed = full || item;
        state.detailsPanelMedia = refreshed;
        detailsPanelTitle.textContent = uiH('getItemDisplayName', refreshed) || 'Details';
        detailsPanelHint.textContent = buildDetailsSubtitle(refreshed);
        state.detailsPanelRows = buildDetailsRows(refreshed, state.detailsPanelQueueItem || null);
        renderDetailsPanel();
        renderDetailsActionsBar(refreshed);
        uiH('setStatus', 'Artwork refreshed', 'connected');
    } catch (err) {
        console.warn('refresh details artwork failed:', err);
        uiH('setStatus', 'refresh failed', 'error');
    }
}

function buildDetailsSubtitle(item) {
    if (!item) return '';
    const mt = uiH('inferMediaType', item);
    if (mt === 'track') return uiH('trackArtistAlbumSubtitle', item);
    if (mt === 'album') return uiH('pickDisplayArtistName', item);
    if (mt === 'podcast_episode' || mt === 'episode') return uiH('pickPodcastName', item);
    if (mt === 'artist') return joinDetailList(item.metadata?.genres);
    if (mt === 'radio') return uiH('getRadioStationFallback', item);
    return '';
}

function buildDetailsRows(item, queueItem) {
    const rows = [];
    const mt = uiH('inferMediaType', item) || 'track';
    pushDetailRow(rows, 'Type', mt.replace(/_/g, ' '));
    pushDetailRow(rows, 'Provider', formatProviderDisplay(itemProviderId(item)));

    if (mt === 'track') {
        pushDetailRow(rows, 'Title', uiH('getItemDisplayName', item));
        pushDetailRow(rows, 'Artist', uiH('trackArtistName', item));
        pushDetailRow(rows, 'Album', uiH('trackAlbumName', item));
        const trackNo = item.track_number ?? item.metadata?.track_number;
        const discNo = item.disc_number ?? item.metadata?.disc_number;
        pushDetailRow(rows, 'Track', trackNo != null ? String(trackNo) : '');
        pushDetailRow(rows, 'Disc', discNo != null ? String(discNo) : '');
        pushDetailRow(rows, 'Duration', formatDetailsDuration(item.duration ?? item.metadata?.duration));
        pushDetailRow(rows, 'Year', uiH('formatAlbumYear', item));
        pushDetailRow(rows, 'Genre', joinDetailList(item.metadata?.genres || item.genres));
        pushDetailRow(rows, 'Version', item.version || item.metadata?.version);
        if (item.metadata?.explicit != null) {
            pushDetailRow(rows, 'Explicit', item.metadata.explicit ? 'Yes' : 'No');
        }
        pushDetailRow(rows, 'ISRC', item.isrc || item.metadata?.isrc);
        pushDetailRow(rows, 'Label', item.metadata?.label || item.label);
        pushDetailRow(rows, 'Composer', joinDetailList(item.metadata?.performers || item.metadata?.composers));
    } else if (mt === 'podcast_episode' || mt === 'episode') {
        pushDetailRow(rows, 'Episode', uiH('getItemDisplayName', item));
        pushDetailRow(rows, 'Podcast', uiH('pickPodcastName', item));
        pushDetailRow(rows, 'Published', uiH('formatPodcastEpisodeDate', item));
        pushDetailRow(rows, 'Duration', formatDetailsDuration(item.duration ?? item.metadata?.duration));
        const desc = item.metadata?.description || item.description;
        if (desc) pushDetailRow(rows, 'Description', desc.length > 400 ? `${desc.slice(0, 400)}…` : desc);
    } else if (mt === 'album') {
        pushDetailRow(rows, 'Title', uiH('getItemDisplayName', item));
        pushDetailRow(rows, 'Artist', uiH('pickDisplayArtistName', item));
        pushDetailRow(rows, 'Year', uiH('formatAlbumYear', item));
        pushDetailRow(rows, 'Album type', item.album_type);
        pushDetailRow(rows, 'Label', item.metadata?.label);
        pushDetailRow(rows, 'Genre', joinDetailList(item.metadata?.genres));
        pushDetailRow(rows, 'Tracks', item.track_count != null ? String(item.track_count) : '');
    } else if (mt === 'artist') {
        pushDetailRow(rows, 'Name', uiH('getItemDisplayName', item));
        pushDetailRow(rows, 'Genre', joinDetailList(item.metadata?.genres));
        pushDetailRow(rows, 'Country', item.metadata?.country);
        const desc = item.metadata?.description;
        if (desc) pushDetailRow(rows, 'Bio', desc.length > 400 ? `${desc.slice(0, 400)}…` : desc);
    } else if (mt === 'podcast') {
        pushDetailRow(rows, 'Title', uiH('getItemDisplayName', item));
        pushDetailRow(rows, 'Publisher', item.publisher || item.metadata?.publisher);
        const desc = item.metadata?.description || item.description;
        if (desc) pushDetailRow(rows, 'Description', desc.length > 400 ? `${desc.slice(0, 400)}…` : desc);
    } else if (mt === 'radio') {
        pushDetailRow(rows, 'Station', uiH('getItemDisplayName', item));
        pushDetailRow(rows, 'Frequency', item.frequency || item.metadata?.frequency);
        pushDetailRow(rows, 'Country', item.metadata?.country || item.country);
        const br = item.bitrate || item.metadata?.bitrate;
        pushDetailRow(rows, 'Bitrate', br ? `${br} kbps` : '');
        pushDetailRow(rows, 'Genre', joinDetailList(item.metadata?.genres || item.genres));
    } else if (mt === 'playlist') {
        pushDetailRow(rows, 'Title', uiH('getItemDisplayName', item));
        pushDetailRow(rows, 'Owner', item.owner || item.metadata?.owner);
        pushDetailRow(rows, 'Tracks', item.track_count != null ? String(item.track_count) : '');
        const desc = item.metadata?.description || item.description;
        if (desc) pushDetailRow(rows, 'Description', desc.length > 400 ? `${desc.slice(0, 400)}…` : desc);
    } else if (uiH('isAudiobookItem', item)) {
        pushDetailRow(rows, 'Title', uiH('getItemDisplayName', item));
        pushDetailRow(rows, 'Authors', joinDetailList(item.metadata?.authors));
        pushDetailRow(rows, 'Narrator', joinDetailList(item.metadata?.narrators));
        pushDetailRow(rows, 'Publisher', item.metadata?.publisher);
        pushDetailRow(rows, 'Year', uiH('formatAlbumYear', item));
    } else {
        pushDetailRow(rows, 'Title', uiH('getItemDisplayName', item));
    }

    pushDetailRow(rows, 'URI', item.uri || item.path);
    pushDetailRow(rows, 'Item ID', item.item_id);

    const mappings = item.provider_mappings || item.metadata?.provider_mappings;
    if (Array.isArray(mappings)) {
        mappings.forEach((mapping) => {
            const prov = formatProviderDisplay(
                mapping.provider_instance || mapping.provider_domain || mapping.provider,
            );
            const id = mapping.item_id || mapping.provider_item_id;
            if (!prov || !id) return;
            const lib = mapping.in_library ? ' · in library' : '';
            pushDetailRow(rows, prov, `${id}${lib}`);
        });
    }

    if (item.external_ids && typeof item.external_ids === 'object') {
        Object.entries(item.external_ids).forEach(([key, val]) => {
            if (val) pushDetailRow(rows, key, String(val));
        });
    }

    const sd = queueItem?.streamdetails;
    if (sd) {
        pushDetailRow(rows, 'Stream format', formatDetailCodec(sd.content_type || sd.format));
        pushDetailRow(rows, 'Codec', formatDetailCodec(sd.audio_format || sd.codec));
        const br = sd.bit_rate || sd.bitrate;
        pushDetailRow(rows, 'Bitrate', br ? `${br} kbps` : '');
        pushDetailRow(rows, 'Sample rate', sd.sample_rate ? `${sd.sample_rate} Hz` : '');
        pushDetailRow(rows, 'Channels', sd.channels != null ? String(sd.channels) : '');
        pushDetailRow(rows, 'Path', sd.path);
        const radio = uiH('parseRadioTrackFromMaQueue', queueItem);
        if (radio?.title) pushDetailRow(rows, 'Now playing', radio.title);
        if (radio?.artist) pushDetailRow(rows, 'Now playing artist', radio.artist);
    } else {
        const br = item.bitrate || item.metadata?.bitrate;
        pushDetailRow(rows, 'Bitrate', br ? `${br} kbps` : '');
        pushDetailRow(rows, 'Sample rate', item.metadata?.sample_rate ? `${item.metadata.sample_rate} Hz` : '');
        pushDetailRow(rows, 'Codec', formatDetailCodec(item.metadata?.codec || item.metadata?.format));
    }

    if (item.favorite) pushDetailRow(rows, 'Favorite', 'Yes');

    return rows;
}

function renderDetailsPanel() {
    detailsList.innerHTML = '';
    if (!state.detailsPanelRows.length) {
        detailsList.innerHTML = '<div class="details-row empty"><span class="details-label">No details available</span></div>';
        uiH('updatePanelFocus');
        return;
    }
    state.detailsPanelRows.forEach((row, index) => {
        const el = document.createElement('div');
        el.className = 'details-row';
        el.dataset.index = String(index);
        el.innerHTML = `<span class="details-label">${escapeHtml(row.label)}</span>`
            + `<span class="details-value">${escapeHtml(row.value)}</span>`;
        detailsList.appendChild(el);
    });
    state.panelFocusIndex = Math.max(0, Math.min(state.panelFocusIndex, state.detailsPanelRows.length - 1));
    uiH('updatePanelFocus');
}

async function openDetailsPanel(mediaOrItem, opts = {}) {
    if (!mediaOrItem) return;
    uiH('closeNavMenu');
    uiH('closeSettingsMenu');
    uiH('closeVolumeMenu');
    uiH('closeEqPresetsMenu');
    uiH('closeVizModesMenu');
    uiH('closeBrowseRowMenu');
    uiH('closeQueueRowMenu');
    uiH('closeAllPanels');

    const preliminary = typeof mediaOrItem === 'object' ? mediaOrItem : { uri: mediaOrItem };
    state.detailsPanelOpen = true;
    state.panelFocusIndex = 0;
    state.detailsFocusZone = 'list';
    state.detailsPanelRows = [];
    state.detailsPanelMedia = preliminary;
    state.detailsPanelQueueItem = opts.queueItem || null;
    detailsPanel.classList.add('open');
    detailsPanel.setAttribute('aria-hidden', 'false');
    mainBody.classList.add('show-ui', 'panel-open', 'details-open');
    uiH('syncIdleProgressVisibility');
    uiH('refreshTitleLayout');
    uiH('pauseUiHideTimer');
    uiH('stopDvdFloater');
    uiH('updateFloatState');
    hideDetailsActionsBar();

    detailsPanelTitle.textContent = uiH('getItemDisplayName', preliminary) || 'Details';
    detailsPanelHint.textContent = '';
    detailsList.innerHTML = '<div class="details-row empty"><span class="details-label">Loading…</span></div>';

    const full = await fetchFullDetailsMedia(preliminary);
    const item = full || preliminary;
    state.detailsPanelMedia = item;
    detailsPanelTitle.textContent = uiH('getItemDisplayName', item) || 'Details';
    detailsPanelHint.textContent = buildDetailsSubtitle(item);
    state.detailsPanelRows = buildDetailsRows(item, opts.queueItem || null);
    renderDetailsActionsBar(item);
    renderDetailsPanel();
}

function closeDetailsPanel() {
    if (!state.detailsPanelOpen) return;
    state.detailsPanelOpen = false;
    state.detailsFocusZone = 'list';
    state.detailsPanelRows = [];
    state.detailsPanelMedia = null;
    state.detailsPanelQueueItem = null;
    hideDetailsActionsBar();
    detailsPanel.classList.remove('open');
    detailsPanel.setAttribute('aria-hidden', 'true');
    detailsList.innerHTML = '';
    mainBody.classList.remove('details-open');
    if (!state.browsePanelOpen && !state.queuePanelOpen && !state.playersPanelOpen) {
        mainBody.classList.remove('panel-open');
    }
    uiH('schedulePlaybackStackRelayoutAfterStage');
    uiH('resumeUiHideTimer');
    uiH('updateFloatState');
}

export {
    fetchFullDetailsMedia,
    supportsDetailsItem,
    buildDetailsSubtitle,
    buildDetailsRows,
    renderDetailsPanel,
    openDetailsPanel,
    closeDetailsPanel,
    bindDetailsPanelBack,
};

function bindDetailsPanelBack(onBack) {
    detailsPanelBackBtn?.addEventListener('click', () => onBack());
}
