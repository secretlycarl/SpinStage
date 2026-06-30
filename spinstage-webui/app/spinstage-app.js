/**
 * SpinStage — main application module.
 */
import {
  initAuthToken,
  getMaApiTokenSync,
  setMaApiToken,
} from './auth-token.js';
import { loginMaWithCredentials } from './ma/auth-login.js';
import { loadUserSettingsConfig, getUserSettingsCredentials, saveUserSettingsConfig } from './util/user-settings.js';
import { SendspinPlayer } from '../sendspin-lib.js';
import { clampStaticDelayMs } from './sync-delay.js';
import {
  titleEl,
  artistEl,
  artistTextEl,
  coverEl,
  coverWrapper,
  bgLayers,
  progressBar,
  progressContainerEl,
  progressSlider,
  progressThumb,
  timeCurrent,
  timeTotal,
  playPath,
  statusBar,
  mainBody,
  shuffleBtn,
  prevBtn,
  playBtn,
  nextBtn,
  repeatBtn,
  shuffleIcon,
  repeatIcon,
  navBtn,
  browseBtn,
  queueBtn,
  volumeBtn,
  volumeBtnIcon,
  volumeMenu,
  volumeSlider,
  volumeValueEl,
  volumeLocalLabel,
  volumeLocalSection,
  volumeCloseBtn,
  volumeGroupSection,
  volumeMemberSlidersEl,
  playersBtn,
  settingsBtn,
  browsePanel,
  browseList,
  browsePanelTitle,
  browsePanelHint,
  browseSearchInput,
  browseSearchFilters,
  browseSearchInputToggle,
  browseProviderMenu,
  queuePanel,
  queuePanelTitle,
  queueList,
  queueSyncActions,
  queueClearBtn,
  queueAutoplayBtn,
  queueSavePlaylistBtn,
  queueSavePlaylistLabel,
  queueSavePlaylistInput,
  queueAutoplayIcon,
  queueAutoplayLabel,
  playersPanel,
  playersPanelHint,
  playersList,
  playersSyncActions,
  playersSyncBtn,
  playersSyncLabel,
  playersStereoBtn,
  playersStereoLeadBtn,
  playersJoinBtn,
  playersRefreshBtn,
  playersResetOffsetsBtn,
  playersLeaveBtn,
  playersSplitBtn,
  queueRowMenu,
  browseRowMenu,
  playersRowMenu,
  navMenu,
  navGoArtistBtn,
  navGoAlbumBtn,
  navGoPodcastBtn,
  navGoPlaylistBtn,
  navGoGenresBtn,
  navGoOtherVersionsBtn,
  navGoSimilarTracksBtn,
  navGoDetailsBtn,
  navCloseBtn,
  navGenresCloseBtn,
  settingsMenu,
  menuSetupBtn,
  menuShowConnectionBtn,
  menuArtDisplayBtn,
  menuShowLyricsBtn,
  menuDisableVisualizerBtn,
  menuDisableVizBlurBtn,
  menuEqPresetsBtn,
  menuSwitchInfoBtn,
  menuVizModesBtn,
  menuFullscreenBtn,
  eqPresetsMenu,
  eqPresetsList,
  eqPresetsCloseBtn,
  vizModesMenu,
  vizModesList,
  vizModesCloseBtn,
  artDisplayMenu,
  artDisplayList,
  artDisplayCloseBtn,
  detailsPanel,
  detailsPanelTitle,
  detailsPanelHint,
  detailsList,
  menuGuestAccessBtn,
  menuCloseBtn,
  vizBarCountRow,
  vizBarCountSlider,
  vizBarCountValueEl,
  vizFpsRow,
  vizFpsSlider,
  vizFpsValueEl,
  guestAccessOverlay,
  guestQrImg,
  guestAccessMessageEl,
  guestAccessTaglineEl,
  setupOverlay,
  closeSetupBtn,
  setupScroll,
  setupForm,
  setupInputIp,
  setupInputName,
  setupInputUsername,
  setupInputPassword,
  setupConnectBtn,
  setupErrorEl,
  showConnectionCheck,
  disableVisualizerCheck,
  fullscreenCheck,
  vizWrap,
  playerStage,
  idleProgressEl,
  idleProgressBar,
} from './dom.js';

import {
  parseCssColor,
  rgbToHex,
  relativeLum,
  rgbToHsl,
  hslToRgb,
  themeContrastRatio,
  deriveEdgeAccent,
  vizPaletteKey,
  softUiSafe,
  buildAccentFromImage,
} from './util/color.js';
import {
  formatTime,
  progressFillWidth,
  progressThumbLeft,
  episodeDateMs,
} from './util/format.js';

import {
  DOCUMENT_TITLE_DEFAULT,
  DOCUMENT_TITLE_MAX_LEN,
  IS_CAPACITOR,
  IS_ANDROID,
  IS_TIZEN,
  IS_TV_REMOTE,
  IS_WEBOS,
  HAS_TOUCH_HARDWARE,
  ART_URL_CACHE_MAX,
  THEME_PREFETCH_CACHE_MAX,
  ARTIST_PROVIDERS_CACHE_MAX,
  METADATA_LOOKUP_CACHE_MAX,
  AUDIO_HEALTH_CHECK_MS,
  THEME_TRANSITION_MS,
  NP_VISUAL_DEBOUNCE_MS,
  NP_EFFECTS_DELAY_MS,
  ALBUM_ARTIST_CACHE_MAX,
  PREFETCH_LEAD_MS,
  PROGRESS_SOFT_DRIFT_MS,
  PROGRESS_HARD_RESYNC_MS,
  PROGRESS_SOFT_CATCHUP_RATE,
  PROGRESS_END_CLAMP_MS,
  MA_QUEUE_AUTHORITY_MS,
  REMOTE_SEEK_STEP_MS,
  SEEK_COMMIT_MS_UI,
  SEEK_COMMIT_MS_REMOTE,
  SEEK_AUTHORITY_MS,
  REMOTE_SEEK_REPEAT_MS,
  SYNC_DELAY_STEP_MS,
  SYNC_DELAY_CONFIG_KEY,
  SYNC_DELAY_LEGACY_KEYS,
  MA_PROTOCOL_KEY_SPLITTER,
  CAST_MEMBER_JOIN_SETTLE_MS,
  CAST_MEMBER_SYNC_MAX_ATTEMPTS,
  CAST_MEMBER_SYNC_STEP_MS,
  GROUP_DISSOLVE_MAX_ATTEMPTS,
  GROUP_DISSOLVE_STEP_MS,
  SYNC_JOIN_RECOVERY_DELAY_MS,
  TIZEN_SYNC_JOIN_RECOVERY_DELAY_MS,
  TIZEN_SYNC_JOIN_RECOVERY_DEBOUNCE_MS,
  TIZEN_STREAM_START_GROUP_RECOVERY_DELAY_MS,
  TIZEN_SENDSPIN_BUFFER_CAPACITY,
  ANDROID_SYNC_JOIN_RECOVERY_DELAY_MS,
  ANDROID_STREAM_START_GROUP_RECOVERY_DELAY_MS,
  PLAYBACK_BUFFER_MIN_AHEAD_SEC,
  ANDROID_PLAYBACK_BUFFER_MIN_AHEAD_SEC,
  PLAYBACK_JOIN_BUFFER_WAIT_MS,
  BROWSE_VIEWS_MAX,
  ARTIST_PROVIDERS_CACHE_VERSION,
  PUBLIC_RUNTIME_CONFIG,
  DEFAULT_PLAYER_VOLUME,
  ALPHA_VIEW_ITEM_THRESHOLD,
  ALPHA_GRID_COLS,
  BROWSE_ROOT_COLS,
  QUEUE_PAGE_SIZE,
  BROWSE_PAGE_SIZE,
  SEARCH_PAGE_SIZE,
  REPEAT_CYCLE,
  MODE_POLL_GRACE_MS,
  BROWSE_ROOT_SHORTCUTS,
  UI_HIDE_MS,
  SEARCH_FILTERS,
  RECOMMENDED_MEDIA_FILTERS,
  RADIO_BROWSE_FOLDER_HINTS,
  RADIO_BROWSE_TIME_BUDGET_MS,
  RADIO_BROWSE_MAX_CALLS,
  RADIO_BROWSE_MAX_STATIONS,
  PROVIDER_CACHE_TTL_MS,
  BROWSE_PROVIDER_DEFAULTS,
  BROWSE_PROVIDER_PREFS_KEY,
  SEARCH_UI_PREFS_KEY,
  CONTAINER_ACTION_ENTRY_TYPES,
  BROWSE_SECTION_FEATURES,
  DISCOGRAPHY_ALBUM_SECTIONS,
  BROWSE_SECTION_LIBRARY_TYPE,
  DEFAULT_SERVER_ADDRESS,
  DEFAULT_PLAYER_NAME,
  KEEP_AWAKE_KEY,
    SHOW_CONNECTION_KEY,
    RADIO_SWITCH_INFO_KEY,
    DISABLE_VISUALIZER_KEY,
  VIZ_BAR_COUNT_KEY,
  VIZ_BAR_COUNT_DEFAULT,
  VIZ_BAR_COUNT_MIN,
  VIZ_BAR_COUNT_MAX,
  EQ_PRESET_KEY,
  BASS_MODE_KEY,
  BASS_MODE_PRESET_NAME,
  PLAYER_VOLUME_KEY,
  SCREENSAVER_CLIENT,
  TITLE_BASE_SIZE_REM,
  MA_ALLOWED_IMAGE_SIZES,
  PROGRESS_BOTTOM_DEFAULT,
  STACK_GAP_MIN_PX,
  STACK_PROGRESS_GAP_SCALE,
} from './constants.js';

import {
  hasFinePointerDesktop,
  usesPhoneTypography,
  useTieredFocus,
  isTouchUi,
  isWebUi,
  isBrowserUi,
  applyUiScalingClasses,
} from './platform.js';

import {
  SPOTIFY_LIBRARY_ID_SUFFIX,
  normalizeProviderId,
  isSpotifyLibraryProviderId,
  spotifyLibraryBaseProviderId,
  makeSpotifyLibraryProviderId,
  spotifyLibraryProviderLabel,
  isSpotifyProvider,
  spotifyProviderIdsMatch,
  providerFromUri,
  isLibraryLikeProvider,
  pickExternalMapping,
  itemStoredProviderId,
  itemProviderId,
  isInMaLibrary,
  itemHasSpotifyInLibraryMapping,
  providerIconDomain,
  providerIcon,
  providerIconMono,
  providerHasFeature,
  isExcludedRadioBrowseProvider,
  isRadioCapableProvider,
  formatMaDuration,
  normalizeProviderDisplayName,
} from './util/providers.js';

import {
  chipVerticalTarget,
} from './util/chips.js';

import {
  isMaImageProxyUrl,
  artUrlHasAudioPath,
  snapMaImageSize,
  isMaImageProxyId,
} from './util/art-url.js';

import { state } from './state.js';
import { preloadGenreIconMap } from './util/genre-icon.js';
import { maClient } from './ma/client.js';

import {
  updateArtDisplayState,
  stopArtDisplayMotion,
  shouldKeepScreenAwake,
  getDvdFloater,
} from './playback/art-display.js';
import {
  updateLyricsPanelLayout,
  refreshLyricsForQueueItem,
  syncLyricsProgress,
  syncPlainLyricsPlayback,
  getShowLyricsEnabled as lyricsPrefEnabled,
  isLyricsLayoutAllowed,
} from './playback/lyrics-panel.js';
import {
  createVisualizer,
  tryAttachVisualizer,
  normalizeVizBarCount,
  getVizBarCount,
  getDisableVisualizer,
  getDisableVizBlur,
  applyVizBlurSetting,
  shuffleVizModeOnTrackChange,
  vizModeOnTrackChange,
} from './playback/visualizer.js';
import {
  findPlaylistTrackIndex,
  resolveMaStartItem,
} from './playback/playlist-playback.js';
import {
  refreshTitleLayout,
  applyShowUiEnterTypography,
  settleShowUiTitleMarquee,
  scheduleTitleLayoutRelayout,
  setSongTitle,
  setArtistLine,
  applyIdleNowPlayingText,
  commitNpTextTrack,
  requestNowPlayingVisuals,
  onMaQueueCurrentItemChanged,
  syncMaNowPlayingIfChanged,
  applyNowPlayingFromMaItem,
  syncProgressFromMaQueue,
  updateProgressUI,
  updateProgressFromPlayer,
  startProgressTimer,
  stopProgressTimer,
  syncProgressFromMetadata,
  syncProgressFromSendspinAuthority,
  syncProgressOnStreamStart,
  resolvePlaybackResumePosition,
  resetTrackProgressFromSources,
  rebakeBackgroundFromLastSource,
  bumpNpVisualGeneration,
  updatePlayButtonUi,
  isNowPlayingRadio,
  isRadioMedia,
  isSendspinMetadataStale,
  maybePrefetchNextTrack,
  trimMapCache,
  fetchMaArtUrl,
  cacheArtUrl,
  artUrlCrossOrigin,
  getNowPlayingItemKey,
  resolveTrackKey,
  cancelPrefetch,
  queueItemMatchesAuthority,
  getMaQueueProgress,
  syncProgressThumbActive,
  syncProgressThumbPosition,
  anchorProgress,
  getDisplayProgress,
  clampProgressAtTrackEnd,
  setAccentColors,
  syncFocusAccentColors,
  getSendspinTrackProgress,
} from './playback/now-playing.js';
import { touchMaQueueAuthority } from './playback/progress-authority.js';


import {
  getShowConnection,
  setShowConnection,
  syncSettingsMenuChecks,
  syncWebUiOnlySettings,
  setVizBarCount,
  setVizFpsFromSliderIndex,
  getShowLyricsEnabled,
  setShowLyricsEnabled,
  setDisableVisualizer,
  setDisableVizBlur,
  applyVisualizerVisibility,
  getKeepAwake,
  setKeepAwake,
  screenKeeper,
  openSettingsMenu,
  closeSettingsMenu,
  toggleSettingsMenu,
  updateMenuFocus,
  getSettingsFocusTargets,
  openEqPresetsMenu,
  closeEqPresetsMenu,
  openVizModesMenu,
  closeVizModesMenu,
  openArtDisplayMenu,
  closeArtDisplayMenu,
  moveArtDisplayFocus,
  activateArtDisplayFocused,
  applyEqPresetFromPreference,
  migrateBassModePreference,
  isFullscreen,
  setFullscreen,
  bindWebUiCursorIdle,
  clearWebUiFullscreenPinned,
  syncPinnedFullscreenKeyboardLock,
  setCursorHidden,
  adjustVizBarCount,
  moveEqPresetsFocus,
  activateEqPresetsFocused,
  moveVizModesFocus,
  activateVizModesFocused,
  toggleRadioSwitchInfo,
} from './ui/settings.js';


import {
  getBrowseSectionKey,
  itemMatchesBrowseProvider,
  maItemToPanelRow,
  getCurrentBrowseEntry,
  getBrowseView,
  storeBrowseView,
  resolveBrowseItemRaw,
  openBrowsePanelWithStack,
  openBrowsePanel,
  closeBrowsePanel,
  browseBack,
  bindBrowsePanelBack,
  loadCurrentBrowseView,
  loadBrowsePage,
  renderBrowsePanel,
  getBrowseRows,
  getBrowseRowSubTargets,
  getBrowseItemForRow,
  closeBrowseRowMenu,
  openBrowseRowMenu,
  moveBrowseMenuFocus,
  activateBrowseRow,
  activateBrowseMenuItem,
  moveBrowseRowSubFocus,
  moveBrowseGridFocus,
  moveArtistProviderFocus,
  moveAlphaViewFocus,
  moveContainerActionFocus,
  updateArtistProviderFocus,
  updateAlphaViewFocus,
  updateContainerActionFocus,
  activateContainerAction,
  navigateBrowseToArtist,
  navigateBrowseToAlbum,
  navigateBrowseToPodcast,
  navigateBrowseToPlaylist,
  navigateBrowseToGenre,
  startRadioForMedia,
  setRecommendedMediaFilter,
  switchBrowseProvider,
  switchArtistProvider,
  switchAlphaViewMode,
  isBrowseGridView,
  getBrowseGridCols,
  isAlphaListEntry,
  hasContainerActionsBar,
  hasAlphaViewBar,
  hasArtistProviderBar,
  entrySupportsBrowseProviders,
  entrySupportsContainerActions,
  hideAlphaViewBar,
  hideContainerActionsBar,
  renderContainerActionsBar,
    renderArtistProviderBar,
    renderBrowseProviderBar,
    renderPanelRowMenu,
    positionPanelRowMenu,
    resetPanelRowMenuPosition,
} from './ui/browse.js';
import {
  loadSearchUiPrefs,
  saveSearchUiPrefs,
  applySavedSearchUiPrefs,
  searchQueryVariants,
  getSearchProvidersKey,
  buildSearchResultsEntryKey,
  ensureSearchResultsEntry,
  itemMatchesSearchProvider,
  itemMatchesAnySearchProvider,
  getEnabledSearchProviderIds,
  isSearchContext,
  isBrowseSearchActive,
  isBrowseRecommendedActive,
  syncBrowseSearchChrome,
  syncSearchInputValue,
  refreshBrowseFilterChipStates,
  getSearchFilterChips,
  isBrowseFilterChipsVisible,
  updateProviderMenuFocus,
  syncSearchFilterFocusToActive,
  getSearchInputCollapsed,
  setSearchInputCollapsed,
  showBrowseSearchInput,
  openProviderMenu,
  closeProviderMenu,
  moveProviderMenuFocus,
  moveSearchFilterFocus,
  activateSearchFilter,
  activateProviderMenuItem,
  loadSearchPage,
  rerunBrowseSearch,
  runBrowseSearch,
} from './ui/browse-search.js';
import {
  applyLocalSyncLeaderFromPlayer,
  patchPlayersListFromMaEvent,
  schedulePlayersPanelRefresh,
  scheduleGroupOffsetDisplaySync,
  scheduleLocalPlaybackOffsetsSync,
  syncLocalPlaybackOffsetsFromMa,
  syncGroupOffsetDisplayFromMa,
  readPlayerSyncDelayMs,
  readPlayerGroupTrimMs,
  readPlayerPlaybackOffsets,
  applyLocalPlayerSyncDelay,
  applyLocalPlaybackOffsets,
  applyPlayerVolumeState,
  refreshPlayerVolume,
  applyDefaultPlayerVolume,
  getSavedPlayerVolume,
  savePlayerVolume,
  resolveSyncGroups,
  openPlayersPanel,
  closePlayersPanel,
  closePlayersRowMenu,
  openPlayersRowMenu,
  movePlayersMenuFocus,
  activatePlayersRow,
  activatePlayersMenuItem,
  activatePlayersAction,
  syncSelectedPlayers,
  stereoPairSelectedPlayers,
  stereoPairWithLocalLeader,
  joinRemoteSyncGroup,
  refreshActiveSyncGroup,
  resetActiveGroupOffsets,
  leaveActiveSyncGroup,
  splitActiveSyncGroup,
  getPlayersListRows,
  getPlayersRowSubTargets,
  getPlayersRowSubFocusMax,
  getVisiblePlayersActionButtons,
  loadPlayersList,
  updatePlayersSyncUi,
  updatePlayersSyncDelayLabels,
  updateStereoPairDelaySubtitle,
  localPlayerInSyncGroup,
  pauseSyncGroupPlayback,
  resumeSyncGroupPlayback,
  stopSyncGroupPlayback,
  refreshLocalPlaybackSyncProfile,
} from './ui/players-panel.js';
import {
  getQueueCurrentIndex,
  syncQueuePlayingHighlight,
  syncQueueActionChips,
  scheduleQueueReload,
  updateQueuePanelHeader,
  loadQueueItems,
  rememberQueueContext,
  openQueuePanel,
  closeQueuePanel,
  closeQueueRowMenu,
  openQueueRowMenu,
  moveQueueMenuFocus,
  moveQueueRowSubFocus,
  activateQueueRow,
  activateQueueMenuItem,
  activateQueueAction,
  confirmQueueSavePlaylist,
  startQueueReorder,
  finishQueueReorder,
  moveQueueReorder,
  getQueueListRows,
  getQueueRowSubTargets,
  getVisibleQueueActionButtons,
  openQueueSavePlaylistInput,
} from './ui/queue.js';
import {
  openDetailsPanel,
  closeDetailsPanel,
  supportsDetailsItem,
  bindDetailsPanelBack,
} from './ui/details.js';

import {
  canGoToArtist,
  canGoToAlbum,
  getBrowseGoToTargets,
  enrichBrowseItemForGoTo,
  fetchFullMaMedia,
  resolveBrowseGoToNavigationMedia,
  refreshNavPlaylistContext,
  syncNavMenuState,
  resolveArtistItem,
  resolveAlbumItem,
  resolvePodcastShowItem,
  resolvePlaylistItem,
  clearGoToErrorStatus,
  closeNavMenu,
  closeNavGenresMenu,
  openNavGenresMenu,
  openNavMenu,
  toggleNavMenu,
  moveNavMenuFocus,
  activateNavMenuItem,
  openNavDetails,
} from './ui/nav.js';

import {
  getTrackExtrasGoToTargets,
  getTrackExtrasAvailability,
  warmTrackExtrasCache,
  enrichTrackExtrasMenuActions,
  refreshNowPlayingTrackExtras,
  openOtherVersionsPanel,
  openSimilarTracksPanel,
  isTrackCollectionEntry,
  getTrackCollectionContainerActions,
  saveTrackCollectionAsPlaylist,
  handleTrackExtrasGoTo,
  getCachedTrackCollectionLists,
} from './ui/track-collections.js';

import {
  bindMouseHoverHighlights,
  bindPanelPointerMode,
  bindKeyboardNavigation,
  panelKeyboardFocusActive,
  setPanelInputMode,
  syncPanelInputModeForOpen,
  focusPanelTarget,
  isPanelOpen,
  pauseUiHideTimer,
  resumeUiHideTimer,
  updatePanelFocus,
  closeAllPanels,
  isOverlayMenuOpen,
  hideUI,
  showUI,
  markRemoteAction,
  handleAppBack,
  consumeBackKey,
  isSetupOpen,
  isGuestAccessOpen,
  resetNavButtonFocus,
  getIgnoreClickUntil,
  normalizeUiFocusZone,
  isProgressFocusAvailable,
} from './ui/navigation.js';
import { registerUiHandlers } from './ui/handlers.js';
import { initAndroidChipSections } from './ui/android-chip-sections.js';
import { registerNpHandlers } from './playback/handlers.js';
import { registerMaHandlers } from './ma/handlers.js';

import {
  buildBaseUrl,
  buildMaServerOrigin,
  buildMaWsUrl,
  buildSendspinPlayerId,
  getDefaultServerAddress,
  getDefaultPlayerName,
  findMaPlayer,
} from './util/server.js';

import {
  rewriteMaArtHost,
  normalizeArtUrl,
  resolveArtUrl,
  buildMaImageProxyIdUrl,
  buildMaImageProxyUrl,
  buildMaArtUrlFromImage,
  pickArtistImage,
  buildMaImageUrlFromImage,
  getArtUrl,
} from './util/art.js';


const visualizer = createVisualizer(document.getElementById('viz-canvas'));
setVizBarCount(getVizBarCount());
applyVisualizerVisibility();
applyVizBlurSetting();

applyUiScalingClasses();
['(any-hover: hover)', '(any-pointer: fine)', '(hover: hover)', '(pointer: fine)']
    .map((q) => window.matchMedia(q))
    .forEach((mq) => mq.addEventListener('change', () => {
        applyUiScalingClasses();
        refreshTitleLayout();
    }));
if (IS_WEBOS) mainBody.classList.add('webos-tv');
if (IS_TIZEN) mainBody.classList.add('tizen-tv');
if (IS_ANDROID) mainBody.classList.add('android');

async function applyBuildDefaultsIfNeeded() {
    try {
        const d = await loadUserSettingsConfig();
        if (!d) return;
        if (!(localStorage.getItem('ma_server_ip') || '').trim() && d.server) {
            localStorage.setItem('ma_server_ip', String(d.server).trim());
        }
        if (!(localStorage.getItem('ma_player_name') || '').trim() && d.playerName) {
            localStorage.setItem('ma_player_name', String(d.playerName).trim());
        }
        if (d.username && !(localStorage.getItem('ma_username') || '').trim()) {
            localStorage.setItem('ma_username', String(d.username).trim());
        }
        if (!getMaApiTokenSync()) {
            const creds = getUserSettingsCredentials(d);
            if (creds) {
                const server = String(d.server || localStorage.getItem('ma_server_ip') || '').trim();
                if (server) {
                    const token = await loginMaWithCredentials(server, creds.username, creds.password);
                    await setMaApiToken(token);
                }
            }
        }
    } catch (err) {
        console.warn('build defaults apply failed:', err);
    }
}

function setSetupError(message) {
    if (!setupErrorEl) return;
    const text = (message || '').trim();
    if (!text) {
        setupErrorEl.hidden = true;
        setupErrorEl.textContent = '';
        return;
    }
    setupErrorEl.hidden = false;
    setupErrorEl.textContent = text;
}

function syncSetupKeyboardInset() {
    if (!setupScroll || !window.visualViewport) return;
    const vv = window.visualViewport;
    const keyboardGap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    setupScroll.style.paddingBottom = keyboardGap > 40
        ? `${keyboardGap + 24}px`
        : '';
}

