import {
  DEFAULT_SERVER_ADDRESS, DEFAULT_PLAYER_NAME,
} from '../constants.js';

/** MA / Sendspin server URL helpers */

export function buildSendspinPlayerId(playerName, platform = 'browser') {
    const slug = String(playerName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    if (!slug) return 'browser-player';
    if (platform === 'android') return `android-${slug}`;
    if (platform === 'webos') return `webos-${slug}`;
    return `browser-${slug}`;
}

export function buildBaseUrl(address) {
    const trimmed = address.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed.replace(/\/$/, '');
    }

    // IPv4 — local LAN or laptop bridge (direct Sendspin on 8927)
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(trimmed)) {
        return trimmed.includes(':') ? `http://${trimmed}` : `http://${trimmed}:8927`;
    }

    // Hostname — Cloudflare tunnel (WSS on 443)
    return `https://${trimmed.replace(/\/$/, '')}`;
}

export function buildMaServerOrigin(address) {
    const trimmed = (address || '').trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed.replace(/\/$/, '');
    }

    if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(trimmed)) {
        const host = trimmed.includes(':') ? trimmed : `${trimmed}:8095`;
        return `http://${host}`;
    }

    return `https://${trimmed.replace(/\/$/, '')}`;
}

export function buildMaWsUrl(address) {
    const origin = buildMaServerOrigin(address);
    if (!origin) return null;
    const url = new URL(origin);
    const proto = url.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${url.host}/ws`;
}

export function getDefaultServerAddress() {
    return localStorage.getItem('ma_server_ip') || DEFAULT_SERVER_ADDRESS;
}

export function getDefaultPlayerName() {
    return localStorage.getItem('ma_player_name') || DEFAULT_PLAYER_NAME;
}

export function findMaPlayer(players, playerName) {
    const needle = playerName.trim().toLowerCase();
    if (!needle) return null;
    const slug = needle.replace(/[^a-z0-9]/g, '-');
    const candidateIds = [
        `browser-${slug}`,
        `android-${slug}`,
        `webos-${slug}`,
    ];
    return players.find((p) => {
        const fields = [p.name, p.display_name, p.player_id].filter(Boolean);
        if (fields.some((f) => String(f).trim().toLowerCase() === needle)) return true;
        const pid = String(p.player_id || '').toLowerCase();
        if (candidateIds.includes(pid)) return true;
        if (pid.endsWith(`-${slug}`) || pid.endsWith(slug)) return true;
        return false;
    });
}
