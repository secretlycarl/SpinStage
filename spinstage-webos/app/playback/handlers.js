/**
 * Callbacks from playback modules into spinstage-app (avoids circular imports).
 * Wired once at module load via registerNpHandlers() in spinstage-app.js.
 */
export const npHandlers = {};

export function registerNpHandlers(handlers) {
    Object.assign(npHandlers, handlers);
}

export function callNpHandler(name, ...args) {
    const fn = npHandlers[name];
    if (typeof fn !== 'function') {
        console.warn(`npHandler missing: ${name}`);
        return undefined;
    }
    return fn(...args);
}

/** Shorthand for handler calls used throughout playback modules */
export function npH(name, ...args) {
    return callNpHandler(name, ...args);
}
