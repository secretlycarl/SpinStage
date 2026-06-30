/**
 * Now-playing text marquee: directional fade edges + pause/scroll when text overflows.
 */

import {
    TITLE_TWO_LINE_MAX_CHARS,
} from '../constants.js';

const PAUSE_START_MS = 3200;
const PAUSE_END_MS = 1800;
const SCROLL_PX_PER_SEC = 38;
const MIN_OVERFLOW_PX = 24;
/** Ignore sub-pixel / rounding slack before treating single-line text as overflowing. */
const TITLE_WRAP_TRY_OVERFLOW_PX = 8;
/** Title fade/scroll only when clearly wider than the viewport after a two-line attempt. */
const MIN_TITLE_MARQUEE_OVERFLOW_PX = 32;
const MIN_TITLE_SCROLL_OVERFLOW_PX = 44;

/** @type {Array<{ viewport: HTMLElement, track: HTMLElement, kind: string, timer: ReturnType<typeof setTimeout>|null, gen: number }>} */
const entries = [];

const FADE_CLASSES = [
    'np-marquee-fade-right',
    'np-marquee-fade-left',
    'np-marquee-fade-both',
];

export function registerNpTextMarquee(viewportEl, trackEl, kind = 'title') {
    if (!viewportEl || !trackEl) return;
    entries.push({ viewport: viewportEl, track: trackEl, kind, timer: null, gen: 0 });
}

function setFadeMode(viewport, mode) {
    viewport.classList.remove(...FADE_CLASSES);
    if (mode) viewport.classList.add(`np-marquee-fade-${mode}`);
}

function cancelMarquee(entry) {
    entry.gen += 1;
    if (entry.timer != null) {
        clearTimeout(entry.timer);
        entry.timer = null;
    }
    entry.track.style.transition = 'none';
    entry.track.style.transform = '';
    entry.viewport.classList.remove('np-marquee-active', 'np-title-wrap');
    setFadeMode(entry.viewport, null);
    entry.viewport.style.removeProperty('width');
    entry.viewport.style.removeProperty('max-width');
}

export function stopAllNpTextMarquees() {
    for (const entry of entries) cancelMarquee(entry);
}

function runMarqueeCycle(entry, overflow) {
    const gen = entry.gen;
    const scrollMs = Math.max(600, (overflow / SCROLL_PX_PER_SEC) * 1000);

    const schedule = (fn, delayMs) => {
        entry.timer = setTimeout(() => {
            entry.timer = null;
            if (entry.gen !== gen) return;
            fn();
        }, delayMs);
    };

    const phaseStartPause = () => {
        if (entry.gen !== gen) return;
        entry.track.style.transition = 'none';
        entry.track.style.transform = 'translateX(0)';
        setFadeMode(entry.viewport, 'right');
        schedule(phaseScrollOut, PAUSE_START_MS);
    };

    const phaseScrollOut = () => {
        if (entry.gen !== gen) return;
        setFadeMode(entry.viewport, 'both');
        entry.track.style.transition = `transform ${scrollMs}ms linear`;
        entry.track.style.transform = `translateX(${-overflow}px)`;
        schedule(phaseEndPause, scrollMs);
    };

    const phaseEndPause = () => {
        if (entry.gen !== gen) return;
        setFadeMode(entry.viewport, 'left');
        schedule(phaseScrollIn, PAUSE_END_MS);
    };

    const phaseScrollIn = () => {
        if (entry.gen !== gen) return;
        setFadeMode(entry.viewport, 'both');
        entry.track.style.transition = `transform ${scrollMs}ms linear`;
        entry.track.style.transform = 'translateX(0)';
        schedule(phaseDone, scrollMs);
    };

    const phaseDone = () => {
        if (entry.gen !== gen) return;
        setFadeMode(entry.viewport, 'right');
    };

    phaseStartPause();
}

function titleRawText(entry) {
    return (entry.track.dataset.rawTitle || entry.track.textContent || '').trim();
}

/** Split medium-length titles on a word boundary into two balanced lines. */
function splitTitleTwoLines(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || trimmed.length > TITLE_TWO_LINE_MAX_CHARS) return null;
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length < 2) return null;
    if (words.length === 2) return `${words[0]}\n${words[1]}`;
    let bestBreak = 1;
    let bestScore = Infinity;
    for (let i = 1; i < words.length; i += 1) {
        if (words.length - i < 1) continue;
        const line1 = words.slice(0, i).join(' ');
        const line2 = words.slice(i).join(' ');
        const score = Math.abs(line1.length - line2.length);
        if (score < bestScore) {
            bestScore = score;
            bestBreak = i;
        }
    }
    if (bestScore === Infinity) return null;
    return `${words.slice(0, bestBreak).join(' ')}\n${words.slice(bestBreak).join(' ')}`;
}

function shouldMarquee(entry, overflow, opts) {
    if (overflow <= TITLE_WRAP_TRY_OVERFLOW_PX) return false;
    if (entry.kind === 'title') {
        return overflow >= MIN_TITLE_MARQUEE_OVERFLOW_PX;
    }
    if (opts.cornerInfo) {
        return overflow >= MIN_OVERFLOW_PX;
    }
    return overflow >= MIN_OVERFLOW_PX;
}

