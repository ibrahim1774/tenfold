import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTION_COLORS, CAPTION_FONTS, CAPTION_PRESETS } from '@/captions/presets';
import {
  AppText,
  Background,
  Chip,
  ChipGroup,
  CollapsibleSection,
  GradientButton,
  OptionLabel,
  PressableScale,
  ScreenHeader,
  ToggleRow,
} from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import type { AudioMode, FillerLevel, SilenceLevel, ZoomMode } from '@/engine/types';
import { formatDuration, mockProjects } from '@/mock/data';
import { useBatchSetup } from '@/state/batchSetup';
import { FREE_LIMITS, useEntitlements } from '@/state/entitlements';
import { PRESET_OPTIONS } from '@/state/presets';

const SILENCE: { v: SilenceLevel; l: string }[] = [
  { v: 'off', l: 'Off' },
  { v: 'light', l: 'Light' },
  { v: 'medium', l: 'Medium' },
  { v: 'aggressive', l: 'Aggressive' },
];
const FILLERS: { v: FillerLevel; l: string }[] = [
  { v: 'off', l: 'Off' },
  { v: 'standard', l: 'Standard' },
  { v: 'aggressive', l: 'Aggressive' },
];
const ZOOM: { v: ZoomMode; l: string }[] = [
  { v: 'off', l: 'Off' },
  { v: 'subtle', l: 'Subtle' },
  { v: 'dynamic', l: 'Dynamic' },
];
const AUDIO: { v: AudioMode; l: string; soon?: boolean }[] = [
  { v: 'original', l: 'Keep original' },
  { v: 'normalize', l: 'Normalize', soon: true },
  { v: 'mute', l: 'Mute' },
];
const POSITIONS = [
  { y: 0.2, l: 'Top' },
  { y: 0.5, l: 'Middle' },
  { y: 0.66, l: 'Lower' },
];

