import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/components';
import { TakesWall } from '@/design/TakesWall';
import { spacing } from '@/design/tokens';

/** First screen: a wall of ten finished takes, the promise underneath. The footer carries the one line. */
export function Hook() {
  return (
    <View style={styles.flex}>
      <TakesWall pill="10 of 10 ready" style={styles.flex} />
      <View style={styles.text}>
        <AppText variant="display" accessibilityRole="header">
          Edited and post-ready in minutes.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  text: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg },
});
