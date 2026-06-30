/**
 * Idle lyrics panel (right 33%) with optional LRC sync.
 */
import { mainBody, lyricsPanelEl, lyricsScrollEl, lyricsLinesEl, lyricsStatusEl } from '../dom.js';
import { SHOW_LYRICS_KEY, IS_ANDROID } from '../constants.js';
import { maClient } from '../ma/client.js';
import { state } from '../state.js';
import { parseLrc, splitPlainLyrics, findLrcLineIndex } from '../util/lrc.js';
import {
    getLyricsCacheEntry,
    cacheLyricsMiss,
    cacheLyricsHit,
} from '../util/lyrics-cache.js';
import { getDvdFloater } from './art-display.js';

const LYRICS_LEFT_FRAC = 0.67;
const LYRICS_MANUAL_SCROLL_MS = 12000;
const PLAIN_LYRICS_SCROLL_PX_PER_SEC = 8.6;
const PLAIN_SCROLL_RESUME_MS = 1000;

let plainLyricsScrollRaf = null;
let plainScrollProgrammatic = false;

export function getShowLyricsEnabled() {
    return localStorage.getItem(SHOW_LYRICS_KEY) === '1';
}

export function setShowLyricsEnabled(enabled) {
    localStorage.setItem(SHOW_LYRICS_KEY, enabled ? '1' : '0');
    if (!enabled) {
        clearLyrics();
    }
    updateLyricsPanelLayout(state.lyrics.lastLayoutOpts || {});
}

export function isLyricsLayoutAllowed() {
    if (!getShowLyricsEnabled()) return false;
    if (IS_ANDROID && window.matchMedia('(orientation: portrait)').matches) return false;
    const w = window.innerWidth || 0;
    const h = window.innerHeight || 1;
    if (h > w) return false;
    return true;
}

function lyricsIdleOk(opts = {}) {
    if (mainBody.classList.contains('show-ui')) return false;
    if (opts.menusOpen) return false;
    if (opts.panelOpen) return false;
    if (opts.setupOpen) return false;
    if (opts.guestOpen) return false;
    return true;
}

function isLyricsEligibleMedia(media) {
    if (!media) return false;
    const mt = String(media.media_type || media.type || '').toLowerCase();
    if (mt === 'track') return true;
    const uri = String(media.uri || media.path || '').toLowerCase();
    return uri.includes('track') && !uri.includes('radio') && !uri.includes('podcast');
}

function clearLyricsRetry() {
    /* legacy no-op — lyrics retries removed */
}

function applyCachedLyrics(trackKey) {
    const cached = getLyricsCacheEntry(trackKey);
    if (!cached || cached === 'none') return false;
    applyLyricsContent(cached);
    return true;
}

function stopPlainLyricsScrollLoop() {
    if (plainLyricsScrollRaf != null) {
        cancelAnimationFrame(plainLyricsScrollRaf);
        plainLyricsScrollRaf = null;
    }
}

function clearPlainScrollResumeTimer() {
    if (state.lyrics.plainScrollResumeTimer != null) {
        clearTimeout(state.lyrics.plainScrollResumeTimer);
        state.lyrics.plainScrollResumeTimer = null;
    }
}

function plainLyricsAutoScrollEligible() {
    return !!(state.lyrics.plainLines?.length
        && !state.lyrics.lrcLines?.length
        && state.lyrics.hasLines
        && mainBody.classList.contains('lyrics-open')
        && !mainBody.classList.contains('show-ui'));
}

function measurePlainLyricsScrollRange() {
    if (!lyricsScrollEl) return 0;
    void lyricsScrollEl.offsetHeight;
    if (lyricsLinesEl) void lyricsLinesEl.offsetHeight;
    return Math.max(0, lyricsScrollEl.scrollHeight - lyricsScrollEl.clientHeight);
}

function plainScrollPauseActive() {
    return !!state.lyrics.idleFocused
        || !!state.lyrics.plainScrollHover
        || !!state.lyrics.plainScrollUserHold;
}

function syncPlainScrollAnchorFromDom() {
    if (!lyricsScrollEl) return;
    state.lyrics.plainScrollUserOffset = lyricsScrollEl.scrollTop - state.lyrics.plainScrollAutoTop;
}

