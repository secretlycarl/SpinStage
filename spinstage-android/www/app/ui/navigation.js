/**
 * D-pad / keyboard focus zones, panel focus routing, and global key handlers.
 * Cross-module callbacks use ui/handlers.js (wired in spinstage-app.js).
 */
import { state } from '../state.js';
import {
    IS_ANDROID,
    IS_TV_REMOTE,
    IS_CAPACITOR,
    UI_HIDE_MS,
} from '../constants.js';
import {
    mainBody,
    shuffleBtn,
    prevBtn,
    playBtn,
    nextBtn,
    repeatBtn,
    navBtn,
    browseBtn,
    queueBtn,
    volumeBtn,
    playersBtn,
    settingsBtn,
    browsePanel,
    browsePanelBackBtn,
    browseList,
    queueList,
    queuePanel,
    playersPanel,
    browseSearchInput,
    browseSearchInputToggle,
    queueSavePlaylistInput,
    progressContainerEl,
    progressSlider,
    guestAccessOverlay,
    detailsList,
    detailsPanelBackBtn,
    vizBarCountRow,
    vizFpsRow,
    menuShowLyricsBtn,
    menuSetupBtn,
    menuShowConnectionBtn,
    menuArtDisplayBtn,
    menuDisableVisualizerBtn,
    menuDisableVizBlurBtn,
    menuEqPresetsBtn,
    menuSwitchInfoBtn,
    menuVizModesBtn,
    menuFullscreenBtn,
    menuGuestAccessBtn,
    menuCloseBtn,
    playerStage,
} from '../dom.js';
import {
    getSettingsFocusTargets,
    adjustVizBarCount,
    adjustVizFpsNotches,
    getShowLyricsEnabled,
    setShowLyricsEnabled,
    getKeepAwake,
    getShowConnection,
    setShowConnection,
    setDisableVisualizer,
    setDisableVizBlur,
    openEqPresetsMenu,
    openVizModesMenu,
    openArtDisplayMenu,
    isFullscreen,
    setFullscreen,
    setCursorHidden,
    consumePinnedFullscreenEscKeyDown,
    consumePinnedFullscreenEscKeyUp,
    updateMenuFocus,
    closeSettingsMenu,
    closeEqPresetsMenu,
    closeVizModesMenu,
    closeArtDisplayMenu,
    activateEqPresetsFocused,
    moveEqPresetsFocus,
    activateVizModesFocused,
    moveVizModesFocus,
    moveVizSelectorIconFocus,
    activateArtDisplayFocused,
    moveArtDisplayFocus,
    toggleRadioSwitchInfo,
    toggleSettingsMenu,
} from './settings.js';
import { getArtDisplayMode } from '../playback/art-display.js';
import {
    isLyricsScrollAvailable,
    isLyricsIdleFocused,
    setLyricsIdleFocused,
    clearLyricsIdleFocus,
    scrollLyricsBy,
} from '../playback/lyrics-panel.js';
import {
    closeNavMenu,
    moveNavMenuFocus,
    activateNavMenuItem,
    toggleNavMenu,
    closeNavGenresMenu,
    moveNavGenresMenuFocus,
    activateNavGenreItem,
} from './nav.js';
import {
    isBrowseFilterChipsVisible,
    getSearchFilterChips,
    moveSearchFilterFocus,
    syncSearchInputValue,
    isSearchContext,
    closeProviderMenu,
    moveProviderMenuFocus,
    updateProviderMenuFocus,
    refreshBrowseFilterChipStates,
    syncSearchFilterFocusToActive,
    activateSearchFilter,
    activateProviderMenuItem,
    getSearchInputCollapsed,
    setSearchInputCollapsed,
} from './browse-search.js';
import {
    isChipSectionToggleVisible,
    focusChipSectionToggle,
    activateChipSectionToggle,
} from './android-chip-sections.js';
import {
    closeBrowsePanel,
    closeBrowseRowMenu,
    browseBack,
    openBrowsePanel,
    getCurrentBrowseEntry,
    getBrowseRows,
    getBrowseRowSubTargets,
    moveBrowseMenuFocus,
    moveBrowseRowSubFocus,
    moveBrowseGridFocus,
    moveArtistProviderFocus,
    moveAlphaViewFocus,
    moveContainerActionFocus,
    activateContainerAction,
    activateBrowseMenuItem,
    activateBrowseRow,
    switchAlphaViewMode,
    switchArtistProvider,
    switchBrowseProvider,
    isBrowseGridView,
    getBrowseGridCols,
    hasContainerActionsBar,
    hasAlphaViewBar,
    hasArtistProviderBar,
    entrySupportsBrowseProviders,
    updateArtistProviderFocus,
    updateAlphaViewFocus,
    updateContainerActionFocus,
} from './browse.js';
import {
    closeQueuePanel,
    closeQueueRowMenu,
    openQueuePanel,
    getQueueListRows,
    getVisibleQueueActionButtons,
    moveQueueMenuFocus,
    moveQueueRowSubFocus,
    activateQueueMenuItem,
    activateQueueAction,
    activateQueueRow,
    finishQueueReorder,
    moveQueueReorder,
    syncQueueReorderIndexFromItemId,
    getQueueRowSubTargets,
} from './queue.js';
import {
    closePlayersPanel,
    closePlayersRowMenu,
    openPlayersPanel,
    getPlayersListRows,
    getVisiblePlayersActionButtons,
    movePlayersMenuFocus,
    activatePlayersMenuItem,
    activatePlayersAction,
    activatePlayersRow,
    renderPlayersPanel,
    localPlayerInSyncGroup,
    stopSyncGroupPlayback,
    getPlayersRowSubTargets,
    movePlayersRowSubFocus,
} from './players-panel.js';
import { closeDetailsPanel } from './details.js';
import { chipVerticalTarget } from '../util/chips.js';
import { getDisableVisualizer, getDisableVizBlur } from '../playback/visualizer.js';
import { isBrowserUi, isWebUi, useTieredFocus } from '../platform.js';
import { uiH } from './handlers.js';
import { npH } from '../playback/handlers.js';

const playbackControls = [shuffleBtn, prevBtn, playBtn, nextBtn, repeatBtn];
const topBarControls = [navBtn, browseBtn, queueBtn, volumeBtn, playersBtn, settingsBtn];
const focusableControls = [...playbackControls, ...topBarControls];

let ignoreClickUntil = 0;

function getIgnoreClickUntil() {
    return ignoreClickUntil;
}

function resetNavButtonFocus() {
    if (focusableControls[state.focusIndex] === navBtn) {
        state.focusIndex = focusableControls.indexOf(browseBtn);
        updateFocus();
    }
}

function panelKeyboardFocusActive() {
    return IS_TV_REMOTE || state.panelInputMode === 'keyboard';
}

function setPanelInputMode(mode) {
    const next = IS_TV_REMOTE ? 'keyboard' : mode;
    if (state.panelInputMode === next) return;
    state.panelInputMode = next;
    if (isPanelOpen()) updatePanelFocus();
}

function syncPanelInputModeForOpen() {
    setPanelInputMode(state.lastFocusInput === 'keyboard' ? 'keyboard' : 'pointer');
}

function focusPanelTarget(el) {
    if (!el || IS_ANDROID || IS_TV_REMOTE || !panelKeyboardFocusActive()) return;
    el.focus({ preventScroll: true });
}

function clearMouseHover() {
    focusableControls.forEach((el) => el.classList.remove('mouse-hover'));
}

function clearKeyboardFocusClasses() {
    focusableControls.forEach((el) => {
        el.classList.remove('focused');
        if (document.activeElement === el) el.blur();
    });
    progressSlider?.classList.remove('focused');
}

function bindMouseHoverHighlights() {
    if (IS_CAPACITOR || IS_TV_REMOTE) return;
    const onHoverStart = (el) => {
        clearKeyboardFocusClasses();
        clearMouseHover();
        el.classList.add('mouse-hover');
        resumeUiHideTimer();
    };
    const onHoverEnd = (el) => {
        el.classList.remove('mouse-hover');
        if (mainBody.classList.contains('show-ui')) resumeUiHideTimer();
    };
    focusableControls.forEach((el) => {
        el.addEventListener('mouseenter', () => onHoverStart(el));
        el.addEventListener('mouseleave', () => onHoverEnd(el));
    });
    document.querySelector('.progress-wrapper')
        ?.addEventListener('mouseenter', () => resumeUiHideTimer());
    progressContainerEl?.addEventListener('mouseenter', () => resumeUiHideTimer());
}

function bindPanelPointerMode() {
    if (IS_TV_REMOTE) return;
    const markPointer = () => {
        state.lastFocusInput = 'pointer';
        if (isPanelOpen()) setPanelInputMode('pointer');
    };
    browsePanel.addEventListener('pointerdown', markPointer, { passive: true });
    queuePanel.addEventListener('pointerdown', markPointer, { passive: true });
    playersPanel.addEventListener('pointerdown', markPointer, { passive: true });
    browseBtn.addEventListener('pointerdown', () => { state.lastFocusInput = 'pointer'; }, { passive: true });
    queueBtn.addEventListener('pointerdown', () => { state.lastFocusInput = 'pointer'; }, { passive: true });
}

function updateFocus() {
    if (useTieredFocus() && mainBody.classList.contains('show-ui') && !isOverlayMenuOpen() && !isPanelOpen()) {
        clearMouseHover();
        syncWebOsFocusVisual();
        return;
    }
    if (focusableControls[state.focusIndex]?.hidden) {
        const visible = getVisibleFocusableControls();
        if (visible.length) state.focusIndex = focusableControls.indexOf(visible[0]);
    }
    focusableControls.forEach((el, i) => {
        const focused = i === state.focusIndex && !el.hidden;
        el.classList.toggle('focused', focused);
        if (focused && document.activeElement !== el && !IS_ANDROID && !IS_TV_REMOTE) {
            el.focus({ preventScroll: true });
        }
    });
    progressSlider?.classList.remove('focused');
    npH('syncProgressThumbActive');
}

