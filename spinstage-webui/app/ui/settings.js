/**
 * Settings menu, EQ presets submenu, visualizer prefs, art display.
 * Cross-module callbacks use ui/handlers.js (wired in spinstage-app.js).
 */
import { state } from '../state.js';
import {
    SHOW_CONNECTION_KEY,
    DISABLE_VISUALIZER_KEY,
    VIZ_BAR_COUNT_KEY,
    EQ_PRESET_KEY,
    BASS_MODE_KEY,
    BASS_MODE_PRESET_NAME,
    SCREENSAVER_CLIENT,
    IS_ANDROID,
    IS_WEBOS,
} from '../constants.js';
import { isBrowserUi } from '../platform.js';
import { getDefaultPlayerName } from '../util/server.js';
import {
    mainBody,
    statusBar,
    settingsMenu,
    settingsBtn,
    showConnectionCheck,
    disableVisualizerCheck,
    fullscreenCheck,
    vizWrap,
    vizBarCountRow,
    vizResolutionLabelEl,
    vizBarCountSlider,
    vizBarCountValueEl,
    vizFpsRow,
    vizFpsSlider,
    vizFpsValueEl,
    menuDisableVisualizerBtn,
    menuGuestAccessBtn,
    menuArtDisplayBtn,
    menuShowLyricsBtn,
    showLyricsCheck,
    menuShowConnectionBtn,
    menuEqPresetsBtn,
    menuSwitchInfoBtn,
    switchInfoCheck,
    menuVizModesBtn,
    menuFullscreenBtn,
    menuSetupBtn,
    menuCloseBtn,
    eqPresetsMenu,
    eqPresetsList,
    eqPresetsCloseBtn,
    vizModesMenu,
    vizModesList,
    vizModesCloseBtn,
    artDisplayMenu,
    artDisplayList,
    artDisplayCloseBtn,
} from '../dom.js';
import {
    ART_DISPLAY_MODES,
    getArtDisplayMode,
    setArtDisplayMode,
    shouldKeepScreenAwake,
} from '../playback/art-display.js';
import {
    getShowLyricsEnabled as readShowLyricsPref,
    setShowLyricsEnabled as applyShowLyricsPref,
} from '../playback/lyrics-panel.js';
import { maClient } from '../ma/client.js';
import {
    normalizeVizBarCount,
    getVizBarCount,
    getDisableVisualizer,
    getVisualizer,
    tryAttachVisualizer,
    getVizMode,
    getVizModes,
    toggleVizModeSelection,
    getVizSelectionMode,
    setVizSelectionMode,
    isVizModeActiveInUi,
    vizModeUsesBarResolution,
    getVizResolutionLabel,
    getVizFps,
    setVizFps,
    setVizFpsByNotchIndex,
    adjustVizFps,
    getVizFpsNotchIndex,
    VIZ_MODES,
} from '../playback/visualizer.js';
import { uiH } from './handlers.js';

const settingsMenuItems = [
    menuGuestAccessBtn, menuArtDisplayBtn, menuShowLyricsBtn, menuFullscreenBtn,
    menuDisableVisualizerBtn, menuVizModesBtn,
    menuEqPresetsBtn, menuSwitchInfoBtn, menuShowConnectionBtn, menuSetupBtn, menuCloseBtn,
];

let webUiFullscreenPinned = false;

function getShowConnection() {
    return localStorage.getItem(SHOW_CONNECTION_KEY) === '1';
}



function setShowConnection(enabled) {
    localStorage.setItem(SHOW_CONNECTION_KEY, enabled ? '1' : '0');
    showConnectionCheck.classList.toggle('on', enabled);
    mainBody.classList.toggle('show-connection', enabled);
    // Re-apply the status line so toggling immediately reveals/hides the
    // connection: visibility needs the status bar's "connected" state
    // class, which earlier actions may have cleared while this was off.
    if (maClient.bootstrapped) {
        uiH('setStatus', `connected · ${getDefaultPlayerName()}`, enabled ? 'connected' : '');
    }
}



function syncVizResolutionRow() {
    const disabled = getDisableVisualizer();
    const usesResolution = !disabled && vizModeUsesBarResolution(getVizModes());
    if (menuVizModesBtn) menuVizModesBtn.hidden = disabled;
    if (vizBarCountRow) vizBarCountRow.hidden = !usesResolution;
    if (vizFpsRow) vizFpsRow.hidden = disabled;
    if (vizResolutionLabelEl) {
        vizResolutionLabelEl.textContent = getVizResolutionLabel();
    }
}