function bindSetupKeyboardInset() {
    if (!window.visualViewport) return;
    window.visualViewport.addEventListener('resize', syncSetupKeyboardInset);
    window.visualViewport.addEventListener('scroll', syncSetupKeyboardInset);
}

function hasCompleteSetup() {
    return !!(localStorage.getItem('ma_server_ip') || '').trim()
        && !!(localStorage.getItem('ma_player_name') || '').trim()
        && !!getMaApiTokenSync();
}

function getSetupFieldOrder() {
    return [setupInputIp, setupInputName, setupInputUsername, setupInputPassword, setupConnectBtn]
        .filter(Boolean);
}

function focusSetupField(index) {
    const fields = getSetupFieldOrder();
    const target = fields[Math.max(0, Math.min(index, fields.length - 1))];
    target?.focus?.();
    target?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

function moveSetupFocus(delta) {
    const fields = getSetupFieldOrder();
    if (!fields.length) return;
    const active = document.activeElement;
    let idx = fields.indexOf(active);
    if (idx < 0) idx = 0;
    else idx = Math.max(0, Math.min(fields.length - 1, idx + delta));
    focusSetupField(idx);
}

function isPortraitPhoneLayout() {
    return usesPhoneTypography() && window.matchMedia('(orientation: portrait)').matches;
}

function getStackLayoutGap() {
    const h = window.innerHeight || 800;
    const landscape = window.matchMedia('(orientation: landscape)').matches;
    let gap;
    if (!usesPhoneTypography()) {
        const ratio = landscape ? 0.024 : 0.028;
        const cap = landscape ? 36 : 32;
        gap = Math.min(cap, Math.max(20, h * ratio));
    } else if (isPortraitPhoneLayout()) {
        gap = Math.min(24, Math.max(14, h * 0.022));
    } else {
        gap = Math.min(22, Math.max(12, h * 0.018));
    }
    return Math.round(gap * STACK_PROGRESS_GAP_SCALE);
}

function getProgressLayoutGap() {
    return getStackLayoutGap();
}

function isAndroidPortraitBottomNav() {
    return IS_ANDROID && isPortraitPhoneLayout();
}

function getBottomNavReservedHeight() {
    if (!isAndroidPortraitBottomNav()) return 0;
    if (mainBody.classList.contains('browse-open')
        || mainBody.classList.contains('queue-open')
        || mainBody.classList.contains('players-open')
        || mainBody.classList.contains('details-open')) {
        return 0;
    }
    const navVisible = mainBody.classList.contains('show-ui')
        || mainBody.classList.contains('menu-open')
        || mainBody.classList.contains('nav-menu-open')
        || mainBody.classList.contains('volume-menu-open');
    if (!navVisible) return 0;
    const topBar = document.getElementById('top-bar');
    if (!topBar) return isAndroidPortraitBottomNav() ? 38 : 56;
    const h = topBar.getBoundingClientRect().height;
    return h > 0 ? Math.ceil(h) : (isAndroidPortraitBottomNav() ? 38 : 56);
}

function getStackBottomMargin() {
    if (isAndroidPortraitBottomNav()) {
        return getBottomNavReservedHeight() + 10;
    }
    if (usesPhoneTypography()) return 10;
    return 36;
}

function measureControlsBandHeight(controls) {
    return measureControlsVisualBand(controls).bandHeight;
}

function estimateControlsVisualBand() {
    const playH = 110;
    const landscape = window.matchMedia('(orientation: landscape)').matches;
    const isWebLandscape = mainBody.classList.contains('web-ui') && landscape;
    const isWebosLandscape = mainBody.classList.contains('webos-tv') && landscape;
    const isTizenLandscape = mainBody.classList.contains('tizen-tv') && landscape;
    if (mainBody.classList.contains('android') && usesPhoneTypography()) {
        const androidPlayH = 54;
        const paddingTop = 10;
        const bandHeight = landscape ? 72 : 88;
        const bottomInset = Math.max(0, bandHeight - paddingTop - androidPlayH);
        return {
            topInset: paddingTop,
            visualHeight: androidPlayH,
            bottomInset,
            bandHeight,
        };
    }
    if (isWebLandscape || isWebosLandscape || isTizenLandscape) {
        const containerH = 150;
        const topInset = Math.round((containerH - playH) / 2);
        return { topInset, visualHeight: playH, bottomInset: containerH - topInset - playH, bandHeight: containerH };
    }
    const containerH = 200;
    const paddingTop = 40;
    const innerH = containerH - paddingTop;
    const topInset = paddingTop + Math.round((innerH - playH) / 2);
    return {
        topInset,
        visualHeight: playH,
        bottomInset: containerH - topInset - playH,
        bandHeight: containerH,
    };
}

function measureControlsVisualBand(controls) {
    return estimateControlsVisualBand();
}

let _playbackStackLayoutKey = '';

function resetPlaybackStackLayout() {
    const controls = document.getElementById('controls-container');
    controls?.style.removeProperty('--controls-stack-top');
    document.querySelector('.progress-wrapper')?.style.removeProperty('--progress-bottom');
    _playbackStackLayoutKey = '';
}

function getAndroidProgressStackTrim(gap) {
    if (!IS_ANDROID) return 0;
    return Math.min(14, Math.max(5, Math.round(gap * 0.14)));
}

function applyAndroidProgressStackTrim(progressTop, progressBottomEdge, gap) {
    const trim = getAndroidProgressStackTrim(gap);
    if (trim <= 0) return { progressTop, progressBottomEdge };
    return {
        progressTop: progressTop - trim,
        progressBottomEdge: progressBottomEdge - trim,
    };
}

function applyPlaybackStackLayout(options = {}) {
    const { immediate = false } = options;
    const controls = document.getElementById('controls-container');
    const progressWrapper = document.querySelector('.progress-wrapper');
    const info = document.querySelector('.info');
    const cover = document.querySelector('.cover-wrapper');

    if (!controls) return;
    if (!mainBody.classList.contains('show-ui')) {
        resetPlaybackStackLayout();
        clearStackLayoutAnimationState();
        return;
    }
    if (mainBody.classList.contains('panel-open')) {
        return;
    }
    if (!immediate && Date.now() < progressEnterAnimUntil && !isProgressLayoutGeometryStable()) return;
    if (!info) {
        return;
    }

    const viewportH = window.innerHeight || 800;
    let gap = getStackLayoutGap();
    let infoBottom;
    let artFloor;
    if (options.anchors) {
        infoBottom = options.anchors.infoBottom;
        artFloor = options.anchors.artFloor;
    } else {
        infoBottom = info.getBoundingClientRect().bottom;
        artFloor = Math.max(
            infoBottom,
            cover?.getBoundingClientRect().bottom || infoBottom,
        );
    }
    const seekable = mainBody.classList.contains('progress-seekable');
    const progressHeight = (seekable && progressWrapper)
        ? Math.max(progressWrapper.offsetHeight, 24)
        : 0;
    const {
        topInset: controlsTopInset,
        visualHeight: controlsVisualHeight,
        bandHeight: controlsBandHeight,
    } = measureControlsVisualBand(controls);
    const bottomMargin = getStackBottomMargin();

    let progressTop = 0;
    let progressBottomEdge = 0;
    let controlsTop;

    if (seekable && progressHeight > 0) {
        progressTop = infoBottom + gap;
        progressBottomEdge = progressTop + progressHeight;
        controlsTop = progressBottomEdge + gap - controlsTopInset;
        ({ progressTop, progressBottomEdge } = applyAndroidProgressStackTrim(progressTop, progressBottomEdge, gap));
    } else {
        controlsTop = infoBottom + gap - controlsTopInset;
    }

    if (seekable && progressHeight > 0) {
        const minProgressTop = artFloor + Math.max(STACK_GAP_MIN_PX, Math.round(gap * 0.5));
        if (progressTop < minProgressTop) {
            const shift = minProgressTop - progressTop;
            progressTop += shift;
            progressBottomEdge += shift;
            controlsTop += shift;
        }
    }

    const maxStackBottom = viewportH - bottomMargin;
    let stackBottom = controlsTop + controlsBandHeight;
    if (stackBottom > maxStackBottom) {
        const shiftUp = stackBottom - maxStackBottom;
        controlsTop -= shiftUp;
        if (seekable && progressHeight > 0) {
            progressBottomEdge -= shiftUp;
            progressTop -= shiftUp;
            const gapAbove = progressTop - infoBottom;
            const gapBelow = (controlsTop + controlsTopInset) - progressBottomEdge;
            if (gapAbove < STACK_GAP_MIN_PX || gapBelow < STACK_GAP_MIN_PX) {
                gap = Math.max(
                    STACK_GAP_MIN_PX,
                    (maxStackBottom - infoBottom - progressHeight - controlsVisualHeight) / 2,
                );
                progressTop = infoBottom + gap;
                progressBottomEdge = progressTop + progressHeight;
                controlsTop = progressBottomEdge + gap - controlsTopInset;
                ({ progressTop, progressBottomEdge } = applyAndroidProgressStackTrim(
                    progressTop, progressBottomEdge, gap,
                ));
            }
        } else {
            controlsTop = Math.max(
                infoBottom + STACK_GAP_MIN_PX - controlsTopInset,
                maxStackBottom - controlsBandHeight,
            );
        }
    }

    const controlsTopPx = Math.round(controlsTop);
    const progressBottom = Math.round(viewportH - progressBottomEdge);
    const layoutKey = `${controlsTopPx}|${progressBottom}|${seekable ? 1 : 0}`;
    if (!options.force && layoutKey === _playbackStackLayoutKey) {
        return;
    }
    _playbackStackLayoutKey = layoutKey;
    controls.style.setProperty('--controls-stack-top', `${controlsTopPx}px`);
    if (seekable && progressWrapper && progressHeight > 0) {
        progressWrapper.style.setProperty('--progress-bottom', `${progressBottom}px`);
    } else {
        progressWrapper?.style.removeProperty('--progress-bottom');
    }
}

const PLAYBACK_CHROME_ENTER_MS = 350;
const SHOW_UI_STAGE_Y_OFFSET_PX = 80;
const SHOW_UI_STAGE_SCALE = 0.75;
let showUiChromeLayoutTimer = null;
let showUiChromeEnterActive = false;

function clearShowUiChromeLayoutTimer() {
    if (showUiChromeLayoutTimer != null) {
        clearTimeout(showUiChromeLayoutTimer);
        showUiChromeLayoutTimer = null;
    }
}

function getShowUiStageLayoutParams() {
    if (IS_ANDROID && usesPhoneTypography()) {
        const landscape = window.matchMedia('(orientation: landscape)').matches;
        return landscape
            ? { scale: 0.72, yOffsetPx: 18 }
            : { scale: 0.88, yOffsetPx: 32 };
    }
    return { scale: SHOW_UI_STAGE_SCALE, yOffsetPx: SHOW_UI_STAGE_Y_OFFSET_PX };
}

/** Predict show-ui stack anchors from layout box + known stage transform (avoids mid-transition measure). */
function computeShowUiStackAnchors() {
    const info = document.querySelector('.info');
    const cover = document.querySelector('.cover-wrapper');
    if (!playerStage || !info) return null;

    const { scale, yOffsetPx } = getShowUiStageLayoutParams();
    const vh = window.innerHeight;
    const stageCenterY = (vh / 2) - yOffsetPx;
    const useCoverOffset = cover && (usesPhoneTypography() || !mainBody.classList.contains('show-ui'));
    const coverLayoutH = cover
        ? (useCoverOffset ? cover.offsetHeight : vh * 0.375)
        : 0;
    const coverMargin = cover
        ? (Number.parseFloat(getComputedStyle(cover).marginBottom) || 25)
        : 0;
    const infoLayoutH = info.offsetHeight;
    const layoutH = coverLayoutH + coverMargin + infoLayoutH;
    if (!layoutH) return null;

    const visualTop = stageCenterY - (layoutH * scale) / 2;
    const layoutInfoBottom = coverLayoutH + coverMargin + infoLayoutH;
    const infoBottom = visualTop + layoutInfoBottom * scale;
    const artFloor = visualTop + layoutH * scale;
    return { infoBottom, artFloor };
}

function resolveShowUiStackAnchors() {
    const info = document.querySelector('.info');
    const cover = document.querySelector('.cover-wrapper');
    if (!playerStage || !info) return null;

    const deferForHandoff = IS_ANDROID && usesPhoneTypography()
        && playerStage.classList.contains('stage-handoff');
    if (deferForHandoff) return null;

    if (IS_ANDROID && usesPhoneTypography()) {
        void playerStage.offsetHeight;
        void info.offsetHeight;
        const infoRect = info.getBoundingClientRect();
        const coverRect = cover?.getBoundingClientRect();
        return {
            infoBottom: infoRect.bottom,
            artFloor: Math.max(infoRect.bottom, coverRect?.bottom ?? infoRect.bottom),
        };
    }
    return computeShowUiStackAnchors();
}

function usesAndroidDeferredStackLayout() {
    return IS_ANDROID && usesPhoneTypography();
}

function commitShowUiChromeLayout() {
    clearShowUiChromeLayoutTimer();
    showUiChromeEnterActive = true;
    applyShowUiEnterTypography();
    void playerStage?.offsetHeight;
    const androidDeferred = usesAndroidDeferredStackLayout();
    if (androidDeferred) {
        mainBody.classList.add('android-stack-pending');
    } else {
        const anchors = resolveShowUiStackAnchors();
        if (anchors) {
            _playbackStackLayoutKey = '';
            applyPlaybackStackLayout({ immediate: true, force: true, anchors });
        }
    }
    progressEnterAnimUntil = Date.now() + PLAYBACK_CHROME_ENTER_MS + 48;
    showUiChromeLayoutTimer = window.setTimeout(() => {
        showUiChromeLayoutTimer = null;
        showUiChromeEnterActive = false;
        playerStage?.classList.remove('stage-handoff');
        if (androidDeferred) {
            _playbackStackLayoutKey = '';
            applyPlaybackStackLayout({ immediate: true, force: true });
            mainBody.classList.remove('android-stack-pending');
        }
        settleShowUiTitleMarquee();
    }, PLAYBACK_CHROME_ENTER_MS);
}

function clearStackLayoutAnimationState() {
    clearShowUiChromeLayoutTimer();
    showUiChromeEnterActive = false;
    mainBody.classList.remove('android-stack-pending');
    playerStage?.classList.remove('stage-handoff');
}

function schedulePlaybackStackRelayoutAfterStage() {
    _playbackStackLayoutKey = '';
    syncIdleProgressVisibility();
    if (!mainBody.classList.contains('show-ui') || isPanelOpen()) {
        refreshTitleLayout();
        snapPlayerStageForIdleLayout();
        return;
    }
    refreshTitleLayout();
}
function setPanelStatusText(el, label) {
    el.className = 'panel-divider panel-status';
    el.replaceChildren();
    el.append(label, Object.assign(document.createElement('span'), {
        className: 'loading-ellipsis',
        ariaHidden: 'true',
        textContent: '...',
    }));
}
function clearControlsLayoutOverrides() {
    /* stack layout uses --controls-stack-top only */
}

function isProgressLayoutGeometryStable() {
    if (!mainBody.classList.contains('show-ui') || mainBody.classList.contains('panel-open')) {
        return true;
    }
    const controls = document.getElementById('controls-container');
    if (!controls) return false;
    const transform = getComputedStyle(controls).transform;
    if (transform && transform !== 'none') {
        try {
            const matrix = new DOMMatrixReadOnly(transform);
            if (Math.abs(matrix.m42) > 1) return false;
        } catch (err) {
            return true;
        }
    }
    return true;
}

function getProgressBottomMin() {
    if (usesPhoneTypography()) {
        return window.matchMedia('(orientation: landscape)').matches ? 68 : 72;
    }
    return PROGRESS_BOTTOM_DEFAULT;
}

function formatTrackVersionSuffix(item) {
    if (!item || typeof item !== 'object') return '';
    const ver = (item.version || item.metadata?.version || '').trim();
    if (!ver || isProviderLike(ver)) return '';
    if (ver.startsWith('(') && ver.endsWith(')')) return ` ${ver}`;
    return ` (${ver})`;
}

function appendTrackVersion(name, item) {
    const base = (name || '').trim();
    if (!base || !item) return base;
    const suffix = formatTrackVersionSuffix(item);
    if (!suffix) return base;
    const verCore = suffix.trim().replace(/^\(|\)$/g, '').trim().toLowerCase();
    const baseLower = base.toLowerCase();
    if (baseLower.includes(suffix.trim().toLowerCase())) return base;
    if (baseLower.includes(`(${verCore})`)) return base;
    return `${base}${suffix}`;
}

function getItemDisplayName(item) {
    if (!item) return '';
    if (typeof item === 'string') return item.trim();
    let base = (item.name || item.title || '').trim();
    const mt = inferMediaType(item) || (item.media_type || '').toLowerCase();
    if (mt === 'artist') base = cleanArtistDisplayName(base);
    if (mt === 'track' || mt === 'podcast_episode' || mt === 'episode') {
        return appendTrackVersion(base, item);
    }
    return base;
}

function getTrackArtistName(maMedia, spinMeta, queueItem) {
    const sources = [maMedia, queueItem?.media_item, queueItem, spinMeta];
    for (const s of sources) {
        if (!s) continue;
        const artist = pickDisplayArtistName(s);
        if (artist && !isProviderLike(artist)) return artist;
    }
    return '';
}

function stripArtistPrefixFromTitle(title, artist) {
    const trimmed = (title || '').trim();
    if (!trimmed || !artist) return trimmed;
    const a = artist.trim();
    for (const sep of [' - ', ' — ', ' – ']) {
        const prefix = `${a}${sep}`;
        if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
            return trimmed.slice(prefix.length).trim();
        }
    }
    return trimmed;
}

function extractTrailingParentheticals(text) {
    if (!text) return '';
    const match = text.match(/(\s*\([^)]+\)\s*)+$/);
    return match ? match[0].trim() : '';
}

function stripTrailingParentheticals(text) {
    return (text || '').replace(/(\s*\([^)]+\)\s*)+$/, '').trim();
}

function mergeTrackDisplayTitle(maMedia, spinTitle, artist) {
    const maDisplay = maMedia ? getItemDisplayName(maMedia) : '';
    let title = stripArtistPrefixFromTitle(maDisplay, artist);
    const spinClean = stripArtistPrefixFromTitle(spinTitle || '', artist);

    if (!title && spinClean) {
        title = spinClean;
    } else if (title && spinClean) {
        const spinParens = extractTrailingParentheticals(spinClean);
        const titleBase = stripTrailingParentheticals(title).toLowerCase();
        const spinBase = stripTrailingParentheticals(spinClean).toLowerCase();
        if (spinParens && !title.includes('(') && titleBase && spinBase && titleBase === spinBase) {
            title = `${title} ${spinParens}`.trim();
        } else {
            const tLow = title.toLowerCase();
            const sLow = spinClean.toLowerCase();
            if (sLow.startsWith(tLow) && spinClean.length > title.length) {
                title = spinClean;
            }
        }
    }
    return title;
}

function pickDisplayTitle(maMedia, queueItem, spinMeta) {
    if (isRadioMedia(maMedia) || isRadioMedia(spinMeta)) {
        return cleanRadioMetadataText(spinMeta?.title)
            || (maMedia?.name || '').trim() || 'Ready';
    }

    const mt = inferMediaType(maMedia) || inferMediaType(spinMeta)
        || inferMediaType(queueItem?.media_item) || 'track';
    if (mt === 'track') {
        if (spinMeta && isSendspinMetadataStale(spinMeta)) {
            const artist = getTrackArtistName(maMedia, spinMeta, queueItem);
            const spinClean = stripArtistPrefixFromTitle(spinMeta?.title || '', artist);
            if (spinClean) return spinClean;
        }
        const artist = getTrackArtistName(maMedia, spinMeta, queueItem);
        const merged = mergeTrackDisplayTitle(maMedia, spinMeta?.title, artist);
        if (merged) return merged;
        const qi = stripArtistPrefixFromTitle(queueItem?.name || '', artist);
        return qi || 'Ready';
    }

    const candidates = [
        getItemDisplayName(maMedia) || maMedia?.name,
        maMedia?.title,
        spinMeta?.title,
        queueItem?.name,
    ].map((t) => (t || '').trim()).filter(Boolean);
    return candidates[0] || 'Ready';
}

let progressLayoutTimers = [];
let progressEnterAnimUntil = 0;

function clearProgressLayoutTimers() {
    progressLayoutTimers.forEach((t) => clearTimeout(t));
    progressLayoutTimers = [];
}

function applyProgressLayoutNow() {
    applyPlaybackStackLayout();
}

function updateProgressLayout() {
    if (!mainBody.classList.contains('show-ui')) {
        resetPlaybackStackLayout();
        clearStackLayoutAnimationState();
        snapPlayerStageForIdleLayout();
        return;
    }
    if (mainBody.classList.contains('panel-open')) return;
    applyPlaybackStackLayout({ immediate: true });
}

function collapseUiForDefaultArtIfIdle() {
    if (getArtDisplayMode() !== 'default') return;
    if (isPanelOpen()) return;
    if (state.settingsMenuOpen || state.navMenuOpen || state.navGenresMenuOpen
        || state.volumeMenuOpen || state.eqPresetsMenuOpen || state.vizModesMenuOpen
        || state.artDisplayMenuOpen) return;
    if (mainBody.classList.contains('show-ui')) return;
    clearStackLayoutAnimationState();
    snapPlayerStageForIdleLayout();
}

function clearPlayerStageInlineTransform() {
    if (!playerStage) return;
    if (getDvdFloater().running) return;
    playerStage.style.removeProperty('transform');
    playerStage.style.removeProperty('left');
    playerStage.style.removeProperty('top');
}

function snapPlayerStageForIdleLayout() {
    if (!playerStage) return;
    if (getDvdFloater().running) return;
    if (mainBody.classList.contains('panel-open')) return;
    if (mainBody.classList.contains('show-ui')) return;
    clearPlayerStageInlineTransform();
}

function scheduleProgressLayoutRelayout() {
    clearProgressLayoutTimers();
    progressLayoutTimers = [window.setTimeout(() => applyPlaybackStackLayout({ immediate: true }), 0)];
}

/** Build MA/Sendspin base URL from user input. */
function queueEventAppliesToLocal(objectId) {
    if (!objectId) return false;
    if (!maClient.queueId) return true;
    if (objectId === maClient.queueId) return true;
    if (state.localSyncLeaderId && objectId === state.localSyncLeaderId) return true;
    return false;
}

function scheduleLocalPlayerVisualCatchup(reason) {
    clearTimeout(state.localVisualCatchupTimer);
    let delayMs = (reason === 'sync-state' && !state.playersPanelOpen) ? 650 : 350;
    if (IS_TIZEN) delayMs = Math.max(delayMs, 900);
    state.localVisualCatchupTimer = setTimeout(async () => {
        state.localVisualCatchupTimer = null;
        if (reason === 'sync-state' && !state.playersPanelOpen) return;
        const prev = maClient.activeQueue?.current_item?.queue_item_id;
        try {
            await maClient.refreshActiveQueue();
        } catch (err) {
            console.warn('local visual catchup refresh failed:', err);
        }
        touchMaQueueAuthority(Date.now() + MA_QUEUE_AUTHORITY_MS);
        state.npVisuals.pendingApply = null;
        const item = maClient.activeQueue?.current_item;
        if (item) {
            const visualKey = resolveTrackKey(null, item);
            state.npTextTrackKey = visualKey;
            state.lastNowPlayingKey = visualKey;
            void applyNowPlayingFromMaItem(item, {
                force: true,
                skipVisuals: true,
                trackKeyOverride: visualKey,
            });
        }
        syncMaNowPlayingIfChanged(prev);
        requestNowPlayingVisuals(reason || 'local-catchup', { force: true });
    }, delayMs);
}

let playbackJoinRecoveryTimer = null;
let playbackJoinRecoveryDebounceTimer = null;
let pendingJoinRecoveryReason = 'join';

async function runPlaybackJoinRecovery(reason = 'join') {
    clearTimeout(playbackJoinRecoveryTimer);
    let delayMs = IS_ANDROID
        ? ANDROID_SYNC_JOIN_RECOVERY_DELAY_MS
        : IS_TIZEN
            ? TIZEN_SYNC_JOIN_RECOVERY_DELAY_MS
            : SYNC_JOIN_RECOVERY_DELAY_MS;
    if (reason === 'stream-start' && IS_ANDROID && isLocalPlayerInSyncGroupCached()) {
        delayMs = ANDROID_STREAM_START_GROUP_RECOVERY_DELAY_MS;
    }
    if (reason === 'stream-start' && IS_TIZEN && isLocalPlayerInSyncGroupCached()) {
        delayMs = TIZEN_STREAM_START_GROUP_RECOVERY_DELAY_MS;
    }
    const minAheadSec = IS_ANDROID ? ANDROID_PLAYBACK_BUFFER_MIN_AHEAD_SEC : PLAYBACK_BUFFER_MIN_AHEAD_SEC;
    playbackJoinRecoveryTimer = setTimeout(async () => {
        playbackJoinRecoveryTimer = null;
        try {
            await refreshLocalPlaybackSyncProfile();
            if (IS_ANDROID && isLocalPlayerInSyncGroupCached()) {
                window.playerInstance?.setBufferProfile?.('group');
            }
            const bufferReady = await waitForPlaybackBufferReady(
                minAheadSec,
                PLAYBACK_JOIN_BUFFER_WAIT_MS,
            );
            let shouldResync;
            if (reason === 'stream-start') {
                shouldResync = IS_ANDROID || !bufferReady;
            } else {
                shouldResync = true;
            }
            if (shouldResync) {
                window.playerInstance?.forcePlaybackResync?.();
            }
            if (IS_ANDROID && !bufferReady) {
                await waitForPlaybackBufferReady(minAheadSec, PLAYBACK_JOIN_BUFFER_WAIT_MS);
                window.playerInstance?.forcePlaybackResync?.();
            }
            if (IS_ANDROID && reason === 'stream-start' && isLocalPlayerInSyncGroupCached()) {
                await new Promise((resolve) => setTimeout(resolve, 800));
                window.playerInstance?.forcePlaybackResync?.();
            }
        } catch (err) {
            console.warn('playback join recovery failed:', reason, err);
        }
    }, delayMs);
}

