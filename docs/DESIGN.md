# Tenfold design rules

What makes an app feel crafted instead of generated is behaviour, restraint, and a visual language that
gets out of the footage's way. Tokens live in `src/design/tokens.ts`; these rules decide how screens use them.

## 0. Look ("light shell, dark editor", red-orange signature)

Modelled on top-grossing apps' onboarding and paywalls: bright, calm, real footage up front, one owned colour.

- **Two palettes, same keys** (`light`, `dark` in tokens). Light: onboarding, paywall, Create, Cuts, You,
  import, batch setup and results, and the sheets reached from them. Dark (like Photos' editor): editor,
  export, record, full-screen video, and the caption sheets when opened from the editor. The root stack
  picks a route's palette (`schemeForRoute` in `src/design/theme.tsx`) and puts it in context; shared
  components read it with `useTheme()` / `useScheme()`. Screens that are always one theme import `light`
  or `dark` directly. Never hard-code a hex in a screen.
- **Light surfaces:** warm off-white page (`bg` #F5F4F2), white raised surfaces (`card`), a warm neutral fill
  for controls (`cardHigh` #ECEAE7). Grouped rows are white on the page, like iOS Settings. Near-black type
  (#111111), two text greys that both meet AA, and a glyph-only grey (`glyph`) for chevrons, empty radios
  and strike-throughs, never for text.
- **Dark surfaces:** near-black (#0B0B0C), graphite surfaces (#161617), off-white type.
- **Signature colour:** red-orange. `brand.gradient` (#FF3D2E → #FF7A33) is the primary button only.
  `brand.primary` (#FF4A2E) marks the one most important thing on a screen: the chosen answer or plan
  (a ring and a filled check), progress, the playhead, the Payoff number, switch tint. Small brand-coloured
  text uses `accentText` (darker on light, for AA). Never large brand fills, never two brand things
  competing on one screen.
- **Footage over everything:** real frames are the hero (the takes wall, sample frames, the looping demo).
  On light screens video tiles lift off the page with the soft shadow and 20 pt corners; the wall fades
  into the page colour (fade to `bgClear`, the page colour at zero alpha, never to transparent black).
  Anything drawn over footage (badges, rings, dims) is white on dark: `media` tokens, and `Thumb` and glass
  put their children in the dark palette.
- **Shadow:** one recipe (`shadows`, 0 8 24 warm black at 8%), `soft` for surfaces that lift (video tiles,
  plan-card-sized objects, pills) and `control` for small floating controls. Light screens only. A view
  can't both clip and cast a shadow on iOS: shadow on an outer wrapper, clipping inside.
- **Liquid Glass (iOS 26):** dark screens only, for chrome floating over the video (corner buttons,
  floating control groups) and for badges over thumbnails on any screen. Never on list content. Glass
  doesn't render under a parent that starts at opacity 0.
- **Buttons:** primary is the brand-gradient capsule with a white label (`GradientButton`). Secondary
  (`OutlineButton`) is a white capsule with the control shadow on light, a glass capsule on dark. Corner
  buttons (`IconButton`) are white circles with the control shadow on light, glass on dark.
- **Selection:** onboarding answers and plan cards are white rows; the chosen one gets a 2 pt brand ring
  and a filled brand check. Chips select to near-black with white text (neutral), so the brand stays for
  the one primary thing. Onboarding progress is a brand fill on a `track` (#E6E4E1) bar.
- **Type:** Instrument Sans for display, titles, buttons and big figures, tracked tight on large sizes;
  SF Pro for running and secondary text. Bundled caption faces (Poppins, TikTok Sans…) for captions only.
- **Corners:** three radii: 20 (`radii.card`: cards, grouped rows, big media), 12 (`tile`/`thumb`/`button`:
  small objects), and capsules. Continuous corners. Icons: SF Symbols, monochrome.
- **System chrome** is light (`userInterfaceStyle: "light"` + `Appearance.setColorScheme('light')`): tab
  bar, alerts, sheets, pickers. Dark screens pass `userInterfaceStyle: 'dark'` to their action sheets and
  alerts and `keyboardAppearance="dark"` to their inputs. The status bar follows each route's palette.
- **Tab bar:** the system tab bar (expo-router `NativeTabs`), light, tinted with the brand text tone.
- **Titles:** tab roots get a large left title; pushed and modal screens a small centred title between
  the corner buttons (`ScreenHeader`).

## 1. Hierarchy

- **One primary action per screen.** Only that action uses `GradientButton` (the brand gradient). Everything
  else is an `OutlineButton`, a plain text button, or a row. A screen with two gradients has no primary action.
- **The button says exactly what happens:** "Generate 5 videos", "Save to Photos", "Export 3 videos". Not
  "Continue" when something specific happens, never "Let's go!", no emoji.
- **Destructive actions** are red text in a native action sheet or context menu, never a gradient or a
  big red button.

## 2. Type

Six sizes (see `type` in tokens): 32 screen title (`display`, tracked −0.9), 20 section or sheet title (`title`),
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
- Cards: one radius (`radii.card`), no border. White on the warm page needs no shadow; only objects that
  lift (video tiles, pills, floating controls) get the one shadow recipe. Hairlines (`separator`) only
  between rows inside a group, inset to where the text starts.
- Haptics: selection tick for toggles and snaps, light impact for primary actions, success for exports.
  Nothing else.
