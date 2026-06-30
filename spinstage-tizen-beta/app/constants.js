/** App-wide immutable constants and platform flags */

export const DOCUMENT_TITLE_DEFAULT = 'SpinStage';

export const DOCUMENT_TITLE_MAX_LEN = 120;

/** Title length above which a two-line word wrap is considered (through TITLE_TWO_LINE_MAX_CHARS). */
export const TITLE_TWO_LINE_MIN_CHARS = 18;

/** Longest title that stays on two balanced lines before switching to single-line marquee. */
export const TITLE_TWO_LINE_MAX_CHARS = 58;

/** Single-line titles longer than this use edge fade before scrolling. */
export const TITLE_SINGLE_LINE_FADE_CHARS = 24;

export const IS_CAPACITOR = !!(window.Capacitor?.isNativePlatform?.());

export const IS_ANDROID = IS_CAPACITOR && window.Capacitor?.getPlatform?.() === 'android';

export const IS_WEBOS = typeof webOS !== 'undefined'; // SYNC-WEBOS:IS_WEBOS

export const IS_TIZEN = true; // SYNC-TIZEN:IS_TIZEN

export const IS_TV_REMOTE = IS_WEBOS || IS_TIZEN;

export const HAS_TOUCH_HARDWARE = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

export const ART_URL_CACHE_MAX = 80;

export const THEME_PREFETCH_CACHE_MAX = 40;

export const ARTIST_PROVIDERS_CACHE_MAX = 32;

export const METADATA_LOOKUP_CACHE_MAX = 64;

export const AUDIO_HEALTH_CHECK_MS = 12000;

export const THEME_TRANSITION_MS = 1000;

export const NP_VISUAL_DEBOUNCE_MS = 24;

export const NP_EFFECTS_DELAY_MS = 450;

export const ALBUM_ARTIST_CACHE_MAX = 64;
export const LYRICS_CACHE_MAX = 200;
export const BROWSE_PROVIDER_CACHE_MAX = 50;
export const RADIO_CATALOG_CACHE_MAX = 24;

export const PREFETCH_LEAD_MS = 3000;

export const PROGRESS_SOFT_DRIFT_MS = 80;

export const PROGRESS_HARD_RESYNC_MS = 2500;

export const PROGRESS_SOFT_CATCHUP_RATE = 0.12;

export const PROGRESS_END_CLAMP_MS = 1000;

export const MA_QUEUE_AUTHORITY_MS = 10000;

export const MA_WS_SEND_TIMEOUT_MS = 30000;

export const REMOTE_SEEK_STEP_MS = 10000;

export const SEEK_COMMIT_MS_UI = 150;

export const SEEK_COMMIT_MS_REMOTE = 1000;

export const SEEK_AUTHORITY_MS = 8000;

export const REMOTE_SEEK_REPEAT_MS = 1000 / 3;

export const SYNC_DELAY_STEP_MS = 20;

export const SYNC_DELAY_CUTOVER_DEBOUNCE_MS = 400;

export const SYNC_JOIN_RECOVERY_DELAY_MS = 800;

export const TIZEN_SYNC_JOIN_RECOVERY_DELAY_MS = 2200;

export const TIZEN_SYNC_JOIN_RECOVERY_DEBOUNCE_MS = 700;

export const TIZEN_STREAM_START_GROUP_RECOVERY_DELAY_MS = 1800;

export const ANDROID_SYNC_JOIN_RECOVERY_DELAY_MS = 2400;

export const ANDROID_STREAM_START_GROUP_RECOVERY_DELAY_MS = 500;

export const PLAYBACK_OFFSET_MIN_AHEAD_SEC = 0.5;

export const ANDROID_PLAYBACK_BUFFER_MIN_AHEAD_SEC = 1.0;

export const SYNC_DELAY_CONFIG_KEY = 'sendspin_static_delay';

export const GROUP_TRIM_CONFIG_KEY = 'spinstage_group_trim_ms';

export const SYNC_DELAY_LEGACY_KEYS = ['sendspin_sync_delay', 'sync_delay', 'static_delay'];

export const PLAYBACK_BUFFER_MIN_AHEAD_SEC = 0.35;

export const PLAYBACK_JOIN_BUFFER_WAIT_MS = 4000;

/** Advertised to Sendspin hello — smaller catch-up burst on weak TV clients. */
export const TIZEN_SENDSPIN_BUFFER_CAPACITY = 1024 * 1024;

export const SENDSPIN_BUFFER_CAPACITY_DEFAULT = 2 * 1024 * 1024;

export const MA_PROTOCOL_KEY_SPLITTER = '||protocol||';

export const CAST_MEMBER_JOIN_SETTLE_MS = 600;

export const CAST_MEMBER_SYNC_MAX_ATTEMPTS = 30;

export const CAST_MEMBER_SYNC_STEP_MS = 500;

export const GROUP_DISSOLVE_MAX_ATTEMPTS = 20;

export const GROUP_DISSOLVE_STEP_MS = 350;

export const BROWSE_VIEWS_MAX = 12;