function schedulePlaybackJoinRecovery(reason = 'join') {
    pendingJoinRecoveryReason = reason;
    clearTimeout(playbackJoinRecoveryDebounceTimer);
    const debounceMs = IS_TIZEN ? TIZEN_SYNC_JOIN_RECOVERY_DEBOUNCE_MS : 0;
    playbackJoinRecoveryDebounceTimer = setTimeout(() => {
        playbackJoinRecoveryDebounceTimer = null;
        void runPlaybackJoinRecovery(pendingJoinRecoveryReason);
    }, debounceMs);
}

function isTvLazyLibraryBootstrap() {
    return IS_TIZEN;
}

async function ensureTvLibraryBootstrap() {
    if (!IS_TIZEN || state.tvLibraryBootstrapped) return;
    state.tvLibraryBootstrapped = true;
    void ensureMusicProvidersCached();
    ensureLyricsBootstrapped();
}

async function waitForPlaybackBufferReady(minAheadSec, maxWaitMs) {
    const started = Date.now();
    while (Date.now() - started < maxWaitMs) {
        const processor = window.playerInstance?.audioProcessor;
        const ctx = window.playerInstance?.audioContext;
        if (processor && ctx) {
            const ahead = processor.getScheduledAheadSec?.(ctx.currentTime ?? 0) ?? 0;
            if (ahead >= minAheadSec) return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
}

function isLocalPlayerInSyncGroupCached() {
    if (state.playersActiveGroup?.allIds?.includes(maClient.playerId)) return true;
    const local = state.playersListCache.find((p) => p.player_id === maClient.playerId);
    return !!(local?.synced_to || local?.group_members?.length);
}

function applySyncGroupCorrectionMode(inGroup) {
    const profile = inGroup ? 'group' : 'solo';
    try {
        window.playerInstance?.setBufferProfile?.(profile);
    } catch (err) {
        console.warn('buffer profile apply failed:', err);
    }
    if (IS_ANDROID) return;
    const mode = inGroup ? 'sync' : 'quality-local';
    if (state.syncGroupCorrectionMode === mode) return;
    state.syncGroupCorrectionMode = mode;
    try {
        window.playerInstance?.setCorrectionMode?.(mode);
    } catch (err) {
        console.warn('correction mode apply failed:', err);
    }
}

function applyRemotePlaybackModes(shuffle, repeat) {
    if (Date.now() - state.lastLocalModeChange < MODE_POLL_GRACE_MS) return;
    let changed = false;
    if (shuffle != null) {
        const next = !!shuffle;
        if (state.shuffleEnabled !== next) { state.shuffleEnabled = next; changed = true; }
    }
    if (repeat != null) {
        const next = repeat || 'off';
        if (state.repeatMode !== next) { state.repeatMode = next; changed = true; }
    }
    if (changed) updateModeButtons();
}

function hasSimilarTracksSupport() {
    return (state.musicProvidersCache.list || []).some((p) => providerHasFeature(p, 'similar_tracks'));
}

function mediaItemSupportsDynamicRadio(item) {
    const mt = inferMediaType(item);
    return ['track', 'artist', 'album', 'playlist'].includes(mt);
}

function providerSupportsSimilarTracksForItem(item) {
    if (!hasSimilarTracksSupport()) return false;
    const prov = itemStoredProviderId(item) || itemProviderId(item);
    if (!prov || isLibraryLikeProvider(prov)) return true;
    const dom = normalizeProviderId(prov).split('--')[0].toLowerCase();
    return (state.musicProvidersCache.list || []).some((p) => {
        if (!providerHasFeature(p, 'similar_tracks')) return false;
        const pdom = normalizeProviderId(p.id).split('--')[0].toLowerCase();
        return pdom === dom || spotifyProviderIdsMatch(p.id, prov);
    });
}

function seedSupportsAutoplay(item) {
    if (!item || !mediaItemSupportsDynamicRadio(item) || isRadioMedia(item)) return false;
    return providerSupportsSimilarTracksForItem(item);
}

function isValidMaItemId(id) {
    if (id == null || id === '') return false;
    const s = String(id);
    return s !== 'undefined' && s !== 'null';
}

function maItemIdFromUri(uri) {
    if (!uri || typeof uri !== 'string') return '';
    try {
        const withoutScheme = uri.includes('://') ? uri.split('://').slice(1).join('://') : uri;
        const segments = withoutScheme.split('/').filter(Boolean);
        const last = segments[segments.length - 1] || '';
        return last && last !== '..' ? last : '';
    } catch (err) {
        return '';
    }
}


function startMaModeSync() {
    const address = localStorage.getItem('ma_server_ip') || DEFAULT_SERVER_ADDRESS;
    maClient.connect(address);
}

async function retryMaConnection() {
    const address = localStorage.getItem('ma_server_ip') || DEFAULT_SERVER_ADDRESS;
    const playerName = localStorage.getItem('ma_player_name') || DEFAULT_PLAYER_NAME;
    setStatus(`connecting ${describeConnection(address)}…`);
    maClient.disconnect(true, true);
    startMaModeSync();
    try {
        await maClient.ensureReady();
        setStatus(`connected · ${playerName}`, getShowConnection() ? 'connected' : '');
        if (state.browsePanelOpen) {
            await uiH('loadCurrentBrowseView', { forceRefresh: true });
        }
        if (state.queuePanelOpen) {
            void uiH('loadQueueItems', true);
        }
    } catch (err) {
        console.warn('MA retry failed:', err);
        setStatus('connection failed — check settings', 'error');
    }
}

function createMaConnectionStatusRow(message = 'MA not connected') {
    const wrap = document.createElement('div');
    wrap.className = 'panel-row-wrap ma-connection-status';
    wrap.dataset.index = '0';

    const main = document.createElement('div');
    main.className = 'panel-row-main ma-connection-main';
    const text = document.createElement('div');
    text.className = 'panel-row-text';
    const title = document.createElement('span');
    title.className = 'panel-row-title';
    title.textContent = 'MA not connected';
    const subtitle = document.createElement('span');
    subtitle.className = 'panel-row-subtitle';
    subtitle.textContent = message;
    text.appendChild(title);
    text.appendChild(subtitle);
    main.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'panel-row-actions ma-connection-actions';
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'player-sync-delay-btn ma-retry-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void retryMaConnection();
    });
    actions.appendChild(retryBtn);

    wrap.appendChild(main);
    wrap.appendChild(actions);
    return wrap;
}

function stopMaModeSync() {
    maClient.disconnect();
}

function formatProviderLabel(providerId) {
    const normalized = normalizeProviderId(providerId);
    const domain = String(normalized).split('--')[0].toLowerCase();
    if (domain === 'library' || domain.startsWith('filesystem')) return 'Library';
    const foundSearch = state.searchProviderOptions.find((p) => p.id === normalized || p.id === providerId);
    if (foundSearch) return normalizeProviderDisplayName(foundSearch.name, foundSearch.id);
    const fromCache = (state.musicProvidersCache.list || []).find((p) => (
        p.id === normalized || p.id === providerId
        || String(p.id).split('--')[0].toLowerCase() === domain
    ));
    if (fromCache?.name) return normalizeProviderDisplayName(fromCache.name, fromCache.id);
    return domain.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function normalizeArtistBaseName(name) {
    return (name || '').trim().replace(/\s*\([^)]+\)\s*$/g, '').trim();
}

function hasArtistVersionSuffix(name) {
    const trimmed = (name || '').trim();
    if (!trimmed.includes('(')) return false;
    const base = normalizeArtistBaseName(trimmed);
    return base.length > 0 && base.length < trimmed.length;
}

function cleanArtistDisplayName(name) {
    return normalizeArtistBaseName(name) || (name || '').trim();
}

function primaryFromJoinedArtistStr(str) {
    if (!str || typeof str !== 'string') return '';
    if (!/\s\/\s/.test(str)) return cleanArtistDisplayName(str);
    return cleanArtistDisplayName(str.split(/\s+\/\s+/)[0]);
}

function pickAlbumArtistName(album) {
    if (!album || typeof album !== 'object') return '';
    const candidates = [
        album.artist_str,
        album.artists?.[0]?.name,
        album.artist,
        album.metadata?.artist,
        album.metadata?.artists?.[0]?.name,
    ];
    for (const c of candidates) {
        const raw = typeof c === 'string' ? c : c?.name || '';
        const name = primaryFromJoinedArtistStr(raw) || cleanArtistDisplayName(raw);
        if (name && !isProviderLike(name)) return name;
    }
    return '';
}

function findArtistRefByName(artists, name) {
    if (!name || !Array.isArray(artists)) return null;
    return artists.find((a) => a?.name && namesMatchForArtist(a.name, name)) || null;
}

function pickPrimaryArtistRef(media) {
    if (!media) return null;
    const mt = inferMediaType(media) || (media.media_type || '').toLowerCase();
    const album = media.album && typeof media.album === 'object' ? media.album : null;
    const albumArtistRef = album?.artists?.[0] || null;
    const multiPerformer = (media.artists?.length || 0) > 1;
    const albumArtistName = pickAlbumArtistName(album || (mt === 'album' ? media : null));

    if (albumArtistRef?.item_id || albumArtistRef?.uri) {
        if (multiPerformer || mt === 'track' || mt === 'album') return albumArtistRef;
    }
    if (albumArtistName && Array.isArray(media.artists)) {
        const match = findArtistRefByName(media.artists, albumArtistName);
        if (match?.item_id || match?.uri) return match;
    }
    if (albumArtistRef) return albumArtistRef;

    const displayName = pickDisplayArtistName(media);
    if (displayName && Array.isArray(media.artists)) {
        const match = findArtistRefByName(media.artists, displayName);
        if (match) return match;
    }
    if (multiPerformer) {
        return album?.artists?.[0] || media.metadata?.artists?.[0] || null;
    }
    return media.artists?.[0] || album?.artists?.[0] || media.metadata?.artists?.[0] || null;
}

function trackNeedsArtistEnrich(media) {
    if (!media || inferMediaType(media) !== 'track') return false;
    if ((media.artists?.length || 0) <= 1) return false;
    return !pickAlbumArtistName(media.album);
}

async function resolveAlbumArtistEmbed(album) {
    if (!album || typeof album !== 'object') return null;
    if (album.artists?.[0]?.name) return album.artists[0];
    const cacheKey = album.uri
        || `${album.item_id}:${itemStoredProviderId(album) || album.provider_instance_id || album.provider || 'library'}`;
    if (state.albumArtistCache.has(cacheKey)) return state.albumArtistCache.get(cacheKey);

    let artistRef = null;
    try {
        await maClient.ensureReady();
        let fullAlbum = null;
        if (album.uri) {
            fullAlbum = await maClient.send('music/item_by_uri', { uri: album.uri });
        } else if (album.item_id) {
            fullAlbum = await maClient.send('music/item', {
                media_type: 'album',
                item_id: album.item_id,
                provider_instance_id_or_domain: itemStoredProviderId(album)
                    || album.provider_instance_id || album.provider || 'library',
            });
        }
        artistRef = fullAlbum?.artists?.[0] || null;
    } catch (err) {
        /* fall through */
    }
    state.albumArtistCache.set(cacheKey, artistRef);
    trimMapCache(state.albumArtistCache, ALBUM_ARTIST_CACHE_MAX);
    return artistRef;
}

async function enrichTrackArtistMetadata(media) {
    if (!media || !trackNeedsArtistEnrich(media)) return media;
    const album = media.album;
    let artistRef = await resolveAlbumArtistEmbed(album);
    if (!artistRef) {
        const full = await fetchFullMaMedia(media, 'track');
        if (full) return full;
        return media;
    }
    return {
        ...media,
        album: { ...album, artists: [artistRef] },
    };
}

async function enrichSearchTrackRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return rows || [];
    const out = new Array(rows.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(6, rows.length) }, async () => {
        while (cursor < rows.length) {
            const idx = cursor++;
            const row = rows[idx];
            if (row.mediaType !== 'track' || !row.raw) {
                out[idx] = row;
                continue;
            }
            try {
                const enriched = await enrichTrackArtistMetadata(row.raw);
                if (enriched !== row.raw) {
                    out[idx] = {
                        ...row,
                        raw: enriched,
                        subtitle: maItemSubtitle(enriched),
                    };
                } else {
                    out[idx] = row;
                }
            } catch (err) {
                out[idx] = row;
            }
        }
    });
    await Promise.all(workers);
    return out;
}

function pickDisplayArtistName(item) {
    if (!item) return '';
    const mt = inferMediaType(item) || (item.media_type || '').toLowerCase();
    const albumArtist = pickAlbumArtistName(
        mt === 'album' ? item : item.album,
    );
    const multiPerformer = (item.artists?.length || 0) > 1;
    if (albumArtist && (mt === 'track' || mt === 'album' || multiPerformer)) {
        return albumArtist;
    }
    if (multiPerformer) {
        if (item.artists?.[0]?.name) {
            const name = cleanArtistDisplayName(item.artists[0].name);
            if (name && !isProviderLike(name)) return name;
        }
        const fromStr = primaryFromJoinedArtistStr(item.artist_str || item.artist);
        if (fromStr && !isProviderLike(fromStr)) return fromStr;
        return albumArtist;
    }
    const candidates = [
        item.artists?.[0]?.name,
        item.artist_str,
        item.artist,
        item.metadata?.artist,
        item.metadata?.artists?.[0]?.name,
    ];
    for (const c of candidates) {
        const raw = typeof c === 'string' ? c : c?.name || '';
        const name = primaryFromJoinedArtistStr(raw) || cleanArtistDisplayName(raw);
        if (name && !isProviderLike(name)) return name;
    }
    return albumArtist;
}

function foldDiacritics(text) {
    return (text || '').normalize('NFD').replace(/\p{M}/gu, '');
}

function normalizeForMatch(text) {
    return foldDiacritics(text).toLowerCase()
        .replace(/\s*\([^)]*\)/g, ' ')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isSameArtistName(a, b) {
    const na = normalizeForMatch(cleanArtistDisplayName(a));
    const nb = normalizeForMatch(cleanArtistDisplayName(b));
    if (!na || !nb) return false;
    if (na === nb) return true;
    const stripLeadingThe = (s) => s.replace(/^the\s+/, '').trim();
    return stripLeadingThe(na) === stripLeadingThe(nb);
}

function albumMatchesBrowseArtist(album, artistName) {
    if (!album || !artistName) return false;
    const names = [];
    if (album.artist) names.push(album.artist);
    for (const a of album.artists || []) {
        if (a?.name) names.push(a.name);
    }
    if (!names.length) return false;
    return names.some((n) => isSameArtistName(n, artistName));
}

function providerNeedsStrictArtistDiscography(provider) {
    return providerIconDomain(provider) === 'internet_archive';
}

function namesMatchForArtist(a, b) {
    const na = normalizeForMatch(cleanArtistDisplayName(a));
    const nb = normalizeForMatch(cleanArtistDisplayName(b));
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) return true;
    return titlesRoughlyMatch(a, b);
}