function isProgressFocusAvailable() {
    if (uiH('isPlaybackRadioContext')) return false;
    return npH('isSeekable');
}

function normalizeUiFocusZone() {
    if (state.uiFocusZone === 'progress' && !isProgressFocusAvailable()) {
        state.uiFocusZone = 'controls';
    }
}

function syncWebOsFocusVisual() {
    uiH('syncProgressSeekableChrome');
    focusableControls.forEach((el) => el.classList.remove('focused'));
    progressSlider?.classList.remove('focused');
    if (document.activeElement === progressSlider) progressSlider?.blur();
    const focusEl = (el) => {
        el?.classList.add('focused');
        if (!IS_ANDROID && !IS_TV_REMOTE) el?.focus({ preventScroll: true });
    };
    if (state.uiFocusZone === 'progress' && isProgressFocusAvailable()) {
        progressSlider?.classList.add('focused');
    } else if (state.uiFocusZone === 'topbar') {
        focusEl(topBarControls[state.topBarFocusIndex]);
    } else {
        state.uiFocusZone = 'controls';
        focusEl(playbackControls[state.playbackFocusIndex]);
    }
    npH('syncProgressThumbActive');
}

function wakeUiFromIdle(fromVerticalDelta = 0) {
    clearLyricsIdleFocus();
    showUI();
    if (fromVerticalDelta < 0) {
        state.uiFocusZone = 'topbar';
        state.topBarFocusIndex = Math.max(0, topBarControls.indexOf(browseBtn));
        state.focusIndex = focusableControls.indexOf(topBarControls[state.topBarFocusIndex]);
    } else {
        state.uiFocusZone = 'controls';
        state.playbackFocusIndex = 2;
        state.focusIndex = focusableControls.indexOf(playBtn);
    }
    updateFocus();
}

function handleIdleHorizontal(delta) {
    if (delta > 0 && isLyricsScrollAvailable()) {
        if (!isLyricsIdleFocused()) {
            setLyricsIdleFocused(true);
            return;
        }
        clearLyricsIdleFocus();
        wakeUiFromIdle();
        return;
    }
    if (delta < 0 && isLyricsIdleFocused()) {
        clearLyricsIdleFocus();
        return;
    }
    wakeUiFromIdle();
}

function handleIdleVertical(delta) {
    if (isLyricsIdleFocused()) {
        scrollLyricsBy(delta);
        return;
    }
    wakeUiFromIdle(delta);
}

function moveWebOsHorizontal(delta, isRepeat = false) {
    if (state.settingsMenuOpen || state.navMenuOpen || state.volumeMenuOpen || state.eqPresetsMenuOpen || state.vizModesMenuOpen || state.artDisplayMenuOpen) return;
    if (!mainBody.classList.contains('show-ui')) {
        handleIdleHorizontal(delta);
        return;
    }
    if (!state.settingsMenuOpen && !state.navMenuOpen && !state.volumeMenuOpen && !state.eqPresetsMenuOpen && !state.vizModesMenuOpen && !blocksUiAutoHide()) resumeUiHideTimer();
    if (state.uiFocusZone === 'controls') {
        state.playbackFocusIndex = Math.max(0, Math.min(playbackControls.length - 1, state.playbackFocusIndex + delta));
        state.focusIndex = focusableControls.indexOf(playbackControls[state.playbackFocusIndex]);
    } else if (state.uiFocusZone === 'topbar') {
        state.topBarFocusIndex = Math.max(0, Math.min(topBarControls.length - 1, state.topBarFocusIndex + delta));
        state.focusIndex = focusableControls.indexOf(topBarControls[state.topBarFocusIndex]);
    } else if (state.uiFocusZone === 'progress') {
        uiH('onRemoteSeekPress', delta, isRepeat);
    }
    updateFocus();
}

function moveWebOsVertical(delta) {
    if (state.settingsMenuOpen || state.navMenuOpen || state.volumeMenuOpen || state.eqPresetsMenuOpen || state.vizModesMenuOpen || state.artDisplayMenuOpen) return;
    if (!mainBody.classList.contains('show-ui')) {
        handleIdleVertical(delta);
        return;
    }
    if (!state.settingsMenuOpen && !state.navMenuOpen && !state.volumeMenuOpen && !state.eqPresetsMenuOpen && !state.vizModesMenuOpen && !blocksUiAutoHide()) resumeUiHideTimer();
    const progressAvail = isProgressFocusAvailable();
    if (delta < 0) {
        if (state.uiFocusZone === 'controls') {
            if (progressAvail) {
                state.uiFocusZone = 'progress';
            } else {
                state.uiFocusZone = 'topbar';
                const browseIdx = topBarControls.indexOf(browseBtn);
                state.topBarFocusIndex = browseIdx >= 0 ? browseIdx : 0;
                state.focusIndex = focusableControls.indexOf(topBarControls[state.topBarFocusIndex]);
            }
        } else if (state.uiFocusZone === 'progress') {
            state.uiFocusZone = 'topbar';
        }
    } else if (delta > 0) {
        if (state.uiFocusZone === 'topbar') {
            state.uiFocusZone = progressAvail ? 'progress' : 'controls';
        } else if (state.uiFocusZone === 'progress') {
            state.uiFocusZone = 'controls';
        } else if (state.uiFocusZone === 'controls') {
            hideUI();
            return;
        }
    }
    updateFocus();
}

function isPanelOpen() {
    return state.browsePanelOpen || state.queuePanelOpen || state.playersPanelOpen || state.detailsPanelOpen;
}

function isGuestAccessOpen() {
    return guestAccessOverlay.classList.contains('open');
}

function blocksUiAutoHide() {
    return isPanelOpen() || isGuestAccessOpen();
}

function hasActiveMouseHover() {
    return isBrowserUi() && !!document.querySelector('.mouse-hover');
}

function pauseUiHideTimer() {
    clearTimeout(state.uiTimeout);
    state.uiTimeout = null;
}

function resumeUiHideTimer() {
    if (state.settingsMenuOpen || state.navMenuOpen || state.navGenresMenuOpen
        || state.volumeMenuOpen || state.eqPresetsMenuOpen || state.vizModesMenuOpen
        || state.artDisplayMenuOpen || blocksUiAutoHide()) return;
    if (!mainBody.classList.contains('show-ui')) return;
    pauseUiHideTimer();
    state.uiTimeout = setTimeout(() => {
        if (hasActiveMouseHover()) {
            resumeUiHideTimer();
            return;
        }
        hideUI();
    }, UI_HIDE_MS);
}

function browsePanelBackVisible() {
    return browsePanelBackBtn && !browsePanelBackBtn.hidden;
}

// Top-to-bottom: caret → search/filters → alpha → provider chips → play/shuffle → list.
// List UP walks the chain from the end so container_actions (nearest list) wins over artist_providers.
const BROWSE_HEADER_DOWN_CHAIN = [
    'input', 'search_toggle', 'filters',
    'chip_artistProviders', 'alpha_view', 'chip_alphaView',
    'artist_providers', 'chip_containerActions', 'container_actions',
];

function browseSearchToggleVisible() {
    return !!(browseSearchInputToggle && !browseSearchInputToggle.hidden);
}

function browseHeaderZoneVisible(zone) {
    switch (zone) {
        case 'input': return browseSearchInput.style.display !== 'none';
        case 'search_toggle': return browseSearchToggleVisible();
        case 'filters': return isBrowseFilterChipsVisible();
        case 'chip_artistProviders': return isChipSectionToggleVisible('artistProviders');
        case 'chip_alphaView': return isChipSectionToggleVisible('alphaView');
        case 'chip_containerActions': return isChipSectionToggleVisible('containerActions');
        case 'container_actions': return hasContainerActionsBar();
        case 'alpha_view': return hasAlphaViewBar();
        case 'artist_providers': return hasArtistProviderBar();
        default: return false;
    }
}

function browseChipSectionKey(zone) {
    if (zone === 'chip_artistProviders') return 'artistProviders';
    if (zone === 'chip_alphaView') return 'alphaView';
    if (zone === 'chip_containerActions') return 'containerActions';
    return '';
}

function initBrowseHeaderZoneFocus(zone) {
    if (zone === 'filters') syncSearchFilterFocusToActive();
    else if (zone === 'input') syncSearchInputValue();
    else if (zone === 'container_actions') state.containerActionFocusIndex = 0;
    else if (zone === 'alpha_view') {
        const entry = getCurrentBrowseEntry();
        state.alphaViewFocusIndex = entry.alphaViewMode === 'list' ? 1 : 0;
    } else if (zone === 'artist_providers') {
        state.artistProviderFocusIndex = getCurrentBrowseEntry().selectedProviderIndex || 0;
    }
}

function focusBrowseDownFromPanelBack() {
    for (const zone of BROWSE_HEADER_DOWN_CHAIN) {
        if (browseHeaderZoneVisible(zone)) {
            state.browseFocusZone = zone;
            initBrowseHeaderZoneFocus(zone);
            return;
        }
    }
    state.browseFocusZone = 'list';
    state.panelFocusIndex = 0;
    state.browseRowSubFocus = 0;
}

