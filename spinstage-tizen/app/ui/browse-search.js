/**
 * Browse search: input, media/provider filter chips, provider menu, search paging.
 * Cross-module callbacks use ui/handlers.js (wired in spinstage-app.js).
 */
import { state } from '../state.js';
import {
    IS_ANDROID,
    SEARCH_UI_PREFS_KEY,
    ANDROID_SEARCH_CHIPS_COLLAPSED_KEY,
    ANDROID_SEARCH_INPUT_COLLAPSED_KEY,
    SEARCH_FILTERS,
    RECOMMENDED_MEDIA_FILTERS,
    SEARCH_PAGE_SIZE,
    PROVIDER_CACHE_TTL_MS,
} from '../constants.js';
import {
    browsePanel,
    browseSearchInput,
    browseSearchInputToggle,
    browseSearchFilters,
    browseProviderMenu,
} from '../dom.js';
import { maClient } from '../ma/client.js';
import {
    itemProviderId,
    itemStoredProviderId,
    isSpotifyProvider,
    isSpotifyLibraryProviderId,
    spotifyLibraryBaseProviderId,
    makeSpotifyLibraryProviderId,
    spotifyLibraryProviderLabel,
    itemHasSpotifyInLibraryMapping,
    spotifyProviderIdsMatch,
    providerIcon,
    providerIconMono,
    isLibraryLikeProvider,
    normalizeProviderDisplayName,
} from '../util/providers.js';
import { uiH } from './handlers.js';
import { escapeHtml } from '../util/escape-html.js';
import { syncAllAndroidChipSections } from './android-chip-sections.js';

