import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { editsOf } from '@/batch/edits';
import { ColorChoices } from '@/captions/ColorChoices';
import { CAPTION_FONTS, CAPTION_FORMATS, lookOf, presetById, withLook, type CaptionAnimation } from '@/captions/presets';
import { ColorRow, CheckRow, NavRow, RowBody, SegmentRow, SettingsGroup, SwitchRow } from '@/captions/SettingsRows';
import { useCaptionTarget } from '@/captions/useCaptionTarget';
import { AppText, GradientButton, IconButton, Thumb } from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import type { CaptionBackground, CaptionOutline, CaptionSettings } from '@/engine';
import { playCaptionSample } from '@/editor/previewBus';
import { setEdit } from '@/state/batchSetup';
import { useLibrary } from '@/state/library';

type ColorKey = keyof CaptionSettings['colors'];

const COLOR_ROWS: { key: ColorKey; label: string }[] = [
  { key: 'base', label: 'Text colour' },
  { key: 'active', label: 'Highlight colour' },
  { key: 'stroke', label: 'Outline colour' },
  { key: 'bg', label: 'Box colour' },
];

const BACKGROUNDS: { value: CaptionBackground; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'box', label: 'Box' },
  { value: 'translucent', label: 'Translucent' },
  { value: 'highlight', label: 'Highlight' },
];

const OUTLINES: { value: CaptionOutline; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'thin', label: 'Thin' },
  { value: 'thick', label: 'Thick' },
];

/** How the spoken word is shown. The TikTok box and highlight-pill presets animate nothing, so read as None. */
const ANIMATIONS: { value: CaptionAnimation; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'pop', label: 'Pop' },
  { value: 'box', label: 'Colour the spoken word' },
  { value: 'karaoke', label: 'Karaoke' },
  { value: 'underline', label: 'Underline' },
  { value: 'neon', label: 'Neon' },
  { value: 'reveal', label: 'Word by word' },
];
const shownAnimation = (a: CaptionAnimation): CaptionAnimation => (a === 'classic' || a === 'highlight' ? 'none' : a);

const WORD_COUNTS = CAPTION_FORMATS.map((f) => ({ value: String(f.maxWords), label: f.name }));

