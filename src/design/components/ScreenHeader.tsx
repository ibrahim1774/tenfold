import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../tokens';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

export type ScreenHeaderProps = {
  title?: string;
  back?: boolean;
  right?: ReactNode;
  onBack?: () => void;
};

/** Outlined back circle, left-aligned title, optional right actions ("< Video Editor   Export ⋮"). */
export function ScreenHeader({ title, back = true, right, onBack }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      {back && <IconButton icon="chevron.left" label="Back" size={44} tone="ghost" iconScale={0.45} onPress={onBack ?? (() => router.back())} />}
      <AppText variant="title" style={styles.title} numberOfLines={1}>
        {title}
      </AppText>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52 },
  title: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
