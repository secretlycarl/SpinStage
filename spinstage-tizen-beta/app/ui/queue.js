/**
 * Queue side panel: list, reorder, row menu, save-as-playlist, autoplay chips.
 * Cross-module callbacks use ui/handlers.js (wired in spinstage-app.js).
 */
import { state } from '../state.js';
import { QUEUE_PAGE_SIZE } from '../constants.js';
import {
    mainBody,
    queueBtn,
    queuePanel,
    queuePanelTitle,
    queueList,
    queueSyncActions,
    queueClearBtn,
    queueAutoplayBtn,
    queueSavePlaylistBtn,
    queueSavePlaylistLabel,
    queueSavePlaylistInput,
    queueAutoplayIcon,
    queueAutoplayLabel,
    queueRowMenu,
} from '../dom.js';
import { maClient } from '../ma/client.js';
import { itemProviderId, formatMaDuration, isLibraryLikeProvider } from '../util/providers.js';
import { getArtUrl } from '../util/art.js';
import { uiH } from './handlers.js';
import { syncAllAndroidChipSections } from './android-chip-sections.js';
import { isRadioMedia, isNowPlayingRadio, syncMaNowPlayingIfChanged } from '../playback/now-playing.js';
import { openDetailsPanel, supportsDetailsItem } from './details.js';


function createProviderBadgeElement(providerId) {
    const icon = document.createElement('img');
    const libraryLike = isLibraryLikeProvider(providerId);
    icon.className = 'panel-row-provider';
    if (libraryLike || uiH('providerIconMono', providerId)) {
        icon.classList.add('provider-icon-mono');
    } else {
        icon.classList.add('provider-icon-color');
    }
    icon.src = libraryLike ? 'icons/library.svg' : `icons/${uiH('providerIcon', providerId)}`;
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

function createLoadMoreRow(index, remaining) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'panel-row load-more';
    row.dataset.index = String(index);
    appendRowContent(row, {
        title: 'Load more',
        subtitle: `${remaining} more tracks`,
        icon: 'add.svg',
    });
    row.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const until = uiH('getIgnoreClickUntil');
        if (Date.now() < until) return;
        state.panelFocusIndex = index;
        activateQueueRow(index);
    });
    return row;
}

const QUEUE_CONTEXT_TYPES = new Set(['playlist', 'album', 'artist', 'podcast', 'genre']);



function getQueueAutoplaySource(queue) {
    const enqueued = queue?.enqueued_media_items;
    if (Array.isArray(enqueued) && enqueued.length) {
        return enqueued[enqueued.length - 1];
    }
    return queue?.current_item?.media_item || null;
}



function queueSupportsAutoplay(queue) {
    if (!queue?.items) return false;
    if (!uiH('hasSimilarTracksSupport')) return false;
    if (isNowPlayingRadio()) return false;
    const currentMedia = queue?.current_item?.media_item;
    if (currentMedia) {
        if (isRadioMedia(currentMedia)) return false;
        const currentType = uiH('inferMediaType', currentMedia);
        if (['podcast', 'audiobook', 'podcast_episode', 'episode'].includes(currentType)) {
            return false;
        }
    }
    const source = getQueueAutoplaySource(queue);
    const sourceMt = source ? uiH('inferMediaType', source) : '';
    if (sourceMt === 'genre') return false;
    return uiH('seedSupportsAutoplay', source);
}



function syncQueueActionChips(queue = maClient.activeQueue) {
    if (!queueClearBtn || !queueAutoplayBtn) return;
    const itemCount = queue?.items ?? state.queueTotalCount ?? 0;
    const hasQueue = !!maClient.queueId;
    queueClearBtn.disabled = !hasQueue || itemCount <= 0;
    const canAutoplay = queueSupportsAutoplay(queue);
    queueAutoplayBtn.hidden = !canAutoplay;
    if (canAutoplay) {
        const on = !!queue?.dont_stop_the_music_enabled;
        queueAutoplayBtn.classList.toggle('active', on);
        if (queueAutoplayIcon) {
            queueAutoplayIcon.src = on ? 'icons/autoplay-on.svg' : 'icons/autoplay-off.svg';
        }
        if (queueAutoplayLabel) {
            queueAutoplayLabel.textContent = on ? 'Disable Autoplay' : 'Enable Autoplay';
        }
    }
    if (queueSavePlaylistBtn) {
        const canSave = hasQueue && itemCount > 0;
        queueSavePlaylistBtn.hidden = !canSave;
        queueSavePlaylistBtn.disabled = !canSave || state.queuePlaylistSaved || state.queueSavePlaylistMode;
        if (queueSavePlaylistLabel) {
            queueSavePlaylistLabel.textContent = state.queuePlaylistSaved ? 'Playlist Saved' : 'Save as Playlist';
        }
    }
    const showBar = hasQueue && (!queueClearBtn.disabled || !queueAutoplayBtn.hidden
        || (queueSavePlaylistBtn && !queueSavePlaylistBtn.hidden));
    if (queueSyncActions) {
        queueSyncActions.setAttribute('aria-hidden', showBar ? 'false' : 'true');
    }
    state.queueActionFocusIndex = Math.min(
        state.queueActionFocusIndex,
        Math.max(0, getVisibleQueueActionButtons().length - 1),
    );
    syncAllAndroidChipSections();
}