function focusBrowseUpFromListRowZero() {
    for (let i = BROWSE_HEADER_DOWN_CHAIN.length - 1; i >= 0; i -= 1) {
        const zone = BROWSE_HEADER_DOWN_CHAIN[i];
        if (browseHeaderZoneVisible(zone)) {
            state.browseFocusZone = zone;
            initBrowseHeaderZoneFocus(zone);
            return;
        }
    }
    if (browsePanelBackVisible()) state.browseFocusZone = 'panel_back';
}

function focusBrowseDownFromHeaderZone(zone) {
    const idx = BROWSE_HEADER_DOWN_CHAIN.indexOf(zone);
    for (let i = idx + 1; i < BROWSE_HEADER_DOWN_CHAIN.length; i += 1) {
        const next = BROWSE_HEADER_DOWN_CHAIN[i];
        if (browseHeaderZoneVisible(next)) {
            state.browseFocusZone = next;
            initBrowseHeaderZoneFocus(next);
            return;
        }
    }
    state.browseFocusZone = 'list';
    state.panelFocusIndex = 0;
    state.browseRowSubFocus = 0;
}

function focusBrowseUpFromHeaderZone(zone) {
    const idx = BROWSE_HEADER_DOWN_CHAIN.indexOf(zone);
    for (let i = idx - 1; i >= 0; i -= 1) {
        const prev = BROWSE_HEADER_DOWN_CHAIN[i];
        if (browseHeaderZoneVisible(prev)) {
            state.browseFocusZone = prev;
            initBrowseHeaderZoneFocus(prev);
            return;
        }
    }
    if (browsePanelBackVisible()) state.browseFocusZone = 'panel_back';
}

function focusBrowseHeaderFromPanelBack() {
    focusBrowseDownFromPanelBack();
}

function updatePanelFocus() {
    const rowFocused = panelKeyboardFocusActive();
    if (state.browsePanelOpen) {
        refreshBrowseFilterChipStates();
        if (state.browseFocusZone === 'panel_back') {
            browsePanelBackBtn?.classList.toggle('focused', rowFocused);
            focusPanelTarget(browsePanelBackBtn);
            return;
        }
        browsePanelBackBtn?.classList.remove('focused');
        if (state.browseFocusZone === 'input') {
            browseSearchInput.focus();
            return;
        }
        if (state.browseFocusZone === 'search_toggle') {
            browseSearchInputToggle?.classList.toggle('focused', rowFocused);
            focusPanelTarget(browseSearchInputToggle);
            return;
        }
        browseSearchInputToggle?.classList.remove('focused');
        if (state.browseFocusZone === 'chip_artistProviders'
            || state.browseFocusZone === 'chip_alphaView'
            || state.browseFocusZone === 'chip_containerActions') {
            focusChipSectionToggle(browseChipSectionKey(state.browseFocusZone), rowFocused);
            return;
        }
        if (state.browseFocusZone === 'provider_menu') {
            updateProviderMenuFocus();
            return;
        }
        if (state.browseFocusZone === 'filters') {
            focusPanelTarget(getSearchFilterChips()[state.searchFilterFocusIndex]);
            return;
        }
        if (state.browseFocusZone === 'artist_providers') {
            updateArtistProviderFocus();
            return;
        }
        if (state.browseFocusZone === 'alpha_view') {
            updateAlphaViewFocus();
            return;
        }
        if (state.browseFocusZone === 'container_actions') {
            updateContainerActionFocus();
            return;
        }
        const rows = getBrowseRows();
        rows.forEach((row, i) => {
            row.classList.toggle('focused', rowFocused && !state.browseRowMenuOpen && i === state.panelFocusIndex);
            const targets = getBrowseRowSubTargets(row);
            targets.forEach((el, si) => {
                el.classList.toggle('sub-focused', rowFocused && !state.browseRowMenuOpen
                    && i === state.panelFocusIndex && si === state.browseRowSubFocus);
            });
        });
        if (state.browseRowMenuOpen) {
            state.browseMenuActionEls.forEach((el, i) => {
                el.classList.toggle('focused', rowFocused && i === state.browseMenuFocusIndex);
            });
            focusPanelTarget(state.browseMenuActionEls[state.browseMenuFocusIndex]);
        } else {
            state.browseMenuActionEls.forEach((el) => el.classList.remove('focused'));
            const targets = getBrowseRowSubTargets(rows[state.panelFocusIndex]);
            focusPanelTarget(targets[state.browseRowSubFocus]);
            rows[state.panelFocusIndex]?.scrollIntoView({ block: 'nearest' });
        }
        return;
    }
    if (state.queuePanelOpen) {
        if (state.queueReorderMode) syncQueueReorderIndexFromItemId();
        const actionBtns = getVisibleQueueActionButtons();
        actionBtns.forEach((btn, i) => {
            btn.classList.toggle('focused', rowFocused && !state.queueRowMenuOpen && !state.queueReorderMode
                && state.queueFocusZone === 'actions' && i === state.queueActionFocusIndex);
        });
        const rows = getQueueListRows();
        rows.forEach((row, i) => {
            row.classList.toggle('focused', rowFocused && !state.queueRowMenuOpen && !state.queueReorderMode
                && state.queueFocusZone === 'list' && i === state.panelFocusIndex);
            row.classList.toggle('reordering', state.queueReorderMode && i === state.queueReorderIndex);
            const targets = getQueueRowSubTargets(row);
            targets.forEach((el, si) => {
                el.classList.toggle('sub-focused', rowFocused && !state.queueRowMenuOpen
                    && !state.queueReorderMode && state.queueFocusZone === 'list'
                    && i === state.panelFocusIndex && si === state.queueRowSubFocus);
            });
        });
        if (state.queueRowMenuOpen) {
            state.queueMenuActionEls.forEach((el, i) => {
                el.classList.toggle('focused', rowFocused && i === state.queueMenuFocusIndex);
            });
            focusPanelTarget(state.queueMenuActionEls[state.queueMenuFocusIndex]);
        } else if (state.queueFocusZone === 'chip_actions') {
            focusChipSectionToggle('queueActions', rowFocused);
        } else if (state.queueFocusZone === 'actions') {
            focusPanelTarget(actionBtns[state.queueActionFocusIndex]);
        } else {
            state.queueMenuActionEls.forEach((el) => el.classList.remove('focused'));
            const targets = getQueueRowSubTargets(rows[state.panelFocusIndex]);
            focusPanelTarget(targets[state.queueRowSubFocus]);
            rows[state.panelFocusIndex]?.scrollIntoView({ block: 'nearest' });
        }
        return;
    }
    if (state.playersPanelOpen) {
        const actionBtns = getVisiblePlayersActionButtons();
        actionBtns.forEach((btn, i) => {
            btn.classList.toggle('focused', rowFocused && state.playersFocusZone === 'actions' && i === state.playersActionFocusIndex);
        });
        const rows = getPlayersListRows();
        rows.forEach((row, i) => {
            const rowActive = rowFocused && state.playersFocusZone === 'list' && i === state.panelFocusIndex;
            row.classList.toggle('focused', rowActive && !state.playersRowMenuOpen);
            const targets = getPlayersRowSubTargets(row);
            targets.forEach((el, si) => {
                el.classList.toggle('sub-focused', rowActive && !state.playersRowMenuOpen && si === state.playersRowSubFocus);
            });
            const activeTarget = targets[state.playersRowSubFocus];
            row.querySelectorAll('.player-sync-delay-bar').forEach((bar) => {
                bar.classList.toggle(
                    'sub-focused-bar',
                    rowActive && !state.playersRowMenuOpen
                        && activeTarget?.classList?.contains('player-sync-delay-btn'),
                );
            });
        });
        if (state.playersRowMenuOpen) {
            state.playersMenuActionEls.forEach((el, i) => {
                el.classList.toggle('focused', rowFocused && i === state.playersMenuFocusIndex);
            });
            focusPanelTarget(state.playersMenuActionEls[state.playersMenuFocusIndex]);
        } else if (state.playersFocusZone === 'chip_actions') {
            focusChipSectionToggle('playersActions', rowFocused);
        } else if (state.playersFocusZone === 'actions') {
            focusPanelTarget(getVisiblePlayersActionButtons()[state.playersActionFocusIndex]);
        } else {
            state.playersMenuActionEls.forEach((el) => el.classList.remove('focused'));
            const targets = getPlayersRowSubTargets(rows[state.panelFocusIndex]);
            const activeTarget = targets[state.playersRowSubFocus];
            focusPanelTarget(activeTarget);
            activeTarget?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
            rows[state.panelFocusIndex]?.scrollIntoView({ block: 'nearest' });
        }
        return;
    }
    if (state.detailsPanelOpen) {
        const rowFocused = panelKeyboardFocusActive();
        if (state.detailsFocusZone === 'panel_back') {
            detailsPanelBackBtn?.classList.toggle('focused', rowFocused);
            focusPanelTarget(detailsPanelBackBtn);
            detailsList.querySelectorAll('.details-row').forEach((row) => row.classList.remove('focused'));
            return;
        }
        detailsPanelBackBtn?.classList.remove('focused');
        const rows = detailsList.querySelectorAll('.details-row:not(.empty)');
        rows.forEach((row, i) => {
            row.classList.toggle('focused', rowFocused && i === state.panelFocusIndex);
        });
        rows[state.panelFocusIndex]?.scrollIntoView({ block: 'nearest' });
    }
}

