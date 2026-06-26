import { IS_CAPACITOR, IS_WEBOS } from '../constants.js';

const LOCAL_SETTINGS_KEY = 'spinstage_user_settings';

function readLocalUserSettings() {
    try {
        const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : null;
    } catch (_) {
        return null;
    }
}

function writeLocalUserSettings(data) {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(data));
}

function loadBundledUserSettings() {
    const url = 'config/user-settings.json';
    return fetch(url, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((data) => {
            if (data) return data;
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, false);
                xhr.send(null);
                if (xhr.status === 200 || xhr.status === 0) {
                    return JSON.parse(xhr.responseText);
                }
            } catch (_) { /* optional */ }
            return null;
        });
}

/** Load saved or packaged user-settings (localStorage, then config/user-settings.json). */
export function loadUserSettingsConfig() {
    const local = readLocalUserSettings();
    if (local) return Promise.resolve(local);
    return loadBundledUserSettings();
}

export function getUserSettingsCredentials(d) {
    if (!d || typeof d !== 'object') return null;
    const username = String(d.username || '').trim();
    const password = String(d.password || '');
    if (!username || !password) return null;
    return { username, password };
}

export function applyUserSettingsConfig(d, { setServer, setPlayer, setUsername }) {
    if (!d || typeof d !== 'object') return;
    const server = String(d.server || '').trim();
    const player = String(d.playerName || '').trim();
    const username = String(d.username || '').trim();
    if (server && setServer) setServer(server);
    if (player && setPlayer) setPlayer(player);
    if (username && setUsername) setUsername(username);
}

function normalizeUserSettingsPayload(payload) {
    return {
        server: String(payload.server || '').trim(),
        playerName: String(payload.playerName || '').trim(),
        username: String(payload.username || '').trim(),
        password: String(payload.password || ''),
    };
}

/** Persist login settings (localStorage on device; disk file via dev server on browser webui). */
export async function saveUserSettingsConfig(payload) {
    const data = normalizeUserSettingsPayload(payload);
    writeLocalUserSettings(data);
    const isBrowserWebui = !IS_CAPACITOR && !IS_WEBOS && typeof webOS === 'undefined';
    if (!isBrowserWebui) return;
    const res = await fetch('/api/user-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        let detail = '';
        try { detail = await res.text(); } catch (_) { /* optional */ }
        throw new Error(detail || `save failed (${res.status})`);
    }
}
