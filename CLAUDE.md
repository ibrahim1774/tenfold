@AGENTS.md

## Tenfold

- Product, architecture, design system and milestones: `docs/SPEC.md` (source of truth). Build in milestone order and obey its "Do not" list.
- Design rules: `docs/DESIGN.md` (one primary action per screen, six-size type scale, factual copy, motion only for state changes, native patterns). Follow it for every screen.
- Visual reference: `docs/design-reference-v2.png`, dark cinematic theme (local only, gitignored: third-party mockup). The old pastel `docs/design-reference.png` is superseded. Tokens live in `src/design/tokens.ts`; see SPEC §5.1.
- Routes live in `src/app/` (SDK 57 template convention) rather than the spec's top-level `app/`.
- Native engine: local Expo Module at `modules/tenfold-engine` (Swift). All heavy work goes there; no network calls for processing.
- Bundle id `com.ibrahim.tenfold`, EAS slug `tenfold-editor`, EAS project id in `app.json`.
- Current milestone: M0 (scaffold, static screens with mock data from `src/mock/data.ts`). Onboarding and settings persist via `expo-sqlite/kv-store` (`src/state/storage.ts`).
