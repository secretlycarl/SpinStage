/**
 * Now-playing presentation: title, art, accent colors, progress clock.
 * Cross-module callbacks use playback/handlers.js (wired in spinstage-app.js).
 */
import { state } from '../state.js';
import {
  DOCUMENT_TITLE_DEFAULT,
  DOCUMENT_TITLE_MAX_LEN,
  TITLE_TWO_LINE_MAX_CHARS,
  TITLE_BASE_SIZE_REM,
  ART_URL_CACHE_MAX,
  THEME_PREFETCH_CACHE_MAX,
  THEME_TRANSITION_MS,
  NP_VISUAL_DEBOUNCE_MS,
  NP_EFFECTS_DELAY_MS,
  PREFETCH_LEAD_MS,
  PROGRESS_SOFT_DRIFT_MS,
  PROGRESS_HARD_RESYNC_MS,
  PROGRESS_SOFT_CATCHUP_RATE,
  PROGRESS_END_CLAMP_MS,
  MA_QUEUE_AUTHORITY_MS,
  BG_BAKE_BLUR_PX,
} from '../constants.js';
import {
    getProgressAuthorityMode,
    isSendspinAuthorityMode,
    isMaQueueAuthorityActive,
    logProgressAuthority,
    touchMaQueueAuthority,
} from './progress-authority.js';
import {
  parseCssColor,
  rgbToHex,
  vizPaletteKey,
  deriveEdgeAccent,
} from '../util/color.js';
import { extractThemeFromImage as extractAccentTheme } from '../util/accent-theme.js';
import { formatTime, progressFillWidth, progressThumbLeft } from '../util/format.js';
import { usesPhoneTypography } from '../platform.js';
import { IS_ANDROID } from '../constants.js';
import { normalizeProviderId, itemProviderId } from '../util/providers.js';
import { isMaImageProxyUrl } from '../util/art-url.js';
import {
  rewriteMaArtHost,
  normalizeArtUrl,
  buildMaImageProxyUrl,
  preferMaImageProxyFormat,
  getArtUrl,
} from '../util/art.js';
import {
  buildMaServerOrigin,
  getDefaultServerAddress,
} from '../util/server.js';
import {
  titleEl,
  titleTextEl,
  titleViewportEl,
  artistEl,
  artistTextEl,
  artistViewportEl,
  albumLineEl,
  albumTextEl,
  albumViewportEl,
  coverEl,
  coverWrapper,
  bgLayers,
  progressBar,
  progressContainerEl,
  progressSlider,
  progressThumb,
  timeCurrent,
  timeTotal,
  playPath,
  playBtn,
  mainBody,
  idleProgressBar,
} from '../dom.js';
import { maClient } from '../ma/client.js';
import { getVisualizer, getVizSelectionMode, beginShuffleCycleTrackCrossfade, beginVizPaletteCrossfade } from './visualizer.js';
import { npH } from './handlers.js';
import {
  registerNpTextMarquee,
  refreshNpTextMarquees,
} from './np-text-marquee.js';

registerNpTextMarquee(titleViewportEl, titleTextEl, 'title');
registerNpTextMarquee(artistViewportEl, artistTextEl, 'artist');
registerNpTextMarquee(albumViewportEl, albumTextEl, 'album');

function getTitleBaseSizeRem() {
    if (isCornerInfoMode()) {
        if (IS_ANDROID && window.matchMedia('(orientation: portrait)').matches) return 1.25;
        return 2.5;
    }
    if (!usesPhoneTypography()) return TITLE_BASE_SIZE_REM;
    return window.matchMedia('(orientation: landscape)').matches ? 1.45 : 1.65;
}


function getTitleEffectiveMaxWidth() {
    if (mainBody.classList.contains('art-corner-info') && !mainBody.classList.contains('show-ui')) {
        const info = document.querySelector('#player-stage .info');
        if (info?.clientWidth > 0) return Math.max(120, info.clientWidth + 6);
        return Math.min(window.innerWidth * 0.58, 520);
    }
    if (mainBody.classList.contains('panel-open')) {
        return window.innerWidth * 0.34;
    }
    if (mainBody.classList.contains('lyrics-open') && !mainBody.classList.contains('show-ui')) {
        return window.innerWidth * 0.34;
    }
    const cover = document.querySelector('.cover-wrapper');
    const idleW = cover ? cover.getBoundingClientRect().width * 2 : window.innerHeight * 0.9;
    return Math.min(window.innerWidth * 0.72, idleW);
}


function isCornerInfoMode() {
    return mainBody.classList.contains('art-corner-info') && !mainBody.classList.contains('show-ui');
}


function syncAlbumLineVisibility() {
    if (!albumLineEl || !albumTextEl) return;
    const next = (albumTextEl.textContent || '').trim();
    albumLineEl.hidden = !next || !isCornerInfoMode();
}


function getArtistBaseSizeRem() {
    if (!IS_ANDROID || isCornerInfoMode()) return null;
    return window.matchMedia('(orientation: landscape)').matches ? 1.05 : 1.2;
}


function applyArtistBaseFont() {
    if (!artistEl) return;
    const size = getArtistBaseSizeRem();
    if (size != null) artistEl.style.fontSize = `${size}rem`;
    else artistEl.style.removeProperty('font-size');
}


function applyTitleBaseFont() {
    titleEl.style.fontSize = `${getTitleBaseSizeRem()}rem`;
}


