import { FlashList } from '@shopify/flash-list';
import { Redirect, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Background,
  GlassCard,
  GradientButton,
  IconButton,
  PressableScale,
  ProgressRing,
} from '@/design/components';
import { colors, fonts, radii, spacing } from '@/design/tokens';
import type { Batch } from '@/engine/types';
import { mockBatches, projectsForBatch } from '@/mock/data';
import { useSettings } from '@/state/settings';

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const onboarded = useSettings((s) => s.onboarded);
  const speechModel = useSettings((s) => s.speechModel);
  const [query, setQuery] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);

  const batches = useMemo(
    () => (showEmpty ? [] : mockBatches.filter((b) => b.title.toLowerCase().includes(query.toLowerCase()))),
    [query, showEmpty],
  );

  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <View style={styles.flex}>
      <Background />
      <FlashList
        data={batches}
        numColumns={2}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 100, paddingHorizontal: 10 }}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <AppText variant="display" color={colors.textOnLight}>
                Tenfold
              </AppText>
              <IconButton icon="plus" label="New batch" tone="light" onPress={() => router.push('/import')} />
            </View>
            <View style={styles.search}>
              <SymbolView name="magnifyingglass" size={16} tintColor={colors.textOnLightMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search batches"
                placeholderTextColor={colors.textOnLightMuted}
                style={styles.searchInput}
                accessibilityLabel="Search batches"
              />
            </View>
            {speechModel !== 'installed' && (
              <PressableScale onPress={() => router.push('/settings')} style={styles.banner}>
                <SymbolView name="arrow.down.circle" size={18} tintColor={colors.textPrimary} />
                <AppText variant="caption" style={styles.flex}>
                  Using Apple speech. Download the Tenfold model for word-perfect timing and filler removal.
                </AppText>
              </PressableScale>
            )}
          </View>
        }
        ListEmptyComponent={<EmptyState />}
        renderItem={({ item }) => <BatchCard batch={item} />}
        ListFooterComponent={
          <PressableScale haptic={false} onPress={() => setShowEmpty((v) => !v)} style={styles.devToggle}>
            <AppText variant="caption" color={colors.textMuted}>
              {showEmpty ? 'Show mock batches' : 'Preview empty state'}
            </AppText>
          </PressableScale>
        }
      />
    </View>
  );
}

function BatchCard({ batch }: { batch: Batch }) {
  const projects = projectsForBatch(batch);
  const done = projects.filter((p) => p.status === 'ready' || p.status === 'done').length;
  const progress = batch.status === 'exported' ? 1 : projects.length ? done / projects.length : 0;
  const cover = projects[0]?.thumbColor ?? colors.toolPanel;
  const statusLabel =
    batch.status === 'processing' ? 'Processing' : batch.status === 'ready' ? 'Ready to export' : 'Exported';

  return (
    <PressableScale
      style={styles.cardWrap}
      accessibilityLabel={`${batch.title}, ${projects.length} videos, ${statusLabel}`}
      onPress={() => router.push({ pathname: '/batch/[batchId]', params: { batchId: batch.id } })}>
      <GlassCard padded={false}>
        <View style={[styles.cover, { backgroundColor: cover }]}>
          <View style={styles.countBadge}>
            <AppText variant="caption">{projects.length} videos</AppText>
          </View>
          <View style={styles.ring}>
            <ProgressRing progress={progress} size={40} stroke={5} showLabel={false} />
          </View>
        </View>
        <View style={styles.cardText}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {batch.title}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {statusLabel}
          </AppText>
        </View>
      </GlassCard>
    </PressableScale>
  );
}

function EmptyState() {
  return (
    <GlassCard style={styles.empty}>
      <AppText variant="title" style={styles.center}>
        Drop in 10 clips.{'\n'}Get 10 finished videos.
      </AppText>
      <AppText variant="body" color={colors.textSecondary} style={styles.center}>
        Silences, filler words, zooms and captions, done on your iPhone.
      </AppText>
      <GradientButton title="New batch" onPress={() => router.push('/import')} />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 6, gap: spacing.md, marginBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.textOnLight },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(22,26,48,0.7)',
  },
  cardWrap: { padding: 6 },
  cover: { height: 190, borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card },
  countBadge: {
    position: 'absolute',
    left: 10,
    top: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(15,18,34,0.6)',
  },
  ring: { position: 'absolute', right: 10, bottom: 10 },
  cardText: { padding: 14, gap: 2 },
  empty: { marginHorizontal: 6, marginTop: 40, gap: spacing.lg },
  center: { textAlign: 'center' },
  devToggle: { alignSelf: 'center', padding: 16 },
});