function syncSettingsMenuChecks() {
    showConnectionCheck.classList.toggle('on', getShowConnection());
    disableVisualizerCheck.classList.toggle('on', getDisableVisualizer());
    if (fullscreenCheck) fullscreenCheck.classList.toggle('on', isFullscreen());
    syncVizResolutionRow();
    const barCount = getVizBarCount();
    if (vizBarCountSlider) vizBarCountSlider.value = String(barCount);
    if (vizBarCountValueEl) vizBarCountValueEl.textContent = String(barCount);
    const fpsIdx = getVizFpsNotchIndex();
    if (vizFpsSlider) vizFpsSlider.value = String(fpsIdx);
    if (vizFpsValueEl) vizFpsValueEl.textContent = String(getVizFps());
    if (showLyricsCheck) showLyricsCheck.classList.toggle('on', getShowLyricsEnabled());
    syncRadioSwitchInfoCheck();
}



function currentRadioStationMedia() {
    if (!uiH('isNowPlayingRadio')) return null;
    const queueItem = maClient.activeQueue?.current_item;
    return queueItem?.media_item || queueItem || null;
}



function syncRadioSwitchInfoCheck() {
    if (!menuSwitchInfoBtn || !switchInfoCheck) return;
    const media = currentRadioStationMedia();
    const show = !!(media && uiH('isRadioMedia', media));
    menuSwitchInfoBtn.hidden = !show;
    menuSwitchInfoBtn.classList.remove('disabled');
    switchInfoCheck.classList.toggle('on', show && uiH('isRadioSwitchInfoEnabled', media));
}



function toggleRadioSwitchInfo() {
    const media = currentRadioStationMedia();
    if (!media || !uiH('isRadioMedia', media)) return;
    const next = !uiH('isRadioSwitchInfoEnabled', media);
    uiH('setRadioSwitchInfo', media, next);
    syncRadioSwitchInfoCheck();
    uiH('refreshRadioNowPlayingText');
}



function toggleVizMode(modeId) {
    toggleVizModeSelection(modeId);
    syncVizResolutionRow();
}



function setVizShuffle(enabled) {
    if (enabled) setVizSelectionMode('shuffle');
    else if (getVizSelectionMode() === 'shuffle') setVizSelectionMode('single');
}



function setVizBarCount(count) {
    const n = normalizeVizBarCount(count);
    localStorage.setItem(VIZ_BAR_COUNT_KEY, String(n));
    if (vizBarCountSlider) vizBarCountSlider.value = String(n);
    if (vizBarCountValueEl) vizBarCountValueEl.textContent = String(n);
    getVisualizer()?.setBarCount(n);
}



function adjustVizBarCount(delta) {
    setVizBarCount(getVizBarCount() + delta);
}



function setVizFpsFromSliderIndex(index) {
    const fps = setVizFpsByNotchIndex(index);
    const idx = getVizFpsNotchIndex(fps);
    if (vizFpsSlider) vizFpsSlider.value = String(idx);
    if (vizFpsValueEl) vizFpsValueEl.textContent = String(fps);
}



function adjustVizFpsNotches(delta) {
    const fps = adjustVizFps(delta);
    const idx = getVizFpsNotchIndex(fps);
    if (vizFpsSlider) vizFpsSlider.value = String(idx);
    if (vizFpsValueEl) vizFpsValueEl.textContent = String(fps);
}



function getShowLyricsEnabled() {
    return readShowLyricsPref();
}

function setShowLyricsEnabled(enabled) {
    applyShowLyricsPref(enabled);
    if (showLyricsCheck) showLyricsCheck.classList.toggle('on', enabled);
    if (enabled) {
        const queueItem = maClient.activeQueue?.current_item;
        uiH('refreshLyricsForQueueItem', queueItem, uiH('getNowPlayingItemKey', queueItem));
    }
}



function getSettingsFocusTargets() {
    const targets = [];
    for (const el of settingsMenuItems) {
        if (!el || el.hidden) continue;
        targets.push(el);
        if (el === menuVizModesBtn && !getDisableVisualizer()) {
            if (vizBarCountRow && !vizBarCountRow.hidden) targets.push(vizBarCountRow);
            if (vizFpsRow && !vizFpsRow.hidden) targets.push(vizFpsRow);
        }
    }
    return targets;
}



function getVisibleSettingsMenuItems() {
    return getSettingsFocusTargets().filter((el) => el?.classList?.contains('settings-menu-item'));
}



function syncWebUiOnlySettings() {
    if (menuFullscreenBtn) menuFullscreenBtn.hidden = !isBrowserUi();
}



function isFullscreen() {
    return !!document.fullscreenElement;
}



function clearWebUiFullscreenPinned() {
    webUiFullscreenPinned = false;
}



async function setFullscreen(enabled) {
    if (!isBrowserUi()) return;
    webUiFullscreenPinned = !!enabled;
    try {
        if (enabled && !document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        } else if (!enabled && document.fullscreenElement) {
            await document.exitFullscreen();
        }
    } catch (err) {
        console.warn('fullscreen failed:', err);
        if (enabled) webUiFullscreenPinned = false;
    } finally {
        syncSettingsMenuChecks();
    }
}



function setCursorHidden(hidden) {
    if (!isBrowserUi()) return;
    mainBody.classList.toggle('cursor-hidden', hidden);
}



