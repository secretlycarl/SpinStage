/**
 * MA session token storage (minted after username/password login).
 * Android: Android Keystore via Capacitor SecureStorage plugin
 * Browser / webOS: sessionStorage (repopulated from config/user-settings.json on cold start)
 */
import { IS_ANDROID, MA_API_TOKEN_KEY } from './constants.js';

const SECURE_KEY = 'ma_api_token';
const SESSION_KEY = 'ma_api_token';
const LOCAL_TOKEN_FALLBACK_KEY = 'ma_api_token_persist';

let tokenCache = '';
let secureStorage = null;
let secureStorageChecked = false;

function loadSecureStorage() {
    if (!IS_ANDROID || secureStorageChecked) return secureStorage;
    secureStorageChecked = true;
    secureStorage = window.Capacitor?.Plugins?.SecureStorage ?? null;
    return secureStorage;
}

export function getMaApiTokenSync() {
    return tokenCache;
}

export async function initAuthToken() {
    const legacy = (localStorage.getItem(MA_API_TOKEN_KEY) || '').trim();
    if (legacy) {
        localStorage.removeItem(MA_API_TOKEN_KEY);
        await setMaApiToken(legacy);
        return;
    }

    const storage = loadSecureStorage();
    if (storage) {
        try {
            const val = await storage.get(SECURE_KEY);
            tokenCache = typeof val === 'string' ? val.trim() : '';
            if (tokenCache) return;
        } catch (_) { /* first run */ }
    }

    tokenCache = (sessionStorage.getItem(SESSION_KEY) || '').trim();
    if (!tokenCache && IS_ANDROID) {
        tokenCache = (localStorage.getItem(LOCAL_TOKEN_FALLBACK_KEY) || '').trim();
    }
}

export async function setMaApiToken(token) {
    const value = (token || '').trim();
    tokenCache = value;
    localStorage.removeItem(MA_API_TOKEN_KEY);

    const storage = loadSecureStorage();
    if (storage) {
        try {
            if (value) {
                await storage.set(SECURE_KEY, value);
            } else {
                await storage.remove(SECURE_KEY);
            }
            sessionStorage.removeItem(SESSION_KEY);
            if (value) localStorage.setItem(LOCAL_TOKEN_FALLBACK_KEY, value);
            else localStorage.removeItem(LOCAL_TOKEN_FALLBACK_KEY);
            return;
        } catch (err) {
            console.warn('Secure token storage failed, using sessionStorage:', err);
        }
    }

    if (value) {
        sessionStorage.setItem(SESSION_KEY, value);
        if (IS_ANDROID) localStorage.setItem(LOCAL_TOKEN_FALLBACK_KEY, value);
    } else {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(LOCAL_TOKEN_FALLBACK_KEY);
    }
}

export async function clearMaApiToken() {
    await setMaApiToken('');
}
