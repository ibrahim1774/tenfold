import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { AppText, PressableScale, ProgressRing, Thumb, seedOf } from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import type { Batch, BatchStatus, Project } from '@/engine/types';
import { batchStatus, formatDuration, projectsOf, timeAgo, useLibrary } from '@/state/library';

export type BatchSummary = {
  status: BatchStatus;
  projects: Project[];
  /** Clips in the batch. */
  count: number;
  /** Sum of source durations in seconds (0 when unknown). */
  totalSec: number;
  analysed: number;
  exported: number;
  /** 0..1, the same figure as the ring on the batch screen. */
  progress: number;
  /** What the batch is doing, in words with real numbers ("Exporting 2 of 5"). */
  line: string;
  /** When the batch last changed state that matters to the user (newest export, else creation). */
  when: number;
};

/** Facts about a batch shared by Home and Library, so both say the same thing as the batch screen. */
export function summarize(batch: Batch, all: Record<string, Project>): BatchSummary {
  const projects = projectsOf(batch, all);
  const status = batchStatus(batch, all);
  const count = projects.length;
  const n = Math.max(1, count);
  const totalSec = projects.reduce((sum, p) => sum + (p.media?.durationSec ?? 0), 0);
  const analysed = projects.filter((p) => ['ready', 'exportQueued', 'exporting', 'done'].includes(p.status)).length;
  const exported = projects.filter((p) => p.status === 'done').length;
  const exporting = projects.some((p) => ['exportQueued', 'exporting', 'done'].includes(p.status));
  // Mirrors `overall` in src/app/batch/[batchId].tsx: analysis alone until anything exports.
  const progress =
    status === 'exported'
      ? 1
      : exporting
        ? projects.reduce((sum, p) => {
            if (p.status === 'done') return sum + 1;
            if (p.status === 'ready' || p.status === 'exportQueued') return sum + 0.5;
            if (p.status === 'exporting') return sum + 0.5 + p.progress * 0.5;
            if (p.status === 'analyzing') return sum + p.progress * 0.5;
            return sum;
          }, 0) / n
        : projects.reduce((sum, p) => sum + (p.status === 'ready' ? 1 : p.status === 'analyzing' ? p.progress : 0), 0) / n;
  const exportedAt = projects.reduce((max, p) => Math.max(max, p.exportedAt ?? 0), 0);

  let line: string;
  switch (status) {
    case 'setup':
      line = 'Not started';
      break;
    case 'processing':
      if (batch.paused) line = `Paused · ${exporting ? exported : analysed} of ${count} done`;
      else line = exporting ? `Exporting ${exported} of ${count}` : `Editing ${analysed} of ${count}`;
      break;
    case 'ready':
      line = exported > 0 ? `${exported} of ${count} exported` : 'Ready to export';
      break;
    default:
      line = 'Exported';
  }

  return { status, projects, count, totalSec, analysed, exported, progress, line, when: exportedAt || batch.createdAt };
}

/** Opens a batch where it left off: setup until it's started, the batch screen after. */
export function openBatch(batch: Batch, status: BatchStatus) {
  router.push(
    status === 'setup'
      ? { pathname: '/batch/setup', params: { batchId: batch.id } }
      : { pathname: '/batch/[batchId]', params: { batchId: batch.id } },
  );
}

export function clipCount(n: number) {
  return `${n} ${n === 1 ? 'clip' : 'clips'}`;
}

/** Grid card: thumbnail, title, then facts (clips · length, status · age). */
export function BatchCard({ batch }: { batch: Batch }) {
  const all = useLibrary((s) => s.projects);
  const s = summarize(batch, all);
  const first = s.projects[0];
  const facts = s.totalSec > 0 ? `${clipCount(s.count)} · ${formatDuration(s.totalSec)}` : clipCount(s.count);
  const age = timeAgo(s.when);

  return (
    <PressableScale
      style={styles.card}
      scaleTo={0.97}
      haptic={false}
      accessibilityRole="button"
      accessibilityLabel={`${batch.title}. ${facts}. ${s.line}, ${age}.`}
      accessibilityHint={s.status === 'setup' ? 'Opens batch setup' : 'Opens the batch'}
      onPress={() => openBatch(batch, s.status)}>
      <Thumb seed={seedOf(batch.id)} uri={first?.posterUri} style={styles.thumb}>
        {s.status === 'processing' ? (
          <View style={styles.status}>
            <ProgressRing progress={s.progress} size={22} stroke={2.5} showLabel={false} />
          </View>
        ) : s.status === 'exported' ? (
          <View style={styles.status}>
            <SymbolView name="checkmark" size={12} tintColor={colors.textPrimary} weight="regular" />
          </View>
        ) : null}
      </Thumb>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {batch.title}
        </AppText>
        <AppText variant="label" color={colors.textSecondary} numberOfLines={1} tabular>
          {facts}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} numberOfLines={1} tabular>
          {s.line} · {age}
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 6,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { height: 164, borderRadius: radii.card - 6, borderCurve: 'continuous' },
  status: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  text: { paddingHorizontal: spacing.sm + 2, paddingTop: spacing.sm + 2, paddingBottom: spacing.sm, gap: 2 },
});
