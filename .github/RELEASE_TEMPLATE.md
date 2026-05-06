<!--
  Axion Mobile — GitHub Release notes template.
  Copy this whole file into the release body when tagging a new version.
  Replace every {{ placeholder }} before publishing.
-->

# Axion Mobile {{ VERSION }}

A React Native (Expo) port of the Axion desktop music player, built for
phones. Offline-first, scans the device's audio library, plays in the
background with full lockscreen / notification controls.

> **Status:** {{ alpha / beta / stable }} — first public release.
> Companion to [Axion desktop](https://github.com/almostkoi/axion).

---

## Highlights

- **Offline-first** — scans the device's audio library via the OS media store; no internet required for playback.
- **Background playback** with full lockscreen / notification controls, headset and Bluetooth media keys (powered by `react-native-track-player`).
- **Native MediaSession** integration — your wear-OS / car-stereo / earbud controls just work.
- **UI** — dark theme matching the desktop app: Home, Library (Songs / Albums / Artists / Playlists), Search, Settings, Now Playing, Queue.
- **Persistent mini player** above the tab bar; tap to expand.
- **Library mirrors the desktop schema** so playlists and play counts can be ported across.
- **YouTube import** routed through Piped → Invidious → direct extraction, with live instance discovery.

## Downloads

| File | Notes |
|---|---|
| `Axion-{{ VERSION }}.apk` | Universal APK, side-loadable on any Android 8+ device |

> **Google Play / F-Droid:** {{ planned / not yet / N/A }}

## Installation (Android sideload)

1. Download `Axion-{{ VERSION }}.apk` to your phone (or transfer via USB / cloud).
2. Open it. Android will prompt to allow installs from your browser / file manager — accept.
3. After install, launch **Axion**. Grant the **Music & audio** permission so it can read your library.
4. The library scan starts automatically; tracks appear as they're parsed.

> **First-launch tip:** if no music shows up, make sure you granted the
> **Music & audio** (Android 13+) or **Storage** (Android 12 and below)
> permission. Toggle it in **Settings → Apps → Axion → Permissions**.

## Permissions explained

| Permission | Why |
|---|---|
| `READ_MEDIA_AUDIO` (Android 13+) / `READ_EXTERNAL_STORAGE` | Scan your music library — Axion never uploads it anywhere. |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Keep playback running with the screen off / app backgrounded. |
| `WAKE_LOCK` | Prevent the OS from killing the audio service mid-track. |

No network permissions are requested for core playback. Network is only used
when you trigger a YouTube import.

## What's new in {{ VERSION }}

<!--
  Use a bulleted list. Group as Added / Changed / Fixed.

  Example:

  ### Added
  - Synthwave app icon.
  - Invidious fallback when Piped is rate-limited.

  ### Changed
  - Piped instance list now fetched live from the public directory.

  ### Fixed
  - Spotify imports failed when "all proxies" appeared dead even though one
    was healthy.
-->

### Added
- {{ … }}

### Changed
- {{ … }}

### Fixed
- {{ … }}

## Known limitations

- URL imports require at least one healthy public Piped or Invidious instance. If everything is down, use the [desktop app](https://github.com/almostkoi/axion) to fetch and sync the resulting files to your phone.
- {{ e.g. iOS not yet released — sideloading via dev builds only }}
- {{ … }}

## System requirements

- **Android 8.0 (Oreo, API 26)** or newer
- ~100 MB free storage for the app
- Plus the size of your music library

## Verifying the APK (optional)

```powershell
# Windows
Get-FileHash .\Axion-{{ VERSION }}.apk -Algorithm SHA256
```

```bash
# macOS / Linux
sha256sum Axion-{{ VERSION }}.apk
```

Compare against the SHA-256 published in the release artifacts list.

## License

Axion Mobile is released under the **Axion Source-Available License v1.0**:

- Free for personal / non-commercial use, study, and modification.
- Public showcase (videos, streams, articles, derivative apps) requires
  visible credit: **Axion** by **almostkoi**, link to the source.
- **Commercial use is not permitted** without a separate written license.
  Contact `koi@shusui.dev`.

Full text: [`LICENSE`](https://github.com/almostkoi/axion-mobile/blob/main/LICENSE)

## Reporting issues

Open an issue with:

- Axion Mobile version (Settings → About)
- Phone model + Android version
- Steps to reproduce
- Logs via `adb logcat *:S ReactNativeJS:V` if you can capture them

## Credits

Built by [almostkoi](https://github.com/almostkoi). Powered by Expo, React
Native, Expo Router, NativeWind, Zustand, react-native-track-player,
expo-sqlite, expo-media-library, lucide, and a long list of open-source
dependencies.
