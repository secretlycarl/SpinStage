# Samsung Tizen TV (beta)

**Experimental.** SpinStage on Samsung Tizen is a beta port — setup is more involved than webOS, and runtime behavior is less stable (audio/visual quirks on some models). For a living-room TV, an **Android TV stick/box + the SpinStage APK** is the easier path unless you already use Tizen dev tooling.

This guide covers **sideloading your own signed build** on a developer-mode TV. There is no Samsung app-store release.

## What you need

| Item | Notes |
|------|--------|
| **Samsung TV** | Same LAN as your PC. Note its **IP address**. |
| **Windows PC** | Build/sign/install flow is documented for Windows + Tizen Studio (macOS/Linux possible but less common). Note your PC’s IP if the TV asks to allow a host. |
| **Music Assistant** | Same as other platforms — MA running, Sendspin on, MA login. See [README](../README.md#before-you-start-all-platforms). |

Official references (read these if anything drifts):

- [Samsung Developer](https://developer.samsung.com/) — account + docs hub  
- [TV device / Developer Mode](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html)  
- [Certificate Manager](https://developer.tizen.org/development/training/web-application/application-security-process/certificate-manager) (Tizen docs)

---

## 1. Samsung Developer account

1. Go to [developer.samsung.com](https://developer.samsung.com/) and sign in with your **regular Samsung account** (same one as on the TV is fine).  
2. Complete developer registration if prompted (accept terms — no separate paid account required for sideload/dev certs).

---

## 2. Enable Developer Mode on the TV

Follow Samsung’s current steps: [Using the TV device](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).

Typical flow on recent TVs:

1. Open the **Apps** screen on the TV.  
2. Enter **12345** on the remote (or install/open the **Developer Mode** app if your model uses that).  
3. Turn **Developer mode** on; set the **host PC IP** when asked.  
4. **Restart the TV** when prompted.  
5. After reboot, note:
   - **TV IP** (Settings → Network, or Developer Mode screen)  
   - **Device ID / DUID** (Developer Mode — needed for certificates and `tizen install -t …`)

Developer Mode also shows a **10-digit code** when pairing certificates — you’ll use that in Certificate Manager.

---

## 3. Install Tizen Studio + SDK

On your Windows PC:

1. **Tizen Studio** (IDE + CLI):  
   [tizen-studio_6.1 installer](https://download.tizen.org/sdk/Installer/tizen-studio_6.1/)

2. **Tizen SDK** (platform packages / CLI tools):  
   [tizen-sdk_10.0 installer](https://download.tizen.org/sdk/Installer/tizen-sdk_10.0/)

3. Run **Package Manager** (from Tizen Studio) and install at least:
   - **TV Extensions** (Samsung TV)  
   - **Web CLI**  
   - **Certificate Manager** extension  

4. Add Tizen CLI to your PATH, or note paths (defaults below):
   - `C:\tizen-studio\tools\ide\bin\tizen.bat`  
   - `C:\tizen-studio\tools\sdb.exe`

---

## 4. Create a signing certificate

Use **Tizen Studio → Tools → Certificate Manager** (or the standalone Certificate Manager).

1. **+** → **Samsung** → **TV** → create a **new profile** (e.g. `spinstage` — name is yours; match it in build commands).  
2. **Author certificate** — sign in with the **same Samsung account** as developer.samsung.com. Use a **password you’ll remember**; Certificate Manager stores it for future builds.  
3. **Distributor certificate** — for sideloading, use the **Samsung TV** / developer distributor flow (not public store). When asked for the TV, enter the **10-digit Developer Mode code** from the TV so the cert is bound to your device.  
4. Finish the wizard. You should see profile **`spinstage`** (or whatever you named it) with a valid author + distributor cert.

If install later fails with certificate errors, re-open Certificate Manager and confirm the TV device is registered on the distributor cert.

---

## 5. Get the project

**From a GitHub Release:** download `spinstage-tizen-<version>-beta.zip`, unzip.

**From git:**

```bash
git clone https://github.com/secretlycarl/SpinStage.git
cd SpinStage/spinstage-tizen
```

Optional — skip Connect on first launch:

```bash
cp config/user-settings.json.example config/user-settings.json
# edit server, player, username, password
python scripts/configure_defaults.py   # or python3
```

---

## 6. Build, sign, and install

### Option A — PowerShell helper (repo)

```powershell
cd C:\path\to\spinstage-tizen
.\build.ps1
```

Uses cert profile `spinstage` by default. Override:

```powershell
$env:TIZEN_CERT_PROFILE = "your_profile_name"
$env:TIZEN_CLI = "C:\tizen-studio\tools\ide\bin\tizen.bat"
.\build.ps1
```

Signed output: `.buildResult\SpinStage.wgt`

### Option B — Example batch script

Copy `build-install.example.bat` → `build-install.bat`, fill in placeholders, run from `cmd`.

### Manual commands

Replace paths, profile name, TV IP, and device ID with yours.

```powershell
cd C:\path\to\spinstage-tizen

& "C:\tizen-studio\tools\ide\bin\tizen.bat" build-web -- "C:\path\to\spinstage-tizen"

& "C:\tizen-studio\tools\ide\bin\tizen.bat" package `
  -t wgt `
  -s spinstage `
  -- "C:\path\to\spinstage-tizen\.buildResult"
```

Connect to the TV (default SDB port **26101**):

```powershell
cd C:\tizen-studio\tools
.\sdb.exe connect 192.168.1.187:26101
.\sdb.exe devices
```

Use the device name from `sdb devices` as `-t` (often looks like a model or serial, e.g. `UN58CU7000FXZA`):

```powershell
& "C:\tizen-studio\tools\ide\bin\tizen.bat" install `
  -n "C:\path\to\spinstage-tizen\.buildResult\SpinStage.wgt" `
  -t YOUR_DEVICE_ID_FROM_SDB_DEVICES
```

**Notes:**

- `build-web` target is the **project folder**, not `.buildResult`.  
- `package` target is **`.buildResult`** after `build-web`.  
- Do **not** pass `-o` to `tizen package` — output stays in `.buildResult`.  
- App ID on device: **`spinstage0.SpinStage`**.

---

## 7. First launch

Open **SpinStage** on the TV. If you didn’t pre-fill `config/user-settings.json`, use **Connect** (MA server, player name, username, password).

If the player is hidden in MA: **Settings → Players** → unhide the SpinStage player.

Remote: **Back** exits the app on Tizen.

---

## Updates

1. Pull or download a newer `spinstage-tizen-<version>-beta.zip`.  
2. Re-run `build.ps1` (or manual build + package).  
3. `tizen install …` again (overwrites same app id).

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| `Specify location of the working directory` | Pass a real absolute path to `build-web` / `package`; use `.buildResult` only for `package`. |
| `package` / signing fails | Cert profile name matches `-s`; Certificate Manager profile complete; TV 10-digit code added to distributor cert. |
| `sdb connect` fails | TV Developer Mode on; PC IP allowed on TV; same subnet; try reboot TV. |
| `install` rejected | Run `sdb devices`; use exact `-t` name; WGT signed with profile that includes this TV. |
| No audio / slow start | Known beta issues — exit/reopen app; confirm MA/Sendspin reachable on LAN. |
| Can’t debug | `sdb shell 0 debug spinstage0.SpinStage` then Chrome `chrome://inspect` (port forward if needed). |

Remote MA: [REMOTE-ACCESS.md](../REMOTE-ACCESS.md) and [README § Remote access](../README.md#remote-access).