function loadSearchUiPrefs() {
    try {
        const raw = localStorage.getItem(SEARCH_UI_PREFS_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}



function saveSearchUiPrefs() {
    localStorage.setItem(SEARCH_UI_PREFS_KEY, JSON.stringify({
        mediaFilter: state.searchMediaFilter,
        providers: state.searchProviderOptions.map((p) => ({ id: p.id, enabled: p.enabled })),
    }));
}



function loadAndroidSearchChipsCollapsed() {
    if (!IS_ANDROID) return;
    try {
        if (localStorage.getItem(ANDROID_SEARCH_CHIPS_COLLAPSED_KEY) == null
            && localStorage.getItem(ANDROID_SEARCH_INPUT_COLLAPSED_KEY) != null) {
            localStorage.setItem(
                ANDROID_SEARCH_CHIPS_COLLAPSED_KEY,
                localStorage.getItem(ANDROID_SEARCH_INPUT_COLLAPSED_KEY),
            );
            localStorage.removeItem(ANDROID_SEARCH_INPUT_COLLAPSED_KEY);
        }
        const raw = localStorage.getItem(ANDROID_SEARCH_CHIPS_COLLAPSED_KEY);
        if (raw === 'true') state.androidSearchChipsCollapsed = true;
        else if (raw === 'false') state.androidSearchChipsCollapsed = false;
    } catch {
        /* ignore corrupt prefs */
    }
}



function saveAndroidSearchChipsCollapsed() {
    if (!IS_ANDROID) return;
    try {
        localStorage.setItem(
            ANDROID_SEARCH_CHIPS_COLLAPSED_KEY,
            state.androidSearchChipsCollapsed ? 'true' : 'false',
        );
    } catch {
        /* ignore quota errors */
    }
}



function applySavedSearchUiPrefs() {
    loadAndroidSearchChipsCollapsed();
    const saved = loadSearchUiPrefs();
    if (!saved) return;
    if (saved.mediaFilter && SEARCH_FILTERS.some((f) => f.id === saved.mediaFilter)) {
        state.searchMediaFilter = saved.mediaFilter;
    }
    if (!Array.isArray(saved.providers) || !saved.providers.length) return;
    const enabledById = new Map(saved.providers.map((p) => [p.id, !!p.enabled]));
    state.searchProviderOptions.forEach((p) => {
        if (enabledById.has(p.id)) p.enabled = enabledById.get(p.id);
    });
}



function searchQueryVariants(query) {
    const trimmed = (query || '').trim();
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length === 2) {
        const reversed = `${words[1]} ${words[0]}`;
        if (reversed.toLowerCase() !== trimmed.toLowerCase()) return [trimmed, reversed];
    }
    return [trimmed];
}



function getSearchProvidersKey() {
    return getEnabledSearchProviderIds().slice().sort().join(',');
}



function buildSearchResultsEntryKey(query, filter) {
    return `search-${(query || '').trim()}-${filter}-${getSearchProvidersKey()}`;
}



function ensureSearchResultsEntry() {
    let entry = uiH('getCurrentBrowseEntry');
    if (!state.lastSearchQuery) return entry;
    const newKey = buildSearchResultsEntryKey(state.lastSearchQuery, state.searchMediaFilter);
    if (entry?.type === 'search_results' && entry.key === newKey) return entry;
    const newEntry = {
        key: newKey,
        title: 'Search',
        type: 'search_results',
        hint: state.lastSearchQuery,
        items: entry?.type === 'search_results' ? (entry.items || []) : [],
    };
    if (entry?.type === 'search_results') {
        if (entry.key !== newKey) {
            delete state.browseViews[entry.key];
            const orderIdx = state._browseViewOrder.indexOf(entry.key);
            if (orderIdx >= 0) state._browseViewOrder.splice(orderIdx, 1);
        }
        state.browseStack[state.browseStack.length - 1] = newEntry;
    } else if (entry?.type === 'shortcut' && entry.key === 'search') {
        state.browseStack[state.browseStack.length - 1] = newEntry;
    } else {
        state.browseStack.push(newEntry);
    }
    return state.browseStack[state.browseStack.length - 1];
}



function itemMatchesSearchProvider(item, providerId) {
    if (!providerId || providerId === 'all') return true;
    if (isSpotifyLibraryProviderId(providerId)) {
        const baseIds = [spotifyLibraryBaseProviderId(providerId)];
        return itemHasSpotifyInLibraryMapping(item, baseIds)
            || baseIds.some((pid) => spotifyProviderIdsMatch(pid, itemProviderId(item)));
    }
    if (providerId === 'library') {
        return uiH('isLocalLibraryItem', item);
    }
    return spotifyProviderIdsMatch(providerId, itemProviderId(item))
        || spotifyProviderIdsMatch(providerId, itemStoredProviderId(item));
}



function itemMatchesAnySearchProvider(item, enabledSet) {
    for (const id of enabledSet) {
        if (itemMatchesSearchProvider(item, id)) return true;
    }
    return false;
}



function isSearchContext() {
    const entry = uiH('getCurrentBrowseEntry');
    return entry.type === 'search_results'
        || (entry.type === 'shortcut' && entry.key === 'search');
}



function syncSearchInputValue() {
    if (state.lastSearchQuery) browseSearchInput.value = state.lastSearchQuery;
}



function isBrowseSearchActive() {
    const entry = uiH('getCurrentBrowseEntry');
    return (entry.type === 'shortcut' && entry.key === 'search')
        || entry.type === 'search_results';
}



function isBrowseRecommendedActive() {
    const entry = uiH('getCurrentBrowseEntry');
    return entry?.key === 'recommended' && Array.isArray(entry.recSections);
}



function syncBrowseSearchChrome() {
    const showSearch = isBrowseSearchActive();
    const showRecommended = isBrowseRecommendedActive();
    showBrowseSearchInput(showSearch);
    if (showSearch) {
        showBrowseSearchFilters(true);
    } else if (showRecommended) {
        showBrowseRecommendedFilters(true);
    } else {
        browseSearchFilters.style.display = 'none';
        browseSearchFilters.innerHTML = '';
        closeProviderMenu();
    }
    syncBrowseSearchInputToggle();
    refreshBrowseFilterChipStates();
    syncAllAndroidChipSections();
}



function getSearchInputCollapsed() {
    if (!IS_ANDROID) return false;
    return state.androidSearchChipsCollapsed === true;
}



function setSearchInputCollapsed(collapsed) {
    if (!IS_ANDROID) return;
    state.androidSearchChipsCollapsed = collapsed === true;
    saveAndroidSearchChipsCollapsed();
    syncBrowseSearchInputToggle();
}



function syncBrowseSearchInputToggle() {
    if (!browseSearchInputToggle || !browsePanel) return;
    const showSearch = IS_ANDROID && isBrowseSearchActive() && isSearchFiltersVisible();
    browseSearchInputToggle.hidden = !showSearch;
    if (!showSearch) {
        browsePanel.classList.remove('search-chips-collapsed');
        browsePanel.classList.remove('search-input-collapsed');
        return;
    }
    const collapsed = getSearchInputCollapsed();
    browsePanel.classList.toggle('search-chips-collapsed', collapsed);
    browsePanel.classList.toggle('search-input-collapsed', collapsed);
    browseSearchInputToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    browseSearchInputToggle.setAttribute(
        'aria-label',
        collapsed ? 'Show filter chips' : 'Hide filter chips',
    );
}



function showBrowseSearchInput(show) {
    if (!show) {
        browseSearchInput.style.display = 'none';
        return;
    }
    browseSearchInput.style.display = 'block';
    syncSearchInputValue();
}



function isSearchFiltersVisible() {
    return browseSearchFilters.style.display !== 'none'
        && browseSearchFilters.querySelectorAll('.search-filter-chip').length > 0;
}



function isBrowseFilterChipsVisible() {
    return isSearchFiltersVisible();
}



function getSearchFilterChips() {
    return Array.from(browseSearchFilters.querySelectorAll('.search-filter-chip'));
}



function syncSearchFilterFocusToActive() {
    const chips = getSearchFilterChips();
    if (!chips.length) return;
    let activeId = 'all';
    if (isBrowseRecommendedActive()) {
        activeId = uiH('getCurrentBrowseEntry')?.recommendedMediaFilter || 'all';
    } else if (isBrowseSearchActive()) {
        activeId = state.searchMediaFilter;
    }
    const idx = chips.findIndex((chip) => {
        if (chip.dataset.chipType === 'recommended' || chip.dataset.chipType === 'media') {
            return chip.dataset.filterId === activeId;
        }
        return false;
    });
    if (idx >= 0) state.searchFilterFocusIndex = idx;
}



function refreshBrowseFilterChipStates() {
    if (!isBrowseFilterChipsVisible()) return;
    const chips = getSearchFilterChips();
    const entry = uiH('getCurrentBrowseEntry');
    const recFilter = entry?.recommendedMediaFilter || 'all';
    const rowFocused = uiH('panelKeyboardFocusActive');
    const inFiltersZone = state.browseFocusZone === 'filters';
    chips.forEach((chip, i) => {
        chip.classList.toggle('focused', inFiltersZone && rowFocused && i === state.searchFilterFocusIndex);
        if (chip.dataset.chipType === 'recommended') {
            chip.classList.toggle('active', chip.dataset.filterId === recFilter);
        } else if (chip.dataset.chipType === 'provider') {
            const provider = state.searchProviderOptions.find((p) => p.id === chip.dataset.providerId);
            chip.classList.toggle('active', !!provider?.enabled);
        } else if (chip.dataset.filterId === 'providers') {
            chip.classList.toggle('active', state.providerMenuOpen);
        } else {
            chip.classList.toggle('active', chip.dataset.filterId === state.searchMediaFilter);
        }
    });
}



function showBrowseRecommendedFilters(show) {
    if (!show) {
        if (!isBrowseSearchActive()) {
            browseSearchFilters.style.display = 'none';
            browseSearchFilters.innerHTML = '';
        }
        return;
    }
    const entry = uiH('getCurrentBrowseEntry');
    const activeFilter = entry?.recommendedMediaFilter || 'all';
    browseSearchFilters.style.display = 'flex';
    browseSearchFilters.innerHTML = '';
    RECOMMENDED_MEDIA_FILTERS.forEach((filter) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'search-filter-chip container-action-chip'
            + (activeFilter === filter.id ? ' active' : '');
        chip.innerHTML = `<img src="icons/${filter.icon}" alt=""><span>${filter.label}</span>`;
        chip.dataset.chipType = 'recommended';
        chip.dataset.filterId = filter.id;
        chip.tabIndex = -1;
        chip.addEventListener('click', () => uiH('setRecommendedMediaFilter', filter.id));
        browseSearchFilters.appendChild(chip);
    });
    const chips = getSearchFilterChips();
    if (state.searchFilterFocusIndex >= chips.length) state.searchFilterFocusIndex = chips.length - 1;
    if (state.searchFilterFocusIndex < 0) {
        state.searchFilterFocusIndex = Math.max(0, RECOMMENDED_MEDIA_FILTERS.findIndex((f) => f.id === activeFilter));
    }
}



