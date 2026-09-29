import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTION_COLORS, CAPTION_FONTS, CAPTION_FORMATS, CAPTION_PRESETS } from '@/captions/presets';
import {
  AppText,
  Background,
  Chip,
  ChipGroup,
  CollapsibleSection,
  GlassCapsule,
  GlassSurface,
  GradientButton,
  OptionLabel,
  OutlineButton,
  ScreenHeader,
  Thumb,
  ToggleRow,
  seedOf,
} from '@/design/components';
import { colors, radii, sizes, spacing } from '@/design/tokens';
import type { AudioMode, FillerLevel, SilenceLevel, ZoomMode } from '@/engine/types';
import { importIntoBatch, useImporting } from '@/batch/importClips';
import { startBatch } from '@/batch/queue';
import { setCaptionStyle as setStyle, setPresetId as setPreset, updatePreset } from '@/state/batchSetup';
import { usePaywallGate } from '@/monetization/superwall';
import { lowestTierWhere, nextTier } from '@/onboarding/plans';
import {
  captionStyleUnlocked,
  exportLimit,
  exportsLeft as tierExportsLeft,
  maxBatchSize,
  tierOf,
  TIER_NAMES,
  useEntitlements,
} from '@/state/entitlements';
import { tourTarget } from '@/tour/targets';
import { formatDuration, projectsOf, useLibrary } from '@/state/library';
import { PRESET_OPTIONS } from '@/state/presets';
import { BatchEdits } from '@/batch/BatchEdits';
import { batchAspect, batchEdits, editsOf, sameEdits } from '@/batch/edits';
import { Engine } from '@/engine';

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
const FRAMES = ['9:16', '4:5', '1:1', '16:9'] as const;

// Footer: top padding + primary button + the gap under it (the bottom inset is added at render).
const FOOTER = 12 + sizes.ctaHeight + 8;
const FOOTER_NOTE = 16 + 8; // one caption line + its gap