function setPlainScrollTop(value) {
    if (!lyricsScrollEl) return;
    plainScrollProgrammatic = true;
    lyricsScrollEl.scrollTop = value;
    requestAnimationFrame(() => {
        plainScrollProgrammatic = false;
    });
}

function schedulePlainScrollResume() {
    clearPlainScrollResumeTimer();
    state.lyrics.plainScrollResumeTimer = window.setTimeout(() => {
        state.lyrics.plainScrollResumeTimer = null;
        if (state.lyrics.idleFocused || state.lyrics.plainScrollHover) return;
        state.lyrics.plainScrollUserHold = false;
        state.lyrics.plainScrollLastTs = performance.now();
        syncPlainLyricsPlayback();
    }, PLAIN_SCROLL_RESUME_MS);
}

function onPlainLyricsUserIntent() {
    if (!plainLyricsAutoScrollEligible()) return;
    state.lyrics.plainScrollUserHold = true;
    syncPlainScrollAnchorFromDom();
    schedulePlainScrollResume();
    markLyricsScrollActivity();
}

function plainLyricsShouldAnimate() {
    return plainLyricsAutoScrollEligible() && !plainScrollPauseActive() && !!state.isPlaying;
}

function tickPlainLyricsScroll(ts) {
    plainLyricsScrollRaf = null;

    if (!plainLyricsAutoScrollEligible()) return;

    if (!plainLyricsShouldAnimate()) {
        plainLyricsScrollRaf = requestAnimationFrame(tickPlainLyricsScroll);
        return;
    }

    const scrollRange = measurePlainLyricsScrollRange();
    if (scrollRange <= 8) {
        plainLyricsScrollRaf = requestAnimationFrame(tickPlainLyricsScroll);
        return;
    }

    const lastTs = state.lyrics.plainScrollLastTs || ts;
    const dt = Math.min(48, Math.max(0, ts - lastTs));
    state.lyrics.plainScrollLastTs = ts;

    state.lyrics.plainScrollAutoTop = Math.min(
        scrollRange,
        state.lyrics.plainScrollAutoTop + (PLAIN_LYRICS_SCROLL_PX_PER_SEC * dt / 1000),
    );

    const target = Math.min(
        scrollRange,
        Math.max(0, state.lyrics.plainScrollAutoTop + state.lyrics.plainScrollUserOffset),
    );
    setPlainScrollTop(target);

    if (target >= scrollRange - 0.5) {
        state.lyrics.plainScrollAutoTop = scrollRange;
        plainLyricsScrollRaf = requestAnimationFrame(tickPlainLyricsScroll);
        return;
    }

    plainLyricsScrollRaf = requestAnimationFrame(tickPlainLyricsScroll);
}

export function syncPlainLyricsPlayback() {
    if (!plainLyricsAutoScrollEligible()) {
        stopPlainLyricsScrollLoop();
        return;
    }
    if (plainLyricsScrollRaf == null) {
        if (!state.lyrics.plainScrollLastTs) {
            state.lyrics.plainScrollLastTs = performance.now();
        }
        plainLyricsScrollRaf = requestAnimationFrame(tickPlainLyricsScroll);
    }
}

function resetLyricsScroll() {
    if (!lyricsScrollEl) return;
    stopPlainLyricsScrollLoop();
    clearPlainScrollResumeTimer();
    lyricsScrollEl.scrollTop = 0;
    lyricsScrollEl.classList.remove('lyrics-scrolling');
    state.lyrics.plainScrollAutoTop = 0;
    state.lyrics.plainScrollUserOffset = 0;
    state.lyrics.plainScrollUserHold = false;
    state.lyrics.plainScrollHover = false;
    state.lyrics.plainScrollLastTs = 0;
}

export function clearLyrics() {
    clearLyricsRetry();
    stopPlainLyricsScrollLoop();
    clearPlainScrollResumeTimer();
    state.lyrics.idleFocused = false;
    state.lyrics.manualScrollUntil = 0;
    state.lyrics.plainScrollAutoTop = 0;
    state.lyrics.plainScrollUserOffset = 0;
    state.lyrics.plainScrollUserHold = false;
    state.lyrics.plainScrollHover = false;
    state.lyrics.plainScrollLastTs = 0;
    updateLyricsFocusVisual();
    resetLyricsScroll();
    state.lyrics.loading = false;
    state.lyrics.hasLines = false;
    state.lyrics.lrcLines = null;
    state.lyrics.plainLines = null;
    state.lyrics.activeIndex = -1;
    state.lyrics.synced = false;
    state.lyrics.trackKey = '';
    if (lyricsLinesEl) lyricsLinesEl.replaceChildren();
    mainBody.classList.remove('lyrics-synced');
    if (lyricsStatusEl) {
        lyricsStatusEl.hidden = true;
        lyricsStatusEl.textContent = '';
    }
}