function bindWebUiCursorIdle() {
    if (!isBrowserUi()) return;
    document.addEventListener('mousemove', () => {
        setCursorHidden(false);
        clearTimeout(state.cursorIdleTimer);
        if (!mainBody.classList.contains('show-ui')
            && !state.settingsMenuOpen
            && !state.navMenuOpen
            && !state.volumeMenuOpen
            && !state.eqPresetsMenuOpen
            && !state.vizModesMenuOpen
            && !state.artDisplayMenuOpen
            && !uiH('isPanelOpen')) {
            state.cursorIdleTimer = setTimeout(() => setCursorHidden(true), 2000);
        }
    }, { passive: true });
}



function migrateBassModePreference() {
    if (localStorage.getItem(EQ_PRESET_KEY)) return;
    if (localStorage.getItem(BASS_MODE_KEY) === '1') {
        localStorage.setItem(EQ_PRESET_KEY, BASS_MODE_PRESET_NAME);
    }
    localStorage.removeItem(BASS_MODE_KEY);
}



function getEqPresetName() {
    migrateBassModePreference();
    return String(localStorage.getItem(EQ_PRESET_KEY) || '').trim();
}



function setEqPresetName(name) {
    localStorage.setItem(EQ_PRESET_KEY, String(name || '').trim());
}



async function findMaDspPresetByName(name) {
    const presets = await maClient.send('config/dsp_presets/get', {});
    const list = Array.isArray(presets) ? presets : [];
    const needle = String(name || '').trim().toLowerCase();
    return list.find((p) => String(p?.name || '').trim().toLowerCase() === needle) || null;
}



async function applyEqPresetToPlayer(presetName, playerId = maClient.playerId) {
    if (!playerId) return;
    try {
        await maClient.ensureReady();
        if (!presetName) {
            const current = await maClient.send('config/players/dsp/get', { player_id: playerId });
            const config = { ...(current || {}), enabled: false };
            await maClient.send('config/players/dsp/save', {
                player_id: playerId,
                config,
            });
            setEqPresetName('');
            uiH('setStatus', 'EQ off', 'connected');
        } else {
            const preset = await findMaDspPresetByName(presetName);
            if (!preset?.config) {
                uiH('setStatus', `DSP preset "${presetName}" not found`, 'error');
                setEqPresetName('');
                return;
            }
            const config = { ...preset.config, enabled: true };
            await maClient.send('config/players/dsp/save', {
                player_id: playerId,
                config,
            });
            setEqPresetName(presetName);
            uiH('setStatus', `EQ: ${presetName}`, 'connected');
        }
        setTimeout(() => uiH('setStatus', `connected · ${getDefaultPlayerName()}`, getShowConnection() ? 'connected' : ''), 2500);
    } catch (err) {
        console.warn('EQ preset DSP failed:', err);
        uiH('setStatus', 'EQ preset failed — admin role required?', 'error');
        setTimeout(() => uiH('setStatus', `connected · ${getDefaultPlayerName()}`, getShowConnection() ? 'connected' : ''), 2500);
    }
}



async function applyEqPresetFromPreference() {
    const name = getEqPresetName();
    if (!name || !maClient.playerId) return;
    await applyEqPresetToPlayer(name, maClient.playerId);
}



async function loadEqPresetsCache() {
    try {
        await maClient.ensureReady();
        const presets = await maClient.send('config/dsp_presets/get', {});
        state.eqPresetsCache = (Array.isArray(presets) ? presets : [])
            .slice()
            .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));
    } catch (err) {
        console.warn('load EQ presets failed:', err);
        state.eqPresetsCache = [];
    }
}



function renderEqPresetsMenu() {
    eqPresetsList.innerHTML = '';
    const active = getEqPresetName().toLowerCase();
    const items = [{ name: '', label: 'Off' }, ...state.eqPresetsCache.map((p) => ({
        name: String(p?.name || '').trim(),
        label: String(p?.name || '').trim(),
    })).filter((p) => p.name)];
    const presetEls = [];
    items.forEach((item, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'settings-menu-item';
        const isActive = item.name
            ? item.name.toLowerCase() === active
            : !active;
        btn.dataset.index = String(index);
        btn.innerHTML = `<span>${item.label}</span><span class="menu-check${isActive ? ' on' : ''}">✓</span>`;
        btn.addEventListener('click', () => void selectEqPresetAtIndex(index));
        eqPresetsList.appendChild(btn);
        presetEls.push(btn);
    });
    state.eqPresetMenuEls = [...presetEls, eqPresetsCloseBtn];
    state.eqPresetFocusIndex = Math.max(0, Math.min(state.eqPresetFocusIndex, state.eqPresetMenuEls.length - 1));
    updateEqPresetsMenuFocus();
}



function updateEqPresetsMenuFocus() {
    state.eqPresetMenuEls.forEach((row, i) => {
        row.classList.toggle('focused', state.eqPresetsMenuOpen && i === state.eqPresetFocusIndex);
    });
    state.eqPresetMenuEls[state.eqPresetFocusIndex]?.scrollIntoView({ block: 'nearest' });
    if (!IS_WEBOS) state.eqPresetMenuEls[state.eqPresetFocusIndex]?.focus();
}



