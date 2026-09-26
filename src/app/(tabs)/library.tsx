import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, Chip, ChipGroup, GradientButton, useTabBarSpace } from '@/design/components';
import { colors, spacing } from '@/design/tokens';
import type { BatchStatus } from '@/engine/types';
import { BatchCard } from '@/library/BatchCard';
import { batchStatus, useLibrary } from '@/state/library';
import { router } from 'expo-router';

type Filter = 'all' | BatchStatus;

const FILTERS: { v: Filter; l: string }[] = [
  { v: 'all', l: 'All' },
  { v: 'setup', l: 'Not started' },
  { v: 'processing', l: 'Editing' },
  { v: 'ready', l: 'Ready' },
  { v: 'exported', l: 'Exported' },
];

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const [filter, setFilter] = useState<Filter>('all');
  const batchMap = useLibrary((s) => s.batches);
  const projects = useLibrary((s) => s.projects);
  const batches = useMemo(
    () =>
      Object.values(batchMap)
        .sort((a, b) => b.createdAt - a.createdAt)
        .filter((b) => filter === 'all' || batchStatus(b, projects) === filter),
    [batchMap, projects, filter],
  );

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: bottom }]}
        showsVerticalScrollIndicator={false}>
        <AppText variant="display">Library</AppText>
        <ChipGroup>
          {FILTERS.map((f) => (
            <Chip key={f.v} label={f.l} selected={filter === f.v} onPress={() => setFilter(f.v)} />
          ))}
        </ChipGroup>

        {batches.length === 0 ? (
          <View style={styles.empty}>
            <AppText variant="bodyStrong">Nothing here yet</AppText>
            <AppText variant="label" color={colors.textSecondary} style={styles.center}>
              Batches you edit show up here, newest first.
            </AppText>
            <GradientButton title="Edit a batch" onPress={() => router.push('/import')} style={styles.emptyBtn} />
          </View>
        ) : (
          <View style={styles.grid}>
            {Array.from({ length: Math.ceil(batches.length / 2) }).map((_, row) => (
              <Animated.View
                key={`${filter}-${row}`}
                entering={FadeInDown.delay(row * 50).duration(350)}
                layout={LinearTransition}
                style={styles.gridRow}>
                <BatchCard batch={batches[row * 2]} />
                {batches[row * 2 + 1] ? <BatchCard batch={batches[row * 2 + 1]} /> : <View style={styles.flex} />}
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, gap: spacing.lg },
  grid: { gap: spacing.md },
  gridRow: { flexDirection: 'row', gap: spacing.md },
  empty: { alignItems: 'center', gap: spacing.sm, marginTop: 60 },
  center: { textAlign: 'center' },
  emptyBtn: { alignSelf: 'stretch', marginTop: spacing.lg },
});
