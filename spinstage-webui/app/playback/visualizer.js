/**
 * Audio spectrum visualizer for the player stage background.
 */
import { parseCssColor } from '../util/color.js';
import {
  VIZ_BAR_COUNT_KEY,
  VIZ_BAR_COUNT_DEFAULT_WEBOS,
  VIZ_BAR_COUNT_DEFAULT_ANDROID,
  VIZ_BAR_COUNT_DEFAULT_WEBUI,
  VIZ_BAR_COUNT_MIN,
  VIZ_BAR_COUNT_MAX,
  DISABLE_VISUALIZER_KEY,
  VIZ_MODE_KEY,
  VIZ_MODES_STACK_KEY,
  VIZ_SHUFFLE_KEY,
  VIZ_SELECTION_MODE_KEY,
  VIZ_POOL_KEY,
  VIZ_CYCLE_INDEX_KEY,
  VIZ_FPS_KEY,
  VIZ_FPS_NOTCHES,
  VIZ_FPS_DEFAULT_WEBOS,
  VIZ_FPS_DEFAULT_ANDROID,
  VIZ_FPS_DEFAULT_WEBUI,
  VIZ_MODE_DEFAULT,
  VIZ_MODES,
  VIZ_MODES_STACK_MAX,
  IS_ANDROID,
  IS_TIZEN,
  IS_TV_REMOTE,
  THEME_TRANSITION_MS,
} from '../constants.js';

/** Matches #viz-canvas CSS filter in base.css; applied via ctx.filter on Tizen. */
const TIZEN_VIZ_DRAW_FILTER = 'blur(24px) brightness(1.15) saturate(1.25)';

export { VIZ_MODES };

export function getDefaultVizBarCount() {
    if (IS_ANDROID) return VIZ_BAR_COUNT_DEFAULT_ANDROID;
    if (IS_TV_REMOTE) return VIZ_BAR_COUNT_DEFAULT_WEBOS;
    return VIZ_BAR_COUNT_DEFAULT_WEBUI;
}

export function normalizeVizBarCount(value) {
    let n = Math.round(Number(value));
    if (!Number.isFinite(n)) n = getDefaultVizBarCount();
    n = Math.max(VIZ_BAR_COUNT_MIN, Math.min(VIZ_BAR_COUNT_MAX, n));
    if (n % 2 === 0) n += n >= VIZ_BAR_COUNT_MAX ? -1 : 1;
    return n;
}

export function getVizBarCount() {
    const raw = localStorage.getItem(VIZ_BAR_COUNT_KEY);
    if (raw == null || raw === '') {
        const n = getDefaultVizBarCount();
        localStorage.setItem(VIZ_BAR_COUNT_KEY, String(n));
        return n;
    }
    return normalizeVizBarCount(raw);
}

export function getDisableVisualizer() {
    return localStorage.getItem(DISABLE_VISUALIZER_KEY) === '1';
}

export function normalizeVizMode(mode) {
    const id = String(mode || '').trim();
    if (id === 'terrain' || id === 'wave' || id === 'aurora' || id === 'beam' || id === 'contours' || id === 'blob' || id === 'spire' || id === 'burst' || id === 'lattice') {
        return VIZ_MODE_DEFAULT;
    }
    return VIZ_MODES.some((m) => m.id === id) ? id : VIZ_MODE_DEFAULT;
}

export function normalizeVizModesStack(modes) {
    const list = Array.isArray(modes) ? modes : [modes];
    const out = [];
    for (const entry of list) {
        const id = normalizeVizMode(entry);
        if (!out.includes(id)) out.push(id);
        if (out.length >= VIZ_MODES_STACK_MAX) break;
    }
    if (!out.length) out.push(VIZ_MODE_DEFAULT);
    return out;
}

export function getVizModes() {
    const rawStack = localStorage.getItem(VIZ_MODES_STACK_KEY);
    if (rawStack) {
        try {
            const parsed = JSON.parse(rawStack);
            const stack = normalizeVizModesStack(parsed);
            if (rawStack !== JSON.stringify(stack)) setVizModesStorage(stack);
            return stack;
        } catch {
            /* fall through to legacy key */
        }
    }
    const raw = localStorage.getItem(VIZ_MODE_KEY) || VIZ_MODE_DEFAULT;
    const id = normalizeVizMode(raw);
    const stack = [id];
    setVizModesStorage(stack);
    return stack;
}

export function getVizMode() {
    return getVizModes()[0];
}

export function setVizModesStorage(modes) {
    const stack = normalizeVizModesStack(modes);
    localStorage.setItem(VIZ_MODES_STACK_KEY, JSON.stringify(stack));
    localStorage.setItem(VIZ_MODE_KEY, stack[0]);
    return stack;
}

export function setVizModeStorage(mode) {
    return setVizModesStorage([mode]);
}

export function toggleVizModeInStack(modeId) {
    const id = normalizeVizMode(modeId);
    let stack = getVizModes();
    const idx = stack.indexOf(id);
    if (idx >= 0) {
        if (stack.length <= 1) return stack;
        stack = stack.filter((m) => m !== id);
    } else {
        stack = [...stack, id];
        if (stack.length > VIZ_MODES_STACK_MAX) stack = stack.slice(-VIZ_MODES_STACK_MAX);
    }
    return setVizModesStorage(stack);
}

export function vizModeUsesBarResolution(modes = getVizModes()) {
    const barMapped = new Set([
        'horizon', 'rise', 'columns', 'ring', 'hall', 'scope',
    ]);
    const list = Array.isArray(modes) ? modes : [modes];
    return list.some((m) => barMapped.has(normalizeVizMode(m)));
}

export function getVizResolutionLabel() {
    return 'Bar resolution';
}

export function getVizShuffle() {
    return getVizSelectionMode() === 'shuffle';
}

export function setVizShuffleStorage(enabled) {
    localStorage.setItem(VIZ_SHUFFLE_KEY, enabled ? '1' : '0');
}

function defaultVizPoolRecord() {
    return Object.fromEntries(VIZ_MODES.map((m) => [m.id, true]));
}

function normalizeVizPool(raw) {
    const base = defaultVizPoolRecord();
    if (!raw || typeof raw !== 'object') return base;
    for (const mode of VIZ_MODES) {
        if (typeof raw[mode.id] === 'boolean') base[mode.id] = raw[mode.id];
    }
    return base;
}

export function migrateVizSelectionPreference() {
    if (localStorage.getItem(VIZ_SELECTION_MODE_KEY)) return;
    if (localStorage.getItem(VIZ_SHUFFLE_KEY) === '1') {
        localStorage.setItem(VIZ_SELECTION_MODE_KEY, 'shuffle');
    } else {
        const stack = getVizModes();
        localStorage.setItem(VIZ_SELECTION_MODE_KEY, stack.length >= 2 ? 'dual' : 'single');
    }
    if (!localStorage.getItem(VIZ_POOL_KEY)) {
        localStorage.setItem(VIZ_POOL_KEY, JSON.stringify(defaultVizPoolRecord()));
    }
}

export function getVizSelectionMode() {
    migrateVizSelectionPreference();
    const raw = localStorage.getItem(VIZ_SELECTION_MODE_KEY);
    if (raw === 'shuffle' || raw === 'cycle' || raw === 'dual' || raw === 'single') return raw;
    return 'single';
}

export function getVizPool() {
    migrateVizSelectionPreference();
    try {
        const raw = localStorage.getItem(VIZ_POOL_KEY);
        if (!raw) return defaultVizPoolRecord();
        return normalizeVizPool(JSON.parse(raw));
    } catch {
        return defaultVizPoolRecord();
    }
}

function setVizPoolStorage(pool) {
    localStorage.setItem(VIZ_POOL_KEY, JSON.stringify(normalizeVizPool(pool)));
}

export function isVizPoolEnabled(modeId) {
    return getVizPool()[normalizeVizMode(modeId)] !== false;
}

export function getEnabledVizPool() {
    return VIZ_MODES.filter((m) => isVizPoolEnabled(m.id)).map((m) => m.id);
}

export function enableAllVizPool() {
    setVizPoolStorage(defaultVizPoolRecord());
}

export function isVizModeActiveInUi(modeId) {
    const id = normalizeVizMode(modeId);
    const selMode = getVizSelectionMode();
    if (selMode === 'single' || selMode === 'dual') return getVizModes().includes(id);
    return isVizPoolEnabled(id);
}

export function getDefaultVizFps() {
    if (IS_TV_REMOTE) return VIZ_FPS_DEFAULT_WEBOS;
    if (IS_ANDROID) return VIZ_FPS_DEFAULT_ANDROID;
    return VIZ_FPS_DEFAULT_WEBUI;
}

export function normalizeVizFps(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return getDefaultVizFps();
    let best = VIZ_FPS_NOTCHES[0];
    let bestDist = Math.abs(n - best);
    for (const notch of VIZ_FPS_NOTCHES) {
        const dist = Math.abs(n - notch);
        if (dist < bestDist) {
            best = notch;
            bestDist = dist;
        }
    }
    return best;
}

export function getVizFpsNotchIndex(fps = getVizFps()) {
    const idx = VIZ_FPS_NOTCHES.indexOf(normalizeVizFps(fps));
    return idx >= 0 ? idx : VIZ_FPS_NOTCHES.indexOf(getDefaultVizFps());
}

export function getVizFps() {
    const raw = localStorage.getItem(VIZ_FPS_KEY);
    if (raw == null || raw === '') return getDefaultVizFps();
    return normalizeVizFps(raw);
}

export function setVizFps(value) {
    const fps = normalizeVizFps(value);
    localStorage.setItem(VIZ_FPS_KEY, String(fps));
    getVisualizer()?.setFrameRate(fps);
    return fps;
}

export function adjustVizFps(deltaNotches) {
    const idx = getVizFpsNotchIndex();
    const next = Math.max(0, Math.min(VIZ_FPS_NOTCHES.length - 1, idx + deltaNotches));
    return setVizFps(VIZ_FPS_NOTCHES[next]);
}

export function setVizFpsByNotchIndex(index) {
    const idx = Math.max(0, Math.min(VIZ_FPS_NOTCHES.length - 1, Math.round(Number(index))));
    return setVizFps(VIZ_FPS_NOTCHES[idx]);
}

export function setVizSelectionMode(mode) {
    migrateVizSelectionPreference();
    const current = getVizSelectionMode();
    let next = mode;
    if (mode === current && mode !== 'single') next = 'single';
    localStorage.setItem(VIZ_SELECTION_MODE_KEY, next);
    setVizShuffleStorage(next === 'shuffle');
    const viz = getVisualizer();
    if (next === 'shuffle') {
        enableAllVizPool();
        resetVizShuffleTrackKey();
        pickRandomVizMode({ initial: true });
    } else if (next === 'cycle') {
        enableAllVizPool();
        resetVizCycleTrackKey();
        applyCycleViz({ initial: true });
    } else if (next === 'dual') {
        let stack = getVizModes();
        if (stack.length < 2) {
            const extras = VIZ_MODES.map((m) => m.id).filter((id) => !stack.includes(id));
            stack = [...stack, ...extras].slice(0, 2);
            if (!stack.length) stack = VIZ_MODES.slice(0, 2).map((m) => m.id);
            setVizModesStorage(stack);
        }
        if (viz) {
            viz._shuffleMode = null;
            viz.setModes(stack, { fromShuffle: true, fade: false });
        }
    } else {
        const stack = getVizModes();
        const single = [stack[0] || VIZ_MODE_DEFAULT];
        setVizModesStorage(single);
        if (viz) {
            viz._shuffleMode = null;
            viz.setModes(single, { fromShuffle: true, fade: false });
        }
    }
    return next;
}