function getEnabledSearchProviderIds() {
    return state.searchProviderOptions.filter((p) => p.enabled).map((p) => p.id);
}



function getProviderChipLabel() {
    const count = getEnabledSearchProviderIds().length;
    return `Providers (${count})`;
}



async function ensureSearchProviders() {
    const stale = state.musicProvidersCache.ready
        && (Date.now() - (state.musicProvidersCache.loadedAt || 0) > PROVIDER_CACHE_TTL_MS);
    if (stale) state.searchProvidersReady = false;
    if (state.searchProvidersReady) return;
    try {
        await uiH('ensureMusicProvidersCached');
        const streaming = (state.musicProvidersCache.list || [])
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        const prev = new Map(state.searchProviderOptions.map((p) => [p.id, p.enabled]));
        const spotifyProviders = streaming.filter((p) => isSpotifyProvider(p.id));
        const spotifyLibraryProviders = spotifyProviders.map((p) => ({
            id: makeSpotifyLibraryProviderId(p.id),
            name: spotifyLibraryProviderLabel(p.name, spotifyProviders.length > 1),
            enabled: prev.get(makeSpotifyLibraryProviderId(p.id)) ?? false,
        }));
        state.searchProviderOptions = [
            { id: 'library', name: 'Library', enabled: prev.has('library') ? prev.get('library') : true },
            ...spotifyLibraryProviders,
            ...streaming.map((p) => ({
                id: p.id,
                name: normalizeProviderDisplayName(p.name, p.id),
                enabled: prev.get(p.id) ?? false,
            })),
        ];
        if (!prev.size) applySavedSearchUiPrefs();
        state.searchProvidersReady = true;
    } catch (err) {
        console.warn('load search providers failed:', err);
    }
}