export default function BatchSetupScreen() {
  const insets = useSafeAreaInsets();
  const { clipIds, preset, captionsOff, setPresetId, update, setCaptionStyle, removeClip } = useBatchSetup();
  const { isPro, exportsUsedThisMonth } = useEntitlements();
  const clips = clipIds.map((id) => mockProjects.find((p) => p.id === id)!).filter(Boolean);
  const exportsLeft = FREE_LIMITS.exportsPerMonth - exportsUsedThisMonth;
  const presetName = PRESET_OPTIONS.find((p) => p.id === preset.presetId)?.name ?? 'Custom';
  const captionName = captionsOff
    ? 'Off'
    : (CAPTION_PRESETS.find((p) => p.id === preset.captions.styleId)?.name ?? '');

  const start = () => {
    // M4: create batch + projects in SQLite, then TenfoldEngine.enqueueAnalysis(ids, preset.analysis).
    router.replace({ pathname: '/batch/[batchId]', params: { batchId: 'b1' } });
  };

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 120, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.gutter}>
          <ScreenHeader title="Batch setup" />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {clips.map((c) => (
            <PressableScale
              key={c.id}
              onLongPress={() => removeClip(c.id)}
              accessibilityLabel={`${c.title}, ${formatDuration(c.durationSec)}. Long press to remove.`}
              style={[styles.thumb, { backgroundColor: c.thumbColor }]}>
              <View style={styles.duration}>
                <AppText variant="caption">{formatDuration(c.durationSec)}</AppText>
              </View>
            </PressableScale>
          ))}
        </ScrollView>

        <View style={[styles.gutter, styles.stack]}>
          <CollapsibleSection title="Preset" summary={presetName} initiallyOpen>
            <ChipGroup>
              {PRESET_OPTIONS.map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  selected={preset.presetId === p.id}
                  onPress={() => (p.id === 'custom' ? update((x) => x) : setPresetId(p.id))}
                />
              ))}
            </ChipGroup>
            <AppText variant="caption" color={colors.textMuted}>
              {PRESET_OPTIONS.find((p) => p.id === preset.presetId)?.blurb}
            </AppText>
          </CollapsibleSection>

          <CollapsibleSection title="Captions" summary={captionName} initiallyOpen>
            <ChipGroup>
              {CAPTION_PRESETS.map((p) => {
                const locked = !isPro && !p.free;
                return (
                  <Chip
                    key={p.id}
                    label={p.name}
                    locked={locked}
                    selected={!captionsOff && preset.captions.styleId === p.id}
                    onPress={() => (locked ? router.push('/paywall') : setCaptionStyle(p.id))}
                  />
                );
              })}
              <Chip label="Off" selected={captionsOff} onPress={() => setCaptionStyle('off')} />
            </ChipGroup>
            {!captionsOff && (
              <>
                <OptionLabel>Font</OptionLabel>
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
                <OptionLabel>Position</OptionLabel>
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
                <AppText variant="caption" color={colors.textMuted}>
                  Lower keeps captions clear of TikTok and Reels buttons.
                </AppText>
              </>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Cleanup"
            summary={`Silence ${preset.analysis.silence}, fillers ${preset.analysis.fillers}`}>
            <OptionLabel>Silence</OptionLabel>
            <ChipGroup>
              {SILENCE.map((o) => (
                <Chip
                  key={o.v}
                  label={o.l}
                  selected={preset.analysis.silence === o.v}
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
                  selected={preset.analysis.fillers === o.v}
                  onPress={() => update((p) => ({ ...p, analysis: { ...p.analysis, fillers: o.v } }))}
                />
              ))}
            </ChipGroup>
            <OptionLabel>Language</OptionLabel>
            <ChipGroup>
              <Chip label="Auto (English)" selected />
            </ChipGroup>
          </CollapsibleSection>

          <CollapsibleSection
            title="Zoom & Crop"
            summary={`Zoom ${preset.zoom.mode}${preset.crop.auto916 ? ', 9:16' : ''}`}>
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
            <ToggleRow
              title="Auto 9:16 crop"
              subtitle="Reframe landscape clips around the speaker"
              value={preset.crop.auto916}
              onChange={(v) => update((p) => ({ ...p, crop: { auto916: v } }))}
            />
            <ToggleRow
              title="Follow face"
              subtitle="Zooms and crop track the speaker"
              value={preset.zoom.faceFollow}
              onChange={(v) => update((p) => ({ ...p, zoom: { ...p.zoom, faceFollow: v } }))}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Audio" summary={AUDIO.find((a) => a.v === preset.audio.mode)?.l}>
            <ChipGroup>
              {AUDIO.map((o) => (
                <Chip
                  key={o.v}
                  label={o.soon ? `${o.l} (soon)` : o.l}
                  disabled={o.soon}
                  selected={preset.audio.mode === o.v}
                  onPress={() => update((p) => ({ ...p, audio: { mode: o.v } }))}
                />
              ))}
            </ChipGroup>
            <ToggleRow
              title="Export automatically"
              subtitle="Save each video to Photos as soon as it's ready"
              value={preset.autoExport}
              onChange={(v) => update((p) => ({ ...p, autoExport: v }))}
            />
          </CollapsibleSection>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        {!isPro && (
          <AppText variant="caption" color={colors.textSecondary} style={styles.centerText}>
            {exportsLeft} of {FREE_LIMITS.exportsPerMonth} free exports left this month
          </AppText>
        )}
        <GradientButton
          title={`Edit all ${clips.length} ${clips.length === 1 ? 'video' : 'videos'}`}
          disabled={clips.length === 0}
          onPress={start}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gutter: { paddingHorizontal: spacing.gutter },
  stack: { gap: spacing.md },
  thumbs: { paddingHorizontal: spacing.gutter, gap: 10 },
  thumb: { width: 72, height: 110, borderRadius: radii.thumb, borderWidth: 2, borderColor: '#FFFFFF' },
  duration: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(15,18,34,0.6)',
  },
  hRow: { flexDirection: 'row', gap: 10 },
  dot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  dotSelected: { borderColor: '#FFFFFF', borderWidth: 3 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    gap: 8,
    backgroundColor: 'rgba(15,18,34,0.85)',
  },
  centerText: { textAlign: 'center' },
});