function moveEqPresetsFocus(delta) {
    if (!state.eqPresetMenuEls.length) return;
    state.eqPresetFocusIndex = Math.max(0, Math.min(state.eqPresetFocusIndex + delta, state.eqPresetMenuEls.length - 1));
    updateEqPresetsMenuFocus();
}



async function selectEqPresetAtIndex(index) {
    const items = [{ name: '' }, ...state.eqPresetsCache.map((p) => ({ name: String(p?.name || '').trim() })).filter((p) => p.name)];
    const item = items[index];
    if (!item) return;
    await applyEqPresetToPlayer(item.name);
    renderEqPresetsMenu();
}



function activateEqPresetsFocused() {
    if (!state.eqPresetMenuEls.length) {
        uiH('closeEqPresetsMenu');
        return;
    }
    if (state.eqPresetFocusIndex >= state.eqPresetMenuEls.length - 1) {
        uiH('closeEqPresetsMenu');
        return;
    }
    void selectEqPresetAtIndex(state.eqPresetFocusIndex);
}



function returnToSettingsMenuPanel() {
    if (!state.settingsMenuOpen) return;
    settingsMenu.classList.add('open');
    settingsMenu.setAttribute('aria-hidden', 'false');
    uiH('positionOverlayMenu', settingsBtn, settingsMenu, 'right');
    syncSettingsMenuChecks();
    updateMenuFocus();
}



async function openEqPresetsMenu() {
    uiH('closeAllPanels');
    uiH('closeNavMenu');
    uiH('closeVolumeMenu');
    closeVizModesMenu({ skipReturn: true });
    closeArtDisplayMenu({ skipReturn: true });
    if (!state.settingsMenuOpen) {
        state.settingsMenuOpen = true;
        mainBody.classList.add('show-ui', 'menu-open');
        uiH('syncIdleProgressVisibility');
        uiH('stopDvdFloater');
        uiH('pauseUiHideTimer');
    }
    settingsMenu.classList.remove('open');
    settingsMenu.setAttribute('aria-hidden', 'true');
    await loadEqPresetsCache();
    state.eqPresetsMenuOpen = true;
    eqPresetsMenu.classList.add('open');
    eqPresetsMenu.setAttribute('aria-hidden', 'false');
    uiH('positionOverlayMenu', settingsBtn, eqPresetsMenu, 'right');
    renderEqPresetsMenu();
    state.eqPresetFocusIndex = 0;
    updateEqPresetsMenuFocus();
}



function closeEqPresetsMenu(opts = {}) {
    if (!state.eqPresetsMenuOpen) return;
    state.eqPresetsMenuOpen = false;
    eqPresetsMenu.classList.remove('open');
    eqPresetsMenu.setAttribute('aria-hidden', 'true');
    state.eqPresetMenuEls.forEach((el) => el.classList.remove('focused'));
    state.eqPresetMenuEls = [];
    if (state.settingsMenuOpen && !opts.skipReturn) {
        returnToSettingsMenuPanel();
    } else if (!state.settingsMenuOpen) {
        mainBody.classList.remove('menu-open');
        uiH('syncIdleProgressVisibility');
        uiH('resumeUiHideTimer');
        uiH('updateFloatState');
    }
}



function updateVizModeMenuChecks() {
    if (!state.vizModeMenuEls.length) return;
    const selMode = getVizSelectionMode();
    const selectorRow = state.vizModeMenuEls[0];
    selectorRow?.querySelectorAll('.viz-mode-selector-btn').forEach((btn) => {
        const mode = btn.dataset.mode;
        btn.classList.toggle('active', mode === selMode);
    });
    for (let i = 1; i < state.vizModeMenuEls.length - 1; i++) {
        const btn = state.vizModeMenuEls[i];
        const check = btn.querySelector('.menu-check');
        if (!check) continue;
        const item = VIZ_MODES[i - 1];
        check.classList.toggle('on', isVizModeActiveInUi(item?.id));
    }
}



const VIZ_SELECTOR_MODES = [
    { id: 'shuffle', icon: 'icons/shuffle_active.svg', label: 'Shuffle visualizers' },
    { id: 'cycle', icon: 'icons/refresh.svg', label: 'Cycle visualizers' },
    { id: 'dual', icon: 'icons/two-viz.svg', label: 'Two static visualizers' },
];



