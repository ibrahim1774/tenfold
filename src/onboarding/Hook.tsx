import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { AppText, GlassCapsule } from '@/design/components';
import { SAMPLE_FRAMES } from '@/design/sampleFrames';
import { colors, spacing } from '@/design/tokens';

/**
 * First screen: a wall of ten finished takes (the batch idea at a glance), the promise underneath.
 * Frames are stills from Mixkit stock clips (free licence, see marketing/screenshots/FOOTAGE.md).
 */
const TAKES = [
  { src: SAMPLE_FRAMES[0], cut: '0:52 → 0:37' },
  { src: SAMPLE_FRAMES[1], cut: '0:48 → 0:34' },
  { src: SAMPLE_FRAMES[2], cut: '1:04 → 0:47' },
  { src: SAMPLE_FRAMES[3], cut: '0:39 → 0:28' },
  { src: SAMPLE_FRAMES[4], cut: '0:41 → 0:30' },
  { src: SAMPLE_FRAMES[5], cut: '0:57 → 0:42' },
  { src: SAMPLE_FRAMES[6], cut: '1:12 → 0:51' },
  { src: SAMPLE_FRAMES[7], cut: '0:33 → 0:24' },
  { src: SAMPLE_FRAMES[8], cut: '0:45 → 0:33' },
  { src: SAMPLE_FRAMES[9], cut: '0:50 → 0:36' },
];

// Three staggered columns: 4 + 3 + 3 takes.
const COLUMNS = [
  { offset: 0, items: [0, 3, 6, 9] },
  { offset: -64, items: [1, 4, 7] },
  { offset: -24, items: [2, 5, 8] },
];

export function Hook() {
  return (
    <View style={styles.flex}>
      <View style={styles.wall} accessible accessibilityLabel="Ten finished videos from one batch" accessibilityRole="image">
        <View style={styles.tilt}>
          {COLUMNS.map((col, c) => (
            <View key={c} style={[styles.column, { marginTop: col.offset }]}>
              {col.items.map((i) => (
                <View key={i} style={styles.tile}>
                  <Image source={TAKES[i].src} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
                  <GlassCapsule variant="clear" pointerEvents="none" style={styles.badge}>
                    <AppText variant="caption" tabular>
                      {TAKES[i].cut}
                    </AppText>
                  </GlassCapsule>
                </View>
              ))}
            </View>
          ))}
        </View>
        {/* Edge fades so the wall dissolves into the black page. */}
        <LinearGradient colors={[colors.bg, 'rgba(0,0,0,0)']} style={styles.fadeTop} pointerEvents="none" />
        <LinearGradient colors={['rgba(0,0,0,0)', colors.bg]} style={styles.fadeBottom} pointerEvents="none" />
        <GlassCapsule pointerEvents="none" style={styles.pill}>
          <AppText variant="chip">10 of 10 ready</AppText>
        </GlassCapsule>
      </View>
      <View style={styles.text}>
        <AppText variant="display" accessibilityRole="header">
          Edited and post-ready in minutes.
        </AppText>
        <AppText variant="body" color={colors.textSecondary}>
          Tenfold cuts pauses, fillers and retakes, adds captions and frames for vertical. On your phone, nothing uploaded.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wall: { flex: 1, overflow: 'hidden', backgroundColor: colors.bg },
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
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 },
  pill: { position: 'absolute', alignSelf: 'center', bottom: spacing.xl, paddingHorizontal: spacing.lg },
  text: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xl, gap: spacing.md },
});
