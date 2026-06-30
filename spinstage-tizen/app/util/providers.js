/** Music Assistant provider id helpers */

export const SPOTIFY_LIBRARY_ID_SUFFIX = '__library';

export function normalizeProviderId(provider) {
    if (provider == null || provider === '' || provider === 0 || provider === '0') return 'library';
    const dom = String(provider).split('--')[0].toLowerCase();
    if (!dom || dom === '0' || dom === 'undefined' || dom === 'null') return 'library';
    if (dom.startsWith('filesystem')) return dom;
    if (dom === 'library') return 'library';
    return String(provider);
}

export function providerDomainIncludes(providerId, hint) {
    return normalizeProviderId(providerId).split('--')[0].toLowerCase().includes(hint);
}

export function isSpotifyLibraryProviderId(providerId) {
    return typeof providerId === 'string' && providerId.endsWith(SPOTIFY_LIBRARY_ID_SUFFIX);
}

export function spotifyLibraryBaseProviderId(providerId) {
    return String(providerId).slice(0, -SPOTIFY_LIBRARY_ID_SUFFIX.length);
}

export function makeSpotifyLibraryProviderId(spotifyProviderId) {
    return `${spotifyProviderId}${SPOTIFY_LIBRARY_ID_SUFFIX}`;
}

export function spotifyLibraryProviderLabel(spotifyProviderName, multipleAccounts) {
    if (!multipleAccounts) return 'Spotify Library';
    return `${spotifyProviderName} Library`;
}

export function isSpotifyProvider(provider) {
    if (isSpotifyLibraryProviderId(provider)) {
        return isSpotifyProvider(spotifyLibraryBaseProviderId(provider));
    }
    const dom = String(normalizeProviderId(provider)).split('--')[0].toLowerCase();
    return dom === 'spotify' || dom === 'spotify_connect';
}

export function spotifyProviderIdsMatch(requestedId, itemProvider) {
    const want = String(requestedId);
    const got = String(itemProvider || '');
    if (!want || !got) return false;
    if (want === got) return true;
    const wantDom = want.split('--')[0].toLowerCase();
    const gotDom = got.split('--')[0].toLowerCase();
    return wantDom === gotDom;
}

