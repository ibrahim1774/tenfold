# Tenfold

Batch AI video editor for iOS. Drop in 10 clips, get 10 finished videos: silences and filler words cut, jump cuts hidden with punch-in zooms, word-by-word captions, exported to Photos. Everything runs on device.

See [`docs/SPEC.md`](docs/SPEC.md) for the full build spec.

## Requirements

- macOS with **Xcode 26** (for local builds and the iOS Simulator)
- Node 20+
- An Expo account (`npx eas-cli@latest login`) and an Apple Developer account for device builds

Expo Go cannot run Tenfold because it contains native code. Use a development build.

## Run

```bash
npm install

# Simulator (needs Xcode)
npx expo run:ios

# Physical iPhone, built locally (needs Xcode, phone plugged in)
npx expo run:ios --device

# Physical iPhone, built in the cloud (no Xcode needed)
npx eas-cli@latest device:create          # register your iPhone once
npx eas-cli@latest build --profile development --platform ios
npx expo start                            # then open the installed Tenfold dev app
```

## Checks

```bash
npm run typecheck
npm run lint
npx expo-doctor
```

## Layout

- `src/app/` screens (expo-router)
- `src/design/` tokens and components (GlassCard, Chip, GradientButton, RoundTool, ...)
- `src/engine/` TypeScript types and wrapper for the native engine
- `src/state/` zustand stores, `src/captions/` caption presets, `src/mock/` M0 mock data
- `modules/tenfold-engine/` local Expo Module in Swift (AVFoundation, Core ML, Core Animation)
- `docs/` spec and design reference
