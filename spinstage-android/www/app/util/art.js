import {
  buildMaServerOrigin, getDefaultServerAddress,
} from './server.js';
import {
  isMaImageProxyId, isMaImageProxyUrl, artUrlHasAudioPath, snapMaImageSize,
} from './art-url.js';

/** MA artwork URL builders */

export function rewriteMaArtHost(url) {
    if (!url || !/^https?:\/\//i.test(url)) return url;
    const configured = buildMaServerOrigin(getDefaultServerAddress());
    if (!configured) return url;
    try {
        const src = new URL(url);
        const cfg = new URL(configured);
        // Only rehost MA's own imageproxy URLs. Do NOT match a bare
        // `/image/...` path: remote provider art (e.g. Spotify's
        // i.scdn.co/image/<id>) also lives under /image and must be
        // loaded from its original host, not rewritten to the MA server.
        const isMaArt = src.pathname.includes('/imageproxy');
        if (!isMaArt) return url;
        if (src.host === cfg.host && src.protocol === cfg.protocol) return url;
        src.protocol = cfg.protocol;
        src.host = cfg.host;
        return src.toString();
    } catch (err) {
        return url;
    }
}

export function normalizeArtUrl(url) {
    if (!url || typeof url !== 'string') return '';
    if (artUrlHasAudioPath(url)) return '';
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    let out = /^https?:\/\//i.test(url) ? rewriteMaArtHost(url) : url;
    if (artUrlHasAudioPath(out)) return '';
    return out;
}

export function resolveArtUrl(url) {
    if (!url || typeof url !== 'string') return '';
    if (artUrlHasAudioPath(url)) return '';
    if (/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
        return normalizeArtUrl(url);
    }
    const origin = buildMaServerOrigin(getDefaultServerAddress());
    if (!origin) return '';
    const built = url.startsWith('/') ? `${origin}${url}` : `${origin}/${url}`;
    return normalizeArtUrl(built);
}

export function buildMaImageProxyIdUrl(proxyId, size = 512, fmt = 'jpeg') {
    if (!isMaImageProxyId(proxyId)) return '';
    const origin = buildMaServerOrigin(getDefaultServerAddress());
    if (!origin) return '';
    return rewriteMaArtHost(
        `${origin}/imageproxy/${proxyId.toLowerCase()}?size=${snapMaImageSize(size)}&fmt=${fmt}`,
    );
}

export function buildMaImageProxyUrl(path, provider, size = 512, fmt = 'jpeg') {
    if (!path) return '';
    const origin = buildMaServerOrigin(getDefaultServerAddress());
    if (!origin) return '';
    const encodedPath = encodeURIComponent(String(path));
    const prov = provider || 'library';
    return rewriteMaArtHost(
        `${origin}/imageproxy?provider=${encodeURIComponent(prov)}`
        + `&size=${snapMaImageSize(size)}&fmt=${fmt}&path=${encodedPath}`,
    );
}

export function preferMaImageProxyFormat(url, fmt = 'png') {
    if (!url || !isMaImageProxyUrl(url)) return url;
    try {
        const parsed = new URL(url, window.location.href);
        parsed.searchParams.set('fmt', fmt);
        return rewriteMaArtHost(parsed.toString());
    } catch (err) {
        return url.replace(/([?&]fmt=)[^&]+/i, `$1${fmt}`);
    }
}

export function buildMaArtUrlFromImage(image, size = 512, fmt = 'jpeg') {
    if (!image) return '';
    if (isMaImageProxyId(image.proxy_id)) {
        const proxied = buildMaImageProxyIdUrl(image.proxy_id, size, fmt);
        if (proxied) return proxied;
    }
    const path = image.path != null ? String(image.path) : '';
    if (!path) return '';
    if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
        return normalizeArtUrl(path);
    }
    if (path.includes('/imageproxy')) return normalizeArtUrl(path);
    const provider = image.provider || image.provider_instance || 'library';
    return buildMaImageProxyUrl(path, provider, size, fmt);
}

export function pickArtistImage(item) {
    const imgs = [];
    if (item.image) imgs.push(item.image);
    if (Array.isArray(item.metadata?.images)) imgs.push(...item.metadata.images);
    const usable = imgs.filter((im) => im && (isMaImageProxyId(im.proxy_id) || im.path));
    if (!usable.length) return null;
    const wide = new Set(['fanart', 'banner', 'logo']);
    return usable.find((im) => im.type === 'thumb')
        || usable.find((im) => !wide.has(im.type))
        || usable[0];
}

export function buildMaImageUrlFromImage(image) {
    return buildMaArtUrlFromImage(image, 512);
}

export function getArtUrl(item) {
    if (!item) return '';
    const imageObjects = [
        item.image,
        item.album?.image,
        item.metadata?.images?.[0],
        item.album?.metadata?.images?.[0],
    ];
    for (const img of imageObjects) {
        if (img?.path) {
            const url = buildMaImageUrlFromImage(img);
            if (url) return url;
        }
    }
    const candidates = [
        item.image_url,
        item.image?.url,
        item.album?.image?.url,
        item.album?.metadata?.image,
        item.metadata?.image,
        item.artwork_url, item.artwork, item.art,
        item.thumbnail, item.thumb,
    ];
    for (const raw of candidates) {
        const resolved = resolveArtUrl(raw);
        if (resolved) return resolved;
    }
    if (item.album && item !== item.album) {
        const albumArt = getArtUrl(item.album);
        if (albumArt) return albumArt;
    }
    return '';
}