function movePanelFocus(delta) {
    if (state.browsePanelOpen && state.browseRowMenuOpen) {
        moveBrowseMenuFocus(delta);
        return;
    }
    if (state.queuePanelOpen && state.queueRowMenuOpen) {
        moveQueueMenuFocus(delta);
        return;
    }
    if (state.playersPanelOpen && state.playersRowMenuOpen) {
        movePlayersMenuFocus(delta);
        return;
    }
    if (state.queuePanelOpen && state.queueReorderMode) {
        moveQueueReorder(delta);
        return;
    }
    if (state.browsePanelOpen) {
        if (state.browseFocusZone === 'panel_back') {
            if (delta > 0) focusBrowseHeaderFromPanelBack();
            updatePanelFocus();
            return;
        }
        if (state.browseFocusZone === 'provider_menu') {
            if (delta < 0 && state.providerMenuFocusIndex === 0) {
                closeProviderMenu();
            } else {
                moveProviderMenuFocus(delta);
            }
            return;
        }
        if (state.browseFocusZone === 'input') {
            if (delta > 0) {
                focusBrowseDownFromHeaderZone('input');
            } else if (delta < 0) {
                focusBrowseUpFromHeaderZone('input');
            }
            updatePanelFocus();
            return;
        }
        if (state.browseFocusZone === 'search_toggle') {
            if (delta > 0) focusBrowseDownFromHeaderZone('search_toggle');
            else if (delta < 0) focusBrowseUpFromHeaderZone('search_toggle');
            updatePanelFocus();
            return;
        }
        if (state.browseFocusZone === 'chip_artistProviders'
            || state.browseFocusZone === 'chip_alphaView'
            || state.browseFocusZone === 'chip_containerActions') {
            if (delta > 0) focusBrowseDownFromHeaderZone(state.browseFocusZone);
            else if (delta < 0) focusBrowseUpFromHeaderZone(state.browseFocusZone);
            updatePanelFocus();
            return;
        }
        if (state.browseFocusZone === 'filters') {
            const vt = chipVerticalTarget(getSearchFilterChips(), state.searchFilterFocusIndex, delta);
            if (vt >= 0) {
                state.searchFilterFocusIndex = vt;
                updatePanelFocus();
                return;
            }
            if (delta > 0) {
                focusBrowseDownFromHeaderZone('filters');
            } else if (delta < 0) {
                focusBrowseUpFromHeaderZone('filters');
            }
            updatePanelFocus();
            return;
        }
        if (state.browseFocusZone === 'container_actions') {
            const vt = chipVerticalTarget(
                document.getElementById('browse-container-actions')?.children,
                state.containerActionFocusIndex, delta,
            );
            if (vt >= 0) {
                state.containerActionFocusIndex = vt;
                updatePanelFocus();
                return;
            }
            if (delta > 0) {
                focusBrowseDownFromHeaderZone('container_actions');
            } else if (delta < 0) {
                focusBrowseUpFromHeaderZone('container_actions');
            }
            updatePanelFocus();
            return;
        }
        if (state.browseFocusZone === 'alpha_view') {
            if (delta > 0) {
                focusBrowseDownFromHeaderZone('alpha_view');
            } else if (delta < 0) {
                focusBrowseUpFromHeaderZone('alpha_view');
            }
            updatePanelFocus();
            return;
        }
        if (state.browseFocusZone === 'artist_providers') {
            const vt = chipVerticalTarget(
                document.getElementById('browse-artist-providers')?.children,
                state.artistProviderFocusIndex, delta,
            );
            if (vt >= 0) {
                state.artistProviderFocusIndex = vt;
                updatePanelFocus();
                return;
            }
            if (delta > 0) {
                focusBrowseDownFromHeaderZone('artist_providers');
            } else if (delta < 0 && state.artistProviderFocusIndex === 0) {
                focusBrowseUpFromHeaderZone('artist_providers');
            }
            updatePanelFocus();
            return;
        }
        const rows = getBrowseRows();
        if (delta < 0 && state.panelFocusIndex === 0) {
            focusBrowseUpFromListRowZero();
            updatePanelFocus();
            return;
        }
        if (!rows.length) return;
        if (isBrowseGridView()) {
            moveBrowseGridFocus(delta < 0 ? -1 : 1, 0);
            return;
        }
        state.panelFocusIndex = Math.max(0, Math.min(state.panelFocusIndex + delta, rows.length - 1));
        state.browseRowSubFocus = 0;
        if (state.panelFocusIndex === 0 && delta < 0) {
            uiH('expandPanelListHeader', browseList);
        }
        updatePanelFocus();
        return;
    }
    if (state.queuePanelOpen) {
        if (state.queueFocusZone === 'chip_actions') {
            if (delta > 0) {
                if (getVisibleQueueActionButtons().length) {
                    state.queueFocusZone = 'actions';
                    state.queueActionFocusIndex = 0;
                } else {
                    state.queueFocusZone = 'list';
                    state.panelFocusIndex = 0;
                    state.queueRowSubFocus = 0;
                }
            }
            updatePanelFocus();
            return;
        }
        if (state.queueFocusZone === 'actions') {
            const actionBtns = getVisibleQueueActionButtons();
            const vt = chipVerticalTarget(actionBtns, state.queueActionFocusIndex, delta);
            if (vt >= 0) {
                state.queueActionFocusIndex = vt;
                updatePanelFocus();
                return;
            }
            if (delta > 0) {
                state.queueFocusZone = 'list';
                state.panelFocusIndex = 0;
                state.queueRowSubFocus = 0;
            }
            updatePanelFocus();
            return;
        }
        const rows = getQueueListRows();
        if (delta < 0 && state.panelFocusIndex === 0) {
            if (isChipSectionToggleVisible('queueActions')) {
                state.queueFocusZone = 'chip_actions';
            } else if (getVisibleQueueActionButtons().length) {
                state.queueFocusZone = 'actions';
                state.queueActionFocusIndex = Math.max(0, getVisibleQueueActionButtons().length - 1);
            }
            updatePanelFocus();
            return;
        }
        if (!rows.length) return;
        state.panelFocusIndex = Math.max(0, Math.min(state.panelFocusIndex + delta, rows.length - 1));
        if (state.panelFocusIndex === 0 && delta < 0) {
            uiH('expandPanelListHeader', queueList);
        }
        updatePanelFocus();
        return;
    }
    if (state.playersPanelOpen) {
        if (state.playersFocusZone === 'chip_actions') {
            if (delta > 0) {
                if (getVisiblePlayersActionButtons().length) {
                    state.playersFocusZone = 'actions';
                    state.playersActionFocusIndex = 0;
                } else {
                    state.playersFocusZone = 'list';
                    state.panelFocusIndex = 0;
                    state.playersRowSubFocus = 0;
                }
            }
            updatePanelFocus();
            return;
        }
        if (state.playersFocusZone === 'actions') {
            const actionBtns = getVisiblePlayersActionButtons();
            const vt = chipVerticalTarget(actionBtns, state.playersActionFocusIndex, delta);
            if (vt >= 0) {
                state.playersActionFocusIndex = vt;
                updatePanelFocus();
                return;
            }
            if (delta > 0) {
                state.playersFocusZone = 'list';
                state.panelFocusIndex = 0;
                state.playersRowSubFocus = 0;
            }
            updatePanelFocus();
            return;
        }
        const rows = getPlayersListRows();
        if (delta < 0 && state.panelFocusIndex === 0) {
            if (isChipSectionToggleVisible('playersActions')) {
                state.playersFocusZone = 'chip_actions';
            } else if (getVisiblePlayersActionButtons().length) {
                state.playersFocusZone = 'actions';
                state.playersActionFocusIndex = Math.max(0, getVisiblePlayersActionButtons().length - 1);
            }
            updatePanelFocus();
            return;
        }
        if (!rows.length) return;
        state.panelFocusIndex = Math.max(0, Math.min(state.panelFocusIndex + delta, rows.length - 1));
        state.playersRowSubFocus = 0;
        updatePanelFocus();
        return;
    }
    if (state.detailsPanelOpen) {
        if (delta < 0 && state.detailsFocusZone === 'list' && state.panelFocusIndex === 0) {
            state.detailsFocusZone = 'panel_back';
            updatePanelFocus();
            return;
        }
        if (state.detailsFocusZone === 'panel_back') {
            if (delta > 0) state.detailsFocusZone = 'list';
            updatePanelFocus();
            return;
        }
        const rows = detailsList.querySelectorAll('.details-row:not(.empty)');
        if (!rows.length) return;
        state.panelFocusIndex = Math.max(0, Math.min(state.panelFocusIndex + delta, rows.length - 1));
        updatePanelFocus();
    }
}

function activatePanelFocused() {
    if (state.browsePanelOpen && state.browseFocusZone === 'panel_back') {
        browseBack();
        return;
    }
    if (state.browsePanelOpen && state.browseFocusZone === 'container_actions') {
        void activateContainerAction();
        return;
    }
    if (state.browsePanelOpen && state.browseFocusZone === 'alpha_view') {
        const bar = document.getElementById('browse-alpha-view-bar');
        const chip = bar?.children?.[state.alphaViewFocusIndex];
        const mode = chip?.dataset?.alphaView;
        if (mode) void switchAlphaViewMode(mode);
        return;
    }
    if (state.browsePanelOpen && state.browseFocusZone === 'artist_providers') {
        const entry = getCurrentBrowseEntry();
        if (entry.type === 'artist') {
            switchArtistProvider(state.artistProviderFocusIndex);
        } else if (entrySupportsBrowseProviders(entry)) {
            const bar = document.getElementById('browse-artist-providers');
            const chip = bar?.children?.[state.artistProviderFocusIndex];
            const providerId = chip?.dataset?.providerId;
            if (providerId) switchBrowseProvider(providerId);
        }
        return;
    }
    if (state.browsePanelOpen && state.browseRowMenuOpen) {
        void activateBrowseMenuItem();
        return;
    }
    if (state.browsePanelOpen) {
        activateBrowseRow(state.panelFocusIndex);
        return;
    }
    if (state.queuePanelOpen && state.queueRowMenuOpen) {
        void activateQueueMenuItem();
        return;
    }
    if (state.queuePanelOpen && state.queueReorderMode) {
        finishQueueReorder();
        return;
    }
    if (state.queuePanelOpen && state.queueFocusZone === 'actions') {
        void activateQueueAction();
        return;
    }
    if (state.queuePanelOpen) {
        activateQueueRow(state.panelFocusIndex);
        return;
    }
    if (state.playersPanelOpen && state.playersRowMenuOpen) {
        void activatePlayersMenuItem();
        return;
    }
    if (state.playersPanelOpen && state.playersFocusZone === 'actions') {
        void activatePlayersAction();
        return;
    }
    if (state.playersPanelOpen) {
        activatePlayersRow(state.panelFocusIndex);
        return;
    }
    if (state.detailsPanelOpen && state.detailsFocusZone === 'panel_back') {
        closeDetailsPanel();
        return;
    }
}

