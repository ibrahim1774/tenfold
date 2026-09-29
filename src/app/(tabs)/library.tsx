import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { AppText, Background, Chip, GradientButton, IconButton } from '@/design/components';
import { colors, motion, spacing } from '@/design/tokens';
import type { BatchStatus } from '@/engine/types';
import { BatchCard } from '@/library/BatchCard';
import { batchStatus, useLibrary } from '@/state/library';

type Filter = 'all' | BatchStatus;

const FILTERS: { v: Filter; l: string; none: string }[] = [
  { v: 'all', l: 'All', none: '' },
  { v: 'setup', l: 'Not started', none: 'Every batch has been started.' },
  { v: 'processing', l: 'Editing', none: 'Nothing is being edited right now.' },
  { v: 'ready', l: 'Ready', none: 'No batches are waiting to export.' },
  { v: 'exported', l: 'Exported', none: 'No batch has been fully exported yet.' },
];

export default function LibraryScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const batchMap = useLibrary((s) => s.batches);
  const projects = useLibrary((s) => s.projects);
  const total = Object.keys(batchMap).length;
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
        // The status bar and the native tab bar inset the scroll view (UIKit's automatic content insets).
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headRow}>
          <View style={styles.head}>
            <AppText variant="display" accessibilityRole="header">
              Library
            </AppText>
            {total > 0 && (
              <AppText variant="label" color={colors.textSecondary} tabular>
                {total} {total === 1 ? 'batch' : 'batches'}
              </AppText>
            )}
          </View>
          {/* What the old tab bar's centre + did: start a new batch from here. */}
          {total > 0 && <IconButton icon="plus" label="New batch" onPress={() => router.push('/import')} />}
        </View>

        {total === 0 ? (
          <View style={styles.empty}>
            <AppText variant="title" style={styles.center}>
              No batches yet
            </AppText>
            <AppText variant="body" color={colors.textSecondary} style={styles.center}>
              Batches you edit are kept here, newest first, with their clips and exported videos.
            </AppText>
            <GradientButton title="New batch" icon="plus" onPress={() => router.push('/import')} style={styles.emptyBtn} />
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chips}>
              {FILTERS.map((f) => (
                <Chip key={f.v} label={f.l} selected={filter === f.v} onPress={() => setFilter(f.v)} />
              ))}
            </ScrollView>

            {batches.length === 0 ? (
              <View style={styles.empty}>
                <AppText variant="body" color={colors.textSecondary} style={styles.center}>
                  {FILTERS.find((f) => f.v === filter)?.none}
                </AppText>
                <Chip label="Show all" onPress={() => setFilter('all')} />
              </View>
            ) : (
              <View style={styles.grid}>
                {Array.from({ length: Math.ceil(batches.length / 2) }).map((_, row) => (
                  <Animated.View
                    key={batches[row * 2].id}
                    layout={LinearTransition.duration(motion.base)}
                    style={styles.gridRow}>
                    <BatchCard batch={batches[row * 2]} />
                    {batches[row * 2 + 1] ? <BatchCard batch={batches[row * 2 + 1]} /> : <View style={styles.flex} />}
                  </Animated.View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.xl },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  head: { gap: 2, flex: 1 },
  chipsScroll: { marginHorizontal: -spacing.gutter, flexGrow: 0 },
  chips: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.gutter },
  grid: { gap: spacing.xl },
  gridRow: { flexDirection: 'row', gap: spacing.md },
  empty: { alignItems: 'center', gap: spacing.md, marginTop: spacing.xxl * 2, paddingHorizontal: spacing.lg },
  center: { textAlign: 'center' },
  emptyBtn: { alignSelf: 'stretch', marginTop: spacing.sm },
});