function shouldScrollMarquee(entry, overflow, opts) {
    if (overflow <= TITLE_WRAP_TRY_OVERFLOW_PX) return false;
    if (entry.kind === 'title') {
        return overflow >= MIN_TITLE_SCROLL_OVERFLOW_PX;
    }
    if (opts.cornerInfo) {
        return overflow >= MIN_OVERFLOW_PX;
    }
    return overflow >= MIN_OVERFLOW_PX;
}

function measureEntryOverflow(entry, maxW, cornerInfo) {
    entry.viewport.style.width = 'auto';
    entry.viewport.style.removeProperty('max-width');
    const trackW = entry.track.scrollWidth;
    const trackH = entry.track.scrollHeight;

    if (cornerInfo) {
        entry.viewport.style.width = '100%';
        const wOverflow = Math.max(0, trackW - entry.viewport.clientWidth);
        const lineH = parseFloat(getComputedStyle(entry.track).lineHeight) || 16;
        const hOverflow = Math.max(0, trackH - lineH * 2.05);
        return Math.max(wOverflow, hOverflow);
    }

    const info = document.querySelector('#player-stage .info');
    const infoW = info?.clientWidth > 0 ? info.clientWidth : maxW;
    const available = Math.min(maxW, infoW);
    entry.viewport.style.width = `${available}px`;
    const wOverflow = Math.max(0, trackW - entry.viewport.clientWidth);
    if (entry.viewport.classList.contains('np-title-wrap')) {
        const lineH = parseFloat(getComputedStyle(entry.track).lineHeight) || 16;
        const hOverflow = Math.max(0, trackH - lineH * 2.05);
        return Math.max(wOverflow, hOverflow);
    }
    return wOverflow;
}

function clearTitleWrap(entry, raw) {
    entry.viewport.classList.remove('np-title-wrap');
    entry.track.textContent = raw;
}

function applyTitleWrap(entry, raw) {
    const wrapped = splitTitleTwoLines(raw);
    if (!wrapped) return false;
    entry.viewport.classList.add('np-title-wrap');
    entry.track.textContent = wrapped;
    return true;
}

/**
 * Prefer a balanced two-line title; only leave single-line when wrap cannot help.
 * @returns {number} overflow px after layout
 */
function layoutTitleEntry(entry, maxW, cornerInfo) {
    const raw = titleRawText(entry);
    entry.track.dataset.rawTitle = raw;
    clearTitleWrap(entry, raw);

    let overflow = measureEntryOverflow(entry, maxW, cornerInfo);
    if (overflow <= TITLE_WRAP_TRY_OVERFLOW_PX) {
        entry.viewport.style.width = cornerInfo ? '100%' : 'auto';
        return 0;
    }

    if (applyTitleWrap(entry, raw)) {
        overflow = measureEntryOverflow(entry, maxW, cornerInfo);
        if (overflow <= TITLE_WRAP_TRY_OVERFLOW_PX) {
            entry.viewport.style.width = cornerInfo ? '100%' : 'auto';
            return 0;
        }
        clearTitleWrap(entry, raw);
        overflow = measureEntryOverflow(entry, maxW, cornerInfo);
    }

    return overflow;
}

/**
 * @param {object} opts
 * @param {() => number} [opts.getMaxWidth]
 * @param {boolean} [opts.cornerInfo]
 * @param {(entry: typeof entries[0]) => boolean} [opts.shouldRun]
 */
export function refreshNpTextMarquees(opts = {}) {
    const getMaxWidth = opts.getMaxWidth ?? (() => 0);
    const shouldRun = opts.shouldRun ?? (() => true);
    const cornerInfo = !!opts.cornerInfo;
    const maxW = Math.max(80, Math.floor(getMaxWidth()));

    for (const entry of entries) {
        cancelMarquee(entry);
        if (!shouldRun(entry)) continue;

        let overflow;
        if (entry.kind === 'title') {
            overflow = layoutTitleEntry(entry, maxW, cornerInfo);
        } else {
            overflow = measureEntryOverflow(entry, maxW, cornerInfo);
        }

        if (!shouldMarquee(entry, overflow, { cornerInfo })) {
            entry.viewport.style.width = entry.kind === 'title' && entry.viewport.classList.contains('np-title-wrap')
                ? (cornerInfo ? '100%' : 'auto')
                : 'auto';
            continue;
        }

        entry.viewport.classList.add('np-marquee-active');
        entry.viewport.style.width = cornerInfo ? '100%' : `${Math.min(maxW, entry.viewport.clientWidth || maxW)}px`;
        entry.viewport.style.maxWidth = '100%';
        if (shouldScrollMarquee(entry, overflow, { cornerInfo })) {
            runMarqueeCycle(entry, overflow);
        } else {
            setFadeMode(entry.viewport, 'right');
        }
    }
}