export function providerFromUri(uri) {
    if (!uri || typeof uri !== 'string') return '';
    const match = uri.match(/^([a-z0-9_]+):\/\//i);
    return match ? match[1].toLowerCase() : '';
}

export function isLibraryLikeProvider(provider) {
    if (!provider) return true;
    if (isSpotifyLibraryProviderId(provider)) return false;
    const dom = String(provider).split('--')[0].toLowerCase();
    return dom === 'library' || dom.startsWith('filesystem');
}

export function pickExternalMapping(mappings) {
    if (!Array.isArray(mappings) || !mappings.length) return '';
    const external = mappings.find((m) => {
        const raw = m.provider_instance || m.provider_instance_id
            || m.provider_domain || m.provider || '';
        return raw && !isLibraryLikeProvider(raw);
    });
    if (!external) return '';
    return external.provider_instance || external.provider_instance_id
        || external.provider_domain || external.provider;
}

export function itemStoredProviderId(item) {
    return normalizeProviderId(item?.provider_instance_id || item?.provider || 'library');
}

export function itemProviderId(item) {
    if (!item) return 'library';

    const mappingSources = [
        item.provider_mappings,
        item.metadata?.provider_mappings,
        item.album?.provider_mappings,
        item.podcast?.provider_mappings,
    ];
    for (const mappings of mappingSources) {
        const mapped = pickExternalMapping(mappings);
        if (mapped) return mapped;
    }

    if (item.external_ids && typeof item.external_ids === 'object') {
        const ext = Object.keys(item.external_ids).find((k) => !isLibraryLikeProvider(k));
        if (ext) return ext;
    }

    const uri = item.uri || item.path || '';
    const fromUri = providerFromUri(uri);
    if (fromUri && !isLibraryLikeProvider(fromUri)) return fromUri;

    const nested = [
        item.provider_instance_id,
        item.provider,
        item.album?.provider_instance_id,
        item.album?.provider,
        item.artists?.[0]?.provider_instance_id,
        item.artists?.[0]?.provider,
        item.podcast?.provider_instance_id,
        item.podcast?.provider,
        item.metadata?.provider,
        item.metadata?.source,
    ];
    for (const src of nested) {
        if (src && !isLibraryLikeProvider(src)) return src;
    }

    if (fromUri) return normalizeProviderId(fromUri);
    return normalizeProviderId(item.provider_instance_id || item.provider || 'library');
}

export function isInMaLibrary(item) {
    return isLibraryLikeProvider(itemStoredProviderId(item));
}

export function itemHasSpotifyInLibraryMapping(item, spotifyProviderIds) {
    const mappings = item?.provider_mappings;
    if (!Array.isArray(mappings) || !mappings.length) return false;
    return mappings.some((mapping) => {
        if (mapping.in_library === false) return false;
        const inst = mapping.provider_instance || mapping.provider_instance_id || '';
        const dom = mapping.provider_domain || mapping.provider || '';
        if (!isSpotifyProvider(inst || dom)) return false;
        return spotifyProviderIds.some(
            (pid) => spotifyProviderIdsMatch(pid, inst) || spotifyProviderIdsMatch(pid, dom),
        );
    });
}

export function providerIconDomain(provider) {
    return String(normalizeProviderId(provider)).split('--')[0].toLowerCase();
}

export function providerIcon(provider) {
    if (provider === 'all') return 'grid.svg';
    if (isSpotifyLibraryProviderId(provider)) {
        return providerIcon(spotifyLibraryBaseProviderId(provider));
    }
    const normalized = normalizeProviderId(provider);
    if (normalized === 'library') return 'library.svg';
    const domain = String(normalized).split('--')[0].toLowerCase();
    const aliases = {
        spotify_connect: 'spotify',
        filesystem_local: 'filesystem_local',
        filesystem_smb: 'filesystem_smb',
        filesystem_nfs: 'filesystem_nfs',
    };
    const mapped = aliases[domain] || domain;
    return `providers/${mapped}.svg`;
}

export function providerIconMono(provider) {
    if (provider === 'all') return true;
    if (isLibraryLikeProvider(provider)) return true;
    return providerIconDomain(provider) === 'internet_archive';
}

export function providerHasFeature(provider, feature) {
    const features = provider?.supported_features;
    if (!Array.isArray(features) || !features.length) return false;
    return features.includes(feature);
}

export function isExcludedRadioBrowseProvider(provider) {
    if (!provider?.id) return true;
    const dom = normalizeProviderId(provider.id).split('--')[0].toLowerCase();
    return dom === 'builtin';
}

export function isRadioCapableProvider(provider) {
    if (!provider?.id) return false;
    if (isLibraryLikeProvider(provider.id)) return false;
    if (isExcludedRadioBrowseProvider(provider)) return false;
    return providerHasFeature(provider, 'library_radios')
        || providerHasFeature(provider, 'browse')
        || providerHasFeature(provider, 'search');
}

export function formatMaDuration(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    if (s >= 3600) {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return `${h}h ${m}m`;
    }
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/** Normalize MA provider display names for UI. */
export function normalizeProviderDisplayName(name, providerId = '') {
    const trimmed = (name || '').trim();
    if (!trimmed) return trimmed;
    if (/^filesystem\s*\(local disk\)$/i.test(trimmed)) return 'Filesystem';
    const dom = String(normalizeProviderId(providerId)).split('--')[0].toLowerCase();
    if (dom.startsWith('filesystem') && /^filesystem\b/i.test(trimmed)) return 'Filesystem';
    return trimmed;
}
