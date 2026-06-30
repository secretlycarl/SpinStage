# Changelog

## 1.1.0 (dev — unreleased)

- Added Docker setup instructions and example compose
- Device sync offset behavior tweaks
- Progress bar progress tracking fix
- Reduced main progress bar width in landscape orientation (when controls are visible)
- Now playing accent/bg art transition fix
- Corner Info mode radio station art size fix
- Fix for queue title displaying incorrect source while playing from a podcast episode list
- Fixed bug that caused albums to list copies of songs from multiple sources
- Tizen beta version and setup docs
- Sync group create/split: verify Music Assistant state before showing failure when the operation actually succeeded
- Default art display: keep full-size idle art on track change; restore full size when controls hide (explicit idle `#player-stage` transform)
- Browse search: restore cached results when returning to search
- Tizen defaults: visualizer disabled, 13-bar resolution, 24 FPS, viz blur off
- Settings: **Disable Viz Blur** toggle (between viz FPS and EQ presets; default on for Tizen, off elsewhere)
- Default art display: fix stuck full-size art after first controls show/hide; corner/float modes apply correctly again
- Controls enter/exit: art, menu tabs, progress, and controls animate together (350ms); no full-size intermediate when leaving float/corner info
- Controls/progress enter: compute stack positions from final show-ui geometry (no layout probe on art); transition `top`/`bottom` with transform/opacity
- Tizen performance: media-element audio output, 1MB Sendspin buffer, throttled sync-group catch-up decode, debounced join recovery (skip resync when buffer full), lazy library bootstrap until browse opens
