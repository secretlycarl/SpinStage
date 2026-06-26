/**
 * Callbacks from UI panel modules into spinstage-app (avoids circular imports).
 * Wired once at module load via registerUiHandlers() in spinstage-app.js.
 */
export const uiHandlers = {};

export function registerUiHandlers(handlers) {
    Object.assign(uiHandlers, handlers);
}

export function callUiHandler(name, ...args) {
    const fn = uiHandlers[name];
    if (typeof fn !== 'function') {
        console.warn(`uiHandler missing: ${name}`);
        return undefined;
    }
    return fn(...args);
}

/** Shorthand for handler calls used throughout ui/*.js */
export function uiH(name, ...args) {
    return callUiHandler(name, ...args);
}
