import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText, GlassCapsule } from './components';
import { SAMPLE_FRAMES } from './sampleFrames';
import { themedStyles, useScheme, useTheme } from './theme';
import { brand, radii, shadows, spacing } from './tokens';

/**
 * A tilted wall of ten finished takes (the batch idea at a glance), laid out like a glossy photo spread:
 * each take lifts off the page on the soft shadow, and the wall dissolves into the page colour top and bottom.
 * Used by the first onboarding screen, the empty Create tab and the last onboarding step.
 * Frames are stills from Mixkit stock clips (free licence, see marketing/screenshots/FOOTAGE.md).
 */
const CUTS = [
  '0:52 → 0:37',
  '0:48 → 0:34',
  '1:04 → 0:47',
  '0:39 → 0:28',
  '0:41 → 0:30',
  '0:57 → 0:42',
  '1:12 → 0:51',
  '0:33 → 0:24',
  '0:45 → 0:33',
  '0:50 → 0:36',
];

// Three staggered columns: 4 + 3 + 3 takes.
const COLUMNS = [
  { offset: 0, items: [0, 3, 6, 9] },
  { offset: -64, items: [1, 4, 7] },
  { offset: -24, items: [2, 5, 8] },
];

export type TakesWallProps = {
  /** Pill at the bottom centre ("10 of 10 ready"), white with a brand dot; omit for none. */
  pill?: string;
  /** Before → after durations on each take. Glass, so off where the parent fades in from 0. */
  badges?: boolean;
  /** Frames drawn in place of the bundled ones (e.g. the user's own posters), repeated to fill ten. */
  sources?: (number | { uri: string })[];
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function TakesWall({ pill, badges = true, sources, label = 'Ten finished videos from one batch', style }: TakesWallProps) {
  const frames = sources && sources.length > 0 ? sources : SAMPLE_FRAMES;
  const theme = useTheme();
  const t = themed[useScheme()];
  return (
    <View style={[styles.wall, { backgroundColor: theme.bg }, style]} accessible accessibilityLabel={label} accessibilityRole="image">
      <View style={styles.tilt}>
        {COLUMNS.map((col, c) => (
          <View key={c} style={[styles.column, { marginTop: col.offset }]}>
            {col.items.map((i) => (
              // Shadow on the outer view, clipping on the inner one (iOS can't do both on one view).
              <View key={i} style={t.tileShadow}>
                <View style={t.tile}>
                  <Image source={frames[i % frames.length]} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
                  {badges && (
                    <GlassCapsule variant="clear" pointerEvents="none" style={styles.badge}>
                      <AppText variant="caption" tabular>
                        {CUTS[i]}
                      </AppText>
                    </GlassCapsule>
                  )}
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
      {/* Fades to the page colour at zero alpha, so the blend never passes through grey. */}
      <LinearGradient colors={[theme.bg, theme.bgClear]} style={styles.fadeTop} pointerEvents="none" />
      <LinearGradient colors={[theme.bgClear, theme.bg]} style={styles.fadeBottom} pointerEvents="none" />
      {pill ? (
        <View pointerEvents="none" style={[styles.pill, t.pill]}>
          <View style={styles.dot} />
          <AppText variant="chip" tabular>
            {pill}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wall: { overflow: 'hidden' },
  tilt: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 36,
    transform: [{ rotate: '-7deg' }, { scale: 1.14 }],
  },
  column: { flex: 1, gap: 12 },
  badge: { position: 'absolute', left: 6, bottom: 6, minHeight: 22, paddingHorizontal: 8 },
  fadeTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 110 },
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 140 },
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: spacing.xl,
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.round,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: brand.primary },
});

const TILE_RADIUS = radii.card;

const themed = themedStyles((p) => ({
  tileShadow: { aspectRatio: 9 / 16, borderRadius: TILE_RADIUS, borderCurve: 'continuous', backgroundColor: p.card, ...shadows.soft },
  tile: { flex: 1, borderRadius: TILE_RADIUS, overflow: 'hidden', borderCurve: 'continuous', backgroundColor: p.cardHigh },
  pill: { backgroundColor: p.card, ...shadows.soft },
}));
