/**
 * Callbacks from maClient into spinstage-app (avoids circular imports).
 * Wired once at module load via registerMaHandlers() in spinstage-app.js.
 */
export const maHandlers = {};

export function registerMaHandlers(handlers) {
  Object.assign(maHandlers, handlers);
}

export function callHandler(name, ...args) {
  const fn = maHandlers[name];
  if (typeof fn !== 'function') {
    console.warn(`maHandler missing: ${name}`);
    return undefined;
  }
  return fn(...args);
}

/** Shorthand for handler calls used throughout client.js */
export function h(name, ...args) {
  return callHandler(name, ...args);
}