function closeAllPanels() {
    closeBrowsePanel();
    closeQueuePanel();
    closePlayersPanel();
    closeDetailsPanel();
}

function isPanelFocusAtLeftEdge() {
    if (state.browsePanelOpen) {
        if (state.browseRowMenuOpen || state.providerMenuOpen) return true;
        if (state.browseFocusZone === 'panel_back') return true;
        if (state.browseFocusZone === 'provider_menu') return true;
        if (state.browseFocusZone === 'input') return true;
        if (state.browseFocusZone === 'container_actions') {
            return state.containerActionFocusIndex <= 0;
        }
        if (state.browseFocusZone === 'artist_providers') {
            return state.artistProviderFocusIndex <= 0;
        }
        if (state.browseFocusZone === 'alpha_view') {
            return state.alphaViewFocusIndex <= 0;
        }
        if (state.browseFocusZone === 'filters') {
            return state.searchFilterFocusIndex <= 0;
        }
        if (state.browseFocusZone === 'list') {
            if (isBrowseGridView()) {
                const cols = getBrowseGridCols();
                if (!cols) return true;
                return (state.panelFocusIndex % cols) === 0;
            }
            return state.browseRowSubFocus <= 0;
        }
    }
    if (state.queuePanelOpen) {
        if (state.queueRowMenuOpen || state.queueReorderMode) return true;
        if (state.queueFocusZone === 'actions') {
            return state.queueActionFocusIndex <= 0;
        }
        return state.queueRowSubFocus <= 0;
    }
    if (state.playersPanelOpen) {
        if (state.playersRowMenuOpen) return true;
        if (state.playersFocusZone === 'actions') {
            return state.playersActionFocusIndex <= 0;
        }
        if (state.playersFocusZone === 'list') {
            return state.playersRowSubFocus <= 0;
        }
        return false;
    }
    if (state.detailsPanelOpen) {
        if (state.detailsFocusZone === 'panel_back') return true;
        return state.panelFocusIndex <= 0;
    }
    return false;
}

function dismissMediaPanelFromLeft() {
    closeBrowseRowMenu();
    closeQueueRowMenu();
    closePlayersRowMenu();
    closeProviderMenu();
    finishQueueReorder();
    if (state.browsePanelOpen) {
        state.browseStack = [{ key: 'root', title: 'Browse', type: 'root' }];
    }
    closeAllPanels();
}

function handlePanelKeydown(e, code) {
    const KEY_LEFT = 37;
    const KEY_UP = 38;
    const KEY_RIGHT = 39;
    const KEY_DOWN = 40;

    if (code === KEY_LEFT || code === KEY_UP || code === KEY_RIGHT || code === KEY_DOWN) {
        state.lastFocusInput = 'keyboard';
        setPanelInputMode('keyboard');
    }

    if (code === KEY_LEFT && useTieredFocus() && isPanelFocusAtLeftEdge()) {
        e.preventDefault();
        dismissMediaPanelFromLeft();
        return true;
    }

    if (state.browsePanelOpen) {
        if (code === KEY_LEFT || code === KEY_RIGHT) {
            if (state.browseFocusZone === 'provider_menu') {
                e.preventDefault();
                return true;
            }
        }
        if (code === KEY_RIGHT && state.browseFocusZone === 'input' && isBrowseFilterChipsVisible()) {
            e.preventDefault();
            state.browseFocusZone = 'filters';
            state.searchFilterFocusIndex = 0;
            updatePanelFocus();
            return true;
        }
        if (code === KEY_LEFT) {
            e.preventDefault();
            if (state.browseFocusZone === 'list' && state.browseRowMenuOpen) {
                return true;
            }
            if (state.browseFocusZone === 'container_actions') {
                moveContainerActionFocus(-1);
            } else if (state.browseFocusZone === 'alpha_view') {
                moveAlphaViewFocus(-1);
            } else if (state.browseFocusZone === 'artist_providers') {
                moveArtistProviderFocus(-1);
            } else if (state.browseFocusZone === 'filters') {
                moveSearchFilterFocus(-1);
            } else if (state.browseFocusZone === 'list' && isBrowseGridView()) {
                moveBrowseGridFocus(0, -1);
            } else if (state.browseFocusZone === 'list') {
                moveBrowseRowSubFocus(-1);
            }
            return true;
        }
        if (code === KEY_RIGHT) {
            e.preventDefault();
            if (state.browseFocusZone === 'list' && state.browseRowMenuOpen) {
                return true;
            }
            if (state.browseFocusZone === 'container_actions') {
                moveContainerActionFocus(1);
            } else if (state.browseFocusZone === 'alpha_view') {
                moveAlphaViewFocus(1);
            } else if (state.browseFocusZone === 'artist_providers') {
                moveArtistProviderFocus(1);
            } else if (state.browseFocusZone === 'filters') {
                moveSearchFilterFocus(1);
            } else if (state.browseFocusZone === 'list' && isBrowseGridView()) {
                moveBrowseGridFocus(0, 1);
            } else if (state.browseFocusZone === 'list') {
                moveBrowseRowSubFocus(1);
            }
            return true;
        }
    }

    if (state.queuePanelOpen && !state.queueReorderMode) {
        if (state.queueFocusZone === 'actions') {
            if (code === KEY_LEFT) {
                e.preventDefault();
                const actionBtns = getVisibleQueueActionButtons();
                if (actionBtns.length > 1) {
                    state.queueActionFocusIndex = Math.max(0, state.queueActionFocusIndex - 1);
                    updatePanelFocus();
                }
                return true;
            }
            if (code === KEY_RIGHT) {
                e.preventDefault();
                const actionBtns = getVisibleQueueActionButtons();
                if (actionBtns.length > 1) {
                    state.queueActionFocusIndex = Math.min(actionBtns.length - 1, state.queueActionFocusIndex + 1);
                    updatePanelFocus();
                }
                return true;
            }
        } else if (!state.queueRowMenuOpen) {
            if (code === KEY_LEFT) {
                e.preventDefault();
                moveQueueRowSubFocus(-1);
                return true;
            }
            if (code === KEY_RIGHT) {
                e.preventDefault();
                moveQueueRowSubFocus(1);
                return true;
            }
        }
    }

    if (state.playersPanelOpen && state.playersFocusZone === 'actions') {
        if (code === KEY_LEFT) {
            e.preventDefault();
            const actionBtns = getVisiblePlayersActionButtons();
            if (actionBtns.length > 1) {
                state.playersActionFocusIndex = Math.max(0, state.playersActionFocusIndex - 1);
                updatePanelFocus();
            }
            return true;
        }
        if (code === KEY_RIGHT) {
            e.preventDefault();
            const actionBtns = getVisiblePlayersActionButtons();
            if (actionBtns.length > 1) {
                state.playersActionFocusIndex = Math.min(actionBtns.length - 1, state.playersActionFocusIndex + 1);
                updatePanelFocus();
            }
            return true;
        }
    }

    if (state.playersPanelOpen && state.playersFocusZone === 'list') {
        if (code === KEY_LEFT) {
            e.preventDefault();
            if (state.playersRowMenuOpen) return true;
            movePlayersRowSubFocus(-1);
            return true;
        }
        if (code === KEY_RIGHT) {
            e.preventDefault();
            if (state.playersRowMenuOpen) return true;
            movePlayersRowSubFocus(1);
            return true;
        }
    }

    if (state.playersPanelOpen && state.playersRowMenuOpen) {
        if (code === KEY_UP) {
            e.preventDefault();
            movePlayersMenuFocus(-1);
            return true;
        }
        if (code === KEY_DOWN) {
            e.preventDefault();
            movePlayersMenuFocus(1);
            return true;
        }
    }

    if (code === KEY_UP) {
        e.preventDefault();
        movePanelFocus(-1);
        return true;
    }
    if (code === KEY_DOWN) {
        e.preventDefault();
        movePanelFocus(1);
        return true;
    }
    if (state.browsePanelOpen && state.browseFocusZone === 'provider_menu'
        && (code === 403 || code === 457 || code === 13 || e.key === 'Enter')) {
        e.preventDefault();
        markRemoteAction();
        activateProviderMenuItem();
        return true;
    }
    if (state.browsePanelOpen && state.browseFocusZone === 'search_toggle'
        && (code === 403 || code === 457 || code === 13 || e.key === 'Enter')) {
        e.preventDefault();
        markRemoteAction();
        setSearchInputCollapsed(!getSearchInputCollapsed());
        return true;
    }
    if (state.browsePanelOpen && (state.browseFocusZone === 'chip_artistProviders'
        || state.browseFocusZone === 'chip_alphaView'
        || state.browseFocusZone === 'chip_containerActions')
        && (code === 403 || code === 457 || code === 13 || e.key === 'Enter')) {
        e.preventDefault();
        markRemoteAction();
        activateChipSectionToggle(browseChipSectionKey(state.browseFocusZone));
        return true;
    }
    if (state.browsePanelOpen && state.browseFocusZone === 'filters'
        && (code === 403 || code === 457 || code === 13 || e.key === 'Enter')) {
        e.preventDefault();
        markRemoteAction();
        activateSearchFilter();
        return true;
    }
    if (state.browsePanelOpen && state.browseFocusZone === 'container_actions'
        && (code === 403 || code === 457 || code === 13 || e.key === 'Enter')) {
        e.preventDefault();
        markRemoteAction();
        activatePanelFocused();
        return true;
    }
    if (state.browsePanelOpen && state.browseFocusZone === 'artist_providers'
        && (code === 403 || code === 457 || code === 13 || e.key === 'Enter')) {
        e.preventDefault();
        markRemoteAction();
        activatePanelFocused();
        return true;
    }
    if (state.playersPanelOpen && state.playersFocusZone === 'actions'
        && (code === 403 || code === 457 || code === 13 || e.key === 'Enter')) {
        e.preventDefault();
        markRemoteAction();
        void activatePlayersAction();
        return true;
    }
    if (code === 403 || code === 457 || code === 13 || e.key === 'Enter') {
        if (state.browsePanelOpen && document.activeElement === browseSearchInput) return false;
        if (state.queuePanelOpen && document.activeElement === queueSavePlaylistInput) return false;
        e.preventDefault();
        markRemoteAction();
        if (state.browsePanelOpen && state.browseRowMenuOpen) {
            void activateBrowseMenuItem();
            return true;
        }
        if (state.queuePanelOpen && state.queueRowMenuOpen) {
            void activateQueueMenuItem();
            return true;
        }
        if (state.playersPanelOpen && state.playersRowMenuOpen) {
            void activatePlayersMenuItem();
            return true;
        }
        if (state.queuePanelOpen && state.queueReorderMode) {
            finishQueueReorder();
            return true;
        }
        if (state.queuePanelOpen && state.queueFocusZone === 'chip_actions') {
            activateChipSectionToggle('queueActions');
            return true;
        }
        if (state.queuePanelOpen && state.queueFocusZone === 'actions') {
            void activateQueueAction();
            return true;
        }
        if (state.playersPanelOpen) {
            if (state.playersFocusZone === 'chip_actions') {
                activateChipSectionToggle('playersActions');
                return true;
            }
            if (state.playersFocusZone === 'actions') {
                void activatePlayersAction();
                return true;
            }
            activatePlayersRow(state.panelFocusIndex);
            return true;
        }
        if (state.queuePanelOpen) {
            activateQueueRow(state.panelFocusIndex);
            return true;
        }
        activatePanelFocused();
        return true;
    }
    return false;
}

