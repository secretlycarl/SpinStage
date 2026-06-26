# SpinStage

<p align="center">
  <img src="assets/repo-logo.svg" alt="SpinStage" width="320">
</p>

Thanks for checking out my project! SpinStage is a [Music Assistant](https://music-assistant.io/)-integrated audio visualizer, [Sendspin](https://github.com/music-assistant/sendspin) player, and library browser for browser, Android, and LG webOS.

Setup walkthrough and release media: [GitHub Releases](https://github.com/secretlycarl/SpinStage/releases). Screenshots below.

> **Unofficial client.** SpinStage is a third-party homelab app. It is **not affiliated with, endorsed by, or maintained by** the [Music Assistant](https://music-assistant.io/) project.

> **AI-built code.** Developed using Cursor (various models). I made a lot of icons, designed the UI, came up with visualizer concepts, and have spent weeks ideating and testing, but I'm a designer not a real developer. Thankfully the security implications of the app are pretty limited; the only third-party integration is for the Listen Party QR code that MA already uses. See the [Security](#security) section for more info. You are responsible for securing your traffic if using the app remotely.

I've shared it with one person so far and here's what they had to say (thankfully) - 

"Wow ... I just installed and tried it out, expecting it to be a bit rough around the edges and needing some work. However it is fantastic! great job. Very impressive."

Overall I'd say this initial release is about 75% where i want the project to be. Some minor UI tweaks/backend fixes, more missing MA integrations, other platforms. If you encounter any bugs or things you think could be tweaked, make an issue here or you can message me on reddit - u/secretlycarl.

---

## Get SpinStage

**Easiest:** [GitHub Releases](https://github.com/secretlycarl/SpinStage/releases) — pick the file for your platform:

| Asset | Platform | What to do |
|-------|----------|------------|
| `spinstage-webui-*.zip` | Browser / PC | Unzip, `cd spinstage-webui`, run `./run.sh --open` (or `run.bat` on Windows) |
| `spinstage-*.apk` | Android | Sideload the APK (`adb install -r …` or copy to device and open) |
| `com.spinstage_*_all.ipk` | LG webOS TV | Install with [`ares-install`](https://webostv.developer.lge.com/develop/tools/cli-introduction) or [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) (Developer Mode on the TV either way) |

Each release matches a tagged version (see `spinstage-webui/VERSION` in the repo). **No credentials are bundled** in release downloads — use the in-app Connect screen on first launch.

How to cut releases: [docs/RELEASE.md](docs/RELEASE.md).

**Alternatively:** clone this repo and [build from source](#build-from-source) (below). One repo, all three platforms; releases are just pre-built copies so you don't need Node, Gradle, ares-cli, or [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) unless you want them.

---

## How it works

SpinStage is just the **client**. Music lives in Music Assistant — you need MA running somewhere reachable, Sendspin enabled, an MA login, and to configure the **player** in MA (may need to uncheck the "hide player" option).

| You already have | SpinStage gives you |
|------------------|---------------------|
| MA + Sendspin | Full-screen player |
| MA user account | Browse, search, queue |
| A player per device | Multi-room sync, volume, transport |

Real source code is **`spinstage-webui/`**. Android and webOS folders are copies synced from that.

**Tested with:** Music Assistant 2.9.x + Sendspin. Other MA versions may work; file an issue with your MA version if something breaks.

---

## Features

**Player UI** — cover art, accent colors from the track, blurred bg crossfade, optional audio visualizer, controls that hide until you need them.

**Browse & search** — MA library (artists, albums, playlists, podcasts, radio, etc.). Search with type filters. Pick which providers to search. **Go to** from now playing jumps straight to artist/album/etc.

**Queue** — reorder, row menus, autoplay, save queue as MA playlist.

**Device Sync** — see MA players, group sync, stereo pair + offset tuning, per-player volume in a group.

**Separation of personal/public Spotify content in search** - Not yet a feature on MA

**10+ visualizers** - Single, Double, Shuffle, and Cycle modes

**EQ Preset picker** - Using EQ profiles from the server

It has ways to interact with most MA browsing / playback / player functions. More to come as requested, I only use so many features.

---

## Screenshots

UI captures live in [`docs/screenshots/`](docs/screenshots/). When present, they appear here:

| Now playing | Browse |
|:---:|:---:|
| ![Now playing](docs/screenshots/now-playing.png) | ![Browse](docs/screenshots/browse.png) |

See the [screenshots folder](docs/screenshots/) for more.

---

## Before you start (all platforms)

1. [Music Assistant](https://music-assistant.io/) running
2. Sendspin provider on in MA
3. MA username + password (Settings → Profile)
4. Client can reach MA:
   - **LAN:** ports **8927** (Sendspin) and **8095** (MA)
   - **Remote:** HTTPS + `/sendspin` — see [Remote access](#remote-access)

---

## Quick start (from a Release)

After downloading from [Releases](https://github.com/secretlycarl/SpinStage/releases):

### Browser

Unzip `spinstage-webui-*.zip`. You need Python 3.10+.

```bash
cd spinstage-webui
./run.sh --open          # Linux/macOS — run.bat / run.ps1 on Windows
```

Connect once in the app (server, player name, MA username/password). See [spinstage-webui/INSTALL.md](spinstage-webui/INSTALL.md).

### Android

Install the release `.apk` on your device. Enable install from unknown sources if prompted. Open SpinStage → Connect.

→ [spinstage-android/INSTALL.md](spinstage-android/INSTALL.md)

### webOS TV

TV must be in [Developer Mode](https://webos.developer.lge.com/develop/getting-started). Install the `.ipk` from the release (filename matches version, e.g. `com.spinstage_0.4.0_all.ipk`):

**Option A — CLI ([ares-cli](https://webostv.developer.lge.com/develop/tools/cli-introduction))**

```bash
ares-install --device my-tv com.spinstage_*_all.ipk
```

**Option B — GUI ([webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop))**

Pair the TV (same Developer Mode setup), then drag/drop the `.ipk` onto Dev Manager.

→ [spinstage-webos/INSTALL.md](spinstage-webos/INSTALL.md)

---

## Build from source

Clone the repo if you want the latest `main`, custom builds, or to contribute. Prerequisites and full steps are in each platform's INSTALL.

### Browser

```bash
cd spinstage-webui
./run.sh --open
```

First run may offer to create `config/user-settings.json`, or use the in-app Connect screen.

→ [spinstage-webui/INSTALL.md](spinstage-webui/INSTALL.md)

### Android

Node 18+, JDK 17+, Android SDK, `adb`.

```bash
cd spinstage-android
npm install
npm run build:release    # release APK for sideloading (see note below)
adb install -r dist/spinstage-<version>.apk
```

For local dev you can use `npm run build:debug` instead (faster iteration; not what we attach to GitHub Releases).

`build.sh` / `build.bat` can prompt for optional `user-settings.json` before building.

→ [spinstage-android/INSTALL.md](spinstage-android/INSTALL.md)

### webOS TV

Node 18+, TV in Developer Mode. Use [ares-cli](https://webostv.developer.lge.com/develop/tools/cli-introduction) **or** [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) to install the packaged `.ipk`.

```bash
cd spinstage-webos
npm run package
ares-install --device my-tv com.spinstage_*_all.ipk   # or drag/drop in Dev Manager
```

Output filename matches `appinfo.json` / `spinstage-webui/VERSION` (e.g. `com.spinstage_0.4.0_all.ipk`).

Optional: pre-fill `config/user-settings.json` before packaging to skip setup on the TV.

→ [spinstage-webos/INSTALL.md](spinstage-webos/INSTALL.md)

---

## Skip setup (optional)

Copy `user-settings.json.example` → `config/user-settings.json` (gitignored):

```json
{
  "server": "192.168.1.100",
  "playerName": "Cinema TV",
  "username": "your-ma-username",
  "password": "your-ma-password"
}
```

| Platform | File | Helper (from platform folder) |
|----------|------|--------|
| Browser | `spinstage-webui/config/user-settings.json` | `python3 scripts/configure_defaults.py` |
| Android | `spinstage-android/config/user-settings.json` | `python scripts/configure_defaults.py` |
| webOS | `spinstage-webos/config/user-settings.json` | `python scripts/configure_defaults.py` |

Or env vars: `SPINSTAGE_SERVER`, `SPINSTAGE_PLAYER`, `SPINSTAGE_USERNAME`, `SPINSTAGE_PASSWORD`.

Build-time prefill skips the setup wizard on first launch. After Connect, credentials are saved on-device (see [Security](#security)) so restarts stay signed in.

**Don't commit or share `user-settings.json`.**

---

## Remote access

SpinStage on a phone/TV/browser needs **two** things from your MA host:

| What | LAN | HTTPS |
|------|-----|--------|
| Sendspin | port **8927** | `/sendspin` (WebSocket) |
| Music Assistant | port **8095** | `/` (API, art, browse) |

**LAN:** enter IP in setup (e.g. `192.168.1.100`) — app uses `ws://IP:8927/sendspin` and `http://IP:8095`.

**HTTPS:** enter hostname only (e.g. `music.example.com`) — app uses `wss://host/sendspin` and `https://host`.

### Cloudflare tunnel example

One hostname, two rules — **put `/sendspin*` first**:

```yaml
- hostname: music.example.com
  path: /sendspin*
  service: http://192.168.1.100:8927

- hostname: music.example.com
  service: http://192.168.1.100:8095
```

Or split Sendspin to its own subdomain if you prefer:

```yaml
- hostname: sendspin.example.com
  service: http://192.168.1.100:8927

- hostname: music.example.com
  service: http://192.168.1.100:8095
```

(If you split subdomains you need to align MA/Sendspin base URLs — same-host `/sendspin` is the easy path.)

### MA setting

MA → **Settings → System → Webserver** → **Base URL** = your public HTTPS origin (e.g. `https://music.example.com`). Fixes album art when you're not on LAN.

### Firewall

LAN: open 8927 + 8095 on the MA box. Remote via tunnel: router doesn't need port forwards for those.

### Sanity check

1. Browser on the client device: `https://music.example.com` loads MA
2. Same hostname in SpinStage setup
3. Settings → Show Connection — should show `wss://…/sendspin`

---

## Security

SpinStage is a homelab client for [Music Assistant](https://music-assistant.io/) + [Sendspin](https://github.com/music-assistant/sendspin). I use it on my own network; it is not meant to be a public-facing service on its own.

See the [disclaimer at the top](#spinstage) — SpinStage is an unofficial third-party client, not affiliated with Music Assistant.

### Credential storage (read this before Connect)

After you sign in, SpinStage saves your setup so restarts stay signed in. Here's where things land:

| What | Browser / webOS | Android |
|------|-------------------|---------|
| **MA username + password** | `localStorage` key `spinstage_user_settings` | Same (`localStorage`) |
| **MA API token** (after login) | `sessionStorage` | Android Keystore via SecureStorage plugin when available |
| **Token fallback** | — | If SecureStorage fails or is unavailable, token may also be written to `localStorage` (`ma_api_token_persist`) |
| **Disk file** (browser dev server only) | `config/user-settings.json` if you use `server.py` | — |

\* **webOS** uses the same WebView storage model as the browser (`localStorage` / `sessionStorage`), not a separate TV keychain.

**Passwords are stored in plaintext in browser localStorage** after Connect on every platform. Treat the device like it holds your MA password. Clear app data / localStorage if you uninstall or share the device.

Optional `config/user-settings.json` (gitignored) is also plaintext on disk. Build-time injection into APK/IPK embeds credentials in the package — anyone can unzip and read them.

### Known tradeoffs (on purpose for now)

#### Android cleartext on LAN

`usesCleartextTraffic` + Capacitor `allowMixedContent` so HTTP/WS works to `192.168.x.x` and port 8927. HTTPS hostname mode uses WSS/HTTPS fine.

Might tighten later with a network security config for private ranges only.

#### Browser dev server (`spinstage-webui/server.py`)

- Listens on `0.0.0.0` by default — **any device on your LAN can load the UI**
- Serves `config/user-settings.json` off disk if it exists — **no auth on GET**
- `POST /api/user-settings` writes creds — **127.0.0.1 only**

Don't expose port 9728 to the internet. Don't run the dev server on a machine you wouldn't trust with your MA password. Don't commit `user-settings.json`.

#### Credentials inside APK/IPK

If you inject `user-settings.json` into a build, username/password are in the package.

#### Guest / party QR

Only turn on in MA if you trust everyone on the network.

The in-app guest QR is rendered via [quickchart.io](https://quickchart.io/) — the full party/join URL is sent to that third-party service to generate the image. Do not enable guest mode if that URL must stay on your LAN only. See also [SMOKE.md](SMOKE.md) (guest checklist).

---

### Found something?

Open a GitHub issue (minimal detail in public) or use private reporting if you've got it. **Don't paste** tokens, passwords, or full `user-settings.json` in the open.

---

## Contributing

### The one rule

**Change code in `spinstage-webui/` only.**

`spinstage-android/www/`, the Gradle assets copy, and `spinstage-webos/` are **sync output**. Edit those directly and your fix disappears next sync.

```bash
python3 scripts/sync_public_platforms.py
```

Commit the webui change **and** the synced trees together.

### Usual flow

1. Edit `spinstage-webui/` (`app/`, `styles/`, `index.html`, …)
2. `python3 scripts/sync_public_platforms.py`
3. Quick test — browser at minimum; TV/phone if you touched nav/UI
4. Bump version if you're releasing — set `spinstage-webui/VERSION`, then run sync (updates Android `build.gradle`, package.json files, webOS `appinfo.json`; `python3 scripts/verify_version.py` checks consistency)
5. `python3 scripts/pre_push_check.py`
6. Commit (`fix: …`, `feat: …`, whatever — just say what changed)

**Version bump (releases):**

| Source of truth | Synced / checked by |
|-----------------|---------------------|
| `spinstage-webui/VERSION` | Canonical semver |
| `spinstage-android/android/app/build.gradle` | `versionName` + `versionCode` (formula in `scripts/version_utils.py`) |
| `spinstage-android/package.json`, `spinstage-webos/package.json`, `spinstage-webos/appinfo.json` | Same semver as `VERSION` |
| Platform trees (`www/`, webOS app/) | `python3 scripts/sync_public_platforms.py` |

### Don't commit secrets

Already gitignored — keep it that way:

- `**/config/user-settings.json`
- `android/local.properties`
- tokens, `.env`, etc.

Run `python3 scripts/pre_push_check.py` before push.

### Touch carefully

- **`sendspin-lib.js`** — upstream Sendspin client; mention in issue/PR if you patch it
- **Android-only CSS:** `scripts/sync-assets/platform-android.css`
- **webOS TV CSS:** `spinstage-webui/styles/platform-webos.css`

### Release checklist

- [ ] Only edited webui (+ android sync CSS if needed)
- [ ] Ran sync; nothing important left unstaged
- [ ] Version bumped (if release)
- [ ] `pre_push_check.py` clean
- [ ] Smoked browser (and TV/phone if relevant) — see [SMOKE.md](SMOKE.md)

### Bugs

Open an issue: platform, SpinStage version, MA version if relevant, steps to repro.

Scripts live in **`scripts/`** (sync, pre-push check, user-settings helpers). Optional JS parse check: `python3 scripts/verify_webui_js.py` (needs Node 18+).

---

## Credits & related projects

SpinStage evolved from the webOS-focused [sendspin-cinema-webos](https://github.com/zonya/sendspin-cinema-webos) player (thanks zonya). It grew into a shared modular web UI (`spinstage-webui/`) with synced Android and webOS shells.

Other unofficial Music Assistant clients worth knowing about:

- [Ensemble](https://github.com/CollotsSpot/Ensemble) — Android client for Music Assistant, pairs well with SpinStage as a remote control.

## License & third-party

SpinStage's own code is [MIT](LICENSE).

Not all of this repo is from scratch:

| What | Where | License / terms |
|------|--------|-----------------|
| Sendspin client | `spinstage-webui/sendspin-lib.js` | [MIT](https://github.com/music-assistant/sendspin/blob/main/LICENSE) (Music Assistant / Sendspin project) |
| Material Color Utilities (album art accents) | `spinstage-webui/app/vendor/material-color-utilities/` | Apache-2.0 |
| Lucide icons | `spinstage-webui/icons/*.svg` (most UI chrome) | [MIT](https://github.com/lucide-icons/lucide/blob/main/LICENSE) — see `icons/ICON_SOURCES.txt` |
| Tabler icons | `spinstage-webui/icons/*.svg` (where noted) | [MIT](https://github.com/tabler/tabler-icons/blob/main/LICENSE) |
| MA genre icons | `spinstage-webui/icons/genres/` | Shipped with [Music Assistant](https://github.com/music-assistant/server); redistributed here for browse UI parity only — not SpinStage-owned artwork |
| Provider logos | `spinstage-webui/icons/providers/` | From MA Docker image / provider assets; third-party trademarks — display only, no ownership claim |
| Capacitor (Android shell) | `spinstage-android/package.json` | MIT |
| ares-cli (webOS packaging) | dev dep in `spinstage-webos/package.json` | Apache-2.0 |

Music Assistant, Sendspin, streaming providers, and icon sets remain separate projects with their own terms.