function renderLyricsLines() {
    if (!lyricsLinesEl) return;
    lyricsLinesEl.replaceChildren();
    const lines = state.lyrics.lrcLines || state.lyrics.plainLines?.map((text) => ({ time: null, text })) || [];
    for (let i = 0; i < lines.length; i++) {
        const row = document.createElement('div');
        row.className = 'lyrics-line';
        row.dataset.index = String(i);
        row.textContent = lines[i].text;
        lyricsLinesEl.appendChild(row);
    }
}

function setLyricsLoading() {
    state.lyrics.loading = true;
    state.lyrics.hasLines = false;
    if (lyricsStatusEl) {
        lyricsStatusEl.hidden = true;
        lyricsStatusEl.textContent = '';
    }
    if (lyricsLinesEl) lyricsLinesEl.replaceChildren();
}

function applyLyricsContent({ lrcLines, plainLines, trackKey }) {
    state.lyrics.loading = false;
    state.lyrics.trackKey = trackKey;
    state.lyrics.lrcLines = lrcLines?.length ? lrcLines : null;
    state.lyrics.plainLines = !state.lyrics.lrcLines && plainLines?.length ? plainLines : null;
    state.lyrics.hasLines = !!(state.lyrics.lrcLines?.length || state.lyrics.plainLines?.length);
    state.lyrics.synced = !!state.lyrics.lrcLines?.length;
    state.lyrics.activeIndex = -1;

    if (lyricsStatusEl) lyricsStatusEl.hidden = true;

    if (!state.lyrics.hasLines) {
        if (lyricsLinesEl) lyricsLinesEl.replaceChildren();
        updateLyricsPanelLayout(state.lyrics.lastLayoutOpts || {});
        return;
    }

    renderLyricsLines();
    mainBody.classList.toggle('lyrics-synced', !!state.lyrics.lrcLines?.length);
    updateLyricsPanelLayout(state.lyrics.lastLayoutOpts || {});
    resetLyricsScroll();
    if (state.lyrics.plainLines?.length) {
        syncPlainLyricsPlayback();
    } else {
        syncLyricsProgress(state.currentPos);
    }
}

async function resolveMediaForLyrics(media) {
    try {
        await maClient.ensureReady();
        return await maClient.resolveMaItem(media);
    } catch (err) {
        console.warn('lyrics resolve failed:', err);
        return media;
    }
}

async function loadLyricsForMedia(media, trackKey, gen) {
    if (!isLyricsLayoutAllowed() || !isLyricsEligibleMedia(media)) {
        clearLyrics();
        updateLyricsPanelLayout(state.lyrics.lastLayoutOpts || {});
        return;
    }

    const cached = getLyricsCacheEntry(trackKey);
    if (cached === 'none') {
        state.lyrics.loading = false;
        state.lyrics.hasLines = false;
        state.lyrics.trackKey = trackKey;
        updateLyricsPanelLayout(state.lyrics.lastLayoutOpts || {});
        return;
    }
    if (cached && cached !== 'none') {
        if (gen !== state.lyrics.fetchGen) return;
        applyLyricsContent(cached);
        return;
    }

    setLyricsLoading();

    let plain = media.metadata?.lyrics || null;
    let lrc = media.metadata?.lrc_lyrics || null;

    if (!plain && !lrc) {
        const track = await resolveMediaForLyrics(media);
        if (gen !== state.lyrics.fetchGen) return;
        plain = track.metadata?.lyrics || null;
        lrc = track.metadata?.lrc_lyrics || null;

        if (!plain && !lrc) {
            try {
                await maClient.ensureReady();
                const fetched = await maClient.getTrackLyrics(track);
                if (fetched) {
                    plain = fetched.plain || null;
                    lrc = fetched.lrc || null;
                }
            } catch {
                /* MA error 999 = no lyrics from any provider */
            }
        }
    }

    if (gen !== state.lyrics.fetchGen) return;

    const lrcLines = parseLrc(lrc);
    const plainSource = plain || (!lrcLines.length && lrc ? lrc : null);
    const plainLines = lrcLines.length ? null : splitPlainLyrics(plainSource);

    if (!lrcLines.length && !plainLines?.length) {
        state.lyrics.loading = false;
        state.lyrics.hasLines = false;
        state.lyrics.lrcLines = null;
        state.lyrics.plainLines = null;
        state.lyrics.trackKey = trackKey;
        mainBody.classList.remove('lyrics-synced');
        if (lyricsStatusEl) lyricsStatusEl.hidden = true;
        if (lyricsLinesEl) lyricsLinesEl.replaceChildren();
        cacheLyricsMiss(trackKey);
        updateLyricsPanelLayout(state.lyrics.lastLayoutOpts || {});
        return;
    }

    clearLyricsRetry();
    const content = { lrcLines, plainLines, trackKey };
    cacheLyricsHit(trackKey, content);
    applyLyricsContent(content);
}

