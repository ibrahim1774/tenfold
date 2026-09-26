import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTION_COLORS, CAPTION_FONTS, CAPTION_FORMATS, CAPTION_PRESETS } from '@/captions/presets';
import {
  AppText,
  Background,
  Card,
  Chip,
  ChipGroup,
  CollapsibleSection,
  GradientButton,
  OptionLabel,
  OutlineButton,
  PressableScale,
  ScreenHeader,
  StyleTile,
  Thumb,
  ToggleRow,
  seedOf,
} from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import type { AudioMode, FillerLevel, SilenceLevel, ZoomMode } from '@/engine/types';
import { importIntoBatch, useImporting } from '@/batch/importClips';
import { startBatch } from '@/batch/queue';
import { Engine } from '@/engine';
import { setCaptionStyle as setStyle, setPresetId as setPreset, updatePreset } from '@/state/batchSetup';
import { exportsLeft as freeExportsLeft, FREE_LIMITS, maxBatchSize, useEntitlements } from '@/state/entitlements';
import { formatDuration, projectsOf, useLibrary } from '@/state/library';
import { PRESET_OPTIONS } from '@/state/presets';
import { batchAspect } from '@/batch/edits';
import { EditsChecklist } from '@/batch/EditsChecklist';

const SILENCE: { v: SilenceLevel; l: string }[] = [
  { v: 'light', l: 'Light' },
  { v: 'medium', l: 'Medium' },
  { v: 'aggressive', l: 'Aggressive' },
];
const FILLERS: { v: FillerLevel; l: string }[] = [
  { v: 'standard', l: 'Standard' },
  { v: 'aggressive', l: 'Aggressive' },
];
const ZOOM: { v: ZoomMode; l: string }[] = [
  { v: 'subtle', l: 'Subtle' },
  { v: 'dynamic', l: 'Dynamic' },
];
const AUDIO: { v: AudioMode; l: string; soon?: boolean }[] = [
  { v: 'original', l: 'Original' },
  { v: 'normalize', l: 'Normalize (soon)', soon: true },
  { v: 'mute', l: 'Mute' },
];
const POSITIONS = [
  { y: 0.2, l: 'Top' },
  { y: 0.5, l: 'Middle' },
  { y: 0.66, l: 'Lower' },
];
const SAMPLE = 'three tips that work';
const FRAMES = ['9:16', '4:5', '1:1', '16:9'] as const;