function renderProviderMenu() {
    browseProviderMenu.innerHTML = '';
    state.searchProviderOptions.forEach((provider, index) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'search-provider-row' + (provider.enabled ? ' checked' : '');
        row.dataset.index = String(index);
        const monoClass = providerIconMono(provider.id) ? ' provider-icon-mono' : '';
        row.innerHTML = `<span class="search-provider-check">${provider.enabled ? '✓' : ''}</span>`
            + `<img class="search-provider-icon${monoClass}" src="icons/${providerIcon(provider.id)}" alt="">`
            + `<span class="search-provider-name">${escapeHtml(provider.name)}</span>`;
        row.addEventListener('click', () => toggleProviderAtIndex(index));
        browseProviderMenu.appendChild(row);
    });
}



function updateProviderMenuFocus() {
    const rows = browseProviderMenu.querySelectorAll('.search-provider-row');
    rows.forEach((row, i) => {
        row.classList.toggle('focused', uiH('panelKeyboardFocusActive') && state.providerMenuOpen && i === state.providerMenuFocusIndex);
    });
    uiH('focusPanelTarget', rows[state.providerMenuFocusIndex]);
    rows[state.providerMenuFocusIndex]?.scrollIntoView({ block: 'nearest' });
}



function updateProviderChipLabel() {
    const chip = getSearchFilterChips().find((c) => c.dataset.filterId === 'providers');
    if (!chip) return;
    const span = chip.querySelector('span');
    if (span) span.textContent = getProviderChipLabel();
    chip.classList.toggle('active', state.providerMenuOpen);
}



