import {
  MA_ALLOWED_IMAGE_SIZES,
} from '../constants.js';

/** MA image URL helpers (no server config) */

export function isMaImageProxyUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return url.includes('/imageproxy');
}

export function artUrlHasAudioPath(url) {
    if (!url || typeof url !== 'string') return false;
    // MA imageproxy uses audio file paths to extract embedded cover art via ffmpeg
    if (isMaImageProxyUrl(url)) return false;
    return /\.(mp3|flac|m4a|ogg|wav|opus|aac)(\?|#|$)/i.test(url);
}

export function snapMaImageSize(size) {
    const want = Number(size) || 0;
    if (want <= 0) return 0;
    for (const allowed of MA_ALLOWED_IMAGE_SIZES) {
        if (allowed >= want) return allowed;
    }
    return 1024;
}

export function isMaImageProxyId(value) {
    return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}