function getVisibleQueueActionButtons() {
    const btns = [];
    if (queueClearBtn && !queueClearBtn.hidden) btns.push(queueClearBtn);
    if (queueSavePlaylistBtn && !queueSavePlaylistBtn.hidden) btns.push(queueSavePlaylistBtn);
    if (queueAutoplayBtn && !queueAutoplayBtn.hidden) btns.push(queueAutoplayBtn);
    return btns;
}



function openQueueSavePlaylistInput() {
    if (!queueSavePlaylistInput || state.queuePlaylistSaved) return;
    state.queueSavePlaylistMode = true;
    queueSavePlaylistInput.value = '';
    queueSavePlaylistInput.style.display = 'block';
    syncQueueActionChips();
    queueSavePlaylistInput.focus();
}



function closeQueueSavePlaylistInput() {
    if (!queueSavePlaylistInput) return;
    state.queueSavePlaylistMode = false;
    queueSavePlaylistInput.value = '';
    queueSavePlaylistInput.style.display = 'none';
    syncQueueActionChips();
}



async function confirmQueueSavePlaylist() {
    const name = (queueSavePlaylistInput?.value || '').trim();
    if (!name) {
        closeQueueSavePlaylistInput();
        return;
    }
    try {
        uiH('setStatus', 'Saving playlist…', 'connected');
        await maClient.saveQueueAsPlaylist(name);
        state.queuePlaylistSaved = true;
        uiH('setStatus', `Saved “${name}”`, 'connected');
    } catch (err) {
        console.warn('save as playlist failed:', err);
        uiH('setStatus', 'save playlist failed', 'error');
    }
    closeQueueSavePlaylistInput();
}



async function activateQueueAction() {
    const btn = getVisibleQueueActionButtons()[state.queueActionFocusIndex];
    if (!btn || btn.disabled) return;
    if (btn === queueClearBtn) {
        try {
            await maClient.clearQueue();
            await maClient.refreshActiveQueue();
            if (state.queuePanelOpen) loadQueueItems(true);
        } catch (err) {
            console.warn('clear queue failed:', err);
        }
        return;
    }
    if (btn === queueAutoplayBtn) {
        try {
            const next = !maClient.activeQueue?.dont_stop_the_music_enabled;
            await maClient.setDontStopTheMusic(next);
        } catch (err) {
            console.warn('don\'t stop the music failed:', err);
        }
        return;
    }
    if (btn === queueSavePlaylistBtn) {
        openQueueSavePlaylistInput();
    }
}



function getQueueCurrentIndex() {
    const q = maClient.activeQueue;
    if (!q) return 0;
    if (q.current_index != null) return q.current_index;
    if (q.index_in_buffer != null) return q.index_in_buffer;
    return 0;
}



function alignQueueItemsToCurrent(items) {
    const currentId = maClient.activeQueue?.current_item?.queue_item_id;
    if (!currentId || !items?.length) return items || [];
    const idx = items.findIndex((item) => item.queue_item_id === currentId);
    if (idx <= 0) return items;
    state.queueListOffset += idx;
    return items.slice(idx);
}



function syncQueuePlayingHighlight() {
    const currentId = maClient.activeQueue?.current_item?.queue_item_id;
    getQueueListRows().forEach((row, i) => {
        const item = state.queueItems[i];
        const playing = !!currentId && item?.queue_item_id === currentId;
        row.classList.toggle('playing', playing);
    });
}



function queueNeedsItemReload() {
    const currentId = maClient.activeQueue?.current_item?.queue_item_id;
    const expectedOffset = getQueueCurrentIndex();
    if (state.queueListOffset !== expectedOffset) return true;
    if (!currentId || !state.queueItems.length) return true;
    return !state.queueItems.some((item) => item.queue_item_id === currentId);
}



function applyQueueReload(forceItems = false, opts = {}) {
    if (!state.queuePanelOpen) return;
    if (state.queueLoading) {
        state.queueReloadPending = true;
        state.queueReloadForce = state.queueReloadForce || forceItems;
        return;
    }
    const prevCurrent = opts.prevCurrent
        ?? maClient.activeQueue?.current_item?.queue_item_id;
    const prevCount = opts.prevCount
        ?? (maClient.activeQueue?.items ?? state.queueTotalCount);
    const currentItem = maClient.activeQueue?.current_item;
    const nextCount = maClient.activeQueue?.items ?? 0;
    const currentChanged = prevCurrent !== currentItem?.queue_item_id;
    const countChanged = prevCount !== nextCount;
    updateQueuePanelHeader();
    if (!forceItems && currentChanged && !countChanged && !queueNeedsItemReload()
        && state.queueItems.length > 0) {
        syncQueuePlayingHighlight();
        if (currentChanged) state.panelFocusIndex = 0;
        uiH('updatePanelFocus');
        return;
    }
    if (forceItems || currentChanged || countChanged || queueNeedsItemReload()) {
        loadQueueItems(true, { skipQueueRefresh: opts.skipQueueRefresh });
        if (currentChanged) state.panelFocusIndex = 0;
    } else {
        syncQueuePlayingHighlight();
    }
}