function titlesRoughlyMatch(a, b) {
    const na = normalizeForMatch(a);
    const nb = normalizeForMatch(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
    const wa = na.split(' ').filter((w) => w.length > 2);
    const wb = new Set(nb.split(' ').filter((w) => w.length > 2));
    if (!wa.length || !wb.size) return false;
    let overlap = 0;
    for (const w of wa) if (wb.has(w)) overlap += 1;
    return overlap / wa.length >= 0.75;
}

function dedupeSearchRows(rows) {
    const seen = new Set();
    return rows.filter((row) => {
        const raw = row.raw;
        const itemKey = raw?.item_id
            ? `${itemStoredProviderId(raw)}:${raw.item_id}`
            : '';
        const normTitle = (row.title || '').toLowerCase().trim();
        const key = itemKey || `${row.mediaType}:${normTitle}`;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function shouldShowArtistItem(item) {
    if (!item?.name) return false;
    return !hasArtistVersionSuffix(item.name);
}

function filterAlbumTracks(tracks, albumItem) {
    if (!Array.isArray(tracks) || !albumItem) return tracks || [];
    const albumArtist = pickDisplayArtistName(albumItem).toLowerCase();
    const albumName = (albumItem.name || '').trim().toLowerCase();
    const isVarious = !albumArtist || /various|^va\b|soundtrack|\bost\b/i.test(albumArtist);

    return tracks.filter((track) => {
        if (!track || track.name === '..') return false;
        if (isVarious) return true;
        const trackAlbum = (track.album?.name || '').trim().toLowerCase();
        if (trackAlbum && albumName && trackAlbum !== albumName) return false;
        if (trackAlbum && albumName && trackAlbum === albumName) return true;
        const trackArtist = pickDisplayArtistName(track).toLowerCase();
        if (!trackArtist || !albumArtist) return true;
        if (trackArtist === albumArtist) return true;
        return namesMatchForArtist(trackArtist, albumArtist);
    });
}


function getSpotifyProviderIds() {
    return (state.musicProvidersCache.list || [])
        .filter((p) => isSpotifyProvider(p.id))
        .map((p) => p.id);
}

function isSpotifySyncedLibraryItem(item) {
    return itemHasSpotifyInLibraryMapping(item, getSpotifyProviderIds())
        || isSpotifyProvider(itemProviderId(item));
}

function isLocalLibraryItem(item) {
    const stored = itemStoredProviderId(item);
    if (!isLibraryLikeProvider(stored)) return false;
    return !isSpotifySyncedLibraryItem(item);
}

function providerOptsForPreferred(preferredProvider) {
    if (!preferredProvider) return {};
    const pref = normalizeProviderId(preferredProvider);
    return {
        preferredProvider: pref,
        inLibraryOnly: isLibraryLikeProvider(pref),
    };
}

function uriForProvider(item, preferredProvider) {
    if (!item) return '';
    const uri = item.uri || item.path || '';
    if (!preferredProvider) return uri;
    const pref = normalizeProviderId(preferredProvider);
    if (isSpotifyProvider(pref)) {
        const fromMapping = spotifyUriFromMappings(item, pref);
        if (fromMapping) return fromMapping;
    }
    if (isLibraryLikeProvider(pref)) {
        if (isLibraryLikeProvider(itemStoredProviderId(item))) return uri;
        const fromUri = providerFromUri(uri);
        if (fromUri && isLibraryLikeProvider(fromUri)) return uri;
        return uri;
    }
    const prov = itemProviderId(item);
    if (spotifyProviderIdsMatch(pref, prov) || normalizeProviderId(prov) === pref) return uri;
    if (spotifyProviderIdsMatch(pref, itemStoredProviderId(item))) return uri;
    return uri;
}

function spotifyUriFromMappings(item, preferredProvider) {
    if (!item || !preferredProvider || !isSpotifyProvider(preferredProvider)) return '';
    const spotifyIds = getSpotifyProviderIds();
    for (const mapping of item.provider_mappings || []) {
        const raw = mappingProviderRaw(mapping);
        if (!isSpotifyProvider(raw)) continue;
        if (!spotifyIds.some((pid) => spotifyProviderIdsMatch(pid, raw))) continue;
        const url = String(mapping.url || '');
        const urlMatch = url.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/i);
        if (urlMatch) return `spotify://track:${urlMatch[1]}`;
        const itemId = mapping.item_id;
        if (itemId && !String(itemId).includes('/')) return `spotify://track:${itemId}`;
    }
    return '';
}

function isBuiltinMaProvider(providerId) {
    if (!providerId) return false;
    const dom = normalizeProviderId(providerId).split('--')[0].toLowerCase();
    return dom === 'builtin' || dom === 'musicassistant';
}

function browseChipOverridesProvider(entry, item) {
    if (!entry?.browseProviderId || entry.browseProviderId === 'all') return false;
    const raw = resolveBrowseItemRaw(item);
    const mt = item?.mediaType || inferMediaType(raw);
    if (mt !== 'playlist') return true;
    const prov = itemStoredProviderId(raw || item) || itemProviderId(raw || item);
    if (isBuiltinMaProvider(prov)) return false;
    const uri = String(raw?.uri || item?.uri || item?.path || '').toLowerCase();
    if (uri.includes('library://playlist') || uri.startsWith('playlist://')) return false;
    return true;
}

function trackPositionNumber(track) {
    return Number(track?.track_number ?? track?.track ?? 0) || 0;
}

function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 0; i < a.length; i += 1) {
        const cur = [i + 1];
        for (let j = 0; j < b.length; j += 1) {
            const cost = a[i] === b[j] ? 0 : 1;
            cur[j + 1] = Math.min(cur[j] + 1, prev[j + 1] + 1, prev[j] + cost);
        }
        prev = cur;
    }
    return prev[b.length];
}

function trackTitlesMatchForVariant(a, b) {
    if (!a || !b) return false;
    if (titlesRoughlyMatch(a, b)) return true;
    const na = normalizeForMatch(a);
    const nb = normalizeForMatch(b);
    if (!na || !nb) return false;
    const len = Math.max(na.length, nb.length);
    if (len < 5) return false;
    return levenshtein(na, nb) <= Math.max(2, Math.floor(len * 0.2));
}

function tracksAreSameAlbumSlot(a, b) {
    if (!a || !b) return false;
    const posA = trackPositionNumber(a);
    const posB = trackPositionNumber(b);
    if (!posA || !posB || posA !== posB) return false;
    return trackTitlesMatchForVariant(a.name, b.name);
}

function normalizeTrackMatchKey(track) {
    if (!track || track.name === '..') return '';
    const title = String(track.name || '').trim().toLowerCase();
    if (!title) return '';
    const num = Number(track.track_number ?? track.track ?? 0) || 0;
    return `${num}:${title}`;
}

function albumHasLocalTrackVariant(allTracks, track) {
    if (!Array.isArray(allTracks) || !track) return false;
    return allTracks.some((t) => t !== track && isLocalLibraryItem(t)
        && tracksAreSameAlbumSlot(t, track));
}

function mappingProviderRaw(mapping) {
    return mapping?.provider_instance || mapping?.provider_instance_id
        || mapping?.provider_domain || mapping?.provider || '';
}

function mappingIsFilesystem(mapping) {
    const dom = normalizeProviderId(mappingProviderRaw(mapping)).split('--')[0].toLowerCase();
    return dom.startsWith('filesystem');
}

function mappingIsSpotify(mapping) {
    return isSpotifyProvider(mappingProviderRaw(mapping));
}

function trackHasFilesystemMapping(track) {
    const mappings = track?.provider_mappings;
    if (!Array.isArray(mappings) || !mappings.length) return false;
    return mappings.some(mappingIsFilesystem);
}

function trackHasAnySpotifyMapping(track) {
    const mappings = track?.provider_mappings;
    if (!Array.isArray(mappings) || !mappings.length) return false;
    return mappings.some(mappingIsSpotify);
}

function isSpotifyOnlyLibraryTrack(track) {
    return trackHasSpotifyLibraryMapping(track) && !trackHasFilesystemMapping(track);
}

function trackHasSpotifyLibraryMapping(track) {
    return itemHasSpotifyInLibraryMapping(track, getSpotifyProviderIds());
}

function albumHasSpotifyOnlyTrackVariant(allTracks, track) {
    if (!Array.isArray(allTracks) || !track) return false;
    return allTracks.some((t) => t !== track && isSpotifyOnlyLibraryTrack(t)
        && tracksAreSameAlbumSlot(t, track));
}

function trackMatchesPreferredProvider(track, preferredProvider, allTracks = null) {
    if (!track || !preferredProvider) return true;
    const pref = normalizeProviderId(preferredProvider);
    const uri = track.uri || track.path || '';
    if (isLibraryLikeProvider(pref)) {
        // Prefer local files; keep Spotify-synced copies only when no local
        // file exists for the same track (MA often returns both as disc 0/1).
        if (isLocalLibraryItem(track)) return true;
        if (isSpotifySyncedLibraryItem(track)) {
            return !allTracks || !albumHasLocalTrackVariant(allTracks, track);
        }
        return false;
    }
    if (isSpotifyProvider(pref)) {
        if (/^spotify:/i.test(uri)) return true;
        if (providerFromUri(uri) === 'spotify') return true;
        const hasFs = trackHasFilesystemMapping(track);
        const hasSpot = trackHasAnySpotifyMapping(track);
        // Filesystem-primary rows (e.g. Oxygen, local-only disc 0 tracks).
        if (hasFs && !hasSpot) return false;
        // Spotify-only saved rows (disc 1).
        if (!hasFs && hasSpot) return true;
        // Dual-mapped: keep only when no spotify-only sibling for this slot.
        if (hasFs && hasSpot) {
            return !(allTracks && albumHasSpotifyOnlyTrackVariant(allTracks, track));
        }
        if (isLocalLibraryItem(track)) return false;
        const prov = itemProviderId(track) || itemStoredProviderId(track) || providerFromUri(uri);
        if (spotifyProviderIdsMatch(pref, prov) || normalizeProviderId(prov) === pref) return true;
        if (isSpotifySyncedLibraryItem(track)) return true;
        return false;
    }
    const prov = itemProviderId(track) || itemStoredProviderId(track) || providerFromUri(uri);
    if (spotifyProviderIdsMatch(pref, prov) || normalizeProviderId(prov) === pref) return true;
    return false;
}

function normalizeTrackDedupeKey(track) {
    return normalizeTrackMatchKey(track);
}

function shouldPreferAlbumTrackVariant(candidate, incumbent, preferredProvider) {
    const pref = preferredProvider ? normalizeProviderId(preferredProvider) : null;
    const cMatch = pref && trackMatchesPreferredProvider(candidate, pref, null);
    const iMatch = pref && trackMatchesPreferredProvider(incumbent, pref, null);
    if (cMatch && !iMatch) return true;
    if (!cMatch && iMatch) return false;
    if (pref && isSpotifyProvider(pref)) {
        const cSpotOnly = isSpotifyOnlyLibraryTrack(candidate);
        const iSpotOnly = isSpotifyOnlyLibraryTrack(incumbent);
        if (cSpotOnly && !iSpotOnly) return true;
        if (!cSpotOnly && iSpotOnly) return false;
    }
    const cLocal = isLocalLibraryItem(candidate);
    const iLocal = isLocalLibraryItem(incumbent);
    if (cLocal && !iLocal) return true;
    if (!cLocal && iLocal) return false;
    return false;
}

function dedupeAlbumTrackVariants(tracks, preferredProvider) {
    if (!Array.isArray(tracks) || tracks.length < 2) return tracks || [];
    const byKey = new Map();
    const order = [];
    for (const track of tracks) {
        if (!track || track.name === '..') continue;
        let key = normalizeTrackDedupeKey(track);
        if (key) {
            for (const existingKey of order) {
                const existing = byKey.get(existingKey);
                if (existing && tracksAreSameAlbumSlot(existing, track)) {
                    key = existingKey;
                    break;
                }
            }
        }
        if (!key) key = String(track.uri || track.path || track.item_id || '');
        if (!key) continue;
        if (!byKey.has(key)) {
            byKey.set(key, track);
            order.push(key);
            continue;
        }
        if (shouldPreferAlbumTrackVariant(track, byKey.get(key), preferredProvider)) {
            byKey.set(key, track);
        }
    }
    return order.map((k) => byKey.get(k));
}

function sortAlbumTracksInAlbumOrder(tracks, preferredProvider = null) {
    const spotifyOrder = preferredProvider && isSpotifyProvider(normalizeProviderId(preferredProvider));
    return [...tracks].sort((a, b) => {
        if (!spotifyOrder) {
            const da = Number(a.disc_number ?? a.disc ?? 0) || 0;
            const db = Number(b.disc_number ?? b.disc ?? 0) || 0;
            if (da !== db) return da - db;
        }
        const ta = Number(a.track_number ?? a.track ?? 0) || 0;
        const tb = Number(b.track_number ?? b.track ?? 0) || 0;
        if (ta !== tb) return ta - tb;
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
}

function filterAlbumTracksForProvider(tracks, preferredProvider) {
    if (!Array.isArray(tracks)) return [];
    let out = tracks;
    if (preferredProvider) {
        out = out.filter((t) => trackMatchesPreferredProvider(t, preferredProvider, tracks));
    }
    out = dedupeAlbumTrackVariants(out, preferredProvider);
    return sortAlbumTracksInAlbumOrder(out, preferredProvider);
}

async function collectProviderTrackUris(tracks, preferredProvider, providerOpts = {}) {
    if (!Array.isArray(tracks) || !tracks.length) return [];
    const pref = preferredProvider || providerOpts?.preferredProvider || null;
    const filtered = filterAlbumTracksForProvider(tracks, pref);
    const uris = [];
    for (const track of filtered) {
        if (!track || track.name === '..') continue;
        let uri = uriForProvider(track, pref);
        if (!uri && pref) {
            try {
                const resolved = await maClient.resolveMaItemForProvider(track, pref);
                uri = resolved?.uri || resolved?.path || '';
            } catch {
                uri = '';
            }
        }
        if (uri) uris.push(uri);
    }
    return uris;
}

function getRadioCapableProviders() {
    return (state.musicProvidersCache.list || []).filter(isRadioCapableProvider);
}

function isRadioBrowseItem(item) {
    if (inferMediaType(item) === 'radio') return true;
    const uri = (item?.uri || item?.path || '').toLowerCase();
    return uri.includes('radio');
}

function isRadioBrowseFolder(item) {
    if (!item || item.name === '..') return false;
    if (isRadioBrowseItem(item)) return false;
    const name = (item.name || '').toLowerCase();
    return RADIO_BROWSE_FOLDER_HINTS.some((h) => name.includes(h));
}

function dedupeRadioItems(items) {
    const seen = new Set();
    return (items || []).filter((item) => {
        const key = item?.uri || item?.path
            || `${item?.item_id || item?.name}:${itemProviderId(item)}`;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function invalidateProviderCaches() {
    state.musicProvidersCache.ready = false;
    state.musicProvidersCache.list = [];
    state.musicProvidersCache.loadedAt = 0;
    state.searchProvidersReady = false;
    state.browseProviderContentCache.clear();
    state.radioCatalogCache.clear();
    state.radioMergedCatalogCache.clear();
    state.favoritesListCache = null;
}

async function ensureMusicProvidersCached(force = false) {
    const stale = state.musicProvidersCache.ready
        && (Date.now() - (state.musicProvidersCache.loadedAt || 0) > PROVIDER_CACHE_TTL_MS);
    if (!force && state.musicProvidersCache.ready && !stale) {
        return state.musicProvidersCache.list;
    }
    try {
        await maClient.ensureReady();
        state.musicProvidersCache.list = await maClient.loadMusicProviders();
        state.musicProvidersCache.ready = true;
        state.musicProvidersCache.loadedAt = Date.now();
        state.searchProvidersReady = false;
        syncQueueActionChips();
    } catch (err) {
        console.warn('load music providers failed:', err);
    }
    return state.musicProvidersCache.list;
}

function positionOverlayMenu(triggerEl, menuEl, align = 'right') {
    if (!triggerEl || !menuEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const margin = 8;
    const viewportPad = 12;
    const openUpward = isAndroidPortraitBottomNav();
    if (openUpward) {
        menuEl.style.top = 'auto';
        menuEl.style.bottom = `${Math.max(viewportPad, window.innerHeight - rect.top + margin)}px`;
    } else {
        menuEl.style.top = `${rect.bottom + margin}px`;
        menuEl.style.bottom = 'auto';
    }
    const menuWidth = menuEl.offsetWidth || menuEl.getBoundingClientRect().width || menuEl.scrollWidth;
    let left;
    if (align === 'center') {
        left = rect.left + (rect.width / 2) - (menuWidth / 2);
    } else if (align === 'left') {
        left = rect.left;
    } else {
        left = rect.right - menuWidth;
    }
    left = Math.max(viewportPad, Math.min(left, window.innerWidth - menuWidth - viewportPad));
    menuEl.style.left = `${left}px`;
    menuEl.style.right = 'auto';
}

// Canonical MA 2.9.x endpoint: /imageproxy/<64-hex proxy_id>?size=&fmt=
// Deprecated MA endpoint kept as a fallback for images lacking a proxy_id.
// MA decodes the path iteratively, so a single encode is correct here.
// Prefer the opaque proxy_id endpoint, fall back to the legacy path= form.
// Pick a usable artist portrait. MA only stores genuine downloaded art
// (Spotify, theaudiodb, etc.) in metadata.images; it never stores its
// generated "initials" placeholders here, so requiring a real image
// path/proxy_id is enough to avoid those. Prefer a square 'thumb' over
// wide fanart/banner/logo art.
function getBrowseThumbUrl(item, size = 160) {
    if (!item) return '';
    if (inferMediaType(item) === 'artist') {
        const img = pickArtistImage(item);
        if (img) {
            const url = buildMaArtUrlFromImage(img, size);
            if (url) return url;
        }
        return '';
    }
    const imageSources = [
        item.image,
        item.album?.image,
        item.metadata?.images?.[0],
        item.album?.metadata?.images?.[0],
    ];
    for (const img of imageSources) {
        if (img && (isMaImageProxyId(img.proxy_id) || img.path)) {
            const url = buildMaArtUrlFromImage(img, size);
            if (url) return url;
        }
    }
    return getArtUrl(item) || '';
}

function mediaTypeIcon(mediaType, provider) {
    const map = {
        artist: 'artists.svg',
        album: 'albums.svg',
        playlist: 'playlists.svg',
        track: 'tracks.svg',
        radio: 'radio.svg',
        audiobook: 'audiobooks.svg',
        podcast: 'podcasts.svg',
        podcast_episode: 'podcasts.svg',
        genre: 'genres.svg',
        folder: 'folder.svg',
    };
    if (mediaType === 'folder') return providerIcon(provider);
    return map[mediaType] || 'library.svg';
}

function inferMediaType(item) {
    let mt = (item?.media_type || item?.type || '').toLowerCase();
    if (mt === 'show') mt = 'podcast';
    if (mt) return mt;
    const uri = (item?.uri || item?.path || '').toLowerCase();
    if (uri.includes('playlist')) return 'playlist';
    if (uri.includes('artist')) return 'artist';
    if (uri.includes('album')) return 'album';
    if (uri.includes('genre')) return 'genre';
    if (uri.includes('radio')) return 'radio';
    if (uri.includes('podcast') && uri.includes('episode')) return 'podcast_episode';
    if (/[:/]episode[:/]/.test(uri)) return 'podcast_episode';
    if (uri.includes('podcast')) return 'podcast';
    if (/[:/]show[:/]/.test(uri)) return 'podcast';
    return '';
}

function looksLikeDescription(text) {
    if (!text || typeof text !== 'string') return false;
    const t = text.trim();
    if (t.length > 80) return true;
    if ((t.match(/[.!?]/g) || []).length >= 2) return true;
    if (/\b(narrated by|read by|written by|audiobook)\b/i.test(t) && t.length > 36) return true;
    return false;
}

function collectAuthorNames(item) {
    if (!item) return [];
    const names = [];
    const push = (v) => {
        if (!v) return;
        if (typeof v === 'string') names.push(v);
        else if (v.name) names.push(v.name);
    };
    (item.authors || []).forEach(push);
    (item.metadata?.authors || []).forEach(push);
    (item.artists || []).forEach(push);
    push(item.artist_str);
    push(item.author);
    if (item.album?.artists?.[0]?.name) push(item.album.artists[0].name);
    return names.filter(Boolean);
}

function pickAudiobookAuthor(item) {
    const names = collectAuthorNames(item);
    return names.find((n) => !looksLikeDescription(n) && !isProviderLike(n)) || '';
}

function isAudiobookItem(item) {
    if (!item) return false;
    const mt = (item?.media_type || item?.type || '').toLowerCase();
    if (mt === 'audiobook') return true;
    const uri = (item?.uri || item?.path || '').toLowerCase();
    if (uri.includes('audiobook')) return true;
    const albumUri = (item?.album?.uri || '').toLowerCase();
    if (albumUri.includes('audiobook')) return true;
    if ((item?.album?.media_type || '').toLowerCase() === 'audiobook') return true;
    const provider = `${item?.provider || ''} ${item?.provider_instance_id || ''}`.toLowerCase();
    return provider.includes('audiobookshelf') && mt !== 'radio';
}

async function enrichAudiobookAuthor(item) {
    if (!item) return '';
    const key = item.uri || `${item.item_id || ''}:${item.provider || ''}`;
    if (state.audiobookAuthorCache.has(key)) return state.audiobookAuthorCache.get(key);
    let author = pickAudiobookAuthor(item);
    if (!author && item.item_id) {
        try {
            await maClient.ensureReady();
            const full = await maClient.send('music/item', {
                media_type: item.media_type || 'audiobook',
                item_id: item.item_id,
                provider_instance_id_or_domain: item.provider_instance_id || item.provider || 'library',
            });
            author = pickAudiobookAuthor(full);
        } catch (err) { /* fall through */ }
    }
    state.audiobookAuthorCache.set(key, author || '');
    trimMapCache(state.audiobookAuthorCache, METADATA_LOOKUP_CACHE_MAX);
    return author || '';
}

function isPodcastEpisode(item) {
    if (!item) return false;
    const mt = inferMediaType(item);
    return mt === 'podcast_episode' || mt === 'episode';
}

function isPodcastShow(item) {
    if (!item) return false;
    return inferMediaType(item) === 'podcast';
}

function isProviderLike(text) {
    if (!text || typeof text !== 'string') return false;
    const t = text.trim();
    if (/^[a-z0-9]+--/i.test(t)) return true;
    // Provider instance ids: audiobookshelf-4iSZYUAE, tunein-abc123, etc.
    const parts = t.split('-');
    if (parts.length >= 2) {
        const suffix = parts[parts.length - 1];
        if (/^[a-zA-Z0-9]{6,}$/.test(suffix) && (/\d/.test(suffix) || suffix !== suffix.toLowerCase())) {
            return true;
        }
    }
    return false;
}

function isRadioMetadataPlaceholder(text) {
    if (!text || typeof text !== 'string') return false;
    const norm = text.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (/^return_to_/.test(norm)) return true;
    return norm === 'unknown' || norm === 'n_a' || norm === 'na';
}

function cleanRadioMetadataText(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || isRadioMetadataPlaceholder(trimmed)) return '';
    return trimmed;
}

function pickPodcastName(item) {
    if (!item) return '';
    if (item.podcast?.name) return item.podcast.name;
    if (typeof item.podcast === 'string') return item.podcast;
    if (item.album?.name) {
        const albumMt = (item.album.media_type || inferMediaType(item.album) || '').toLowerCase();
        if (albumMt === 'podcast' || isPodcastEpisode(item)) return item.album.name;
    }
    if (isPodcastEpisode(item) && item.album?.name) return item.album.name;
    if (item.show?.name) return item.show.name;
    if (item.show && typeof item.show === 'string') return item.show;
    const candidates = [item.publisher, item.artist_str, item.artists?.[0]?.name];
    for (const c of candidates) {
        if (c && !isProviderLike(c)) return c;
    }
    return '';
}

function trackArtistName(item) {
    return pickDisplayArtistName(item);
}

function trackAlbumName(item) {
    if (!item) return '';
    return item.album?.name || item.album_name || item.metadata?.album?.name
        || (typeof item.album === 'string' ? item.album : '');
}

function trackArtistAlbumSubtitle(item) {
    if (!item) return '';
    const artist = trackArtistName(item);
    const album = trackAlbumName(item);
    if (artist && album) return `${artist} - ${album}`;
    return artist || album || '';
}

function formatAlbumYear(item) {
    if (!item) return '';
    const raw = item.year || item.album?.year
        || item.metadata?.year || item.album?.metadata?.year
        || item.metadata?.album?.year || item.metadata?.album?.release_date
        || item.metadata?.release_date || item.release_date
        || item.album?.release_date || '';
    if (!raw) return '';
    const match = String(raw).match(/\d{4}/);
    return match ? match[0] : '';
}

function formatPodcastEpisodeDate(ep) {
    const ms = episodeDateMs(ep);
    if (!ms) return '';
    try {
        return new Date(ms).toLocaleDateString();
    } catch (err) {
        return '';
    }
}

function parseRadioHintsFromName(name) {
    if (!name) return '';
    const parts = [];
    const fm = name.match(/\b(\d{1,3}\.\d)\b/);
    if (fm) parts.push(`${fm[1]} FM`);
    else {
        const am = name.match(/\b(\d{1,3})\s*AM\b/i) || name.match(/\bAM\s*(\d{1,3})\b/i);
        if (am) parts.push(`${am[1]} AM`);
    }
    const genre = name.match(/\b(classic rock|classic hits|jazz|news|talk radio|talk|country|pop|classical|oldies|alternative|rock|hip[\s-]?hop|r&b|sports|npr|public radio)\b/i);
    if (genre) {
        const label = genre[0].replace(/\b\w/g, (c) => c.toUpperCase());
        parts.push(label);
    }
    return parts.slice(0, 2).join(' · ');
}

function parseMaRadioVersion(version) {
    if (!version || isProviderLike(version)) return { freq: '', genre: '' };
    const freq = (version.match(/\b(\d{1,3}\.\d)\b/) || [])[1] || '';
    const genre = (version.match(/\(([^)]+)\)/) || [])[1]?.trim() || '';
    return { freq, genre };
}

function pickRadioStationDetail(item) {
    if (!item) return 'Radio';
    const stationName = (item.name || '').trim().toLowerCase();
    const { freq, genre } = parseMaRadioVersion(item.version);
    if (freq) return /fm|am/i.test(freq) ? freq : `${freq} FM`;
    if (genre) return genre;
    const hints = parseRadioHintsFromName(item.name);
    if (hints) {
        for (const part of hints.split(' · ')) {
            if (part && part.toLowerCase() !== stationName) return part;
        }
    }
    const g = item.metadata?.genres?.[0] || item.metadata?.genre || item.metadata?.style;
    if (g) {
        const label = typeof g === 'string' ? g : g?.name || '';
        if (label && label.toLowerCase() !== stationName) return label;
    }
    if (item.frequency || item.metadata?.frequency) {
        return String(item.frequency || item.metadata.frequency);
    }
    return 'Radio';
}

function radioStationDetailShort(item) {
    if (!item) return 'Radio station';
    const ver = item.version && !isProviderLike(item.version) ? item.version.trim() : '';
    if (ver) {
        const parsed = parseMaRadioVersion(ver);
        const parts = [];
        if (parsed.freq) {
            parts.push(/fm|am/i.test(parsed.freq) ? parsed.freq : `${parsed.freq} FM`);
        }
        if (parsed.genre) parts.push(parsed.genre);
        if (parts.length) return parts.join(' · ');
        const stationName = (item.name || '').trim().toLowerCase();
        if (!stationName || !ver.toLowerCase().includes(stationName)) return ver;
    }
    const detail = pickRadioStationDetail(item);
    if (detail && detail !== 'Radio') return detail;
    return 'Radio station';
}

function radioListSubtitle(item) {
    return radioStationDetailShort(item);
}

function formatRadioStationFullLine(item) {
    const name = (item?.name || '').trim();
    const detail = radioStationDetailShort(item);
    if (!name) return detail;
    if (!detail || detail === 'Radio station') return name;
    if (detail.toLowerCase() === name.toLowerCase()) return name;
    return `${name} · ${detail}`;
}

function buildRadioStationSubtitle(item) {
    return formatRadioStationFullLine(item);
}

function radioNowPlayingDetailSubtitle(item) {
    const detail = radioStationDetailShort(item);
    return detail === 'Radio station' ? '' : detail;
}

function getRadioStationUri(item) {
    return item?.uri || item?.path || '';
}

function getRadioStationFallback(item) {
    const uri = getRadioStationUri(item);
    if (!uri || uri !== state.lastRadioStationFallbackUri) return '';
    return state.lastRadioStationFallback;
}

function setRadioStationFallback(item, sub) {
    const uri = getRadioStationUri(item);
    if (!uri || !sub) return;
    state.lastRadioStationFallbackUri = uri;
    state.lastRadioStationFallback = sub;
}

function onRadioStationUriChanged(stationMedia) {
    const uri = getRadioStationUri(stationMedia);
    if (uri && uri !== state.lastRadioStationFallbackUri) {
        state.lastRadioStationFallbackUri = uri;
        state.lastRadioStationFallback = '';
        state.lastRadioStreamMetaKey = '';
    }
}

function readRadioSwitchInfoMap() {
    try {
        const raw = localStorage.getItem(RADIO_SWITCH_INFO_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function isRadioSwitchInfoEnabled(stationMedia) {
    const uri = getRadioStationUri(stationMedia);
    if (!uri) return false;
    return !!readRadioSwitchInfoMap()[uri];
}

function setRadioSwitchInfo(stationMedia, enabled) {
    const uri = getRadioStationUri(stationMedia);
    if (!uri) return;
    const map = readRadioSwitchInfoMap();
    if (enabled) map[uri] = true;
    else delete map[uri];
    localStorage.setItem(RADIO_SWITCH_INFO_KEY, JSON.stringify(map));
}

function refreshRadioNowPlayingText() {
    const queueItem = maClient.activeQueue?.current_item;
    const media = queueItem?.media_item;
    if (!media || !isRadioMedia(media)) return;
    const radioNp = resolveRadioNowPlaying(state.lastSendspinMetadata, media, queueItem);
    applyRadioNowPlayingText(radioNp, media);
}

function radioStreamMetaKey(queueItem) {
    const sd = queueItem?.streamdetails;
    if (!sd) return '';
    const sm = sd.stream_metadata;
    return [
        sd.stream_title || '',
        sm?.title || '',
        sm?.artist || '',
    ].join('\0');
}

function maQueueHasRadioStreamMeta(queueItem) {
    const sd = queueItem?.streamdetails;
    if (!sd) return false;
    if (sd.stream_title) return true;
    const sm = sd.stream_metadata;
    return !!(sm && (sm.title || sm.artist));
}

const RADIO_JUNK_ARTIST = new Set([
    'live', 'live recording', 'recording', 'version', 'remix', 'edit',
    'acoustic', 'instrumental', 'karaoke', 'remaster', 'unplugged',
]);

function isRadioJunkArtist(text) {
    const norm = cleanRadioMetadataText(text).toLowerCase();
    return !norm || RADIO_JUNK_ARTIST.has(norm);
}

function stripRadioStreamTitlePipe(raw) {
    if (!raw) return '';
    const idx = raw.indexOf(' | ');
    return (idx >= 0 ? raw.slice(0, idx) : raw).trim();
}

function splitMaRadioStreamTitle(raw) {
    const cleaned = stripRadioStreamTitlePipe(cleanRadioMetadataText(raw));
    if (!cleaned) return { title: '', artist: '' };
    if (!cleaned.includes(' - ')) return { title: cleaned, artist: '' };
    const idx = cleaned.indexOf(' - ');
    return {
        artist: cleaned.slice(0, idx).trim(),
        title: cleaned.slice(idx + 3).trim(),
    };
}

function parseRadioTrackFromMaQueue(queueItem) {
    const sd = queueItem?.streamdetails;
    if (!sd) return null;
    const sm = sd.stream_metadata;
    if (sm && (sm.title || sm.artist)) {
        return {
            title: cleanRadioMetadataText(sm.title),
            artist: cleanRadioMetadataText(sm.artist),
            source: 'stream_metadata',
        };
    }
    if (sd.stream_title) {
        const split = splitMaRadioStreamTitle(sd.stream_title);
        if (split.title && isRadioJunkArtist(split.title) && split.artist) {
            return {
                title: cleanRadioMetadataText(stripRadioStreamTitlePipe(sd.stream_title)),
                artist: '',
                source: 'stream_title',
            };
        }
        if (split.title || split.artist) {
            return { ...split, source: 'stream_title' };
        }
    }
    return null;
}

function parseRadioTrackFromPlayerMedia(media, stationName) {
    if (!media) return null;
    let title = cleanRadioMetadataText(media.title);
    let artist = cleanRadioMetadataText(media.artist || media.artist_str);
    if (title && isRadioStationText(title, stationName)) title = '';
    if (artist && isRadioStationText(artist, stationName)) artist = '';
    if (title && title.includes(' - ') && !artist) {
        return { ...splitMaRadioStreamTitle(title), source: 'current_media' };
    }
    if (title && isRadioJunkArtist(artist)) artist = '';
    if (title || artist) return { title, artist, source: 'current_media' };
    return null;
}

function parseRadioTrackFromSendspin(m, stationName) {
    if (!m) return null;
    let title = cleanRadioMetadataText(m.title);
    let artist = cleanRadioMetadataText(
        m.artist || m.artist_str || m.artists?.[0]?.name || '',
    );
    if (title && isRadioStationText(title, stationName)) title = '';
    if (artist && isRadioStationText(artist, stationName)) artist = '';
    if (title && title.includes(' - ')) {
        const split = splitMaRadioStreamTitle(title);
        if (split.title || split.artist) return { ...split, source: 'sendspin' };
    }
    if (title && isRadioJunkArtist(artist)) artist = '';
    if (!title && !artist) return null;
    return { title, artist, source: 'sendspin' };
}

function applyRadioNowPlayingText(radioNp, stationMedia) {
    let title = radioNp.title;
    let subtitle = radioNp.subtitle;
    const media = stationMedia || maClient.activeQueue?.current_item?.media_item;
    if (media && isRadioMedia(media) && isRadioSwitchInfoEnabled(media) && subtitle) {
        [title, subtitle] = [subtitle, title];
    }
    setSongTitle(title);
    if (subtitle) {
        setArtistLine(subtitle);
    } else if (!radioNp.hasTrackMeta) {
        setArtistLine('');
    }
}

function splitIcyCombined(raw) {
    return splitMaRadioStreamTitle(raw);
}

function isRadioStationText(text, stationName) {
    if (!text || !stationName) return false;
    return text.trim().toLowerCase() === stationName.trim().toLowerCase();
}

function orientRadioTrackMetadata(title, artist, stationName) {
    let t = cleanRadioMetadataText(title);
    let a = cleanRadioMetadataText(artist);
    if (!t && !a) return { title: '', artist: '' };
    if (t && t.includes(' - ') && (!a || isRadioJunkArtist(a))) {
        return splitMaRadioStreamTitle(t);
    }
    if (!t && a) return { title: a, artist: '' };
    if (!a && t) return { title: t, artist: '' };
    if (isRadioStationText(t, stationName)) return { title: a, artist: '' };
    if (isRadioStationText(a, stationName)) return { title: t, artist: '' };
    if (isRadioJunkArtist(a)) return { title: t, artist: '' };
    return { title: t, artist: a };
}

function parseIcyStreamFields(m, stationMedia, queueItem) {
    const stationName = (stationMedia?.name || '').trim();
    if (!m && !queueItem) return { isIcy: false, title: '', artist: '' };

    const fromMa = parseRadioTrackFromMaQueue(queueItem);
    if (fromMa?.title || fromMa?.artist) {
        return { isIcy: true, title: fromMa.title, artist: fromMa.artist };
    }

    let title = cleanRadioMetadataText(m?.title);
    let artist = cleanRadioMetadataText(
        m?.artist || m?.artist_str || m?.artists?.[0]?.name || '',
    );

    if (title && artist) {
        const titleIsStation = isRadioStationText(title, stationName);
        const artistIsStation = isRadioStationText(artist, stationName);
        if (!titleIsStation && !artistIsStation && !isRadioJunkArtist(artist)) {
            return { isIcy: true, title, artist };
        }
        if (!titleIsStation && (artistIsStation || isRadioJunkArtist(artist))) {
            return { isIcy: true, title, artist: '' };
        }
        if (titleIsStation && !artistIsStation) {
            if (artist.includes(' - ')) {
                const split = splitMaRadioStreamTitle(artist);
                return { isIcy: true, title: split.title, artist: split.artist };
            }
            return { isIcy: true, title: artist, artist: '' };
        }
    }

    if (title && !artist && !isRadioStationText(title, stationName)) {
        if (title.includes(' - ')) {
            const split = splitMaRadioStreamTitle(title);
            if (!isRadioStationText(split.title, stationName)
                && !isRadioStationText(split.artist, stationName)) {
                return { isIcy: true, title: split.title, artist: split.artist };
            }
        }
        if (stationName) return { isIcy: true, title, artist: '' };
    }

    const qiName = cleanRadioMetadataText(queueItem?.name);
    if (qiName && stationName && !isRadioStationText(qiName, stationName)) {
        if (qiName.includes(' - ')) {
            const split = splitMaRadioStreamTitle(qiName);
            return { isIcy: true, title: split.title, artist: split.artist };
        }
        return { isIcy: true, title: qiName, artist: '' };
    }

    return { isIcy: false, title: '', artist: '' };
}

function isRadioIcyTrack(m, stationMedia, queueItem) {
    return parseIcyStreamFields(m, stationMedia, queueItem).isIcy;
}

function resolveRadioNowPlaying(m, maMedia, queueItem, playerMedia) {
    const stationName = (maMedia?.name || '').trim();
    onRadioStationUriChanged(maMedia);

    const fromQueue = parseRadioTrackFromMaQueue(queueItem);
    if (fromQueue?.title || fromQueue?.artist) {
        return {
            title: fromQueue.title || stationName || 'Ready',
            subtitle: fromQueue.artist || '',
            hasTrackMeta: true,
        };
    }

    const fromPlayer = parseRadioTrackFromPlayerMedia(playerMedia, stationName);
    if (fromPlayer?.title || (fromPlayer?.artist && !isRadioJunkArtist(fromPlayer.artist))) {
        return {
            title: fromPlayer.title || stationName || 'Ready',
            subtitle: fromPlayer.artist || '',
            hasTrackMeta: !!(fromPlayer.title && fromPlayer.artist)
                || !!(fromPlayer.title && !isRadioJunkArtist(fromPlayer.title)),
        };
    }

    const fromSpin = parseRadioTrackFromSendspin(m, stationName);
    if (fromSpin?.title || fromSpin?.artist) {
        return {
            title: fromSpin.title || stationName || 'Ready',
            subtitle: fromSpin.artist || '',
            hasTrackMeta: !!(fromSpin.title && fromSpin.artist) || !!fromSpin.title,
        };
    }

    const detail = radioNowPlayingDetailSubtitle(maMedia);
    const fallback = detail || getRadioStationFallback(maMedia);
    return {
        title: stationName || 'Ready',
        subtitle: fallback,
        hasTrackMeta: false,
    };
}

function pickRadioSubtitle(item) {
    if (!item) return 'Radio';
    if (item.version && !isProviderLike(item.version)) return item.version;
    const parts = [];
    const genres = item.metadata?.genres || item.genres;
    if (Array.isArray(genres) && genres.length) {
        const g = genres[0];
        parts.push(typeof g === 'string' ? g : g?.name || '');
    }
    const genre = item.genre || item.metadata?.genre || item.metadata?.style
        || item.metadata?.mood || item.tags?.[0]?.name || item.tags?.[0];
    if (genre) parts.push(typeof genre === 'string' ? genre : genre.name);
    const freq = item.frequency || item.metadata?.frequency;
    const bitrate = item.bitrate || item.metadata?.bitrate;
    const country = item.metadata?.country || item.country;
    const state = item.metadata?.state;
    if (freq) parts.push(String(freq));
    else if (state && country) parts.push(`${state}, ${country}`);
    else if (country) parts.push(country);
    if (bitrate && parts.length < 2) parts.push(`${bitrate} kbps`);
    const fromName = parseRadioHintsFromName(item.name);
    if (fromName) {
        fromName.split(' · ').forEach((p) => {
            if (p && parts.length < 2 && !parts.includes(p)) parts.push(p);
        });
    }
    const cleaned = parts.filter((p) => p && !isProviderLike(p));
    if (cleaned.length) return cleaned.slice(0, 2).join(' · ');
    const fallback = item.artists?.[0]?.name || item.artist_str
        || item.metadata?.description || item.description || '';
    return fallback && !isProviderLike(fallback) ? fallback.slice(0, 60) : 'Radio';
}

async function enrichRadioSubtitle(item) {
    if (!item) return getRadioStationFallback(item);
    const key = item.uri || `${item.item_id || ''}:${item.provider || ''}`;
    if (state.radioSubtitleCache.has(key)) return state.radioSubtitleCache.get(key);
    let sub = radioNowPlayingDetailSubtitle(item);
    if (!sub || sub === 'Radio station') {
        try {
            await maClient.ensureReady();
            let full = null;
            if (item.uri) {
                full = await maClient.send('music/item_by_uri', { uri: item.uri });
            } else if (item.item_id) {
                full = await maClient.send('music/item', {
                    media_type: item.media_type || 'radio',
                    item_id: item.item_id,
                    provider_instance_id_or_domain: item.provider_instance_id || item.provider || 'library',
                });
            }
            if (full) sub = radioNowPlayingDetailSubtitle(full) || sub;
        } catch (err) { /* fall through */ }
    }
    state.radioSubtitleCache.set(key, sub || '');
    trimMapCache(state.radioSubtitleCache, METADATA_LOOKUP_CACHE_MAX);
    if (sub) setRadioStationFallback(item, sub);
    return sub || '';
}

function syncRadioNowPlayingFromQueue(queueItem, opts = {}) {
    if (!queueItem) return false;
    const media = queueItem.media_item || queueItem;
    if (!isRadioMedia(media)) return false;
    const metaKey = radioStreamMetaKey(queueItem);
    const metaChanged = metaKey && metaKey !== state.lastRadioStreamMetaKey;
    if (!opts.force && !metaChanged && metaKey && state.lastRadioStreamMetaKey) return false;
    if (metaKey) state.lastRadioStreamMetaKey = metaKey;
    const radioNp = resolveRadioNowPlaying(null, media, queueItem);
    applyRadioNowPlayingText(radioNp, media);
    return true;
}

async function resolveRecentMediaItem(item) {
    const media = item.media_item || item;
    const mt = inferMediaType(media) || media.media_type || 'track';
    let resolved = { ...media, media_type: mt };
    const needsEnrich = mt === 'track'
        && (!canGoToArtist(resolved) || !canGoToAlbum(resolved));
    if (!needsEnrich) return resolved;
    try {
        await maClient.ensureReady();
        if (media.uri) {
            const full = await maClient.send('music/item_by_uri', { uri: media.uri });
            if (full) return { ...full, media_type: inferMediaType(full) || 'track' };
        }
        if (media.item_id) {
            const full = await maClient.send('music/item', {
                media_type: 'track',
                item_id: media.item_id,
                provider_instance_id_or_domain: media.provider_instance_id || media.provider || 'library',
            });
            if (full) return { ...full, media_type: inferMediaType(full) || 'track' };
        }
    } catch (err) { /* fall through */ }
    return resolved;
}

async function enrichRecentPlayedList(items) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(6, items.length) }, async () => {
        while (cursor < items.length) {
            const idx = cursor++;
            results[idx] = await resolveRecentMediaItem(items[idx]);
        }
    });
    await Promise.all(workers);
    return results;
}

async function enrichPodcastName(item) {
    if (!item) return '';
    const key = item.uri || `${item.item_id || ''}:${item.provider || ''}`;
    if (state.podcastNameCache.has(key)) return state.podcastNameCache.get(key);
    let name = pickPodcastName(item);
    if (!name && item.item_id) {
        try {
            await maClient.ensureReady();
            const full = await maClient.send('music/item', {
                media_type: item.media_type || 'podcast_episode',
                item_id: item.item_id,
                provider_instance_id_or_domain: item.provider_instance_id || item.provider || 'library',
            });
            name = pickPodcastName(full);
        } catch (err) { /* fall through */ }
    }
    state.podcastNameCache.set(key, name || '');
    trimMapCache(state.podcastNameCache, METADATA_LOOKUP_CACHE_MAX);
    return name || '';
}

function nowPlayingArtist(item) {
    if (!item) return '';
    if (isAudiobookItem(item)) return pickAudiobookAuthor(item);
    if (isPodcastEpisode(item)) return pickPodcastName(item);
    return pickDisplayArtistName(item);
}

function mediaItemSubtitle(item) {
    if (!item) return '';
    if (isAudiobookItem(item)) {
        return pickAudiobookAuthor(item) || 'Audiobook';
    }
    const mt = inferMediaType(item) || (item.media_type || '').toLowerCase();
    if (mt === 'track') {
        const sub = trackArtistAlbumSubtitle(item);
        if (sub) return sub;
        const dur = Number(item.duration || 0);
        return dur > 0 ? formatMaDuration(dur) : '';
    }
    if (mt === 'radio') return radioStationDetailShort(item);
    if (mt === 'podcast_episode' || mt === 'episode') {
        return pickPodcastName(item) || formatMaDuration(item.duration) || '';
    }
    if (mt === 'podcast') return item.publisher || 'Podcast';
    return item.artists?.[0]?.name || item.artist_str || item.album?.name || '';
}

function resolveNowPlayingSubtitle(m, maMediaItem) {
    if (isRadioMedia(maMediaItem) || isRadioMedia(m)) {
        return resolveRadioNowPlaying(m, maMediaItem, maClient.activeQueue?.current_item).subtitle;
    }
    const fromFormat = formatMetadataSubtitle(m, maMediaItem);
    if (fromFormat) return fromFormat;
    if (isPodcastEpisode(maMediaItem) || isPodcastEpisode(m)) {
        return pickPodcastName(maMediaItem) || pickPodcastName(m) || state.lastPodcastShowSubtitle || '';
    }
    if (isAudiobookItem(maMediaItem)) return pickAudiobookAuthor(maMediaItem) || '';
    return '';
}

function formatMetadataSubtitle(m, maMediaItem) {
    if (isRadioMedia(m) || isRadioMedia(maMediaItem)) {
        return resolveRadioNowPlaying(m, maMediaItem, maClient.activeQueue?.current_item).subtitle;
    }
    if (isAudiobookItem(m) || isAudiobookItem(maMediaItem)) {
        const maAuthor = pickAudiobookAuthor(maMediaItem);
        if (maAuthor) return maAuthor;
        const candidates = [
            m?.author,
            m?.authors?.[0]?.name,
            m?.artist_str,
            m?.artists?.[0]?.name,
        ];
        for (const c of candidates) {
            if (c && !looksLikeDescription(c)) return c;
        }
        return '';
    }
    const mt = (m.media_type || m.type || inferMediaType(m) || '').toLowerCase();
    if (mt === 'podcast' || mt === 'podcast_episode' || mt === 'episode') {
        const fromMa = pickPodcastName(maMediaItem);
        if (fromMa) return fromMa;
        const fromSpin = pickPodcastName(m);
        if (fromSpin) return fromSpin;
        return state.lastPodcastShowSubtitle || '';
    }
    if (m && isSendspinMetadataStale(m)) {
        return pickDisplayArtistName(m) || pickDisplayArtistName(maMediaItem);
    }
    return pickDisplayArtistName(maMediaItem) || pickDisplayArtistName(m);
}

function scheduleMaQueueCatchup() {
    clearTimeout(state.maCatchupTimer);
    const runCatchup = async (attempt = 0) => {
        state.maCatchupTimer = null;
        const prev = maClient.activeQueue?.current_item?.queue_item_id;
        try {
            await maClient.refreshActiveQueue();
        } catch (err) {
            console.warn('MA queue catchup failed:', err);
        }
        syncMaNowPlayingIfChanged(prev);
        if (attempt === 0 && isSendspinMetadataStale(state.lastSendspinMetadata)) {
            state.maCatchupTimer = setTimeout(() => runCatchup(1), 400);
        }
    };
    state.maCatchupTimer = setTimeout(() => runCatchup(0), 120);
}

async function recoverMaPlayback() {
    try {
        await maClient.ensureReady();
        await maClient.refreshActiveQueue();
    } catch (err) {
        console.warn('playback recovery failed:', err);
    }
}

async function afterMaPlayback() {
    try {
        await maClient.refreshActiveQueue();
        scheduleQueueReload(true);
        const item = maClient.activeQueue?.current_item;
        if (item) {
            void applyNowPlayingFromMaItem(item, { force: true, skipVisuals: true });
        }
        requestNowPlayingVisuals('browse-play', { force: true });
    } catch (err) {
        console.warn('post-play sync failed:', err);
    }
}

async function loadFavoritesListCached() {
    if (state.favoritesListCache) return state.favoritesListCache;
    state.favoritesListCache = await maClient.loadFavorites();
    return state.favoritesListCache;
}

async function getPlaylistTracksCached(entry, opts = {}) {
    if (entry?.type === 'track_versions' || entry?.type === 'similar_tracks') {
        return entry?._playlistTracksCache || [];
    }
    if (!entry?.item) return maClient.playlistTracks(entry?.item, opts);
    const force = !!opts.forceRefresh;
    if (!force && entry._playlistTracksCache?.length) {
        return entry._playlistTracksCache;
    }
    const tracks = await maClient.playlistTracks(entry.item, opts);
    entry._playlistTracksCache = tracks;
    state.browseStack[state.browseStack.length - 1] = entry;
    return tracks;
}

function getCachedPlaylistTracksForBrowseItem(item) {
    const entry = getCurrentBrowseEntry();
    if (entry?.type !== 'playlist' || !entry._playlistTracksCache?.length) return null;
    const itemUri = item.uri || item.raw?.uri;
    const entryUri = entry.item?.uri;
    if (itemUri && entryUri && itemUri === entryUri) return entry._playlistTracksCache;
    return null;
}

function isLocalFilesystemPlaylist(item) {
    const raw = item?.raw || item;
    if (!raw || inferMediaType(raw) !== 'playlist') return false;
    return isLocalLibraryItem(raw) && !isSpotifySyncedLibraryItem(raw);
}

async function loadPlaylistTracksForPlayback(raw, item, entry, opts = {}) {
    const entryCtx = entry || getCurrentBrowseEntry();
    let tracks = getCachedPlaylistTracksForBrowseItem(item);
    if (!tracks?.length && entryCtx?.type === 'playlist' && entryCtx._playlistTracksCache?.length) {
        tracks = entryCtx._playlistTracksCache;
    }
    if (!tracks?.length && entryCtx?.type === 'playlist' && entryCtx.item) {
        tracks = await getPlaylistTracksCached(entryCtx, opts);
    }
    if (!tracks?.length && entryCtx
        && (entryCtx.type === 'track_versions' || entryCtx.type === 'similar_tracks')) {
        tracks = entryCtx._playlistTracksCache || [];
    }
    if (!tracks?.length) {
        tracks = await maClient.playlistTracks(raw, {
            forceRefresh: !!opts.forceRefresh,
            timeout: opts.timeout || 0,
            allowBrowseFallback: true,
            ...opts,
        });
    }
    return Array.isArray(tracks) ? tracks : [];
}

async function collectPlaylistPlaybackUris(tracks, preferredProvider, providerOpts = {}) {
    if (!tracks?.length) return [];
    const pref = preferredProvider || providerOpts?.preferredProvider || null;
    let uris = await collectProviderTrackUris(tracks, pref, providerOpts);
    if (!uris.length) {
        uris = tracks.map((t) => t.uri).filter(Boolean);
    }
    return uris;
}

async function playPlaylistFromBrowse(item, shuffle = false) {
    const raw = item.raw || resolveBrowseItemRaw(item) || item;
    const uri = item.uri || raw?.uri;
    if (!uri) throw new Error('playlist has no uri');
    const playerName = getDefaultPlayerName();
    const entry = getCurrentBrowseEntry();
    if (isLocalFilesystemPlaylist(raw) || isLocalFilesystemPlaylist(item)) {
        if (shuffle) {
            await maClient.playMediaShuffled(uri);
        } else {
            await maClient.playMediaOrdered(uri);
        }
        setStatus(`connected · ${playerName}`, getShowConnection() ? 'connected' : '');
        return;
    }
    setStatus(`loading playlist: ${item.title || 'playlist'}…`, '');
    const preferredProvider = getBrowseItemPreferredProvider(item, entry);
    const providerOpts = providerOptsForPreferred(preferredProvider);
    const tracks = await loadPlaylistTracksForPlayback(raw, item, entry, providerOpts);
    if (!tracks.length) {
        setStatus('playlist not ready — open it in Music Assistant first', 'error');
        await recoverMaPlayback();
        window.setTimeout(() => {
            setStatus(`connected · ${playerName}`, getShowConnection() ? 'connected' : '');
        }, 5000);
        return;
    }
    const uris = await collectPlaylistPlaybackUris(tracks, preferredProvider, providerOpts);
    if (!uris.length) {
        if (shuffle) await maClient.playMediaShuffled(uri);
        else await maClient.playMediaOrdered(uri);
    } else if (shuffle) {
        await maClient.playMediaWithOption(uris, { option: 'replace', shuffle: true });
    } else {
        await maClient.playMediaOrdered(uri);
    }
    setStatus(`connected · ${playerName}`, getShowConnection() ? 'connected' : '');
}

function maItemSubtitle(item, opts = {}) {
    const mediaType = inferMediaType(item) || (item.media_type || '').toLowerCase();
    if (mediaType === 'track') {
        const sub = trackArtistAlbumSubtitle(item);
        if (sub) return sub;
        const dur = Number(item.duration || item.metadata?.duration || 0);
        return dur > 0 ? formatMaDuration(dur) : '';
    }
    if (mediaType === 'album') {
        if (opts.inArtistDiscography) {
            const year = formatAlbumYear(item);
            if (year) return year;
        }
        if (isAudiobookItem(item)) {
            return pickAudiobookAuthor(item) || 'Audiobook';
        }
        return pickDisplayArtistName(item);
    }
    if (mediaType === 'podcast_episode' || mediaType === 'episode') {
        return opts.podcastShowName || pickPodcastName(item) || '';
    }
    if (mediaType === 'podcast') return 'Podcast';
    if (mediaType === 'artist') {
        if (item.albums?.length) return `${item.albums.length} albums`;
        return 'Artist';
    }
    if (mediaType === 'playlist') return 'Playlist';
    if (mediaType === 'audiobook') {
        return pickAudiobookAuthor(item) || 'Audiobook';
    }
    if (mediaType === 'radio') {
        return radioListSubtitle(item);
    }
    if (isAudiobookItem(item)) {
        return pickAudiobookAuthor(item) || 'Audiobook';
    }
    return '';
}

function getNowPlayingMedia() {
    return maClient.activeQueue?.current_item?.media_item || null;
}

function describeConnection(address) {
    const base = buildBaseUrl(address);
    if (!base) return '';
    const url = new URL(base);
    const proto = url.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${url.host}/sendspin`;
}

function setStatus(text, state) {
    statusBar.textContent = text;
    statusBar.className = state || '';
}

function restoreConnectedStatus() {
    setStatus(`connected · ${getDefaultPlayerName()}`, getShowConnection() ? 'connected' : '');
}

function onMaWebSocketClosed() {
    setStatus('MA disconnected — reconnecting…', 'error');
}

function onMaConnectionRestored() {
    restoreConnectedStatus();
}

let statusRestoreTimer = null;
function scheduleStatusRestore(ms = 3500) {
    clearTimeout(statusRestoreTimer);
    statusRestoreTimer = setTimeout(() => restoreConnectedStatus(), ms);
}
function syncProgressSeekableChrome() {
    const seekable = isSeekable();
    const wasSeekable = mainBody.classList.contains('progress-seekable');
    mainBody.classList.toggle('progress-seekable', seekable);
    normalizeUiFocusZone();
    if (wasSeekable !== seekable) {
        const progressWrapper = document.querySelector('.progress-wrapper');
        if (!seekable && progressWrapper) {
            progressWrapper.style.removeProperty('--progress-bottom');
        }
        if (mainBody.classList.contains('show-ui') && !mainBody.classList.contains('panel-open')) {
            scheduleProgressLayoutRelayout();
        }
    }
}

const QUEUE_COMMANDS = new Set([
    'shuffle', 'unshuffle', 'repeat_off', 'repeat_one', 'repeat_all'
]);

function sendPlayerCommand(cmd, params) {
    const player = window.playerInstance;
    if (!player) return false;
    try {
        player.sendCommand(cmd, params);
        return true;
    } catch (err) {
        if (QUEUE_COMMANDS.has(cmd) && player.protocolHandler) {
            player.protocolHandler.sendCommand(cmd, params);
            return true;
        }
        console.warn(`Command '${cmd}' failed:`, err);
        return false;
    }
}

function syncPlaybackModes(metadata, groupState) {
    let changed = false;
    const progress = metadata?.progress;
    if (progress?.shuffle != null) {
        const next = !!progress.shuffle;
        if (state.shuffleEnabled !== next) { state.shuffleEnabled = next; changed = true; }
    }
    if (progress?.repeat != null) {
        const next = progress.repeat || 'off';
        if (state.repeatMode !== next) { state.repeatMode = next; changed = true; }
    }
    if (groupState?.shuffle != null) {
        const next = !!groupState.shuffle;
        if (state.shuffleEnabled !== next) { state.shuffleEnabled = next; changed = true; }
    }
    if (groupState?.repeat != null) {
        const next = groupState.repeat || 'off';
        if (state.repeatMode !== next) { state.repeatMode = next; changed = true; }
    }
    if (changed) updateModeButtons();
}

function updateModeButtons() {
    shuffleIcon.src = state.shuffleEnabled ? 'icons/shuffle_active.svg' : 'icons/shuffle_inactive.svg';
    shuffleBtn.classList.toggle('mode-active', state.shuffleEnabled);
    shuffleBtn.setAttribute('aria-label', state.shuffleEnabled ? 'Shuffle on' : 'Shuffle off');
    shuffleBtn.setAttribute('aria-pressed', state.shuffleEnabled ? 'true' : 'false');

    const repeatIconSrc = state.repeatMode === 'one'
        ? 'icons/repeatone.svg'
        : state.repeatMode === 'all'
            ? 'icons/repeat.svg'
            : 'icons/norepeat.svg';
    repeatIcon.src = repeatIconSrc;
    repeatBtn.classList.toggle('mode-active', state.repeatMode !== 'off');
    const repeatLabels = { off: 'Repeat off', all: 'Repeat all', one: 'Repeat one' };
    repeatBtn.setAttribute('aria-label', repeatLabels[state.repeatMode] || 'Repeat');
    repeatBtn.setAttribute('aria-pressed', state.repeatMode !== 'off' ? 'true' : 'false');
}

function toggleShuffle() {
    const next = !state.shuffleEnabled;
    state.shuffleEnabled = next;
    updateModeButtons();
    sendPlayerCommand(next ? 'shuffle' : 'unshuffle');
    showUI();
}

function cycleRepeat() {
    const idx = REPEAT_CYCLE.indexOf(state.repeatMode);
    const next = REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length];
    state.repeatMode = next;
    updateModeButtons();
    const cmd = next === 'off' ? 'repeat_off' : next === 'all' ? 'repeat_all' : 'repeat_one';
    sendPlayerCommand(cmd);
    showUI();
}


function freezeProgressAtCurrentPosition() {
    syncProgressFromSendspinAuthority();
    const posMs = state.currentPos;
    const durMs = state.duration;
    const speed = state.progressAnchorSpeed ?? 1;
    anchorProgress(posMs, speed);
    state.progressResyncAt = performance.now();
    updateProgressUI(posMs, durMs);
}
// Geometric up/down navigation across wrapped chip rows. Given a chip
// list and the currently focused index, return the index of the chip in
// the adjacent visual row (delta>0 = below, delta<0 = above) closest in
// horizontal center, or -1 if there is no such row (caller should then
// transition to the next focus zone).
function radioItemInLibrary(item) {
    if (!item) return false;
    // Optimistic flag set right after an add/remove so the menu updates
    // before MA round-trips and caches refresh.
    if (item._radioInLibrary === true) return true;
    if (item._radioInLibrary === false) return false;
    const raw = item.raw || item;
    const uri = raw.uri || item.uri || item.path || '';
    if (typeof uri === 'string' && uri.startsWith('library://')) return true;
    const maps = raw.provider_mappings;
    return Array.isArray(maps) && maps.some((m) => m && m.in_library === true);
}
// "Take Over + Lead": shows on another device that's playing its own
// content and isn't already following this device, as long as this
// device can act as a sync leader and group with it.
function updateFloatState(floatSeed, opts = {}) {
    const layoutOpts = {
        setupOpen: isSetupOpen(),
        menusOpen: state.settingsMenuOpen
            || state.navMenuOpen
            || state.volumeMenuOpen
            || state.eqPresetsMenuOpen
            || state.vizModesMenuOpen
            || state.artDisplayMenuOpen,
        panelOpen: isPanelOpen(),
        guestOpen: isGuestAccessOpen(),
    };
    updateArtDisplayState(floatSeed, layoutOpts);
    updateLyricsPanelLayout(layoutOpts);
    if (!opts.skipTitleRelayout) scheduleTitleLayoutRelayout();
}

function ensureLyricsBootstrapped() {
    if (!lyricsPrefEnabled() || !isLyricsLayoutAllowed()) return;
    const queueItem = maClient.activeQueue?.current_item;
    if (queueItem) {
        refreshLyricsForQueueItem(queueItem, getNowPlayingItemKey(queueItem));
    }
    updateFloatState();
}

function isVolumeControllable() {
    return !!state.playerVolumeControl && state.playerVolumeControl !== 'none' && state.playerVolumeLevel != null;
}

function isGroupVolumeControllable() {
    return !!state.volumeGroupLeaderId && state.volumeGroupLevel != null;
}

function hasVolumeMenuTargets() {
    if (isVolumeControllable()) return true;
    if (isGroupVolumeControllable()) return true;
    for (const volState of state.volumeMemberStates.values()) {
        if (volState.controllable) return true;
    }
    return false;
}

function getVolumeSliderForTarget(targetId) {
    if (targetId === 'group') {
        return volumeMemberSlidersEl?.querySelector('[data-volume-target="group"] .volume-range');
    }
    if (targetId === 'local') return volumeSlider;
    if (targetId?.startsWith('member:')) {
        const playerId = targetId.slice(7);
        return volumeMemberSlidersEl?.querySelector(`[data-player-id="${playerId}"]`);
    }
    return null;
}

function invalidateVolumeGroupSnapshot() {
    state.volumeGroupSnapshot = null;
}

function ensureVolumeGroupSnapshot() {
    if (state.volumeGroupSnapshot) return;
    state.volumeGroupSnapshot = new Map();
    for (const [playerId, volState] of state.volumeMemberStates.entries()) {
        if (volState.controllable) {
            state.volumeGroupSnapshot.set(playerId, volState.level ?? 0);
        }
    }
}

function computeInterpolatedMemberLevels(groupLevel) {
    ensureVolumeGroupSnapshot();
    if (!state.volumeGroupSnapshot?.size) return new Map();
    const baseGroup = Math.max(...state.volumeGroupSnapshot.values());
    const levels = new Map();
    for (const [playerId, childBase] of state.volumeGroupSnapshot.entries()) {
        let newLevel;
        if (groupLevel >= baseGroup) {
            if (baseGroup >= 100) {
                newLevel = childBase;
            } else {
                const progress = (groupLevel - baseGroup) / (100 - baseGroup);
                newLevel = Math.round(childBase + (100 - childBase) * progress);
            }
        } else if (baseGroup === 0) {
            newLevel = 0;
        } else {
            const progress = groupLevel / baseGroup;
            newLevel = Math.round(childBase * progress);
        }
        levels.set(playerId, Math.max(0, Math.min(100, newLevel)));
    }
    return levels;
}

function applyInterpolatedMemberLevels(levels) {
    for (const [playerId, level] of levels.entries()) {
        const volState = state.volumeMemberStates.get(playerId);
        if (!volState) continue;
        volState.level = level;
        if (volState.muted && level > 0) volState.muted = false;
        const valueEl = volumeMemberSlidersEl?.querySelector(`[data-volume-value="${playerId}"]`);
        if (valueEl) valueEl.textContent = formatVolumeLabel(level, volState.muted);
        const slider = volumeMemberSlidersEl?.querySelector(`[data-player-id="${playerId}"]`);
        if (slider) slider.value = String(level);
        if (playerId === maClient.playerId) {
            state.playerVolumeLevel = level;
            if (state.playerVolumeMuted && level > 0) state.playerVolumeMuted = false;
        }
    }
}

function updateVolumeGroupSliderUi() {
    const slider = getVolumeSliderForTarget('group');
    const valueEl = volumeMemberSlidersEl?.querySelector('[data-volume-value="group"]');
    if (slider && state.volumeGroupLevel != null) slider.value = String(state.volumeGroupLevel);
    if (valueEl) valueEl.textContent = formatVolumeLabel(state.volumeGroupLevel, state.volumeGroupMuted);
}

function rebuildVolumeFocusOrder() {
    const order = [];
    if (isGroupVolumeControllable()) order.push('group');
    for (const [playerId, volState] of state.volumeMemberStates.entries()) {
        if (volState.controllable) order.push(`member:${playerId}`);
    }
    if (isVolumeControllable() && !volumeLocalSection?.hidden) order.push('local');
    order.push('close');
    state.volumeFocusOrder = order;
    state.volumeFocusIndex = Math.min(state.volumeFocusIndex, Math.max(0, order.length - 1));
}

function formatVolumeLabel(level, muted) {
    if (level == null) return '—';
    return muted ? 'Muted' : `${level}%`;
}

async function refreshVolumeGroupState() {
    state.volumeMemberStates.clear();
    state.volumeGroupLevel = null;
    state.volumeGroupMuted = false;
    state.volumeGroupLeaderId = null;
    invalidateVolumeGroupSnapshot();
    let group = state.playersActiveGroup;
    try {
        const players = await maClient.send('players/all', {});
        const list = Array.isArray(players) ? players : [];
        if (!group?.localInGroup) {
            group = resolveSyncGroups(list).localGroup;
        }
        if (!group?.localInGroup || !group.leaderId) return;
        state.volumeGroupLeaderId = group.leaderId;
        const byId = new Map(list.map((p) => [p.player_id, p]));
        const leader = byId.get(group.leaderId);
        if (leader?.group_volume != null) {
            state.volumeGroupLevel = leader.group_volume;
            state.volumeGroupMuted = !!leader.group_volume_muted;
        }
        for (const playerId of group.allIds) {
            const player = byId.get(playerId);
            if (!player) continue;
            const control = player.volume_control || 'none';
            state.volumeMemberStates.set(playerId, {
                name: player.display_name || player.name || playerId,
                level: player.volume_level,
                muted: !!player.volume_muted,
                control,
                controllable: control !== 'none' && player.volume_level != null,
            });
        }
    } catch (err) {
        console.warn('refresh volume group failed:', err);
    }
}

function appendVolumeSliderBlock(parent, {
    targetId, label, level, muted, controllable, playerId = null, onInput = null,
}) {
    const block = document.createElement('div');
    block.className = 'volume-slider-block';
    block.dataset.volumeTarget = targetId;
    block.innerHTML = `<div class="volume-menu-header">`
        + `<span class="volume-member-label">${label}</span>`
        + `<span class="volume-menu-value" data-volume-value="${playerId || targetId}">`
        + `${formatVolumeLabel(level, muted)}</span></div>`
        + `<div class="volume-slider-wrap">`
        + `<input type="range" class="volume-range"${playerId ? ` data-player-id="${playerId}"` : ''} `
        + `min="0" max="100" value="${level ?? 50}" `
        + `aria-label="${label} volume"></div>`;
    const slider = block.querySelector('.volume-range');
    if (slider) {
        slider.disabled = !controllable;
        if (onInput) slider.addEventListener('input', onInput);
    }
    parent.appendChild(block);
    return block;
}

function repositionVolumeMenu() {
    if (!state.volumeMenuOpen || !volumeBtn || !volumeMenu) return;
    positionOverlayMenu(volumeBtn, volumeMenu, 'right');
}

function renderVolumeMemberSliders() {
    if (!volumeMemberSlidersEl) return;
    volumeMemberSlidersEl.innerHTML = '';
    const group = state.playersActiveGroup;
    const memberCount = state.volumeMemberStates.size;
    const showGroup = memberCount > 1;
    if (volumeGroupSection) volumeGroupSection.hidden = !showGroup;
    if (!showGroup) {
        if (volumeLocalSection) volumeLocalSection.hidden = false;
        return;
    }

    if (isGroupVolumeControllable()) {
        appendVolumeSliderBlock(volumeMemberSlidersEl, {
            targetId: 'group',
            label: 'Group',
            level: state.volumeGroupLevel,
            muted: state.volumeGroupMuted,
            controllable: true,
            onInput: () => {
                const slider = getVolumeSliderForTarget('group');
                if (slider) scheduleGroupVolumeSet(Number(slider.value));
            },
        });
    }

    for (const playerId of (group?.allIds?.length ? group.allIds : [...state.volumeMemberStates.keys()])) {
        const volState = state.volumeMemberStates.get(playerId);
        if (!volState) continue;
        const isLocal = playerId === maClient.playerId;
        appendVolumeSliderBlock(volumeMemberSlidersEl, {
            targetId: `member:${playerId}`,
            label: `${volState.name}${isLocal ? ' (this device)' : ''}`,
            level: volState.level,
            muted: volState.muted,
            controllable: volState.controllable,
            playerId,
            onInput: (e) => {
                const slider = e.currentTarget;
                scheduleMemberVolumeSet(playerId, Number(slider.value));
            },
        });
    }

    if (volumeLocalLabel) volumeLocalLabel.textContent = 'Volume';
    if (volumeLocalSection) {
        const localInMembers = [...state.volumeMemberStates.keys()].includes(maClient.playerId);
        volumeLocalSection.hidden = localInMembers;
    }
}

function syncVolumeUi() {
    const controllable = isVolumeControllable();
    const level = state.playerVolumeLevel;
    const muted = state.playerVolumeMuted;
    volumeBtn?.classList.toggle('disabled', !hasVolumeMenuTargets());
    if (volumeBtnIcon) {
        volumeBtnIcon.src = muted ? 'icons/volume-mute.svg' : 'icons/volume.svg';
    }
    if (volumeSlider) {
        volumeSlider.disabled = !controllable;
        if (level != null) volumeSlider.value = String(level);
    }
    if (volumeValueEl) {
        volumeValueEl.textContent = formatVolumeLabel(controllable ? level : null, muted);
    }
    if (state.volumeMenuOpen) {
        rebuildVolumeFocusOrder();
        updateVolumeFocus();
    }
}

function scheduleVolumeSet(level) {
    clearTimeout(state.volumeSetTimer);
    state.playerVolumeLevel = Math.round(Math.max(0, Math.min(100, level)));
    if (state.playerVolumeMuted && state.playerVolumeLevel > 0) state.playerVolumeMuted = false;
    syncVolumeUi();
    state.volumeSetTimer = setTimeout(() => {
        void commitVolumeSet(state.playerVolumeLevel);
    }, 150);
}

function scheduleGroupVolumeSet(level) {
    clearTimeout(state.volumeGroupSetTimer);
    state.volumeGroupLevel = Math.round(Math.max(0, Math.min(100, level)));
    if (state.volumeGroupMuted && state.volumeGroupLevel > 0) state.volumeGroupMuted = false;
    applyInterpolatedMemberLevels(computeInterpolatedMemberLevels(state.volumeGroupLevel));
    updateVolumeGroupSliderUi();
    if (volumeValueEl && volumeLocalSection?.hidden) {
        volumeValueEl.textContent = formatVolumeLabel(state.playerVolumeLevel, state.playerVolumeMuted);
    }
    if (volumeSlider && volumeLocalSection?.hidden && state.playerVolumeLevel != null) {
        volumeSlider.value = String(state.playerVolumeLevel);
    }
    state.volumeGroupSetTimer = setTimeout(() => {
        void commitGroupVolumeSet(state.volumeGroupLevel);
    }, 150);
}

function scheduleMemberVolumeSet(playerId, level) {
    invalidateVolumeGroupSnapshot();
    const volState = state.volumeMemberStates.get(playerId);
    if (!volState?.controllable) return;
    const rounded = Math.round(Math.max(0, Math.min(100, level)));
    volState.level = rounded;
    if (volState.muted && rounded > 0) volState.muted = false;
    const valueEl = volumeMemberSlidersEl?.querySelector(`[data-volume-value="${playerId}"]`);
    if (valueEl) valueEl.textContent = formatVolumeLabel(rounded, volState.muted);
    const slider = volumeMemberSlidersEl?.querySelector(`[data-player-id="${playerId}"]`);
    if (slider) slider.value = String(rounded);
    clearTimeout(state.volumeMemberTimers.get(playerId));
    state.volumeMemberTimers.set(playerId, setTimeout(() => {
        void commitMemberVolumeSet(playerId, rounded);
    }, 150));
}

async function commitVolumeSet(level, opts = {}) {
    if (!maClient.playerId || !isVolumeControllable()) return;
    const rounded = Math.round(Math.max(0, Math.min(100, level)));
    try {
        await maClient.send('players/cmd/volume_set', {
            player_id: maClient.playerId,
            volume_level: rounded,
        });
        if (opts.persist !== false) savePlayerVolume(rounded);
    } catch (err) {
        console.warn('volume_set failed:', err);
        void refreshPlayerVolume();
    }
}

async function commitGroupVolumeSet(level) {
    const leaderId = state.volumeGroupLeaderId;
    if (!leaderId || !isGroupVolumeControllable()) return;
    const rounded = Math.round(Math.max(0, Math.min(100, level)));
    try {
        await maClient.send('players/cmd/group_volume', {
            player_id: leaderId,
            volume_level: rounded,
        });
    } catch (err) {
        console.warn('group_volume failed:', err);
        void refreshVolumeGroupState().then(() => {
            if (state.volumeMenuOpen) renderVolumeMemberSliders();
            syncVolumeUi();
        });
    }
}

async function commitMemberVolumeSet(playerId, level) {
    const volState = state.volumeMemberStates.get(playerId);
    if (!volState?.controllable) return;
    const rounded = Math.round(Math.max(0, Math.min(100, level)));
    try {
        await maClient.send('players/cmd/volume_set', {
            player_id: playerId,
            volume_level: rounded,
        });
        if (playerId === maClient.playerId) {
            state.playerVolumeLevel = rounded;
            if (state.playerVolumeMuted && rounded > 0) state.playerVolumeMuted = false;
        }
    } catch (err) {
        console.warn('member volume_set failed:', err);
        void refreshVolumeGroupState().then(() => {
            if (state.volumeMenuOpen) renderVolumeMemberSliders();
            syncVolumeUi();
        });
    }
}

function getActiveVolumeLevel() {
    const targetId = state.volumeFocusOrder[state.volumeFocusIndex];
    if (targetId === 'group') return state.volumeGroupLevel;
    if (targetId === 'local') return state.playerVolumeLevel;
    if (targetId?.startsWith('member:')) {
        return state.volumeMemberStates.get(targetId.slice(7))?.level;
    }
    return null;
}

function isActiveVolumeAdjustable() {
    const targetId = state.volumeFocusOrder[state.volumeFocusIndex];
    if (targetId === 'close') return false;
    if (targetId === 'group') return isGroupVolumeControllable();
    if (targetId === 'local') return isVolumeControllable();
    if (targetId?.startsWith('member:')) {
        return !!state.volumeMemberStates.get(targetId.slice(7))?.controllable;
    }
    return false;
}

function adjustVolume(delta) {
    if (!isActiveVolumeAdjustable()) return;
    const targetId = state.volumeFocusOrder[state.volumeFocusIndex];
    const level = getActiveVolumeLevel() || 0;
    if (targetId === 'group') scheduleGroupVolumeSet(level + delta);
    else if (targetId === 'local') scheduleVolumeSet(level + delta);
    else if (targetId?.startsWith('member:')) {
        scheduleMemberVolumeSet(targetId.slice(7), level + delta);
    }
}

function updateVolumeFocus() {
    volumeSlider?.classList.remove('focused');
    volumeCloseBtn?.classList.remove('focused');
    volumeMemberSlidersEl?.querySelectorAll('.volume-range').forEach((el) => {
        el.classList.remove('focused');
    });
    const targetId = state.volumeFocusOrder[state.volumeFocusIndex];
    if (targetId === 'close') {
        volumeCloseBtn?.classList.add('focused');
        volumeCloseBtn?.focus({ preventScroll: true });
        return;
    }
    const slider = getVolumeSliderForTarget(targetId);
    slider?.classList.add('focused');
    slider?.focus({ preventScroll: true });
}

function moveVolumeFocus(delta) {
    const next = state.volumeFocusIndex + delta;
    if (next < 0 || next >= state.volumeFocusOrder.length) return;
    state.volumeFocusIndex = next;
    updateVolumeFocus();
}

function activateVolumeFocused() {
    if (state.volumeFocusOrder[state.volumeFocusIndex] === 'close') {
        closeVolumeMenu();
    }
}

async function openVolumeMenu() {
    invalidateVolumeGroupSnapshot();
    await refreshVolumeGroupState();
    if (!hasVolumeMenuTargets()) return;
    closeAllPanels();
    closeNavMenu();
    closeSettingsMenu();
    closeEqPresetsMenu({ skipReturn: true });
    closeVizModesMenu({ skipReturn: true });
    state.volumeMenuOpen = true;
    mainBody.classList.add('show-ui', 'volume-menu-open');
    syncIdleProgressVisibility();
    volumeMenu.classList.add('open');
    volumeMenu.setAttribute('aria-hidden', 'false');
    renderVolumeMemberSliders();
    rebuildVolumeFocusOrder();
    positionOverlayMenu(volumeBtn, volumeMenu, 'right');
    state.volumeFocusIndex = 0;
    updateVolumeFocus();
    void refreshPlayerVolume().then(() => {
        requestAnimationFrame(() => repositionVolumeMenu());
    });
    getDvdFloater().stop(true);
    pauseUiHideTimer();
}

function closeVolumeMenu() {
    if (!state.volumeMenuOpen) return;
    state.volumeMenuOpen = false;
    mainBody.classList.remove('volume-menu-open');
    volumeMenu.classList.remove('open');
    volumeMenu.setAttribute('aria-hidden', 'true');
    volumeSlider?.classList.remove('focused');
    volumeCloseBtn?.classList.remove('focused');
    volumeMemberSlidersEl?.querySelectorAll('.volume-range').forEach((el) => {
        el.classList.remove('focused');
    });
    syncIdleProgressVisibility();
    resumeUiHideTimer();
    updateFloatState();
}

function toggleVolumeMenu() {
    if (state.volumeMenuOpen) closeVolumeMenu();
    else void openVolumeMenu();
}

function closeGuestAccessOverlay() {
    guestAccessOverlay.classList.remove('open');
    guestAccessOverlay.setAttribute('aria-hidden', 'true');
    mainBody.classList.remove('panel-open', 'guest-access-open');
    updateFloatState();
}

function showGuestAccessOverlay(message, { showQr = false, url = '' } = {}) {
    guestQrImg.hidden = !showQr;
    guestAccessTaglineEl.hidden = !showQr;
    guestAccessMessageEl.hidden = showQr;
    if (showQr && url) {
        guestQrImg.src = `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=360&margin=1`;
        guestAccessMessageEl.textContent = '';
    } else {
        guestQrImg.removeAttribute('src');
        guestAccessMessageEl.textContent = message || '';
    }
    guestAccessOverlay.classList.add('open');
    guestAccessOverlay.setAttribute('aria-hidden', 'false');
    mainBody.classList.add('panel-open', 'guest-access-open');
    getDvdFloater().stop(true);
}

async function openGuestAccessModal() {
    closeSettingsMenu();
    showGuestAccessOverlay('Loading Guest DJ…');
    try {
        await maClient.ensureReady();
        const url = await maClient.send('party/url');
        if (!url) {
            showGuestAccessOverlay(
                'Guest DJ is not enabled. Turn on guest access in Music Assistant Party settings.',
            );
            return;
        }
        showGuestAccessOverlay('', { showQr: true, url });
    } catch (err) {
        console.warn('guest DJ failed:', err);
        showGuestAccessOverlay(
            'Party plugin not available. Install and enable the Party plugin in Music Assistant.',
        );
    }
}
let _lastIdleProgressShow = null;

function invalidateIdleProgressVisibility() {
    _lastIdleProgressShow = null;
}

function isMainProgressVisible() {
    if (mainBody.classList.contains('panel-open')) return false;
    if (mainBody.classList.contains('menu-open')) return false;
    if (mainBody.classList.contains('nav-menu-open')) return false;
    if (mainBody.classList.contains('volume-menu-open')) return false;
    return mainBody.classList.contains('show-ui');
}

function hasIdleProgressContent() {
    if (isNowPlayingRadio()) return false;
    if (state.isPlaying) return true;
    return state.duration > 0 && state.currentPos > 0 && state.currentPos < state.duration;
}
function syncIdleProgressInset() {
    if (!idleProgressEl) return;
    if (isAndroidPortraitBottomNav()) {
        const navH = getBottomNavReservedHeight();
        if (navH > 0) {
            idleProgressEl.style.bottom = `${navH}px`;
        } else {
            idleProgressEl.style.removeProperty('bottom');
        }
    } else {
        idleProgressEl.style.removeProperty('bottom');
    }
}

function syncIdleProgressVisibility() {
    const show = hasIdleProgressContent() && !isMainProgressVisible() && !isOverlayMenuOpen();
    syncIdleProgressInset();
    const domShown = !idleProgressEl.classList.contains('hide-for-controls');
    if (_lastIdleProgressShow === show && domShown === show) {
        return;
    }
    const wasShowing = _lastIdleProgressShow === true;
    _lastIdleProgressShow = show;
    idleProgressEl.classList.toggle('hide-for-controls', !show);
    idleProgressEl.setAttribute('aria-hidden', show ? 'false' : 'true');
    idleProgressEl.style.removeProperty('opacity');
    idleProgressEl.style.removeProperty('display');
    idleProgressEl.style.removeProperty('visibility');
    if (IS_TV_REMOTE && show) {
        const reapply = () => {
            if (_lastIdleProgressShow !== true) return;
            idleProgressEl.classList.remove('hide-for-controls');
            idleProgressEl.setAttribute('aria-hidden', 'false');
        };
        requestAnimationFrame(() => {
            reapply();
            requestAnimationFrame(reapply);
        });
    } else if (IS_TV_REMOTE && !show && wasShowing) {
        idleProgressEl.classList.add('hide-for-controls');
        idleProgressEl.setAttribute('aria-hidden', 'true');
    }
}

let _idleProgressSyncTimer = null;

function scheduleIdleProgressVisibilitySync() {
    if (!IS_TV_REMOTE) {
        invalidateIdleProgressVisibility();
        syncIdleProgressVisibility();
        return;
    }
    if (_idleProgressSyncTimer) return;
    _idleProgressSyncTimer = window.setTimeout(() => {
        _idleProgressSyncTimer = null;
        invalidateIdleProgressVisibility();
        syncIdleProgressVisibility();
    }, 32);
}

function onAppResume() {
    if (!isPanelOpen() && !state.settingsMenuOpen && !state.navMenuOpen && !state.volumeMenuOpen && !state.eqPresetsMenuOpen && !state.vizModesMenuOpen && !isSetupOpen()) {
        mainBody.classList.remove('show-ui');
        pauseUiHideTimer();
    }
    _lastIdleProgressShow = null;
    try {
        window.playerInstance?.audioContext?.resume?.();
    } catch (e) { /* ignore */ }
    ensureMaConnection();
    syncIdleProgressVisibility();
    updateProgressFromPlayer();
    updateFloatState();
    syncAndroidMediaSession();
}

let mediaSessionHandlersReady = false;

function mediaSessionPlugin() {
    return window.Capacitor?.Plugins?.MediaSession;
}

async function initAndroidMediaSession() {
    if (!IS_ANDROID) return;
    const ms = mediaSessionPlugin();
    if (!ms) return;
    try {
        await ms.setActionHandler({ action: 'play' }, () => {
            if (!state.isPlaying) sendPlayerCommand('play');
            markRemoteAction();
            showUI();
        });
        await ms.setActionHandler({ action: 'pause' }, () => {
            if (state.isPlaying) sendPlayerCommand('pause');
            markRemoteAction();
            showUI();
        });
        await ms.setActionHandler({ action: 'previoustrack' }, () => {
            sendPlayerCommand('previous');
            markRemoteAction();
        });
        await ms.setActionHandler({ action: 'nexttrack' }, () => {
            sendPlayerCommand('next');
            markRemoteAction();
        });
        mediaSessionHandlersReady = true;
        syncAndroidMediaSession();
    } catch (err) {
        console.warn('MediaSession init failed:', err);
    }
}

function androidNotificationArtwork() {
    const url = state._lastArtAppliedUrl;
    if (!url) return [];
    try {
        if (coverEl.complete && coverEl.naturalWidth > 0 && coverEl.naturalHeight > 0) {
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const iw = coverEl.naturalWidth;
            const ih = coverEl.naturalHeight;
            const scale = Math.max(size / iw, size / ih);
            const dw = iw * scale;
            const dh = ih * scale;
            ctx.drawImage(coverEl, (size - dw) / 2, (size - dh) / 2, dw, dh);
            return [{ src: canvas.toDataURL('image/jpeg', 0.85), sizes: '512x512' }];
        }
    } catch (err) {
        /* fall back to remote URL */
    }
    return [{ src: url, sizes: '512x512' }];
}

function syncAndroidMediaSession() {
    if (!IS_ANDROID || !mediaSessionHandlersReady) return;
    const ms = mediaSessionPlugin();
    if (!ms) return;
    const title = state.currentTitleText || 'SpinStage';
    const artist = (artistEl?.innerText || '').trim();
    const artwork = androidNotificationArtwork();
    ms.setMetadata({ title, artist, artwork }).catch(() => {});
    const playbackState = !window.playerInstance ? 'none' : (state.isPlaying ? 'playing' : 'paused');
    ms.setPlaybackState({ playbackState }).catch(() => {});
    if (state.duration > 0) {
        ms.setPositionState({
            duration: state.duration / 1000,
            position: Math.max(0, state.currentPos / 1000),
            playbackRate: state.progressAnchorSpeed || 1,
        }).catch(() => {});
    }
}

function ensureMaConnection() {
    const address = localStorage.getItem('ma_server_ip');
    if (!address || !window.playerInstance) return;
    const readyState = maClient.ws?.readyState;
    // A socket still in CONNECTING is healthy in-flight — don't tear it
    // down and reconnect (that produced the "closed before the connection
    // is established" churn on every resume/focus event).
    if (readyState === WebSocket.CONNECTING) return;
    if (readyState !== WebSocket.OPEN) {
        startMaModeSync();
        return;
    }
    if (!maClient.bootstrapped) {
        maClient.bootstrap().catch(() => startMaModeSync());
    }
}
function exitApp() {
    if (typeof webOS !== 'undefined' && typeof webOS.platformBack === 'function') {
        webOS.platformBack();
        return;
    }
    if (IS_TIZEN && typeof tizen !== 'undefined' && tizen.application?.getCurrentApplication) {
        try {
            tizen.application.getCurrentApplication().exit();
        } catch (_) {
            window.close();
        }
        return;
    }
    window.close();
}
function closeSetup() {
    if (!setupOverlay) return;
    setupOverlay.classList.remove('open');
    setupOverlay.setAttribute('aria-hidden', 'true');
    setSetupError('');
    if (setupScroll) setupScroll.style.paddingBottom = '';
    visualizer?.setPaused(true);
    updateFloatState();
}

async function setupConnect() {
    const server = setupInputIp?.value.trim() || '';
    const player = setupInputName?.value.trim() || '';
    const username = setupInputUsername?.value.trim() || '';
    const password = setupInputPassword?.value || '';
    if (!server || !player || !username || !password) {
        setSetupError('Enter server, player name, username, and password.');
        return;
    }
    setSetupError('');
    if (setupConnectBtn) setupConnectBtn.disabled = true;
    setStatus('signing in…');
    try {
        const token = await loginMaWithCredentials(server, username, password);
        try {
            await saveUserSettingsConfig({
                server,
                playerName: player,
                username,
                password,
            });
        } catch (err) {
            console.warn('user-settings save failed:', err);
        }
        localStorage.setItem('ma_server_ip', server);
        localStorage.setItem('ma_player_name', player);
        localStorage.setItem('ma_username', username);
        await setMaApiToken(token);
        location.reload();
    } catch (err) {
        console.warn('setup connect failed:', err);
        setSetupError(err?.message || 'Could not sign in — check server URL and credentials.');
        setStatus('setup failed', 'error');
        if (setupConnectBtn) setupConnectBtn.disabled = false;
    }
}

function setupNextStep() {
    const active = document.activeElement;
    const fields = getSetupFieldOrder();
    const idx = fields.indexOf(active);
    if (idx >= 0 && idx < fields.length - 1) {
        focusSetupField(idx + 1);
        return;
    }
    void setupConnect();
}

function setupFinishStep() {
    void setupConnect();
}

function bindSetupOverlay() {
    bindSetupKeyboardInset();
    closeSetupBtn?.addEventListener('click', () => closeSetup());
    setupForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        void setupConnect();
    });
    getSetupFieldOrder().forEach((field, index) => {
        if (field === setupConnectBtn) return;
        field?.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            e.stopPropagation();
            if (index < getSetupFieldOrder().length - 1) focusSetupField(index + 1);
            else void setupConnect();
        });
        field?.addEventListener('focus', () => {
            syncSetupKeyboardInset();
            field.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        });
    });
}

function openSetup() {
    closeAllPanels();
    const hasConfig = hasCompleteSetup();
    if (setupOverlay) {
        setupOverlay.classList.add('open');
        setupOverlay.setAttribute('aria-hidden', 'false');
    }
    if (closeSetupBtn) closeSetupBtn.hidden = !hasConfig;
    if (setupInputIp) setupInputIp.value = getDefaultServerAddress();
    if (setupInputName) setupInputName.value = getDefaultPlayerName();
    if (setupInputUsername) {
        setupInputUsername.value = localStorage.getItem('ma_username') || '';
    }
    if (setupInputPassword) setupInputPassword.value = '';
    if (setupConnectBtn) setupConnectBtn.disabled = false;
    setSetupError('');
    syncSetupKeyboardInset();
    setupInputIp?.focus();
    visualizer?.setPaused(true);
    getDvdFloater().stop(true);
}

window.openSettings = openSetup;
window.closeSettings = closeSetup;
window.nextStep = setupNextStep;
window.finishSetup = setupFinishStep;
window.setupConnect = setupConnect;

function adjustSeekByRemote(delta) {
    if (!isSeekable()) return;
    scheduleSeek(state.currentPos + REMOTE_SEEK_STEP_MS * delta, { remote: true });
}

function onRemoteSeekPress(delta, isRepeat = false) {
    if (!isSeekable()) return;
    state.remoteSeekActive = true;
    beginSeekScrub();
    adjustSeekByRemote(delta);
    if (isRepeat) return;
    clearTimeout(state.remoteSeekHoldDelay);
    clearInterval(state.remoteSeekHoldIv);
    state.remoteSeekHoldDelay = setTimeout(() => {
        state.remoteSeekHoldIv = setInterval(() => adjustSeekByRemote(delta), REMOTE_SEEK_REPEAT_MS);
    }, 400);
}

function onRemoteSeekRelease() {
    clearTimeout(state.remoteSeekHoldDelay);
    clearInterval(state.remoteSeekHoldIv);
    state.remoteSeekHoldDelay = null;
    state.remoteSeekHoldIv = null;
    if (!state.remoteSeekActive && pendingSeekMs == null && !isSeeking) return;
    state.remoteSeekActive = false;
    void flushPendingSeek();
}

let seekTimer = null;
let seekCommitChain = Promise.resolve();
let isSeeking = false;
let seekPointerId = null;
let seekPointerHandledClick = false;
let pendingSeekMs = null;

function isPlaybackRadioContext() {
    if (state.lastPlaybackMediaKind === 'radio') return true;
    if (isNowPlayingRadio()) return true;
    const qMedia = maClient.activeQueue?.current_item?.media_item;
    return !!(qMedia && isRadioMedia(qMedia));
}

function isSeekable() {
    return !isPlaybackRadioContext() && state.duration > 0 && !!maClient.queueId;
}

function armSeekAuthority(posMs) {
    state.seekAuthorityMs = Math.max(0, posMs || 0);
    state.seekAuthorityUntil = Date.now() + SEEK_AUTHORITY_MS;
    anchorProgress(state.seekAuthorityMs, state.progressAnchorSpeed || 1);
    state.progressResyncAt = performance.now();
}

function isSeekAuthorityActive() {
    return state.seekAuthorityUntil > Date.now();
}

function releaseSeekAuthorityIfMatched(externalPosMs) {
    if (!isSeekAuthorityActive()) return;
    if (Math.abs(externalPosMs - state.seekAuthorityMs) < PROGRESS_HARD_RESYNC_MS) {
        state.seekAuthorityUntil = 0;
    }
}

function clearSeekAuthority() {
    state.seekAuthorityUntil = 0;
    state.seekAuthorityMs = 0;
}

async function commitSeek(positionMs) {
    if (!isSeekable()) return;
    const clamped = Math.max(0, Math.min(state.duration, positionMs));
    const maxSec = state.duration / 1000;
    const seekSec = Math.max(0, Math.min(maxSec, clamped / 1000));
    armSeekAuthority(clamped);
    updateProgressUI(clamped, state.duration);
    if (maClient.activeQueue) {
        maClient.activeQueue.elapsed_time = seekSec;
        maClient.activeQueue.elapsed_time_last_updated = Date.now() / 1000;
    }
    pendingSeekMs = null;
    const runSeek = async () => {
        try {
            await maClient.seek(seekSec);
        } catch (err) {
            console.warn('seek failed:', err);
            clearSeekAuthority();
            syncProgressFromMaQueue(true);
        }
    };
    seekCommitChain = seekCommitChain.then(runSeek, runSeek);
    await seekCommitChain;
}

async function flushPendingSeek(opts = {}) {
    clearTimeout(seekTimer);
    seekTimer = null;
    const target = pendingSeekMs ?? state.currentPos;
    pendingSeekMs = null;
    await commitSeek(target);
    if (!opts.keepScrubbing) endSeekScrub();
}

function scheduleSeek(positionMs, opts = {}) {
    if (!isSeekable()) return;
    if (!isSeeking) beginSeekScrub();
    const clamped = Math.max(0, Math.min(state.duration, positionMs));
    pendingSeekMs = clamped;
    armSeekAuthority(clamped);
    updateProgressUI(clamped, state.duration);
    clearTimeout(seekTimer);
    if (opts.immediate) {
        void flushPendingSeek({ keepScrubbing: !!opts.keepScrubbing });
        return;
    }
    const commitDelay = opts.remote ? SEEK_COMMIT_MS_REMOTE : SEEK_COMMIT_MS_UI;
    seekTimer = setTimeout(() => flushPendingSeek(), commitDelay);
}

function seekFromClientX(clientX) {
    if (!progressContainerEl || !isSeekable()) return;
    const rect = progressContainerEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    syncProgressThumbPosition(ratio);
    scheduleSeek(ratio * state.duration);
}

function beginSeekScrub() {
    if (!isSeekable()) return false;
    isSeeking = true;
    stopProgressTimer();
    progressContainerEl?.classList.add('scrubbing');
    syncProgressThumbActive();
    return true;
}

function endSeekScrub() {
    isSeeking = false;
    seekPointerId = null;
    progressContainerEl?.classList.remove('scrubbing');
    syncProgressThumbActive();
    if (state.isPlaying) startProgressTimer();
}

function bindProgressScrubbing() {
    if (!progressContainerEl) return;

    const seekFromRatio = (ratio) => {
        if (!isSeekable()) return;
        scheduleSeek(Math.max(0, Math.min(1, ratio)) * state.duration);
    };

    progressContainerEl.addEventListener('click', (e) => {
        if (!mainBody.classList.contains('show-ui') || isPanelOpen()) return;
        if (e.target === progressSlider) return;
        if (seekPointerHandledClick) {
            seekPointerHandledClick = false;
            return;
        }
        e.stopPropagation();
        const rect = progressContainerEl.getBoundingClientRect();
        if (rect.width <= 0) return;
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        syncProgressThumbPosition(ratio);
        scheduleSeek(ratio * state.duration, { immediate: true });
        showUI();
    });

    progressContainerEl.addEventListener('pointerdown', (e) => {
        if (!mainBody.classList.contains('show-ui') || isPanelOpen()) return;
        if (e.target === progressSlider) return;
        if (!beginSeekScrub()) return;
        seekPointerHandledClick = false;
        seekPointerId = e.pointerId;
        progressContainerEl.setPointerCapture?.(e.pointerId);
        seekFromClientX(e.clientX);
        e.preventDefault();
        e.stopPropagation();
    });

    progressContainerEl.addEventListener('pointermove', (e) => {
        if (!isSeeking || e.pointerId !== seekPointerId) return;
        seekFromClientX(e.clientX);
        e.preventDefault();
    });

    const finishPointer = (e) => {
        if (!isSeeking || (seekPointerId != null && e.pointerId !== seekPointerId)) return;
        seekPointerHandledClick = true;
        void flushPendingSeek();
    };
    progressContainerEl.addEventListener('pointerup', finishPointer);
    progressContainerEl.addEventListener('pointercancel', finishPointer);

    if (!progressSlider) return;

    progressSlider.addEventListener('input', () => {
        if (!isSeekable()) return;
        if (!isSeeking) beginSeekScrub();
        const ratio = Number(progressSlider.value) / 1000;
        syncProgressThumbPosition(ratio);
        seekFromRatio(ratio);
        showUI();
    });

    progressSlider.addEventListener('change', () => {
        if (!isSeekable()) return;
        const ratio = Number(progressSlider.value) / 1000;
        syncProgressThumbPosition(ratio);
        scheduleSeek(ratio * state.duration, { immediate: true });
        showUI();
    });

    progressSlider.addEventListener('focus', syncProgressThumbActive);
    progressSlider.addEventListener('blur', syncProgressThumbActive);

    progressSlider.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (!beginSeekScrub()) return;
        showUI();
    });

    progressSlider.addEventListener('pointerup', () => {
        if (isSeeking) void flushPendingSeek();
    });
}


function resumeSendspinAudioOutput() {
    const player = window.playerInstance;
    const ap = player?.audioProcessor;
    const ctx = player?.audioContext;
    if (!player || !ap) return;
    if (ctx && (ctx.state === 'suspended' || ctx.state === 'interrupted')) {
        void ctx.resume().catch((err) => {
            console.warn('AudioContext resume failed:', err);
        });
    }
    if (ap.outputMode === 'media-element' && ap.audioElement?.paused) {
        void ap.audioElement.play().catch((err) => {
            console.warn('media-element resume failed:', err);
        });
    }
}

/** Tizen TV WebView often leaves AudioContext suspended across stream restarts. */
function kickTizenAudioOutput() {
    if (!IS_TIZEN) return;
    const player = window.playerInstance;
    const ap = player?.audioProcessor;
    if (!player || !ap) return;
    resumeSendspinAudioOutput();
    void ap.resumeAudioContext?.();
}

function scheduleTizenAudioKick(reason = 'stream-start') {
    if (!IS_TIZEN) return;
    kickTizenAudioOutput();
    for (const ms of [50, 200, 600, 1500]) {
        window.setTimeout(() => kickTizenAudioOutput(), ms);
    }
    if (reason === 'stream-start') {
        window.setTimeout(() => {
            const player = window.playerInstance;
            const ap = player?.audioProcessor;
            const ctx = player?.audioContext;
            if (!player || !ap || !ctx || ctx.state !== 'running') return;
            const ahead = ap.getScheduledAheadSec?.(ctx.currentTime ?? 0) ?? 0;
            const queued = (ap.audioBufferQueue?.length ?? 0) + (ap.scheduledSources?.length ?? 0);
            const minAhead = isLocalPlayerInSyncGroupCached() ? 0.2 : 0.05;
            if (queued > 0 && ahead < minAhead) {
                try {
                    player.forcePlaybackResync();
                } catch (err) {
                    console.warn('Tizen stream-start resync failed:', err);
                }
            }
        }, 900);
    }
}

function checkSendspinAudioHealth() {
    if (!state.isPlaying) {
        state.audioHealthEmptyStreak = 0;
        return;
    }
    const player = window.playerInstance;
    const ap = player?.audioProcessor;
    if (!player || !ap) return;
    resumeSendspinAudioOutput();
    const ctxTime = player.audioContext?.currentTime ?? 0;
    const aheadSec = ap.getScheduledAheadSec?.(ctxTime) ?? 0;
    if (aheadSec > 0.08) {
        state.audioHealthEmptyStreak = 0;
        return;
    }
    const queueDepth = (ap.audioBufferQueue?.length ?? 0) + (ap.scheduledSources?.length ?? 0);
    if (queueDepth > 0) {
        state.audioHealthEmptyStreak = 0;
        return;
    }
    const ctxState = player.audioContext?.state;
    if (ctxState && ctxState !== 'running') {
        state.audioHealthEmptyStreak = 0;
        return;
    }
    const cutoverAt = ap.lastPlaybackCutoverAtMs ?? -Infinity;
    if (performance.now() - cutoverAt < 8000) {
        state.audioHealthEmptyStreak = 0;
        return;
    }
    state.audioHealthEmptyStreak = (state.audioHealthEmptyStreak ?? 0) + 1;
    const emptyThreshold = IS_TIZEN ? 3 : (IS_TV_REMOTE ? 5 : 3);
    if (state.audioHealthEmptyStreak < emptyThreshold) return;
    state.audioHealthEmptyStreak = 0;
    console.warn('Sendspin audio health: playing but no scheduled audio — resyncing');
    try {
        player.forcePlaybackResync();
    } catch (err) {
        console.warn('forcePlaybackResync failed:', err);
    }
    void maClient.refreshActiveQueue().catch(() => {});
}

let audioHealthTimer = null;

function startAudioHealthWatchdog() {
    clearInterval(audioHealthTimer);
    const intervalMs = IS_TIZEN ? 4000 : AUDIO_HEALTH_CHECK_MS;
    audioHealthTimer = setInterval(checkSendspinAudioHealth, intervalMs);
}

function bindAudioLifecycleRecovery() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resumeSendspinAudioOutput();
    });
    window.addEventListener('pageshow', () => resumeSendspinAudioOutput());
    window.addEventListener('focus', () => resumeSendspinAudioOutput());
    const hookContext = () => {
        const ctx = window.playerInstance?.audioContext;
        if (!ctx || ctx.__spinstageLifecycleHook) return;
        ctx.__spinstageLifecycleHook = true;
        ctx.addEventListener('statechange', () => {
            if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
                resumeSendspinAudioOutput();
            }
        });
    };
    hookContext();
    const ctxPoll = setInterval(() => {
        hookContext();
        if (window.playerInstance?.audioContext?.__spinstageLifecycleHook) {
            clearInterval(ctxPoll);
        }
    }, 2000);
}

async function togglePlayPause() {
    const player = window.playerInstance;
    if (!player) return;
    const inSyncGroup = await localPlayerInSyncGroup();
    if (state.isPlaying) {
        freezeProgressAtCurrentPosition();
        if (inSyncGroup) {
            try {
                await maClient.ensureReady();
                await pauseSyncGroupPlayback();
            } catch (err) {
                console.warn('sync group pause failed:', err);
            }
        } else {
            try {
                await maClient.ensureReady();
                await maClient.pauseQueue();
            } catch (err) {
                console.warn('solo pause failed:', err);
            }
        }
        player.sendCommand('pause');
    } else {
        if (isNowPlayingRadio()) {
            const media = getNowPlayingMedia();
            try {
                await maClient.ensureReady();
                if (inSyncGroup) {
                    await resumeSyncGroupPlayback();
                } else {
                    await maClient.resumeQueue();
                }
            } catch (err) {
                console.warn('radio resume failed:', err);
                if (media) {
                    try {
                        await maClient.playStation(media);
                    } catch (replayErr) {
                        console.warn('radio replay failed:', replayErr);
                    }
                }
            }
        } else if (inSyncGroup) {
            try {
                await maClient.ensureReady();
                await resumeSyncGroupPlayback();
            } catch (err) {
                console.warn('sync group resume failed:', err);
            }
        } else {
            try {
                await maClient.ensureReady();
                await maClient.resumeQueue();
            } catch (err) {
                console.warn('solo resume failed:', err);
            }
        }
        player.sendCommand('play');
    }
    showUI();
    requestNowPlayingVisuals('play-resume');
}

async function init() {
    void preloadGenreIconMap();
    await initAuthToken();
    await applyBuildDefaultsIfNeeded();
    if (!hasCompleteSetup()) {
        if (setupInputIp) setupInputIp.value = getDefaultServerAddress();
        openSetup();
        return;
    }

    const savedAddress = localStorage.getItem('ma_server_ip');
    const savedName = localStorage.getItem('ma_player_name');

    const baseUrl = buildBaseUrl(savedAddress);
    const platform = IS_ANDROID ? 'android' : IS_TIZEN ? 'tizen' : IS_WEBOS ? 'webos' : 'browser';
    const safePlayerId = buildSendspinPlayerId(savedName, platform);

    setStatus(`connecting ${describeConnection(savedAddress)}…`);

    window.playerInstance = new SendspinPlayer({
        playerId: safePlayerId,
        baseUrl,
        clientName: savedName,
        syncDelay: 0,
        correctionMode: IS_ANDROID ? 'sync' : 'quality-local',
        useOutputLatencyCompensation: true,
        ...(IS_TIZEN ? {
            isTizen: true,
            useMediaElementOutput: true,
            bufferCapacity: TIZEN_SENDSPIN_BUFFER_CAPACITY,
        } : {}),
        onDelayCommand: () => {
            if (!maClient.playerId) return;
            void readPlayerPlaybackOffsets(maClient.playerId, { bypassCache: true }).then(({ staticMs, trimMs }) => {
                state.playerSyncDelayCache.set(maClient.playerId, staticMs);
                state.playerGroupTrimCache.set(maClient.playerId, trimMs);
                applyLocalPlaybackOffsets(staticMs, trimMs);
                if (state.playersPanelOpen) {
                    updatePlayersSyncDelayLabels();
                    updateStereoPairDelaySubtitle();
                    if (state.playersActiveGroup) updatePlayersSyncUi();
                }
            });
        },
        onStreamStart: () => {
            const gen = window.playerInstance?.stateManager?.streamGeneration;
            syncProgressOnStreamStart(gen);
            scheduleMaQueueCatchup();
            schedulePlaybackJoinRecovery('stream-start');
            scheduleTizenAudioKick('stream-start');
        },
        onStateChange: (playerState) => {
            if (playerState.serverState?.metadata) {
                const m = playerState.serverState.metadata;
                state.lastSendspinMetadata = m;
                const queueItem = maClient.activeQueue?.current_item;
                const maMedia = queueItem?.media_item;
                const maBehind = isSendspinMetadataStale(m);
                const trackKey = resolveTrackKey(m, queueItem);
                const spinTrackChanged = !!(trackKey && trackKey !== state.npVisuals.trackKey);
                if (maBehind) {
                    scheduleMaQueueCatchup();
                    if (spinTrackChanged) {
                        state._prefetchQueueKey = '';
                        state.lastNowPlayingKey = trackKey;
                    }
                } else if (trackKey && trackKey !== state.lastNowPlayingKey) {
                    state._prefetchQueueKey = '';
                    state.lastNowPlayingKey = trackKey;
                }
                if (isRadioMedia(maMedia) || isRadioMedia(m)) {
                    if (maQueueHasRadioStreamMeta(queueItem)) {
                        syncRadioNowPlayingFromQueue(queueItem, { force: true });
                    } else {
                        const radioNp = resolveRadioNowPlaying(m, maMedia, queueItem);
                        applyRadioNowPlayingText(radioNp, media);
                        if (!radioNp.hasTrackMeta && !radioNp.subtitle) {
                            const fallback = getRadioStationFallback(maMedia);
                            if (fallback) setArtistLine(fallback);
                        }
                    }
                } else if (!isRadioMedia(maMedia) && !isRadioMedia(m)) {
                    const displayTitle = pickDisplayTitle(maMedia, queueItem, m);
                    setSongTitle(displayTitle);
                    if (!queueItem && displayTitle === 'Ready') {
                        setArtistLine(DOCUMENT_TITLE_DEFAULT);
                    } else {
                        let subtitle = '';
                        if (maMedia && !isPodcastEpisode(maMedia) && !isAudiobookItem(maMedia)) {
                            subtitle = nowPlayingArtist(maMedia);
                        }
                        if (!subtitle && !(maMedia && trackNeedsArtistEnrich(maMedia))) {
                            subtitle = resolveNowPlayingSubtitle(m, maMedia);
                        }
                        if (subtitle) {
                            setArtistLine(subtitle);
                            if (isPodcastEpisode(maMedia) || isPodcastEpisode(m)) {
                                state.lastPodcastShowSubtitle = subtitle;
                            }
                        } else if (!isPodcastEpisode(maMedia) && !isPodcastEpisode(m)
                            && !isAudiobookItem(maMedia)
                            && (!artistTextEl?.textContent || artistTextEl.textContent === 'Music Assistant')) {
                            setArtistLine('Music Assistant');
                        }
                    }
                }
                if (trackKey) commitNpTextTrack(trackKey);
                if (!maBehind && (isAudiobookItem(m) || isAudiobookItem(maMedia))) {
                    const source = maMedia || m;
                    if (!pickAudiobookAuthor(source)) {
                        enrichAudiobookAuthor(source).then((author) => {
                            if (author && !isSendspinMetadataStale(m)) {
                                setArtistLine(author);
                            }
                        });
                    }
                } else if (!maBehind && (isPodcastEpisode(maMedia) || isPodcastEpisode(m))) {
                    const source = maMedia || m;
                    if (!pickPodcastName(source)) {
                        enrichPodcastName(source).then((name) => {
                            if (name && !isSendspinMetadataStale(m)) {
                                setArtistLine(name);
                            }
                        });
                    }
                } else if (isRadioMedia(maMedia) || isRadioMedia(m)) {
                    const source = maMedia || m;
                    if (!maQueueHasRadioStreamMeta(queueItem) && !parseRadioTrackFromMaQueue(queueItem)) {
                        enrichRadioSubtitle(source).then((info) => {
                            if (!info || isSendspinMetadataStale(m)) return;
                            if (maQueueHasRadioStreamMeta(maClient.activeQueue?.current_item)) return;
                            setRadioStationFallback(source, info);
                            const radioNp = resolveRadioNowPlaying(m, source, queueItem);
                            if (!radioNp.hasTrackMeta) {
                                applyRadioNowPlayingText({ ...radioNp, subtitle: info }, source);
                            }
                        });
                    }
                } else if (!maBehind && maMedia && trackNeedsArtistEnrich(maMedia)) {
                    enrichTrackArtistMetadata(maMedia).then((enriched) => {
                        const name = nowPlayingArtist(enriched);
                        if (name && !isSendspinMetadataStale(m)) {
                            setArtistLine(name);
                            syncAndroidMediaSession();
                        }
                    });
                }
                const maUri = maMedia?.uri || maMedia?.path || '';
                const spinUri = m.uri || m.source_id || '';
                const isRadioCtx = isRadioMedia(maMedia) || isRadioMedia(m);
                const forceSpinVisuals = !isRadioCtx && (
                    maBehind || spinTrackChanged || (!!maUri && !!spinUri && maUri !== spinUri)
                );
                if (maBehind || spinTrackChanged) {
                    requestNowPlayingVisuals('spin-metadata', { force: forceSpinVisuals || maBehind });
                    if (spinTrackChanged) collapseUiForDefaultArtIfIdle();
                }
                syncAndroidMediaSession();

                syncProgressFromMetadata(m, playerState.groupState?.playback_state === 'playing');
                syncPlaybackModes(m, playerState.groupState);
            }
            if (playerState.groupState) {
                syncPlaybackModes(playerState.serverState?.metadata, playerState.groupState);
                const wasPlaying = state.isPlaying;
                const nowPlaying = playerState.groupState.playback_state === 'playing';
                if (!nowPlaying && wasPlaying) {
                    stopProgressTimer();
                    freezeProgressAtCurrentPosition();
                    syncPlainLyricsPlayback();
                }
                state.isPlaying = nowPlaying;
                mainBody.classList.toggle('playing', state.isPlaying);
                visualizer.setPlaying(state.isPlaying);
                syncIdleProgressVisibility();
                syncAndroidMediaSession();
                if (state.isPlaying) {
                    startProgressTimer();
                    tryAttachVisualizer();
                    syncPlainLyricsPlayback();
                    if (!wasPlaying) {
                        const resume = resolvePlaybackResumePosition();
                        anchorProgress(resume.positionMs, resume.playbackSpeed);
                        state.progressResyncAt = performance.now();
                        requestNowPlayingVisuals('play-start');
                        kickTizenAudioOutput();
                    }
                } else if (wasPlaying) {
                    const playbackState = playerState.groupState.playback_state;
                    if (playbackState === 'idle' || playbackState === 'stopped') {
                        clampProgressAtTrackEnd();
                    }
                }
            }
            updatePlayButtonUi();
        }
    });

    let analyserPollAttempts = 0;
    const analyserPoll = setInterval(() => {
        if (tryAttachVisualizer() || ++analyserPollAttempts > 30) {
            clearInterval(analyserPoll);
        }
    }, 1200);

    try {
        await window.playerInstance.connect();
        visualizer.setConnected(true);
        setStatus(`connected · ${savedName}`, 'connected');
        tryAttachVisualizer();
        startMaModeSync();
        if (!IS_TIZEN) {
            void syncNavMenuState();
        } else if (lyricsPrefEnabled()) {
            ensureLyricsBootstrapped();
        }
        void initAndroidMediaSession();
        bindAudioLifecycleRecovery();
        startAudioHealthWatchdog();
        kickTizenAudioOutput();
    } catch (err) {
        clearInterval(analyserPoll);
        stopMaModeSync();
        visualizer.setConnected(false);
        console.error('Connection failed:', err);
        setStatus('connection failed — check settings', 'error');
    }
}

browseBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    if (state.browsePanelOpen) closeBrowsePanel();
    else openBrowsePanel();
});
queueBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    if (state.queuePanelOpen) closeQueuePanel();
    else openQueuePanel();
});
playersBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    if (state.playersPanelOpen) closePlayersPanel();
    else openPlayersPanel();
});
navBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    toggleNavMenu();
});
navGoArtistBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    navigateBrowseToArtist();
});
navGoAlbumBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    navigateBrowseToAlbum();
});
navGoPodcastBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    navigateBrowseToPodcast();
});
navGoPlaylistBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    navigateBrowseToPlaylist();
});
navGoGenresBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void openNavGenresMenu();
});
navGoOtherVersionsBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void openOtherVersionsPanel(getNowPlayingMedia());
});
navGoSimilarTracksBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void openSimilarTracksPanel(getNowPlayingMedia());
});
navGenresCloseBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    closeNavGenresMenu();
});
navGoDetailsBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void openNavDetails();
});
navCloseBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    closeNavMenu();
});
volumeBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    toggleVolumeMenu();
});
volumeCloseBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    closeVolumeMenu();
});
volumeSlider?.addEventListener('input', () => {
    scheduleVolumeSet(Number(volumeSlider.value));
});
settingsBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    toggleSettingsMenu();
});
browseSearchInput.addEventListener('keydown', (e) => {
    const code = e.keyCode || e.which;
    if (code === 8 || e.key === 'Backspace') {
        e.stopPropagation();
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        runBrowseSearch(browseSearchInput.value);
    }
});
browseSearchInputToggle?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    const next = !getSearchInputCollapsed();
    setSearchInputCollapsed(next);
    syncBrowseSearchInputToggle();
});
if (queueSavePlaylistBtn) {
    queueSavePlaylistBtn.addEventListener('click', () => {
        if (Date.now() < getIgnoreClickUntil()) return;
        openQueueSavePlaylistInput();
    });
}
if (queueSavePlaylistInput) {
    queueSavePlaylistInput.addEventListener('keydown', (e) => {
        const code = e.keyCode || e.which;
        if (code === 8 || e.key === 'Backspace') {
            e.stopPropagation();
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            confirmQueueSavePlaylist();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeQueueSavePlaylistInput();
        }
    });
}
menuSetupBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    closeSettingsMenu();
    openSetup();
});
menuShowConnectionBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    setShowConnection(!getShowConnection());
});
menuArtDisplayBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    openArtDisplayMenu();
});
menuShowLyricsBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    setShowLyricsEnabled(!getShowLyricsEnabled());
});
artDisplayCloseBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    closeArtDisplayMenu();
});
menuDisableVisualizerBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    setDisableVisualizer(!getDisableVisualizer());
});
menuDisableVizBlurBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    setDisableVizBlur(!getDisableVizBlur());
});
menuEqPresetsBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void openEqPresetsMenu();
});
menuSwitchInfoBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    toggleRadioSwitchInfo();
});
menuVizModesBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    openVizModesMenu();
});
menuFullscreenBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void setFullscreen(!isFullscreen());
});
eqPresetsCloseBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    closeEqPresetsMenu();
});
vizModesCloseBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    closeVizModesMenu();
});
vizBarCountSlider?.addEventListener('input', () => {
    setVizBarCount(Number(vizBarCountSlider.value));
});
vizFpsSlider?.addEventListener('input', () => {
    setVizFpsFromSliderIndex(Number(vizFpsSlider.value));
});
menuGuestAccessBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void openGuestAccessModal();
});
menuCloseBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    closeSettingsMenu();
});
window.addEventListener('resize', () => {
    schedulePlaybackStackRelayoutAfterStage();
    if (getDvdFloater().running) getDvdFloater().measure();
    updateLyricsPanelLayout(state.lyrics?.lastLayoutOpts || {});
});
window.addEventListener('orientationchange', () => {
    schedulePlaybackStackRelayoutAfterStage();
});
playerStage.addEventListener('transitionend', (e) => {
    if (e.propertyName !== 'transform' || e.target !== playerStage) return;
    if (!mainBody.classList.contains('show-ui') || mainBody.classList.contains('panel-open')) return;
    if (showUiChromeEnterActive || Date.now() < progressEnterAnimUntil) return;
    applyPlaybackStackLayout({ immediate: true });
});
bindProgressScrubbing();
playBtn.addEventListener('click', togglePlayPause);
playersSyncBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void syncSelectedPlayers();
});
playersStereoBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void stereoPairSelectedPlayers();
});
playersStereoLeadBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void stereoPairWithLocalLeader();
});
playersJoinBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void joinRemoteSyncGroup();
});
playersRefreshBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void refreshActiveSyncGroup();
});
playersResetOffsetsBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void resetActiveGroupOffsets();
});
playersLeaveBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void leaveActiveSyncGroup();
});
playersSplitBtn.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    void splitActiveSyncGroup();
});
queueClearBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    state.queueFocusZone = 'actions';
    state.queueActionFocusIndex = 0;
    void activateQueueAction();
});
queueAutoplayBtn?.addEventListener('click', () => {
    if (Date.now() < getIgnoreClickUntil()) return;
    state.queueFocusZone = 'actions';
    state.queueActionFocusIndex = getVisibleQueueActionButtons().indexOf(queueAutoplayBtn);
    if (state.queueActionFocusIndex < 0) state.queueActionFocusIndex = 1;
    void activateQueueAction();
});
shuffleBtn.addEventListener('click', toggleShuffle);
prevBtn.addEventListener('click', () => { sendPlayerCommand('previous'); showUI(); });
nextBtn.addEventListener('click', () => { sendPlayerCommand('next'); showUI(); });
repeatBtn.addEventListener('click', cycleRepeat);


if (IS_ANDROID && window.Capacitor?.Plugins?.App) {
    window.Capacitor.Plugins.App.addListener('backButton', () => {
        handleAppBack();
    });
}

if (IS_TIZEN && typeof tizen !== 'undefined' && tizen.tvinputdevice?.registerKey) {
    for (const key of ['Back', 'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop']) {
        try {
            tizen.tvinputdevice.registerKey(key);
        } catch (_) {
            /* unsupported on this model */
        }
    }
}

window.addEventListener('keyup', (e) => {
    const code = e.keyCode || e.which;
    if (code === 37 || code === 39) onRemoteSeekRelease();
});
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        onAppResume();
        if (getKeepAwake()) screenKeeper.registerWakeLock();
    }
});
window.addEventListener('pageshow', () => onAppResume());
window.addEventListener('focus', () => onAppResume());

function closeOpenPanelRowMenusOnScroll() {
    if (state.browseRowMenuOpen) closeBrowseRowMenu();
    if (state.queueRowMenuOpen) closeQueueRowMenu();
    if (state.playersRowMenuOpen) closePlayersRowMenu();
}

function isPanelRowMenuOpen() {
    return state.browseRowMenuOpen || state.queueRowMenuOpen || state.playersRowMenuOpen || state.providerMenuOpen;
}

function closeOpenPanelRowMenus() {
    closeBrowseRowMenu();
    closeQueueRowMenu();
    closePlayersRowMenu();
    closeProviderMenu();
}

function handlePanelRowMenuOutsidePointer(e) {
    if (!isPanelRowMenuOpen()) return;
    const target = e.target;
    if (target.closest('.queue-row-menu, .browse-row-menu, .players-row-menu, .search-provider-menu')) {
        return;
    }
    if (target.closest('.panel-row-action[data-sub="menu"]')) return;
    if (target.closest('.search-filter-chip[data-filter-id="providers"]')) return;
    closeOpenPanelRowMenus();
}

/** Min list overflow (px) before compact header — avoids twitch on barely-scrollable lists. */
const PANEL_HEADER_COMPACT_MIN_OVERFLOW = 96;

function markPanelListUserScroll(listEl) {
    if (listEl) listEl.dataset.userScrolled = '1';
}

function syncPanelHeaderCompact(listEl) {
    const header = listEl.closest('.media-panel')?.querySelector('.panel-header');
    if (!header) return;
    if (!listEl.dataset.userScrolled) {
        header.classList.remove('panel-header-compact');
        return;
    }
    const maxScroll = listEl.scrollHeight - listEl.clientHeight;
    const isCompact = header.classList.contains('panel-header-compact');
    if (!isCompact && maxScroll < PANEL_HEADER_COMPACT_MIN_OVERFLOW) return;
    const minOverflow = isCompact ? 8 : PANEL_HEADER_COMPACT_MIN_OVERFLOW;
    header.classList.toggle('panel-header-compact', listEl.scrollTop > 12 && maxScroll >= minOverflow);
}

function resetPanelHeaderCompact(listEl) {
    const header = listEl.closest('.media-panel')?.querySelector('.panel-header');
    if (header) header.classList.remove('panel-header-compact');
    if (listEl) delete listEl.dataset.userScrolled;
}

function expandPanelListHeader(listEl) {
    if (!listEl) return;
    listEl.scrollTop = 0;
    listEl.closest('.media-panel')?.querySelector('.panel-header')?.classList.remove('panel-header-compact');
}

function bindPanelListScroll(el) {
    if (!el) return;
    let scrollTimer = null;
    const markUserScroll = () => markPanelListUserScroll(el);
    el.addEventListener('wheel', markUserScroll, { passive: true });
    el.addEventListener('touchmove', markUserScroll, { passive: true });
    el.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
            markUserScroll();
        }
    });
    el.addEventListener('scroll', () => {
        if (el.scrollTop > 0) markPanelListUserScroll(el);
        closeOpenPanelRowMenusOnScroll();
        syncPanelHeaderCompact(el);
        el.classList.add('scrolling');
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => el.classList.remove('scrolling'), 900);
    }, { passive: true });
}
bindPanelListScroll(browseList);
bindPanelListScroll(queueList);
bindPanelListScroll(playersList);
bindPanelListScroll(browseProviderMenu);
bindDetailsPanelBack(() => {
    if (Date.now() < getIgnoreClickUntil()) return;
    closeDetailsPanel();
});
document.addEventListener('pointerdown', handlePanelRowMenuOutsidePointer, true);


registerUiHandlers({
    inferMediaType,
    getItemDisplayName,
    trackArtistAlbumSubtitle,
    pickDisplayArtistName,
    pickPodcastName,
    formatAlbumYear,
    formatPodcastEpisodeDate,
    isAudiobookItem,
    getRadioStationFallback,
    parseRadioTrackFromMaQueue,
    trackArtistName,
    trackAlbumName,

    resolveBrowseItemRaw,
    closeBrowseRowMenu,
    navigateBrowseToArtist,
    navigateBrowseToAlbum,
    navigateBrowseToPodcast,
    navigateBrowseToPlaylist,
    navigateBrowseToGenre,
    startRadioForMedia,
    clearGoToErrorStatus,
    getBrowseGoToTargets,
    enrichBrowseItemForGoTo,
    fetchFullMaMedia,
    resolveArtistItem,
    resolveAlbumItem,
    resolvePodcastShowItem,
    resolvePlaylistItem,
    getCachedPlaylistTracksForBrowseItem,
    loadPlaylistTracksForPlayback,
    collectPlaylistPlaybackUris,
    playPlaylistFromBrowse,
    getPlaylistTracksCached,
    loadFavoritesListCached,
    radioItemInLibrary,
    formatRadioStationFullLine,
    resolveRadioNowPlaying,
    isRadioSwitchInfoEnabled,
    setRadioSwitchInfo,
    refreshRadioNowPlayingText,
    isRadioMedia,
    isNowPlayingRadio,
    isPlaybackRadioContext,
    closeProviderMenu,
    closeBrowsePanel,
    setRecommendedMediaFilter,
    ensureMusicProvidersCached,
    shouldShowArtistItem,
    itemMatchesBrowseProvider,
    filterAlbumTracks,
    filterAlbumTracksForProvider,
    albumMatchesBrowseArtist,
    providerNeedsStrictArtistDiscography,
    uriForProvider,
    providerOptsForPreferred,
    isRadioBrowseItem,
    isRadioBrowseFolder,
    dedupeRadioItems,
    enrichSearchTrackRows,
    dedupeSearchRows,
    closeNavMenu,
    closeNavGenresMenu,
    closeSettingsMenu,
    closeVolumeMenu,
    closeEqPresetsMenu,
    closeVizModesMenu,
    openVizModesMenu,
    moveVizModesFocus,
    activateVizModesFocused,
    openArtDisplayMenu,
    closeArtDisplayMenu,
    moveArtDisplayFocus,
    activateArtDisplayFocused,
    closeQueueRowMenu,
    closeAllPanels,
    syncIdleProgressVisibility,
    refreshTitleLayout,
    scheduleTitleLayoutRelayout,
    expandPanelListHeader,
    pauseUiHideTimer,
    stopDvdFloater: () => stopArtDisplayMotion(true),
    stopDvdFloaterSoft: () => stopArtDisplayMotion(false),
    scheduleShowUiChromeLayout: commitShowUiChromeLayout,
    commitShowUiChromeLayout,
    clearStackLayoutAnimationState,
    applyPlaybackStackLayout,
    clearPlayerStageInlineTransform,
    updateFloatState,
    ensureLyricsBootstrapped,
    schedulePlaybackStackRelayoutAfterStage,
    clearDefaultArtStageInlineTransform: snapPlayerStageForIdleLayout,
    snapDefaultArtStageIdle: snapPlayerStageForIdleLayout,
    snapPlayerStageForIdleLayout,
    collapseUiForDefaultArtIfIdle,
    resumeUiHideTimer,
    updatePanelFocus,
    setStatus,
    restoreConnectedStatus,
    scheduleStatusRestore,
    getDefaultPlayerName,
    isPanelOpen,
    positionOverlayMenu,
    getIgnoreClickUntil,
    mediaItemSubtitle,
    maItemSubtitle,
    isPodcastEpisode,
    isPodcastShow,
    getBrowseThumbUrl,
    mediaTypeIcon,
    seedSupportsAutoplay,
    getBrowseGoToTargets,
    setPanelStatusText,
    renderPanelRowMenu,
    positionPanelRowMenu,
    resetPanelRowMenuPosition,
    getCurrentBrowseEntry,
    storeBrowseView,
    renderBrowsePanel,
    focusPanelTarget,
    cleanArtistDisplayName,
    formatProviderLabel,
    pickPrimaryArtistRef,
    titlesRoughlyMatch,
    namesMatchForArtist,
    resetNavButtonFocus,
    isLocalLibraryItem,
    isAndroidPortraitBottomNav,
    scheduleProgressLayoutRelayout,
    browseChipOverridesProvider,
    collectProviderTrackUris,
    resolveBrowseGoToNavigationMedia,
    enrichRecentPlayedList,
    startMaModeSync,
    retryMaConnection,
    createMaConnectionStatusRow,
    closePlayersPanel,
    closeDetailsPanel,
    syncPanelInputModeForOpen,
    afterMaPlayback,
    showUI,
    hasSimilarTracksSupport,
    providerIcon,
    providerIconMono,
    normalizeProviderDisplayName,
    resolveRadioNowPlaying,
    formatRadioStationFullLine,
    scheduleLocalPlayerVisualCatchup,
    schedulePlaybackJoinRecovery,
    isTvLazyLibraryBootstrap,
    ensureTvLibraryBootstrap,
    applySyncGroupCorrectionMode,
    panelKeyboardFocusActive,
    syncVolumeUi,
    isVolumeControllable,
    commitVolumeSet,
    shuffleVizModeOnTrackChange,
    vizModeOnTrackChange,
    closeEqPresetsMenu,
    closeVizModesMenu,
    isPlaybackRadioContext,
    normalizeUiFocusZone,
    isProgressFocusAvailable,
    onRemoteSeekPress,
    openSetup,
    closeSetup,
    setupNextStep,
    setupFinishStep,
    setupConnect,
    moveSetupFocus,
    exitApp,
    openGuestAccessModal,
    closeGuestAccessOverlay,
    toggleVolumeMenu,
    activateVolumeFocused,
    adjustVolume,
    moveVolumeFocus,
    toggleShuffle,
    togglePlayPause,
    cycleRepeat,
    sendPlayerCommand,
    clearStackLayoutAnimationState,
    resetPlaybackStackLayout,
    invalidateIdleProgressVisibility,
    scheduleIdleProgressVisibilitySync,
    syncProgressSeekableChrome,
    getBrowseRows,
    getBrowseRowSubTargets,
    moveBrowseMenuFocus,
    chipVerticalTarget,
    entrySupportsBrowseProviders,
    updateArtistProviderFocus,
    updateAlphaViewFocus,
    updateContainerActionFocus,
    updateProviderMenuFocus,
    syncSearchFilterFocusToActive,
    closeQueuePanel,
    updateModeButtons,
    recoverMaPlayback,
    refreshLyricsForQueueItem,
    getNowPlayingItemKey,
    syncNavMenuState,
    getTrackExtrasGoToTargets,
    getTrackExtrasAvailability,
    warmTrackExtrasCache,
    enrichTrackExtrasMenuActions,
    refreshNowPlayingTrackExtras,
    openOtherVersionsPanel,
    openSimilarTracksPanel,
    isTrackCollectionEntry,
    getTrackCollectionContainerActions,
    saveTrackCollectionAsPlaylist,
    handleTrackExtrasGoTo,
    getCachedTrackCollectionLists,
});

registerNpHandlers({
    inferMediaType,
    isLocalLibraryItem,
    getNowPlayingItemKey,
    getNowPlayingMedia,
    pickDisplayTitle,
    nowPlayingArtist,
    enrichTrackArtistMetadata,
    isAudiobookItem,
    pickAudiobookAuthor,
    enrichAudiobookAuthor,
    onRadioStationUriChanged,
    resolveRadioNowPlaying,
    maQueueHasRadioStreamMeta,
    enrichRadioSubtitle,
    setRadioStationFallback,
    isPodcastEpisode,
    pickPodcastName,
    enrichPodcastName,
    trackAlbumName,
    formatAlbumYear,
    parseRadioHintsFromName,
    syncQueuePlayingHighlight,
    syncNavMenuState,
    syncAndroidMediaSession,
    syncProgressSeekableChrome,
    syncProgressThumbActive,
    syncIdleProgressVisibility,
    scheduleIdleProgressVisibilitySync,
    isMainProgressVisible,
    isOverlayMenuOpen,
    isSeekable,
    getIsSeeking: () => isSeeking,
    isSeekAuthorityActive,
    releaseSeekAuthorityIfMatched,
    clearSeekAuthority,
    updateProgressLayout,
    isBrowserUi,
    getQueueCurrentIndex,
    isProgressFocusAvailable,
    shuffleVizModeOnTrackChange,
    vizModeOnTrackChange,
    refreshLyricsForQueueItem,
    refreshNowPlayingTrackExtras,
    syncLyricsProgress,
});

registerMaHandlers({
    queueEventAppliesToLocal,
    updateQueuePanelHeader,
    refreshNavPlaylistContext,
    syncNavMenuState,
    applyRemotePlaybackModes,
    syncQueueActionChips,
    syncQueuePlayingHighlight,
    onMaQueueCurrentItemChanged,
    syncMaNowPlayingIfChanged,
    refreshRadioNowPlayingText,
    isRadioSwitchInfoEnabled,
    setRadioSwitchInfo,
    isRadioMedia,
    syncRadioNowPlayingFromQueue,
    scheduleQueueReload,
    syncProgressFromMaQueue,
    schedulePlayersPanelRefresh,
    patchPlayersListFromMaEvent,
    scheduleGroupOffsetDisplaySync,
    scheduleLocalPlaybackOffsetsSync,
    syncLocalPlaybackOffsetsFromMa,
    syncGroupOffsetDisplayFromMa,
    applyLocalSyncLeaderFromPlayer,
    applyPlayerVolumeState,
    scheduleLocalPlayerVisualCatchup,
    getMaApiTokenSync,
    applyNowPlayingFromMaItem,
    applyIdleNowPlayingText,
    requestNowPlayingVisuals,
    ensureLyricsBootstrapped,
    invalidateProviderCaches,
    ensureMusicProvidersCached,
    refreshPlayerVolume,
    applyDefaultPlayerVolume,
    readPlayerSyncDelayMs,
    readPlayerGroupTrimMs,
    readPlayerPlaybackOffsets,
    applyLocalPlayerSyncDelay,
    applyLocalPlaybackOffsets,
    applySyncGroupCorrectionMode,
    applyEqPresetFromPreference,
    onMaWebSocketClosed,
    onMaConnectionRestored,
    inferMediaType,
    shouldShowArtistItem,
    maItemToPanelRow,
    getEnabledSearchProviderIds,
    itemMatchesAnySearchProvider,
    dedupeSearchRows,
    searchQueryVariants,
    itemMatchesBrowseProvider,
    isRadioBrowseItem,
    isRadioBrowseFolder,
    dedupeRadioItems,
    filterAlbumTracks,
    filterAlbumTracksForProvider,
    albumMatchesBrowseArtist,
    providerNeedsStrictArtistDiscography,
    uriForProvider,
    providerOptsForPreferred,
    isValidMaItemId,
    maItemIdFromUri,
    isLocalLibraryItem,
    getIsSeeking: () => isSeeking,
});

mainBody.classList.toggle('show-connection', getShowConnection());
syncWebUiOnlySettings();
bindWebUiCursorIdle();
document.addEventListener('fullscreenchange', () => {
    // Browser hold-Esc exits fullscreen when Keyboard Lock is active; keep pin + checkbox in sync.
    if (isBrowserUi() && !document.fullscreenElement) {
        clearWebUiFullscreenPinned();
    } else if (isBrowserUi() && document.fullscreenElement) {
        void syncPinnedFullscreenKeyboardLock();
    }
    syncSettingsMenuChecks();
});
syncSettingsMenuChecks();
screenKeeper.setEnabled(shouldKeepScreenAwake());
updateFloatState();
syncIdleProgressVisibility();
updateModeButtons();
syncFocusAccentColors(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0084ff');

export function bootstrapApp() {
    bindMouseHoverHighlights();
    bindPanelPointerMode();
    bindSetupOverlay();
    bindBrowsePanelBack();
    bindKeyboardNavigation();
    initAndroidChipSections();
    void init();
}
