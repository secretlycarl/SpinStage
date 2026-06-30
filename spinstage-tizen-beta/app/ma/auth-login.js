import { buildMaWsUrl } from '../util/server.js';

const WS_TIMEOUT_MS = 15000;
const SPINSTAGE_TOKEN_NAME = 'SpinStage';

let msgSeq = 0;

function nextMsgId() {
    msgSeq += 1;
    return `spin-auth-${msgSeq}`;
}

function openMaWsConnection(wsUrl) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const ws = new WebSocket(wsUrl);
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { ws.close(); } catch { /* ignore */ }
            reject(new Error('Music Assistant connection timed out'));
        }, WS_TIMEOUT_MS);

        const fail = (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch { /* ignore */ }
            reject(err instanceof Error ? err : new Error(String(err)));
        };

        ws.onerror = () => fail(new Error('Could not connect to Music Assistant'));
        ws.onmessage = (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            if (!msg?.server_id || settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(ws);
        };
    });
}

function wsSendCommand(ws, command, args = {}) {
    return new Promise((resolve, reject) => {
        const messageId = nextMsgId();
        const onMessage = (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            if (msg?.server_id || msg?.message_id !== messageId) return;
            ws.removeEventListener('message', onMessage);
            if (msg.error_code) {
                reject(new Error(msg.details || msg.error_code));
                return;
            }
            resolve(msg.result);
        };
        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify({ message_id: messageId, command, args }));
    });
}

export async function loginMaWithCredentials(serverAddress, username, password) {
    const wsUrl = buildMaWsUrl(serverAddress);
    if (!wsUrl) throw new Error('Invalid server address');

    const ws = await openMaWsConnection(wsUrl);
    try {
        const loginResult = await wsSendCommand(ws, 'auth/login', {
            username: String(username || '').trim(),
            password: String(password || ''),
            device_name: SPINSTAGE_TOKEN_NAME,
        });
        if (!loginResult?.success) {
            throw new Error(loginResult?.error || 'Login failed — check username and password');
        }
        const accessToken = loginResult.access_token;
        if (!accessToken) {
            throw new Error('Login failed — check username and password');
        }

        await wsSendCommand(ws, 'auth', { token: accessToken });

        try {
            const longLived = await wsSendCommand(ws, 'auth/token/create', { name: SPINSTAGE_TOKEN_NAME });
            if (typeof longLived === 'string' && longLived) return longLived;
        } catch (err) {
            console.warn('long-lived token creation failed, using session token:', err);
        }
        return accessToken;
    } finally {
        try { ws.close(); } catch { /* ignore */ }
    }
}

export async function validateMaToken(serverAddress, token) {
    if (!token) return false;
    const wsUrl = buildMaWsUrl(serverAddress);
    if (!wsUrl) return false;
    try {
        const ws = await openMaWsConnection(wsUrl);
        try {
            await wsSendCommand(ws, 'auth', { token });
            await wsSendCommand(ws, 'server/info', {});
            return true;
        } finally {
            try { ws.close(); } catch { /* ignore */ }
        }
    } catch {
        return false;
    }
}
