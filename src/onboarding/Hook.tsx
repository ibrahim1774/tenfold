import { StyleSheet, View } from 'react-native';

import { AppText, Thumb } from '@/design/components';
import { colors, spacing } from '@/design/tokens';

/**
 * First screen: a raw take full-bleed, the promise underneath.
 * TODO: when assets/sample/sample.mp4 ships, add its poster (assets/sample/poster.jpg) and pass it as `uri`.
 */
export function Hook() {
  return (
    <View style={styles.flex}>
      <Thumb seed={3} style={styles.poster} />
      <View style={styles.text}>
        <AppText variant="display" accessibilityRole="header">
          Film ten. Post ten.
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
  poster: { flex: 1, justifyContent: 'flex-start' },
  text: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xl, gap: spacing.md },
});