function scheduleQueueReload(forceItems = false, opts = {}) {
    if (state.queueReorderMode || state.queueReorderDragging) {
        state.queueReloadPending = true;
        state.queueReloadForce = state.queueReloadForce || forceItems;
        return;
    }
    clearTimeout(state.queueReloadTimer);
    state.queueReloadTimer = setTimeout(async () => {
        const prevCurrent = maClient.activeQueue?.current_item?.queue_item_id;
        const prevCount = maClient.activeQueue?.items ?? state.queueTotalCount;
        if (!opts.skipQueueRefresh) {
            await maClient.refreshActiveQueue();
        }
        syncMaNowPlayingIfChanged(prevCurrent);
        applyQueueReload(forceItems, { prevCurrent, prevCount, skipQueueRefresh: true });
    }, 200);
}



function queueItemToPanelRow(item) {
    const media = item.media_item || item;
    const artist = uiH('mediaItemSubtitle', media) || media?.album?.name || '';
    const mediaType = uiH('inferMediaType', media);
    const currentId = maClient.activeQueue?.current_item?.queue_item_id;
    return {
        title: uiH('getItemDisplayName', media) || item.name || 'Unknown',
        subtitle: artist,
        thumbUrl: uiH('getBrowseThumbUrl', media) || getArtUrl(media) || '',
        icon: uiH('mediaTypeIcon', mediaType, media?.provider),
        providerBadge: itemProviderId(media),
        duration: formatMaDuration(item.duration),
        kind: 'playable',
        queue_item_id: item.queue_item_id,
        index: item.index,
        playing: !!currentId && item.queue_item_id === currentId,
    };
}



async function loadQueueItems(reset = false, opts = {}) {
    if (state.queueLoading) return;
    state.queueLoading = true;
    try {
        await maClient.ensureReady();
        if (!opts.skipQueueRefresh) {
            await maClient.refreshActiveQueue();
        }
        const totalItems = maClient.activeQueue?.items ?? 0;
        if (!maClient.queueId || totalItems === 0) {
            state.queueItems = [];
            state.queueListOffset = 0;
            state.queueTotalCount = 0;
            // Clear the loading flag before rendering so the empty queue
            // shows "Nothing in Queue" instead of getting stuck on
            // "Loading…" (the finally below only runs after this render).
            state.queueLoading = false;
            if (state.queuePanelOpen) renderQueuePanel();
            return;
        }
        if (reset) {
            state.queueListOffset = getQueueCurrentIndex();
        }
        const fetchOffset = reset
            ? state.queueListOffset
            : (state.queueListOffset + state.queueItems.length);
        let batch = await maClient.fetchQueueItems(fetchOffset, QUEUE_PAGE_SIZE);
        batch = alignQueueItemsToCurrent(batch);
        state.queueItems = reset ? batch : state.queueItems.concat(batch);
        state.queueTotalCount = Math.max(0, totalItems - state.queueListOffset);
        if (state.queuePanelOpen) renderQueuePanel();
    } catch (err) {
        console.warn('queue load failed:', err);
        if (reset) {
            state.queueItems = [];
            state.queueListOffset = 0;
        }
        if (state.queuePanelOpen) renderQueuePanel();
    } finally {
        state.queueLoading = false;
        if (state.queueReloadPending) {
            const force = state.queueReloadForce;
            state.queueReloadPending = false;
            state.queueReloadForce = false;
            applyQueueReload(force);
        }
    }
}



function getQueueGoToTargets(media) {
    if (!media) return [];
    const fakeItem = {
        raw: media,
        mediaType: uiH('inferMediaType', media),
    };
    return uiH('getBrowseGoToTargets', fakeItem);
}



function radioModeLabelForMedia(media) {
    const labels = {
        track: 'Track Radio',
        artist: 'Artist Radio',
        album: 'Album Radio',
        playlist: 'Playlist Radio',
    };
    return labels[uiH('inferMediaType', media)] || 'Radio';
}



function getQueueMenuActions(index) {
    const actions = [
        { id: 'play', label: 'Play', icon: 'play-now.svg' },
        { id: 'remove', label: 'Remove', icon: 'remove.svg' },
        { id: 'reorder', label: 'Change Order', icon: 'menu.svg' },
    ];
    const item = state.queueItems[index];
    const media = item?.media_item || item;
    getQueueGoToTargets(media).forEach((target) => actions.push(target));
    if (supportsDetailsItem(media)) {
        actions.push({ id: 'details', label: 'Details', icon: 'search.svg' });
    }
    if (uiH('seedSupportsAutoplay', media)) {
        actions.push({
            id: 'radio_mode',
            label: radioModeLabelForMedia(media),
            icon: 'radio.svg',
        });
    }
    return actions;
}



