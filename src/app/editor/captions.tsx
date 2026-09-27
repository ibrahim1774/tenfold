import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTION_COLORS, CAPTION_FONTS, CAPTION_FORMATS, CAPTION_PRESETS, captionSettingsFromPreset, presetById } from '@/captions/presets';
import { AppText, Chip, ChipGroup, GradientButton, IconButton, OptionLabel, PressableScale, StyleTile, Thumb, ToggleRow } from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import { Engine, type CaptionFont, type CaptionSettings, type CaptionStyleId } from '@/engine';
import { useEntitlements } from '@/state/entitlements';
import { editsOf } from '@/batch/edits';
import { setEdit } from '@/state/batchSetup';
import { commitDoc } from '@/state/history';
import { useLibrary } from '@/state/library';

/** Styles that colour the spoken word differently; the rest use one text colour. */
function usesHighlight(id: CaptionStyleId) {
  return !['classic', 'reveal', 'none'].includes(presetById(id).animation);
}

// Edits the captions of one video (`projectId`) or the preset of a batch (`batchId`).
// Tiles are illustrations; the live preview in the editor shows the real, export-identical render.
export default function CaptionStyleSheet() {
  const insets = useSafeAreaInsets();
  const { projectId, batchId } = useLocalSearchParams<{ projectId?: string; batchId?: string }>();
  const isPro = useEntitlements((s) => s.isPro);
  const doc = useLibrary((s) => (projectId ? s.docs[projectId] : undefined));
  const batch = useLibrary((s) => (batchId ? s.batches[batchId] : undefined));
  const updateBatch = useLibrary((s) => s.updateBatch);
  const initial: CaptionSettings = doc?.captions ?? batch?.preset.captions ?? captionSettingsFromPreset('pop');
  const [styleId, setStyleId] = useState<CaptionStyleId>(initial.styleId);
  const [font, setFont] = useState<CaptionFont>(initial.font);
  const [color, setColor] = useState(usesHighlight(initial.styleId) ? initial.colors.active : initial.colors.base);
  const [size, setSize] = useState(initial.sizeScale);
  const [posY, setPosY] = useState(initial.position.y);
  const [uppercase, setUppercase] = useState(initial.uppercase);
  const [maxWords, setMaxWords] = useState(initial.maxWords);
  const [initialEnabled] = useState(() =>
    doc ? doc.captions.enabled : batch ? batch.projectIds.some((id) => editsOf(useLibrary.getState().projects[id] ?? {}, batch).captions) : true,
  );
  const [enabled, setEnabled] = useState(initialEnabled);
  const [sample, setSample] = useState('three tips that work');

  useEffect(() => {
    if (!projectId) return;
    Engine.getAnalysis(projectId)
      .then((a) => {
        const w = a.transcript?.words.slice(0, 4).map((x) => x.text.replace(/[.,!?]/g, '')) ?? [];
        if (w.length >= 2) setSample(w.join(' '));
      })
      .catch(() => {});
  }, [projectId]);

  const pickStyle = (id: CaptionStyleId) => {
    const p = presetById(id);
    setStyleId(id);
    setFont(p.font);
    setUppercase(p.uppercase);
    setPosY(p.positionY);
    setMaxWords(p.maxWords);
    setColor(usesHighlight(id) ? p.colors.active : p.colors.base);
  };

  const apply = () => {
    const p = presetById(styleId);
    const next: CaptionSettings = {
      styleId,
      font,
      sizeScale: size,
      // Styles without a highlighted word take the colour as their text colour.
      colors: usesHighlight(styleId) ? { ...p.colors, active: color } : { ...p.colors, base: color, active: color },
      position: { y: posY },
      uppercase,
      maxWords,
      enabled,
    };
    if (projectId && doc) commitDoc(projectId, { ...doc, captions: next });
    if (batchId && batch) {
      updateBatch(batchId, { preset: { ...batch.preset, presetId: 'custom', captions: next } });
      // Only flip the per-video checks when the switch was actually changed here.
      if (enabled !== initialEnabled) setEdit(batchId, 'captions', enabled);
    }
    router.back();
  };

  const applyTitle = projectId ? 'Apply to this video' : 'Apply to this batch';

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.head}>
        <AppText variant="title" accessibilityRole="header">
          Captions
        </AppText>
        <AppText variant="label" color={colors.textMuted}>
          {batchId ? 'Word-by-word captions for every video in this batch.' : 'Word-by-word captions, synced to speech.'}
        </AppText>
      </View>

      <ToggleRow title="Show captions" value={enabled} onChange={setEnabled} />

      <View style={styles.group}>
        <OptionLabel>Style</OptionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles} style={styles.bleed}>
          {CAPTION_PRESETS.map((p, i) => {
            const locked = !isPro && !p.free;
            return (
              <StyleTile
                key={p.id}
                name={p.name}
                seed={i + 3}
                sample={sample}
                highlight={styleId === p.id ? color : p.colors.active}
                animation={p.animation}
                fontFamily={CAPTION_FONTS.find((f) => f.id === (styleId === p.id ? font : p.font))?.family}
                uppercase={styleId === p.id ? uppercase : p.uppercase}
                maxWords={styleId === p.id ? maxWords : p.maxWords}
                locked={locked}
                selected={styleId === p.id}
                width={104}
                onPress={() => (locked ? router.push('/paywall') : pickStyle(p.id))}
              />
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.group}>
        <OptionLabel>Words on screen</OptionLabel>
        <ChipGroup>
          {CAPTION_FORMATS.map((f) => (
            <Chip key={f.maxWords} label={f.name} selected={maxWords === f.maxWords} onPress={() => setMaxWords(f.maxWords)} />
          ))}
        </ChipGroup>
      </View>

      <View style={styles.group}>
        <OptionLabel>Font</OptionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.bleed}>
          {CAPTION_FONTS.map((f) => (
            <Chip key={f.id} label={f.name} selected={font === f.id} onPress={() => setFont(f.id)} />
          ))}
        </ScrollView>
      </View>

      <View style={styles.group}>
        <OptionLabel>{usesHighlight(styleId) ? 'Highlight colour' : 'Text colour'}</OptionLabel>
        <View style={styles.dots}>
          {CAPTION_COLORS.map((c) => (
            <PressableScale
              key={c}
              haptic={false}
              scaleTo={0.9}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={COLOR_NAMES[c] ?? c}
              accessibilityState={{ selected: color === c }}
              onPress={() => setColor(c)}
              style={[styles.dot, { backgroundColor: c }, color === c && styles.dotSelected]}
            />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <OptionLabel>Size</OptionLabel>
        <View style={styles.stepper}>
          <IconButton icon="minus" label="Smaller" onPress={() => setSize((s) => Math.max(0.7, +(s - 0.1).toFixed(1)))} disabled={size <= 0.7} />
          <AppText variant="bodyStrong" tabular style={styles.stepperValue} accessibilityLabel={`Size ${Math.round(size * 100)} percent`}>
            {Math.round(size * 100)}%
          </AppText>
          <IconButton icon="plus" label="Larger" onPress={() => setSize((s) => Math.min(1.5, +(s + 0.1).toFixed(1)))} disabled={size >= 1.5} />
        </View>
      </View>

      <View style={styles.group}>
        <OptionLabel>Position</OptionLabel>
        <View style={styles.frameRow}>
          <Thumb seed={0} style={styles.miniFrame}>
            <View style={[styles.zone, { top: 0, height: '12%' }]} />
            <View style={[styles.zone, { bottom: 0, height: '30%' }]} />
            <View style={[styles.handle, { top: `${posY * 100 - 4}%` }]}>
              <AppText style={[styles.handleText, { color }]}>Aa</AppText>
            </View>
          </Thumb>
          <View style={styles.posButtons}>
            <View style={styles.posRow}>
              <IconButton icon="arrow.up" label="Move captions up" onPress={() => setPosY((y) => Math.max(0.12, y - 0.04))} disabled={posY <= 0.12} />
              <IconButton icon="arrow.down" label="Move captions down" onPress={() => setPosY((y) => Math.min(0.7, y + 0.04))} disabled={posY >= 0.7} />
            </View>
            <AppText variant="caption" color={colors.textMuted}>
              Shaded areas are covered by TikTok and Reels buttons.
            </AppText>
          </View>
        </View>
      </View>

      <ToggleRow title="All caps" value={uppercase} onChange={setUppercase} />
      <GradientButton title={applyTitle} shape="pill" onPress={apply} style={styles.apply} />
    </ScrollView>
  );
}

const COLOR_NAMES: Record<string, string> = {
  '#FFE14D': 'Yellow',
  '#7C4DFF': 'Violet',
  '#FF3DCB': 'Pink',
  '#4DD8FF': 'Cyan',
  '#FF7A59': 'Coral',
  '#5BE3A5': 'Green',
  '#FFFFFF': 'White',
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.xl },
  head: { gap: 2 },
  group: { gap: spacing.sm },
  bleed: { marginHorizontal: -spacing.xl },
  tiles: { gap: 10, paddingVertical: 4, paddingHorizontal: spacing.xl },
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.xl },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  dotSelected: { borderColor: colors.textPrimary, borderWidth: 3 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stepperValue: { minWidth: 52, textAlign: 'center' },
  frameRow: { flexDirection: 'row', gap: spacing.lg },
  miniFrame: { width: 110, aspectRatio: 9 / 16, borderRadius: radii.thumb },
  zone: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(255,90,110,0.22)' },
  handle: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  handleText: { fontWeight: '700', fontSize: 16 },
  posButtons: { flex: 1, gap: spacing.md },
  posRow: { flexDirection: 'row', gap: spacing.md },
  apply: { marginTop: spacing.sm },
});
