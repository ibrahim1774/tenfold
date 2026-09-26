import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { spacing } from '../tokens';
import { AppText } from './AppText';
import { GlassCard } from './GlassCard';
import { IconButton } from './IconButton';

export type CollapsibleSectionProps = {
  title: string;
  summary?: string;
  initiallyOpen?: boolean;
  children: ReactNode;
};

/** Glass card with a 22 pt header and a round chevron, like "Model / Style / Audio" in the reference. */
export function CollapsibleSection({ title, summary, initiallyOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <Animated.View layout={LinearTransition.springify().damping(18).stiffness(160)}>
      <GlassCard>
        <View style={styles.header}>
          <View style={styles.titles}>
            <AppText variant="section">{title}</AppText>
            {!open && summary ? (
              <AppText variant="caption" color="rgba(255,255,255,0.6)" numberOfLines={1}>
                {summary}
              </AppText>
            ) : null}
          </View>
          <IconButton
            icon={open ? 'chevron.up' : 'chevron.down'}
            label={open ? `Collapse ${title}` : `Expand ${title}`}
            onPress={() => setOpen((o) => !o)}
          />
        </View>
        {open && (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.body}>
            {children}
          </Animated.View>
        )}
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  body: {
    marginTop: spacing.xl,
    gap: spacing.lg,
  },
});