export default function BatchSetupScreen() {
  const insets = useSafeAreaInsets();
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const batch = useLibrary((s) => s.batches[batchId]);
  const projects = useLibrary((s) => s.projects);
  const deleteBatch = useLibrary((s) => s.deleteBatch);
  const importing = useImporting((s) => s.busy);
  const ent = useEntitlements();
  const tier = tierOf(ent);
  const exportsLeft = tierExportsLeft(ent);
  const monthlyExports = exportLimit(tier);
  const limitedExports = Number.isFinite(monthlyExports);
  const gate = usePaywallGate();

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
  const a = preset.analysis;
  const edits = clips.map((c) => editsOf(c, batch));
  const common = batchEdits(edits);
  const update = (patch: Parameters<typeof updatePreset>[1]) => updatePreset(batchId, patch);
  const setPresetId = (id: Parameters<typeof setPreset>[1]) => setPreset(batchId, id);
  const setCaptionStyle = (id: Parameters<typeof setStyle>[1]) => setStyle(batchId, id);
  const openClip = (projectId: string) => router.push({ pathname: '/batch/clip', params: { batchId, projectId } });

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

  const captionsOn = edits.some((e) => e.captions);
  const reframeOn = edits.some((e) => e.reframe);
  const limit = maxBatchSize(tier);
  const full = clips.length >= limit;
  // A full batch keeps its + tile while a bigger plan exists; tapping it asks Superwall (batch_limit).
  const canGrow = nextTier(tier) !== null;
  const captionUnlockTier = lowestTierWhere((l) => l.allCaptionStyles) ?? 'starter';
  const footerNotes = (limitedExports ? 1 : 0) + (clips.length === 0 && !importing ? 1 : 0);

  const roomNow = () => {
    const b = useLibrary.getState().batches[batchId];
    return maxBatchSize(tierOf(useEntitlements.getState())) - (b?.projectIds.length ?? 0);
  };
  const addClips = () => {
    if (!full) {
      importIntoBatch(batchId);
      return;
    }
    // Gated: after an upgrade the picker opens again with the new plan's room.
    gate({
      placement: 'batch_limit',
      params: { clips: clips.length, limit },
      allowed: () => roomNow() > 0,
      run: () => importIntoBatch(batchId),
    });
  };
  const pickCaptionStyle = (id: (typeof CAPTION_PRESETS)[number]['id'], free: boolean) => {
    if (captionStyleUnlocked(tier, free)) {
      setCaptionStyle(id);
      return;
    }
    gate({
      placement: 'caption_style_locked',
      params: { style: id },
      allowed: () => captionStyleUnlocked(tierOf(useEntitlements.getState()), free),
      run: () => setCaptionStyle(id),
    });
  };
  const footerHeight = FOOTER + footerNotes * FOOTER_NOTE + insets.bottom;

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: footerHeight + spacing.lg }}
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

        {/* 1. Clips: one sideways strip, so 10 clips take the height of 3. Tap a clip for its edits. */}
        <View style={[styles.gutter, styles.head, styles.firstBlock]}>
          <AppText variant="title" accessibilityRole="header">
            Clips
          </AppText>
          {clips.length > 0 && (
            <AppText variant="label" color={colors.textSecondary} tabular>
              {full ? `${TIER_NAMES[tier]} plan: up to ${limit} clips per batch` : `${clips.length} of ${limit}`}
            </AppText>
          )}
        </View>
        <View ref={tourTarget('setup.clips')} collapsable={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {clips.map((c, i) => {
            const n = c.clips?.length ?? 1;
            const dur = n > 1 ? `${n} clips · ${formatDuration(c.media?.durationSec ?? 0)}` : formatDuration(c.media?.durationSec ?? 0);
            const differs = common !== null && !sameEdits(edits[i], common);
            return (
              <Pressable
                key={c.id}
                onPress={() => openClip(c.id)}
                accessibilityRole="button"
                accessibilityLabel={`${c.title}, ${dur}${differs ? ', different edits' : ''}`}
                accessibilityHint="Shows this clip's edits"
                style={({ pressed }) => pressed && styles.pressed}>
                <Thumb seed={seedOf(c.id)} uri={c.posterUri} style={styles.thumb}>
                  {differs && (
                    <GlassSurface variant="clear" pointerEvents="none" style={styles.differs}>
                      <SymbolView name="slider.horizontal.3" size={10} tintColor={colors.textPrimary} weight="semibold" />
                    </GlassSurface>
                  )}
                  <GlassCapsule variant="clear" pointerEvents="none" style={styles.duration}>
                    <AppText variant="caption" tabular numberOfLines={1}>
                      {dur}
                    </AppText>
                  </GlassCapsule>
                </Thumb>
              </Pressable>
            );
          })}
          {(!full || canGrow) && (
            <Pressable
              onPress={addClips}
              disabled={importing}
              style={({ pressed }) => [styles.addTile, (importing || pressed) && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={importing ? 'Adding clips' : 'Add clips'}
              accessibilityHint={full ? `The ${TIER_NAMES[tier]} plan holds ${limit} clips per batch. Shows bigger plans.` : undefined}
              accessibilityState={{ busy: importing }}>
              <SymbolView name={importing ? 'hourglass' : 'plus'} size={20} tintColor={colors.textPrimary} weight="regular" />
            </Pressable>
          )}
          {clips.length === 0 && (
            <View style={styles.emptyNote}>
              <AppText variant="label" color={colors.textSecondary} tabular>
                {importing ? 'Adding your clips…' : `Add up to ${limit} clips from Photos`}
              </AppText>
            </View>
          )}
        </ScrollView>
        </View>

        {/* 2. Edits: what runs, for the whole batch. */}
        <View ref={tourTarget('setup.edits')} collapsable={false} style={[styles.gutter, styles.block]}>
          <BatchEdits batch={batch} clips={clips} selections={edits} />
        </View>

        {/* 3. Style: how the edits look. */}
        <View style={[styles.gutter, styles.head, styles.headAction, styles.block]}>
          <AppText variant="title" accessibilityRole="header">
            Style
          </AppText>
          <Pressable
            onPress={() => router.push({ pathname: '/editor/captions', params: { batchId } })}
            hitSlop={6}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="All caption options">
            <AppText variant="chip" color={colors.textSecondary}>
              More…
            </AppText>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {PRESET_OPTIONS.filter((p) => p.id !== 'custom').map((p) => (
            <Chip key={p.id} label={p.name} selected={preset.presetId === p.id} onPress={() => setPresetId(p.id)} />
          ))}
          {preset.presetId === 'custom' && <Chip label="Custom" selected />}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={clips.length > 0 && !captionsOn && styles.muted}>
          {CAPTION_PRESETS.map((p) => {
            const locked = !captionStyleUnlocked(tier, p.free);
            return (
              <Chip
                key={p.id}
                label={p.name}
                locked={locked}
                lockLabel={TIER_NAMES[captionUnlockTier]}
                selected={preset.captions.styleId === p.id}
                onPress={() => pickCaptionStyle(p.id, p.free)}
              />
            );
          })}
        </ScrollView>
        {clips.length > 0 && !captionsOn && (
          <AppText variant="caption" color={colors.textMuted} style={[styles.gutter, styles.note]}>
            Captions are off for every clip.
          </AppText>
        )}

        {/* 4. Frame: the ratio Reframe crops to. */}
        <View style={[styles.gutter, styles.head, styles.block]}>
          <AppText variant="title" accessibilityRole="header">
            Frame
          </AppText>
          <AppText variant="label" color={colors.textMuted}>
            {clips.length > 0 && !reframeOn ? 'Reframe is off' : 'Used by Reframe'}
          </AppText>
        </View>
        <View style={[styles.gutter, styles.frameRow]}>
          <ChipGroup>
            {FRAMES.map((f) => (
              <Chip
                key={f}
                label={f}
                hitSlop={4}
                selected={batchAspect(preset) === f}
                onPress={() => update((p) => ({ ...p, crop: { auto916: f === '9:16', aspect: f } }))}
              />
            ))}
          </ChipGroup>
        </View>

        {/* 5. Fine-tune */}
        <View style={[styles.gutter, styles.block]}>
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
        {limitedExports && (
          <AppText variant="caption" color={colors.textSecondary} style={styles.centerText} tabular>
            {exportsLeft} of {monthlyExports} exports left this month · editing is unlimited
          </AppText>
        )}
        {clips.length === 0 && !importing && (
          <AppText variant="caption" color={colors.textMuted} style={styles.centerText}>
            Add at least one clip to generate.
          </AppText>
        )}
        <View ref={tourTarget('setup.generate')} collapsable={false}>
          <GradientButton
            title={importing ? 'Adding clips…' : `Generate ${clips.length} ${clips.length === 1 ? 'video' : 'videos'}`}
            shape="pill"
            disabled={clips.length === 0 || importing}
            onPress={start}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gutter: { paddingHorizontal: spacing.gutter },
  firstBlock: { marginTop: spacing.lg },
  block: { marginTop: spacing.lg },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 25,
    marginBottom: spacing.sm,
  },
  headAction: { minHeight: 32 },
  textButton: { minHeight: 32, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  pressed: { opacity: 0.6 },
  muted: { opacity: 0.45 },
  strip: { paddingHorizontal: spacing.gutter, gap: spacing.sm },
  thumb: { width: 64, height: 88, borderRadius: radii.thumb, borderCurve: 'continuous' },
  // A clear glass badge over the frame; bounded on both sides so a long label truncates inside the tile.
  duration: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    maxWidth: 56,
    minHeight: 20,
    paddingHorizontal: 6,
    gap: 0,
  },
  differs: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: 64,
    height: 88,
    borderRadius: radii.thumb,
    borderCurve: 'continuous',
    backgroundColor: colors.cardHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyNote: { height: 88, justifyContent: 'center', paddingLeft: spacing.xs },
  // 36 pt chips + 4 pt above and below = 44 pt touch targets inside the sideways rows (a ScrollView clips hitSlop).
  chipRow: { paddingHorizontal: spacing.gutter, paddingVertical: 4, gap: spacing.sm },
  note: { marginTop: spacing.xs },
  frameRow: { paddingVertical: 4 },
  hRow: { flexDirection: 'row', gap: 10 },
  dot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.border },
  dotSelected: { borderColor: '#FFFFFF', borderWidth: 3 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginVertical: spacing.xs },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  centerText: { textAlign: 'center' },
  missing: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: spacing.gutter },
});
