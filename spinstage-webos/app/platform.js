import {
  IS_CAPACITOR, IS_ANDROID, IS_WEBOS, IS_TIZEN, HAS_TOUCH_HARDWARE,
} from './constants.js';
import {
  mainBody,
} from './dom.js';

/** Platform / UI scaling detection */

export function hasFinePointerDesktop() {
    return window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches
        || window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function usesPhoneTypography() {
    return IS_CAPACITOR;
}

export function useTieredFocus() {
    return IS_WEBOS || IS_ANDROID;
} // SYNC-WEBOS:USE_TIERED_FOCUS

export function isTouchUi() {
    if (IS_CAPACITOR) return true;
    if (!HAS_TOUCH_HARDWARE) return false;
    if (hasFinePointerDesktop()) return false;
    if (window.matchMedia('(any-hover: hover)').matches) return false;
    return true;
}

export function isWebUi() {
    return !isTouchUi();
}

export function isBrowserUi() {
    return !IS_CAPACITOR && !IS_WEBOS && !IS_TIZEN && typeof webOS === 'undefined';
}

export function applyUiScalingClasses() {
    const touch = isTouchUi();
    mainBody.classList.toggle('touch-ui', touch);
    mainBody.classList.toggle('web-ui', !touch);
    mainBody.classList.toggle('browser-ui', isBrowserUi());
}