function activateMenuItem() {
    const item = getSettingsFocusTargets()[state.menuFocusIndex];
    if (!item || item === vizBarCountRow || item === vizFpsRow) return;
    if (item === menuSetupBtn) {
        closeSettingsMenu();
        uiH('openSetup');
        return;
    }
    if (item === menuShowConnectionBtn) {
        setShowConnection(!getShowConnection());
        return;
    }
    if (item === menuArtDisplayBtn) {
        openArtDisplayMenu();
        return;
    }
    if (item === menuShowLyricsBtn) {
        setShowLyricsEnabled(!getShowLyricsEnabled());
        return;
    }
    if (item === menuDisableVisualizerBtn) {
        setDisableVisualizer(!getDisableVisualizer());
        return;
    }
    if (item === menuDisableVizBlurBtn) {
        setDisableVizBlur(!getDisableVizBlur());
        return;
    }
    if (item === menuEqPresetsBtn) {
        void openEqPresetsMenu();
        return;
    }
    if (item === menuSwitchInfoBtn) {
        toggleRadioSwitchInfo();
        return;
    }
    if (item === menuVizModesBtn) {
        openVizModesMenu();
        return;
    }
    if (item === menuFullscreenBtn) {
        void setFullscreen(!isFullscreen());
        return;
    }
    if (item === menuGuestAccessBtn) {
        void uiH('openGuestAccessModal');
        return;
    }
    if (item === menuCloseBtn) {
        closeSettingsMenu();
    }
}

function activateFocused() {
    if (state.navGenresMenuOpen) {
        activateNavGenreItem();
        return;
    }
    if (state.navMenuOpen) {
        activateNavMenuItem();
        return;
    }
    if (state.artDisplayMenuOpen) {
        activateArtDisplayFocused();
        return;
    }
    if (state.vizModesMenuOpen) {
        activateVizModesFocused();
        return;
    }
    if (state.eqPresetsMenuOpen) {
        activateEqPresetsFocused();
        return;
    }
    if (state.volumeMenuOpen) {
        uiH('activateVolumeFocused');
        return;
    }
    if (state.settingsMenuOpen) {
        activateMenuItem();
        return;
    }
    let el;
    if (useTieredFocus()) {
        if (state.uiFocusZone === 'progress') return;
        if (state.uiFocusZone === 'topbar') el = topBarControls[state.topBarFocusIndex];
        else if (state.uiFocusZone === 'controls') el = playbackControls[state.playbackFocusIndex];
        else return;
    } else {
        el = focusableControls[state.focusIndex];
    }
    if (!el) return;
    if (el === navBtn) { toggleNavMenu(); return; }
    if (el === browseBtn) { openBrowsePanel(); return; }
    if (el === queueBtn) { openQueuePanel(); return; }
    if (el === volumeBtn) { uiH('toggleVolumeMenu'); return; }
    if (el === playersBtn) {
        if (state.playersPanelOpen) closePlayersPanel();
        else openPlayersPanel();
        return;
    }
    if (el === settingsBtn) { toggleSettingsMenu(); return; }
    if (el === shuffleBtn) { uiH('toggleShuffle'); return; }
    if (el === playBtn) { uiH('togglePlayPause'); return; }
    if (el === prevBtn) { uiH('sendPlayerCommand', 'previous'); showUI(); return; }
    if (el === nextBtn) { uiH('sendPlayerCommand', 'next'); showUI(); return; }
    if (el === repeatBtn) { uiH('cycleRepeat'); return; }
}

function getVisibleFocusableControls() {
    return focusableControls.filter((el) => !el.hidden);
}

function moveFocus(delta) {
    if (!mainBody.classList.contains('show-ui')) showUI();
    else if (!state.settingsMenuOpen && !state.navMenuOpen && !state.volumeMenuOpen && !state.eqPresetsMenuOpen && !state.vizModesMenuOpen && !blocksUiAutoHide()) resumeUiHideTimer();
    const visible = getVisibleFocusableControls();
    if (!visible.length) return;
    const currentIdx = Math.max(0, visible.indexOf(focusableControls[state.focusIndex]));
    const nextEl = visible[(currentIdx + delta + visible.length) % visible.length];
    state.focusIndex = focusableControls.indexOf(nextEl);
    updateFocus();
}

function isOverlayMenuOpen() {
    return state.settingsMenuOpen || state.navMenuOpen || state.navGenresMenuOpen
        || state.volumeMenuOpen || state.eqPresetsMenuOpen || state.vizModesMenuOpen
        || state.artDisplayMenuOpen;
}

function hideUI() {
    if (hasActiveMouseHover()) {
        resumeUiHideTimer();
        return;
    }
    closeSettingsMenu();
    closeNavMenu();
    uiH('closeVolumeMenu');
    const setupOpen = isSetupOpen();
    const panelOpen = isPanelOpen();
    let floatSeed = null;
    if (getArtDisplayMode() === 'float'
        && mainBody.classList.contains('show-ui')
        && !panelOpen
        && !setupOpen) {
        const rect = playerStage.getBoundingClientRect();
        floatSeed = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        };
    }
    closeAllPanels();
    clearLyricsIdleFocus();
    mainBody.classList.add('show-ui-exiting');
    mainBody.classList.remove('show-ui');
    uiH('clearStackLayoutAnimationState');
    uiH('resetPlaybackStackLayout');
    uiH('snapPlayerStageForIdleLayout');
    pauseUiHideTimer();
    focusableControls.forEach(el => {
        el.classList.remove('focused');
        el.classList.remove('mouse-hover');
    });
    progressSlider?.classList.remove('focused');
    state.uiFocusZone = 'controls';
    state.playbackFocusIndex = 2;
    uiH('invalidateIdleProgressVisibility');
    uiH('syncIdleProgressVisibility');
    if (IS_TV_REMOTE) {
        requestAnimationFrame(() => {
            uiH('invalidateIdleProgressVisibility');
            uiH('syncIdleProgressVisibility');
        });
    }
    uiH('updateFloatState', floatSeed, { skipTitleRelayout: true });
    uiH('refreshTitleLayout');
    window.setTimeout(() => {
        mainBody.classList.remove('show-ui-exiting');
        uiH('refreshTitleLayout');
        uiH('snapPlayerStageForIdleLayout');
    }, 350);
    if (isBrowserUi()) setCursorHidden(true);
}

function isBackKey(e, code) {
    const el = document.activeElement;
    if (code === 8 && el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        return false;
    }
    return code === 461 || code === 27 || code === 10009
        || e.key === 'Escape' || e.key === 'GoBack' || e.key === 'Back';
}

function isSetupOpen() {
    return document.getElementById('setup-overlay')?.classList.contains('open') ?? false;
}

