import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, radii, spacing } from '@/design/tokens';

/** What every generated video gets, in plain words. Shown right after the first screen. */
const INCLUDED: { icon: SFSymbol; title: string; body: string }[] = [
  { icon: 'waveform.path', title: 'Removes dead silences', body: 'The pauses and dead air between sentences are cut.' },
  { icon: 'text.badge.xmark', title: 'Cuts filler words', body: '“Um”, “uh”, “like” and “you know”, gone.' },
  { icon: 'arrow.uturn.backward', title: 'Drops retakes', body: 'Repeat a line and it keeps your best take.' },
  { icon: 'captions.bubble', title: 'Adds captions', body: 'Word by word, synced to your voice, in 12 styles.' },
  { icon: 'rectangle.portrait', title: 'Frames for vertical', body: '9:16 for TikTok, Reels and Shorts, with a zoom at each cut.' },
  { icon: 'square.stack.3d.up', title: 'Ten at a time', body: 'Edit a whole batch at once and save them all to Photos.' },
];

export function Included() {
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <AppText variant="display" accessibilityRole="header">
          What Tenfold does for you
        </AppText>
        <AppText variant="body" color={colors.textSecondary}>
          Every video, automatically. You just film.
        </AppText>
      </View>
      <View style={styles.list}>
        {INCLUDED.map((f) => (
          <View key={f.title} style={styles.row} accessible accessibilityLabel={`${f.title}. ${f.body}`}>
            <View style={styles.icon}>
              <SymbolView name={f.icon} size={18} tintColor={colors.accent} weight="semibold" />
            </View>
            <View style={styles.text}>
              <AppText variant="bodyStrong">{f.title}</AppText>
              <AppText variant="label" color={colors.textSecondary}>
                {f.body}
              </AppText>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, gap: spacing.xl },
  head: { gap: spacing.sm },
  list: { gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,176,32,0.12)',
  },
  text: { flex: 1, gap: 2 },
});
