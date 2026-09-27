import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { batchAspect, editsOf } from '@/batch/edits';
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
// Normalize isn't built yet, so it isn't offered (docs/DESIGN.md: don't show unexplained disabled controls).
const AUDIO: { v: AudioMode; l: string }[] = [
  { v: 'original', l: 'Original' },
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
  const edits = clips.map((c) => editsOf(c, batch));
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

  const captionsOn = clips.some((_, i) => edits[i].captions);
  const reframeOn = clips.some((_, i) => edits[i].reframe);
  const limit = maxBatchSize(isPro);

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: insets.bottom + 140 }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.gutter}>
          <ScreenHeader
            title="New batch"
            right={
              <Pressable
                onPress={discard}
                hitSlop={8}
                style={styles.textButton}
                accessibilityRole="button"
                accessibilityLabel="Discard batch">
                <AppText variant="chip" color={colors.textSecondary}>
                  Discard
                </AppText>
              </Pressable>
            }
          />
        </View>

        {/* 1. Clips */}
        <View style={[styles.gutter, styles.sectionHead, styles.firstSection]}>
          <AppText variant="title" accessibilityRole="header">
            Clips
          </AppText>
          {clips.length > 0 && (
            <AppText variant="label" color={colors.textSecondary} tabular>
              {isPro ? clips.length : `${clips.length} of ${limit}`} · {formatDuration(total)}
            </AppText>
          )}
        </View>
        {clips.length === 0 ? (
          <View style={styles.gutter}>
            <Card dashed padded={false}>
              <Pressable
                onPress={() => importIntoBatch(batchId)}
                disabled={importing}
                style={({ pressed }) => [styles.dropEmpty, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={importing ? 'Adding your clips' : 'Add clips'}
                accessibilityState={{ busy: importing }}>
                <SymbolView name={importing ? 'hourglass' : 'plus'} size={20} tintColor={colors.textPrimary} weight="regular" />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{importing ? 'Adding your clips…' : 'Add clips'}</AppText>
                  <AppText variant="label" color={colors.textMuted} tabular>
                    Up to {limit} talking-head videos from Photos
                  </AppText>
                </View>
              </Pressable>
            </Card>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
              {clips.map((c) => {
                const dur = formatDuration(c.media?.durationSec ?? 0);
                return (
                  <Pressable
                    key={c.id}
                    onLongPress={() => removeClip(c.id)}
                    delayLongPress={350}
                    accessibilityLabel={`${c.title}, ${dur}`}
                    accessibilityHint="Long press to remove"
                    accessibilityActions={[{ name: 'remove', label: 'Remove clip' }]}
                    onAccessibilityAction={(e) => e.nativeEvent.actionName === 'remove' && removeClip(c.id)}
                    style={({ pressed }) => pressed && styles.pressed}>
                    <Thumb seed={seedOf(c.id)} uri={c.posterUri} style={styles.thumb}>
                      <View style={styles.duration}>
                        <AppText variant="caption" tabular>
                          {dur}
                        </AppText>
                      </View>
                    </Thumb>
                  </Pressable>
                );
              })}
              {clips.length < limit && (
                <Pressable
                  onPress={() => importIntoBatch(batchId)}
                  disabled={importing}
                  style={({ pressed }) => [styles.addThumb, (importing || pressed) && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={importing ? 'Adding clips' : 'Add clips'}
                  accessibilityState={{ busy: importing }}>
                  <SymbolView name={importing ? 'hourglass' : 'plus'} size={20} tintColor={colors.textSecondary} weight="regular" />
                </Pressable>
              )}
            </ScrollView>
            <AppText variant="caption" color={colors.textMuted} style={[styles.gutter, styles.hint]}>
              Touch and hold a clip to remove it.
            </AppText>
          </>
        )}

        {/* 2. Edits: which edits run, per video. */}
        <View style={[styles.gutter, styles.section]}>
          <EditsChecklist batch={batch} clips={clips} />
        </View>

        {/* 3. Style: how the checked edits look. Subordinate to Edits. */}
        <View style={[styles.gutter, styles.section, styles.styleSection]}>
          <View style={styles.titleBlock}>
            <AppText variant="title" accessibilityRole="header">
              Style
            </AppText>
            <AppText variant="label" color={colors.textSecondary}>
              How the checked edits look.
            </AppText>
          </View>
          <ChipGroup>
            {PRESET_OPTIONS.filter((p) => p.id !== 'custom').map((p) => (
              <Chip key={p.id} label={p.name} selected={preset.presetId === p.id} onPress={() => setPresetId(p.id)} />
            ))}
            {preset.presetId === 'custom' && <Chip label="Custom" selected />}
          </ChipGroup>
        </View>

        <View style={[styles.gutter, styles.subHead]}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">Captions</AppText>
            {clips.length > 0 && !captionsOn && (
              <AppText variant="caption" color={colors.textMuted}>
                Captions are off for every video.
              </AppText>
            )}
          </View>
          <Pressable
            onPress={() => router.push({ pathname: '/editor/captions', params: { batchId } })}
            hitSlop={8}
            style={styles.textButton}
            accessibilityRole="button"
            accessibilityLabel="All caption options">
            <AppText variant="label" color={colors.textSecondary}>
              All options
            </AppText>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tiles}
          style={clips.length > 0 && !captionsOn && styles.muted}>
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

        <View style={[styles.gutter, styles.frameBlock]}>
          <AppText variant="bodyStrong">Frame</AppText>
          <AppText variant="label" color={colors.textMuted}>
            {clips.length > 0 && !reframeOn
              ? 'Used by Reframe, which is off for every video.'
              : 'Used by Reframe. Fills the frame and keeps the speaker in view.'}
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

        {/* 4. Fine-tune */}
        <View style={[styles.gutter, styles.section]}>
          <CollapsibleSection title="Fine-tune" summary="Cut strength, zoom, caption font and colour, audio">
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
                  <Pressable
                    key={c}
                    accessibilityRole="radio"
                    accessibilityLabel={`Highlight colour ${c}`}
                    accessibilityState={{ selected }}
                    hitSlop={5}
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
                  selected={preset.audio.mode === o.v}
                  onPress={() => update((p) => ({ ...p, audio: { mode: o.v } }))}
                />
              ))}
            </ChipGroup>
            <AppText variant="caption" color={colors.textMuted}>
              Spoken language is detected automatically.
            </AppText>
            <View style={styles.divider} />
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
          <AppText variant="caption" color={colors.textSecondary} style={styles.centerText} tabular>
            {exportsLeft} of {FREE_LIMITS.exportsPerMonth} free exports left this month · editing is unlimited
          </AppText>
        )}
        {clips.length === 0 && !importing && (
          <AppText variant="caption" color={colors.textMuted} style={styles.centerText}>
            Add at least one clip to generate.
          </AppText>
        )}
        <GradientButton
          title={importing ? 'Adding clips…' : `Generate ${clips.length} ${clips.length === 1 ? 'video' : 'videos'}`}
          shape="pill"
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
  firstSection: { marginTop: spacing.lg },
  section: { marginTop: spacing.xxl + spacing.sm },
  styleSection: { gap: spacing.md },
  titleBlock: { gap: 2 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  subHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  textButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  pressed: { opacity: 0.6 },
  muted: { opacity: 0.45 },
  dropEmpty: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: 72, paddingHorizontal: spacing.xl },
  hint: { marginTop: spacing.sm },
  thumbs: { paddingHorizontal: spacing.gutter, gap: spacing.sm },
  thumb: { width: 64, height: 100, borderRadius: radii.thumb - 4, borderCurve: 'continuous' },
  duration: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    paddingHorizontal: 5,
    borderRadius: 6,
    backgroundColor: colors.overlay,
  },
  addThumb: {
    width: 64,
    height: 100,
    borderRadius: radii.thumb - 4,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiles: { paddingHorizontal: spacing.gutter, gap: spacing.md },
  frameBlock: { gap: spacing.sm, marginTop: spacing.xl },
  hRow: { flexDirection: 'row', gap: 10 },
  dot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  dotSelected: { borderColor: '#FFFFFF', borderWidth: 3 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  centerText: { textAlign: 'center' },
  missing: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: spacing.gutter },
});
