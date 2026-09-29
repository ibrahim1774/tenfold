import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActionSheetIOS, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import {
  AppText,
  Background,
  GradientButton,
  IconButton,
  OutlineButton,
  PressableScale,
  ProgressBar,
  Thumb,
  seedOf,
} from '@/design/components';
import { TakesWall } from '@/design/TakesWall';
import { light, motion, radii, spacing } from '@/design/tokens';
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

const RECENT = 6;

export default function CreateScreen() {
  const tier = useEntitlements((s) => tierOf(s));
  const isPro = tier !== 'free';
  const limit = maxBatchSize(tier);
  const batchMap = useLibrary((s) => s.batches);
  const projects = useLibrary((s) => s.projects);

  const all = Object.values(batchMap)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((batch) => ({ batch, summary: summarize(batch, projects) }));
  const running = all.filter((b) => b.summary.status === 'processing');
  const recent = all.filter((b) => b.summary.status !== 'processing').slice(0, RECENT);
  const empty = all.length === 0;

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        // The status bar and the native tab bar inset the scroll view (UIKit's automatic content insets).
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AppText variant="display" accessibilityRole="header" style={styles.flex}>
            Create
          </AppText>
          <ProPill isPro={isPro} name={TIER_NAMES[tier]} />
          <MoreButton />
          {/* The import screen (join clips, sample): the long way in, next to the direct buttons below. */}
          {!empty && <IconButton icon="plus" label="New batch" onPress={() => router.push('/import')} />}
        </View>

        <SpeechLine />

        {empty ? (
          <FirstBatch limit={limit} />
        ) : (
          <>
            {/* Record or import first, whatever else is going on; batches in progress and recent ones below. */}
            <CreateActions />
            {running.length > 0 && (
              <Animated.View layout={LinearTransition.duration(motion.base)} style={styles.section}>
                {running.map(({ batch, summary }) => (
                  <RunningRow key={batch.id} batch={batch} summary={summary} />
                ))}
              </Animated.View>
            )}

            {recent.length > 0 && (
              <Animated.View layout={LinearTransition.duration(motion.base)} style={styles.section}>
                <View style={styles.sectionHead}>
                  <AppText variant="title" accessibilityRole="header">
                    Recent
                  </AppText>
                  {all.length > RECENT && (
                    <PressableScale
                      haptic={false}
                      onPress={() => router.navigate('/library')}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityRole="link"
                      accessibilityLabel="See all batches">
                      <AppText variant="chip" color={light.textSecondary}>
                        See all
                      </AppText>
                    </PressableScale>
                  )}
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

          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Empty Create: the wall of finished takes, one line, and the two ways to start. */
function FirstBatch({ limit }: { limit: number }) {
  const { height } = useWindowDimensions();
  const available = engineAvailable();
  return (
    <View style={styles.first}>
      <TakesWall pill={`Up to ${limit} at once`} style={[styles.wall, { height: Math.round(height * 0.42) }]} />
      <View style={styles.firstText}>
        <AppText variant="title" accessibilityRole="header">
          Make your first batch
        </AppText>
        <AppText variant="label" color={light.textSecondary}>
          {available ? 'Pauses cut, captions on, framed for vertical.' : 'This build has no video engine. Install the latest build.'}
        </AppText>
      </View>
      <CreateActions />
    </View>
  );
}

/** The screen's job: import clips from Photos (the primary action) or record one now. */
function CreateActions() {
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
    <View style={styles.firstActions}>
      <GradientButton title={title} icon={busy ? false : 'photo.on.rectangle'} disabled={busy || !available} onPress={importClips} />
      <OutlineButton title="Record a clip" icon="video" onPress={() => router.push('/record')} disabled={busy} />
    </View>
  );
}

/** The rarer ways in, kept out of the way: joining clips into one video, the bundled demo. */
function MoreButton() {
  const canJoin = engineAvailable() && Engine.canAddClips();
  const demo = hasSampleClip();
  if (!canJoin && !demo) return null;
  const options = [
    ...(canJoin ? [{ label: 'Join several clips into one video', run: () => router.push({ pathname: '/import', params: { mode: 'multiple' } }) }] : []),
    ...(demo ? [{ label: 'Replay the demo', run: () => router.push('/demo') }] : []),
  ];
  const open = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...options.map((o) => o.label), 'Cancel'], cancelButtonIndex: options.length },
      (i) => options[i]?.run(),
    );
  return <IconButton icon="ellipsis" label="More options" onPress={open} />;
}

function ProPill({ isPro, name }: { isPro: boolean; name: string }) {
  // Free: the same plans paywall as You → Upgrade.
  const gate = usePaywallGate();
  if (isPro) {
    return (
      <View style={styles.proBadge} accessible accessibilityLabel={`Tenfold ${name} is active`}>
        <SymbolView name="crown.fill" size={13} tintColor={light.accent} weight="regular" />
        <AppText variant="label" color={light.textSecondary}>
          {name}
        </AppText>
      </View>
    );
  }
  return (
    <IconButton
      icon="crown"
      label="See plans"
      onPress={() => gate({ placement: 'settings_upgrade', params: { source: 'home' }, allowed: () => false })}
    />
  );
}

/** On-device speech status, as one quiet line only when it needs attention. */
function SpeechLine() {
  const { speech, speechProgress } = useSettings();
  if (speech === 'unsupported') {
    return (
      <AppText variant="label" color={light.textMuted}>
        Captions aren’t available in your language on this iPhone.
      </AppText>
    );
  }
  if (speech === 'downloading') {
    const pct = Math.round(speechProgress * 100);
    return (
      <View
        style={styles.speech}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Setting up captions"
        accessibilityValue={{ min: 0, max: 100, now: pct }}>
        <AppText variant="label" color={light.textSecondary} tabular>
          Setting up captions · {pct}%
        </AppText>
        <ProgressBar progress={speechProgress} height={2} />
      </View>
    );
  }
  if (speech !== 'supported') return null;
  return (
    <Pressable
      onPress={prepareSpeech}
      accessibilityRole="button"
      accessibilityLabel="Turn on captions"
      accessibilityHint="Downloads Apple’s speech model once"
      style={({ pressed }) => [styles.speechRow, pressed && styles.pressed]}>
      <SymbolView name="waveform" size={15} tintColor={light.textSecondary} weight="regular" />
      <AppText variant="label" color={light.textSecondary} style={styles.flex}>
        Captions need a one-time download.
      </AppText>
      <AppText variant="chip" color={light.accentText}>
        Set up
      </AppText>
    </Pressable>
  );
}

/** A batch being edited: its first take, what it's doing, and a thin bar. No box around it. */
function RunningRow({ batch, summary }: { batch: Batch; summary: BatchSummary }) {
  const pct = Math.round(summary.progress * 100);
  return (
    <PressableScale
      haptic={false}
      scaleTo={0.98}
      onPress={() => openBatch(batch, summary.status)}
      accessibilityRole="button"
      accessibilityLabel={`${batch.title}. ${summary.line}.`}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={styles.runRow}>
      <Thumb seed={seedOf(batch.id)} uri={summary.projects[0]?.posterUri} style={styles.runThumb} />
      <View style={[styles.flex, styles.runBody]}>
        <View style={styles.runHead}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {batch.title}
          </AppText>
          <AppText variant="label" color={light.textSecondary} tabular>
            {pct}%
          </AppText>
        </View>
        <AppText variant="label" color={light.textSecondary} numberOfLines={1} tabular>
          {summary.line}
        </AppText>
        <ProgressBar progress={summary.progress} height={3} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  first: { gap: spacing.lg },
  wall: { marginHorizontal: -spacing.gutter },
  firstText: { gap: spacing.xs },
  firstActions: { gap: spacing.md },
  speech: { gap: spacing.sm },
  speechRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  pressed: { opacity: 0.6 },
  section: { gap: spacing.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { gap: spacing.xl },
  gridRow: { flexDirection: 'row', gap: spacing.md },
  runRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 76 },
  runThumb: { width: 54, height: 72, borderRadius: radii.tile, borderCurve: 'continuous' },
  runBody: { gap: spacing.xs },
  runHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