function getQueueItemId(item) {
    return item?.queue_item_id ?? item?.index ?? '';
}



function findQueueIndexByItemId(itemId) {
    if (!itemId) return -1;
    return state.queueItems.findIndex((item) => getQueueItemId(item) === itemId);
}



function syncQueueReorderIndexFromItemId() {
    if (!state.queueReorderMode || !state.queueReorderItemId) return;
    const idx = findQueueIndexByItemId(state.queueReorderItemId);
    if (idx >= 0) {
        state.queueReorderIndex = idx;
        state.panelFocusIndex = idx;
    }
}



function reorderQueueRowDom(fromIndex, toIndex) {
    const rows = Array.from(getQueueListRows()).filter((r) => !r.classList.contains('load-more'));
    const row = rows[fromIndex];
    if (!row) return;
    const ref = rows[toIndex];
    if (fromIndex < toIndex) {
        ref?.after(row);
    } else if (ref) {
        ref.before(row);
    }
    Array.from(getQueueListRows()).filter((r) => !r.classList.contains('load-more'))
        .forEach((el, i) => {
            el.dataset.index = String(i);
        });
}



function applyQueueReorderLocal(targetIndex) {
    syncQueueReorderIndexFromItemId();
    const index = state.queueReorderIndex;
    const goal = Math.max(0, Math.min(targetIndex, state.queueItems.length - 1));
    if (index < 0 || index === goal) return;
    const moved = state.queueItems.splice(index, 1)[0];
    state.queueItems.splice(goal, 0, moved);
    state.queueReorderIndex = goal;
    state.queueReorderItemId = String(getQueueItemId(moved) || '');
    state.panelFocusIndex = goal;
    reorderQueueRowDom(index, goal);
}



function getQueueReorderRowStepHeight() {
    if (state.queueReorderDragRowHeight > 0) return state.queueReorderDragRowHeight;
    const rows = Array.from(getQueueListRows()).filter((r) => !r.classList.contains('load-more'));
    const row = rows[state.queueReorderIndex];
    const height = row?.getBoundingClientRect().height;
    return Math.max(36, height || 48);
}



const QUEUE_DRAG_SCROLL_EDGE = 56;
const QUEUE_DRAG_SCROLL_MAX = 14;



function scrollQueueListWhileDragging(clientY) {
    if (!queueList) return;
    const rect = queueList.getBoundingClientRect();
    if (clientY < rect.top + QUEUE_DRAG_SCROLL_EDGE) {
        const intensity = (rect.top + QUEUE_DRAG_SCROLL_EDGE - clientY) / QUEUE_DRAG_SCROLL_EDGE;
        queueList.scrollTop -= Math.ceil(QUEUE_DRAG_SCROLL_MAX * Math.max(1, intensity));
    } else if (clientY > rect.bottom - QUEUE_DRAG_SCROLL_EDGE) {
        const intensity = (clientY - (rect.bottom - QUEUE_DRAG_SCROLL_EDGE)) / QUEUE_DRAG_SCROLL_EDGE;
        queueList.scrollTop += Math.ceil(QUEUE_DRAG_SCROLL_MAX * Math.max(1, intensity));
    }
}



function ensureQueueDragRowVisible() {
    const rows = Array.from(getQueueListRows()).filter((r) => !r.classList.contains('load-more'));
    const row = rows[state.queueReorderIndex];
    row?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}



function applyQueueDragPointerStep(clientY) {
    syncQueueReorderIndexFromItemId();
    if (state.queueReorderDragStepY == null) return;

    const rowHeight = getQueueReorderRowStepHeight();
    const deltaSlots = Math.round((clientY - state.queueReorderDragStepY) / rowHeight);
    const startIdx = state.queueReorderDragStartIndex;
    const goal = Math.max(0, Math.min(startIdx + deltaSlots, state.queueItems.length - 1));

    if (goal !== state.queueReorderIndex) {
        applyQueueReorderLocal(goal);
    }

    scrollQueueListWhileDragging(clientY);
    ensureQueueDragRowVisible();
}



async function flushQueueReorderDragApi() {
    if (!state.queueReorderMode) return;
    syncQueueReorderIndexFromItemId();
    const shift = state.queueReorderIndex - state.queueReorderDragStartIndex;
    if (shift === 0) return;
    const item = state.queueItems[state.queueReorderIndex];
    if (!item) return;
    const itemId = getQueueItemId(item);
    try {
        await maClient.moveQueueItem(itemId, shift);
        state.queueReorderDragStartIndex = state.queueReorderIndex;
    } catch (err) {
        console.warn('move queue item failed:', err);
        scheduleQueueReload(true);
    }
}



