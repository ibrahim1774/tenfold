@AGENTS.md

## Tenfold

- Product, architecture, design system and milestones: `docs/SPEC.md` (source of truth). Build in milestone order and obey its "Do not" list.
- Design rules: `docs/DESIGN.md` (one primary action per screen, six-size type scale, factual copy, motion only for state changes, native patterns). Follow it for every screen.
- Visual theme: "light shell, dark editor" (2026-09-29): warm off-white light palette for onboarding, paywall, tabs, import and batch screens; near-black dark palette for editor, export and record; red-orange signature (`brand.gradient` #FF3D2E→#FF7A33 for the one primary button, `brand.primary` #FF4A2E for the one key accent per screen); Instrument Sans display + SF Pro body; one soft shadow recipe on light. Tokens (`light`, `dark`, `brand`, `media`, `shadows`) in `src/design/tokens.ts`, per-route palette context in `src/design/theme.tsx`, rules in `docs/DESIGN.md` §0. Graphite/amber and the purple-glow reference are superseded; SPEC §5.1 is out of date on colours/fonts.
- Routes live in `src/app/` (SDK 57 template convention) rather than the spec's top-level `app/`.
- Native engine: local Expo Module at `modules/tenfold-engine` (Swift). All heavy work goes there; no network calls for processing.
- Bundle id `com.ibrahim.tenfold`, EAS slug `tenfold-editor`, EAS project id in `app.json`.
- Current milestone: M0 (scaffold, static screens with mock data from `src/mock/data.ts`). Onboarding and settings persist via `expo-sqlite/kv-store` (`src/state/storage.ts`).