function openProviderMenu() {
    const chips = getSearchFilterChips();
    const chip = chips.find((c) => c.dataset.filterId === 'providers');
    if (!chip) return;
    state.providerMenuOpen = true;
    state.providerMenuFocusIndex = 0;
    renderProviderMenu();
    browseProviderMenu.classList.add('open');
    browseProviderMenu.setAttribute('aria-hidden', 'false');
    state.browseFocusZone = 'provider_menu';
    uiH('positionPanelRowMenu', chip, browseProviderMenu);
    updateProviderChipLabel();
    updateProviderMenuFocus();
}



function closeProviderMenu() {
    if (!state.providerMenuOpen) return;
    state.providerMenuOpen = false;
    browseProviderMenu.classList.remove('open');
    browseProviderMenu.setAttribute('aria-hidden', 'true');
    uiH('resetPanelRowMenuPosition', browseProviderMenu);
    state.browseFocusZone = 'filters';
    updateProviderChipLabel();
    uiH('updatePanelFocus');
}



function toggleProviderAtIndex(index) {
    const provider = state.searchProviderOptions[index];
    if (!provider) return;
    provider.enabled = !provider.enabled;
    if (!getEnabledSearchProviderIds().length) provider.enabled = true;
    saveSearchUiPrefs();
    renderProviderMenu();
    updateProviderChipLabel();
    updateProviderMenuFocus();
    if (state.lastSearchQuery) rerunBrowseSearch();
}



function moveProviderMenuFocus(delta) {
    const rows = browseProviderMenu.querySelectorAll('.search-provider-row');
    if (!rows.length) return;
    state.providerMenuFocusIndex = Math.max(0, Math.min(state.providerMenuFocusIndex + delta, rows.length - 1));
    updateProviderMenuFocus();
}



function showBrowseSearchFilters(show) {
    browseSearchFilters.style.display = show ? 'flex' : 'none';
    if (!show) {
        browseSearchFilters.innerHTML = '';
        closeProviderMenu();
        return;
    }
    browseSearchFilters.innerHTML = '';
    SEARCH_FILTERS.forEach((filter) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'search-filter-chip container-action-chip' + (state.searchMediaFilter === filter.id ? ' active' : '');
        chip.innerHTML = `<img src="icons/${filter.icon}" alt=""><span>${filter.label}</span>`;
        chip.dataset.chipType = 'media';
        chip.dataset.filterId = filter.id;
        chip.tabIndex = -1;
        chip.addEventListener('click', async () => {
            state.searchMediaFilter = filter.id;
            state.searchFilterFocusIndex = SEARCH_FILTERS.findIndex((f) => f.id === filter.id);
            saveSearchUiPrefs();
            showBrowseSearchFilters(true);
            if (state.lastSearchQuery) await rerunBrowseSearch();
        });
        browseSearchFilters.appendChild(chip);
    });
    // Multi-select provider chips (replaces the old providers dropdown).
    state.searchProviderOptions.forEach((provider) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'search-filter-chip container-action-chip provider-filter-chip'
            + (provider.enabled ? ' active' : '');
        chip.innerHTML = `<img src="icons/${providerIcon(provider.id)}" alt=""><span>${escapeHtml(provider.name)}</span>`;
        chip.dataset.chipType = 'provider';
        chip.dataset.providerId = provider.id;
        chip.tabIndex = -1;
        chip.addEventListener('click', () => toggleSearchProviderById(provider.id));
        browseSearchFilters.appendChild(chip);
    });
    const chips = getSearchFilterChips();
    if (state.searchFilterFocusIndex >= chips.length) state.searchFilterFocusIndex = chips.length - 1;
    if (state.searchFilterFocusIndex < 0) {
        state.searchFilterFocusIndex = Math.max(0, SEARCH_FILTERS.findIndex((f) => f.id === state.searchMediaFilter));
    }
    syncBrowseSearchInputToggle();
}



