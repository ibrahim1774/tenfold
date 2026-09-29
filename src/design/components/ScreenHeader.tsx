import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

export type ScreenHeaderProps = {
  title?: string;
  back?: boolean;
  right?: ReactNode;
  onBack?: () => void;
  /** Replaces the back button with any leading control (e.g. a Close glass button). */
  left?: ReactNode;
};

/**
 * Navigation bar for pushed and modal screens, drawn the iOS 26 way: glass circle buttons in the
 * corners, a small centred title between them. Tab roots use a large left title instead.
 */
export function ScreenHeader({ title, back = true, right, onBack, left }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      {/* Centred on the screen, not between the sides, so it doesn't shift with the buttons. */}
      <View style={styles.titleWrap} pointerEvents="none">
        <AppText variant="bodyStrong" style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </AppText>
      </View>
      <View style={[styles.side, styles.leading]}>
        {left ??
          (back ? <IconButton icon="chevron.left" label="Back" onPress={onBack ?? (() => router.back())} /> : null)}
      </View>
      <View style={[styles.side, styles.trailing]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 44, flexShrink: 0 },
  leading: { justifyContent: 'flex-start' },
  trailing: { justifyContent: 'flex-end' },
  titleWrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', paddingHorizontal: 104 },
  title: { textAlign: 'center' },
});