function bindQueueReorderDrag(handle, rowEl) {
    handle.addEventListener('pointerdown', (e) => {
        syncQueueReorderIndexFromItemId();
        if (!state.queueReorderMode) return;
        if (rowEl.dataset.queueItemId !== state.queueReorderItemId) return;
        if (Date.now() < uiH('getIgnoreClickUntil')) return;
        e.preventDefault();
        e.stopPropagation();
        state.queueReorderDragging = true;
        state.queueReorderDragStartIndex = state.queueReorderIndex;
        state.queueReorderDragStepY = e.clientY;
        const rows = Array.from(getQueueListRows()).filter((r) => !r.classList.contains('load-more'));
        const startRow = rows[state.queueReorderIndex];
        const startRect = startRow?.getBoundingClientRect();
        state.queueReorderDragRowHeight = Math.max(36, startRect?.height || 48);
        const pointerId = e.pointerId;
        try {
            handle.setPointerCapture(pointerId);
        } catch (_) {
            /* pointer capture optional on some WebViews */
        }
        let dragMoved = false;
        const onMove = (ev) => {
            if (ev.pointerId !== pointerId) return;
            ev.preventDefault();
            dragMoved = true;
            applyQueueDragPointerStep(ev.clientY);
        };
        const onUp = (ev) => {
            if (ev.pointerId !== pointerId) return;
            state.queueReorderDragging = false;
            state.queueReorderDragStepY = null;
            state.queueReorderDragRowHeight = 48;
            try {
                handle.releasePointerCapture(pointerId);
            } catch (_) {
                /* ignore */
            }
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);
            if (!dragMoved) {
                finishQueueReorder();
            } else {
                void flushQueueReorderDragApi();
                uiH('updatePanelFocus');
            }
        };
        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
    });
}



function bindQueueRowInteraction(rowEl, rowIndex) {
    const activateAt = async (subFocus) => {
        state.panelFocusIndex = rowIndex;
        state.queueRowSubFocus = subFocus;
        uiH('updatePanelFocus');
        if (subFocus === 1) {
            openQueueRowMenu(rowIndex);
            return;
        }
        await playQueueFromIndex(rowIndex);
    };
    if (rowEl.classList.contains('panel-row-wrap')) {
        const main = rowEl.querySelector('[data-sub="main"]');
        const menuBtn = rowEl.querySelector('[data-sub="menu"]');
        if (main) {
            main.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (Date.now() < uiH('getIgnoreClickUntil')) return;
                void activateAt(0);
            });
        }
        if (menuBtn) {
            menuBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (Date.now() < uiH('getIgnoreClickUntil')) return;
                void activateAt(1);
            });
        }
    }
}



function createQueueRow(item, rowIndex) {
    const wrap = document.createElement('div');
    wrap.className = 'panel-row-wrap';
    wrap.dataset.index = String(rowIndex);
    const queueItemId = item.queue_item_id;
    if (queueItemId) wrap.dataset.queueItemId = String(queueItemId);
    if (item.playing) wrap.classList.add('playing');

    const reorderHandle = document.createElement('button');
    reorderHandle.type = 'button';
    reorderHandle.className = 'queue-reorder-handle';
    reorderHandle.dataset.sub = 'reorder';
    reorderHandle.setAttribute('aria-label', 'Drag to reorder');
    reorderHandle.innerHTML = '<img src="icons/menu.svg" alt="">';
    bindQueueReorderDrag(reorderHandle, wrap);

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'panel-row-main';
    main.dataset.sub = 'main';
    appendRowContent(main, item);
    if (item.playing) main.classList.add('playing');

    const actions = document.createElement('div');
    actions.className = 'panel-row-actions';
    const menuAction = document.createElement('button');
    menuAction.type = 'button';
    menuAction.className = 'panel-row-action';
    menuAction.dataset.sub = 'menu';
    menuAction.setAttribute('aria-label', 'Queue item actions');
    menuAction.innerHTML = '<img src="icons/info.svg" alt="">';
    actions.appendChild(menuAction);

    wrap.appendChild(reorderHandle);
    wrap.appendChild(main);
    if (item.providerBadge) appendProviderBadge(wrap, item.providerBadge);
    wrap.appendChild(actions);
    bindQueueRowInteraction(wrap, rowIndex);
    return wrap;
}



function getQueueRowSubTargets(rowEl) {
    if (!rowEl) return [];
    if (rowEl.classList.contains('panel-row-wrap')) {
        return [
            rowEl.querySelector('[data-sub="main"]'),
            rowEl.querySelector('[data-sub="menu"]'),
        ].filter(Boolean);
    }
    return [rowEl];
}



function getQueueListRows() {
    return queueList.querySelectorAll(':scope > .panel-row-wrap, :scope > .panel-row');
}



function rememberQueueContext(label) {
    if (label) state.lastQueueContext = String(label).trim();
}



