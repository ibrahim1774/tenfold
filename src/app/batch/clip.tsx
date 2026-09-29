import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { batchEdits, EDITS, editsOf, sameEdits } from '@/batch/edits';
import { AppText, Thumb, ToggleRow, seedOf } from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import { Engine } from '@/engine';
import { setClipEdits, setEdit } from '@/state/batchSetup';
import { formatDuration, projectsOf, useLibrary } from '@/state/library';

/** One clip's edits, opened from the Clips strip in batch setup. */
export default function ClipEditsSheet() {
  const insets = useSafeAreaInsets();
  const { batchId, projectId } = useLocalSearchParams<{ batchId: string; projectId: string }>();
  const batch = useLibrary((s) => s.batches[batchId]);
  const project = useLibrary((s) => s.projects[projectId]);
  const projects = useLibrary((s) => s.projects);
  const removeProject = useLibrary((s) => s.removeProject);

  if (!batch || !project) {
    return (
      <View style={[styles.content, styles.missing]}>
        <AppText variant="label" color={colors.textMuted}>
          This clip is no longer in the batch.
        </AppText>
      </View>
    );
  }

  const edits = editsOf(project, batch);
  const common = batchEdits(projectsOf(batch, projects).map((c) => editsOf(c, batch)));
  const differs = common !== null && !sameEdits(edits, common);

  const remove = () =>
    Alert.alert('Remove this clip?', 'It is removed from the batch. The original in Photos stays.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          router.back();
          removeProject(projectId);
          Engine.deleteProject(projectId).catch(() => {});
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.head}>
        <Thumb seed={seedOf(project.id)} uri={project.posterUri} style={styles.poster} />
        <View style={styles.flex}>
          <AppText variant="title" accessibilityRole="header" numberOfLines={2}>
            {project.title}
          </AppText>
          <AppText variant="label" color={colors.textMuted} tabular>
            {(project.clips?.length ?? 1) > 1 ? `${project.clips?.length} clips · ` : ''}
            {formatDuration(project.media?.durationSec ?? 0)}
          </AppText>
        </View>
      </View>

      <View style={styles.group}>
        {EDITS.map((e, i) => (
          <View key={e.key}>
            <View style={styles.row}>
              <ToggleRow title={e.label} subtitle={e.detail} value={edits[e.key]} onChange={(v) => setEdit(batchId, e.key, v, [projectId])} />
            </View>
            {/* Inset hairline, starting at the text like an iOS grouped list. */}
            {i < EDITS.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        {differs && common && (
          <Pressable
            onPress={() => setClipEdits(projectId, common)}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityHint="Uses the same edits as most clips in this batch">
            <AppText variant="bodyStrong" color={colors.accentText}>
              Same as batch
            </AppText>
          </Pressable>
        )}
        <Pressable onPress={remove} style={({ pressed }) => [styles.action, pressed && styles.pressed]} accessibilityRole="button">
          <AppText variant="bodyStrong" color={colors.danger}>
            Remove clip
          </AppText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xxl, gap: spacing.xl },
  missing: { flex: 1, alignItems: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  poster: { width: 48, height: 68, borderRadius: radii.thumb - 2, borderCurve: 'continuous' },
  group: {
    borderRadius: radii.card,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 56, justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg, backgroundColor: colors.separator },
  actions: { gap: spacing.xs },
  action: { minHeight: 44, justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