export const ARTIST_PROVIDERS_CACHE_VERSION = 6;

export const PUBLIC_RUNTIME_CONFIG = true;

export const DEFAULT_PLAYER_VOLUME = 50;

export const ALPHA_VIEW_ITEM_THRESHOLD = 50;

export const ALPHA_GRID_COLS = 6;

export const BROWSE_ROOT_COLS = 3;

export const QUEUE_PAGE_SIZE = 50;

export const BROWSE_PAGE_SIZE = 50;

export const SEARCH_PAGE_SIZE = 40;

export const REPEAT_CYCLE = ['off', 'all', 'one'];

export const MODE_POLL_GRACE_MS = 1500;

export const BROWSE_ROOT_SHORTCUTS = [
    { key: 'search', title: 'Search', icon: 'search.svg', kind: 'nav' },
    { key: 'recently_added', title: 'Recently Added', icon: 'recently-added.svg', kind: 'nav' },
    { key: 'recent', title: 'Recently Played', icon: 'recently-played.svg', kind: 'nav' },
    { key: 'favorites', title: 'Favorites', icon: 'favorites.svg', kind: 'nav' },
    { key: 'artists', title: 'Artists', icon: 'artists.svg', kind: 'nav' },
    { key: 'playlists', title: 'Playlists', icon: 'playlists.svg', kind: 'nav' },
    { key: 'radio', title: 'Radio Stations', icon: 'radio.svg', kind: 'nav' },
    { key: 'podcasts', title: 'Podcasts', icon: 'podcasts.svg', kind: 'nav' },
    { key: 'audiobooks', title: 'Audiobooks', icon: 'audiobooks.svg', kind: 'nav' },
    { key: 'recommended', title: 'Recommended', icon: 'compass.svg', kind: 'nav' },
    { key: 'continue', title: 'Continue', icon: 'clock.svg', kind: 'nav' },
    { key: 'genres', title: 'Genres', icon: 'genres.svg', kind: 'nav' },
];

export const UI_HIDE_MS = 8000;

export const SEARCH_FILTERS = [
    { id: 'all', label: 'All', icon: 'grid.svg' },
    { id: 'artist', label: 'Artists', icon: 'artists.svg' },
    { id: 'album', label: 'Albums', icon: 'albums.svg' },
    { id: 'track', label: 'Tracks', icon: 'tracks.svg' },
    { id: 'playlist', label: 'Playlists', icon: 'playlists.svg' },
    { id: 'audiobook', label: 'Audiobooks', icon: 'audiobooks.svg' },
    { id: 'radio', label: 'Radio', icon: 'radio.svg' },
    { id: 'podcast', label: 'Podcasts', icon: 'podcasts.svg' },
];

export const RECOMMENDED_MEDIA_FILTERS = [
    { id: 'all', label: 'All', icon: 'grid.svg' },
    { id: 'music', label: 'Music', icon: 'tracks.svg' },
    { id: 'radio', label: 'Radio', icon: 'radio.svg' },
    { id: 'podcast', label: 'Podcasts', icon: 'podcasts.svg' },
    { id: 'audiobook', label: 'Audiobooks', icon: 'audiobooks.svg' },
];

export const RADIO_BROWSE_FOLDER_HINTS = [
    'listen live', 'live radio', 'live stations', 'live', 'radio', 'stations', 'channels',
];

export const RADIO_BROWSE_TIME_BUDGET_MS = 12000;

export const RADIO_BROWSE_MAX_CALLS = 80;

export const RADIO_BROWSE_MAX_STATIONS = 800;

export const PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000;

export const BROWSE_PROVIDER_DEFAULTS = {
    artists: 'library',
    playlists: 'all',
    audiobooks: 'all',
    genres: 'all',
    radio: 'library',
    podcasts: 'all',
    recently_added: 'all',
};

export const BROWSE_PROVIDER_PREFS_KEY = 'spinstage_browse_provider_prefs';

export const SEARCH_UI_PREFS_KEY = 'spinstage_search_ui_prefs';

export const CONTAINER_ACTION_ENTRY_TYPES = ['artist', 'album', 'playlist', 'podcast', 'genre', 'track_versions', 'similar_tracks'];

export const BROWSE_SECTION_FEATURES = {
    playlists: 'library_playlists',
    radio: 'library_radios',
    podcasts: 'library_podcasts',
    audiobooks: 'library_audiobooks',
    genres: 'library_genres',
};

export const DISCOGRAPHY_ALBUM_SECTIONS = [
    { type: 'album', title: 'Albums', icon: 'albums.svg' },
    { type: 'ep', title: 'EPs', icon: 'albums.svg' },
    { type: 'single', title: 'Singles', icon: 'tracks.svg' },
    { type: 'compilation', title: 'Compilations', icon: 'albums.svg' },
    { type: 'live', title: 'Live', icon: 'albums.svg' },
    { type: 'soundtrack', title: 'Soundtracks', icon: 'albums.svg' },
    { type: 'unknown', title: 'Other', icon: 'albums.svg' },
];