// Captions of one video (`projectId`) or of a batch's preset (`batchId`). Every change applies at once:
// for a video it is an undoable edit the live preview behind the sheet re-renders immediately.
export default function CaptionsSheet() {
  const insets = useSafeAreaInsets();
  const { projectId, batchId } = useLocalSearchParams<{ projectId?: string; batchId?: string }>();
  const { settings, update } = useCaptionTarget(projectId, batchId);
  const batchCaptionsOn = useLibrary((s) => {
    const b = batchId ? s.batches[batchId] : undefined;
    return b ? b.projectIds.some((id) => editsOf(s.projects[id] ?? {}, b).captions) : true;
  });
  const [openColor, setOpenColor] = useState<ColorKey | null>(null);

  if (!settings) {
    return (
      <View style={[styles.content, styles.missing]}>
        <AppText variant="bodyStrong">These captions are no longer available.</AppText>
        <GradientButton title="Close" shape="pill" onPress={() => router.back()} />
      </View>
    );
  }

  const look = lookOf(settings);
  const enabled = projectId ? settings.enabled : batchCaptionsOn;
  const setEnabled = (v: boolean) => {
    if (projectId) update((c) => ({ ...c, enabled: v }));
    else if (batchId) setEdit(batchId, 'captions', v);
  };
  const fontName = CAPTION_FONTS.find((f) => f.id === settings.font)?.name ?? 'Poppins';
  const params = projectId ? { projectId } : { batchId: batchId ?? '' };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <AppText variant="title" accessibilityRole="header">
            Captions
          </AppText>
          <AppText variant="label" color={colors.textMuted}>
            {batchId ? 'Word-by-word captions for every video in this batch.' : 'Changes show in the preview straight away.'}
          </AppText>
        </View>
        {projectId && (
          <Pressable
            onPress={() => playCaptionSample(3)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Play 3 seconds"
            accessibilityHint="Plays the video from the first caption for 3 seconds."
            style={styles.play}>
            <AppText variant="chip" color={colors.accentText}>
              Play 3 s
            </AppText>
          </Pressable>
        )}
      </View>

      <SettingsGroup>
        <SwitchRow label="Show captions" value={enabled} onChange={setEnabled} />
      </SettingsGroup>

      <SettingsGroup label="Look">
        <NavRow
          label="Style"
          value={presetById(settings.styleId).name}
          hint="Opens the list of caption styles."
          onPress={() => router.push({ pathname: '/editor/style-picker', params })}
        />
        <NavRow label="Font" value={fontName} hint="Opens the list of fonts." onPress={() => router.push({ pathname: '/editor/font-picker', params })} />
        <SegmentRow label="Background" options={BACKGROUNDS} value={look.background} onChange={(v) => update((c) => withLook(c, { background: v }))} />
        <SegmentRow label="Outline" options={OUTLINES} value={look.outline} onChange={(v) => update((c) => withLook(c, { outline: v }))} />
        <SwitchRow label="Shadow" value={look.shadow} onChange={(v) => update((c) => withLook(c, { shadow: v }))} />
      </SettingsGroup>

      <SettingsGroup label="Colours">
        {COLOR_ROWS.flatMap((r) => {
          const row = (
            <ColorRow
              key={r.key}
              label={r.label}
              color={settings.colors[r.key]}
              open={openColor === r.key}
              onPress={() => setOpenColor(openColor === r.key ? null : r.key)}
            />
          );
          if (openColor !== r.key) return [row];
          return [
            row,
            <ColorChoices
              key={`${r.key}-choices`}
              value={settings.colors[r.key]}
              onPick={(hex) => update((c) => withLook(c, { colors: { ...c.colors, [r.key]: hex } }))}
            />,
          ];
        })}
      </SettingsGroup>

      <SettingsGroup label="Layout" footer="Shaded areas are covered by TikTok and Reels buttons.">
        <View style={styles.stepRow}>
          <AppText variant="body" style={styles.flex}>
            Size
          </AppText>
          <IconButton
            icon="minus"
            label="Smaller"
            size={36}
            onPress={() => update((c) => ({ ...c, sizeScale: Math.max(0.7, +(c.sizeScale - 0.1).toFixed(1)) }))}
            disabled={settings.sizeScale <= 0.7}
          />
          <AppText variant="bodyStrong" tabular style={styles.stepValue} accessibilityLabel={`Size ${Math.round(settings.sizeScale * 100)} percent`}>
            {Math.round(settings.sizeScale * 100)}%
          </AppText>
          <IconButton
            icon="plus"
            label="Larger"
            size={36}
            onPress={() => update((c) => ({ ...c, sizeScale: Math.min(1.5, +(c.sizeScale + 0.1).toFixed(1)) }))}
            disabled={settings.sizeScale >= 1.5}
          />
        </View>
        <RowBody>
          <View style={styles.positionRow}>
            <AppText variant="body" style={styles.flex}>
              Position
            </AppText>
            <Thumb seed={0} style={styles.miniFrame}>
              <View style={[styles.zone, { top: 0, height: '12%' }]} />
              <View style={[styles.zone, { bottom: 0, height: '30%' }]} />
              <View style={[styles.handle, { top: `${settings.position.y * 100 - 5}%` }]}>
                <AppText variant="caption" style={[styles.handleText, { color: settings.colors.active }]}>
                  Aa
                </AppText>
              </View>
            </Thumb>
            <IconButton
              icon="arrow.up"
              label="Move captions up"
              size={36}
              onPress={() => update((c) => ({ ...c, position: { y: Math.max(0.12, +(c.position.y - 0.04).toFixed(2)) } }))}
              disabled={settings.position.y <= 0.12}
            />
            <IconButton
              icon="arrow.down"
              label="Move captions down"
              size={36}
              onPress={() => update((c) => ({ ...c, position: { y: Math.min(0.7, +(c.position.y + 0.04).toFixed(2)) } }))}
              disabled={settings.position.y >= 0.7}
            />
          </View>
        </RowBody>
        <SwitchRow label="All caps" value={settings.uppercase} onChange={(v) => update((c) => withLook(c, { uppercase: v }))} />
        <SegmentRow
          label="Words on screen"
          options={WORD_COUNTS}
          value={String(settings.maxWords)}
          onChange={(v) => update((c) => ({ ...c, maxWords: Number(v) }))}
        />
      </SettingsGroup>

      <SettingsGroup label="Animation">
        {ANIMATIONS.map((a) => (
          <CheckRow
            key={a.value}
            label={a.label}
            checked={shownAnimation(look.animation) === a.value}
            onPress={() => shownAnimation(look.animation) !== a.value && update((c) => withLook(c, { animation: a.value }))}
          />
        ))}
      </SettingsGroup>

      <GradientButton title="Done" shape="pill" onPress={() => router.back()} style={styles.done} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.xl },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headText: { flex: 1, gap: 2 },
  play: { minHeight: 44, justifyContent: 'center' },
  stepRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  stepValue: { minWidth: 48, textAlign: 'center' },
  positionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  miniFrame: { width: 54, aspectRatio: 9 / 16, borderRadius: radii.thumb },
  zone: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(255,90,110,0.22)' },
  handle: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  handleText: { fontWeight: '700' },
  done: { marginTop: spacing.sm },
});
