import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText, GlassCapsule } from './components';
import { SAMPLE_FRAMES } from './sampleFrames';
import { colors, spacing } from './tokens';

/**
 * A tilted wall of ten finished takes (the batch idea at a glance), dissolving into the black page.
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
  /** Glass capsule at the bottom centre ("10 of 10 ready"); omit for none. */
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
  return (
    <View style={[styles.wall, style]} accessible accessibilityLabel={label} accessibilityRole="image">
      <View style={styles.tilt}>
        {COLUMNS.map((col, c) => (
          <View key={c} style={[styles.column, { marginTop: col.offset }]}>
            {col.items.map((i) => (
              <View key={i} style={styles.tile}>
                <Image source={frames[i % frames.length]} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
                {badges && (
                  <GlassCapsule variant="clear" pointerEvents="none" style={styles.badge}>
                    <AppText variant="caption" tabular>
                      {CUTS[i]}
                    </AppText>
                  </GlassCapsule>
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
      <LinearGradient colors={[colors.bg, 'rgba(0,0,0,0)']} style={styles.fadeTop} pointerEvents="none" />
      <LinearGradient colors={['rgba(0,0,0,0)', colors.bg]} style={styles.fadeBottom} pointerEvents="none" />
      {pill ? (
        <GlassCapsule pointerEvents="none" style={styles.pill}>
          <AppText variant="chip" tabular>
            {pill}
          </AppText>
        </GlassCapsule>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wall: { overflow: 'hidden', backgroundColor: colors.bg },
  tilt: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 10,
    paddingTop: 36,
    transform: [{ rotate: '-7deg' }, { scale: 1.14 }],
  },
  column: { flex: 1, gap: 10 },
  tile: {
    aspectRatio: 9 / 16,
    borderRadius: 14,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  badge: { position: 'absolute', left: 6, bottom: 6, minHeight: 22, paddingHorizontal: 8 },
  fadeTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 110 },
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 140 },
  pill: { position: 'absolute', alignSelf: 'center', bottom: spacing.xl, paddingHorizontal: spacing.lg },
});
