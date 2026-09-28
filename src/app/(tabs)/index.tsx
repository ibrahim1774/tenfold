import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Background,
  Card,
  GradientButton,
  OutlineButton,
  PressableScale,
  ProgressBar,
  Thumb,
  seedOf,
  useTabBarSpace,
} from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, motion, radii, spacing } from '@/design/tokens';
import { importNewBatch, useImporting } from '@/batch/importClips';
import { Engine, EngineEvents, engineAvailable } from '@/engine';
import type { Batch } from '@/engine/types';
import { hasSampleClip } from '@/onboarding/fileImport';
import { BatchCard, openBatch, summarize, type BatchSummary } from '@/library/BatchCard';
import { usePaywallGate } from '@/monetization/superwall';
import { maxBatchSize, tierOf, TIER_NAMES, useEntitlements } from '@/state/entitlements';
import { useLibrary } from '@/state/library';
import { useSettings } from '@/state/settings';
import { prepareSpeech } from '@/state/speech';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const tier = useEntitlements((s) => tierOf(s));
  const isPro = tier !== 'free';
  const limit = maxBatchSize(tier);
  const batchMap = useLibrary((s) => s.batches);
  const projects = useLibrary((s) => s.projects);

  const all = Object.values(batchMap)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((batch) => ({ batch, summary: summarize(batch, projects) }));
  const running = all.filter((b) => b.summary.status === 'processing');
  const recent = all.filter((b) => b.summary.status !== 'processing').slice(0, 4);
  const empty = all.length === 0;

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: bottom }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AppText variant="display" accessibilityRole="header" style={styles.flex}>
            Tenfold
          </AppText>
          <ProPill isPro={isPro} name={TIER_NAMES[tier]} />
        </View>

        {empty ? (
          <FirstBatchCard limit={limit} />
        ) : (
          <View style={styles.action}>
            <View style={styles.actionRow}>
              <GradientButton title="New batch" icon="plus" onPress={() => router.push('/import')} style={styles.flex} />
              <OutlineButton title="Record" icon="video" onPress={() => router.push('/record')} style={styles.record} />
            </View>
            <AppText variant="caption" color={colors.textMuted} style={styles.center}>
              Up to {limit} clips per batch
            </AppText>
          </View>
        )}

        <SpeechBanner />

        {running.length > 0 && (
          <Animated.View layout={LinearTransition.duration(motion.base)} style={styles.section}>
            <AppText variant="title" accessibilityRole="header">
              In progress
            </AppText>
            <Card padded={false}>
              {running.map(({ batch, summary }, i) => (
                <RunningRow key={batch.id} batch={batch} summary={summary} divider={i > 0} />
              ))}
            </Card>
          </Animated.View>
        )}

        {recent.length > 0 && (
          <Animated.View layout={LinearTransition.duration(motion.base)} style={styles.section}>
            <View style={styles.sectionHead}>
              <AppText variant="title" accessibilityRole="header">
                Recent
              </AppText>
              <PressableScale
                haptic={false}
                onPress={() => router.navigate('/library')}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="link"
                accessibilityLabel="See all batches">
                <AppText variant="label" color={colors.textSecondary}>
                  See all
                </AppText>
              </PressableScale>
            </View>
            <View style={styles.grid}>
              {Array.from({ length: Math.ceil(recent.length / 2) }).map((_, row) => (
                <View key={recent[row * 2].batch.id} style={styles.gridRow}>
                  <BatchCard batch={recent[row * 2].batch} />
                  {recent[row * 2 + 1] ? <BatchCard batch={recent[row * 2 + 1].batch} /> : <View style={styles.flex} />}
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {empty && <HowItWorks limit={limit} />}
      </ScrollView>
    </View>
  );
}

/** Empty Home: one card with the one thing to do first. */
function FirstBatchCard({ limit }: { limit: number }) {
  const busy = useImporting((s) => s.busy);
  const [copying, setCopying] = useState<{ index: number; total: number } | null>(null);
  const available = engineAvailable();

  useEffect(() => {
    const sub = EngineEvents.onImportProgress(setCopying);
    return () => sub.remove();
  }, []);

  const importClips = async () => {
    const batchId = await importNewBatch();
    setCopying(null);
    if (batchId) router.push({ pathname: '/batch/setup', params: { batchId } });
  };

  const title =
    busy && copying && copying.total > 0
      ? `Copying ${Math.min(copying.index + 1, copying.total)} of ${copying.total}`
      : busy
        ? 'Waiting for Photos'
        : 'Import clips';

  return (
    <Card style={styles.firstCard}>
      <View style={styles.firstText}>
        <AppText variant="title" accessibilityRole="header">
          Make your first batch
        </AppText>
        <AppText variant="body" color={colors.textSecondary}>
          Up to {limit} talking clips at once: pauses cut, captions added, framed for vertical. All on this iPhone.
        </AppText>
      </View>
      <GradientButton title={title} icon={busy ? false : 'photo.on.rectangle'} disabled={busy || !available} onPress={importClips} />
      <OutlineButton title="Record a clip" icon="video" onPress={() => router.push('/record')} disabled={busy} />
      <AppText variant="caption" color={colors.textMuted} style={styles.center} tabular>
        {available ? 'Importing needs no permissions.' : 'This build doesn’t include the video engine. Install the latest build to import clips.'}
      </AppText>
      {available && Engine.canAddClips() && (
        <PressableScale
          haptic={false}
          disabled={busy}
          onPress={() => router.push({ pathname: '/import', params: { mode: 'multiple' } })}
          accessibilityRole="link"
          accessibilityHint="Picks several clips and joins them into one video."
          style={styles.demoLink}>
          <AppText variant="chip" color={colors.accentText}>
            Join several clips into one video
          </AppText>
        </PressableScale>
      )}
      {hasSampleClip() && (
        <PressableScale
          haptic={false}
          onPress={() => router.push('/demo')}
          accessibilityRole="link"
          style={styles.demoLink}>
          <AppText variant="chip" color={colors.accentText}>
            Replay the demo
          </AppText>
        </PressableScale>
      )}
    </Card>
  );
}

function ProPill({ isPro, name }: { isPro: boolean; name: string }) {
  // Free: the same plans paywall as Settings "See plans".
  const gate = usePaywallGate();
  if (isPro) {
    return (
      <View style={styles.proPill} accessible accessibilityLabel={`Tenfold ${name} is active`}>
        <SymbolView name="crown.fill" size={15} tintColor="#FFC24D" weight="regular" />
        <AppText variant="chip">{name}</AppText>
      </View>
    );
  }
  return (
    <PressableScale
      onPress={() => gate({ placement: 'settings_upgrade', params: { source: 'home' }, allowed: () => false })}
      haptic={false}
      style={styles.proPill}
      accessibilityRole="button"
      accessibilityLabel="See plans">
      <SymbolView name="crown" size={15} tintColor={colors.textPrimary} weight="regular" />
      <AppText variant="chip">Upgrade</AppText>
    </PressableScale>
  );
}

/** On-device speech status. Apple manages the language assets; captions need them once. */
function SpeechBanner() {
  const { speech, speechProgress } = useSettings();
  if (speech === 'unsupported') {
    return (
      <Card>
        <AppText variant="label" color={colors.textSecondary}>
          On-device speech isn’t available for your language on this iPhone, so captions are off. Cuts and zooms
          still work.
        </AppText>
      </Card>
    );
  }
  if (speech !== 'supported' && speech !== 'downloading') return null;
  const downloading = speech === 'downloading';
  const pct = Math.round(speechProgress * 100);
  return (
    <Card padded={false}>
      <View style={styles.bannerRow}>
        <View style={styles.bannerIcon}>
          <SymbolView name="waveform" size={17} tintColor={colors.textPrimary} weight="regular" />
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{downloading ? 'Setting up captions' : 'Turn on captions'}</AppText>
          <AppText variant="label" color={colors.textSecondary} tabular>
            {downloading ? `${pct}% · you can keep editing meanwhile` : 'iOS downloads its speech model once.'}
          </AppText>
        </View>
        {!downloading && <OutlineButton title="Set up" height={44} onPress={prepareSpeech} style={styles.setUp} />}
      </View>
      {downloading && (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Caption setup"
          accessibilityValue={{ min: 0, max: 100, now: pct }}>
          <ProgressBar progress={speechProgress} height={3} />
        </View>
      )}
    </Card>
  );
}

function RunningRow({ batch, summary, divider }: { batch: Batch; summary: BatchSummary; divider: boolean }) {
  const pct = Math.round(summary.progress * 100);
  return (
    <PressableScale
      haptic={false}
      scaleTo={0.98}
      onPress={() => openBatch(batch, summary.status)}
      accessibilityRole="button"
      accessibilityLabel={`${batch.title}. ${summary.line}.`}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={[styles.runRow, divider && styles.divider]}>
      <Thumb seed={seedOf(batch.id)} uri={summary.projects[0]?.posterUri} style={styles.runThumb} />
      <View style={[styles.flex, styles.runBody]}>
        <View style={styles.runHead}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {batch.title}
          </AppText>
          <AppText variant="label" color={colors.textSecondary} tabular>
            {pct}%
          </AppText>
        </View>
        <AppText variant="label" color={colors.textSecondary} numberOfLines={1} tabular>
          {summary.line}
        </AppText>
        <ProgressBar progress={summary.progress} height={3} />
      </View>
      <SymbolView name="chevron.right" size={13} tintColor={colors.textMuted} weight="regular" />
    </PressableScale>
  );
}

function HowItWorks({ limit }: { limit: number }) {
  const steps: { icon: SFSymbol; title: string; body: string }[] = [
    { icon: 'photo.on.rectangle', title: `Pick up to ${limit} clips`, body: 'Talking-to-camera videos from Photos.' },
    { icon: 'slider.horizontal.3', title: 'Choose the edits', body: 'Captions, cut pauses and filler words, zoom.' },
    { icon: 'square.and.arrow.down', title: 'Generate and save', body: 'Every video is edited, then saved to Photos.' },
  ];
  return (
    <View style={styles.section}>
      <AppText variant="title" accessibilityRole="header">
        How it works
      </AppText>
      <Card padded={false}>
        {steps.map((s, i) => (
          <View key={s.title} style={[styles.howRow, i > 0 && styles.divider]}>
            <SymbolView name={s.icon} size={20} tintColor={colors.textSecondary} weight="regular" style={styles.howIcon} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{s.title}</AppText>
              <AppText variant="label" color={colors.textSecondary}>
                {s.body}
              </AppText>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  content: { paddingHorizontal: spacing.gutter, gap: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  action: { gap: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  record: { paddingHorizontal: spacing.sm },
  firstCard: { gap: spacing.md },
  firstText: { gap: spacing.xs, marginBottom: spacing.xs },
  demoLink: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  proPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  section: { gap: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { gap: spacing.md },
  gridRow: { flexDirection: 'row', gap: spacing.md },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardHigh,
  },
  setUp: { paddingHorizontal: spacing.xs },
  runRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 76 },
  runThumb: { width: 44, height: 60, borderRadius: 10, borderCurve: 'continuous' },
  runBody: { gap: spacing.xs },
  runHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2 },
  howIcon: { width: 24, height: 24 },
});
