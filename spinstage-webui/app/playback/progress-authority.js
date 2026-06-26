/**
 * Explicit progress / now-playing authority between MA queue and Sendspin stream.
 */
import { state } from '../state.js';

export const ProgressAuthorityMode = {
    IDLE: 'idle',
    MA: 'ma',
    SENDSPIN: 'sendspin',
    SEEKING: 'seeking',
    RECOVERING: 'recovering',
};

/**
 * @param {{
 *   isSeeking?: boolean,
 *   isSeekAuthorityActive?: boolean,
 *   sendspinStale?: boolean,
 *   localPlayback?: boolean,
 *   maQueueAuthorityActive?: boolean,
 *   recovering?: boolean,
 * }} ctx
 */
export function getProgressAuthorityMode(ctx = {}) {
    if (ctx.isSeeking || ctx.isSeekAuthorityActive) {
        return ProgressAuthorityMode.SEEKING;
    }
    if (ctx.recovering) {
        return ProgressAuthorityMode.RECOVERING;
    }
    if (ctx.maQueueAuthorityActive) {
        return ProgressAuthorityMode.MA;
    }
    if (ctx.sendspinStale && ctx.localPlayback) {
        return ProgressAuthorityMode.SENDSPIN;
    }
    if (!ctx.localPlayback) {
        return ProgressAuthorityMode.MA;
    }
    return ProgressAuthorityMode.MA;
}

export function isSendspinAuthorityMode(mode) {
    return mode === ProgressAuthorityMode.SENDSPIN;
}

export function isMaAuthorityMode(mode) {
    return mode === ProgressAuthorityMode.MA
        || mode === ProgressAuthorityMode.RECOVERING
        || mode === ProgressAuthorityMode.IDLE;
}

export function isMaQueueAuthorityActive() {
    return Date.now() < state.maQueueAuthorityUntil;
}

export function touchMaQueueAuthority(untilMs) {
    state.maQueueAuthorityUntil = untilMs;
}

export function logProgressAuthority(mode, reason = '') {
    if (state.progressAuthorityMode === mode) return;
    state.progressAuthorityMode = mode;
    if (reason) {
        console.debug(`progress authority → ${mode} (${reason})`);
    }
}