function handleAppBack() {
    if (state.queueReorderMode) {
        finishQueueReorder();
        return true;
    }
    if (state.queueRowMenuOpen) {
        closeQueueRowMenu();
        return true;
    }
    if (state.browseRowMenuOpen) {
        closeBrowseRowMenu();
        return true;
    }
    if (state.browsePanelOpen) {
        if (state.providerMenuOpen) {
            closeProviderMenu();
            return true;
        }
        if (isSearchContext()) {
            if (state.browseFocusZone === 'list') {
                state.browseFocusZone = isBrowseFilterChipsVisible() ? 'filters' : 'input';
                syncSearchInputValue();
                updatePanelFocus();
                return true;
            }
            if (state.browseFocusZone === 'filters') {
                state.browseFocusZone = 'input';
                syncSearchInputValue();
                updatePanelFocus();
                return true;
            }
            if (state.browseFocusZone === 'input') {
                browseBack();
                return true;
            }
        }
        if (state.browseEntryMode === 'shortcut') {
            closeBrowsePanel();
            return true;
        }
        browseBack();
        return true;
    }
    if (state.queuePanelOpen) {
        closeQueuePanel();
        return true;
    }
    if (state.playersPanelOpen) {
        if (state.playersRowMenuOpen) {
            closePlayersRowMenu();
            return true;
        }
        if (state.playersStereoPairExpanded) {
            state.playersStereoPairExpanded = false;
            renderPlayersPanel();
            updatePanelFocus();
            return true;
        }
        closePlayersPanel();
        return true;
    }
    if (state.detailsPanelOpen) {
        closeDetailsPanel();
        return true;
    }
    if (state.eqPresetsMenuOpen) {
        closeEqPresetsMenu();
        return true;
    }
    if (state.artDisplayMenuOpen) {
        closeArtDisplayMenu();
        return true;
    }
    if (state.vizModesMenuOpen) {
        closeVizModesMenu();
        return true;
    }
    if (state.settingsMenuOpen) {
        closeSettingsMenu();
        return true;
    }
    if (state.volumeMenuOpen) {
        uiH('closeVolumeMenu');
        return true;
    }
    if (state.navGenresMenuOpen) {
        closeNavGenresMenu();
        return true;
    }
    if (state.navMenuOpen) {
        closeNavMenu();
        return true;
    }
    if (isSetupOpen()) {
        if (localStorage.getItem('ma_server_ip')) uiH('closeSetup');
        return true;
    }
    if (isGuestAccessOpen()) {
        uiH('closeGuestAccessOverlay');
        return true;
    }
    if (isLyricsIdleFocused()) {
        clearLyricsIdleFocus();
        return true;
    }
    if (mainBody.classList.contains('show-ui')) {
        hideUI();
        return true;
    }
    if (isWebUi() || mainBody.classList.contains('browser-ui')) return true;
    uiH('exitApp');
    return true;
}