function queueContextLabelFromItem(item) {
    if (!item) return '';
    if (isRadioMedia(item)) return '';
    const mt = uiH('inferMediaType', item);
    if (mt === 'audiobook' || mt === 'audiobook_chapter') return '';
    if (mt === 'track') return '';
    if (mt === 'podcast' || uiH('isPodcastShow', item)) return item.name || '';
    if (uiH('isPodcastEpisode', item) || mt === 'podcast_episode' || mt === 'episode') {
        return uiH('pickPodcastName', item) || item.podcast?.name || '';
    }
    if (QUEUE_CONTEXT_TYPES.has(mt)) return item.name || '';
    return '';
}



function getQueueContextLabel(queue) {
    if (!queue?.items) return '';
    const current = queue.current_item?.media_item;
    if (current && isRadioMedia(current)) return '';
    const currentMt = current ? uiH('inferMediaType', current) : '';
    if (currentMt === 'audiobook' || currentMt === 'audiobook_chapter') return '';

    const enqueued = Array.isArray(queue.enqueued_media_items) ? queue.enqueued_media_items : [];
    for (let i = enqueued.length - 1; i >= 0; i--) {
        const label = queueContextLabelFromItem(enqueued[i]);
        if (label) return label;
    }

    const saved = state.lastQueueContext?.trim();
    if (saved) return saved;

    const active = queue.extra_attributes?.active_playlist?.trim();
    if (!active) return '';

    const currentName = (current?.name || '').trim().toLowerCase();
    const parts = active.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (currentName && part.toLowerCase() === currentName) continue;
        const match = enqueued.find((e) => e?.name === part);
        if (match) {
            const label = queueContextLabelFromItem(match);
            if (label) return label;
            continue;
        }
        if (parts.length === 1) return part;
    }
    return '';
}



function updateQueuePanelHeader() {
    if (!queuePanelTitle) return;
    const context = getQueueContextLabel(maClient.activeQueue);
    queuePanelTitle.textContent = context ? `Queue – ${context}` : 'Queue';
    syncQueueActionChips();
}



function renderQueuePanel() {
    updateQueuePanelHeader();
    queueList.innerHTML = '';
    queueList.closest('.media-panel')?.querySelector('.panel-header')?.classList.remove('panel-header-compact');
    delete queueList.dataset.userScrolled;
    if (!state.queueItems.length) {
        const empty = document.createElement('div');
        empty.className = 'panel-divider panel-status';
        if (state.queueLoading) {
            uiH('setPanelStatusText', empty, 'Loading');
        } else {
            empty.className = 'panel-divider panel-empty-message';
            empty.textContent = 'Nothing in Queue';
        }
        queueList.appendChild(empty);
        uiH('updatePanelFocus');
        return;
    }
    const divider = document.createElement('div');
    divider.className = 'panel-divider';
    divider.textContent = 'Now playing';
    queueList.appendChild(divider);
    state.queueItems.forEach((item, index) => {
        const row = queueItemToPanelRow(item);
        queueList.appendChild(createQueueRow(row, index));
    });
    const remaining = Math.max(0, state.queueTotalCount - state.queueItems.length);
    if (remaining > 0) {
        queueList.appendChild(createLoadMoreRow(state.queueItems.length, remaining));
    }
    uiH('updatePanelFocus');
}



function activateQueueRow(index) {
    if (state.queueReorderMode) return;
    const rows = getQueueListRows();
    const row = rows[index];
    if (!row) return;
    if (row.classList.contains('load-more')) {
        playQueueFromIndex(index);
        return;
    }
    if (state.queueRowSubFocus === 1) {
        openQueueRowMenu(index);
        return;
    }
    playQueueFromIndex(index);
}



function closeQueueRowMenu() {
    if (!state.queueRowMenuOpen) return;
    state.queueRowMenuOpen = false;
    state.queueRowMenuIndex = -1;
    state.queueMenuFocusIndex = 0;
    state.queueMenuActions = [];
    state.queueMenuActionEls = [];
    queueRowMenu.classList.remove('open');
    queueRowMenu.setAttribute('aria-hidden', 'true');
    queueRowMenu.innerHTML = '';
    uiH('resetPanelRowMenuPosition', queueRowMenu);
    uiH('updatePanelFocus');
}



function openQueueRowMenu(index) {
    void openQueueRowMenuAsync(index);
}