function renderVizModesMenu() {
    vizModesList.innerHTML = '';
    const selMode = getVizSelectionMode();
    const presetEls = [];
    const selectorBtn = document.createElement('button');
    selectorBtn.type = 'button';
    selectorBtn.className = 'settings-menu-item viz-mode-selector-row';
    selectorBtn.dataset.index = 'selector';
    const selectorInner = document.createElement('div');
    selectorInner.className = 'viz-mode-selector';
    VIZ_SELECTOR_MODES.forEach((item, iconIndex) => {
        const iconBtn = document.createElement('button');
        iconBtn.type = 'button';
        iconBtn.className = 'viz-mode-selector-btn';
        iconBtn.dataset.mode = item.id;
        iconBtn.dataset.iconIndex = String(iconIndex);
        iconBtn.setAttribute('aria-label', item.label);
        iconBtn.innerHTML = `<img src="${item.icon}" alt="" aria-hidden="true">`;
        iconBtn.classList.toggle('active', selMode === item.id);
        iconBtn.classList.toggle('icon-focused', iconIndex === state.vizSelectorIconFocus);
        iconBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setVizSelectionMode(item.id);
            state.vizSelectorIconFocus = iconIndex;
            updateVizModeMenuChecks();
        });
        selectorInner.appendChild(iconBtn);
    });
    selectorBtn.appendChild(selectorInner);
    selectorBtn.addEventListener('click', () => {
        const item = VIZ_SELECTOR_MODES[state.vizSelectorIconFocus];
        if (item) setVizSelectionMode(item.id);
        updateVizModeMenuChecks();
    });
    vizModesList.appendChild(selectorBtn);
    presetEls.push(selectorBtn);
    VIZ_MODES.forEach((item, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'settings-menu-item';
        btn.dataset.index = String(index);
        const isActive = isVizModeActiveInUi(item.id);
        btn.innerHTML = `<span>${item.label}</span><span class="menu-check${isActive ? ' on' : ''}">✓</span>`;
        btn.addEventListener('click', () => selectVizModeAtIndex(index + 1));
        vizModesList.appendChild(btn);
        presetEls.push(btn);
    });
    state.vizModeMenuEls = [...presetEls, vizModesCloseBtn];
    state.vizModeFocusIndex = Math.max(0, Math.min(state.vizModeFocusIndex, state.vizModeMenuEls.length - 1));
    updateVizModesMenuFocus();
}



function updateVizModesMenuFocus(opts = {}) {
    state.vizModeMenuEls.forEach((row, i) => {
        row.classList.toggle('focused', state.vizModesMenuOpen && i === state.vizModeFocusIndex);
    });
    const selectorRow = state.vizModeMenuEls[0];
    selectorRow?.querySelectorAll('.viz-mode-selector-btn').forEach((btn) => {
        const iconIndex = Number(btn.dataset.iconIndex);
        const keyboardFocus = uiH('panelKeyboardFocusActive');
        btn.classList.toggle('icon-focused', state.vizModesMenuOpen
            && state.vizModeFocusIndex === 0
            && keyboardFocus
            && iconIndex === state.vizSelectorIconFocus);
    });
    if (opts.scroll !== false) {
        state.vizModeMenuEls[state.vizModeFocusIndex]?.scrollIntoView({ block: 'nearest' });
    }
    if (opts.focus !== false && !IS_WEBOS) {
        state.vizModeMenuEls[state.vizModeFocusIndex]?.focus();
    }
}



function moveVizModesFocus(delta) {
    if (!state.vizModeMenuEls.length) return;
    state.vizModeFocusIndex = Math.max(0, Math.min(state.vizModeFocusIndex + delta, state.vizModeMenuEls.length - 1));
    updateVizModesMenuFocus();
}



function moveVizSelectorIconFocus(delta) {
    state.vizSelectorIconFocus = Math.max(0, Math.min(VIZ_SELECTOR_MODES.length - 1, state.vizSelectorIconFocus + delta));
    updateVizModesMenuFocus();
}



function selectVizModeAtIndex(menuIndex) {
    if (menuIndex <= 0) {
        const item = VIZ_SELECTOR_MODES[state.vizSelectorIconFocus];
        if (item) setVizSelectionMode(item.id);
        state.vizModeFocusIndex = 0;
        updateVizModeMenuChecks();
        return;
    }
    const item = VIZ_MODES[menuIndex - 1];
    if (!item) return;
    state.vizModeFocusIndex = menuIndex;
    toggleVizMode(item.id);
    updateVizModeMenuChecks();
}



function activateVizModesFocused() {
    if (!state.vizModeMenuEls.length) {
        closeVizModesMenu();
        return;
    }
    if (state.vizModeFocusIndex >= state.vizModeMenuEls.length - 1) {
        closeVizModesMenu();
        return;
    }
    selectVizModeAtIndex(state.vizModeFocusIndex);
}