export const BROWSE_SECTION_LIBRARY_TYPE = {
    playlists: 'playlists',
    podcasts: 'podcasts',
    audiobooks: 'audiobooks',
    genres: 'genres',
};

export const DEFAULT_SERVER_ADDRESS = '';

export const DEFAULT_PLAYER_NAME = '';

export const KEEP_AWAKE_KEY = 'ma_keep_awake';

export const ART_DISPLAY_MODE_KEY = 'spinstage_art_display_mode';

export const SHOW_LYRICS_KEY = 'spinstage_show_lyrics';

export const SHOW_CONNECTION_KEY = 'ma_show_connection';

export const RADIO_SWITCH_INFO_KEY = 'spinstage_radio_switch_info';

export const DISABLE_VISUALIZER_KEY = 'spinstage_disable_visualizer';

export const DISABLE_VIZ_BLUR_KEY = 'spinstage_disable_viz_blur';

export const VIZ_BAR_COUNT_KEY = 'spinstage_viz_bar_count';

/** Platform defaults: Tizen lowest, webOS low, Android mid, browser/web UI highest. */
export const VIZ_BAR_COUNT_DEFAULT_TIZEN = 13;

export const VIZ_BAR_COUNT_DEFAULT_WEBOS = 33;

export const VIZ_BAR_COUNT_DEFAULT_ANDROID = 37;

export const VIZ_BAR_COUNT_DEFAULT_WEBUI = 129;

/** @deprecated use VIZ_BAR_COUNT_DEFAULT_WEBUI or getDefaultVizBarCount() */
export const VIZ_BAR_COUNT_DEFAULT = VIZ_BAR_COUNT_DEFAULT_WEBUI;

export const VIZ_BAR_COUNT_MIN = 7;

export const VIZ_BAR_COUNT_MAX = 129;

export const VIZ_MODE_KEY = 'spinstage_viz_mode';

export const VIZ_MODES_STACK_KEY = 'spinstage_viz_modes';

export const VIZ_SHUFFLE_KEY = 'spinstage_viz_shuffle';

export const VIZ_SELECTION_MODE_KEY = 'spinstage_viz_selection_mode';

export const VIZ_POOL_KEY = 'spinstage_viz_pool';

export const VIZ_CYCLE_INDEX_KEY = 'spinstage_viz_cycle_index';

export const VIZ_FPS_KEY = 'spinstage_viz_fps';

export const VIZ_FPS_NOTCHES = [12, 24, 30, 60, 90, 120, 144];

export const VIZ_FPS_DEFAULT_TIZEN = 24;

export const VIZ_FPS_DEFAULT_WEBOS = 24;

export const VIZ_FPS_DEFAULT_ANDROID = 30;

export const VIZ_FPS_DEFAULT_WEBUI = 30;

export const VIZ_MODE_DEFAULT = 'horizon';

export const VIZ_MODES_STACK_MAX = 2;

/** @type {readonly { id: string, label: string }[]} */
export const VIZ_MODES = [
    { id: 'horizon', label: 'Horizon' },
    { id: 'rise', label: 'Rise' },
    { id: 'columns', label: 'Columns' },
    { id: 'ring', label: 'Ring Spectrum' },
    { id: 'rings', label: 'Pulse Rings' },
    { id: 'tris', label: 'Pulse Triangles' },
    { id: 'particles', label: 'Particle Field' },
    { id: 'star', label: 'Particle Star' },
    { id: 'hall', label: 'Hall' },
    { id: 'scope', label: 'Scope' },
    { id: 'solar', label: 'Solar System' },
    { id: 'web', label: 'Web' },
    { id: 'helix', label: 'Helix' },
    { id: 'cascade', label: 'Cascade' },
];

export const BG_BAKE_BLUR_PX = IS_ANDROID ? 4 : (IS_TV_REMOTE ? 5 : 8);

export const ANDROID_SEARCH_CHIPS_COLLAPSED_KEY = 'spinstage_android_search_chips_collapsed';

/** @deprecated migrated to ANDROID_SEARCH_CHIPS_COLLAPSED_KEY */
export const ANDROID_SEARCH_INPUT_COLLAPSED_KEY = 'spinstage_android_search_input_collapsed';

export const EQ_PRESET_KEY = 'spinstage_eq_preset';

export const BASS_MODE_KEY = 'spinstage_bass_mode';

export const BASS_MODE_PRESET_NAME = 'LowPass';

export const PLAYER_VOLUME_KEY = 'ma_player_volume';

export const SCREENSAVER_CLIENT = 'SpinStage';

export const TITLE_BASE_SIZE_REM = 3.6;

export const MA_API_TOKEN_KEY = 'ma_api_token';

export const PROGRESS_BOTTOM_DEFAULT = 200;

export const STACK_GAP_MIN_PX = 8;

export const STACK_PROGRESS_GAP_SCALE = 1.35;

export const MA_ALLOWED_IMAGE_SIZES = [0, 80, 160, 256, 512, 1024];