export function refreshLyricsForQueueItem(queueItem, trackKey) {
    if (!getShowLyricsEnabled() || !isLyricsLayoutAllowed()) {
        clearLyrics();
        updateLyricsPanelLayout(state.lyrics.lastLayoutOpts || {});
        return;
    }

    const media = queueItem?.media_item || queueItem;
    if (!trackKey || !isLyricsEligibleMedia(media)) {
        clearLyrics();
        updateLyricsPanelLayout(state.lyrics.lastLayoutOpts || {});
        return;
    }

    const prevKey = state.lyrics.trackKey;

    if (trackKey !== prevKey) {
        clearLyrics();
        state.lyrics.trackKey = trackKey;
        state.lyrics.fetchGen += 1;
        updateLyricsPanelLayout(state.lyrics.lastLayoutOpts || {});
    } else if (state.lyrics.hasLines) {
        updateLyricsPanelLayout(state.lyrics.lastLayoutOpts || {});
        return;
    } else if (getLyricsCacheEntry(trackKey) === 'none') {
        updateLyricsPanelLayout(state.lyrics.lastLayoutOpts || {});
        return;
    } else if (state.lyrics.loading) {
        return;
    } else if (applyCachedLyrics(trackKey)) {
        return;
    }

    const gen = state.lyrics.fetchGen;
    void loadLyricsForMedia(media, trackKey, gen);
}

export function updateLyricsPanelLayout(opts = {}) {
    state.lyrics.lastLayoutOpts = opts;
    const allowed = isLyricsLayoutAllowed();
    const idleOk = lyricsIdleOk(opts);
    const showPanel = allowed && idleOk && state.lyrics.hasLines;
    const shiftArt = allowed && idleOk && state.lyrics.hasLines;

    mainBody.classList.toggle('lyrics-open', shiftArt);
    mainBody.classList.toggle('lyrics-synced', shiftArt && !!state.lyrics.lrcLines?.length);

    if (lyricsPanelEl) {
        lyricsPanelEl.hidden = !showPanel;
        lyricsPanelEl.setAttribute('aria-hidden', showPanel ? 'false' : 'true');
    }

    getDvdFloater()?.measure();
    syncPlainLyricsPlayback();
}

export function syncLyricsProgress(posMs) {
    if (!state.lyrics.hasLines || !lyricsLinesEl) return;
    if (!mainBody.classList.contains('lyrics-open')) return;

    if (state.lyrics.lrcLines?.length) {
        syncSyncedLyricsProgress(posMs);
        return;
    }

    syncPlainLyricsPlayback();
}

