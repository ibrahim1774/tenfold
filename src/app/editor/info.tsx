import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorText } from '@/batch/queue';
import { AppText } from '@/design/components';
import { colors, spacing } from '@/design/tokens';
import { GroupLabel, RowGroup, RowGroupSkeleton, type InfoRow } from '@/editor/Panel';
import { Engine, type Analysis } from '@/engine';
import { formatDuration, useLibrary } from '@/state/library';

/**
 * Facts about one video: how it was transcribed and what the export will look like.
 * `frame` and `aspect` are what the editor's live preview last reported (only it knows the rendered size).
 */
export default function VideoInfoSheet() {
  const insets = useSafeAreaInsets();
  const { projectId, frame, aspect } = useLocalSearchParams<{ projectId: string; frame?: string; aspect?: string }>();
  const project = useLibrary((s) => s.projects[projectId]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The clips as they play in the editor (multi-clip videos).
  const orderKey = useLibrary((s) => (s.docs[projectId]?.clipOrder ? JSON.stringify(s.docs[projectId]?.clipOrder) : ''));
  useEffect(() => {
    let alive = true;
    Engine.getAnalysis(projectId, orderKey ? (JSON.parse(orderKey) as string[]) : undefined)
      .then((a) => alive && setAnalysis(a))
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [projectId, orderKey]);

  const t = analysis?.transcript;
  const media = analysis?.media ?? project?.media ?? undefined;

  const speech: InfoRow[] = t
    ? [
        { label: 'Speech engine', value: t.engine === 'apple' ? 'Apple, on device' : t.engine },
        { label: 'Language', value: t.language },
        { label: 'Word timing', value: t.wordTimingIsExact ? 'Per word' : 'Per phrase, estimated' },
        { label: 'Timed runs', value: `${t.stats.runCount} · ${(t.stats.singleWordRunRatio * 100).toFixed(0)}% single words` },
        { label: 'Filler words found', value: String(t.stats.lexicalFillerCount) },
        { label: 'Transcribed in', value: `${t.stats.elapsedSec.toFixed(1)} s` },
      ]
    : [{ label: 'Speech engine', value: 'None' }];
  if (analysis) speech.push({ label: 'Speech coverage', value: `${(analysis.speechCoverage * 100).toFixed(0)}%` });

  const video: InfoRow[] = [];
  if (media) {
    video.push({ label: 'Length', value: formatDuration(media.durationSec) });
    const clips = analysis?.clips?.length ?? 1;
    if (clips > 1) video.push({ label: 'Clips', value: `${clips}, size and frame rate of the first` });
    video.push({ label: 'Source size', value: `${media.width}×${media.height}` });
    video.push({ label: 'Frame rate', value: `${Math.round(media.fps)} fps` });
    video.push({ label: 'Colour', value: media.isHDR ? 'HDR, exported as SDR' : 'SDR' });
  }
  if (frame) video.push({ label: 'Output frame', value: `${frame}${aspect && aspect !== 'original' ? ` · ${aspect}` : ''}` });

  const warnings = analysis?.warnings ?? [];

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.head}>
        <AppText variant="title" accessibilityRole="header" numberOfLines={2}>
          {project?.title ?? 'Video info'}
        </AppText>
        <AppText variant="label" color={colors.textMuted}>
          How this clip was analysed on this iPhone.
        </AppText>
      </View>

      {error ? (
        <AppText variant="label" color={colors.danger} style={styles.error}>
          Couldn’t read this video’s analysis: {error}
        </AppText>
      ) : !analysis ? (
        <>
          <GroupLabel>Speech</GroupLabel>
          <RowGroupSkeleton count={7} />
          <GroupLabel>Video</GroupLabel>
          <RowGroupSkeleton count={4} />
        </>
      ) : (
        <>
          <GroupLabel>Speech</GroupLabel>
          <RowGroup rows={speech} />
          {video.length > 0 && (
            <>
              <GroupLabel>Video</GroupLabel>
              <RowGroup rows={video} />
            </>
          )}
          {warnings.length > 0 && (
            <>
              <GroupLabel>Notes</GroupLabel>
              <View style={styles.notes}>
                {warnings.map((w, i) => (
                  <AppText key={i} variant="label" color={colors.textSecondary}>
                    {w}
                  </AppText>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xxl },
  head: { gap: 2, marginBottom: spacing.sm },
  error: { marginTop: spacing.lg },
  notes: { gap: spacing.sm, paddingHorizontal: spacing.lg },
});