function consumeBackKey(e) {
    if (e.type === 'keyup') {
        if (consumePinnedFullscreenEscKeyUp(e)) return true;
        return false;
    }
    const code = e.keyCode || e.which;
    if (!isBackKey(e, code)) return false;
    if (consumePinnedFullscreenEscKeyDown(e)) {
        handleAppBack();
        return true;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    handleAppBack();
    return true;
}

function showUI(options = {}) {
    setCursorHidden(false);
    clearLyricsIdleFocus();
    clearTimeout(state.cursorIdleTimer);
    if (!state.settingsMenuOpen && !state.navMenuOpen && !state.volumeMenuOpen && !state.eqPresetsMenuOpen && !state.vizModesMenuOpen && !state.artDisplayMenuOpen && !blocksUiAutoHide()) {
        closeSettingsMenu();
        closeNavMenu();
        uiH('closeVolumeMenu');
        closeEqPresetsMenu();
        closeVizModesMenu();
        closeArtDisplayMenu();
    }
    const enteringShowUi = !mainBody.classList.contains('show-ui');
    if (enteringShowUi) {
        const fromFloat = mainBody.classList.contains('dvd-float');
        const fromCorner = mainBody.classList.contains('art-corner-info');
        if (fromFloat || fromCorner) {
            playerStage?.classList.add('stage-handoff');
        } else {
            uiH('clearPlayerStageInlineTransform');
        }
        mainBody.classList.add('show-ui');
    }
    uiH('invalidateIdleProgressVisibility');
    uiH('syncIdleProgressVisibility');
    uiH('updateFloatState', null, { skipTitleRelayout: true });
    if (enteringShowUi) {
        uiH('commitShowUiChromeLayout');
    } else if (options.relayout) {
        uiH('applyPlaybackStackLayout', { immediate: true });
    }
    if (!state.settingsMenuOpen && !state.navMenuOpen && !state.volumeMenuOpen && !state.eqPresetsMenuOpen && !state.vizModesMenuOpen && !blocksUiAutoHide()) resumeUiHideTimer();
}

function isWebUiInteractiveTarget(el) {
    return !!el?.closest(
        '#top-bar, #controls-container, .media-panel, #settings-menu, #nav-menu, '
        + '#volume-menu, #eq-presets-menu, #viz-modes-menu, #art-display-menu, .queue-row-menu, .browse-row-menu, .players-row-menu, .search-provider-menu, #setup-overlay, #guest-access-overlay, '
        + '.progress-wrapper, button, input, textarea, a, label, select',
    );
}

function handleCanvasDismissClick(e) {
    if (Date.now() < ignoreClickUntil) return;
    if (isSetupOpen()) return;
    const el = e.target;
    if (isWebUiInteractiveTarget(el)) return;

    if (state.settingsMenuOpen || state.navMenuOpen || state.volumeMenuOpen || state.eqPresetsMenuOpen || state.vizModesMenuOpen || state.artDisplayMenuOpen) {
        closeSettingsMenu();
        closeNavMenu();
        uiH('closeVolumeMenu');
        closeEqPresetsMenu();
        closeVizModesMenu();
        closeArtDisplayMenu();
        resumeUiHideTimer();
        return;
    }

    if (isGuestAccessOpen()) {
        const inLeftPane = e.clientX < window.innerWidth * 0.4;
        if (inLeftPane || el.closest('#player-stage, #bg-stack, #viz-wrap')) {
            uiH('closeGuestAccessOverlay');
            resumeUiHideTimer();
        }
        return;
    }

    if (isPanelOpen()) {
        const inLeftPane = e.clientX < window.innerWidth * 0.4;
        if (inLeftPane || el.closest('#player-stage, #bg-stack, #viz-wrap')) {
            closeAllPanels();
            resumeUiHideTimer();
        }
        return;
    }

    if (mainBody.classList.contains('show-ui') && el.closest('#player-stage')) return;

    if (mainBody.classList.contains('show-ui')) {
        hideUI();
    } else {
        showUI();
    }
}

function markRemoteAction() {
    ignoreClickUntil = Date.now() + 400;
    state.lastFocusInput = 'keyboard';
}

function handleGlobalKeydown(e) {
    const code = e.keyCode || e.which;
    if (consumeBackKey(e)) return;

    if (isPanelOpen()) {
        if (handlePanelKeydown(e, code)) return;
    }

    if (state.navGenresMenuOpen) {
        const KEY_UP = 38;
        const KEY_DOWN = 40;
        const KEY_ENTER = 13;
        if (code === KEY_UP) {
            e.preventDefault();
            moveNavGenresMenuFocus(-1);
            return;
        }
        if (code === KEY_DOWN) {
            e.preventDefault();
            moveNavGenresMenuFocus(1);
            return;
        }
        if (code === KEY_ENTER || code === 403 || code === 457 || e.key === 'Enter') {
            e.preventDefault();
            activateNavGenreItem();
            return;
        }
        return;
    }

    if (state.navMenuOpen) {
        const KEY_UP = 38;
        const KEY_DOWN = 40;
        const KEY_ENTER = 13;
        if (code === KEY_UP) {
            e.preventDefault();
            moveNavMenuFocus(-1);
            return;
        }
        if (code === KEY_DOWN) {
            e.preventDefault();
            moveNavMenuFocus(1);
            return;
        }
        if (code === KEY_ENTER || code === 403 || code === 457 || e.key === 'Enter') {
            e.preventDefault();
            activateNavMenuItem();
            return;
        }
        return;
    }

    if (state.artDisplayMenuOpen) {
        const KEY_UP = 38;
        const KEY_DOWN = 40;
        const KEY_ENTER = 13;
        if (code === KEY_UP) {
            e.preventDefault();
            moveArtDisplayFocus(-1);
            return;
        }
        if (code === KEY_DOWN) {
            e.preventDefault();
            moveArtDisplayFocus(1);
            return;
        }
        if (code === KEY_ENTER || code === 403 || code === 457 || e.key === 'Enter') {
            e.preventDefault();
            activateArtDisplayFocused();
            return;
        }
        return;
    }

    if (state.vizModesMenuOpen) {
        const KEY_UP = 38;
        const KEY_DOWN = 40;
        const KEY_LEFT = 37;
        const KEY_RIGHT = 39;
        const KEY_ENTER = 13;
        if (state.vizModeFocusIndex === 0) {
            if (code === KEY_LEFT) {
                e.preventDefault();
                moveVizSelectorIconFocus(-1);
                return;
            }
            if (code === KEY_RIGHT) {
                e.preventDefault();
                moveVizSelectorIconFocus(1);
                return;
            }
        }
        if (code === KEY_UP) {
            e.preventDefault();
            moveVizModesFocus(-1);
            return;
        }
        if (code === KEY_DOWN) {
            e.preventDefault();
            moveVizModesFocus(1);
            return;
        }
        if (code === KEY_ENTER || code === 403 || code === 457 || e.key === 'Enter') {
            e.preventDefault();
            activateVizModesFocused();
            return;
        }
        return;
    }

    if (state.eqPresetsMenuOpen) {
        const KEY_UP = 38;
        const KEY_DOWN = 40;
        const KEY_ENTER = 13;
        if (code === KEY_UP) {
            e.preventDefault();
            moveEqPresetsFocus(-1);
            return;
        }
        if (code === KEY_DOWN) {
            e.preventDefault();
            moveEqPresetsFocus(1);
            return;
        }
        if (code === KEY_ENTER || code === 403 || code === 457 || e.key === 'Enter') {
            e.preventDefault();
            activateEqPresetsFocused();
            return;
        }
        return;
    }

    if (state.volumeMenuOpen) {
        const KEY_LEFT = 37;
        const KEY_UP = 38;
        const KEY_RIGHT = 39;
        const KEY_DOWN = 40;
        const KEY_ENTER = 13;
        if (code === KEY_LEFT) {
            e.preventDefault();
            uiH('adjustVolume', -3);
            return;
        }
        if (code === KEY_RIGHT) {
            e.preventDefault();
            uiH('adjustVolume', 3);
            return;
        }
        if (code === KEY_UP) {
            e.preventDefault();
            uiH('moveVolumeFocus', -1);
            return;
        }
        if (code === KEY_DOWN) {
            e.preventDefault();
            uiH('moveVolumeFocus', 1);
            return;
        }
        if (code === KEY_ENTER || code === 403 || code === 457 || e.key === 'Enter') {
            e.preventDefault();
            uiH('activateVolumeFocused');
            return;
        }
        return;
    }

    if (state.settingsMenuOpen && !state.artDisplayMenuOpen && !state.vizModesMenuOpen && !state.eqPresetsMenuOpen) {
        const KEY_UP = 38;
        const KEY_DOWN = 40;
        const KEY_LEFT = 37;
        const KEY_RIGHT = 39;
        const KEY_ENTER = 13;
        const focusTarget = getSettingsFocusTargets()[state.menuFocusIndex];
        if (focusTarget === vizBarCountRow) {
            if (code === KEY_LEFT) {
                e.preventDefault();
                adjustVizBarCount(-2);
                return;
            }
            if (code === KEY_RIGHT) {
                e.preventDefault();
                adjustVizBarCount(2);
                return;
            }
        }
        if (focusTarget === vizFpsRow) {
            if (code === KEY_LEFT) {
                e.preventDefault();
                adjustVizFpsNotches(-1);
                return;
            }
            if (code === KEY_RIGHT) {
                e.preventDefault();
                adjustVizFpsNotches(1);
                return;
            }
        }
        if (code === KEY_UP) {
            e.preventDefault();
            state.menuFocusIndex = Math.max(0, state.menuFocusIndex - 1);
            updateMenuFocus();
            return;
        }
        if (code === KEY_DOWN) {
            e.preventDefault();
            state.menuFocusIndex = Math.min(getSettingsFocusTargets().length - 1, state.menuFocusIndex + 1);
            updateMenuFocus();
            return;
        }
        if (code === KEY_ENTER || code === 403 || code === 457 || e.key === 'Enter') {
            e.preventDefault();
            activateMenuItem();
            return;
        }
        if (code === KEY_LEFT || code === KEY_RIGHT) {
            e.preventDefault();
            return;
        }
        return;
    }

    if (isSetupOpen()) {
        const KEY_UP = 38;
        const KEY_DOWN = 40;
        const KEY_ENTER = 13;
        if (code === KEY_UP || code === KEY_DOWN) {
            e.preventDefault();
            uiH('moveSetupFocus', code === KEY_DOWN ? 1 : -1);
            return;
        }
        if (code === KEY_ENTER || code === 403 || code === 457 || e.key === 'Enter') {
            const active = document.activeElement;
            e.preventDefault();
            if (active?.id === 'setup-connect') {
                uiH('setupConnect');
            } else if (active?.id === 'input-password') {
                uiH('setupConnect');
            } else {
                uiH('setupNextStep');
            }
            return;
        }
        return;
    }

    const KEY_LEFT = 37;
    const KEY_UP = 38;
    const KEY_RIGHT = 39;
    const KEY_DOWN = 40;
    const KEY_ENTER = 13;
    const KEY_PLAY = 415;
    const KEY_PAUSE = 19;
    const KEY_PLAYPAUSE = 179;
    const KEY_STOP = 178;
    const KEY_REWIND = 412;
    const KEY_FASTFWD = 417;
    const KEY_PREV = 177;
    const KEY_NEXT = 176;

    if (code === KEY_PLAYPAUSE || code === KEY_PLAY || code === KEY_PAUSE || e.key === ' ') {
        const active = document.activeElement;
        if (active === browseSearchInput
            || active?.tagName === 'INPUT'
            || active?.tagName === 'TEXTAREA'
            || active?.isContentEditable) {
            return;
        }
        e.preventDefault();
        uiH('togglePlayPause');
        showUI();
        return;
    }

    if (code === KEY_PREV || code === KEY_REWIND) {
        e.preventDefault();
        uiH('sendPlayerCommand', 'previous');
        markRemoteAction();
        return;
    }

    if (code === KEY_NEXT || code === KEY_FASTFWD) {
        e.preventDefault();
        uiH('sendPlayerCommand', 'next');
        markRemoteAction();
        return;
    }

    if (code === KEY_STOP) {
        e.preventDefault();
        void (async () => {
            if (await localPlayerInSyncGroup()) {
                try {
                    await stopSyncGroupPlayback();
                } catch (err) {
                    console.warn('sync group stop failed:', err);
                }
            }
            uiH('sendPlayerCommand', 'stop');
            showUI();
        })();
        return;
    }

    if (code === KEY_LEFT) {
        e.preventDefault();
        if (isGuestAccessOpen()) {
            uiH('closeGuestAccessOverlay');
            return;
        }
        if (!mainBody.classList.contains('show-ui') && isLyricsIdleFocused()) {
            clearLyricsIdleFocus();
            return;
        }
        if (useTieredFocus()) moveWebOsHorizontal(-1, e.repeat);
        else moveFocus(-1);
        return;
    }

    if (code === KEY_RIGHT) {
        e.preventDefault();
        if (!mainBody.classList.contains('show-ui') && useTieredFocus()) {
            handleIdleHorizontal(1);
            return;
        }
        if (useTieredFocus()) moveWebOsHorizontal(1, e.repeat);
        else moveFocus(1);
        return;
    }

    if (code === KEY_DOWN) {
        e.preventDefault();
        if (useTieredFocus()) {
            moveWebOsVertical(1);
        } else if (!mainBody.classList.contains('show-ui') && isLyricsIdleFocused()) {
            scrollLyricsBy(1);
        } else if (mainBody.classList.contains('show-ui')) {
            hideUI();
        } else {
            showUI();
            state.focusIndex = 2;
            updateFocus();
        }
        return;
    }

    if (code === KEY_UP) {
        e.preventDefault();
        if (useTieredFocus()) {
            moveWebOsVertical(-1);
        } else if (!mainBody.classList.contains('show-ui') && isLyricsIdleFocused()) {
            scrollLyricsBy(-1);
        } else if (!mainBody.classList.contains('show-ui')) {
            showUI();
            state.focusIndex = Math.max(0, focusableControls.indexOf(browseBtn));
            updateFocus();
        } else {
            showUI();
            state.focusIndex = 2;
            updateFocus();
        }
        markRemoteAction();
        return;
    }

    if (code === 403 || code === 457) {
        e.preventDefault();
        markRemoteAction();
        if (state.navMenuOpen) {
            activateNavMenuItem();
        } else if (state.artDisplayMenuOpen) {
            activateArtDisplayFocused();
        } else if (state.vizModesMenuOpen) {
            activateVizModesFocused();
        } else if (state.eqPresetsMenuOpen) {
            activateEqPresetsFocused();
        } else if (state.settingsMenuOpen) {
            activateMenuItem();
        } else if (mainBody.classList.contains('show-ui')) {
            activateFocused();
            if (!state.settingsMenuOpen) showUI();
        } else {
            wakeUiFromIdle();
        }
        return;
    }

    if (code === KEY_ENTER || e.key === 'Enter') {
        e.preventDefault();
        markRemoteAction();
        if (!mainBody.classList.contains('show-ui')) {
            wakeUiFromIdle();
        } else {
            activateFocused();
            if (!state.settingsMenuOpen) showUI();
        }
        return;
    }
}

function bindKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        consumeBackKey(e);
    }, true);
    document.addEventListener('keyup', (e) => {
        consumeBackKey(e);
    }, true);
    window.addEventListener('keydown', handleGlobalKeydown);
    if (isBrowserUi() || IS_ANDROID) {
        document.addEventListener('click', handleCanvasDismissClick);
    } else if (!isWebUi()) {
        document.addEventListener('mousemove', () => showUI(), { passive: true });
    }
}


export {
    bindMouseHoverHighlights,
    bindPanelPointerMode,
    bindKeyboardNavigation,
    panelKeyboardFocusActive,
    setPanelInputMode,
    syncPanelInputModeForOpen,
    focusPanelTarget,
    isPanelOpen,
    pauseUiHideTimer,
    resumeUiHideTimer,
    updatePanelFocus,
    closeAllPanels,
    isOverlayMenuOpen,
    hideUI,
    showUI,
    markRemoteAction,
    handleAppBack,
    consumeBackKey,
    isSetupOpen,
    isGuestAccessOpen,
    resetNavButtonFocus,
    getIgnoreClickUntil,
    normalizeUiFocusZone,
    isProgressFocusAvailable,
};