function moveSearchFilterFocus(delta) {
    const chips = getSearchFilterChips();
    if (!chips.length) return false;
    if (delta < 0 && state.searchFilterFocusIndex <= 0) {
        state.browseFocusZone = 'input';
        syncSearchInputValue();
        uiH('updatePanelFocus');
        return true;
    }
    if (delta > 0 && state.searchFilterFocusIndex >= chips.length - 1) {
        state.browseFocusZone = 'list';
        state.panelFocusIndex = 0;
        state.browseRowSubFocus = 0;
        uiH('updatePanelFocus');
        return true;
    }
    state.searchFilterFocusIndex = Math.max(0, Math.min(state.searchFilterFocusIndex + delta, chips.length - 1));
    uiH('updatePanelFocus');
    return true;
}



function toggleSearchProviderById(id) {
    const provider = state.searchProviderOptions.find((p) => p.id === id);
    if (!provider) return;
    provider.enabled = !provider.enabled;
    if (!getEnabledSearchProviderIds().length) provider.enabled = true;
    saveSearchUiPrefs();
    showBrowseSearchFilters(true);
    uiH('updatePanelFocus');
    if (state.lastSearchQuery) rerunBrowseSearch();
}



async function activateSearchFilter() {
    const chips = getSearchFilterChips();
    const chip = chips[state.searchFilterFocusIndex];
    if (!chip) return;
    if (chip.dataset.chipType === 'recommended') {
        uiH('setRecommendedMediaFilter', chip.dataset.filterId);
        return;
    }
    if (chip.dataset.chipType === 'provider') {
        toggleSearchProviderById(chip.dataset.providerId);
        return;
    }
    state.searchMediaFilter = chip.dataset.filterId;
    saveSearchUiPrefs();
    showBrowseSearchFilters(true);
    if (state.lastSearchQuery) await rerunBrowseSearch();
    state.browseFocusZone = 'list';
    state.panelFocusIndex = 0;
    state.browseRowSubFocus = 0;
    uiH('updatePanelFocus');
}



function activateProviderMenuItem() {
    toggleProviderAtIndex(state.providerMenuFocusIndex);
}



async function loadSearchPage(reset = false) {
    if (state.browseListLoading || !state.lastSearchQuery) {
        if (state.browseListLoading && state.lastSearchQuery) {
            state.browsePagePending = true;
            state.browsePagePendingReset = reset || state.browsePagePendingReset;
        }
        return;
    }
    const entry = uiH('getCurrentBrowseEntry');
    const searchGen = state._browseSearchGeneration;
    state.browseListLoading = true;
    try {
        await maClient.ensureReady();
        const view = state.browseViews[entry.key] || {
            title: 'Search',
            hint: state.lastSearchQuery,
            items: [],
            searchLimit: SEARCH_PAGE_SIZE,
        };
        const prevLen = reset ? 0 : (view.items || []).length;
        const nextLimit = reset
            ? SEARCH_PAGE_SIZE
            : (view.searchLimit || SEARCH_PAGE_SIZE) + SEARCH_PAGE_SIZE;
        const items = await uiH('enrichSearchTrackRows', 
            await maClient.search(state.lastSearchQuery, state.searchMediaFilter, null, nextLimit),
        );
        const grew = items.length > prevLen;
        uiH('storeBrowseView', entry.key, {
            title: 'Search',
            hint: state.lastSearchQuery,
            items,
            searchLimit: nextLimit,
            hasMore: grew && items.length >= SEARCH_PAGE_SIZE,
        });
        if (searchGen === state._browseSearchGeneration && isBrowseSearchActive()) {
            uiH('renderBrowsePanel', true);
            if (reset) {
                state.panelFocusIndex = 0;
                state.browseRowSubFocus = 0;
            }
            uiH('updatePanelFocus');
        }
    } catch (err) {
        console.warn('search page load failed:', err);
    } finally {
        state.browseListLoading = false;
        if (state.browsePagePending) {
            const pendingReset = state.browsePagePendingReset;
            state.browsePagePending = false;
            state.browsePagePendingReset = false;
            void uiH('loadBrowsePage', pendingReset);
        }
    }
}



