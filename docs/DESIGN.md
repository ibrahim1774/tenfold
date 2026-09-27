# Tenfold design rules

What makes an app feel crafted instead of generated is behaviour, restraint, and a visual language that
gets out of the footage's way. Tokens live in `src/design/tokens.ts`; these rules decide how screens use them.

## 0. Look ("graphite")

- **Surfaces:** flat black (`bg`), two elevation steps (`bgRaised`, `card`, `cardHigh`). No ambient glows,
  no gradients, no blur, no drop shadows. The video thumbnails are the only colour on screen.
- **Type:** the iPhone's own font (SF Pro) for all interface text. Bundled faces (Poppins, TikTok Sans…)
  are for captions only.
- **Accent:** one colour (`accent`, amber) for progress, selection, the playhead and links. Never for
  large fills.
- **Primary button:** solid white with black text. Secondary: `cardHigh` fill, no border.
- **Corners:** 12–14 pt (`radii`). Icons: SF Symbols, regular weight, monochrome.
- **Tab bar:** standard opaque bottom bar, icon over a 10 pt label.

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

## 4. Motion

Motion explains a change; it never decorates.

- **No entrance animations** on screens, lists or grids (no staggered `FadeInDown` cascades). Content is
  simply there.
- Animate only a *state change the user caused*: a sheet opening, a row being removed, a toggle, a
  selection moving, a frame changing shape. Use `LinearTransition.duration(motion.base)` for layout and
  `FadeIn.duration(motion.fast)` for content that appears because of a tap.
- Springs are critically damped (`motion.spring`): no bounce, no overshoot.
- Onboarding may animate its illustrations once, quickly (< 600 ms), never loop.

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
- Cards: one radius (`radii.card`), hairline border, no drop shadows except the primary button.
- Haptics: selection tick for toggles and snaps, light impact for primary actions, success for exports.
  Nothing else.