function openVizModesMenu() {
    uiH('closeAllPanels');
    uiH('closeNavMenu');
    uiH('closeVolumeMenu');
    closeEqPresetsMenu({ skipReturn: true });
    closeArtDisplayMenu({ skipReturn: true });
    if (!state.settingsMenuOpen) {
        state.settingsMenuOpen = true;
        mainBody.classList.add('show-ui', 'menu-open');
        uiH('syncIdleProgressVisibility');
        uiH('stopDvdFloater');
        uiH('pauseUiHideTimer');
    }
    settingsMenu.classList.remove('open');
    settingsMenu.setAttribute('aria-hidden', 'true');
    state.vizModesMenuOpen = true;
    vizModesMenu.classList.add('open');
    vizModesMenu.setAttribute('aria-hidden', 'false');
    uiH('positionOverlayMenu', settingsBtn, vizModesMenu, 'right');
    state.vizSelectorIconFocus = Math.max(0, Math.min(
        VIZ_SELECTOR_MODES.length - 1,
        VIZ_SELECTOR_MODES.findIndex((m) => m.id === getVizSelectionMode()),
    ));
    if (state.vizSelectorIconFocus < 0) state.vizSelectorIconFocus = 0;
    renderVizModesMenu();
    state.vizModeFocusIndex = 0;
    updateVizModesMenuFocus();
}



function closeVizModesMenu(opts = {}) {
    if (!state.vizModesMenuOpen) return;
    state.vizModesMenuOpen = false;
    vizModesMenu.classList.remove('open');
    vizModesMenu.setAttribute('aria-hidden', 'true');
    state.vizModeMenuEls.forEach((el) => el.classList.remove('focused'));
    state.vizModeMenuEls = [];
    if (state.settingsMenuOpen && !opts.skipReturn) {
        returnToSettingsMenuPanel();
    } else if (!state.settingsMenuOpen) {
        mainBody.classList.remove('menu-open');
        uiH('syncIdleProgressVisibility');
        uiH('resumeUiHideTimer');
        uiH('updateFloatState');
    }
}



function renderArtDisplayMenu() {
    artDisplayList.innerHTML = '';
    const activeMode = getArtDisplayMode();
    const presetEls = [];
    ART_DISPLAY_MODES.forEach((item, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'settings-menu-item';
        btn.dataset.index = String(index);
        const isActive = item.id === activeMode;
        btn.innerHTML = `<span>${item.label}</span><span class="menu-check${isActive ? ' on' : ''}">✓</span>`;
        btn.addEventListener('click', () => selectArtDisplayAtIndex(index));
        artDisplayList.appendChild(btn);
        presetEls.push(btn);
    });
    state.artDisplayMenuEls = [...presetEls, artDisplayCloseBtn];
    state.artDisplayFocusIndex = Math.max(0, Math.min(state.artDisplayFocusIndex, state.artDisplayMenuEls.length - 1));
    updateArtDisplayMenuFocus();
}



function updateArtDisplayMenuFocus(opts = {}) {
    state.artDisplayMenuEls.forEach((row, i) => {
        row.classList.toggle('focused', state.artDisplayMenuOpen && i === state.artDisplayFocusIndex);
    });
    if (opts.scroll !== false) {
        state.artDisplayMenuEls[state.artDisplayFocusIndex]?.scrollIntoView({ block: 'nearest' });
    }
    if (opts.focus !== false && !IS_WEBOS) {
        state.artDisplayMenuEls[state.artDisplayFocusIndex]?.focus();
    }
}



function moveArtDisplayFocus(delta) {
    if (!state.artDisplayMenuEls.length) return;
    state.artDisplayFocusIndex = Math.max(0, Math.min(state.artDisplayFocusIndex + delta, state.artDisplayMenuEls.length - 1));
    updateArtDisplayMenuFocus();
}



function selectArtDisplayAtIndex(index) {
    const item = ART_DISPLAY_MODES[index];
    if (!item) return;
    state.artDisplayFocusIndex = index;
    applyArtDisplayMode(item.id);
    renderArtDisplayMenu();
}



function applyArtDisplayMode(mode) {
    setArtDisplayMode(mode);
    screenKeeper.setEnabled(shouldKeepScreenAwake());
    uiH('updateFloatState');
}



function activateArtDisplayFocused() {
    if (!state.artDisplayMenuEls.length) {
        closeArtDisplayMenu();
        return;
    }
    if (state.artDisplayFocusIndex >= state.artDisplayMenuEls.length - 1) {
        closeArtDisplayMenu();
        return;
    }
    selectArtDisplayAtIndex(state.artDisplayFocusIndex);
}



function openArtDisplayMenu() {
    uiH('closeAllPanels');
    uiH('closeNavMenu');
    uiH('closeVolumeMenu');
    closeEqPresetsMenu({ skipReturn: true });
    closeVizModesMenu({ skipReturn: true });
    if (!state.settingsMenuOpen) {
        state.settingsMenuOpen = true;
        mainBody.classList.add('show-ui', 'menu-open');
        uiH('syncIdleProgressVisibility');
        uiH('stopDvdFloater');
        uiH('pauseUiHideTimer');
    }
    settingsMenu.classList.remove('open');
    settingsMenu.setAttribute('aria-hidden', 'true');
    state.artDisplayMenuOpen = true;
    artDisplayMenu.classList.add('open');
    artDisplayMenu.setAttribute('aria-hidden', 'false');
    uiH('positionOverlayMenu', settingsBtn, artDisplayMenu, 'right');
    renderArtDisplayMenu();
    state.artDisplayFocusIndex = ART_DISPLAY_MODES.findIndex((m) => m.id === getArtDisplayMode());
    if (state.artDisplayFocusIndex < 0) state.artDisplayFocusIndex = 0;
    updateArtDisplayMenuFocus();
}



