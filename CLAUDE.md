@AGENTS.md

## Tenfold

- Product, architecture, design system and milestones: `docs/SPEC.md` (source of truth). Build in milestone order and obey its "Do not" list.
- Design rules: `docs/DESIGN.md` (one primary action per screen, six-size type scale, factual copy, motion only for state changes, native patterns). Follow it for every screen.
- Visual theme: "graphite" (2026-09-26): flat black surfaces, SF Pro for interface text, one amber accent, solid white primary button, standard bottom tab bar. Tokens in `src/design/tokens.ts`. The earlier purple-glow reference (`docs/design-reference-v2.png`, gitignored) is superseded; SPEC §5.1 describes it and is out of date on colours/fonts.
- Routes live in `src/app/` (SDK 57 template convention) rather than the spec's top-level `app/`.
- Native engine: local Expo Module at `modules/tenfold-engine` (Swift). All heavy work goes there; no network calls for processing.
- Bundle id `com.ibrahim.tenfold`, EAS slug `tenfold-editor`, EAS project id in `app.json`.
- Current milestone: M0 (scaffold, static screens with mock data from `src/mock/data.ts`). Onboarding and settings persist via `expo-sqlite/kv-store` (`src/state/storage.ts`).