async function rerunBrowseSearch() {
    if (!state.lastSearchQuery) return;
    state._browseSearchGeneration += 1;
    const searchGen = state._browseSearchGeneration;
    state._lastBrowseRenderKey = '';
    const entry = ensureSearchResultsEntry();
    uiH('storeBrowseView', entry.key, {
        title: 'Search',
        hint: state.lastSearchQuery,
        items: [{ title: 'Searching…', subtitle: '', kind: 'empty' }],
        searchLimit: SEARCH_PAGE_SIZE,
        hasMore: false,
    });
    uiH('renderBrowsePanel', true);
    try {
        await maClient.ensureReady();
        const items = await maClient.search(state.lastSearchQuery, state.searchMediaFilter, null, SEARCH_PAGE_SIZE);
        if (searchGen !== state._browseSearchGeneration || !isBrowseSearchActive()) return;
        uiH('storeBrowseView', entry.key, {
            title: 'Search',
            hint: state.lastSearchQuery,
            items,
            searchLimit: SEARCH_PAGE_SIZE,
            hasMore: items.length >= SEARCH_PAGE_SIZE,
        });
        uiH('renderBrowsePanel', true);
        state.panelFocusIndex = 0;
        state.browseRowSubFocus = 0;
        uiH('updatePanelFocus');
    } catch (err) {
        console.warn('search filter failed:', err);
    }
}



async function runBrowseSearch(query) {
    const trimmed = query.trim();
    if (!trimmed) return;
    const searchGen = ++state._browseSearchGeneration;
    await ensureSearchProviders();
    state.lastSearchQuery = trimmed;
    const entry = {
        key: buildSearchResultsEntryKey(trimmed, state.searchMediaFilter),
        title: 'Search',
        type: 'search_results',
        hint: trimmed,
        items: [],
    };
    if (state.browseStack[state.browseStack.length - 1]?.type === 'search_results') {
        state.browseStack[state.browseStack.length - 1] = entry;
    } else {
        state.browseStack.push(entry);
    }
    try {
        await maClient.ensureReady();
        entry.items = await uiH('enrichSearchTrackRows', 
            await maClient.search(trimmed, state.searchMediaFilter, null, SEARCH_PAGE_SIZE),
        );
        uiH('storeBrowseView', entry.key, {
            title: 'Search',
            hint: trimmed,
            items: entry.items,
            searchLimit: SEARCH_PAGE_SIZE,
            hasMore: entry.items.length >= SEARCH_PAGE_SIZE,
        });
        if (searchGen !== state._browseSearchGeneration || !isBrowseSearchActive()) return;
        syncBrowseSearchChrome();
        browseSearchInput.value = trimmed;
        uiH('renderBrowsePanel', true);
        state.panelFocusIndex = 0;
        state.browseRowSubFocus = 0;
        state.browseFocusZone = 'list';
        uiH('updatePanelFocus');
    } catch (err) {
        console.warn('search failed:', err);
    }
}


export {
    loadSearchUiPrefs,
    saveSearchUiPrefs,
    applySavedSearchUiPrefs,
    searchQueryVariants,
    getSearchProvidersKey,
    buildSearchResultsEntryKey,
    ensureSearchResultsEntry,
    itemMatchesSearchProvider,
    itemMatchesAnySearchProvider,
    getEnabledSearchProviderIds,
    isSearchContext,
    isBrowseSearchActive,
    isBrowseRecommendedActive,
    syncBrowseSearchChrome,
    syncSearchInputValue,
    refreshBrowseFilterChipStates,
    getSearchFilterChips,
    isBrowseFilterChipsVisible,
    updateProviderMenuFocus,
    getSearchInputCollapsed,
    setSearchInputCollapsed,
    showBrowseSearchInput,
    openProviderMenu,
    closeProviderMenu,
    moveProviderMenuFocus,
    moveSearchFilterFocus,
    activateSearchFilter,
    activateProviderMenuItem,
    loadSearchPage,
    rerunBrowseSearch,
    runBrowseSearch,
    ensureSearchProviders,
    showBrowseRecommendedFilters,
    syncSearchFilterFocusToActive,
};
