import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { AppText, PressableScale, ProgressRing, Thumb, seedOf } from '@/design/components';
import { colors, radii } from '@/design/tokens';
import type { Batch } from '@/engine/types';
import { batchStatus, projectsOf, timeAgo, useLibrary } from '@/state/library';

/** Project card from the reference Home grid: thumbnail, count badge, status glyph, title, age. */
export function BatchCard({ batch }: { batch: Batch }) {
  const all = useLibrary((s) => s.projects);
  const projects = projectsOf(batch, all);
  const status = batchStatus(batch, all);
  const ready = projects.filter((p) => ['ready', 'exportQueued', 'exporting', 'done'].includes(p.status)).length;
  const done = projects.filter((p) => p.status === 'done').length;
  const progress = status === 'exported' ? 1 : projects.length ? (ready + done) / (2 * projects.length) : 0;
  const subtitle =
    status === 'setup'
      ? 'Not started'
      : status === 'processing'
        ? batch.paused
          ? 'Paused'
          : `Editing ${ready}/${projects.length}`
        : status === 'ready'
          ? done > 0
            ? `${done}/${projects.length} exported`
            : 'Ready to export'
          : `Exported ${timeAgo(batch.createdAt)}`;
  const first = projects[0];

  return (
    <PressableScale
      style={styles.card}
      scaleTo={0.96}
      accessibilityLabel={`${batch.title}, ${projects.length} videos, ${subtitle}`}
      onPress={() =>
        router.push(
          status === 'setup'
            ? { pathname: '/batch/setup', params: { batchId: batch.id } }
            : { pathname: '/batch/[batchId]', params: { batchId: batch.id } },
        )
      }>
      <Thumb seed={seedOf(batch.id)} uri={first?.posterUri} style={styles.thumb}>
        <View style={styles.status}>
          {status === 'processing' ? (
            <ProgressRing progress={progress} size={26} stroke={3} showLabel={false} />
          ) : (
            <SymbolView
              name={status === 'exported' ? 'checkmark' : status === 'setup' ? 'slider.horizontal.3' : 'play.fill'}
              size={13}
              tintColor={colors.textPrimary}
              weight="semibold"
            />
          )}
        </View>
        <View style={styles.badge}>
          <AppText variant="caption">
            {projects.length} {projects.length === 1 ? 'video' : 'videos'}
          </AppText>
        </View>
      </Thumb>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {batch.title}
        </AppText>
        <AppText variant="label" color={colors.textMuted} numberOfLines={1}>
          {subtitle}
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
  thumb: { height: 164, borderRadius: radii.tile - 2 },
  status: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,9,14,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  badge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(10,9,14,0.55)',
  },
  text: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8, gap: 1 },
});
