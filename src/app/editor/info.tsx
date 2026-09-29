import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorText } from '@/batch/queue';
import { SettingsGroup, ValueRow, ValueRowSkeleton } from '@/captions/SettingsRows';
import { AppText, ScreenHeader } from '@/design/components';
import { dark, spacing } from '@/design/tokens';
import type { InfoRow } from '@/editor/Panel';
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
      <ScreenHeader title={project?.title ?? 'Video info'} back={false} />
      <AppText variant="label" color={dark.textMuted} style={styles.subline}>
        How this clip was analysed on this iPhone.
      </AppText>

      {error ? (
        <AppText variant="label" color={dark.danger} style={styles.error}>
          Couldn’t read this video’s analysis: {error}
        </AppText>
      ) : !analysis ? (
        <>
          <SettingsGroup label="Speech">{skeleton(7)}</SettingsGroup>
          <SettingsGroup label="Video">{skeleton(4)}</SettingsGroup>
        </>
      ) : (
        <>
          <SettingsGroup label="Speech">{rowsOf(speech)}</SettingsGroup>
          {video.length > 0 && <SettingsGroup label="Video">{rowsOf(video)}</SettingsGroup>}
          {warnings.length > 0 && (
            <View style={styles.notesWrap}>
              <AppText variant="label" color={dark.textSecondary} style={styles.notesLabel} accessibilityRole="header">
                Notes
              </AppText>
              <View style={styles.notes}>
                {warnings.map((w, i) => (
                  <AppText key={i} variant="label" color={dark.textSecondary}>
                    {w}
                  </AppText>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const rowsOf = (rows: InfoRow[]) => rows.map((r) => <ValueRow key={r.label} label={r.label} value={r.value} />);
const skeleton = (count: number) => Array.from({ length: count }, (_, i) => <ValueRowSkeleton key={i} />);

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.xl },
  subline: { textAlign: 'center', marginTop: -spacing.md },
  error: { marginHorizontal: spacing.lg },
  notesWrap: { gap: spacing.sm },
  notesLabel: { marginLeft: spacing.lg },
  notes: { gap: spacing.sm, paddingHorizontal: spacing.lg },
});
