/** Resolve MA genre row icons (icons/genres/*.svg) from item name / translation_key. */

let _aliasMap = null;
let _loadPromise = null;

/** translation_keys that have a bundled SVG under icons/genres/ */
const AVAILABLE_GENRE_ICONS = new Set([
    'afrobeats', 'ambient', 'anime_and_video_game_music', 'asian_music', 'bluegrass',
    'blues', 'brazilian_music', 'chanson', 'childrens_music', 'christmas_music',
    'church_music', 'classical', 'comedy', 'country', 'dance', 'dark_ambient',
    'dark_wave', 'disco', 'electronic', 'experimental', 'field_recording', 'folk',
    'funk', 'gangsta_rap', 'gospel', 'hip_hop', 'indian_classical', 'industrial',
    'jazz', 'klezmer', 'latin', 'marching_band', 'metal', 'middle_eastern_music',
    'musical', 'new_age', 'poetry', 'polka', 'pop', 'psychedelic', 'punk',
    'ragtime', 'rai', 'r_b', 'reggae', 'reggaeton', 'rock', 'salsa',
    'singer_songwriter', 'ska', 'soul', 'sound_effects', 'soundtrack',
    'spoken_word', 'swing', 'tango', 'trap', 'waltz', 'wellness',
]);

function normalizeGenreKey(value) {
    return (value || '').toLowerCase().trim();
}

function slugGenreKey(value) {
    return normalizeGenreKey(value).replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function genreIconPath(translationKey) {
    const key = slugGenreKey(translationKey);
    if (!key || !AVAILABLE_GENRE_ICONS.has(key)) return null;
    return `genres/${key}.svg`;
}

function registerGenreIcon(key, iconPath, map) {
    const norm = normalizeGenreKey(key);
    if (!norm) return;
    if (!map.has(norm)) map.set(norm, iconPath);
    const slug = slugGenreKey(key);
    if (slug && !map.has(slug)) map.set(slug, iconPath);
}

async function ensureGenreIconMap() {
    if (_aliasMap) return _aliasMap;
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
        const map = new Map();
        try {
            const res = await fetch('icons/genres/genre_mapping.json');
            if (res.ok) {
                const entries = await res.json();
                if (Array.isArray(entries)) {
                    for (const entry of entries) {
                        const icon = genreIconPath(entry.translation_key);
                        if (!icon) continue;
                        registerGenreIcon(entry.translation_key, icon, map);
                        registerGenreIcon(entry.genre, icon, map);
                        for (const alias of entry.aliases || []) {
                            registerGenreIcon(alias, icon, map);
                        }
                    }
                }
            }
        } catch {
            /* offline / file missing — fall back to generic icon */
        }
        _aliasMap = map;
        return map;
    })();
    return _loadPromise;
}

export async function preloadGenreIconMap() {
    await ensureGenreIconMap();
}

export function resolveGenreIconSync(item) {
    const map = _aliasMap;
    const candidates = [
        item?.translation_key,
        item?.translationKey,
        item?.name,
        item?.title,
        item?.raw?.translation_key,
        item?.raw?.name,
    ];
    for (const candidate of candidates) {
        const norm = normalizeGenreKey(candidate);
        if (norm && map?.has(norm)) return map.get(norm);
        const slug = slugGenreKey(candidate);
        if (slug && map?.has(slug)) return map.get(slug);
    }
    return 'genres.svg';
}

export async function resolveGenreIcon(item) {
    await ensureGenreIconMap();
    return resolveGenreIconSync(item);
}