function refreshNpMarqueeLayout() {
    const run = () => {
        const info = document.querySelector('#player-stage .info');
        const cornerInfo = isCornerInfoMode();
        const maxW = getTitleEffectiveMaxWidth();
        if (info) {
            info.style.removeProperty('width');
            info.style.removeProperty('max-width');
            info.style.setProperty('--np-text-max-w', `${maxW}px`);
        }
        syncAlbumLineVisibility();
        refreshNpTextMarquees({
            getMaxWidth: getTitleEffectiveMaxWidth,
            cornerInfo,
            shouldRun: (entry) => {
                if (entry.viewport === albumViewportEl) {
                    return albumLineEl && !albumLineEl.hidden;
                }
                return true;
            },
        });
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
}


function sanitizeArtistLine(text) {
    const next = (text ?? '').trim();
    if (!next || !/\s\/\s/.test(next)) return next;
    return next.split(/\s+\/\s+/)[0].trim();
}


function setArtistLine(text) {
    const next = sanitizeArtistLine(text ?? '');
    if (artistTextEl.textContent === next) return;
    artistTextEl.textContent = next;
    refreshNpMarqueeLayout();
    syncBrowserDocumentTitle();
}



function setAlbumLine(text) {
    if (!albumLineEl || !albumTextEl) return;
    const next = (text ?? '').trim();
    if (albumTextEl.textContent === next) {
        syncAlbumLineVisibility();
        refreshNpMarqueeLayout();
        return;
    }
    albumTextEl.textContent = next;
    syncAlbumLineVisibility();
    refreshNpMarqueeLayout();
}



function formatNowPlayingAlbumLine(media) {
    if (!media) return '';
    const kind = getPlaybackMediaKind(media);
    if (kind === 'music') {
        const album = npH('trackAlbumName', media);
        const year = npH('formatAlbumYear', media);
        if (album && year) return `${album} (${year})`;
        if (album) return album;
        if (year) return `(${year})`;
        return '';
    }
    if (kind === 'podcast') {
        return npH('pickPodcastName', media) || state.lastPodcastShowSubtitle || '';
    }
    if (kind === 'audiobook') {
        return npH('trackAlbumName', media) || '';
    }
    if (kind === 'radio') {
        return npH('parseRadioHintsFromName', media?.name || media?.title || '') || '';
    }
    return '';
}


function albumLineNeedsEnrich(media) {
    if (!media || getPlaybackMediaKind(media) !== 'music') return false;
    const album = npH('trackAlbumName', media);
    if (!album) return true;
    return !npH('formatAlbumYear', media);
}

async function enrichNowPlayingAlbumMedia(media) {
    if (!media || isRadioMedia(media)) return media;
    if (!albumLineNeedsEnrich(media) && formatNowPlayingAlbumLine(media)) return media;
    let albumMedia = media;
    try {
        const full = await maClient.resolveMaItem(media);
        if (full) albumMedia = full;
    } catch (err) {
        /* keep source media */
    }
    if (!npH('formatAlbumYear', albumMedia)) {
        const alb = albumMedia?.album;
        if (alb && typeof alb === 'object' && (alb.uri || alb.path || alb.item_id)) {
            try {
                const resolved = await maClient.resolveMaItem(alb);
                if (resolved) {
                    albumMedia = { ...albumMedia, album: { ...alb, ...resolved } };
                }
            } catch (err) {
                /* keep track media */
            }
        }
    }
    return albumMedia;
}


function applyIdleNowPlayingText() {
    setSongTitle('Ready');
    setArtistLine(DOCUMENT_TITLE_DEFAULT);
    setAlbumLine('');
}


function syncBrowserDocumentTitle() {
    if (!npH('isBrowserUi')) return;
    const rawTitle = (state.currentTitleText || '').trim();
    const idleTitle = !rawTitle || rawTitle === 'Ready';
    const artist = (artistTextEl?.textContent || '').trim();
    const skipArtist = !artist
        || artist === 'Music Assistant'
        || artist === DOCUMENT_TITLE_DEFAULT
        || artist.toLowerCase() === rawTitle.toLowerCase();
    let tabTitle = DOCUMENT_TITLE_DEFAULT;
    if (!idleTitle) {
        tabTitle = skipArtist ? rawTitle : `${artist} – ${rawTitle}`;
    }
    if (tabTitle.length > DOCUMENT_TITLE_MAX_LEN) {
        tabTitle = `${tabTitle.slice(0, DOCUMENT_TITLE_MAX_LEN - 1)}…`;
    }
    if (document.title !== tabTitle) document.title = tabTitle;
}


function setSongTitle(text) {
    const next = text || 'Ready';
    if (next === state.currentTitleText) return;
    state.currentTitleText = next;
    titleTextEl.textContent = state.currentTitleText;
    titleTextEl.dataset.rawTitle = state.currentTitleText;
    titleViewportEl?.classList.remove('np-title-wrap');
    applyTitleBaseFont();
    refreshNpMarqueeLayout();
    npH('updateProgressLayout');
    syncBrowserDocumentTitle();
    npH('syncAndroidMediaSession');
}


function refreshTitleLayout() {
    applyTitleBaseFont();
    applyArtistBaseFont();
    syncCornerInfoCoverLayout();
    refreshNpMarqueeLayout();
    npH('updateProgressLayout');
}


function scheduleTitleLayoutRelayout() {
    if (!mainBody.classList.contains('show-ui')) return;
    refreshTitleLayout();
    setTimeout(refreshTitleLayout, 360);
}


function getPlaybackMediaKind(item) {
    if (!item) return '';
    if (isRadioMedia(item)) return 'radio';
    if (npH('isPodcastEpisode', item)) return 'podcast';
    if (npH('isAudiobookItem', item)) return 'audiobook';
    return 'music';
}


function getNowPlayingItemKey(queueItem, spinMeta) {
    const media = queueItem?.media_item || queueItem;
    return queueItem?.queue_item_id || media?.uri || media?.path || media?.item_id
        || spinMeta?.uri || spinMeta?.source_id || spinMeta?.title || '';
}


function resolveTrackKey(spinMeta, queueItem) {
    const media = queueItem?.media_item;
    const queueId = queueItem?.queue_item_id || '';
    const maUri = media?.uri || media?.path || '';
    const spinUri = spinMeta?.uri || spinMeta?.source_id || '';
    if (isRadioMedia(media) || (spinMeta && isRadioMedia(spinMeta))) {
        return maUri || queueId || media?.item_id || spinUri || '';
    }
    const maKind = getPlaybackMediaKind(media);
    const spinKind = getPlaybackMediaKind(spinMeta);
    if (maKind && spinKind && maKind !== spinKind) {
        if (maKind !== 'music' && (maUri || queueId)) return maUri || queueId;
        if (spinKind !== 'music' && spinUri) return spinUri;
        return maUri || queueId || spinUri;
    }
    if (spinMeta && isSendspinMetadataStale(spinMeta)) {
        if (isMaQueueAuthorityActive() && (maUri || queueId)) return maUri || queueId;
        return spinUri || maUri || queueId || spinMeta?.title || '';
    }
    return maUri || spinUri || queueId || media?.item_id || spinMeta?.title || '';
}


function trackKeysEquivalent(a, b, queueItem) {
    if (!a || !b) return a === b;
    if (a === b) return true;
    const media = queueItem?.media_item || queueItem;
    const queueId = queueItem?.queue_item_id || '';
    const maUri = media?.uri || media?.path || '';
    const pair = new Set([a, b]);
    if (queueId && pair.has(queueId) && maUri && pair.has(maUri)) return true;
    return false;
}


function sendspinIdentityKey(m) {
    if (!m) return '';
    return String(m.uri || m.source_id || m.title || '').trim();
}


function sendspinTrackChanged(m) {
    const key = sendspinIdentityKey(m);
    if (!key) return false;
    const prev = state.lastSendspinTrackKey || '';
    if (!prev) return false;
    return key !== prev;
}


function rememberSendspinTrackKey(m) {
    const key = sendspinIdentityKey(m);
    if (key) state.lastSendspinTrackKey = key;
}


function settleBgLayersForTrackChange() {
    // Leave in-flight opacity transitions running; crossfadeBackground handles layer handoff.
}


function bumpNpVisualGeneration(clearAccent = true) {
    state.npVisuals.generation += 1;
    if (clearAccent) {
        state.npVisuals.appliedAccentKey = '';
        state._lastVizPaletteKey = '';
        state._bgLastCrossfadeImage = '';
    }
    cancelPrefetch();
    settleBgLayersForTrackChange();
    updatePlayButtonUi();
}


function isPlayButtonLoading() {
    const queueItem = maClient.activeQueue?.current_item;
    if (isNowPlayingRadio()) {
        if (state.npVisuals.pendingApply) return true;
        if (['resolving', 'loading', 'applying'].includes(state.npVisuals.status)) return true;
        return false;
    }
    const key = resolveTrackKey(state.lastSendspinMetadata, queueItem);
    if (!key) return false;
    if (state.npVisuals.pendingApply) return true;
    if (!trackKeysEquivalent(key, state.npVisuals.trackKey, queueItem)) return true;
    if (state.npVisuals.status === 'ready') return false;
    if (['resolving', 'loading', 'applying'].includes(state.npVisuals.status)) return true;
    if (!state.npVisuals.accentReady && state.npVisuals.artUrl) return true;
    return false;
}


function updatePlayButtonUi() {
    const loading = isPlayButtonLoading();
    playBtn.classList.toggle('is-loading', loading);
    if (loading) {
        playBtn.setAttribute('aria-label', 'Loading');
        return;
    }
    playPath.setAttribute('d', state.isPlaying
        ? 'M6 19h4V5H6v14zm8-14v14h4V5h-4z'
        : 'M8 5v14l11-7z');
    playBtn.setAttribute('aria-label', state.isPlaying ? 'Pause' : 'Play');
}


function syncFocusAccentColors(accentCss) {
    const rgb = parseCssColor(accentCss);
    if (!rgb) return;
    const [fr, fg, fb] = [rgb.r, rgb.g, rgb.b];
    document.documentElement.style.setProperty('--focus-accent', rgbToHex(fr, fg, fb));
    document.documentElement.style.setProperty('--focus-accent-bg-28', `rgba(${fr}, ${fg}, ${fb}, 0.28)`);
    document.documentElement.style.setProperty('--focus-accent-bg-22', `rgba(${fr}, ${fg}, ${fb}, 0.22)`);
    document.documentElement.style.setProperty('--focus-accent-bg-15', `rgba(${fr}, ${fg}, ${fb}, 0.15)`);
    document.documentElement.style.setProperty('--focus-accent-bg-06', `rgba(${fr}, ${fg}, ${fb}, 0.06)`);
}


function setAccentColors(uiAccent, edgeAccent, opts = {}) {
    const root = document.documentElement;
    const edge = edgeAccent || deriveEdgeAccent(uiAccent);
    if (opts.defer) {
        state.npVisuals.pendingAccent = {
            uiAccent,
            edgeAccent: edge,
            snap: false,
        };
        return;
    }
    if (opts.snap) {
        root.classList.add('accent-snap');
    } else {
        root.classList.remove('accent-snap');
    }
    root.style.setProperty('--accent', uiAccent);
    syncFocusAccentColors(uiAccent);
    root.style.setProperty('--viz-low', edge);
    root.style.setProperty('--viz-high', uiAccent);
    const low = parseCssColor(edge);
    const high = parseCssColor(uiAccent);
    if (!low || !high) {
        if (opts.snap) requestAnimationFrame(() => root.classList.remove('accent-snap'));
        return;
    }
    if (opts.skipVizPalette) {
        if (opts.snap) requestAnimationFrame(() => root.classList.remove('accent-snap'));
        return;
    }
    if (opts.snap) {
        state._lastVizPaletteKey = vizPaletteKey(low, high);
        getVisualizer()?.setPaletteColors(low, high);
        requestAnimationFrame(() => root.classList.remove('accent-snap'));
        return;
    }
    const key = vizPaletteKey(low, high);
    if (key === state._lastVizPaletteKey) return;
    state._lastVizPaletteKey = key;
    getVisualizer()?.setPaletteTargets(low, high);
}


function commitPendingAccent(opts = {}) {
    const pending = state.npVisuals.pendingAccent;
    if (!pending) return false;
    state.npVisuals.pendingAccent = null;
    setAccentColors(pending.uiAccent, pending.edgeAccent, {
        snap: false,
        skipVizPalette: opts.skipVizPalette,
    });
    return true;
}


async function resolveNpArtUrl(spinMeta, queueItem) {
    const maMedia = queueItem?.media_item;
    const stale = spinMeta && isSendspinMetadataStale(spinMeta);
    const maAuthority = stale && isMaQueueAuthorityActive();
    let art = '';
    if (maMedia && isRadioMedia(maMedia)) {
        art = normalizeArtUrl(getArtUrl(maMedia));
    }
    if (!art) {
        if (stale && maAuthority) {
            art = normalizeArtUrl(getArtUrl(maMedia));
        } else if (stale) {
            art = normalizeArtUrl(
                spinMeta?.artwork_url || spinMeta?.art || spinMeta?.image || '',
            );
        } else {
            art = normalizeArtUrl(
                spinMeta?.artwork_url || spinMeta?.art || spinMeta?.image || getArtUrl(maMedia),
            );
        }
    }
    if (!art && maMedia) {
        art = normalizeArtUrl(await fetchMaArtUrl(maMedia));
    }
    if (!art && !stale && (spinMeta?.uri || spinMeta?.source_id)) {
        art = normalizeArtUrl(await fetchMaArtUrl({
            uri: spinMeta.uri || spinMeta.source_id,
            name: spinMeta.title,
        }));
    }
    return art;
}


function loadVisualImage(url, generation) {
    return new Promise((resolve) => {
        const finish = (img) => {
            if (generation !== state.npVisuals.generation) {
                resolve(null);
                return;
            }
            resolve(img);
        };
        if (coverEl.src === url && coverEl.complete && coverEl.naturalWidth > 0) {
            finish(coverEl);
            return;
        }
        const cors = artUrlCrossOrigin(url);
        const img = new Image();
        if (cors) img.crossOrigin = cors;
        img.onload = () => finish(img);
        img.onerror = () => {
            if (cors) {
                state.artUrlsNoCors.add(url);
                const retry = new Image();
                retry.onload = () => finish(retry);
                retry.onerror = () => resolve(null);
                retry.src = url;
                return;
            }
            resolve(null);
        };
        img.src = url;
    });
}


function loadCorsVisualImage(url, generation) {
    return new Promise((resolve) => {
        if (!url) {
            resolve(null);
            return;
        }
        const cors = artUrlCrossOrigin(url) || (artUrlNeedsCors(url) ? 'anonymous' : null);
        const img = new Image();
        if (cors) img.crossOrigin = cors;
        img.onload = () => {
            if (generation != null && generation !== state.npVisuals.generation) resolve(null);
            else resolve(img);
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}


function cssBackgroundUrl(url) {
    if (!url) return '';
    return `url("${encodeURI(url).replace(/"/g, '%22')}")`;
}


const COVER_SQUARE_EPS = 0.06;

const COVER_MAX_VH = 50;

const _coverAnalyzeCanvas = document.createElement('canvas');
const _coverAnalyzeCtx = _coverAnalyzeCanvas.getContext('2d', { willReadFrequently: true });

const coverArtAnalysisCache = new Map();

function analyzeCoverArt(img) {
    const iw = img?.naturalWidth || 0;
    const ih = img?.naturalHeight || 0;
    if (!iw || !ih) {
        return { hasTransparency: false, isSquare: true, aspectRatio: 1, displayAspect: 1 };
    }
    const aspectRatio = iw / ih;
    const isSquare = Math.abs(aspectRatio - 1) <= COVER_SQUARE_EPS;
    try {
        const size = 64;
        _coverAnalyzeCanvas.width = size;
        _coverAnalyzeCanvas.height = size;
        _coverAnalyzeCtx.clearRect(0, 0, size, size);
        _coverAnalyzeCtx.drawImage(img, 0, 0, size, size);
        const { data } = _coverAnalyzeCtx.getImageData(0, 0, size, size);
        let transparent = 0;
        let minX = size;
        let minY = size;
        let maxX = 0;
        let maxY = 0;
        const total = size * size;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const i = (y * size + x) * 4;
                const a = data[i + 3];
                if (a < 128) {
                    transparent += 1;
                } else {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        const hasTransparency = transparent / total > 0.08;
        let displayAspect = aspectRatio;
        if (hasTransparency && maxX >= minX && maxY >= minY) {
            const bboxW = maxX - minX + 1;
            const bboxH = maxY - minY + 1;
            if (bboxH > 0) displayAspect = bboxW / bboxH;
        }
        return { hasTransparency, isSquare, aspectRatio, displayAspect };
    } catch (err) {
        return { hasTransparency: false, isSquare, aspectRatio, displayAspect: aspectRatio };
    }
}


function getCornerCoverMaxVh() {
    if (IS_ANDROID && window.matchMedia('(orientation: portrait)').matches) return 13.2;
    return 26.4;
}


function getShowUiCoverMaxPx() {
    if (!usesPhoneTypography()) {
        return window.innerHeight * (COVER_MAX_VH / 100);
    }
    const landscape = window.matchMedia('(orientation: landscape)').matches;
    const vhCap = window.innerHeight * (landscape ? 0.52 : 0.36);
    const vwCap = window.innerWidth * (landscape ? 0.34 : 0.58);
    return Math.min(vhCap, vwCap);
}


function setCoverWrapperDimensions(aspectRatio) {
    const ar = Math.max(0.45, Math.min(2.2, aspectRatio || 1));
    const maxPx = getShowUiCoverMaxPx();
    if (ar >= 1) {
        coverWrapper.style.width = `${maxPx.toFixed(1)}px`;
        coverWrapper.style.height = `${(maxPx / ar).toFixed(1)}px`;
    } else {
        coverWrapper.style.width = `${(maxPx * ar).toFixed(1)}px`;
        coverWrapper.style.height = `${maxPx.toFixed(1)}px`;
    }
}


function resetCoverArtLayout() {
    coverWrapper.classList.remove('cover-radio-transparent', 'cover-radio-fit', 'cover-radio-rounded');
    coverWrapper.style.removeProperty('width');
    coverWrapper.style.removeProperty('height');
    coverEl.style.removeProperty('filter');
    coverEl.style.objectFit = 'cover';
    mainBody.classList.remove('radio-playing');
}


function artUrlLikelyTransparent(url) {
    return /\.(png|webp)(\?|#|$)/i.test(url || '');
}


function setCornerInfoCoverDimensions(aspectRatio) {
    if (!coverWrapper) return;
    const maxVh = getCornerCoverMaxVh();
    const ar = Math.max(0.45, Math.min(2.2, aspectRatio || 1));
    if (ar >= 1) {
        coverWrapper.style.width = `${maxVh}vh`;
        coverWrapper.style.height = `${(maxVh / ar).toFixed(2)}vh`;
    } else {
        coverWrapper.style.width = `${(maxVh * ar).toFixed(2)}vh`;
        coverWrapper.style.height = `${maxVh}vh`;
    }
}


function refreshRadioCoverLayout() {
    if (!isNowPlayingRadio() || !coverEl?.src) return;
    const img = coverEl.complete && coverEl.naturalWidth ? coverEl : null;
    applyCoverArtLayout(img || coverEl, coverEl.src);
}


function syncCornerInfoCoverLayout() {
    if (!coverWrapper) return;
    if (isNowPlayingRadio() && coverEl?.src) {
        refreshRadioCoverLayout();
        return;
    }
    coverWrapper.style.removeProperty('width');
    coverWrapper.style.removeProperty('height');
}


function applyCoverArtLayout(img, url) {
    if (!coverWrapper) return;
    resetCoverArtLayout();
    if (!isNowPlayingRadio()) return;

    mainBody.classList.add('radio-playing');
    let analysis = url && coverArtAnalysisCache.get(url);
    if (!analysis && img?.naturalWidth) {
        analysis = analyzeCoverArt(img);
        if (url) {
            coverArtAnalysisCache.set(url, analysis);
            trimMapCache(coverArtAnalysisCache, ART_URL_CACHE_MAX);
        }
    }
    const aspectFromImg = (img?.naturalWidth && img?.naturalHeight)
        ? img.naturalWidth / img.naturalHeight : 1;
    const ar = analysis?.displayAspect || analysis?.aspectRatio || aspectFromImg;
    const cornerInfo = isCornerInfoMode();
    coverWrapper.classList.add('cover-radio-transparent');
    const opaque = analysis
        ? !analysis.hasTransparency
        : !artUrlLikelyTransparent(url);
    if (opaque) coverWrapper.classList.add('cover-radio-rounded');
    coverEl.style.objectFit = 'contain';
    if (cornerInfo) {
        setCornerInfoCoverDimensions(ar);
    } else {
        setCoverWrapperDimensions(ar);
    }
}


function syncCoverCrossOrigin(url, img) {
    const wantsCors = artUrlCrossOrigin(url);
    if (!wantsCors || (img && !img.crossOrigin)) {
        coverEl.removeAttribute('crossorigin');
    } else {
        coverEl.crossOrigin = 'anonymous';
    }
}


function applyNpCover(img, url) {
    coverEl.onerror = () => {
        if (artUrlCrossOrigin(url)) {
            state.artUrlsNoCors.add(url);
            syncCoverCrossOrigin(url, null);
            coverEl.onerror = () => {
                coverEl.style.display = 'none';
                resetCoverArtLayout();
                document.getElementById('loader').style.display = 'flex';
            };
            coverEl.src = url;
            return;
        }
        coverEl.style.display = 'none';
        resetCoverArtLayout();
        document.getElementById('loader').style.display = 'flex';
    };
    syncCoverCrossOrigin(url, img);
    const applyLayout = () => {
        const source = (img?.naturalWidth ? img : coverEl);
        applyCoverArtLayout(source, url);
    };
    if (coverEl.src !== url) {
        coverEl.onload = () => applyLayout();
        coverEl.src = url;
    } else if (coverEl.complete && coverEl.naturalWidth > 0) {
        applyLayout();
    } else {
        coverEl.onload = () => applyLayout();
    }
    coverEl.style.display = 'block';
    document.getElementById('loader').style.display = 'none';
}


function commitNpTextTrack(trackKey) {
    if (!trackKey) return;
    state.npTextTrackKey = trackKey;
    const pending = state.npVisuals.pendingApply;
    const queueItem = maClient.activeQueue?.current_item;
    if (pending && trackKeysEquivalent(pending.trackKey, trackKey, queueItem)) {
        state.npVisuals.pendingApply = null;
        applyNpPresentation(pending.img, pending.artUrl, pending.trackKey, pending.generation, pending.opts);
    }
}


function scheduleNpEffects(img, artUrl, trackKey, generation, opts) {
    clearTimeout(state._npEffectsTimer);
    state._npEffectsTimer = setTimeout(async () => {
        state._npEffectsTimer = null;
        if (generation !== state.npVisuals.generation) return;
        if (trackKey && trackKey !== state.npVisuals.trackKey) return;
        const item = maClient.activeQueue?.current_item?.media_item;
        const priorStableArtUrl = opts.priorStableArtUrl ?? state.npVisuals.stableArtUrl;
        const sameStableArt = state.npVisuals.accentReady
            && state.npVisuals.appliedAccentKey
            && artUrlsEquivalent(artUrl, priorStableArtUrl);
        const trackChange = !!opts.trackChange;
        const selMode = getVizSelectionMode();
        const isShuffleCycle = selMode === 'shuffle' || selMode === 'cycle';
        const useTransition = trackChange || (!opts.immediate && !sameStableArt);
        const deferPresentation = useTransition;
        const holdOutgoingPalette = useTransition || (isShuffleCycle && !sameStableArt);
        const skipVizInSetAccent = isShuffleCycle || (useTransition && trackChange);
        let paletteHeld = false;
        const releasePaletteHoldSafe = () => {
            if (!paletteHeld) return;
            getVisualizer()?.releasePaletteHold();
            paletteHeld = false;
        };
        try {
            if (holdOutgoingPalette) {
                getVisualizer()?.holdPalette();
                paletteHeld = true;
            }
            const sourceImg = await waitForAccentSourceImage(img, artUrl, generation);
            if (generation !== state.npVisuals.generation) return;
            let accentOk = false;
            let pendingTheme = null;
            const accentOpts = {
                snap: useTransition ? false : !!opts.immediate,
                rawArtUrl: opts.rawArtUrl || artUrl,
                skipVizPalette: skipVizInSetAccent,
                defer: deferPresentation,
            };
            if (sameStableArt && !trackChange) {
                paintAccentFromStableArt(artUrl, {
                    skipVizPalette: isShuffleCycle,
                    snap: false,
                });
                accentOk = true;
            } else if (sourceImg) {
                accentOk = applyNpAccent(sourceImg, artUrl, accentOpts);
                pendingTheme = state.npVisuals.pendingAccent;
            }
            if (!accentOk) {
                accentOk = await resolveNpAccentFromProxy(
                    opts.rawArtUrl || artUrl, item, generation, accentOpts,
                );
                pendingTheme = state.npVisuals.pendingAccent;
            }
            if (generation !== state.npVisuals.generation) return;
            await applyNpBackground(sourceImg, artUrl, trackKey, generation, {
                rawArtUrl: opts.rawArtUrl || artUrl,
            });
            const shufflePalette = (trackKey && isShuffleCycle)
                ? accentColorsForShuffleCrossfade(pendingTheme)
                : null;
            const trackPalette = (!isShuffleCycle && useTransition && trackChange)
                ? accentColorsForShuffleCrossfade(pendingTheme)
                : null;
            if (deferPresentation) {
                commitPendingAccent({ skipVizPalette: skipVizInSetAccent });
            }
            if (shufflePalette) {
                beginShuffleCycleTrackCrossfade(trackKey, shufflePalette.low, shufflePalette.high);
                releasePaletteHoldSafe();
            } else if (trackPalette) {
                beginVizPaletteCrossfade(trackPalette.low, trackPalette.high);
                releasePaletteHoldSafe();
            } else {
                if (deferPresentation) releasePaletteHoldSafe();
                if (trackKey) npH('vizModeOnTrackChange', trackKey);
            }
            state.npVisuals.pendingAccent = null;
            const ready = npVisualPipelineReady(accentOk, img);
            if (generation === state.npVisuals.generation) {
                state.npVisuals.accentReady = ready;
                state.npVisuals.status = ready ? 'ready' : 'idle';
                if (ready && artUrl) {
                    state.npVisuals.stableArtUrl = artUrl;
                    state.npVisuals.artUrl = artUrl;
                }
                npH('syncAndroidMediaSession');
                updatePlayButtonUi();
            }
        } finally {
            if (paletteHeld && !(trackKey && isShuffleCycle)) releasePaletteHoldSafe();
        }
    }, opts.immediate ? 0 : NP_EFFECTS_DELAY_MS);
}


function applyNpPresentation(img, artUrl, trackKey, generation, opts = {}) {
    const queueItem = maClient.activeQueue?.current_item;
    const media = queueItem?.media_item;
    if (!opts.force && !isRadioMedia(media) && trackKey && state.npTextTrackKey
        && !trackKeysEquivalent(trackKey, state.npTextTrackKey, queueItem)) {
        state.npVisuals.pendingApply = { img, artUrl, trackKey, generation, opts };
        return false;
    }
    applyNpCover(img, artUrl);
    scheduleNpEffects(img, artUrl, trackKey, generation, opts);
    return true;
}


function npAccentSourceImage(img, url) {
    if (coverEl.src === url && coverEl.complete && coverEl.naturalWidth > 0) {
        return coverEl;
    }
    return img;
}


function accentCacheKey(url) {
    return normalizeArtUrl(url) || (url || '').trim();
}


function artUrlsEquivalent(a, b) {
    if (!a || !b) return a === b;
    if (a === b) return true;
    const keyA = accentCacheKey(a);
    const keyB = accentCacheKey(b);
    return !!(keyA && keyB && keyA === keyB);
}

function storeThemeCache(url, theme, extraUrls = []) {
    if (!theme) return;
    const keys = new Set();
    const add = (u) => {
        const key = accentCacheKey(u);
        if (key) keys.add(key);
    };
    add(url);
    extraUrls.forEach(add);
    keys.forEach((key) => state.themePrefetchCache.set(key, theme));
    trimMapCache(state.themePrefetchCache, THEME_PREFETCH_CACHE_MAX);
}

function readCachedTheme(...urls) {
    for (const url of urls) {
        const key = accentCacheKey(url);
        if (!key) continue;
        const cached = state.themePrefetchCache.get(key);
        if (cached) return cached;
    }
    return null;
}

function applyCachedAccent(cached, key, opts = {}) {
    setAccentColors(
        cached.uiAccent || cached.accent,
        cached.edgeAccent || cached.vizLow,
        { snap: opts.snap !== false, skipVizPalette: opts.skipVizPalette, defer: opts.defer },
    );
    if (key) state.npVisuals.appliedAccentKey = key;
    return true;
}

function paintAccentFromStableArt(artUrl, opts = {}) {
    if (state.npVisuals.pendingAccent) {
        return commitPendingAccent({ skipVizPalette: opts.skipVizPalette });
    }
    if (!artUrl || !state.npVisuals.appliedAccentKey) return false;
    const cached = readCachedTheme(artUrl);
    if (!cached) return false;
    return applyCachedAccent(cached, state.npVisuals.appliedAccentKey, {
        snap: opts.snap === true,
        defer: false,
        skipVizPalette: opts.skipVizPalette,
    });
}

function accentColorsForShuffleCrossfade(pendingTheme) {
    const uiRaw = pendingTheme?.uiAccent || state.npVisuals.lastAppliedAccentColor;
    if (!uiRaw) return null;
    const edgeRaw = pendingTheme?.edgeAccent || deriveEdgeAccent(uiRaw);
    const low = parseCssColor(edgeRaw);
    const high = parseCssColor(uiRaw);
    if (!low || !high) return null;
    return { low, high };
}

async function waitForAccentSourceImage(img, url, generation) {
    if (generation !== state.npVisuals.generation) return null;
    if (coverEl.src === url && coverEl.complete && coverEl.naturalWidth > 0) {
        return coverEl;
    }
    if (coverEl.src === url && !coverEl.complete) {
        await new Promise((resolve) => {
            const finish = () => {
                coverEl.onload = null;
                coverEl.onerror = null;
                resolve();
            };
            if (coverEl.complete && coverEl.naturalWidth > 0) finish();
            else {
                coverEl.onload = finish;
                coverEl.onerror = finish;
            }
        });
        if (generation !== state.npVisuals.generation) return null;
        if (coverEl.src === url && coverEl.complete && coverEl.naturalWidth > 0) {
            return coverEl;
        }
    }
    return npAccentSourceImage(img, url);
}

function applyNpAccent(img, url, opts = {}) {
    const key = accentCacheKey(url);
    const aliasUrls = [opts.rawArtUrl, url].filter(Boolean);
    const source = npAccentSourceImage(img, url);
    const theme = extractThemeFromImage(source);
    if (theme) {
        storeThemeCache(url, theme, aliasUrls);
        if (key) state.npVisuals.appliedAccentKey = key;
        state.npVisuals.lastAppliedAccentColor = theme.uiAccent;
        setAccentColors(theme.uiAccent, theme.edgeAccent, {
            snap: opts.snap !== false,
            skipVizPalette: opts.skipVizPalette,
            defer: opts.defer,
        });
        return true;
    }
    const cached = readCachedTheme(...aliasUrls);
    if (cached) {
        state.npVisuals.lastAppliedAccentColor = cached.uiAccent || cached.accent;
        return applyCachedAccent(cached, key, opts);
    }
    return false;
}


async function applyNpBackground(img, url, trackKey, generation, opts = {}) {
    if (generation != null && generation !== state.npVisuals.generation) return;
    const item = maClient.activeQueue?.current_item?.media_item || state.lastSendspinMetadata;
    const rawUrl = normalizeArtUrl(opts.rawArtUrl || url);
    const bakeUrl = resolveNpBackgroundArtUrl(rawUrl, item) || url;
    const displayFallback = rawUrl || url;

    if (!_bgBakeCssFallback && bakeUrl === _bgBakeUrl && trackKey === state._bgBakeItemKey) {
        return;
    }

    let bakeImg = img;
    const needsCorsSource = !!(bakeUrl && (bakeUrl !== url || artUrlNeedsCors(rawUrl)));
    if (needsCorsSource) {
        const corsImg = await loadCorsVisualImage(bakeUrl, generation);
        if (generation !== state.npVisuals.generation) return;
        if (corsImg) bakeImg = corsImg;
    }

    if (generation != null && generation !== state.npVisuals.generation) return;
    finishBackgroundBake(bakeImg, bakeUrl, trackKey, generation, {
        fallbackUrl: displayFallback,
    });
}


async function runNowPlayingVisualPipeline(opts = {}) {
    const spin = state.lastSendspinMetadata || {};
    const queueItem = maClient.activeQueue?.current_item;
    const trackKey = resolveTrackKey(spin, queueItem);
    if (!trackKey) return;

    const playbackKind = getPlaybackMediaKind(queueItem?.media_item)
        || getPlaybackMediaKind(spin) || 'music';
    if (state.lastPlaybackMediaKind && playbackKind !== state.lastPlaybackMediaKind) {
        bumpNpVisualGeneration();
        if (playbackKind === 'radio' && state.uiFocusZone === 'progress') {
            state.uiFocusZone = 'controls';
        }
    }
    state.lastPlaybackMediaKind = playbackKind;
    if (playbackKind !== 'radio') resetCoverArtLayout();
    state.sendspinAuthorityKey = trackKey;

    const sameTrack = trackKey === state.npVisuals.trackKey;
    const artUrlEarly = await resolveNpArtUrl(spin, queueItem);
    const maMediaEarly = queueItem?.media_item;
    const displayUrlEarly = artUrlEarly ? resolveNpDisplayArtUrl(artUrlEarly, maMediaEarly) : '';
    const artUnchanged = !!(displayUrlEarly && artUrlsEquivalent(displayUrlEarly, state.npVisuals.stableArtUrl));

    if (opts.force && sameTrack) {
        state.npVisuals.accentReady = false;
        state.npVisuals.status = 'idle';
    } else if (opts.force || !sameTrack) {
        bumpNpVisualGeneration(!artUnchanged);
        state.npVisuals.trackKey = trackKey;
        if (!artUnchanged) {
            state.npVisuals.artUrl = '';
            state.npVisuals.accentReady = false;
            _bgBakeUrl = '';
            _bgBakeCssFallback = false;
            state._bgBakeItemKey = '';
        }
        state.npVisuals.status = artUnchanged && state.npVisuals.accentReady ? 'ready' : 'idle';
        state.npVisuals.pendingApply = null;
        clearTimeout(state._npEffectsTimer);
    }

    const generation = state.npVisuals.generation;

    const artUrl = artUrlEarly;
    if (generation !== state.npVisuals.generation) return;

    const maMedia = maMediaEarly;
    const displayUrl = displayUrlEarly;

    if (!displayUrl) {
        state.npVisuals.status = 'ready';
        state.npVisuals.accentReady = true;
        updatePlayButtonUi();
        return;
    }

    if (!opts.force && sameTrack && artUrlsEquivalent(state.npVisuals.artUrl, displayUrl) && state.npVisuals.accentReady) {
        paintAccentFromStableArt(displayUrl);
        state.npVisuals.status = 'ready';
        updatePlayButtonUi();
        return;
    }

    if (!opts.force && sameTrack && artUnchanged && state.npVisuals.accentReady && state.npVisuals.appliedAccentKey) {
        paintAccentFromStableArt(displayUrl);
        state.npVisuals.trackKey = trackKey;
        state.npVisuals.status = 'ready';
        updatePlayButtonUi();
        return;
    }

    state.npVisuals.status = 'resolving';

    const artChanged = !artUrlsEquivalent(displayUrl, state.npVisuals.artUrl);

    state.npVisuals.status = 'loading';
    let img = await loadVisualImage(displayUrl, generation);
    if (!img && displayUrl !== artUrl && artUrl) {
        img = await loadVisualImage(artUrl, generation);
    }
    if (generation !== state.npVisuals.generation || !img) return;

    const accentOnly = sameTrack && !artChanged && !state.npVisuals.accentReady;

    state.npVisuals.status = 'applying';
    let accentOk = false;
    const accentOpts = { snap: true, rawArtUrl: artUrl };
    if (accentOnly) {
        accentOk = applyNpAccent(img, displayUrl, accentOpts);
        if (!accentOk) {
            accentOk = await resolveNpAccentFromProxy(artUrl, maMedia, generation, accentOpts);
        }
    } else if (artChanged || opts.force || !sameTrack) {
        const priorStableArtUrl = state.npVisuals.stableArtUrl;
        applyNpPresentation(img, displayUrl, trackKey, generation, {
            rawArtUrl: artUrl,
            force: opts.force,
            immediate: !!opts.immediate,
            trackChange: !sameTrack,
            priorStableArtUrl,
        });
    }

    if (generation === state.npVisuals.generation) {
        state._lastArtAppliedUrl = displayUrl;
        state._lastArtUpdateKey = trackKey;
        if (accentOnly) {
            if (displayUrl) state.npVisuals.stableArtUrl = displayUrl;
            state.npVisuals.artUrl = displayUrl;
            const ready = npVisualPipelineReady(accentOk, img);
            state.npVisuals.accentReady = ready;
            state.npVisuals.status = ready ? 'ready' : 'idle';
            npH('syncAndroidMediaSession');
            updatePlayButtonUi();
        } else if (state.npVisuals.pendingApply) {
            state.npVisuals.accentReady = false;
            state.npVisuals.status = 'idle';
        } else if (state.npVisuals.status === 'applying') {
            state.npVisuals.status = state.npVisuals.accentReady ? 'ready' : 'idle';
            updatePlayButtonUi();
        }
    }
}


function requestNowPlayingVisuals(_reason, opts = {}) {
    clearTimeout(state.npVisuals.debounceTimer);
    state.npVisuals.debounceTimer = setTimeout(async () => {
        state.npVisuals.debounceTimer = null;
        const prev = state.npVisuals.inFlight;
        if (prev) {
            try { await prev; } catch (_) { /* aborted */ }
        }
        const run = runNowPlayingVisualPipeline(opts);
        state.npVisuals.inFlight = run;
        run.finally(() => {
            if (state.npVisuals.inFlight === run) state.npVisuals.inFlight = null;
            updatePlayButtonUi();
        });
    }, NP_VISUAL_DEBOUNCE_MS);
}


function onMaQueueCurrentItemChanged(prevId, nextId) {
    if (!nextId || nextId === prevId) return;
    touchMaQueueAuthority(Date.now() + MA_QUEUE_AUTHORITY_MS);
    if (!npH('getIsSeeking')) {
        const item = maClient.activeQueue?.current_item;
        const itemKey = item ? getNowPlayingItemKey(item) : '';
        state.lastProgressTrackId = itemKey || '';
        state.sendspinAuthorityKey = itemKey || '';
        state.progressResyncAt = 0;
        markProgressSpinGuard();
        const durMs = resolveTrackDurationMs(state.lastSendspinMetadata, item);
        anchorProgress(0, state.progressAnchorSpeed || 1);
        updateProgressUI(0, durMs);
    }
    const item = maClient.activeQueue?.current_item;
    if (item) {
        npH('onRadioStationUriChanged', item.media_item || item);
        state.lastRadioStreamMetaKey = '';
        void applyNowPlayingFromMaItem(item, { force: true, skipVisuals: true });
    }
    requestNowPlayingVisuals('queue-change', { force: true });
    _lastPrefetchCheckMs = 0;
    void maybePrefetchNextTrack();
}


function maItemBehindSendspin(itemKey) {
    if (!itemKey || !state.sendspinAuthorityKey) return false;
    if (itemKey === state.sendspinAuthorityKey) return false;
    const queueItem = maClient.activeQueue?.current_item;
    if (queueItemMatchesAuthority(queueItem, itemKey)
        && queueItemMatchesAuthority(queueItem, state.sendspinAuthorityKey)) {
        return false;
    }
    return true;
}


function shouldExtrapolateProgress() {
    return state.isPlaying;
}


function isMaQueueClockRunning() {
    return maClient.activeQueue?.state === 'playing';
}


function getMaQueueProgress() {
    const q = maClient.activeQueue;
    if (!q || isNowPlayingRadio()) return null;
    const item = q.current_item;
    const media = item?.media_item;
    if (!item) return null;
    let durSec = Number(item.duration ?? media?.duration ?? 0);
    if (durSec <= 0) return null;
    const durMs = durSec * 1000;
    let elapsed = q.elapsed_time;
    if (elapsed == null) return null;
    const lastUp = q.elapsed_time_last_updated;
    if (isMaQueueClockRunning() && lastUp > 0) {
        const wallDelta = (Date.now() / 1000) - lastUp;
        const speed = Number(q.playback_speed ?? item.extra_attributes?.playback_speed ?? 1);
        elapsed += wallDelta * (speed > 0 ? speed : 1);
    }
    const posMs = Math.max(0, Math.min(durMs, elapsed * 1000));
    const speed = Number(q.playback_speed ?? item.extra_attributes?.playback_speed ?? 1);
    return {
        positionMs: posMs,
        durationMs: durMs,
        playbackSpeed: speed > 0 ? speed : 1,
    };
}


function syncProgressFromMaQueue(force = false) {
    if (npH('getIsSeeking')) return false;
    if (isSendspinProgressAuthority()) return false;
    const ma = getMaQueueProgress();
    if (!ma) return false;
    if (shouldRejectIncomingProgress(ma.positionMs)) return false;
    const drift = Math.abs(ma.positionMs - state.currentPos);
    if (!force && drift < PROGRESS_HARD_RESYNC_MS) return false;
    anchorProgress(ma.positionMs, ma.playbackSpeed || state.progressAnchorSpeed || 1);
    state.progressResyncAt = performance.now();
    updateProgressUI(ma.positionMs, ma.durationMs);
    return true;
}


function queueItemMatchesAuthority(queueItem, authorityKey) {
    if (!queueItem || !authorityKey) return false;
    if (getNowPlayingItemKey(queueItem) === authorityKey) return true;
    if (resolveTrackKey(null, queueItem) === authorityKey) return true;
    const media = queueItem?.media_item || queueItem;
    const uri = media?.uri || media?.path || '';
    if (uri && uri === authorityKey) return true;
    const itemId = media?.item_id || '';
    return !!(itemId && itemId === authorityKey);
}


function artUrlCrossOrigin(url) {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null;
    if (state.artUrlsNoCors.has(url)) return null;
    if (!/^https?:\/\//i.test(url)) return null;
    try {
        const artOrigin = new URL(url, window.location.href).origin;
        if (artOrigin === window.location.origin) return null;
    } catch (err) {
        return 'anonymous';
    }
    return 'anonymous';
}


function artUrlNeedsCors(url) {
    return artUrlCrossOrigin(url) === 'anonymous';
}


function resolveCorsSafeArtUrl(url, item) {
    url = normalizeArtUrl(url);
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return '';
    const preferPng = isRadioMedia(item);
    const fmt = preferPng ? 'png' : 'jpeg';
    if (isMaImageProxyUrl(url)) {
        return preferMaImageProxyFormat(rewriteMaArtHost(url), fmt);
    }
    if (!artUrlNeedsCors(url)) return url;
    const origin = buildMaServerOrigin(getDefaultServerAddress());
    if (!origin) return '';
    try {
        const artOrigin = new URL(url, window.location.href).origin;
        if (artOrigin === new URL(origin).origin) return rewriteMaArtHost(url);
    } catch (err) { /* fall through */ }
    const provider = normalizeProviderId(
        item?.provider_instance_id || item?.provider_instance || item?.provider
        || itemProviderId(item),
    );
    const proxied = buildMaImageProxyUrl(url, provider, 512, fmt);
    return proxied ? rewriteMaArtHost(proxied) : '';
}


function resolveNpDisplayArtUrl(artUrl, item) {
    const normalized = normalizeArtUrl(artUrl);
    if (!normalized) return '';
    const proxied = resolveCorsSafeArtUrl(normalized, item);
    if (proxied && artUrlNeedsCors(normalized)) return proxied;
    const display = proxied || normalized;
    if (isRadioMedia(item) && (isMaImageProxyUrl(display) || artUrlLikelyTransparent(display))) {
        return preferMaImageProxyFormat(display, 'png');
    }
    return display;
}


function resolveNpBackgroundArtUrl(artUrl, item) {
    const normalized = normalizeArtUrl(artUrl);
    if (!normalized) return '';
    if (normalized.startsWith('data:') || normalized.startsWith('blob:')) return normalized;
    const proxied = resolveCorsSafeArtUrl(normalized, item);
    if (proxied) {
        if (isRadioMedia(item) && isMaImageProxyUrl(proxied)) {
            return preferMaImageProxyFormat(proxied, 'png');
        }
        return proxied;
    }
    if (artUrlNeedsCors(normalized)) return '';
    return normalized;
}


async function resolveNpAccentFromProxy(artUrl, item, generation, opts = {}) {
    const corsSafeUrl = resolveCorsSafeArtUrl(artUrl, item);
    if (!corsSafeUrl || corsSafeUrl === artUrl) return false;
    const corsImg = await loadVisualImage(corsSafeUrl, generation);
    if (generation !== state.npVisuals.generation || !corsImg) return false;
    return applyNpAccent(corsImg, corsSafeUrl, { ...opts, rawArtUrl: artUrl });
}


function npVisualPipelineReady(accentOk, img) {
    return accentOk || !!(img?.naturalWidth);
}



async function fetchMaArtUrl(item) {
    if (!item) return '';
    const cacheKey = item.uri || item.path || item.item_id || '';
    if (cacheKey && state.artUrlCache.has(cacheKey)) return state.artUrlCache.get(cacheKey);
    let art = normalizeArtUrl(getArtUrl(item));
    if (art) {
        cacheArtUrl(item, art);
        return art;
    }
    if (item.image_url) {
        art = normalizeArtUrl(item.image_url);
        if (art) {
            cacheArtUrl(item, art);
            return art;
        }
    }
    const uri = item.uri || item.path;
    if (!uri) return '';
    try {
        await maClient.ensureReady();
        const full = await maClient.resolveMaItem(item);
        art = normalizeArtUrl(getArtUrl(full));
        if (art) {
            cacheArtUrl(item, art);
            return art;
        }
        if (full?.album) {
            const album = (full.album.uri && full.album.uri !== uri)
                ? await maClient.resolveMaItem(full.album)
                : full.album;
            art = normalizeArtUrl(getArtUrl(album));
            if (art) cacheArtUrl(item, art);
        }
    } catch (err) { /* fall through */ }
    return art || '';
}


function isRadioMedia(item) {
    if (!item) return false;
    return npH('inferMediaType', item) === 'radio'
        || (item.uri || item.path || '').toLowerCase().includes('radio');
}


function isNowPlayingRadio() {
    const maMedia = maClient.activeQueue?.current_item?.media_item || null;
    if (maMedia && !isRadioMedia(maMedia)) return false;
    if (maMedia && isRadioMedia(maMedia)) return true;
    const spin = state.lastSendspinMetadata;
    if (spin && !isRadioMedia(spin)) return false;
    return isRadioMedia(maMedia) || isRadioMedia(spin);
}


function isSendspinMetadataStale(m) {
    const current = maClient.activeQueue?.current_item;
    const maMedia = current?.media_item;
    if (!m) return true;
    if (!maMedia) {
        if (!maClient.bootstrapped) return true;
        if (maClient.activeQueue && !current) return true;
        return false;
    }
    if (isRadioMedia(maMedia)) {
        const maUri = String(maMedia.uri || '').toLowerCase();
        const spinUri = String(m.uri || m.source_id || '').toLowerCase();
        if (maUri && spinUri && maUri !== spinUri && !spinUri.includes('radio')) return true;
        return false;
    }
    const maUri = maMedia.uri || '';
    const spinUri = m.uri || m.source_id || '';
    if (maUri && spinUri && maUri !== spinUri) {
        const libraryish = npH('isLocalLibraryItem', maMedia)
            || String(maUri).toLowerCase().includes('library://')
            || String(spinUri).toLowerCase().includes('filesystem');
        if (!libraryish) return true;
    }
    const maName = maMedia.name || current.name || '';
    if (maName && m.title && maName !== m.title) {
        const a = maName.toLowerCase();
        const b = m.title.toLowerCase();
        if (!a.includes(b) && !b.includes(a)) return true;
    }
    return false;
}


function trimMapCache(map, max) {
    while (map.size > max) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
    }
}


function cancelPrefetch() {
    state._prefetchGen += 1;
    state._prefetchQueueKey = '';
    state._prefetchInFlight = false;
}


function syncMaNowPlayingIfChanged(prevCurrentId, opts = {}) {
    const item = maClient.activeQueue?.current_item;
    const nextId = item?.queue_item_id;
    if (!item || !nextId) {
        if (prevCurrentId != null) applyIdleNowPlayingText();
        return;
    }
    if (nextId === prevCurrentId) return;
    const itemKey = getNowPlayingItemKey(item);
    if (prevCurrentId == null) {
        void applyNowPlayingFromMaItem(item, { force: true, skipVisuals: true });
        if (!opts.skipVisualRequest) {
            requestNowPlayingVisuals('queue-init', { force: true });
        }
        return;
    }
    if (maItemBehindSendspin(itemKey)) {
        if (state.queuePanelOpen) npH('syncQueuePlayingHighlight');
        if (!opts.skipVisualRequest) {
            requestNowPlayingVisuals('queue-ma-behind', { force: true });
        }
        return;
    }
    void applyNowPlayingFromMaItem(item, { force: true, skipVisuals: true });
    if (!opts.skipVisualRequest) {
        requestNowPlayingVisuals('queue-sync', { force: true });
    }
}


function cacheArtUrl(item, url) {
    const key = item?.uri || item?.path || item?.item_id || '';
    if (key && url) {
        state.artUrlCache.set(key, url);
        trimMapCache(state.artUrlCache, ART_URL_CACHE_MAX);
    }
}


function preloadArtImage(url, onload) {
    if (!url) return;
    const gen = state._prefetchGen;
    const img = new Image();
    const cors = artUrlCrossOrigin(url);
    if (cors) img.crossOrigin = cors;
    img.onload = () => {
        if (gen !== state._prefetchGen) return;
        if (onload) onload(img);
    };
    img.onerror = () => {
        if (cors) {
            state.artUrlsNoCors.add(url);
            const retry = new Image();
            retry.onload = () => {
                if (gen !== state._prefetchGen) return;
                if (onload) onload(retry);
            };
            retry.onerror = () => {};
            retry.src = url;
            return;
        }
    };
    img.src = url;
}


function prefetchThemeFromImage(img, url) {
    const key = accentCacheKey(url);
    if (!key || state.themePrefetchCache.has(key)) return;
    const theme = extractThemeFromImage(img);
    if (!theme) return;
    storeThemeCache(url, theme);
}


async function maybePrefetchNextTrack() {
    if (state._prefetchInFlight || !state.isPlaying || isNowPlayingRadio() || state.duration <= 0 || !maClient.queueId) return;
    const remaining = state.duration - state.currentPos;
    if (remaining <= 0 || remaining > PREFETCH_LEAD_MS) return;
    const idx = npH('getQueueCurrentIndex');
    const prefetchKey = `${maClient.queueId}:${idx + 1}`;
    if (state._prefetchQueueKey === prefetchKey) return;
    state._prefetchInFlight = true;
    try {
        await maClient.ensureReady();
        const items = await maClient.fetchQueueItems(idx + 1, 1);
        const next = items[0];
        if (!next) return;
        state._prefetchQueueKey = prefetchKey;
        const media = next.media_item || next;
        const art = await fetchMaArtUrl(media);
        if (art) {
            preloadArtImage(art, (img) => prefetchThemeFromImage(img, art));
        }
    } catch (err) {
        /* ignore prefetch errors */
    } finally {
        state._prefetchInFlight = false;
    }
}


function syncBgLayerBlurFallback(cssBlurFallback) {
    Object.values(bgLayers).forEach((el) => {
        if (el) el.classList.toggle('bg-css-blur', !!cssBlurFallback);
    });
}


function crossfadeBackground(bgImage, opts = {}) {
    if (!bgImage || bgImage === state._bgLastCrossfadeImage) return;
    clearTimeout(state._bgCrossfadeTimer);
    const prevKey = state.activeBgLayer;
    const nextKey = prevKey === 'a' ? 'b' : 'a';
    const nextEl = bgLayers[nextKey];
    const curEl = bgLayers[prevKey];
    state._bgOutgoingLayer = prevKey;
    state._bgLastCrossfadeImage = bgImage;
    nextEl.style.backgroundImage = bgImage;
    nextEl.classList.toggle('bg-css-blur', !!opts.cssBlurFallback);
    nextEl.style.zIndex = '2';
    curEl.style.zIndex = '1';
    const curVisible = curEl.classList.contains('visible') && curEl.style.backgroundImage;
    nextEl.classList.add('visible');
    void nextEl.offsetWidth;
    if (curVisible) {
        curEl.classList.remove('visible');
    }
    state.activeBgLayer = nextKey;
    state._bgCrossfadeTimer = setTimeout(() => {
        curEl.classList.remove('visible');
        curEl.classList.remove('bg-css-blur');
        curEl.style.backgroundImage = '';
        curEl.style.zIndex = '';
        nextEl.style.zIndex = '';
        if (state._bgOutgoingLayer === prevKey) state._bgOutgoingLayer = null;
    }, THEME_TRANSITION_MS + 50);
}


function setBackgroundArt(bgImage, opts = {}) {
    if (opts.inPlace && bgLayers[state.activeBgLayer]) {
        state._bgLastCrossfadeImage = bgImage;
        bgLayers[state.activeBgLayer].style.backgroundImage = bgImage;
        bgLayers[state.activeBgLayer].classList.toggle('bg-css-blur', !!opts.cssBlurFallback);
        if (!bgLayers[state.activeBgLayer].classList.contains('visible')) {
            bgLayers[state.activeBgLayer].classList.add('visible');
        }
        return;
    }
    crossfadeBackground(bgImage, opts);
}


async function applyNowPlayingFromMaItem(queueItem, opts = {}) {
    const media = queueItem?.media_item || queueItem;
    if (!media) return;
    const itemKey = opts.trackKeyOverride || getNowPlayingItemKey(queueItem);
    if (maItemBehindSendspin(itemKey)) {
        if (state.queuePanelOpen) npH('syncQueuePlayingHighlight');
        requestNowPlayingVisuals('ma-item-behind', { force: true });
        return;
    }
    if (!opts.force && itemKey && itemKey === state.lastNowPlayingKey) {
        return;
    }
    const gen = ++state._nowPlayingGeneration;
    state.lastNowPlayingKey = itemKey;

    const spinForTitle = isSendspinMetadataStale(state.lastSendspinMetadata)
        ? null : state.lastSendspinMetadata;
    let displayTitle = npH('pickDisplayTitle', media, queueItem, spinForTitle);
    let subtitle = '';
    if (npH('isAudiobookItem', media)) {
        subtitle = npH('pickAudiobookAuthor', media);
        if (!subtitle) subtitle = await npH('enrichAudiobookAuthor', media);
    } else if (isRadioMedia(media)) {
        npH('onRadioStationUriChanged', media);
        const radioNp = npH('resolveRadioNowPlaying', 
            npH('maQueueHasRadioStreamMeta', queueItem) ? null : state.lastSendspinMetadata,
            media,
            queueItem,
        );
        displayTitle = radioNp.title;
        subtitle = radioNp.subtitle;
        if (!radioNp.hasTrackMeta) {
            if (!subtitle) subtitle = await npH('enrichRadioSubtitle', media);
            else npH('setRadioStationFallback', media, subtitle);
        }
        state.lastPodcastShowSubtitle = '';
    } else if (npH('isPodcastEpisode', media)) {
        subtitle = npH('pickPodcastName', media);
        if (!subtitle) subtitle = await npH('enrichPodcastName', media);
        if (subtitle) state.lastPodcastShowSubtitle = subtitle;
    } else {
        const artistMedia = await npH('enrichTrackArtistMetadata', media);
        subtitle = npH('nowPlayingArtist', artistMedia);
        if (!npH('isPodcastEpisode', media)) state.lastPodcastShowSubtitle = '';
    }
    if (gen !== state._nowPlayingGeneration) return;
    setSongTitle(displayTitle);
    if (subtitle) {
        setArtistLine(subtitle);
    } else if (!npH('isPodcastEpisode', media) && !isRadioMedia(media)) {
        setArtistLine('Music Assistant');
    }
    let albumMedia = media;
    if (!isRadioMedia(media)) {
        albumMedia = await enrichNowPlayingAlbumMedia(media);
    }
    if (gen !== state._nowPlayingGeneration) return;
    setAlbumLine(formatNowPlayingAlbumLine(albumMedia));
    commitNpTextTrack(itemKey);

    if (isRadioMedia(media)) {
        updateProgressUI(0, 0);
    } else if (itemKey && !trackKeysEquivalent(itemKey, state.lastProgressTrackId, queueItem)) {
        state.lastProgressTrackId = itemKey || '';
        if (!npH('getIsSeeking') && !npH('isSeekAuthorityActive')) {
            markProgressSpinGuard();
            anchorProgress(0, state.progressAnchorSpeed || 1);
            updateProgressUI(0, resolveTrackDurationMs(state.lastSendspinMetadata, queueItem));
            resetTrackProgressFromSources(state.lastSendspinMetadata, { trackChanged: true });
        }
    } else if (isSendspinProgressAuthority()) {
        /* progress owned by Sendspin while MA queue lags on same track */
    } else if (itemKey && trackKeysEquivalent(itemKey, state.lastProgressTrackId, queueItem)) {
        const durMs = resolveTrackDurationMs(state.lastSendspinMetadata, queueItem);
        if (durMs > 0 && state.duration !== durMs) {
            updateProgressUI(state.currentPos, durMs);
        }
    } else {
        state.lastProgressTrackId = itemKey || '';
        if (!npH('getIsSeeking') && !npH('isSeekAuthorityActive')) {
            markProgressSpinGuard();
            anchorProgress(0, state.progressAnchorSpeed || 1);
            updateProgressUI(0, resolveTrackDurationMs(state.lastSendspinMetadata, queueItem));
            resetTrackProgressFromSources(state.lastSendspinMetadata, { trackChanged: true });
        }
    }
    npH('syncIdleProgressVisibility');
    npH('refreshLyricsForQueueItem', queueItem, itemKey);
    void npH('refreshNowPlayingTrackExtras', queueItem?.media_item || queueItem, itemKey);

    if (state.queuePanelOpen) npH('syncQueuePlayingHighlight');
    void npH('syncNavMenuState');
}


function syncProgressThumbActive() {
    const scrubbing = progressContainerEl?.classList.contains('scrubbing');
    const focused = progressSlider?.classList.contains('focused')
        || document.activeElement === progressSlider
        || (state.uiFocusZone === 'progress' && npH('isProgressFocusAvailable'));
    progressContainerEl?.classList.toggle('thumb-active', !!(scrubbing || focused));
}


function syncProgressThumbPosition(ratio) {
    if (!progressThumb) return;
    progressThumb.style.left = progressThumbLeft(ratio);
}


function anchorProgress(posMs, speed = 1) {
    state.progressAnchorMs = Math.max(0, posMs || 0);
    state.progressAnchorAt = performance.now();
    state.progressAnchorSpeed = speed > 0 ? speed : 1;
}


function getSendspinTrackProgress() {
    const progress = window.playerInstance?.trackProgress;
    if (progress && progress.durationMs > 0) return progress;
    return null;
}


function isLocalPlaybackActive() {
    return !!window.playerInstance;
}


function buildProgressAuthorityContext() {
    const m = state.lastSendspinMetadata;
    return {
        isSeeking: npH('getIsSeeking'),
        isSeekAuthorityActive: npH('isSeekAuthorityActive'),
        sendspinStale: !!m && isSendspinMetadataStale(m),
        localPlayback: isLocalPlaybackActive(),
        maQueueAuthorityActive: isMaQueueAuthorityActive(),
        recovering: false,
    };
}


function isSendspinProgressAuthority() {
    const mode = getProgressAuthorityMode(buildProgressAuthorityContext());
    logProgressAuthority(mode);
    return isSendspinAuthorityMode(mode);
}


function resolveTrackDurationMs(m, queueItem) {
    const spinProgress = getSendspinTrackProgress();
    const spinDur = m?.progress?.track_duration || 0;
    const playerDur = spinProgress?.durationMs || 0;
    const staleAuth = isSendspinProgressAuthority();
    if (staleAuth) {
        if (playerDur > 0) return playerDur;
        if (spinDur > 0) return spinDur;
        return 0;
    }
    const item = queueItem || maClient.activeQueue?.current_item;
    const media = item?.media_item || item;
    const maDur = Number(item?.duration ?? media?.duration ?? 0) * 1000;
    if (playerDur > 0) return playerDur;
    if (spinDur > 0) return spinDur;
    if (maDur > 0) return maDur;
    return state.duration;
}


function isNearTrackEnd(posMs) {
    return state.duration > 0 && posMs >= state.duration - PROGRESS_END_CLAMP_MS * 4;
}


function markProgressSpinGuard() {
    state.progressSpinGuardUntil = Date.now() + 8000;
}


function shouldIgnoreSendspinProgress(spin) {
    if (!spin || Date.now() >= state.progressSpinGuardUntil) return false;
    if (state.currentPos < 8000 && spin.positionMs > 8000) return true;
    return false;
}


function isSuspiciousProgressReset(incomingMs, opts = {}) {
    const cur = opts.currentMs ?? state.currentPos;
    if (opts.trackChanged || opts.allowRestart) return false;
    if (!state.isPlaying && !opts.allowWhenPaused) return false;
    if (incomingMs >= cur - PROGRESS_SOFT_DRIFT_MS) return false;
    if (incomingMs < 3000 && isNearTrackEnd(cur)) return false;
    const nearZero = incomingMs < 3000;
    const wasFar = cur > 3000;
    if (nearZero && wasFar) return true;
    return cur - incomingMs >= PROGRESS_HARD_RESYNC_MS;
}


function isRepeatOneLoopRestart(incomingMs, opts = {}) {
    const cur = opts.currentMs ?? state.seekAuthorityMs ?? state.currentPos;
    return incomingMs < 3000 && isNearTrackEnd(cur);
}

function shouldRejectIncomingProgress(incomingMs, opts = {}) {
    if (npH('isSeekAuthorityActive')) {
        if (isRepeatOneLoopRestart(incomingMs, opts)) {
            npH('clearSeekAuthority');
            return false;
        }
        const authMs = state.seekAuthorityMs ?? 0;
        if (Math.abs(incomingMs - authMs) <= PROGRESS_HARD_RESYNC_MS) {
            npH('releaseSeekAuthorityIfMatched', incomingMs);
            return npH('isSeekAuthorityActive');
        }
        return true;
    }
    return isSuspiciousProgressReset(incomingMs, opts);
}


function resetTrackProgressFromSources(m, opts = {}) {
    const staleAuth = isSendspinProgressAuthority();
    const queueItem = staleAuth ? null : maClient.activeQueue?.current_item;
    const spin = getSendspinTrackProgress();
    const durMs = resolveTrackDurationMs(m, queueItem);
    let posMs = spin?.positionMs ?? m?.progress?.track_progress ?? 0;

    if (opts.trackChanged) {
        state.seekAuthorityUntil = 0;
        state.seekAuthorityMs = 0;
        state.progressSpinGuardUntil = 0;
        posMs = 0;
        if (!staleAuth) {
            const maPos = getMaQueueProgress()?.positionMs;
            if (maPos != null && maPos >= 0 && maPos < 5000) {
                posMs = maPos;
            }
        }
    } else if (shouldRejectIncomingProgress(posMs)) {
        if (durMs > 0 && state.duration !== durMs) {
            updateProgressUI(state.currentPos, durMs);
        }
        return;
    }

    const speed = spin?.playbackSpeed ?? ((m?.progress?.playback_speed || 1000) / 1000);
    state.progressResyncAt = 0;
    anchorProgress(posMs, speed);
    state.progressResyncAt = performance.now();
    updateProgressUI(posMs, durMs);
}


function clampProgressAtTrackEnd() {
    if (state.duration > 0 && state.currentPos >= state.duration - PROGRESS_END_CLAMP_MS) {
        updateProgressUI(state.duration, state.duration);
        anchorProgress(state.duration, state.progressAnchorSpeed);
    }
}


function getDisplayProgress() {
    if (npH('isSeekAuthorityActive')) {
        const now = performance.now();
        const elapsed = now - state.progressAnchorAt;
        const posMs = Math.min(
            state.duration,
            Math.max(0, state.seekAuthorityMs + elapsed * state.progressAnchorSpeed),
        );
        return {
            positionMs: posMs,
            durationMs: state.duration,
            playbackSpeed: state.progressAnchorSpeed,
        };
    }

    const target = getExtrapolatedProgress();
    const now = performance.now();

    if (!target || target.durationMs <= 0) {
        if (shouldExtrapolateProgress() && state.progressAnchorAt > 0 && state.duration > 0) {
            const elapsed = now - state.progressAnchorAt;
            const posMs = Math.min(
                state.duration,
                Math.max(0, state.progressAnchorMs + elapsed * state.progressAnchorSpeed),
            );
            return { positionMs: posMs, durationMs: state.duration, playbackSpeed: state.progressAnchorSpeed };
        }
        return null;
    }

    const durMs = target.durationMs;

    if (shouldExtrapolateProgress()) {
        if (state.progressAnchorAt === 0) {
            anchorProgress(target.positionMs, target.playbackSpeed || 1);
            state.progressResyncAt = now;
        }
        const elapsed = now - state.progressAnchorAt;
        let posMs = Math.min(
            durMs,
            Math.max(0, state.progressAnchorMs + elapsed * state.progressAnchorSpeed),
        );
        const targetPos = target.positionMs;
        const drift = targetPos - posMs;
        if (Math.abs(drift) >= PROGRESS_HARD_RESYNC_MS) {
            if (!shouldRejectIncomingProgress(targetPos, { currentMs: posMs })) {
                posMs = targetPos;
                anchorProgress(posMs, target.playbackSpeed || 1);
                state.progressResyncAt = now;
            }
        } else if (Math.abs(drift) > PROGRESS_SOFT_DRIFT_MS) {
            const catchRate = drift > 0
                ? PROGRESS_SOFT_CATCHUP_RATE * 1.8
                : PROGRESS_SOFT_CATCHUP_RATE;
            posMs += drift * catchRate;
            state.progressAnchorMs = posMs;
            state.progressAnchorAt = now;
        }
        return { positionMs: posMs, durationMs: durMs, playbackSpeed: state.progressAnchorSpeed };
    }

    if (state.progressAnchorAt > 0) {
        return {
            positionMs: state.progressAnchorMs,
            durationMs: durMs || state.duration,
            playbackSpeed: state.progressAnchorSpeed,
        };
    }
    if (Math.abs(target.positionMs - state.currentPos) >= PROGRESS_HARD_RESYNC_MS
        && !shouldRejectIncomingProgress(target.positionMs)) {
        return {
            positionMs: target.positionMs,
            durationMs: durMs,
            playbackSpeed: target.playbackSpeed || 1,
        };
    }
    return {
        positionMs: state.currentPos,
        durationMs: durMs || state.duration,
        playbackSpeed: state.progressAnchorSpeed || target.playbackSpeed || 1,
    };
}


function updateProgressUI(posMs, durMs) {
    state.currentPos = Math.max(0, posMs || 0);
    state.duration = Math.max(0, durMs || 0);
    timeCurrent.innerText = formatTime(state.currentPos);
    timeTotal.innerText = state.duration > 0 ? formatTime(state.duration) : '--:--';
    const ratio = state.duration > 0 ? Math.min(1, state.currentPos / state.duration) : 0;
    const pct = progressFillWidth(ratio);
    progressBar.style.width = pct;
    syncProgressThumbPosition(ratio);
    idleProgressBar.style.width = state.duration > 0
        ? `${Math.min(100, ratio * 100)}%`
        : '0%';
    if (progressSlider) {
        const seekable = npH('isSeekable');
        progressSlider.disabled = !seekable;
        if (seekable && state.duration > 0 && !npH('getIsSeeking')) {
            progressSlider.value = String(Math.round((state.currentPos / state.duration) * 1000));
        }
    }
    npH('syncProgressSeekableChrome');
    npH('syncAndroidMediaSession');
    npH('syncLyricsProgress', state.currentPos);
    if (!npH('isMainProgressVisible') && !npH('isOverlayMenuOpen')) {
        npH('scheduleIdleProgressVisibilitySync');
    }
}


function getExtrapolatedProgress() {
    const spin = getSendspinTrackProgress();
    if (isSendspinProgressAuthority()) {
        const m = state.lastSendspinMetadata;
        if (m && isSendspinMetadataStale(m) && spin && isNearTrackEnd(spin.positionMs)) {
            const spinKey = sendspinIdentityKey(m);
            const queueItem = maClient.activeQueue?.current_item;
            if (spinKey && state.lastProgressTrackId
                && !trackKeysEquivalent(spinKey, state.lastProgressTrackId, queueItem)) {
                const durMs = m.progress?.track_duration || spin.durationMs || 0;
                const posMs = Math.min(
                    m.progress?.track_progress ?? 0,
                    durMs > 0 ? durMs : Number.MAX_SAFE_INTEGER,
                );
                return {
                    positionMs: posMs,
                    durationMs: durMs || spin.durationMs,
                    playbackSpeed: spin.playbackSpeed,
                };
            }
        }
        if (spin && !shouldIgnoreSendspinProgress(spin)) return spin;
        return spin || null;
    }
    const ma = getMaQueueProgress();
    if (spin && shouldIgnoreSendspinProgress(spin)) {
        return ma || null;
    }
    if (spin && isMaQueueClockRunning()) {
        if (!ma) return spin;
        const drift = Math.abs(spin.positionMs - ma.positionMs);
        if (drift < PROGRESS_SOFT_DRIFT_MS) return spin;
        if (drift < PROGRESS_HARD_RESYNC_MS) {
            const spinCloser = Math.abs(spin.positionMs - state.currentPos)
                <= Math.abs(ma.positionMs - state.currentPos);
            return spinCloser ? spin : ma;
        }
        const spinStaleStart = spin.positionMs < 3000 && ma.positionMs > 3000;
        const maCloser = Math.abs(ma.positionMs - state.currentPos)
            <= Math.abs(spin.positionMs - state.currentPos);
        if (spinStaleStart || maCloser) return ma;
        return spin;
    }
    if (spin) return spin;
    return ma;
}


function resolvePlaybackResumePosition() {
    const spin = getSendspinTrackProgress();
    const ma = getMaQueueProgress();
    const speed = spin?.playbackSpeed || ma?.playbackSpeed || state.progressAnchorSpeed || 1;
    if (isSendspinProgressAuthority()) {
        const m = state.lastSendspinMetadata;
        const queueItem = maClient.activeQueue?.current_item;
        if (m && isSendspinMetadataStale(m)) {
            const spinKey = sendspinIdentityKey(m);
            const maKey = getNowPlayingItemKey(queueItem, m);
            if (spinKey && maKey && !trackKeysEquivalent(spinKey, maKey, queueItem)) {
                const metaPos = m.progress?.track_progress ?? spin?.positionMs ?? 0;
                if (metaPos < state.currentPos - PROGRESS_SOFT_DRIFT_MS || isNearTrackEnd(state.currentPos)) {
                    return { positionMs: metaPos, playbackSpeed: speed };
                }
            }
            if (spin && isNearTrackEnd(spin.positionMs) && isNearTrackEnd(state.currentPos)) {
                return { positionMs: state.currentPos, playbackSpeed: speed };
            }
        }
        if (spin) return { positionMs: spin.positionMs, playbackSpeed: speed };
        return { positionMs: state.currentPos, playbackSpeed: speed };
    }
    let resumePos = state.currentPos;
    const source = (spin && ma && Math.abs(spin.positionMs - ma.positionMs) >= PROGRESS_HARD_RESYNC_MS)
        ? ma
        : (spin || ma);
    if (source) {
        const drift = Math.abs(source.positionMs - state.currentPos);
        const loopFromEnd = isNearTrackEnd(state.currentPos) && source.positionMs < 3000;
        const staleStreamStart = source.positionMs < 3000 && state.currentPos > 3000;
        if (loopFromEnd) {
            resumePos = source.positionMs;
        } else if (!staleStreamStart && drift < PROGRESS_HARD_RESYNC_MS) {
            resumePos = source.positionMs;
        } else if (staleStreamStart && ma && ma.positionMs < state.currentPos - PROGRESS_SOFT_DRIFT_MS) {
            resumePos = ma.positionMs;
        }
    }
    return { positionMs: resumePos, playbackSpeed: speed };
}


function syncProgressOnStreamStart(streamGen) {
    if (npH('getIsSeeking')) return;
    const genChanged = streamGen != null && streamGen !== state.lastSendspinStreamGen;
    if (streamGen != null) {
        if (!genChanged) {
            // same stream generation — fall through to drift correction below
        } else {
            state.lastSendspinStreamGen = streamGen;
        }
    }

    const m = state.lastSendspinMetadata;
    const spin = getSendspinTrackProgress();
    const ma = getMaQueueProgress();

    if (genChanged) {
        state.progressSpinGuardUntil = 0;
        const queueItem = maClient.activeQueue?.current_item;
        const trackKey = resolveTrackKey(m, queueItem);
        rememberSendspinTrackKey(m);
        const durMs = spin?.durationMs || resolveTrackDurationMs(m, queueItem);
        const speed = spin?.playbackSpeed ?? state.progressAnchorSpeed ?? 1;
        let posMs = 0;
        if (state.currentPos <= 3000) {
            posMs = spin?.positionMs ?? m?.progress?.track_progress ?? 0;
        }
        if (!isSendspinProgressAuthority()) {
            const maPos = ma?.positionMs;
            if (maPos != null && maPos >= 0 && maPos < 5000) {
                posMs = maPos;
            } else if (state.currentPos > 3000) {
                posMs = 0;
            }
        } else if (state.currentPos > 3000) {
            posMs = 0;
        }
        if (trackKey) {
            state.lastProgressTrackId = trackKey;
            state.lastNowPlayingKey = trackKey;
            commitNpTextTrack(trackKey);
        }
        if (npH('isSeekAuthorityActive')) npH('clearSeekAuthority');
        anchorProgress(posMs, speed);
        state.progressResyncAt = performance.now();
        updateProgressUI(posMs, durMs);
        return;
    }

    if (isSendspinProgressAuthority()) {
        if (!spin) return;
        const durMs = spin.durationMs || m?.progress?.track_duration || 0;
        const posMs = spin.positionMs;
        const speed = spin.playbackSpeed ?? state.progressAnchorSpeed ?? 1;
        anchorProgress(posMs, speed);
        state.progressResyncAt = performance.now();
        updateProgressUI(posMs, durMs);
        return;
    }

    const durMs = resolveTrackDurationMs(m);
    const posMs = ma?.positionMs ?? spin?.positionMs;
    if (posMs == null) return;
    const speed = ma?.playbackSpeed ?? spin?.playbackSpeed ?? state.progressAnchorSpeed ?? 1;
    const cur = state.currentPos;
    const loopRestart = isNearTrackEnd(cur) && posMs < 3000;
    const staleAhead = cur > 3000 && posMs < 3000;
    const significantBack = posMs < cur - PROGRESS_SOFT_DRIFT_MS;
    const spinAdvanced = sendspinTrackChanged(m);
    if (spinAdvanced || (isNearTrackEnd(cur) && staleAhead)) {
        rememberSendspinTrackKey(m);
        const trackId = sendspinIdentityKey(m) || resolveTrackKey(m, maClient.activeQueue?.current_item);
        if (trackId) {
            state.lastProgressTrackId = trackId;
            state.sendspinAuthorityKey = trackId;
        }
        state.progressSpinGuardUntil = 0;
        if (npH('isSeekAuthorityActive')) npH('clearSeekAuthority');
        const resetDur = spin?.durationMs || resolveTrackDurationMs(m);
        const resetPos = spinAdvanced ? (spin?.positionMs ?? m?.progress?.track_progress ?? 0) : 0;
        anchorProgress(resetPos, speed);
        state.progressResyncAt = performance.now();
        updateProgressUI(resetPos, resetDur || ma?.durationMs || spin?.durationMs || 0);
        return;
    }
    if (!significantBack && !loopRestart) return;
    if (shouldRejectIncomingProgress(posMs, { allowRestart: true, currentMs: cur })) {
        if (!loopRestart && !staleAhead) return;
    }
    if (loopRestart && npH('isSeekAuthorityActive')) npH('clearSeekAuthority');
    anchorProgress(posMs, speed);
    state.progressResyncAt = performance.now();
    updateProgressUI(posMs, durMs || ma?.durationMs || spin?.durationMs || 0);
}


function syncProgressFromMetadata(m, playing) {
    if (!m?.progress || isNowPlayingRadio()) return;
    if (npH('getIsSeeking')) return;

    if (sendspinTrackChanged(m)) {
        rememberSendspinTrackKey(m);
        const queueItem = maClient.activeQueue?.current_item;
        const trackId = sendspinIdentityKey(m) || resolveTrackKey(m, queueItem);
        state.sendspinAuthorityKey = trackId;
        state.lastProgressTrackId = trackId;
        state.lastNowPlayingKey = trackId;
        commitNpTextTrack(trackId);
        if (!npH('isSeekAuthorityActive')) {
            state.progressSpinGuardUntil = 0;
            resetTrackProgressFromSources(m, { trackChanged: true });
        }
        return;
    }
    rememberSendspinTrackKey(m);

    const staleAuth = isSendspinProgressAuthority();
    const spin = getSendspinTrackProgress();
    if (spin && !staleAuth && shouldIgnoreSendspinProgress(spin)) return;

    const queueItem = maClient.activeQueue?.current_item;
    const trackId = resolveTrackKey(m, queueItem);
    const trackChanged = trackId
        && !trackKeysEquivalent(trackId, state.lastProgressTrackId, queueItem);
    if (trackChanged) {
        state.lastProgressTrackId = trackId;
        if (!npH('isSeekAuthorityActive')) {
            resetTrackProgressFromSources(m, { trackChanged: true });
        }
        return;
    }

    const metaPos = spin?.positionMs ?? (m.progress.track_progress || 0);
    const speed = spin?.playbackSpeed ?? ((m.progress.playback_speed || 1000) / 1000);
    if (playing && metaPos < 3000 && isNearTrackEnd(state.currentPos)) {
        if (npH('isSeekAuthorityActive')) npH('clearSeekAuthority');
        const durMs = resolveTrackDurationMs(m);
        anchorProgress(metaPos, speed);
        state.progressResyncAt = performance.now();
        updateProgressUI(metaPos, durMs || spin?.durationMs || 0);
        return;
    }

    const durMs = resolveTrackDurationMs(m);
    if (durMs > 0 && durMs !== state.duration) {
        updateProgressUI(state.currentPos, durMs);
    }
    if (durMs <= 0 && !(m.progress.track_progress > 0)) return;

    if (!playing) return;
    if (shouldRejectIncomingProgress(metaPos)) return;
    if (Math.abs(metaPos - state.currentPos) >= PROGRESS_HARD_RESYNC_MS) {
        anchorProgress(metaPos, speed);
        state.progressResyncAt = performance.now();
        updateProgressUI(metaPos, durMs || spin?.durationMs || 0);
    }
}


function syncProgressFromSendspinAuthority() {
    if (!isSendspinProgressAuthority() || npH('getIsSeeking')) return;
    const m = state.lastSendspinMetadata;
    const spin = getSendspinTrackProgress();
    if (!spin && !m?.progress) return;
    const posMs = spin?.positionMs ?? m?.progress?.track_progress ?? state.currentPos;
    const durMs = resolveTrackDurationMs(m);
    const speed = spin?.playbackSpeed ?? ((m?.progress?.playback_speed || 1000) / 1000);
    anchorProgress(posMs, speed);
    state.progressResyncAt = performance.now();
    updateProgressUI(posMs, durMs);
}


let _lastPrefetchCheckMs = 0;
const PREFETCH_CHECK_INTERVAL_MS = 1500;

function updateProgressFromPlayer() {
    if (npH('getIsSeeking')) return;
    if (isNowPlayingRadio()) {
        updateProgressUI(0, 0);
        return;
    }
    const progress = getDisplayProgress();
    if (progress) {
        updateProgressUI(progress.positionMs, progress.durationMs);
        const now = performance.now();
        if (now - _lastPrefetchCheckMs >= PREFETCH_CHECK_INTERVAL_MS) {
            _lastPrefetchCheckMs = now;
            void maybePrefetchNextTrack();
        }
        return;
    }
    if (state.duration > 0) {
        updateProgressUI(state.currentPos, state.duration);
    }
}


function startProgressTimer() {
    if (state.progressRaf) return;
    const tick = () => {
        updateProgressFromPlayer();
        if (state.isPlaying && !npH('getIsSeeking')) {
            state.progressRaf = requestAnimationFrame(tick);
        } else {
            stopProgressTimer();
        }
    };
    state.progressRaf = requestAnimationFrame(tick);
}


function stopProgressTimer() {
    if (!state.progressRaf) return;
    cancelAnimationFrame(state.progressRaf);
    state.progressRaf = null;
}


const _bgBakeCanvas = document.createElement('canvas');

const _accentCanvas = document.createElement('canvas');

const _accentCtx = _accentCanvas.getContext('2d', { willReadFrequently: true });

let _bgBakeUrl = '';

let _bgBakeCssFallback = false;

let _bgLastBakeSource = null;

function applyBakedBgBlur(ctx, w, h, radiusPx) {
    if (radiusPx <= 0 || w <= 0 || h <= 0) return;
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext('2d');
    if (!tctx) return;
    try {
        tctx.filter = `blur(${radiusPx}px)`;
        tctx.drawImage(ctx.canvas, 0, 0);
        tctx.filter = 'none';
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(tmp, 0, 0);
        return;
    } catch {
        /* filter unsupported — downscale/upscale fallback */
    }
    const tw = Math.max(12, Math.round(w * 0.4));
    const th = Math.max(12, Math.round(h * 0.4));
    const small = document.createElement('canvas');
    small.width = tw;
    small.height = th;
    const sctx = small.getContext('2d');
    if (!sctx) return;
    sctx.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, tw, th);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(small, 0, 0, tw, th, 0, 0, w, h);
}

function rebakeBackgroundFromLastSource(opts = {}) {
    const src = _bgLastBakeSource;
    if (!src?.img) return;
    finishBackgroundBake(src.img, src.url, src.bakeKey, src.bakeGen, opts);
}

function extractThemeFromImage(img) {
    return extractAccentTheme(img, _accentCanvas, _accentCtx);
}

function finishBackgroundBake(img, url, bakeKey, bakeGen, opts = {}) {
    if (!opts.inPlace && bakeGen != null && bakeGen !== state.npVisuals.generation) return;
    if (bakeKey && bakeKey !== state.npVisuals.trackKey) return;
    const fallbackUrl = opts.fallbackUrl || url;

    if (!img?.naturalWidth) {
        _bgBakeCssFallback = true;
        setBackgroundArt(cssBackgroundUrl(fallbackUrl), {
            inPlace: !!opts.inPlace,
            cssBlurFallback: true,
        });
        return;
    }

    const vw = window.innerWidth || 1920;
    const vh = window.innerHeight || 1080;
    const scale = 0.35;
    const cw = Math.max(240, Math.round(vw * scale));
    const ch = Math.max(135, Math.round(vh * scale));
    _bgBakeCanvas.width = cw;
    _bgBakeCanvas.height = ch;
    const ctx = _bgBakeCanvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const cr = Math.max(cw / iw, ch / ih);
    const dw = iw * cr;
    const dh = ih * cr;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    applyBakedBgBlur(ctx, cw, ch, BG_BAKE_BLUR_PX);
    _bgLastBakeSource = { img, url, bakeKey, bakeGen };

    let baked = false;
    let bgImage = cssBackgroundUrl(fallbackUrl);
    try {
        bgImage = `url(${_bgBakeCanvas.toDataURL('image/jpeg', 0.65)})`;
        baked = true;
    } catch (e) { /* tainted canvas — CSS blur fallback below */ }

    if (baked) {
        _bgBakeUrl = url;
        state._bgBakeItemKey = bakeKey;
        _bgBakeCssFallback = false;
        setBackgroundArt(bgImage, { inPlace: !!opts.inPlace, cssBlurFallback: false });
        return;
    }

    _bgBakeUrl = '';
    state._bgBakeItemKey = '';
    _bgBakeCssFallback = true;
    setBackgroundArt(cssBackgroundUrl(fallbackUrl), {
        inPlace: !!opts.inPlace,
        cssBlurFallback: true,
    });
}



export {
    getTitleBaseSizeRem,
    refreshTitleLayout,
    scheduleTitleLayoutRelayout,
    setSongTitle,
    setArtistLine,
    applyIdleNowPlayingText,
    commitNpTextTrack,
    getNowPlayingItemKey,
    resolveTrackKey,
    trackKeysEquivalent,
    bumpNpVisualGeneration,
    updatePlayButtonUi,
    setAccentColors,
    requestNowPlayingVisuals,
    onMaQueueCurrentItemChanged,
    syncProgressFromMaQueue,
    syncMaNowPlayingIfChanged,
    applyNowPlayingFromMaItem,
    isRadioMedia,
    isNowPlayingRadio,
    isSendspinMetadataStale,
    cancelPrefetch,
    fetchMaArtUrl,
    cacheArtUrl,
    trimMapCache,
    artUrlCrossOrigin,
    updateProgressUI,
    anchorProgress,
    resetTrackProgressFromSources,
    getDisplayProgress,
    updateProgressFromPlayer,
    startProgressTimer,
    stopProgressTimer,
  syncProgressFromMetadata,
  syncProgressFromSendspinAuthority,
  syncProgressOnStreamStart,
    resolvePlaybackResumePosition,
    syncProgressThumbActive,
    syncProgressThumbPosition,
    rebakeBackgroundFromLastSource,
    maybePrefetchNextTrack,
    clampProgressAtTrackEnd,
    getMaQueueProgress,
    queueItemMatchesAuthority,
    maItemBehindSendspin,
    syncFocusAccentColors,
    getSendspinTrackProgress,
};