async function openQueueRowMenuAsync(index) {
    const rows = getQueueListRows();
    const row = rows[index];
    if (!row || row.classList.contains('load-more')) return;
    const media = state.queueItems[index]?.media_item || state.queueItems[index];
    let actions = getQueueMenuActions(index);
    if (!actions.length) return;
    if (state.queueRowMenuOpen && state.queueRowMenuIndex === index) {
        closeQueueRowMenu();
        return;
    }
    closeQueueRowMenu();
    state.queueRowMenuIndex = index;
    state.queueMenuFocusIndex = 0;
    state.queueRowMenuOpen = true;
    state.queueMenuActions = actions;
    state.queueMenuActionEls = uiH('renderPanelRowMenu', queueRowMenu, actions, 'queue-row-menu-item');
    state.queueMenuActionEls.forEach((btn, actionIndex) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.queueMenuFocusIndex = actionIndex;
            void activateQueueMenuItem();
        });
    });
    queueRowMenu.classList.add('open');
    queueRowMenu.setAttribute('aria-hidden', 'false');
    uiH('positionPanelRowMenu', row, queueRowMenu);
    uiH('updatePanelFocus');

    const menuGen = (state._queueExtrasMenuGen = (state._queueExtrasMenuGen || 0) + 1);
    void uiH('warmTrackExtrasCache', media).then(() => {
        if (menuGen !== state._queueExtrasMenuGen) return;
        if (!state.queueRowMenuOpen || state.queueRowMenuIndex !== index) return;
        const updated = getQueueMenuActions(index);
        const prevIds = (state.queueMenuActions || []).map((a) => a.id).join('\0');
        const nextIds = updated.map((a) => a.id).join('\0');
        if (prevIds === nextIds) return;
        state.queueMenuFocusIndex = Math.min(state.queueMenuFocusIndex, updated.length - 1);
        state.queueMenuActions = updated;
        state.queueMenuActionEls = uiH('renderPanelRowMenu', queueRowMenu, updated, 'queue-row-menu-item');
        state.queueMenuActionEls.forEach((btn, actionIndex) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                state.queueMenuFocusIndex = actionIndex;
                void activateQueueMenuItem();
            });
        });
        uiH('updatePanelFocus');
    });
}



function moveQueueMenuFocus(delta) {
    let idx = state.queueMenuFocusIndex + delta;
    while (idx >= 0 && idx < state.queueMenuActionEls.length) {
        state.queueMenuFocusIndex = idx;
        uiH('updatePanelFocus');
        return;
    }
}



function moveQueueRowSubFocus(delta) {
    const row = getQueueListRows()[state.panelFocusIndex];
    if (!row?.classList.contains('panel-row-wrap')) return false;
    state.queueRowSubFocus = Math.max(0, Math.min(state.queueRowSubFocus + delta, 1));
    uiH('updatePanelFocus');
    return true;
}



async function activateQueueMenuItem() {
    const action = state.queueMenuActions[state.queueMenuFocusIndex];
    const index = state.queueRowMenuIndex;
    if (!action || index < 0) return;
    const media = state.queueItems[index]?.media_item || state.queueItems[index];
    closeQueueRowMenu();
    try {
        if (action.id === 'play') {
            await playQueueFromIndex(index);
        } else if (action.id === 'remove') {
            await removeQueueItem(index);
        } else if (action.id === 'reorder') {
            startQueueReorder(index);
        } else if (action.id === 'go_artist') {
            await uiH('navigateBrowseToArtist', media);
        } else if (action.id === 'go_album') {
            await uiH('navigateBrowseToAlbum', media);
        } else if (action.id === 'go_podcast') {
            await uiH('navigateBrowseToPodcast', media);
        } else if (action.id === 'go_playlist') {
            await uiH('navigateBrowseToPlaylist', media);
        } else if (action.id === 'go_other_versions' || action.id === 'go_similar_tracks') {
            await uiH('handleTrackExtrasGoTo', action.id, media);
        } else if (action.id === 'details') {
            await openDetailsPanel(media, { queueItem: state.queueItems[index] });
        } else if (action.id === 'radio_mode') {
            await uiH('startRadioForMedia', media);
        }
    } catch (err) {
        console.warn('queue menu action failed:', err);
    }
}



function startQueueReorder(index) {
    closeQueueRowMenu();
    const item = state.queueItems[index];
    state.queueReorderItemId = String(getQueueItemId(item) || '');
    state.queueReorderMode = true;
    state.queueReorderIndex = index;
    state.panelFocusIndex = index;
    uiH('updatePanelFocus');
}



function finishQueueReorder() {
    if (!state.queueReorderMode) return;
    state.queueReorderMode = false;
    state.queueReorderDragging = false;
    state.queueReorderIndex = -1;
    state.queueReorderItemId = '';
    state.queueReorderDragTarget = -1;
    state.queueReorderDragStartIndex = -1;
    state.queueReorderDragStepY = null;
    state.queueReorderDragRowHeight = 48;
    uiH('updatePanelFocus');
    if (state.queueReloadPending) {
        const force = state.queueReloadForce;
        state.queueReloadPending = false;
        state.queueReloadForce = false;
        scheduleQueueReload(force);
    } else {
        void loadQueueItems(true);
    }
}



