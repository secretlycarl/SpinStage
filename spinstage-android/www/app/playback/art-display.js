/**
 * Idle art display modes: default (centered), float (DVD), corner-info.
 */
import { mainBody } from '../dom.js';
import { createDvdFloater } from './float.js';
import { playerStage } from '../dom.js';
import { ART_DISPLAY_MODE_KEY, KEEP_AWAKE_KEY } from '../constants.js';

export const ART_DISPLAY_MODES = [
    { id: 'default', label: 'Default' },
    { id: 'float', label: 'Float' },
    { id: 'corner-info', label: 'Corner Info' },
];

const dvdFloater = createDvdFloater(playerStage);

function migrateArtDisplayMode() {
    if (localStorage.getItem(ART_DISPLAY_MODE_KEY)) return;
    const legacy = localStorage.getItem(KEEP_AWAKE_KEY) === '1' ? 'float' : 'default';
    localStorage.setItem(ART_DISPLAY_MODE_KEY, legacy);
}

export function getArtDisplayMode() {
    migrateArtDisplayMode();
    const mode = localStorage.getItem(ART_DISPLAY_MODE_KEY) || 'default';
    return ART_DISPLAY_MODES.some((m) => m.id === mode) ? mode : 'default';
}

export function setArtDisplayMode(mode) {
    migrateArtDisplayMode();
    const next = ART_DISPLAY_MODES.some((m) => m.id === mode) ? mode : 'default';
    localStorage.setItem(ART_DISPLAY_MODE_KEY, next);
}

export function shouldKeepScreenAwake() {
    return getArtDisplayMode() !== 'default';
}

export function getDvdFloater() {
    return dvdFloater;
}

export function updateArtDisplayState(floatSeed, opts = {}) {
    const setupOpen = opts.setupOpen ?? false;
    const showUi = mainBody.classList.contains('show-ui');
    const menusOpen = opts.menusOpen ?? false;
    const panelOpen = opts.panelOpen ?? false;
    const guestOpen = opts.guestOpen ?? false;
    const idleOk = !showUi && !menusOpen && !panelOpen && !setupOpen && !guestOpen;
    const mode = getArtDisplayMode();

    mainBody.classList.remove('art-corner-info');

    if (mode === 'float' && idleOk) {
        dvdFloater.start(floatSeed);
    } else {
        dvdFloater.stop(!showUi);
    }

    if (mode === 'corner-info' && idleOk) {
        mainBody.classList.add('art-corner-info');
    }
}

export function stopArtDisplayMotion(snap = true) {
    dvdFloater.stop(snap);
    mainBody.classList.remove('art-corner-info');
}
