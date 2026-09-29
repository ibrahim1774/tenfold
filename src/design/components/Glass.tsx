import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemeScope } from '../theme';
import { dark, radii } from '../tokens';

let available: boolean | undefined;

/**
 * Interactive glass (the iOS 26 press shimmer) on buttons. One switch, in case a device check shows
 * it getting in the way of taps.
 */
export const INTERACTIVE_GLASS = true;

/** True when iOS 26 Liquid Glass can be drawn (false in builds or runtimes without it). */
export function glassAvailable(): boolean {
  if (available === undefined) {
    try {
      available = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
    } catch {
      available = false;
    }
  }
  return available;
}

export type GlassSurfaceProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Interactive glass reacts to touches (shimmer, lift). Use it on controls, not on passive badges. */
  interactive?: boolean;
  /** 'regular' for controls, 'clear' for badges over bright footage where the image should show through. */
  variant?: 'regular' | 'clear';
  /** Optional tint (e.g. the white primary fill); omit for neutral glass. */
  tint?: string;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
};

/**
 * Liquid Glass surface for chrome that floats over content: top-corner buttons, floating control
 * groups and badges over footage. Never for ordinary list content (docs/DESIGN.md §0).
 *
 * Glass is always dark glass (it sits on footage), so its children draw in the dark palette whatever the
 * page theme: white text and glyphs. Falls back to a translucent dark fill with a hairline edge where
 * Liquid Glass isn't available. Glass doesn't render if the view (or a parent) starts at opacity 0, so
 * don't fade it in from 0.
 */
export function GlassSurface({ children, style, interactive, variant = 'regular', tint, pointerEvents }: GlassSurfaceProps) {
  if (glassAvailable()) {
    return (
      <GlassView
        glassEffectStyle={variant}
        isInteractive={INTERACTIVE_GLASS && interactive}
        tintColor={tint}
        colorScheme="dark"
        pointerEvents={pointerEvents}
        style={[styles.clip, style]}>
        <ThemeScope scheme="dark">{children}</ThemeScope>
      </GlassView>
    );
  }
  return (
    <View pointerEvents={pointerEvents} style={[styles.clip, styles.fallback, tint ? { backgroundColor: tint } : null, style]}>
      <ThemeScope scheme="dark">{children}</ThemeScope>
    </View>
  );
}

/** Capsule of glass for grouped floating controls ("10 of 10 ready", play controls, a duration badge). */
export function GlassCapsule({ children, style, ...rest }: GlassSurfaceProps) {
  return (
    <GlassSurface {...rest} style={[styles.capsule, style]}>
      {children}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', borderCurve: 'continuous' },
  fallback: {
    backgroundColor: dark.glassFallback,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: dark.borderStrong,
  },
  capsule: {
    borderRadius: radii.round,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 32,
  },
});
