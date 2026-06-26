# webOS install

## 1. Music Assistant

Sendspin on. MA username/password. Player name in MA (unhide if needed).

## 2. TV Developer Mode

1. **Developer Mode** app from LG Content Store
2. Turn on **Dev Mode Status** + **Key Server**
3. Note TV IP and passphrase

## 3. ares-cli on your PC

```bash
npm install -g @webosose/ares-cli
```

Pair the TV:

```bash
ares-setup-device
# IP: <TV IP>, port 9922, user prisoner

ares-novacom --device my-tv --getkey
# passphrase from TV
```

Don't want CLI? [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) can install the `.ipk` too — still need Developer Mode on the TV.

## 4. Build the ipk

```bash
npm run package
# or ./build.sh
```

Runs inject for `user-settings.json` if you have one, then `ares-package --no-minify`.

Output: `com.spinstage_<version>_all.ipk` (version from `appinfo.json`).

### Pre-fill setup (worth it for a living-room TV)

```bash
cp config/user-settings.json.example config/user-settings.json
python3 scripts/configure_defaults.py
npm run package
```

## 5. Install

**Option A — CLI**

```bash
ares-install --device my-tv com.spinstage_<version>_all.ipk
```

Use the filename from `npm run package` (matches `appinfo.json` / `spinstage-webui/VERSION`).

**Option B — [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop)**

Pair the TV (same Developer Mode setup as above), then drag/drop the `.ipk` onto the app.

## 6. First launch

If you didn't pre-fill: Connect screen — server, player, MA user/pass. Settings → Setup later.

Player hidden in MA? Settings → Players → uncheck **Hide this player in the user interface**.

## Remote

[../REMOTE-ACCESS.md](../REMOTE-ACCESS.md) — need `/sendspin*` → 8927 and main host → 8095. Full guide: [README](../README.md#remote-access).

## Updates

1. Bump `appinfo.json` version if you want
2. `npm run package`
3. `ares-install ...` or Dev Manager again

## Troubleshooting

| Issue | Check |
|-------|--------|
| Install rejected | Dev Mode on; did getkey |
| Can't connect | 8927/8095; tunnel paths for remote |
| No album art | MA Base URL = public HTTPS URL |
| Sign-in failed | MA creds; MA URL not HA URL |
