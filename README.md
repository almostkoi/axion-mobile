# Axion Mobile

A React Native (Expo) port of the [Axion desktop](../axion/) music player, built
for phones. Offline-first, scans the device's audio library, plays in the
background with full lockscreen / notification controls.

## Stack

| Concern        | Library                                         |
|----------------|--------------------------------------------------|
| Framework      | Expo SDK 51 + Expo Router (file-based routing)  |
| Language       | TypeScript (strict)                             |
| Styling        | NativeWind v4 (Tailwind for React Native)       |
| State          | Zustand                                         |
| Audio          | `react-native-track-player` (background, MediaSession) |
| Storage        | `expo-sqlite` (mirrors the desktop schema)      |
| Library scan   | `expo-media-library` (`READ_MEDIA_AUDIO`)       |
| Gestures       | `react-native-gesture-handler` + `react-native-reanimated` |
| Icons          | `lucide-react-native`                           |

## UI structure

```
Bottom tabs:        Home  Library  Search  Settings
Persistent overlay: MiniPlayer (above tabs)
Modals:             /player (Now Playing), /queue
Drilldowns:         /album/[id], /artist/[id], /playlist/[id]
```

### Mobile-specific UX choices

- Single-column drilldowns instead of multi-pane.
- Library tab uses a segmented control (Songs / Albums / Artists / Playlists)
  rather than a sidebar.
- Persistent mini-player above the tab bar; tap to expand.
- Long-press on a track triggers haptic feedback (action sheet WIP).
- No mini-player toggle (always shown); no tray; no multi-window.
- URL imports (yt-dlp/ffmpeg) intentionally **not** ported — there's no
  Android-friendly backend that meets the offline-first constraint. Use the
  desktop app to fetch from URLs, then sync the resulting files to your phone.

## Running

You will need:

- **Node 18 +** (you already have it for the desktop app).
- A physical Android phone with **Expo Go** installed, OR
- **Android Studio** + the SDK + an emulator AVD for a development build.

### First time setup

```powershell
# Install JS deps
pnpm install

# Start the Metro bundler. Scan the QR code in Expo Go on your phone.
pnpm start
```

> **Note**: `react-native-track-player` is a native module. It works when
> launched via `expo run:android` (a development build) but will warn under
> stock Expo Go since Expo Go doesn't bundle that native code. For a pure
> Expo-Go-friendly preview the basic UI still renders; playback requires a
> dev build. See "Dev builds" below.

### Dev build (real playback)

Required once you want to test playback / lockscreen controls. Requires the
Android SDK installed (Android Studio is the easiest way to get it).

```powershell
# Generates the android/ folder and runs Gradle.
pnpm android
```

The first build takes a few minutes (Gradle downloads + first compile). Later
builds are incremental and fast — you only need to re-run when you add a
native module.

### Cloud build (no Android Studio)

If you don't want to install Android Studio at all you can build APKs in the
cloud with EAS:

```powershell
pnpm dlx eas-cli login
pnpm dlx eas-cli build:configure
pnpm dlx eas-cli build --profile preview --platform android
```

EAS produces an installable APK URL; sideload it on your phone.

## Project layout

```
axion-mobile/
├── app.json                Expo config (icon, permissions, splash)
├── babel.config.js         NativeWind + Reanimated plugins
├── metro.config.js         Metro + NativeWind bridge
├── tailwind.config.js      Theme tokens + font stack
├── global.css              Tailwind base/components/utilities
├── tsconfig.json           Strict TS, expo/tsconfig.base
├── app/                    Expo Router routes (file-based)
│   ├── _layout.tsx         Root: gesture handler, splash, stack
│   ├── (tabs)/             Tab group
│   │   ├── _layout.tsx     Bottom tabs + persistent MiniPlayer
│   │   ├── index.tsx       Home
│   │   ├── library.tsx     Library (segmented)
│   │   ├── search.tsx      Search
│   │   └── settings.tsx    Settings
│   ├── player.tsx          Full-screen Now Playing (modal)
│   ├── queue.tsx           Queue (modal)
│   ├── album/[id].tsx      Album detail
│   ├── artist/[id].tsx     Artist detail
│   └── playlist/[id].tsx   Playlist detail
├── components/             Pure UI building blocks
├── hooks/                  Domain hooks (useLibrary, usePlayback, …)
├── lib/                    Platform integrations (db, scanner, audioService)
├── store/useStore.ts       Zustand store
└── types/domain.ts         Shared domain types (mirrors desktop)
```

## Permissions

Requested at first scan:

- `READ_MEDIA_AUDIO` (Android 13 +)
- `READ_EXTERNAL_STORAGE` (Android ≤ 12)

Background playback uses `FOREGROUND_SERVICE_MEDIA_PLAYBACK` per Android 14
requirements; `react-native-track-player` declares this for you.

## Differences from the desktop app

| Feature            | Desktop | Mobile |
|--------------------|---------|--------|
| Scan watched folders | ✅      | ✅ (whole device library) |
| Local playback      | ✅      | ✅ |
| Queue / shuffle / repeat | ✅ | ✅ |
| Liked playlist      | ✅      | ✅ |
| User playlists      | ✅      | ✅ (basic; reorder & delete WIP) |
| URL import (yt-dlp / ffmpeg) | ✅ | ❌ desktop only |
| Statistics page     | ✅      | ❌ next milestone |
| Equalizer           | ✅      | ❌ next milestone |
| Mini-player toggle  | ✅      | n/a (always docked) |
| Tray / global hotkeys | ✅    | n/a |
| Lockscreen / notification | ❌ | ✅ via `react-native-track-player` |
| Headset / Bluetooth controls | ❌ | ✅ via `react-native-track-player` |

## Scripts

```bash
pnpm start          # Metro bundler + QR
pnpm android        # Build & launch dev client on connected device/emulator
pnpm prebuild       # Generate native android/ folder
pnpm tsc            # Type-check (no emit)
pnpm lint           # Expo lint
```