async function moveQueueReorderTo(targetIndex) {
    if (!state.queueReorderMode || state.queueReorderMoveInFlight) return;
    syncQueueReorderIndexFromItemId();
    const index = state.queueReorderIndex;
    const goal = Math.max(0, Math.min(targetIndex, state.queueItems.length - 1));
    if (index < 0 || index === goal) return;
    const item = state.queueItems[index];
    if (!item) return;
    const itemId = getQueueItemId(item);
    const shift = goal - index;
    state.queueReorderMoveInFlight = true;
    try {
        await maClient.moveQueueItem(itemId, shift);
        const moved = state.queueItems.splice(index, 1)[0];
        state.queueItems.splice(goal, 0, moved);
        state.queueReorderIndex = goal;
        state.queueReorderItemId = String(getQueueItemId(moved) || '');
        state.panelFocusIndex = goal;
        renderQueuePanel();
    } catch (err) {
        console.warn('move queue item failed:', err);
        scheduleQueueReload(true);
    } finally {
        state.queueReorderMoveInFlight = false;
    }
}



async function moveQueueReorder(delta) {
    syncQueueReorderIndexFromItemId();
    await moveQueueReorderTo(state.queueReorderIndex + delta);
}



async function playQueueFromIndex(index) {
    const rows = getQueueListRows();
    const row = rows[index];
    if (!row) return;
    if (row.classList.contains('load-more')) {
        await loadQueueItems(false);
        state.panelFocusIndex = index;
        uiH('updatePanelFocus');
        return;
    }
    const item = state.queueItems[index];
    if (!item) return;
    try {
        await maClient.playQueueIndex(item.queue_item_id ?? item.index);
        closeQueueRowMenu();
        state.panelFocusIndex = 0;
        uiH('showUI');
        await uiH('afterMaPlayback');
    } catch (err) {
        console.warn('play queue index failed:', err);
    }
}



async function removeQueueItem(index) {
    const item = state.queueItems[index];
    if (!item) return;
    try {
        await maClient.deleteQueueItem(item.queue_item_id ?? item.index);
        closeQueueRowMenu();
        scheduleQueueReload(true);
        state.panelFocusIndex = Math.min(state.panelFocusIndex, Math.max(0, state.queueItems.length - 1));
        uiH('updatePanelFocus');
    } catch (err) {
        console.warn('remove queue item failed:', err);
    }
}



function closeQueuePanel() {
    if (!state.queuePanelOpen) return;
    closeQueueRowMenu();
    finishQueueReorder();
    closeQueueSavePlaylistInput();
    state.queuePanelOpen = false;
    queuePanel.classList.remove('open');
    queuePanel.setAttribute('aria-hidden', 'true');
    queueBtn.classList.remove('active');
    mainBody.classList.remove('queue-open');
    if (!state.browsePanelOpen && !state.playersPanelOpen && !state.detailsPanelOpen) mainBody.classList.remove('panel-open');
    uiH('invalidateIdleProgressVisibility');
    uiH('syncIdleProgressVisibility');
    uiH('schedulePlaybackStackRelayoutAfterStage');
    uiH('resumeUiHideTimer');
    uiH('updateFloatState');
}



function openQueuePanel() {
    uiH('closeSettingsMenu');
    uiH('closeNavMenu');
    uiH('closeVolumeMenu');
    uiH('closeBrowsePanel');
    uiH('closePlayersPanel');
    uiH('closeDetailsPanel');
    closeQueueRowMenu();
    finishQueueReorder();
    uiH('syncPanelInputModeForOpen');
    state.queueFocusZone = 'list';
    state.queueActionFocusIndex = 0;
    state.queuePlaylistSaved = false;
    closeQueueSavePlaylistInput();
    state.queuePanelOpen = true;
    state.panelFocusIndex = 0;
    state.queueRowSubFocus = 0;
    queuePanel.classList.add('open');
    queuePanel.setAttribute('aria-hidden', 'false');
    queueBtn.classList.add('active');
    mainBody.classList.add('show-ui', 'panel-open', 'queue-open');
    uiH('invalidateIdleProgressVisibility');
    uiH('syncIdleProgressVisibility');
    uiH('refreshTitleLayout');
    uiH('pauseUiHideTimer');
    uiH('stopDvdFloater');
    maClient.refreshActiveQueue().then(() => {
        updateQueuePanelHeader();
        syncQueueActionChips();
        loadQueueItems(true);
    });
    uiH('updateFloatState');
}


export {
    getQueueCurrentIndex,
    syncQueuePlayingHighlight,
    syncQueueActionChips,
    scheduleQueueReload,
    updateQueuePanelHeader,
    renderQueuePanel,
    loadQueueItems,
    rememberQueueContext,
    openQueuePanel,
    closeQueuePanel,
    closeQueueRowMenu,
    openQueueRowMenu,
    moveQueueMenuFocus,
    moveQueueRowSubFocus,
    activateQueueRow,
    activateQueueMenuItem,
    activateQueueAction,
    confirmQueueSavePlaylist,
    startQueueReorder,
    finishQueueReorder,
    moveQueueReorder,
    syncQueueReorderIndexFromItemId,
    getQueueListRows,
    getQueueRowSubTargets,
    getVisibleQueueActionButtons,
    openQueueSavePlaylistInput,
};
