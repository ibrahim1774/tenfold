import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTION_COLORS, CAPTION_FONTS, CAPTION_PRESETS } from '@/captions/presets';
import { AppText, Chip, GradientButton, IconButton, OptionLabel, PressableScale, StyleTile, Thumb } from '@/design/components';
import { colors, fonts, radii, spacing } from '@/design/tokens';
import type { CaptionFont, CaptionStyleId } from '@/engine/types';
import { useEntitlements } from '@/state/entitlements';

// M0 illustrative tiles. In M2 each tile is a still rendered by the native CaptionLayerBuilder
// from the project's own words, so what you see here matches export.
export default function CaptionStyleSheet() {
  const insets = useSafeAreaInsets();
  const isPro = useEntitlements((s) => s.isPro);
  const [styleId, setStyleId] = useState<CaptionStyleId>('pop');
  const [font, setFont] = useState<CaptionFont>('poppins');
  const [color, setColor] = useState(CAPTION_COLORS[0]);
  const [size, setSize] = useState(1);
  const [posY, setPosY] = useState(0.66);

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <AppText variant="title">Caption style</AppText>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
        {CAPTION_PRESETS.map((p, i) => {
          const locked = !isPro && !p.free;
          return (
            <StyleTile
              key={p.id}
              name={p.name}
              seed={i + 3}
              sample="three tips that work"
              highlight={p.animation === 'pop' || p.animation === 'karaoke' ? color : '#FFFFFF'}
              uppercase={p.uppercase}
              boxed={p.animation === 'box'}
              locked={locked}
              selected={styleId === p.id}
              width={104}
              onPress={() => (locked ? router.push('/paywall') : setStyleId(p.id))}
            />
          );
        })}
      </ScrollView>

      <OptionLabel>Font</OptionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {CAPTION_FONTS.map((f) => (
          <Chip key={f.id} label={f.name} selected={font === f.id} onPress={() => setFont(f.id)} />
        ))}
      </ScrollView>

      <OptionLabel>Highlight colour</OptionLabel>
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

      <GradientButton title="Apply" icon={false} shape="pill" onPress={() => router.back()} />
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
