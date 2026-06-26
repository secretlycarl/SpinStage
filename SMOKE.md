# Manual smoke checklist

Run after sync. Browser (`spinstage-webui/server.py`) is enough for most changes; use TV/phone when nav, focus, or platform CSS changed.

## Connect & bootstrap

- [ ] Fresh load connects to MA and shows now-playing within a few seconds
- [ ] Reconnect (restart MA or toggle Wi‑Fi): title/art does not flash stale Sendspin metadata
- [ ] Queue panel opens with correct current track after reconnect

## Playback

- [ ] Play / pause (solo player): MA queue state matches Sendspin stream
- [ ] Play / pause in a sync group: group leader follows
- [ ] Seek by scrubbing: position stays stable; rapid scrub does not jump backward
- [ ] Next / previous track updates art and title

## Queue

- [ ] Open queue: items load; current row highlighted
- [ ] Skip track while queue open: list refreshes once (no double flicker)
- [ ] Play item from queue; remove item; reorder (if enabled)

## Browse & search

- [ ] Library categories load (artists, albums, tracks, playlists)
- [ ] Search returns results; play from search
- [ ] Album / artist pages: play and shuffle chips work

## Settings & guest

- [ ] Settings save (server IP, player name)
- [ ] Guest QR renders (requires network); party URL is expected to reach quickchart.io — see [SECURITY.md](SECURITY.md) / [README § Security](README.md#security)

## Platforms (when touched)

- [ ] **webOS TV:** D‑pad focus, back key, full-screen UI; IPK install via CLI or Dev Manager
- [ ] **Android:** Capacitor shell, cleartext LAN if used, back gesture
