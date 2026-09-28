import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/components';
import { SAMPLE_FRAMES } from '@/design/sampleFrames';
import { colors, fonts, spacing } from '@/design/tokens';

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
                  <View style={styles.badge}>
                    <AppText variant="caption" style={styles.badgeText}>
                      {TAKES[i].cut}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
        <LinearGradient colors={[colors.bg, 'rgba(0,0,0,0)']} style={styles.fadeTop} pointerEvents="none" />
        <LinearGradient colors={['rgba(0,0,0,0)', colors.bg]} style={styles.fadeBottom} pointerEvents="none" />
        <View style={styles.pill} pointerEvents="none">
          <AppText variant="caption" style={styles.pillText}>
            10 of 10 ready
          </AppText>
        </View>
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
    backgroundColor: '#15161A',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  badge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
  fadeTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 110 },
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 },
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  pillText: { color: '#000000', fontFamily: fonts.semiBold },
  text: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xl, gap: spacing.md },
});
