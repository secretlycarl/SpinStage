# Android install

Two build paths:

| Goal | Command | Output |
|------|---------|--------|
| **Local dev / testing** | `npm run build:debug` | `app-debug.apk` |
| **Release / GitHub / sharing** | `npm run build:release` | `dist/spinstage-<version>.apk` (signed) |

Debug APKs are fine on your own device while iterating. **Don't upload debug builds to GitHub Releases** — use a release build instead (smaller, optimized, and signed with your release key so updates stay consistent).

## You need

| Thing | Notes |
|-------|--------|
| Node.js 18+ | Capacitor |
| JDK 17+ | Not Java 8 — check `java -version` |
| Android SDK | Android Studio once so it downloads |
| adb | USB debugging on device |

`npm run build:debug` runs Java/SDK checks and writes `local.properties` if SDK is in the default spot.

### If build complains about paths

**Linux/macOS:**

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export JAVA_HOME="/path/to/jdk-17"
```

**Windows PowerShell:**

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

Or `android/local.properties`:

```properties
sdk.dir=/home/you/Android/Sdk
```

(Forward slashes on Windows: `C:/Users/you/AppData/Local/Android/Sdk`.)

## MA side

Sendspin on, MA user/pass, player name matching what you'll enter. Unhide player in MA if needed. Remote: [../REMOTE-ACCESS.md](../REMOTE-ACCESS.md).

## Build

```bash
cd spinstage-android
npm install
npm run build:debug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

Same thing: `./build.sh`

## Release builds {#release-builds}

Release APKs must be signed before they install on devices. The repo supports an optional `android/keystore.properties` (gitignored):

```bash
cd spinstage-android/android
cp keystore.properties.example keystore.properties
# Edit paths/passwords. Create keystore once if needed:
keytool -genkey -v -keystore spinstage-release.keystore -alias spinstage \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then from `spinstage-android/`:

```bash
npm run build:release
```

APK (versioned, same names as GitHub Releases):

- `dist/spinstage-<version>.apk`
- `android/app/build/outputs/apk/release/spinstage-<version>.apk`

Gradle also writes `app-release.apk` in that folder; use the `spinstage-*` copy for sideloading and uploads.

Keystore path: put `spinstage-release.keystore` in **`android/`** (same folder as `keystore.properties`), not `android/app/`.

Keep the keystore and passwords **offline** — same key for every release so users can upgrade in place. GitHub Actions can sign with encrypted secrets later if you automate releases.

Without `keystore.properties`, `build:release` still runs but the APK may be unsigned or unsuitable for distribution; use `build:debug` for local testing only.

**GitHub Releases:** signed release APKs require `keystore.properties` locally and [GitHub Actions secrets](../docs/RELEASE.md) for automated releases.

## Install

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## First launch

Connect screen — server, player name, MA username, password. No API token to hunt down; app logs in for you.

## Skip setup in the APK

After npm deps change, run `npm install && npm run sync` so native plugins (keystore etc.) register.

```bash
cp config/user-settings.json.example config/user-settings.json
python3 scripts/configure_defaults.py
npm run build:debug
```

Build copies json into `www/config/` before `cap sync`.

One-off without a file:

```bash
export SPINSTAGE_SERVER=192.168.1.100
export SPINSTAGE_PLAYER="My Phone"
export SPINSTAGE_USERNAME="admin"
export SPINSTAGE_PASSWORD="your-password"
npm run build:debug
```

## When it breaks

| Issue | Fix |
|-------|-----|
| SDK not found | `ANDROID_HOME` or `local.properties` |
| Gradle/Java | JDK 17 |
| Player not found | Exact name in MA |
| Sign-in failed | MA creds + MA URL not HA URL |
| No audio remote | Cloudflare `/sendspin*` — [REMOTE-ACCESS.md](../REMOTE-ACCESS.md) ([README](../README.md#remote-access)) |