export default function BatchSetupScreen() {
  const insets = useSafeAreaInsets();
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const batch = useLibrary((s) => s.batches[batchId]);
  const projects = useLibrary((s) => s.projects);
  const removeProject = useLibrary((s) => s.removeProject);
  const deleteBatch = useLibrary((s) => s.deleteBatch);
  const importing = useImporting((s) => s.busy);
  const ent = useEntitlements();
  const isPro = ent.isPro;
  const exportsLeft = freeExportsLeft(ent);

  if (!batch) {
    return (
      <View style={[styles.flex, styles.missing]}>
        <Background />
        <AppText variant="bodyStrong">This batch no longer exists.</AppText>
        <OutlineButton title="Go back" height={44} onPress={() => router.back()} />
      </View>
    );
  }

  const preset = batch.preset;
  const clips = projectsOf(batch, projects);
  const total = clips.reduce((s, c) => s + (c.media?.durationSec ?? 0), 0);
  const a = preset.analysis;
  const update = (patch: Parameters<typeof updatePreset>[1]) => updatePreset(batchId, patch);
  const setPresetId = (id: Parameters<typeof setPreset>[1]) => setPreset(batchId, id);
  const setCaptionStyle = (id: Parameters<typeof setStyle>[1]) => setStyle(batchId, id);
  const removeClip = (id: string) =>
    Alert.alert('Remove this clip?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeProject(id);
          Engine.deleteProject(id).catch(() => {});
        },
      },
    ]);

  const discard = () =>
    Alert.alert('Discard this batch?', 'The clips are removed from Tenfold. Your originals in Photos stay.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          clips.forEach((c) => Engine.deleteProject(c.id).catch(() => {}));
          deleteBatch(batchId);
          router.back();
        },
      },
    ]);

  const start = () => {
    if (importing) return;
    startBatch(batchId);
    router.replace({ pathname: '/batch/[batchId]', params: { batchId } });
  };

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: insets.bottom + 130 }}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.gutter, styles.stack]}>
          <ScreenHeader title="New batch" right={<OutlineButton title="Discard" height={40} onPress={discard} />} />
          <AppText variant="body" color={colors.textSecondary}>
            Tell Tenfold how to edit your clips.
          </AppText>

          {/* Drop zone */}
          <Card dashed style={styles.drop}>
            {clips.length === 0 ? (
              <View style={styles.dropEmpty}>
                <SymbolView name="icloud.and.arrow.up" size={34} tintColor={colors.textPrimary} weight="light" />
                <AppText variant="bodyStrong">{importing ? 'Adding your clips…' : 'Add your clips'}</AppText>
                <OutlineButton title="Add" icon="plus" height={38} disabled={importing} onPress={() => importIntoBatch(batchId)} />
                <AppText variant="label" color={colors.textSecondary}>
                  Up to {maxBatchSize(isPro)} clips
                </AppText>
              </View>
            ) : (
              <View style={styles.dropFilled}>
                <View style={styles.dropHead}>
                  <AppText variant="bodyStrong">
                    {clips.length} clips · {formatDuration(total)}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    Long-press to remove
                  </AppText>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
                  {clips.map((c) => (
                    <PressableScale
                      key={c.id}
                      onLongPress={() => removeClip(c.id)}
                      accessibilityLabel={`${c.title}, ${formatDuration(c.media?.durationSec ?? 0)}. Long press to remove.`}>
                      <Thumb seed={seedOf(c.id)} uri={c.posterUri} style={styles.thumb}>
                        <View style={styles.duration}>
                          <AppText variant="caption">{formatDuration(c.media?.durationSec ?? 0)}</AppText>
                        </View>
                      </Thumb>
                    </PressableScale>
                  ))}
                  {clips.length < maxBatchSize(isPro) && (
                    <PressableScale
                      onPress={() => importIntoBatch(batchId)}
                      disabled={importing}
                      style={[styles.addThumb, importing && styles.dim]}
                      accessibilityLabel={importing ? 'Adding clips' : 'Add clips'}>
                      <SymbolView name={importing ? 'hourglass' : 'plus'} size={22} tintColor={colors.textPrimary} />
                    </PressableScale>
                  )}
                </ScrollView>
              </View>
            )}
          </Card>
        </View>

        <View style={[styles.gutter, styles.block]}>
          <EditsChecklist batch={batch} clips={clips} />
        </View>

        {/* Style: how the checked edits look. */}
        <View style={[styles.gutter, styles.block]}>
          <AppText variant="section">Style</AppText>
          <ChipGroup>
            {PRESET_OPTIONS.filter((p) => p.id !== 'custom').map((p) => (
              <Chip key={p.id} label={p.name} selected={preset.presetId === p.id} onPress={() => setPresetId(p.id)} />
            ))}
            {preset.presetId === 'custom' && <Chip label="Custom" selected />}
          </ChipGroup>
        </View>

        <View style={[styles.gutter, styles.sectionHead]}>
          <AppText variant="bodyStrong">Captions</AppText>
          <PressableScale
            haptic={false}
            onPress={() => router.push({ pathname: '/editor/captions', params: { batchId } })}
            accessibilityRole="link">
            <AppText variant="label" color={colors.textSecondary}>
              All options
            </AppText>
          </PressableScale>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
          {CAPTION_PRESETS.map((p, i) => {
            const locked = !isPro && !p.free;
            return (
              <StyleTile
                key={p.id}
                name={p.name}
                seed={i + 3}
                sample={SAMPLE}
                highlight={p.colors.active}
                animation={p.animation}
                fontFamily={CAPTION_FONTS.find((f) => f.id === p.font)?.family}
                uppercase={p.uppercase}
                maxWords={p.maxWords}
                locked={locked}
                selected={preset.captions.styleId === p.id}
                onPress={() => (locked ? router.push('/paywall') : setCaptionStyle(p.id))}
              />
            );
          })}
        </ScrollView>

        <View style={[styles.gutter, styles.stack]}>
          <View style={styles.frameBlock}>
            <AppText variant="bodyStrong">Frame</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              Used by Reframe. Tenfold fills the frame and keeps the speaker in view.
            </AppText>
            <ChipGroup>
              {FRAMES.map((f) => (
                <Chip
                  key={f}
                  label={f}
                  selected={batchAspect(preset) === f}
                  onPress={() => update((p) => ({ ...p, crop: { auto916: f === '9:16', aspect: f } }))}
                />
              ))}
            </ChipGroup>
          </View>

          <CollapsibleSection title="Fine-tune" summary="Strength, font, colour, position, audio">
                <OptionLabel>Pause cutting</OptionLabel>
                <ChipGroup>
                  {SILENCE.map((o) => (
                    <Chip
                      key={o.v}
                      label={o.l}
                      selected={a.silence === o.v}
                      onPress={() => update((p) => ({ ...p, analysis: { ...p.analysis, silence: o.v } }))}
                    />
                  ))}
                </ChipGroup>
                <OptionLabel>Filler words</OptionLabel>
                <ChipGroup>
                  {FILLERS.map((o) => (
                    <Chip
                      key={o.v}
                      label={o.l}
                      selected={a.fillers === o.v}
                      onPress={() => update((p) => ({ ...p, analysis: { ...p.analysis, fillers: o.v } }))}
                    />
                  ))}
                </ChipGroup>
                <OptionLabel>Zoom</OptionLabel>
                <ChipGroup>
                  {ZOOM.map((o) => (
                    <Chip
                      key={o.v}
                      label={o.l}
                      selected={preset.zoom.mode === o.v}
                      onPress={() => update((p) => ({ ...p, zoom: { ...p.zoom, mode: o.v } }))}
                    />
                  ))}
                </ChipGroup>
                <OptionLabel>Words on screen</OptionLabel>
                <ChipGroup>
                  {CAPTION_FORMATS.map((f) => (
                    <Chip
                      key={f.maxWords}
                      label={f.name}
                      selected={preset.captions.maxWords === f.maxWords}
                      onPress={() => update((p) => ({ ...p, captions: { ...p.captions, maxWords: f.maxWords } }))}
                    />
                  ))}
                </ChipGroup>
                <OptionLabel>Caption font</OptionLabel>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
                  {CAPTION_FONTS.map((f) => (
                    <Chip
                      key={f.id}
                      label={f.name}
                      selected={preset.captions.font === f.id}
                      onPress={() => update((p) => ({ ...p, captions: { ...p.captions, font: f.id } }))}
                    />
                  ))}
                </ScrollView>
                <OptionLabel>Highlight colour</OptionLabel>
                <View style={styles.hRow}>
                  {CAPTION_COLORS.map((c) => {
                    const selected = preset.captions.colors.active === c;
                    return (
                      <PressableScale
                        key={c}
                        accessibilityLabel={`Colour ${c}`}
                        accessibilityState={{ selected }}
                        onPress={() =>
                          update((p) => ({ ...p, captions: { ...p.captions, colors: { ...p.captions.colors, active: c } } }))
                        }
                        style={[styles.dot, { backgroundColor: c }, selected && styles.dotSelected]}
                      />
                    );
                  })}
                </View>
                <OptionLabel>Caption position</OptionLabel>
                <ChipGroup>
                  {POSITIONS.map((pos) => (
                    <Chip
                      key={pos.l}
                      label={pos.l}
                      selected={Math.abs(preset.captions.position.y - pos.y) < 0.05}
                      onPress={() => update((p) => ({ ...p, captions: { ...p.captions, position: { y: pos.y } } }))}
                    />
                  ))}
                </ChipGroup>
            <OptionLabel>Audio</OptionLabel>
            <ChipGroup>
              {AUDIO.map((o) => (
                <Chip
                  key={o.v}
                  label={o.l}
                  disabled={o.soon}
                  selected={preset.audio.mode === o.v}
                  onPress={() => update((p) => ({ ...p, audio: { mode: o.v } }))}
                />
              ))}
            </ChipGroup>
            <OptionLabel>Language</OptionLabel>
            <ChipGroup>
              <Chip label="Automatic" selected />
            </ChipGroup>
            <ToggleRow
              title="Export automatically"
              subtitle="Save each video to Photos when it's done"
              value={preset.autoExport}
              onChange={(v) => update((p) => ({ ...p, autoExport: v }))}
            />
          </CollapsibleSection>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        {!isPro && (
          <AppText variant="caption" color={colors.textSecondary} style={styles.centerText}>
            {exportsLeft} of {FREE_LIMITS.exportsPerMonth} free exports left this month · editing is unlimited
          </AppText>
        )}
        <GradientButton
          title={importing ? 'Adding clips…' : `Generate ${clips.length} ${clips.length === 1 ? 'video' : 'videos'}`}
          shape="pill"
          trailingArrow
          disabled={clips.length === 0 || importing}
          onPress={start}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gutter: { paddingHorizontal: spacing.gutter },
  stack: { gap: spacing.lg },
  block: { gap: spacing.md, marginTop: spacing.xxl },
  frameBlock: { gap: 8 },
  drop: { paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  dropEmpty: { alignItems: 'center', gap: spacing.sm },
  dim: { opacity: 0.5 },
  dropFilled: { gap: spacing.md },
  dropHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  thumbs: { gap: 8 },
  thumb: { width: 64, height: 100, borderRadius: radii.thumb - 4 },
  duration: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    paddingHorizontal: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(10,9,14,0.6)',
  },
  addThumb: {
    width: 64,
    height: 100,
    borderRadius: radii.thumb - 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.sm },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  tiles: { paddingHorizontal: spacing.gutter, gap: 12, paddingBottom: spacing.xl },
  cardRow: { flexDirection: 'row', gap: 10 },
  hRow: { flexDirection: 'row', gap: 10 },
  dot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  dotSelected: { borderColor: '#FFFFFF', borderWidth: 3 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    gap: 8,
    backgroundColor: 'rgba(10,9,14,0.92)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  centerText: { textAlign: 'center' },
  missing: { alignItems: 'center', justifyContent: 'center', gap: 16 },
});