function syncSyncedLyricsProgress(posMs) {
    const idx = findLrcLineIndex(state.lyrics.lrcLines, (posMs || 0) / 1000);
    if (idx === state.lyrics.activeIndex) return;
    state.lyrics.activeIndex = idx;

    const rows = lyricsLinesEl.querySelectorAll('.lyrics-line');
    rows.forEach((row, i) => {
        row.classList.toggle('active', i === idx);
    });

    const active = idx >= 0 ? rows[idx] : null;
    if (active && lyricsScrollEl && !state.lyrics.idleFocused && Date.now() >= state.lyrics.manualScrollUntil) {
        const scrollRect = lyricsScrollEl.getBoundingClientRect();
        const rowRect = active.getBoundingClientRect();
        if (rowRect.top < scrollRect.top + 48 || rowRect.bottom > scrollRect.bottom - 48) {
            active.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }
}

export function getLyricsLeftFraction() {
    return mainBody.classList.contains('lyrics-open') ? LYRICS_LEFT_FRAC : 1;
}

export function isLyricsScrollAvailable() {
    if (!isLyricsLayoutAllowed() || !state.lyrics.hasLines) return false;
    if (mainBody.classList.contains('show-ui')) return false;
    if (!mainBody.classList.contains('lyrics-open')) return false;
    return true;
}

export function isLyricsIdleFocused() {
    return !!state.lyrics.idleFocused;
}

function updateLyricsFocusVisual() {
    lyricsPanelEl?.classList.toggle('lyrics-idle-focused', !!state.lyrics.idleFocused);
    mainBody.classList.toggle('lyrics-idle-focused', !!state.lyrics.idleFocused);
}

export function setLyricsIdleFocused(focused) {
    if (!isLyricsScrollAvailable()) {
        state.lyrics.idleFocused = false;
        updateLyricsFocusVisual();
        return false;
    }
    const next = !!focused;
    state.lyrics.idleFocused = next;
    updateLyricsFocusVisual();
    if (!next) {
        schedulePlainScrollResume();
    } else {
        syncPlainScrollAnchorFromDom();
    }
    syncPlainLyricsPlayback();
    return state.lyrics.idleFocused;
}

export function clearLyricsIdleFocus() {
    if (!state.lyrics.idleFocused) return;
    state.lyrics.idleFocused = false;
    updateLyricsFocusVisual();
    schedulePlainScrollResume();
    syncPlainLyricsPlayback();
}

export function scrollLyricsBy(direction) {
    if (!lyricsScrollEl || !direction) return;
    const step = Math.max(48, Math.round(lyricsScrollEl.clientHeight * 0.22));
    onPlainLyricsUserIntent();
    lyricsScrollEl.scrollBy({ top: direction * step, behavior: 'smooth' });
    state.lyrics.manualScrollUntil = Date.now() + LYRICS_MANUAL_SCROLL_MS;
}

let lyricsScrollHideTimer = null;

function markLyricsScrollActivity() {
    if (!lyricsScrollEl) return;
    lyricsScrollEl.classList.add('lyrics-scrolling');
    if (lyricsScrollHideTimer != null) clearTimeout(lyricsScrollHideTimer);
    lyricsScrollHideTimer = window.setTimeout(() => {
        lyricsScrollHideTimer = null;
        lyricsScrollEl?.classList.remove('lyrics-scrolling');
    }, 1400);
}

const plainLyricsHoverTarget = lyricsPanelEl || lyricsScrollEl;

if (plainLyricsHoverTarget && !IS_ANDROID) {
    plainLyricsHoverTarget.addEventListener('pointerenter', () => {
        state.lyrics.plainScrollHover = true;
        syncPlainScrollAnchorFromDom();
        syncPlainLyricsPlayback();
    });
    plainLyricsHoverTarget.addEventListener('pointerleave', () => {
        state.lyrics.plainScrollHover = false;
        schedulePlainScrollResume();
        syncPlainLyricsPlayback();
    });
}

if (lyricsScrollEl) {
    lyricsScrollEl.addEventListener('wheel', onPlainLyricsUserIntent, { passive: true });
    lyricsScrollEl.addEventListener('touchstart', onPlainLyricsUserIntent, { passive: true });
    if (IS_ANDROID) {
        lyricsScrollEl.addEventListener('touchmove', onPlainLyricsUserIntent, { passive: true });
    }
    lyricsScrollEl.addEventListener('scroll', () => {
        if (plainScrollProgrammatic || !plainLyricsAutoScrollEligible()) return;
        const expected = Math.max(
            0,
            Math.min(
                measurePlainLyricsScrollRange(),
                state.lyrics.plainScrollAutoTop + state.lyrics.plainScrollUserOffset,
            ),
        );
        if (Math.abs(lyricsScrollEl.scrollTop - expected) < (IS_ANDROID ? 10 : 3)) return;
        state.lyrics.plainScrollUserHold = true;
        syncPlainScrollAnchorFromDom();
        schedulePlainScrollResume();
        markLyricsScrollActivity();
    }, { passive: true });
}
