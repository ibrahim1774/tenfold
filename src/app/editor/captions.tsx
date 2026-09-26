import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTION_COLORS, CAPTION_FONTS, CAPTION_FORMATS, CAPTION_PRESETS, captionSettingsFromPreset, presetById } from '@/captions/presets';
import { AppText, Chip, GradientButton, IconButton, OptionLabel, PressableScale, StyleTile, Thumb, ToggleRow } from '@/design/components';
import { colors, fonts, radii, spacing } from '@/design/tokens';
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

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <AppText variant="title">Caption style</AppText>
      <ToggleRow title="Captions" subtitle="Word-by-word, synced to speech" value={enabled} onChange={setEnabled} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
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

      <OptionLabel>Words on screen</OptionLabel>
      <View style={styles.row}>
        {CAPTION_FORMATS.map((f) => (
          <Chip key={f.maxWords} label={f.name} selected={maxWords === f.maxWords} onPress={() => setMaxWords(f.maxWords)} />
        ))}
      </View>

      <OptionLabel>Font</OptionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {CAPTION_FONTS.map((f) => (
          <Chip key={f.id} label={f.name} selected={font === f.id} onPress={() => setFont(f.id)} />
        ))}
      </ScrollView>

      <OptionLabel>{usesHighlight(styleId) ? 'Highlight colour' : 'Text colour'}</OptionLabel>
      <View style={styles.row}>
        {CAPTION_COLORS.map((c) => (
          <PressableScale
            key={c}
            accessibilityLabel={`Colour ${c}`}
            accessibilityState={{ selected: color === c }}
            onPress={() => setColor(c)}
            style={[styles.dot, { backgroundColor: c }, color === c && styles.dotSelected]}
          />
        ))}
      </View>

      <OptionLabel>Size</OptionLabel>
      <View style={styles.stepper}>
        <IconButton icon="minus" label="Smaller" onPress={() => setSize((s) => Math.max(0.7, +(s - 0.1).toFixed(1)))} />
        <AppText variant="bodyStrong">{Math.round(size * 100)}%</AppText>
        <IconButton icon="plus" label="Larger" onPress={() => setSize((s) => Math.min(1.5, +(s + 0.1).toFixed(1)))} />
      </View>

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
          <IconButton icon="arrow.up" label="Move captions up" onPress={() => setPosY((y) => Math.max(0.12, y - 0.04))} />
          <IconButton icon="arrow.down" label="Move captions down" onPress={() => setPosY((y) => Math.min(0.7, y + 0.04))} />
          <AppText variant="caption" color={colors.textMuted} style={styles.zoneHint}>
            Shaded areas are covered by TikTok and Reels buttons.
          </AppText>
        </View>
      </View>

      <ToggleRow title="All caps" value={uppercase} onChange={setUppercase} />
      <GradientButton title="Apply" icon={false} shape="pill" onPress={apply} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md },
  tiles: { gap: 10, paddingVertical: 4 },
  row: { flexDirection: 'row', gap: 10 },
  dot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  dotSelected: { borderColor: '#FFFFFF', borderWidth: 3 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  frameRow: { flexDirection: 'row', gap: spacing.lg },
  miniFrame: { width: 110, aspectRatio: 9 / 16, borderRadius: radii.thumb },
  zone: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(255,90,110,0.22)' },
  handle: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  handleText: { fontFamily: fonts.bold, fontSize: 16 },
  posButtons: { flex: 1, gap: 10 },
  zoneHint: { marginTop: 4 },
});
