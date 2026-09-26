@AGENTS.md

## Tenfold

- Product, architecture, design system and milestones: `docs/SPEC.md` (source of truth). Build in milestone order and obey its "Do not" list.
- Visual reference: `docs/design-reference.png` (local only, gitignored: third-party mockup). Tokens live in `src/design/tokens.ts`.
- Routes live in `src/app/` (SDK 57 template convention) rather than the spec's top-level `app/`.
- Native engine: local Expo Module at `modules/tenfold-engine` (Swift). All heavy work goes there; no network calls for processing.
- Bundle id `com.ibrahim.tenfold`, EAS slug `tenfold-editor`, EAS project id in `app.json`.
- Current milestone: M0 (scaffold, static screens with mock data from `src/mock/data.ts`).