export function toggleVizModeSelection(modeId) {
    const id = normalizeVizMode(modeId);
    const selMode = getVizSelectionMode();
    const viz = getVisualizer();

    if (selMode === 'single') {
        setVizModesStorage([id]);
        if (viz) viz._shuffleMode = null;
        viz?.setModes([id], { fromShuffle: true, fade: false });
        return getVizModes();
    }

    if (selMode === 'dual') {
        let stack = getVizModes();
        const idx = stack.indexOf(id);
        if (idx >= 0) {
            if (stack.length <= 1) return stack;
            stack = stack.filter((m) => m !== id);
        } else {
            stack = [...stack, id];
            if (stack.length > 2) stack = stack.slice(-2);
        }
        setVizModesStorage(stack);
        if (viz) viz._shuffleMode = null;
        viz?.setModes(stack, { fromShuffle: true, fade: false });
        return stack;
    }

    const pool = getVizPool();
    const enabled = getEnabledVizPool();
    const wasEnabled = pool[id] !== false;
    if (wasEnabled && enabled.length <= 1) return enabled;
    pool[id] = !wasEnabled;
    setVizPoolStorage(pool);
    const current = viz?._shuffleMode || viz?.mode;
    if (viz && current === id && !isVizPoolEnabled(id)) {
        if (selMode === 'shuffle') pickRandomVizMode();
        else applyCycleViz({ initial: true });
    }
    return getEnabledVizPool();
}

const VIZ_CFG = {
    minDecibels: -85,
    maxDecibels: -22,
    minHz: 20,
    maxHz: 14000,
    fftSize: 512,
    fftSmoothing: 0.63,
    barRiseSpeed: 0.75,
    barFallSpeed: 0.9,
    bassFreqWarp: 0.39,
    bassHeightBlend: 0.45,
    bassHeightBlendWidth: 0.45,
    barCap: 1,
    edgeFadeWidth: 0.15,
    edgeMinScale: 0.52,
    centerFadeWidth: 0.1,
    centerMinScale: 0.85,
    maxBarHeightRatio: 0.4025,
    riseMaxHeightRatio: 0.442,
};

/** Spatial sine step (radians per bar from center); lower = wider waves, fewer humps. */
const AMBIENT_SPATIAL_STEP = 0.175;

/** Idle ambient phase advance per render frame (~24fps). */
const AMBIENT_PHASE_IDLE = 0.027;
const AMBIENT_PHASE_IDLE_OFFLINE = 0.015;

const PULSE_RING_COUNT = 12;

const PARTICLE_FIELD_ROWS = 10;

const PARTICLE_FIELD_COLS = 20;

const PARTICLE_STAR_RAYS = 24;

/** Y flattening for orbit ellipse; midway between 0.38 and 0.53. */
const SOLAR_ORBIT_Y_SCALE = 0.455;

/** Planets 2, 4, 6 (indices 1, 3, 5): ~35–42% slower orbit. */
const SOLAR_PLANET_SPEED_SCALE = [1, 0.62, 1, 0.58, 1, 0.65];

const SOLAR_PLANETS = [
    { orbit: 0.54, speed: 0.275, size: 16, barT: 0.12, phase: 0.2 },
    { orbit: 0.84, speed: 0.2, size: 20, barT: 0.28, phase: 1.4 },
    { orbit: 1.14, speed: 0.16, size: 32, barT: 0.44, phase: 2.8 },
    { orbit: 1.44, speed: 0.125, size: 22, barT: 0.58, phase: 4.1 },
    { orbit: 1.74, speed: 0.09, size: 47, barT: 0.72, phase: 5.5 },
    { orbit: 2.04, speed: 0.065, size: 18, barT: 0.86, phase: 0.9 },
];

const HALL_ECHO_MS = 125;

const HALL_ECHO_MAX = 24;

const HALL_ECHO_SHIFT = 90;

const HALL_ECHO_LIFE_SEC = 5.5;

/** Number of web points for the web/spider visualizer. */
const WEB_SPOKE_COUNT = 18;

/** Number of concentric rings in the web visualizer. */
const WEB_RING_COUNT = 8;

/** Number of spokes for the helix visualizer. */
const HELIX_POINT_COUNT = 96;
/** Helix scroll rate (phase units per frame). */
const HELIX_SCROLL_RATE = 0.006;

/** Number of ribbons for the cascade visualizer. */
const CASCADE_RIBBON_COUNT = 9;

class AudioVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this._ghostCanvas = document.createElement('canvas');
        this._ghostCtx = this._ghostCanvas.getContext('2d');
        this._trackOutCanvas = this._ghostCanvas;
        this._trackOutCtx = this._ghostCtx;
        this._modeFade = 0;
        this._modeFadeStart = 0;
        this._trackCrossfade = false;
        this._trackCrossfadeStart = 0;
        this._trackInMode = null;
        this._trackInPaletteLow = null;
        this._trackInPaletteHigh = null;
        this._paletteOverrideLow = null;
        this._paletteOverrideHigh = null;
        this._paletteHoldLow = null;
        this._paletteHoldHigh = null;
        this.analyser = null;
        this.dataArray = null;
        this._sampleRate = 48000;
        this._logBands = [];
        this.barCount = 37;
        this.barHeights = new Float32Array(this.barCount);
        this.modes = getVizModes();
        this.mode = this.modes[0];
        this._shuffleMode = null;
        this._hallEchoes = [];
        this._hallLastSnap = 0;
        this._scopeEchoes = [];
        this._scopeLastSnap = 0;
        this.ambientPhase = 0;
        this._helixScrollPhase = 0;
        this.blobRotation = 0;
        this._running = false;
        this._disabled = false;
        this._rafId = null;
        this._paused = false;
        this._isPlaying = false;
        this._isConnected = false;
        this._lastFrame = 0;
        this._palette = null;
        this._pausedSince = 0;
        this._PAUSE_AMBIENT_MS = 750;
        this._PLAY_RAMP_MS = 450;
        this._AUDIO_READY_THRESHOLD = 0.015;
        this._pauseSnapshot = null;
        this._resumeSnapshot = null;
        this._liveAmount = 0;
        this._glowAmount = 0;
        this._smoothedGlowMix = 0;
        this._audioReadyFrames = 0;
        this._audioOutputHoldFrames = 0;
        this._vizAnalyser = null;
        this._tapGain = null;
        this.cfg = { ...VIZ_CFG };
        this._frameInterval = 1000 / getVizFps();
        this._rebuildLogBands();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const w = window.innerWidth || 1920;
        const h = window.innerHeight || 1080;
        this.canvas.width = Math.round(w * 0.5);
        this.canvas.height = Math.round(h * 0.5);
        this.W = this.canvas.width;
        this.H = this.canvas.height;
        this._ghostCanvas.width = this.W;
        this._ghostCanvas.height = this.H;
    }

    _elementScale() {
        return IS_ANDROID ? 0.72 : 1;
    }

    _modesEqual(a, b) {
        return a.length === b.length && a.every((m, i) => m === b[i]);
    }

    setFrameRate(fps) {
        const n = normalizeVizFps(fps);
        this._frameInterval = 1000 / n;
        return n;
    }

    setModes(modes, opts = {}) {
        const selMode = getVizSelectionMode();
        if ((selMode === 'shuffle' || selMode === 'cycle') && !opts.fromShuffle) return;
        let stack = normalizeVizModesStack(modes);
        if (selMode === 'shuffle' || selMode === 'cycle' || selMode === 'single') stack = [stack[0]];
        if (this._modesEqual(stack, this.modes) && !opts.force) return;
        if (opts.fade && this.ctx && this.W > 0 && this.H > 0) {
            if (this._modeFade <= 0) {
                if (this.modes.length > 1) {
                    if (this._ghostCanvas.width !== this.W || this._ghostCanvas.height !== this.H) {
                        this._ghostCanvas.width = this.W;
                        this._ghostCanvas.height = this.H;
                    }
                    this._ghostCtx.drawImage(this.canvas, 0, 0);
                } else {
                    const { low, high } = this._paletteAtTime();
                    this._snapRenderToCanvas(
                        this._ghostCtx, this.modes[0] || this.mode || stack[0], low, high,
                    );
                }
            }
            this._modeFadeStart = performance.now();
            this._modeFade = 1;
        }
        this.modes = stack;
        this.mode = stack[0];
    }

    setShuffleMode(mode, opts = {}) {
        const id = normalizeVizMode(mode);
        if (id === this._shuffleMode && !opts.force) return;
        if (this._trackCrossfade) {
            this._shuffleMode = id;
            this.mode = id;
            return;
        }
        if (opts.fade && this.ctx && this.W > 0 && this.H > 0) {
            if (this._modeFade <= 0) {
                const { low, high } = this._paletteAtTime();
                this._snapRenderToCanvas(this._ghostCtx, this._shuffleMode || this.mode, low, high);
            }
            this._modeFadeStart = performance.now();
            this._modeFade = 1;
        } else {
            this._modeFade = 0;
        }
        this._shuffleMode = id;
        this.mode = id;
    }

    _beginDrawFilter(ctx) {
        if (!IS_TIZEN || !ctx) return false;
        ctx.save();
        ctx.filter = TIZEN_VIZ_DRAW_FILTER;
        return true;
    }

    _endDrawFilter(ctx, active) {
        if (!active || !ctx) return;
        ctx.filter = 'none';
        ctx.restore();
    }

    _snapRenderToCanvas(targetCtx, mode, paletteLow, paletteHigh) {
        if (!targetCtx || this.W <= 0 || this.H <= 0) return;
        if (this._trackOutCanvas.width !== this.W || this._trackOutCanvas.height !== this.H) {
            this._trackOutCanvas.width = this.W;
            this._trackOutCanvas.height = this.H;
        }
        const prevCtx = this.ctx;
        this._paletteOverrideLow = paletteLow;
        this._paletteOverrideHigh = paletteHigh;
        this.ctx = targetCtx;
        const filtered = this._beginDrawFilter(targetCtx);
        try {
            targetCtx.clearRect(0, 0, this.W, this.H);
            this._renderMode(normalizeVizMode(mode));
        } finally {
            this._endDrawFilter(targetCtx, filtered);
            this.ctx = prevCtx;
            this._paletteOverrideLow = null;
            this._paletteOverrideHigh = null;
        }
    }

    _snapRenderComposite(targetCtx, paletteLow, paletteHigh) {
        if (!targetCtx || this.W <= 0 || this.H <= 0) return;
        if (this._trackOutCanvas.width !== this.W || this._trackOutCanvas.height !== this.H) {
            this._trackOutCanvas.width = this.W;
            this._trackOutCanvas.height = this.H;
        }
        const prevCtx = this.ctx;
        this._paletteOverrideLow = paletteLow;
        this._paletteOverrideHigh = paletteHigh;
        this.ctx = targetCtx;
        const filtered = this._beginDrawFilter(targetCtx);
        try {
            targetCtx.clearRect(0, 0, this.W, this.H);
            this._renderCurrentMode();
        } finally {
            this._endDrawFilter(targetCtx, filtered);
            this.ctx = prevCtx;
            this._paletteOverrideLow = null;
            this._paletteOverrideHigh = null;
        }
    }

    /** Palette-only crossfade for single/double viz (keeps current mode stack). */
    beginPaletteCrossfade(paletteLow, paletteHigh) {
        if (!paletteLow || !paletteHigh) return;
        if (this.ctx && this.W > 0 && this.H > 0) {
            if (this._trackCrossfade) {
                if (this._trackInMode) {
                    this._snapRenderToCanvas(
                        this._trackOutCtx, this._trackInMode,
                        this._trackInPaletteLow, this._trackInPaletteHigh,
                    );
                } else {
                    this._snapRenderComposite(
                        this._trackOutCtx,
                        this._trackInPaletteLow,
                        this._trackInPaletteHigh,
                    );
                }
            } else {
                if (this._modeFade > 0) this._modeFade = 0;
                const { low, high } = this._paletteAtTime();
                this._snapRenderComposite(this._trackOutCtx, low, high);
            }
        }
        this._trackInMode = null;
        this._trackInPaletteLow = paletteLow;
        this._trackInPaletteHigh = paletteHigh;
        this._trackCrossfadeStart = performance.now();
        this._trackCrossfade = true;
        this._modeFade = 0;
    }

    beginTrackCrossfade(incomingMode, paletteLow, paletteHigh) {
        const id = normalizeVizMode(incomingMode);
        if (!paletteLow || !paletteHigh) {
            this._trackCrossfade = false;
            this._shuffleMode = id;
            this.mode = id;
            return;
        }
        if (this.ctx && this.W > 0 && this.H > 0) {
            if (this._trackCrossfade) {
                this._snapRenderToCanvas(
                    this._trackOutCtx, this._trackInMode,
                    this._trackInPaletteLow, this._trackInPaletteHigh,
                );
            } else {
                if (this._modeFade > 0) this._modeFade = 0;
                const { low, high } = this._paletteAtTime();
                this._snapRenderToCanvas(
                    this._trackOutCtx, this._shuffleMode || this.mode, low, high,
                );
            }
        }
        this._trackInMode = id;
        this._trackInPaletteLow = paletteLow;
        this._trackInPaletteHigh = paletteHigh;
        this._trackCrossfadeStart = performance.now();
        this._trackCrossfade = true;
        this._modeFade = 0;
        this._shuffleMode = id;
        this.mode = id;
    }

    _activeRenderModes() {
        const selMode = getVizSelectionMode();
        if (selMode === 'shuffle' || selMode === 'cycle') {
            return [this._shuffleMode || this.mode || VIZ_MODE_DEFAULT];
        }
        return this.modes;
    }

    setMode(mode, opts = {}) {
        this.setModes([mode], opts);
    }

    /** Inner ring radius for circular modes (¼ screen width → half canvas width). */
    _ringInnerRadius() {
        return this.W / 4;
    }

    /** Outer radius limit for circular modes. */
    _ringOuterRadius() {
        return this._ringInnerRadius() * 2;
    }

    detachTap() {
        if (this._vizAnalyser && this._tapGain) {
            try {
                this._tapGain.disconnect(this._vizAnalyser);
            } catch {
                // already disconnected
            }
        }
        this._vizAnalyser = null;
        this._tapGain = null;
        this.analyser = null;
        this.dataArray = null;
    }

    attachToGain(gainNode, audioContext) {
        if (!gainNode || !audioContext) return;
        if (this._tapGain === gainNode && this._vizAnalyser) return;
        this.detachTap();
        this._tapGain = gainNode;
        this._vizAnalyser = audioContext.createAnalyser();
        this._vizAnalyser.fftSize = this.cfg.fftSize;
        this._vizAnalyser.minDecibels = this.cfg.minDecibels;
        this._vizAnalyser.maxDecibels = this.cfg.maxDecibels;
        this._vizAnalyser.smoothingTimeConstant = this.cfg.fftSmoothing;
        gainNode.connect(this._vizAnalyser);
        this.analyser = this._vizAnalyser;
        this._sampleRate = audioContext.sampleRate || 48000;
        this.dataArray = new Uint8Array(this._vizAnalyser.frequencyBinCount);
        this._rebuildLogBands();
        if (audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {});
        }
    }

    /** @deprecated use attachToGain */
    attachAnalyser(analyser, audioContext) {
        const gain = typeof window !== 'undefined'
            ? window.playerInstance?.audioProcessor?.gainNode
            : null;
        if (gain) {
            this.attachToGain(gain, audioContext);
            return;
        }
        if (!analyser || this.analyser === analyser) return;
        this.analyser = analyser;
        analyser.fftSize = this.cfg.fftSize;
        analyser.minDecibels = this.cfg.minDecibels;
        analyser.maxDecibels = this.cfg.maxDecibels;
        analyser.smoothingTimeConstant = this.cfg.fftSmoothing;
        this._sampleRate = audioContext?.sampleRate || 48000;
        this.dataArray = new Uint8Array(analyser.frequencyBinCount);
        this._rebuildLogBands();
        if (audioContext?.state === 'suspended') {
            audioContext.resume().catch(() => {});
        }
    }

    setPlaying(playing) {
        if (!playing && this._isPlaying) {
            this._pausedSince = Date.now();
            this._pauseSnapshot = Float32Array.from(this.barHeights);
            this._resumeSnapshot = null;
            this._audioReadyFrames = 0;
        }
        if (playing && !this._isPlaying) {
            this._resumeSnapshot = Float32Array.from(this.barHeights);
            this._pauseSnapshot = null;
            this._pausedSince = 0;
            this._liveAmount = 0;
            this._audioReadyFrames = 0;
        }
        this._isPlaying = playing;
    }
    setConnected(connected) { this._isConnected = connected; }
    setPaused(paused) { this._paused = paused; }

    setDisabled(disabled) {
        this._disabled = !!disabled;
        if (disabled) this.stop();
        else this.start();
    }

    stop() {
        this._running = false;
        if (this._rafId != null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    holdPalette() {
        const { low, high } = this._paletteAtTime({ ignoreHold: true });
        this._paletteHoldLow = { ...low };
        this._paletteHoldHigh = { ...high };
    }

    releasePaletteHold() {
        this._paletteHoldLow = null;
        this._paletteHoldHigh = null;
    }

    setPaletteColors(low, high) {
        this._colorLow = low;
        this._colorHigh = high;
        this._paletteTargetLow = null;
        this._paletteLerpStart = null;
    }

    setPaletteTargets(low, high) {
        const current = this._paletteAtTime();
        this._paletteFromLow = { ...current.low };
        this._paletteFromHigh = { ...current.high };
        this._paletteTargetLow = low;
        this._paletteTargetHigh = high;
        this._paletteLerpStart = performance.now();
    }

    _paletteAtTime(opts = {}) {
        if (!opts.ignoreHold && this._paletteHoldLow && this._paletteHoldHigh) {
            return { low: this._paletteHoldLow, high: this._paletteHoldHigh };
        }
        if (this._paletteOverrideLow && this._paletteOverrideHigh) {
            return { low: this._paletteOverrideLow, high: this._paletteOverrideHigh };
        }
        if (!this._colorLow) this.refreshPalette();
        if (!this._paletteTargetLow || this._paletteLerpStart == null) {
            return { low: this._colorLow, high: this._colorHigh };
        }
        const t = Math.min(1, (performance.now() - this._paletteLerpStart) / 1000);
        if (t >= 1) {
            this._colorLow = this._paletteTargetLow;
            this._colorHigh = this._paletteTargetHigh;
            this._paletteTargetLow = null;
            this._paletteLerpStart = null;
            return { low: this._colorLow, high: this._colorHigh };
        }
        const ease = t * t * (3 - 2 * t);
        const lerp = (a, b) => a + (b - a) * ease;
        return {
            low: {
                r: lerp(this._paletteFromLow.r, this._paletteTargetLow.r),
                g: lerp(this._paletteFromLow.g, this._paletteTargetLow.g),
                b: lerp(this._paletteFromLow.b, this._paletteTargetLow.b),
            },
            high: {
                r: lerp(this._paletteFromHigh.r, this._paletteTargetHigh.r),
                g: lerp(this._paletteFromHigh.g, this._paletteTargetHigh.g),
                b: lerp(this._paletteFromHigh.b, this._paletteTargetHigh.b),
            },
        };
    }

    refreshPalette() {
        const style = getComputedStyle(document.documentElement);
        const low = parseCssColor(style.getPropertyValue('--viz-low'));
        const high = parseCssColor(style.getPropertyValue('--viz-high'));
        const fallback = { r: 0, g: 132, b: 255 };
        this.setPaletteColors(low || fallback, high || fallback);
    }

    colorAt(distFromCenter, alpha = 0.65) {
        const { low: lo, high: hi } = this._paletteAtTime();
        const t = 1 - Math.min(1, Math.max(0, distFromCenter));
        const r = lo.r + (hi.r - lo.r) * t;
        const g = lo.g + (hi.g - lo.g) * t;
        const b = lo.b + (hi.b - lo.b) * t;
        return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`;
    }

    _fillAmbientTargets(out, gain, scale) {
        const center = (this.barCount - 1) / 2;
        const maxDist = center;
        for (let j = 0; j <= Math.floor(maxDist); j++) {
            const dist = j / maxDist;
            const ambient = this.ambientTarget(j) * gain * scale * (1 - dist * 0.25);
            const left = Math.round(center - j);
            const right = Math.round(center + j);
            if (left >= 0 && left < this.barCount) out[left] = ambient;
            if (right >= 0 && right < this.barCount && right !== left) out[right] = ambient;
        }
    }

    setBarCount(count) {
        const n = normalizeVizBarCount(count);
        if (n === this.barCount && this._logBands.length === n) return;
        const prev = this.barHeights;
        const prevN = this.barCount;
        this.barCount = n;
        const next = new Float32Array(n);
        if (prev && prevN > 1) {
            for (let i = 0; i < n; i++) {
                const t = n > 1 ? i / (n - 1) : 0;
                const src = t * (prevN - 1);
                const lo = Math.floor(src);
                const hi = Math.min(prevN - 1, lo + 1);
                const frac = src - lo;
                next[i] = prev[lo] * (1 - frac) + prev[hi] * frac;
            }
        }
        this.barHeights = next;
        if (this._pauseSnapshot && this._pauseSnapshot.length !== n) {
            this._pauseSnapshot = Float32Array.from(next);
        }
        this._rebuildLogBands();
    }

    _rebuildLogBands() {
        const count = this.barCount;
        const sr = this._sampleRate || 48000;
        const fftSize = this.analyser?.fftSize ?? this.cfg.fftSize;
        const binCount = this.dataArray?.length ?? (fftSize / 2);
        const minHz = this.cfg.minHz;
        const maxHz = this.cfg.maxHz;
        const barCenter = (count - 1) / 2;
        const bands = new Array(count);
        const warp = this.cfg.bassFreqWarp;
        for (let i = 0; i < count; i++) {
            const offset = Math.abs(i - barCenter);
            const normLo = Math.max(0, offset - 0.5) / Math.max(1, barCenter);
            const normHi = Math.min(1, (offset + 0.5) / Math.max(1, barCenter));
            const tLo = Math.pow(normLo, warp);
            const tHi = Math.pow(normHi, warp);
            const hzLo = minHz * Math.pow(maxHz / minHz, tLo);
            const hzHi = minHz * Math.pow(maxHz / minHz, tHi);
            const ini = Math.max(0, Math.floor(hzLo * fftSize / sr));
            const end = Math.min(binCount - 1, Math.max(ini, Math.ceil(hzHi * fftSize / sr)));
            bands[i] = { ini, end };
        }
        this._logBands = bands;
    }

    _barPeak(i) {
        const data = this.dataArray;
        const band = this._logBands[i];
        if (!data || !band) return 0;
        let peak = 0;
        for (let b = band.ini; b <= band.end; b++) {
            if (data[b] > peak) peak = data[b];
        }
        return peak / 255;
    }

    _blendBarTargets(peaks, opts = {}) {
        const n = peaks.length;
        const center = (n - 1) / 2;
        const strength = opts.strength ?? this.cfg.bassHeightBlend;
        const width = opts.width ?? this.cfg.bassHeightBlendWidth;
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const dist = Math.abs(i - center) / Math.max(1, center);
            const w = strength * Math.max(0, 1 - dist / width);
            if (w <= 0) {
                out[i] = peaks[i];
                continue;
            }
            const l2 = peaks[Math.max(0, i - 2)];
            const l1 = peaks[Math.max(0, i - 1)];
            const c = peaks[i];
            const r1 = peaks[Math.min(n - 1, i + 1)];
            const r2 = peaks[Math.min(n - 1, i + 2)];
            const blurred = (l2 + 2 * l1 + 3 * c + 2 * r1 + r2) / 10;
            out[i] = c * (1 - w) + blurred * w;
        }
        return out;
    }

    _columnsPeakAdjust(peaks) {
        const n = peaks.length;
        const center = (n - 1) / 2;
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const dist = Math.abs(i - center) / Math.max(1, center);
            const bassDamp = 1 - 0.38 * (1 - dist);
            const trebleBoost = 1 + 0.5 * dist;
            out[i] = peaks[i] * bassDamp * trebleBoost;
        }
        return out;
    }

    _liveTargetsForModes(peaks) {
        if (this._activeRenderModes().includes('columns')) {
            return this._blendBarTargets(this._columnsPeakAdjust(peaks), {
                strength: 0.22,
                width: 0.34,
            });
        }
        return this._blendBarTargets(peaks);
    }

    ambientTarget(j) {
        return (Math.sin(this.ambientPhase - j * AMBIENT_SPATIAL_STEP) + 1) * 0.14 + 0.06;
    }

    smoothBar(i, target) {
        const capped = Math.min(target, this.cfg.barCap);
        const rising = capped > this.barHeights[i];
        const speed = rising ? this.cfg.barRiseSpeed : this.cfg.barFallSpeed;
        this.barHeights[i] += (capped - this.barHeights[i]) * speed;
    }

    edgeHeightScale(i) {
        const t = i / Math.max(1, this.barCount - 1);
        const edge = this.cfg.edgeFadeWidth;
        const minS = this.cfg.edgeMinScale;
        if (edge <= 0) return 1;
        if (t <= edge) return minS + (t / edge) * (1 - minS);
        if (t >= 1 - edge) return minS + ((1 - t) / edge) * (1 - minS);
        return 1;
    }

    centerHeightScale(i) {
        const barCenter = (this.barCount - 1) / 2;
        const dist = Math.abs(i - barCenter) / Math.max(1, barCenter);
        const fade = this.cfg.centerFadeWidth;
        const minS = this.cfg.centerMinScale;
        if (fade <= 0 || dist >= fade) return 1;
        return minS + (dist / fade) * (1 - minS);
    }

    barHeightScale(i) {
        return this.edgeHeightScale(i) * this.centerHeightScale(i);
    }

    _barAlpha(glowMix) {
        return 0.58 + 0.28 * glowMix;
    }

    _displayGlowMix() {
        const floor = this._isPlaying ? 0.22 : 0.42;
        return Math.max(floor, this._glowAmount, this._liveAmount * 0.95);
    }

    /** Smoothed glow for modes sensitive to abrupt dimming (e.g. helix). */
    _renderGlowMix() {
        return this._smoothedGlowMix;
    }

    _hallScopeGlowMix() {
        if (!this._isPlaying) return 0.42;
        return this._displayGlowMix();
    }

    _shouldHallScopeEchoSnap() {
        return this._isPlaying && !this._paused;
    }

    _mirroredBarLevel(distFromCenter, heights = this.barHeights) {
        const barCenter = (this.barCount - 1) / 2;
        const dist = Math.min(1, Math.max(0, distFromCenter));
        const offset = Math.min(barCenter, Math.round(dist * barCenter));
        const left = Math.max(0, Math.round(barCenter - offset));
        const right = Math.min(this.barCount - 1, Math.round(barCenter + offset));
        const leftH = heights[left] * this.barHeightScale(left);
        const rightH = heights[right] * this.barHeightScale(right);
        return left === right ? leftH : (leftH + rightH) * 0.5;
    }

    _hallBarLevel(distFromCenter) {
        const dist = Math.min(1, Math.max(0, distFromCenter));
        const scale = (0.67 + dist * 0.58) * this._outerBandBoost(dist);
        return this._mirroredBarLevel(dist, this.barHeights) * scale;
    }

    _particleHighBoost(distFromCenter) {
        return 1 + Math.min(1, distFromCenter) * 0.65;
    }

    _outerBandBoost(distFromCenter) {
        return 1 + Math.min(1, distFromCenter) * 0.55;
    }

    _particleFieldLevel(rowT, colT) {
        const rowDist = Math.abs(rowT - 0.5) * 2;
        const colDist = Math.abs(colT - 0.5) * 2;
        const rowLevel = this._mirroredBarLevel(rowDist);
        const colLevel = this._mirroredBarLevel(colDist);
        const boost = this._particleHighBoost(Math.max(rowDist, colDist));
        return (rowLevel * 0.72 + colLevel * 0.28) * boost;
    }

    _particleFieldColLevel(colT) {
        const barIdx = Math.min(
            this.barCount - 1,
            Math.max(0, Math.round(colT * (this.barCount - 1))),
        );
        const direct = this.barHeights[barIdx] * this.barHeightScale(barIdx);
        const colDist = Math.abs(colT - 0.5) * 2;
        const mirrored = this._mirroredBarLevel(colDist);
        return (direct * 0.68 + mirrored * 0.32) * this._outerBandBoost(colDist);
    }

    _particleFieldCombinedLevel(rowT, colT) {
        const field = this._particleFieldLevel(rowT, colT);
        const colBar = this._particleFieldColLevel(colT);
        return field * 0.42 + colBar * 0.58;
    }

    _particleMotionWobble(seed) {
        const t = performance.now() * 0.001;
        const phase = this.ambientPhase * (0.62 + (seed % 1.9) * 0.38);
        const f1 = 6.4 + (seed * 1.73) % 5.2;
        const f2 = 4.1 + (seed * 2.41) % 4.4;
        const f3 = 2.6 + (seed * 0.89) % 3.1;
        return Math.sin(t * f1 + seed * 1.31 + phase)
            * Math.sin(t * f2 + seed * 2.07 + phase * 0.74)
            * (0.55 + 0.45 * Math.cos(t * f3 + seed * 0.53 + phase * 1.15));
    }

    _particleMotionOffset(level, span, seed, glowMix, scale = 0.52) {
        const drive = level * level * (0.42 + 0.58 * glowMix);
        return drive * span * scale * this._particleMotionWobble(seed);
    }

    _echoFadeAlpha(ageSec, peakAlpha) {
        if (ageSec >= HALL_ECHO_LIFE_SEC) return 0;
        const t = ageSec / HALL_ECHO_LIFE_SEC;
        const fade = (1 - t) * (1 - t);
        return peakAlpha * fade;
    }

    _pulseRingLevel(ringIndex, ringCount, glowMix) {
        const t = ringIndex / Math.max(1, ringCount - 1);
        const level = this._ringBandLevel(ringIndex, ringCount);
        const phase = this.ambientPhase * (0.82 + (ringIndex % 7) * 0.09) + ringIndex * 0.73;
        const individualGlow = glowMix * (0.45 + 0.55 * level)
            + (1 - glowMix) * level * (0.42 + 0.58 * Math.sin(phase));
        const pulse = Math.max(0.1, Math.min(1.25, level * (0.7 + 0.3 * glowMix) + individualGlow * 0.35));
        return { t, level, pulse };
    }

    _ringBandLevel(ringIndex, ringCount) {
        const center = (this.barCount - 1) / 2;
        const t = ringIndex / Math.max(1, ringCount - 1);
        const distFromCenter = t * center;
        const left = Math.max(0, Math.round(center - distFromCenter));
        const right = Math.min(this.barCount - 1, Math.round(center + distFromCenter));
        const leftH = this.barHeights[left] * this.barHeightScale(left);
        const rightH = this.barHeights[right] * this.barHeightScale(right);
        const level = left === right ? leftH : (leftH + rightH) * 0.5;
        return level * this._outerBandBoost(t);
    }

    _probeScheduledAudio() {
        if (!IS_ANDROID) return true;
        const player = typeof window !== 'undefined' ? window.playerInstance : null;
        const ap = player?.audioProcessor;
        const ctx = player?.audioContext;
        if (!ap || !ctx) return true;
        const queueDepth = (ap.audioBufferQueue?.length ?? 0) + (ap.scheduledSources?.length ?? 0);
        let hasOutput = false;
        if (queueDepth > 0) {
            try {
                hasOutput = ap.getScheduledAheadSec(ctx.currentTime) > 0.015;
            } catch {
                hasOutput = queueDepth > 0;
            }
        }
        if (hasOutput) {
            this._audioOutputHoldFrames = 18;
            return true;
        }
        if (this._audioOutputHoldFrames > 0) {
            this._audioOutputHoldFrames -= 1;
            return true;
        }
        return false;
    }

    updateHeights() {
        const now = Date.now();
        const hasScheduledAudio = this._probeScheduledAudio();
        const wantsLive = this._isConnected && this._isPlaying && !this._paused && hasScheduledAudio;
        const showIdleAmbient = !wantsLive;

        if (showIdleAmbient) {
            if (this._isConnected) {
                this.ambientPhase += AMBIENT_PHASE_IDLE;
            } else {
                this.ambientPhase += AMBIENT_PHASE_IDLE_OFFLINE;
            }
            if (this._activeRenderModes().includes('tris')) {
                this.blobRotation += 0.0018;
            }
        } else if (wantsLive) {
            if (this._activeRenderModes().includes('tris')) {
                this.blobRotation += 0.0028;
            }
            if (this._activeRenderModes().some((m) => m === 'solar' || m === 'star' || m === 'particles' || m === 'web' || m === 'helix')) {
                this.ambientPhase += 0.0028;
            }
        }

        if (this._activeRenderModes().includes('helix')) {
            this._helixScrollPhase = (this._helixScrollPhase + HELIX_SCROLL_RATE) % 1;
        }

        const pauseMs = this._pausedSince ? now - this._pausedSince : 0;
        const pauseT = this._pauseSnapshot ? Math.min(1, pauseMs / this._PAUSE_AMBIENT_MS) : 1;
        const pauseEase = 1 - Math.pow(1 - pauseT, 3);

        if (!wantsLive && this._pauseSnapshot) {
            this._liveAmount = 1 - pauseEase;
        } else if (!wantsLive) {
            this._liveAmount = 0;
        }

        let ambientTargets = null;
        if (showIdleAmbient) {
            const idleGain = !this._isConnected ? 0.1 : (0.14 + 0.12 * pauseEase);
            const idleScale = !this._isConnected ? 1 : (1 + 0.65 * pauseEase);
            ambientTargets = new Float32Array(this.barCount);
            this._fillAmbientTargets(ambientTargets, idleGain, idleScale);
        }

        let liveTargets = null;
        if (wantsLive && this.analyser && this.dataArray) {
            this.analyser.getByteFrequencyData(this.dataArray);
            let maxPeak = 0;
            const peaks = new Float32Array(this.barCount);
            for (let i = 0; i < this.barCount; i++) {
                peaks[i] = this._barPeak(i);
                if (peaks[i] > maxPeak) maxPeak = peaks[i];
            }
            if (maxPeak > this._AUDIO_READY_THRESHOLD) {
                this._audioReadyFrames = Math.min(6, this._audioReadyFrames + 1);
            } else {
                this._audioReadyFrames = Math.max(0, this._audioReadyFrames - 1);
            }
            if (this._audioReadyFrames >= 2) {
                liveTargets = this._liveTargetsForModes(peaks);
            }
        }

        let quietLiveTargets = null;
        if (wantsLive && !liveTargets) {
            quietLiveTargets = new Float32Array(this.barCount);
            this._fillAmbientTargets(quietLiveTargets, 0.22, 0.9);
        }

        if (wantsLive && liveTargets) {
            this._liveAmount = Math.min(1, this._liveAmount + this._frameInterval / this._PLAY_RAMP_MS);
        } else if (wantsLive) {
            this._liveAmount = Math.max(0.35, this._liveAmount - this._frameInterval / (this._PLAY_RAMP_MS * 2.5));
        }

        const smoothSpeed = 0.26;
        const useLiveSmooth = wantsLive && this._liveAmount > 0.85 && liveTargets;

        for (let i = 0; i < this.barCount; i++) {
            let target;
            if (wantsLive) {
                if (liveTargets && this._liveAmount > 0) {
                    target = liveTargets[i] * this._liveAmount;
                } else if (quietLiveTargets) {
                    target = quietLiveTargets[i] || 0;
                } else {
                    target = 0;
                }
            } else if (ambientTargets) {
                target = ambientTargets[i] || 0;
                if (this._pauseSnapshot) {
                    target = this._pauseSnapshot[i] + (target - this._pauseSnapshot[i]) * pauseEase;
                }
            } else {
                target = 0;
            }
            if (useLiveSmooth) {
                this.smoothBar(i, target);
            } else {
                this.barHeights[i] += (target - this.barHeights[i]) * smoothSpeed;
            }
        }

        if (this._pauseSnapshot && ambientTargets) {
            let heightProgress = 0;
            let count = 0;
            for (let i = 0; i < this.barCount; i++) {
                const from = this._pauseSnapshot[i];
                const to = ambientTargets[i] || 0;
                const span = to - from;
                if (Math.abs(span) < 0.001) {
                    heightProgress += 1;
                } else {
                    heightProgress += Math.min(1, Math.abs(this.barHeights[i] - from) / Math.abs(span));
                }
                count += 1;
            }
            heightProgress /= Math.max(1, count);
            this._glowAmount = Math.max(0, 1 - heightProgress);
            if (heightProgress >= 0.98 || pauseT >= 1) {
                this._pauseSnapshot = null;
            }
        } else {
            this._glowAmount = Math.max(this._isPlaying ? 0.32 : 0, this._liveAmount);
        }

        if (wantsLive && this._liveAmount >= 1) {
            this._resumeSnapshot = null;
        }

        const glowTarget = this._displayGlowMix();
        const glowEase = showIdleAmbient ? 0.05 : 0.13;
        this._smoothedGlowMix += (glowTarget - this._smoothedGlowMix) * glowEase;
    }

    _drawRadialBar(ctx, cx, cy, angle, innerR, length, barW, dist, glowMix) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x0 = cx + cos * innerR;
        const y0 = cy + sin * innerR;
        ctx.save();
        ctx.translate(x0, y0);
        ctx.rotate(angle + Math.PI / 2);
        ctx.fillStyle = this.colorAt(dist, this._barAlpha(glowMix));
        ctx.fillRect(-barW / 2, 0, barW, length);
        ctx.restore();
    }

    renderHorizon() {
        const ctx = this.ctx;
        const centerY = this.H * 0.5;
        const barCenter = (this.barCount - 1) / 2;
        const maxBarH = this.H * this.cfg.maxBarHeightRatio;
        const slot = this.W / this.barCount;
        const barW = Math.max(4, slot * 0.8);
        const glowMix = this._glowAmount;

        for (let i = 0; i < this.barCount; i++) {
            const h = Math.max(8, this.barHeights[i] * maxBarH * this.barHeightScale(i));
            const x = i * slot + (slot - barW) / 2;
            const dist = Math.abs(i - barCenter) / barCenter;
            const alpha = this._barAlpha(glowMix);

            // Underglow: soft gradient beneath each bar pair
            if (h > 10) {
                const glowH = h * (0.55 + glowMix * 0.45);
                const gradTop = ctx.createLinearGradient(x, centerY - glowH, x, centerY);
                gradTop.addColorStop(0, this.colorAt(dist, alpha * 0.18));
                gradTop.addColorStop(1, this.colorAt(dist, 0));
                ctx.fillStyle = gradTop;
                ctx.fillRect(x - barW * 0.4, centerY - glowH, barW * 1.8, glowH);

                const gradBot = ctx.createLinearGradient(x, centerY, x, centerY + glowH);
                gradBot.addColorStop(0, this.colorAt(dist, 0));
                gradBot.addColorStop(1, this.colorAt(dist, alpha * 0.18));
                ctx.fillStyle = gradBot;
                ctx.fillRect(x - barW * 0.4, centerY, barW * 1.8, glowH);
            }

            ctx.fillStyle = this.colorAt(dist, alpha);
            ctx.fillRect(x, centerY - h, barW, h);
            ctx.fillRect(x, centerY, barW, h);
        }
    }

    _renderRiseBars(ctx, baseY, growDown, maxBarH, slot, barW, glowMix) {
        const barCenter = (this.barCount - 1) / 2;
        for (let i = 0; i < this.barCount; i++) {
            const h = Math.max(6, this.barHeights[i] * maxBarH * this.barHeightScale(i));
            const x = i * slot + (slot - barW) / 2;
            const dist = Math.abs(i - barCenter) / barCenter;
            ctx.fillStyle = this.colorAt(dist, this._barAlpha(glowMix));
            if (growDown) ctx.fillRect(x, baseY, barW, h);
            else ctx.fillRect(x, baseY - h, barW, h);
        }
    }

    renderRise() {
        const maxBarH = this.H * this.cfg.riseMaxHeightRatio;
        const slot = this.W / this.barCount;
        const barW = Math.max(4, slot * 0.8);
        const glowMix = this._glowAmount;
        this._renderRiseBars(this.ctx, this.H, false, maxBarH, slot, barW, glowMix);
        this._renderRiseBars(this.ctx, 0, true, maxBarH, slot, barW, glowMix);
    }

    _renderColumnBars(ctx, baseX, growRight, maxBarW, slot, barH, glowMix) {
        const barCenter = (this.barCount - 1) / 2;
        for (let i = 0; i < this.barCount; i++) {
            const w = Math.max(6, this.barHeights[i] * maxBarW * this.barHeightScale(i));
            const y = i * slot + (slot - barH) / 2;
            const dist = Math.abs(i - barCenter) / Math.max(1, barCenter);
            ctx.fillStyle = this.colorAt(dist, this._barAlpha(glowMix));
            if (growRight) ctx.fillRect(baseX, y, w, barH);
            else ctx.fillRect(baseX - w, y, w, barH);
        }
    }

    renderColumns() {
        const maxBarW = this.W * this.cfg.riseMaxHeightRatio * 0.92;
        const slot = this.H / this.barCount;
        const barH = Math.max(4, slot * 0.8);
        const glowMix = this._glowAmount;
        this._renderColumnBars(this.ctx, 0, true, maxBarW, slot, barH, glowMix);
        this._renderColumnBars(this.ctx, this.W, false, maxBarW, slot, barH, glowMix);
    }

    _sampleScopeWavePoints(sign) {
        const cy = this.H * 0.5;
        const ampScale = this.H * 0.2;
        const step = this.W / Math.max(1, this.barCount - 1);
        const barCenter = (this.barCount - 1) / 2;
        const heights = this.barHeights;
        const pts = [];
        for (let i = 0; i < this.barCount; i++) {
            const x = i * step;
            const dist = Math.abs(i - barCenter) / Math.max(1, barCenter);
            const amp = heights[i] * ampScale * this.barHeightScale(i)
                * this._outerBandBoost(dist);
            pts.push({ x, y: cy + sign * amp, dist });
        }
        return pts;
    }

    _traceScopeCurve(ctx, points, alpha, glowMix) {
        if (points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
            const curr = points[i];
            const next = points[i + 1];
            const cpx = (curr.x + next.x) / 2;
            const cpy = (curr.y + next.y) / 2;
            ctx.quadraticCurveTo(curr.x, curr.y, cpx, cpy);
        }
        const last = points[points.length - 1];
        ctx.lineTo(last.x, last.y);
        const strokeAlpha = Math.min(1, alpha * (this._barAlpha(glowMix) + 0.18));
        ctx.strokeStyle = this.colorAt(0.35, strokeAlpha);
        ctx.lineWidth = 3.2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    renderScope() {
        const ctx = this.ctx;
        const glowMix = this._hallScopeGlowMix();
        const now = performance.now();

        const topPts = this._sampleScopeWavePoints(-1);
        const botPts = this._sampleScopeWavePoints(1);

        if (this._shouldHallScopeEchoSnap() && now - this._scopeLastSnap >= HALL_ECHO_MS) {
            this._scopeLastSnap = now;
            this._scopeEchoes.unshift({
                born: now,
                top: topPts.map((p) => ({ ...p })),
                bottom: botPts.map((p) => ({ ...p })),
            });
            if (this._scopeEchoes.length > HALL_ECHO_MAX) {
                this._scopeEchoes.length = HALL_ECHO_MAX;
            }
        }

        for (let e = this._scopeEchoes.length - 1; e >= 0; e--) {
            const echo = this._scopeEchoes[e];
            const age = (now - echo.born) / 1000;
            const alpha = this._echoFadeAlpha(age, 0.58);
            if (alpha <= 0.001) continue;
            const shift = age * HALL_ECHO_SHIFT;
            const topEcho = echo.top.map((p) => ({ ...p, y: p.y - shift }));
            const botEcho = echo.bottom.map((p) => ({ ...p, y: p.y + shift }));
            this._traceScopeCurve(ctx, topEcho, alpha, glowMix);
            this._traceScopeCurve(ctx, botEcho, alpha, glowMix);
        }

        this._traceScopeCurve(ctx, topPts, 0.92 + glowMix * 0.08, glowMix);
        this._traceScopeCurve(ctx, botPts, 0.92 + glowMix * 0.08, glowMix);
    }

    renderRing() {
        const ctx = this.ctx;
        const cx = this.W / 2;
        const cy = this.H / 2;
        const innerR = this._ringInnerRadius();
        const maxExt = innerR;
        const barW = Math.max(3, (Math.PI * 2 * innerR) / this.barCount * 0.55);
        const glowMix = this._glowAmount;
        const barCenter = (this.barCount - 1) / 2;

        for (let i = 0; i < this.barCount; i++) {
            const angle = (i / this.barCount) * Math.PI * 2 + Math.PI / 2;
            const barIdx = (i + Math.floor(this.barCount / 2)) % this.barCount;
            const dist = Math.abs(barIdx - barCenter) / Math.max(1, barCenter);
            const length = Math.max(6, this.barHeights[barIdx] * maxExt * this.barHeightScale(barIdx));
            this._drawRadialBar(ctx, cx, cy, angle, innerR, length, barW, dist, glowMix);
        }
    }

    renderPulseRings() {
        const ctx = this.ctx;
        const cx = this.W / 2;
        const cy = this.H / 2;
        const innerR = this._ringInnerRadius();
        const outerR = this._ringOuterRadius();
        const span = outerR - innerR;
        const glowMix = this._glowAmount;

        for (let i = 0; i < PULSE_RING_COUNT; i++) {
            const t = i / Math.max(1, PULSE_RING_COUNT - 1);
            const level = this._ringBandLevel(i, PULSE_RING_COUNT);
            const phase = this.ambientPhase * (0.82 + (i % 7) * 0.09) + i * 0.73;
            const individualGlow = glowMix * (0.45 + 0.55 * level)
                + (1 - glowMix) * level * (0.42 + 0.58 * Math.sin(phase));
            const pulse = Math.max(0.1, Math.min(1.25, level * (0.7 + 0.3 * glowMix) + individualGlow * 0.35));
            const baseRadius = innerR + span * t;
            const radius = baseRadius * (0.9 + pulse * 0.16);
            const thickness = (2 + level * (10 + 6 * glowMix)) * 1.5 * (0.72 + pulse * 0.38);
            const alpha = 0.22 + pulse * (0.42 + 0.24 * glowMix);
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.strokeStyle = this.colorAt(t, alpha);
            ctx.lineWidth = thickness;
            ctx.stroke();
        }
    }

    _drawPulseTriangle(ctx, cx, cy, size, rotation, t, alpha, glowMix, level, pulse) {
        const h = size * 0.5;
        const w = size * 0.58;
        const thickness = (2 + level * (10 + 6 * glowMix)) * 1.5 * (0.72 + pulse * 0.38);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);
        ctx.beginPath();
        ctx.moveTo(0, -h);
        ctx.lineTo(-w / 2, h * 0.86);
        ctx.lineTo(w / 2, h * 0.86);
        ctx.closePath();
        ctx.strokeStyle = this.colorAt(t, alpha);
        ctx.lineWidth = thickness;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    }

    renderPulseTriangles() {
        const ctx = this.ctx;
        const cx = this.W / 2;
        const cy = this.H / 2;
        const innerR = this._ringInnerRadius();
        const outerR = this._ringOuterRadius();
        const span = outerR - innerR;
        const glowMix = this._glowAmount;

        for (let i = 0; i < PULSE_RING_COUNT; i++) {
            const { t, level, pulse } = this._pulseRingLevel(i, PULSE_RING_COUNT, glowMix);
            const ringBase = innerR + span * t;
            const size = ringBase * (1.05 + pulse * 0.18) * 2;
            const rotation = this.blobRotation * 1.05 + i * (Math.PI / (PULSE_RING_COUNT * 1.5));
            const alpha = 0.22 + pulse * (0.42 + 0.24 * glowMix);
            this._drawPulseTriangle(ctx, cx, cy, size, rotation, t, alpha, glowMix, level, pulse);
        }
    }

    _rayLengthToEdge(cx, cy, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const minX = this.W * 0.02;
        const maxX = this.W * 0.98;
        const minY = this.H * 0.02;
        const maxY = this.H * 0.98;
        let maxT = Infinity;
        if (cos > 0.001) maxT = Math.min(maxT, (maxX - cx) / cos);
        else if (cos < -0.001) maxT = Math.min(maxT, (minX - cx) / cos);
        if (sin > 0.001) maxT = Math.min(maxT, (maxY - cy) / sin);
        else if (sin < -0.001) maxT = Math.min(maxT, (minY - cy) / sin);
        return (Number.isFinite(maxT) ? maxT : 0) * 0.94;
    }

    _drawParticle(ctx, x, y, dist, pulse, glowMix, radialT = 0) {
        const scale = this._elementScale();
        const coreR = (1.25 + pulse * (3.6 + 2.5 * glowMix) * (0.85 + radialT * 0.32)) * 1.55 * scale;
        const alpha = Math.min(1, (0.22 + pulse * (0.58 + 0.3 * glowMix)) * 1.55);
        ctx.beginPath();
        ctx.arc(x, y, coreR * 2.4, 0, Math.PI * 2);
        ctx.fillStyle = this.colorAt(dist, Math.min(1, alpha * 0.34));
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, coreR, 0, Math.PI * 2);
        ctx.fillStyle = this.colorAt(dist, alpha);
        ctx.fill();
    }

    _particleRadialOffset(level, span, seed, glowMix) {
        return this._particleMotionOffset(level, span, seed, glowMix, 0.58);
    }

    renderParticleField() {
        const ctx = this.ctx;
        const glowMix = this._glowAmount;
        const padX = this.W * (0.08 + (IS_ANDROID ? 0.04 : 0));
        const padY = this.H * (0.08 + (IS_ANDROID ? 0.04 : 0));
        const spanX = this.W - padX * 2;
        const spanY = this.H - padY * 2;
        const cellW = spanX / Math.max(1, PARTICLE_FIELD_COLS - 1);
        const cellH = spanY / Math.max(1, PARTICLE_FIELD_ROWS - 1);
        const span = Math.min(cellW, cellH);

        for (let row = 0; row < PARTICLE_FIELD_ROWS; row++) {
            for (let col = 0; col < PARTICLE_FIELD_COLS; col++) {
                const rowT = row / Math.max(1, PARTICLE_FIELD_ROWS - 1);
                const colT = col / Math.max(1, PARTICLE_FIELD_COLS - 1);
                const rowDist = Math.abs(rowT - 0.5) * 2;
                const colDist = Math.abs(colT - 0.5) * 2;
                const level = this._particleFieldCombinedLevel(rowT, colT);
                const baseX = padX + col * cellW;
                const baseY = padY + row * cellH;
                const seed = row * 0.47 + col * 0.23;
                const x = baseX + this._particleMotionOffset(level, span * 0.88, seed, glowMix, 0.5);
                const y = baseY + this._particleMotionOffset(
                    level,
                    span * 0.72,
                    seed + 3.71,
                    glowMix,
                    0.44 * (0.62 + colDist * 0.38),
                );
                const dist = Math.max(rowDist, colDist * 0.35);
                const pulse = level * (0.58 + 0.42 * glowMix) + 0.06;
                this._drawParticle(ctx, x, y, dist, pulse, glowMix, rowT);
            }
        }
    }

    renderParticleStar() {
        const ctx = this.ctx;
        const glowMix = this._glowAmount;
        const cx = this.W / 2;
        const cy = this.H / 2;
        const innerR = Math.min(this.W, this.H) * 0.065;
        const rayLengths = [];
        let totalLen = 0;
        for (let r = 0; r < PARTICLE_STAR_RAYS; r++) {
            const angle = (r / PARTICLE_STAR_RAYS) * Math.PI * 2 - Math.PI / 2;
            const len = this._rayLengthToEdge(cx, cy, angle);
            rayLengths.push({ angle, len });
            totalLen += len;
        }
        const totalSlots = PARTICLE_FIELD_ROWS * PARTICLE_FIELD_COLS;
        for (const ray of rayLengths) {
            const count = Math.max(2, Math.round(totalSlots * (ray.len / totalLen)));
            const slotLen = (ray.len - innerR) / Math.max(1, count);
            for (let i = 0; i < count; i++) {
                const radialT = (i + 0.5) / count;
                const baseR = innerR + radialT * (ray.len - innerR);
                const mapT = 1 - radialT;
                const level = this._mirroredBarLevel(mapT) * this._particleHighBoost(mapT);
                const seed = ray.angle + i * 0.41;
                const radialOffset = this._particleRadialOffset(level, slotLen, seed, glowMix);
                const r = Math.max(innerR * 0.35, baseR + radialOffset);
                const x = cx + Math.cos(ray.angle) * r;
                const y = cy + Math.sin(ray.angle) * r;
                const dist = mapT;
                const pulse = level * (0.58 + 0.42 * glowMix) + 0.06;
                this._drawParticle(ctx, x, y, dist, pulse, glowMix, radialT);
            }
        }
    }

    renderSolarSystem() {
        const ctx = this.ctx;
        const cx = this.W / 2;
        const cy = this.H / 2;
        const glowMix = this._glowAmount;
        const scale = Math.min(this.W, this.H) * 0.44 * this._elementScale();
        const orbitT = performance.now() * 0.001;

        const bassLevel = this._mirroredBarLevel(0);
        const sunPulse = bassLevel * (0.65 + 0.35 * glowMix) + 0.1;
        const sunR = scale * (0.22 + sunPulse * 0.1);
        const sunAlpha = Math.min(1, 0.35 + sunPulse * (0.45 + 0.25 * glowMix));

        ctx.beginPath();
        ctx.arc(cx, cy, sunR * 1.7, 0, Math.PI * 2);
        ctx.fillStyle = this.colorAt(0.08, sunAlpha * 0.35);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, sunR, 0, Math.PI * 2);
        ctx.fillStyle = this.colorAt(0.05, sunAlpha);
        ctx.fill();

        for (let pi = 0; pi < SOLAR_PLANETS.length; pi++) {
            const planet = SOLAR_PLANETS[pi];
            const level = this._mirroredBarLevel(planet.barT);
            const pulse = level * (0.55 + 0.45 * glowMix) + 0.08;
            const orbitR = scale * planet.orbit;
            const speedScale = SOLAR_PLANET_SPEED_SCALE[pi] ?? 1;
            const angle = orbitT * planet.speed * speedScale + planet.phase;
            const px = cx + Math.cos(angle) * orbitR;
            const py = cy + Math.sin(angle) * orbitR * SOLAR_ORBIT_Y_SCALE;
            const r = planet.size * (0.9 + pulse * 0.55);
            const alpha = Math.min(1, 0.28 + pulse * (0.5 + 0.28 * glowMix));

            ctx.beginPath();
            ctx.ellipse(cx, cy, orbitR, orbitR * SOLAR_ORBIT_Y_SCALE, 0, 0, Math.PI * 2);
            ctx.strokeStyle = this.colorAt(planet.barT, 0.08 + pulse * 0.12);
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(px, py, r * 1.7, 0, Math.PI * 2);
            ctx.fillStyle = this.colorAt(planet.barT, alpha * 0.32);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fillStyle = this.colorAt(planet.barT, alpha);
            ctx.fill();
        }
    }

    _sampleHallEdgePoints(edgeX, growInward) {
        const n = this.barCount;
        const yTop = this.H * 0.08;
        const yBot = this.H * 0.92;
        const centerY = this.H * 0.5;
        const halfSpan = Math.max(1, (yBot - yTop) * 0.5);
        const maxBarW = this.W * 0.32;
        const pts = [];
        for (let i = 0; i < n; i++) {
            const t = i / Math.max(1, n - 1);
            const y = yBot - t * (yBot - yTop);
            const distFromCenter = Math.min(1, Math.abs(y - centerY) / halfSpan);
            const level = this._hallBarLevel(distFromCenter);
            const w = Math.max(10, level * maxBarW);
            pts.push({
                x: edgeX + growInward * w,
                y,
                t: distFromCenter,
            });
        }
        return pts;
    }

    _traceHallCurve(ctx, points, alpha, glowMix) {
        if (points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
            const curr = points[i];
            const next = points[i + 1];
            const cpx = (curr.x + next.x) / 2;
            const cpy = (curr.y + next.y) / 2;
            ctx.quadraticCurveTo(curr.x, curr.y, cpx, cpy);
        }
        const last = points[points.length - 1];
        ctx.lineTo(last.x, last.y);
        const strokeAlpha = Math.min(1, alpha * (this._barAlpha(glowMix) + 0.18));
        ctx.strokeStyle = this.colorAt(0.35, strokeAlpha);
        ctx.lineWidth = 3.2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    renderHall() {
        const ctx = this.ctx;
        const glowMix = this._hallScopeGlowMix();
        const now = performance.now();
        const leftX = this.W * 0.04;
        const rightX = this.W * 0.96;
        const leftPts = this._sampleHallEdgePoints(leftX, 1);
        const rightPts = this._sampleHallEdgePoints(rightX, -1);

        if (this._shouldHallScopeEchoSnap() && now - this._hallLastSnap >= HALL_ECHO_MS) {
            this._hallLastSnap = now;
            this._hallEchoes.unshift({
                born: now,
                left: leftPts.map((p) => ({ ...p })),
                right: rightPts.map((p) => ({ ...p })),
            });
            if (this._hallEchoes.length > HALL_ECHO_MAX) {
                this._hallEchoes.length = HALL_ECHO_MAX;
            }
        }

        for (let e = this._hallEchoes.length - 1; e >= 0; e--) {
            const echo = this._hallEchoes[e];
            const age = (now - echo.born) / 1000;
            const alpha = this._echoFadeAlpha(age, 0.58);
            if (alpha <= 0.001) continue;
            const inset = age * HALL_ECHO_SHIFT;
            const leftEcho = echo.left.map((p) => ({ ...p, x: p.x + inset }));
            const rightEcho = echo.right.map((p) => ({ ...p, x: p.x - inset }));
            this._traceHallCurve(ctx, leftEcho, alpha, glowMix);
            this._traceHallCurve(ctx, rightEcho, alpha, glowMix);
        }

        this._traceHallCurve(ctx, leftPts, 0.92 + glowMix * 0.08, glowMix);
        this._traceHallCurve(ctx, rightPts, 0.92 + glowMix * 0.08, glowMix);
    }

    /**
     * Improvements to existing modes
     * ─────────────────────────────────────────────────────────────────────────
     * renderHorizon: now draws a subtle filled gradient beneath the bars so
     * the reflection doubles as a soft underglow without extra cost.
     *
     * renderRing: bars now radiate *inward* as well as outward when audio
     * energy is high, giving a "breathing" double-spike effect.
     * (Both are inline modifications; the method signatures are unchanged.)
     */

    // ─── NEW MODE: web ────────────────────────────────────────────────────────
    /**
     * Spider-web of concentric rings crossed by radial spokes. Each
     * intersection pulses with the closest frequency band.  Similar cost to
     * renderPulseRings: O(spokes × rings) arcs + line segments.
     */
    renderWeb() {
        const ctx = this.ctx;
        const cx = this.W / 2;
        const cy = this.H / 2;
        const glowMix = this._glowAmount;
        const maxR = Math.min(this.W, this.H) * 0.58;
        const minR = maxR * 0.04;
        const webRotation = Math.PI / WEB_SPOKE_COUNT;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(webRotation);
        ctx.translate(-cx, -cy);

        // Draw concentric rings
        for (let ri = 0; ri < WEB_RING_COUNT; ri++) {
            const t = (ri + 1) / WEB_RING_COUNT;
            const r = minR + (maxR - minR) * t;
            const level = this._ringBandLevel(
                Math.round(ri * (PULSE_RING_COUNT - 1) / Math.max(1, WEB_RING_COUNT - 1)),
                PULSE_RING_COUNT,
            );
            const pulse = level * (0.7 + 0.3 * glowMix) + 0.08;
            const alpha = 0.26 + pulse * (0.46 + 0.24 * glowMix);
            ctx.beginPath();
            ctx.arc(cx, cy, r * (0.96 + pulse * 0.08), 0, Math.PI * 2);
            ctx.strokeStyle = this.colorAt(t, alpha);
            ctx.lineWidth = 2 + level * (4.5 + 2.2 * glowMix);
            ctx.stroke();
        }

        // Draw spokes
        for (let si = 0; si < WEB_SPOKE_COUNT; si++) {
            const angle = (si / WEB_SPOKE_COUNT) * Math.PI * 2 - Math.PI / 2;
            const barT = si / (WEB_SPOKE_COUNT - 1);
            const dist = Math.abs(barT - 0.5) * 2;
            const level = this._mirroredBarLevel(dist) * this._outerBandBoost(dist);
            const pulse = level * (0.65 + 0.35 * glowMix) + 0.06;
            const alpha = 0.22 + pulse * (0.42 + 0.24 * glowMix);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            ctx.beginPath();
            ctx.moveTo(cx + cos * minR, cy + sin * minR);
            ctx.lineTo(cx + cos * maxR * (0.92 + pulse * 0.1), cy + sin * maxR * (0.92 + pulse * 0.1));
            ctx.strokeStyle = this.colorAt(dist, alpha);
            ctx.lineWidth = 1.6 + level * (3.6 + 2.2 * glowMix);
            ctx.stroke();

            // Intersection dot at each ring crossing
            for (let ri = 0; ri < WEB_RING_COUNT; ri++) {
                const t = (ri + 1) / WEB_RING_COUNT;
                const r = (minR + (maxR - minR) * t) * (0.96 + pulse * 0.08);
                const ix = cx + cos * r;
                const iy = cy + sin * r;
                const dotLevel = (level + this._ringBandLevel(
                    Math.round(ri * (PULSE_RING_COUNT - 1) / Math.max(1, WEB_RING_COUNT - 1)),
                    PULSE_RING_COUNT,
                )) * 0.5;
                const dotPulse = dotLevel * (0.6 + 0.4 * glowMix) + 0.05;
                const dotR = (2.2 + dotPulse * (4.8 + 2.8 * glowMix)) * 1.25;
                ctx.beginPath();
                ctx.arc(ix, iy, dotR, 0, Math.PI * 2);
                ctx.fillStyle = this.colorAt(Math.max(dist, t), Math.min(1, (0.24 + dotPulse * 0.66) * 1.35));
                ctx.fill();
            }
        }

        ctx.restore();
    }

    // ─── NEW MODE: helix ──────────────────────────────────────────────────────
    /**
     * Two interleaved sine-wave ribbons that twist around a horizontal axis,
     * like a DNA helix.  Each point's amplitude is driven by its frequency
     * band.  Cost: O(HELIX_POINT_COUNT) — similar to renderScope.
     */
    renderHelix() {
        this._renderHelixHalf(-1);
        this._renderHelixHalf(1);
    }

    _strokeSmoothPath(ctx, pts) {
        if (pts.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
            const cpx = (pts[i].x + pts[i + 1].x) * 0.5;
            const cpy = (pts[i].y + pts[i + 1].y) * 0.5;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, cpx, cpy);
        }
        const last = pts.length - 1;
        ctx.quadraticCurveTo(pts[last - 1].x, pts[last - 1].y, pts[last].x, pts[last].y);
        ctx.stroke();
    }

    _renderHelixHalf(dir) {
        const ctx = this.ctx;
        const glowMix = this._renderGlowMix();
        const cx = this.W / 2;
        const cy = this.H / 2;
        const span = cx * 0.98;
        const yAmp = this.H * 0.28;
        const scrollPhase = this._helixScrollPhase * Math.PI * 2;

        const strandA = [];
        const strandB = [];
        for (let i = 0; i < HELIX_POINT_COUNT; i++) {
            const colT = i / (HELIX_POINT_COUNT - 1);
            const x = dir < 0 ? cx - colT * span : cx + colT * span;
            const dist = colT * 0.9;
            const level = this._mirroredBarLevel(dist) * this._outerBandBoost(dist);
            const twist = colT * Math.PI * 4 - scrollPhase;
            const wobble = level * (0.55 + 0.45 * glowMix);
            const amp = yAmp * (0.35 + wobble * 0.65);
            strandA.push({ x, y: cy + Math.sin(twist) * amp, dist, level });
            strandB.push({ x, y: cy + Math.sin(twist + Math.PI) * amp, dist, level });
        }

        for (let strand = 0; strand < 2; strand++) {
            const pts = strand === 0 ? strandA : strandB;
            ctx.strokeStyle = this.colorAt(strand * 0.5, this._barAlpha(glowMix) * 0.82);
            ctx.lineWidth = 3.8 + glowMix * 2.4;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            this._strokeSmoothPath(ctx, pts);

            for (let i = 0; i < pts.length; i += 4) {
                const p = pts[i];
                const pulse = p.level * (0.55 + 0.45 * glowMix) + 0.06;
                const r = (1.8 + pulse * (4.8 + 2.2 * glowMix)) * 1.2;
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fillStyle = this.colorAt(p.dist, Math.min(1, (0.22 + pulse * 0.68) * 1.2));
                ctx.fill();
            }
        }

    }

    // ─── NEW MODE: cascade ────────────────────────────────────────────────────
    /**
     * Vertical ribbons that "drip" downward from a common top edge, each
     * ribbon's width and opacity driven by a frequency band. Think of molten
     * metal or a waterfall.  Cost: O(ribbons × barCount) — similar to
     * renderColumns.
     */
    renderCascade() {
        const ctx = this.ctx;
        const glowMix = this._glowAmount;
        const barCenter = (this.barCount - 1) / 2;
        const slotW = this.W / CASCADE_RIBBON_COUNT;
        const maxRiseH = this.H * 0.82 * 1.4;
        const baseY = this.H * 0.96;

        for (let ri = 0; ri < CASCADE_RIBBON_COUNT; ri++) {
            const ribbonT = ri / Math.max(1, CASCADE_RIBBON_COUNT - 1);
            const dist = Math.abs(ribbonT - 0.5) * 2;
            // Map ribbon to bar index (mirrored)
            const barIdx = Math.round(Math.abs(ribbonT - 0.5) * 2 * barCenter);
            const leftIdx = Math.max(0, Math.round(barCenter - barIdx));
            const rightIdx = Math.min(this.barCount - 1, Math.round(barCenter + barIdx));
            const level = (
                this.barHeights[leftIdx] * this.barHeightScale(leftIdx) +
                this.barHeights[rightIdx] * this.barHeightScale(rightIdx)
            ) * 0.5 * this._outerBandBoost(dist);

            const pulse = level * (0.65 + 0.35 * glowMix) + 0.04;
            const cx = slotW * ri + slotW * 0.5;
            const riseH = Math.max(slotW * 0.5, pulse * maxRiseH);
            const topY = baseY - riseH;
            const halfW = Math.max(4, slotW * 0.38 * (0.5 + pulse * 0.8));

            const grad = ctx.createLinearGradient(cx, baseY, cx, topY);
            const alpha0 = Math.min(1, 0.32 + pulse * (0.52 + 0.22 * glowMix));
            const alpha1 = alpha0 * 0.08;
            grad.addColorStop(0, this.colorAt(dist, alpha0));
            grad.addColorStop(0.45, this.colorAt(dist, alpha0 * 0.72));
            grad.addColorStop(1, this.colorAt(dist, alpha1));

            ctx.beginPath();
            ctx.moveTo(cx - halfW, baseY);
            ctx.quadraticCurveTo(cx - halfW * 0.6, baseY - riseH * 0.6, cx, topY);
            ctx.quadraticCurveTo(cx + halfW * 0.6, baseY - riseH * 0.6, cx + halfW, baseY);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(cx - halfW * 0.6, baseY);
            ctx.lineTo(cx - halfW * 0.25, baseY - riseH * 0.88);
            ctx.strokeStyle = this.colorAt(dist, Math.min(1, alpha0 * 1.45));
            ctx.lineWidth = 1.5 + pulse * 2.5;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    }

    // ─── IMPROVEMENT: renderHorizon with underglow ───────────────────────────
    // (replaces the original inline — same performance, adds gradient fill)

    // ─── IMPROVEMENT: renderRing with inward spikes ──────────────────────────
    // (replaces the original inline — same loop cost, adds inner spike pass)

    _renderMode(mode) {
        switch (mode) {
            case 'ring':
                this.renderRing();
                break;
            case 'rings':
                this.renderPulseRings();
                break;
            case 'rise':
                this.renderRise();
                break;
            case 'columns':
                this.renderColumns();
                break;
            case 'scope':
                this.renderScope();
                break;
            case 'tris':
                this.renderPulseTriangles();
                break;
            case 'particles':
                this.renderParticleField();
                break;
            case 'star':
                this.renderParticleStar();
                break;
            case 'solar':
                this.renderSolarSystem();
                break;
            case 'hall':
                this.renderHall();
                break;
            case 'web':
                this.renderWeb();
                break;
            case 'helix':
                this.renderHelix();
                break;
            case 'cascade':
                this.renderCascade();
                break;
            case 'horizon':
            default:
                this.renderHorizon();
                break;
        }
    }

    _renderCurrentMode() {
        for (const mode of this._activeRenderModes()) {
            this._renderMode(mode);
        }
    }

    _crossfadeEase(startMs) {
        const elapsed = performance.now() - startMs;
        const t = Math.min(1, elapsed / THEME_TRANSITION_MS);
        return { t, ease: t * t * (3 - 2 * t) };
    }

    _modeFadeEase() {
        return this._crossfadeEase(this._modeFadeStart);
    }

    render() {
        const ctx = this.ctx;
        if (!ctx) return;

        this.updateHeights();
        ctx.clearRect(0, 0, this.W, this.H);
        const filtered = this._beginDrawFilter(ctx);
        try {
            if (this._trackCrossfade) {
                const { t, ease } = this._crossfadeEase(this._trackCrossfadeStart);
                const outAlpha = 1 - ease;
                if (outAlpha > 0.01) {
                    ctx.save();
                    ctx.globalAlpha = outAlpha;
                    ctx.drawImage(this._trackOutCanvas, 0, 0);
                    ctx.restore();
                }
                if (ease > 0.01) {
                    ctx.save();
                    ctx.globalAlpha = ease;
                    this._paletteOverrideLow = this._trackInPaletteLow;
                    this._paletteOverrideHigh = this._trackInPaletteHigh;
                    if (this._trackInMode) {
                        this._renderMode(this._trackInMode);
                    } else {
                        this._renderCurrentMode();
                    }
                    this._paletteOverrideLow = null;
                    this._paletteOverrideHigh = null;
                    ctx.restore();
                }
                if (t >= 1) {
                    this._trackCrossfade = false;
                    this.setPaletteColors(this._trackInPaletteLow, this._trackInPaletteHigh);
                    this.releasePaletteHold();
                    this._trackInMode = null;
                    this._trackInPaletteLow = null;
                    this._trackInPaletteHigh = null;
                }
                return;
            }

            if (this._modeFade > 0) {
                const { t, ease } = this._modeFadeEase();
                const oldAlpha = 1 - ease;
                if (oldAlpha > 0.01) {
                    ctx.save();
                    ctx.globalAlpha = oldAlpha;
                    ctx.drawImage(this._ghostCanvas, 0, 0);
                    ctx.restore();
                }
                if (ease > 0.01) {
                    ctx.save();
                    ctx.globalAlpha = ease;
                    this._renderCurrentMode();
                    ctx.restore();
                }
                if (t >= 1) this._modeFade = 0;
                return;
            }

            this._renderCurrentMode();
        } finally {
            this._endDrawFilter(ctx, filtered);
        }
    }

    start() {
        if (this._disabled) return;
        if (this._running) return;
        this._running = true;
        this.refreshPalette();
        const loop = (now) => {
            if (!this._running) return;
            if (now - this._lastFrame >= this._frameInterval) {
                this._lastFrame = now;
                this.render();
            }
            this._rafId = requestAnimationFrame(loop);
        };
        this._rafId = requestAnimationFrame(loop);
    }
}



let _visualizer = null;
let _lastShuffleTrackKey = '';
let _lastCycleTrackKey = '';

export function resetVizCycleTrackKey() {
    _lastCycleTrackKey = '';
}

function applyCycleViz(opts = {}) {
    const viz = getVisualizer();
    if (!viz) return null;
    const pool = getEnabledVizPool();
    if (!pool.length) return null;
    let idx = 0;
    if (opts.initial) {
        const current = viz._shuffleMode || viz.mode;
        const curIdx = pool.indexOf(current);
        idx = curIdx >= 0 ? curIdx : 0;
    } else {
        const raw = parseInt(localStorage.getItem(VIZ_CYCLE_INDEX_KEY) || '0', 10);
        idx = Number.isFinite(raw) ? raw : 0;
    }
    idx = ((idx % pool.length) + pool.length) % pool.length;
    localStorage.setItem(VIZ_CYCLE_INDEX_KEY, String(idx));
    if (opts.initial) viz._modeFade = 0;
    viz.setShuffleMode(pool[idx], { fade: !opts.initial });
    return pool[idx];
}

export function getVisualizer() {
    return _visualizer;
}

export function pickRandomVizMode(opts = {}) {
    const viz = getVisualizer();
    if (!viz) return null;
    const modes = getEnabledVizPool();
    if (!modes.length) return null;
    if (opts.initial) viz._modeFade = 0;
    if (modes.length === 1) {
        viz.setShuffleMode(modes[0], { fade: false });
        return modes[0];
    }
    const current = viz._shuffleMode || viz.mode;
    let next = current;
    for (let n = 0; n < 12 && next === current; n++) {
        next = modes[Math.floor(Math.random() * modes.length)];
    }
    viz.setShuffleMode(next, { fade: opts.fade ?? false });
    return next;
}

function pickNextShuffleMode() {
    const viz = getVisualizer();
    if (!viz) return null;
    const modes = getEnabledVizPool();
    if (!modes.length) return null;
    if (modes.length === 1) return modes[0];
    const current = viz._shuffleMode || viz.mode;
    let next = current;
    for (let n = 0; n < 12 && next === current; n++) {
        next = modes[Math.floor(Math.random() * modes.length)];
    }
    return next;
}

function pickNextCycleMode() {
    const pool = getEnabledVizPool();
    if (!pool.length) return null;
    const raw = parseInt(localStorage.getItem(VIZ_CYCLE_INDEX_KEY) || '0', 10);
    let idx = Number.isFinite(raw) ? raw + 1 : 0;
    idx = ((idx % pool.length) + pool.length) % pool.length;
    localStorage.setItem(VIZ_CYCLE_INDEX_KEY, String(idx));
    return pool[idx];
}

export function beginVizPaletteCrossfade(paletteLow, paletteHigh) {
    if (getDisableVisualizer()) return;
    getVisualizer()?.beginPaletteCrossfade(paletteLow, paletteHigh);
}

export function beginShuffleCycleTrackCrossfade(trackKey, paletteLow, paletteHigh, opts = {}) {
    const selMode = getVizSelectionMode();
    if (getDisableVisualizer()) return null;
    const viz = getVisualizer();
    if (!viz || !paletteLow || !paletteHigh) return null;

    let nextMode = null;
    if (selMode === 'shuffle') {
        if (!opts.force && trackKey && trackKey === _lastShuffleTrackKey) return null;
        if (trackKey) _lastShuffleTrackKey = trackKey;
        nextMode = pickNextShuffleMode();
    } else if (selMode === 'cycle') {
        if (!opts.force && trackKey && trackKey === _lastCycleTrackKey) return null;
        if (trackKey) _lastCycleTrackKey = trackKey;
        nextMode = pickNextCycleMode();
    } else {
        return null;
    }
    if (!nextMode) return null;
    viz.beginTrackCrossfade(nextMode, paletteLow, paletteHigh);
    return nextMode;
}

export function resetVizShuffleTrackKey() {
    _lastShuffleTrackKey = '';
}

export function shuffleVizModeOnTrackChange(trackKey, opts = {}) {
    if (getDisableVisualizer() || getVizSelectionMode() !== 'shuffle') return;
    if (!opts.force && trackKey && trackKey === _lastShuffleTrackKey) return;
    if (trackKey) _lastShuffleTrackKey = trackKey;
    const next = pickNextShuffleMode();
    if (next) getVisualizer()?.setShuffleMode(next, { fade: false });
}

export function cycleVizModeOnTrackChange(trackKey, opts = {}) {
    if (getDisableVisualizer() || getVizSelectionMode() !== 'cycle') return;
    if (!opts.force && trackKey && trackKey === _lastCycleTrackKey) return;
    if (trackKey) _lastCycleTrackKey = trackKey;
    const next = pickNextCycleMode();
    if (next) getVisualizer()?.setShuffleMode(next, { fade: false });
}

export function vizModeOnTrackChange(trackKey, opts = {}) {
    shuffleVizModeOnTrackChange(trackKey, opts);
    cycleVizModeOnTrackChange(trackKey, opts);
}

export function applyStoredVizMode() {
    const selMode = getVizSelectionMode();
    if (selMode === 'shuffle' || selMode === 'cycle') return;
    const viz = getVisualizer();
    if (!viz) return;
    viz._shuffleMode = null;
    viz.setModes(getVizModes(), { fromShuffle: true });
}

export function createVisualizer(canvas) {
    migrateVizSelectionPreference();
    _visualizer = new AudioVisualizer(canvas);
    const selMode = getVizSelectionMode();
    if (selMode === 'shuffle') {
        pickRandomVizMode({ initial: true });
    } else if (selMode === 'cycle') {
        applyCycleViz({ initial: true });
    } else {
        _visualizer.setModes(getVizModes(), { fromShuffle: true });
    }
    _visualizer.setBarCount(getVizBarCount());
    _visualizer.setFrameRate(getVizFps());
    return _visualizer;
}

export async function tryAttachVisualizer() {
    if (getDisableVisualizer()) return false;
    const player = window.playerInstance;
    if (!player) return false;
    const gainNode = player.audioProcessor?.gainNode;
    const audioContext = player.audioContext;
    if (gainNode && audioContext) {
        _visualizer?.attachToGain(gainNode, audioContext);
        return true;
    }
    const analyser = player.analyserNode;
    if (analyser && audioContext) {
        _visualizer?.attachAnalyser(analyser, audioContext);
        return true;
    }
    return false;
}

function syncVisualizerDocumentVisibility() {
    const viz = getVisualizer();
    if (!viz) return;
    if (document.hidden || viz._disabled) {
        viz.stop();
        return;
    }
    if (!viz._running) viz.start();
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', syncVisualizerDocumentVisibility);
}
