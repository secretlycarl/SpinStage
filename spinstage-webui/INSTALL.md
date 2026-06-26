# Web UI install

## 1. Music Assistant

1. Install [Music Assistant](https://music-assistant.io/) however you run it
2. Turn on the **Sendspin** player provider
3. MA username + password (Settings → Profile — set a password if you never did)
4. Create a **player** for this device (e.g. `Cinema Browser`):
   - Settings → Players → same name you'll type in SpinStage
   - Uncheck **Hide this player** if you don't see it

## 2. Network

**Same LAN:** server IP like `192.168.1.100`, ports 8927 (Sendspin) and 8095 (MA).

**Remote:** hostname like `music.example.com`, tunnel/proxy with MA + `/sendspin` — [../REMOTE-ACCESS.md](../REMOTE-ACCESS.md) (full guide in [README](../README.md#remote-access)). Set MA Base URL to your HTTPS URL.

## 3. Run it

```bash
cd spinstage-webui
./run.sh --open
```

Other options:

```bash
python3 server.py --host 0.0.0.0 --port 9728   # LAN can reach it
python3 server.py --open
```

**Security:** `server.py` listens on all interfaces by default and can serve `config/user-settings.json` to the LAN — see [README Security](../README.md#security) before exposing it.

## 4. Connect screen

One page:

1. **Server** — IP or hostname (MA Base URL from Settings → About)
2. **Player name** — must match MA
3. **Username** / **Password** — MA account

Signs in, stores a token, you're in. Settings → Setup to change later.

## Skip setup (optional)

```bash
cp config/user-settings.json.example config/user-settings.json
python3 scripts/configure_defaults.py
./run.sh --open
```

Don't commit `user-settings.json`.

## Troubleshooting

| Issue | Check |
|-------|--------|
| Player not found | Exact name; unhide in MA Players |
| Sign-in failed | MA URL not Home Assistant URL; user/pass |
| No audio | 8927 open; firewall |
| No album art | MA Base URL (especially remote) |
| Stuck connecting | Settings → Show Connection; look for `wss://…/sendspin` |

## What the app builds from your server entry

| You type | Sendspin uses |
|----------|----------------|
| `192.168.1.100` | `ws://192.168.1.100:8927/sendspin` |
| `music.example.com` | `wss://music.example.com/sendspin` |