function closeArtDisplayMenu(opts = {}) {
    if (!state.artDisplayMenuOpen) return;
    state.artDisplayMenuOpen = false;
    artDisplayMenu.classList.remove('open');
    artDisplayMenu.setAttribute('aria-hidden', 'true');
    state.artDisplayMenuEls.forEach((el) => el.classList.remove('focused'));
    state.artDisplayMenuEls = [];
    if (state.settingsMenuOpen && !opts.skipReturn) {
        returnToSettingsMenuPanel();
    } else if (!state.settingsMenuOpen) {
        mainBody.classList.remove('menu-open');
        uiH('syncIdleProgressVisibility');
        uiH('resumeUiHideTimer');
        uiH('updateFloatState');
    }
}



function setDisableVisualizer(enabled) {
    localStorage.setItem(DISABLE_VISUALIZER_KEY, enabled ? '1' : '0');
    disableVisualizerCheck.classList.toggle('on', enabled);
    syncSettingsMenuChecks();
    applyVisualizerVisibility();
    if (!enabled) void tryAttachVisualizer();
}



function applyVisualizerVisibility() {
    const disabled = getDisableVisualizer();
    if (vizWrap) vizWrap.hidden = disabled;
    getVisualizer()?.setDisabled(disabled);
}



function getKeepAwake() {
    return shouldKeepScreenAwake();
}



function setKeepAwake(enabled) {
    applyArtDisplayMode(enabled ? 'float' : 'default');
}



export const screenKeeper = {
    bridge: null,
    webosReq: null,
    wakeLock: null,
    capacitorKeepAwake: false,
    enabled: false,
    regTimer: null,
    deny(timestamp) {
        const payload = JSON.stringify({
            clientName: SCREENSAVER_CLIENT,
            ack: false,
            timestamp: String(timestamp)
        });
        if (this.bridge) {
            this.bridge.call(
                'luna://com.webos.service.tvpower/power/responseScreenSaverRequest',
                payload
            );
        }
    },
    onScreensaverEvent(message) {
        if (!this.enabled || !message) return;
        if (message.returnValue === false) return;
        const ts = message.timestamp;
        if (ts == null) return;
        if (message.state === 'Active' || message.state === 'Requested') {
            this.deny(ts);
        }
    },
    registerBridge() {
        if (typeof WebOSServiceBridge === 'undefined') return false;
        if (!this.bridge) {
            this.bridge = new WebOSServiceBridge();
            this.bridge.onservicecallback = (msg) => {
                try {
                    this.onScreensaverEvent(JSON.parse(msg));
                } catch (err) {
                    console.warn('Screensaver callback failed:', err);
                }
            };
        }
        this.bridge.call(
            'luna://com.webos.service.tvpower/power/registerScreenSaverRequest',
            JSON.stringify({ subscribe: true, clientName: SCREENSAVER_CLIENT })
        );
        return true;
    },
    registerWebOS() {
        if (typeof webOS === 'undefined' || !webOS.service?.request) return false;
        if (this.webosReq) {
            this.webosReq.cancel?.();
            this.webosReq = null;
        }
        this.webosReq = webOS.service.request('luna://com.webos.service.tvpower', {
            method: 'power/registerScreenSaverRequest',
            parameters: { subscribe: true, clientName: SCREENSAVER_CLIENT },
            subscribe: true,
            resubscribe: true,
            onSuccess: (res) => this.onScreensaverEvent(res),
            onFailure: (err) => console.warn('webOS screensaver subscribe failed:', err)
        });
        return true;
    },
    async registerWakeLock() {
        if (!('wakeLock' in navigator)) return false;
        try {
            if (this.wakeLock) return true;
            this.wakeLock = await navigator.wakeLock.request('screen');
            this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
            return true;
        } catch (err) {
            console.warn('Wake lock request failed:', err);
            return false;
        }
    },
    releaseWakeLock() {
        if (!this.wakeLock) return;
        this.wakeLock.release().catch(() => {});
        this.wakeLock = null;
    },
    async registerCapacitorKeepAwake() {
        if (!IS_ANDROID) return false;
        try {
            const plugin = window.Capacitor?.Plugins?.KeepAwake;
            if (!plugin?.keepAwake) return false;
            await plugin.keepAwake();
            this.capacitorKeepAwake = true;
            return true;
        } catch (err) {
            console.warn('Capacitor keep awake failed:', err);
            return false;
        }
    },
    async releaseCapacitorKeepAwake() {
        if (!this.capacitorKeepAwake) return;
        try {
            const plugin = window.Capacitor?.Plugins?.KeepAwake;
            await plugin?.allowSleep?.();
        } catch (err) {
            console.warn('Capacitor allow sleep failed:', err);
        }
        this.capacitorKeepAwake = false;
    },
    register() {
        this.registerBridge();
        this.registerWebOS();
        if (this.enabled) {
            this.registerWakeLock();
            void this.registerCapacitorKeepAwake();
        }
    },
    setEnabled(on) {
        this.enabled = on;
        clearInterval(this.regTimer);
        if (!on) {
            this.releaseWakeLock();
            void this.releaseCapacitorKeepAwake();
            return;
        }
        this.register();
        this.regTimer = setInterval(() => {
            if (this.enabled) this.register();
        }, 45000);
    }
}

