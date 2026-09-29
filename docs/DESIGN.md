# Tenfold design rules

What makes an app feel crafted instead of generated is behaviour, restraint, and a visual language that
gets out of the footage's way. Tokens live in `src/design/tokens.ts`; these rules decide how screens use them.

## 0. Look ("graphite")

- **Surfaces:** flat black (`bg`), two elevation steps (`bgRaised`, `card`, `cardHigh`). No ambient glows,
  no decorative gradients, no drop shadows. The video thumbnails are the only colour on screen.
- **Liquid Glass (iOS 26):** chrome that floats over content is glass (`GlassSurface`, `GlassCapsule`,
  `IconButton` default tone): top-corner circle buttons (back, close, more, +), floating control groups
  over the preview, badges over thumbnails. Never on ordinary list content. Glass doesn't render under a
  parent that starts at opacity 0, so no fade-in around it.
- **Type:** the iPhone's own font (SF Pro) for all interface text. Bundled faces (Poppins, TikTok Sans…)
  are for captions only.
- **Accent:** one colour (`accent`, amber) for progress, selection, the playhead and links. Never for
  large fills.
- **Primary button:** a solid white capsule with black text. Secondary: a glass capsule (`OutlineButton`).
- **Corners:** 12–14 pt (`radii`), continuous. Icons: SF Symbols, monochrome.
- **Tab bar:** the system tab bar (expo-router `NativeTabs`), which iOS 26 draws as Liquid Glass.
- **Titles:** tab roots get a large left title; pushed and modal screens a small centred title between
  glass corner buttons (`ScreenHeader`).

## 1. Hierarchy

- **One primary action per screen.** Only that action uses `GradientButton`. Everything else is an
  `OutlineButton`, a plain text button, or a row. A screen with two gradients has no primary action.
- **The button says exactly what happens:** "Generate 5 videos", "Save to Photos", "Export 3 videos". Not
  "Continue" when something specific happens, never "Let's go!", no emoji.
- **Destructive actions** are red text in a native action sheet or context menu, never a gradient or a
  big red button.

## 2. Type

Six sizes (see `type` in tokens): 30 screen title (`display`), 20 section or sheet title (`title`),
15 body (`body` / `bodyStrong`), 14 controls (`chip`), 13 secondary (`label`), 12 small print
(`caption`). Legacy names `hero`, `section`, `cta` alias onto these; don't use them in new code.

- Numbers that change in place (times, counts, sizes, percentages) use `<AppText tabular>`.
- One screen title per screen. Section headings are `title` (20), not bold body.
- Sentence case everywhere ("Filler words", not "Filler Words"). Uppercase only for tiny group labels.

## 3. Copy

- State facts with numbers: "Removed 14 s · 6 filler words · 3 pauses", not "AI magic applied ✨".
- No "AI", "magic", "smart", sparkles, or exclamation marks in UI copy. Tenfold is a tool, not a mascot.
- Empty states say what the screen is for and offer the one action that fills it.
- Errors say what happened and what to do next, inline where the problem is.
- At most one short line of supporting text per screen. No helper sentences, "How it works" lists or
  icon-in-a-circle feature rows: show the footage instead. Keep only text that prevents a mistake or is
  legally required (renewal terms, privacy disclosures).

## 4. Motion

Motion explains a change; it never decorates.

- **No entrance animations** on screens, lists or grids (no staggered `FadeInDown` cascades). Content is
  simply there.
- Animate only a *state change the user caused*: a sheet opening, a row being removed, a toggle, a
  selection moving, a frame changing shape. Use `LinearTransition.duration(motion.base)` for layout and
  `FadeIn.duration(motion.fast)` for content that appears because of a tap.
- Springs are critically damped (`motion.spring`): no bounce, no overshoot.
- Onboarding may animate its illustrations once, quickly (< 600 ms), never loop.
  One exception: the "What Tenfold does for you" demo (`src/onboarding/Included.tsx`) loops, and rests on
  its finished state under Reduce Motion.

## 5. Native patterns over custom ones

- **Menus and confirmations:** `ActionSheetIOS` (or a context menu), not `Alert.alert` with 3 buttons.
  A plain `Alert` is fine for a single yes/no with consequences.
- **Details and settings of one thing:** a form sheet route (`presentation: 'formSheet'`), not an alert
  full of text.
- **Editing text:** inline, where the text is. Not `Alert.prompt`.
- **Lists of settings:** grouped inset rows like iOS Settings (hairline dividers, chevrons only on rows
  that navigate).

## 6. Honest states

- **Loading:** skeleton shapes in the layout that's coming, not a lone spinner, when the layout is known.
- **Progress:** says what it's doing ("Transcribing 3 of 5") with a real number.
- **Disabled controls:** explain why nearby, or don't show them.

## 7. Details

- Minimum touch target 44 pt. Icons one weight (`regular`), sized to the text next to them.
- Cards: one radius (`radii.card`), no border, no drop shadows. Hairlines (`separator`) only between rows
  inside a group, inset to where the text starts.
- Haptics: selection tick for toggles and snaps, light impact for primary actions, success for exports.
  Nothing else.
