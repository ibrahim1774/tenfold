import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { colors, motion, spacing } from '../tokens';
import { AppText } from './AppText';
import { Card } from './Card';
import { IconButton } from './IconButton';

export type CollapsibleSectionProps = {
  title: string;
  summary?: string;
  initiallyOpen?: boolean;
  children: ReactNode;
};

export function CollapsibleSection({ title, summary, initiallyOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <Animated.View layout={LinearTransition.duration(motion.base)}>
      <Card>
        <View style={styles.header}>
          <View style={styles.titles}>
            <AppText variant="bodyStrong">{title}</AppText>
            {!open && summary ? (
              <AppText variant="label" color={colors.textMuted} numberOfLines={1}>
                {summary}
              </AppText>
            ) : null}
          </View>
          <IconButton
            icon={open ? 'chevron.up' : 'chevron.down'}
            label={open ? `Collapse ${title}` : `Expand ${title}`}
            size={36}
            onPress={() => setOpen((o) => !o)}
          />
        </View>
        {open && (
          <Animated.View entering={FadeIn.duration(motion.fast)} exiting={FadeOut.duration(120)} style={styles.body}>
            {children}
          </Animated.View>
        )}
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  titles: { flex: 1, gap: 2 },
  body: { marginTop: spacing.lg, gap: spacing.md },
});