function openSettingsMenu() {
    uiH('closeAllPanels');
    uiH('closeNavMenu');
    uiH('closeVolumeMenu');
    closeEqPresetsMenu({ skipReturn: true });
    closeVizModesMenu({ skipReturn: true });
    closeArtDisplayMenu({ skipReturn: true });
    state.settingsMenuOpen = true;
    mainBody.classList.add('show-ui', 'menu-open');
    uiH('syncIdleProgressVisibility');
    settingsMenu.classList.add('open');
    settingsMenu.setAttribute('aria-hidden', 'false');
    uiH('positionOverlayMenu', settingsBtn, settingsMenu, 'right');
    syncSettingsMenuChecks();
    state.menuFocusIndex = 0;
    updateMenuFocus();
    uiH('stopDvdFloater');
    uiH('pauseUiHideTimer');
}



function closeSettingsMenu() {
    if (!state.settingsMenuOpen && !state.eqPresetsMenuOpen && !state.vizModesMenuOpen && !state.artDisplayMenuOpen) return;
    closeEqPresetsMenu({ skipReturn: true });
    closeVizModesMenu({ skipReturn: true });
    closeArtDisplayMenu({ skipReturn: true });
    state.settingsMenuOpen = false;
    mainBody.classList.remove('menu-open');
    settingsMenu.classList.remove('open');
    settingsMenu.setAttribute('aria-hidden', 'true');
    settingsMenuItems.forEach(el => el.classList.remove('focused'));
    uiH('syncIdleProgressVisibility');
    uiH('resumeUiHideTimer');
    uiH('updateFloatState');
}



function toggleSettingsMenu() {
    if (state.settingsMenuOpen) closeSettingsMenu();
    else {
        uiH('closeAllPanels');
        openSettingsMenu();
    }
}



function updateMenuFocus() {
    const visible = getSettingsFocusTargets();
    state.menuFocusIndex = Math.max(0, Math.min(state.menuFocusIndex, Math.max(0, visible.length - 1)));
    settingsMenuItems.forEach((el) => el.classList.remove('focused'));
    vizBarCountRow?.classList.remove('focused');
    vizBarCountSlider?.classList.remove('focused');
    vizFpsRow?.classList.remove('focused');
    vizFpsSlider?.classList.remove('focused');
    const target = visible[state.menuFocusIndex];
    if (target === vizBarCountRow) {
        vizBarCountRow.classList.add('focused');
        vizBarCountSlider?.classList.add('focused');
        if (!IS_WEBOS) vizBarCountSlider?.focus({ preventScroll: true });
        vizBarCountRow.scrollIntoView?.({ block: 'nearest' });
        return;
    }
    if (target === vizFpsRow) {
        vizFpsRow.classList.add('focused');
        vizFpsSlider?.classList.add('focused');
        if (!IS_WEBOS) vizFpsSlider?.focus({ preventScroll: true });
        vizFpsRow.scrollIntoView?.({ block: 'nearest' });
        return;
    }
    target?.classList.add('focused');
    if (!IS_WEBOS) target?.focus();
    target?.scrollIntoView?.({ block: 'nearest' });
}


export {
    getShowConnection,
    setShowConnection,
    syncSettingsMenuChecks,
    syncWebUiOnlySettings,
    toggleVizMode,
    setVizShuffle,
    setVizBarCount,
    adjustVizBarCount,
    setVizFpsFromSliderIndex,
    adjustVizFpsNotches,
    getShowLyricsEnabled,
    setShowLyricsEnabled,
    setDisableVisualizer,
    applyVisualizerVisibility,
    getKeepAwake,
    setKeepAwake,
    openSettingsMenu,
    closeSettingsMenu,
    toggleSettingsMenu,
    updateMenuFocus,
    getSettingsFocusTargets,
    openEqPresetsMenu,
    closeEqPresetsMenu,
    openVizModesMenu,
    closeVizModesMenu,
    openArtDisplayMenu,
    closeArtDisplayMenu,
    moveArtDisplayFocus,
    activateArtDisplayFocused,
    applyEqPresetFromPreference,
    migrateBassModePreference,
    isFullscreen,
    setFullscreen,
    bindWebUiCursorIdle,
    clearWebUiFullscreenPinned,
    setCursorHidden,
    toggleRadioSwitchInfo,
    moveEqPresetsFocus,
    activateEqPresetsFocused,
    moveVizModesFocus,
    moveVizSelectorIconFocus,
    activateVizModesFocused,
};
