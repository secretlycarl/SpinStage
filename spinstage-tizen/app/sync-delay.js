/**
 * Group sync offsets (two layers stored in MA).
 *
 * sendspin_static_delay — Sendspin spec: higher = play earlier (platform / catch-up).
 * spinstage_group_trim_ms — additive delay vs leader (+ = play later).
 *
 * Net offset vs leader (display): trim − static
 *   +N = N ms behind leader · −N = N ms ahead · 0 = aligned (leader anchor)
 *
 * Schedule: target − static_delay + group_trim (+ output latency comp, separate).
 */
export const STATIC_DELAY_MIN_MS = 0;

export const STATIC_DELAY_MAX_MS = 5000;

export const GROUP_TRIM_MIN_MS = 0;

export const GROUP_TRIM_MAX_MS = 5000;

/** @deprecated legacy trim key — no longer written. */
export const PLAYBACK_DELAY_CONFIG_KEY = 'spinstage_playback_delay_ms';

export function clampStaticDelayMs(delayMs) {
    if (!Number.isFinite(delayMs)) return 0;
    return Math.max(STATIC_DELAY_MIN_MS, Math.min(STATIC_DELAY_MAX_MS, Math.round(delayMs)));
}

export function clampGroupTrimMs(trimMs) {
    if (!Number.isFinite(trimMs)) return 0;
    return Math.max(GROUP_TRIM_MIN_MS, Math.min(GROUP_TRIM_MAX_MS, Math.round(trimMs)));
}

/** Signed offset vs leader for UI (+ = behind, − = ahead). */
export function netGroupOffsetMs(staticDelayMs, groupTrimMs) {
    return clampGroupTrimMs(groupTrimMs) - clampStaticDelayMs(staticDelayMs);
}

export function formatNetOffsetLabel(staticDelayMs, groupTrimMs) {
    const net = netGroupOffsetMs(staticDelayMs, groupTrimMs);
    if (net === 0) return '0 ms';
    return net > 0 ? `+${net} ms` : `${net} ms`;
}

/** @deprecated use formatNetOffsetLabel */
export function formatStaticDelayLabel(ms) {
    return formatNetOffsetLabel(0, ms);
}

export function groupOffsetHintText(staticDelayMs, groupTrimMs, { isLeader = false } = {}) {
    if (isLeader) {
        return 'Leader · 0 ms anchor';
    }
    const net = netGroupOffsetMs(staticDelayMs, groupTrimMs);
    const staticMs = clampStaticDelayMs(staticDelayMs);
    const trimMs = clampGroupTrimMs(groupTrimMs);
    if (net === 0 && staticMs === 0 && trimMs === 0) {
        return '0 ms · + if ahead · − if behind';
    }
    const parts = [`${formatNetOffsetLabel(staticMs, trimMs)} vs leader`];
    if (staticMs > 0) parts.push(`catch-up ${staticMs} ms`);
    if (trimMs > 0) parts.push(`delay ${trimMs} ms`);
    return parts.join(' · ');
}

/** @deprecated */
export function staticDelayHintText(ms) {
    return groupOffsetHintText(0, ms);
}
