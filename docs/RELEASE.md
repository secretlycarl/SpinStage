# Creating GitHub Releases

SpinStage ships four download artifacts per version:

| File | Platform |
|------|----------|
| `spinstage-webui-<version>.zip` | Browser / PC |
| `spinstage-<version>.apk` | Android (sideload) |
| `com.spinstage_<version>_all.ipk` | LG webOS TV |
| `spinstage-tizen-<version>-beta.zip` | Samsung Tizen TV (**beta** — build & sign locally) |

Tizen has no CI-built `.wgt` (signing is per-developer/TV). The beta zip is source you build on Windows; optional `--wgt` if you attach a signed package manually.

## One-time: Android signing (required for Release workflow)

Sideload APKs must be **signed** (not Play Store signing — any release key works).

### 1. Create a keystore (once, keep backup offline)

```bash
cd spinstage-android/android
keytool -genkey -v -keystore spinstage-release.keystore -alias spinstage \
  -keyalg RSA -keysize 2048 -validity 10000
cp keystore.properties.example keystore.properties
# Edit keystore.properties with your passwords
```

Test locally:

```bash
cd spinstage-android
npm run build:release
adb install -r dist/spinstage-<version>.apk
```

### 2. Add GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|--------|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 spinstage-android/android/spinstage-release.keystore` (Linux) or `base64 -i …` (macOS) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `spinstage` |
| `ANDROID_KEY_PASSWORD` | key password |

**Use the same keystore for every release** so users can upgrade without uninstalling.

---

## Cutting a release (automated)

1. Bump `spinstage-webui/VERSION`
2. Run sync and verify:
   ```bash
   python3 scripts/sync_public_platforms.py
   python3 scripts/verify_version.py
   python3 scripts/pre_push_check.py
   ```
3. Commit and push to `main`
4. Tag and push:
   ```bash
   git tag v0.9.9
   git push origin v0.9.9
   ```
5. GitHub Actions **Release** workflow builds browser, Android, and webOS artifacts and attaches the Tizen beta source zip to the GitHub Release.

Tag must match `VERSION` (with `v` prefix): `VERSION=0.9.9` → tag `v0.9.9`.

---

## Manual release (without Actions)

From the repository root:

```bash
VERSION="$(tr -d '\n' < spinstage-webui/VERSION)"
python3 scripts/sync_public_platforms.py

# Web UI zip + Tizen beta source zip (always)
python3 scripts/package_release.py --out release-artifacts

# Android (needs keystore.properties)
cd spinstage-android && npm run build:release && cd ..

# webOS (needs ares-cli: npm i -g @webosose/ares-cli)
cd spinstage-webos && npm run package && cd ..

python3 scripts/package_release.py --out release-artifacts \
  --apk spinstage-android/dist/spinstage_${VERSION}.apk \
  --ipk "spinstage-webos/com.spinstage_${VERSION}_all.ipk"

# Optional: attach a signed WGT you built on Windows
# python3 scripts/package_release.py --out release-artifacts --wgt spinstage-tizen-beta/.buildResult/SpinStage.wgt
```

Upload everything in `release-artifacts/` to a new GitHub Release.

---

## After release

- Add screenshots to `docs/screenshots/` and README
- Attach demo video link in release notes
- For testing builds before `1.0.0`, use semver like `0.9.x` tags
