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
};

/** Back circle, centred title, optional right action (reference screen 2 header). */
export function ScreenHeader({ title, back = true, right, onBack }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.side}>
        {back && <IconButton icon="chevron.left" label="Back" onPress={onBack ?? (() => router.back())} />}
      </View>
      <AppText variant="title" style={styles.title} numberOfLines={1}>
        {title}
      </AppText>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  side: {
    width: 96,
    flexDirection: 'row',
    gap: 8,
  },
  right: {
    justifyContent: 'flex-end',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
  },
});
