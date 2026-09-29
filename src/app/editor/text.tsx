import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type TextStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText, GlassCapsule, PressableScale } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { dark, radii, sizes, spacing } from '@/design/tokens';
import { HOOKS, MAX_SIZE, MIN_SIZE, nextBox, overlayMetrics, TEXT_COLORS, TEXT_STYLES } from '@/editor/textLayout';
import { newOverlay, normalizeText, removeOverlay, upsertOverlay } from '@/editor/textOverlays';
import { Engine, type TextAlign, type TextOverlay, type TextOverlayBox } from '@/engine';
import { commitDoc } from '@/state/history';
import { useLibrary } from '@/state/library';

const BOX_ICON: Record<TextOverlayBox, { icon: SFSymbol; label: string }> = {
  none: { icon: 'textformat', label: 'Background: none' },
  filled: { icon: 'a.square.fill', label: 'Background: filled box' },
  translucent: { icon: 'a.square.fill', label: 'Background: see-through box' },
  outline: { icon: 'a.square', label: 'Background: outline' },
};
const ALIGN_NEXT: Record<TextAlign, TextAlign> = { center: 'left', left: 'right', right: 'center' };
const ALIGN_ICON: Record<TextAlign, SFSymbol> = { left: 'text.alignleft', center: 'text.aligncenter', right: 'text.alignright' };
const ALIGN_LABEL: Record<TextAlign, string> = { left: 'Align left', center: 'Align centre', right: 'Align right' };

const SLIDER_H = 220;
const TOOLBAR_H = 56;
const SLIDER_PAD = 12; // track inset from the top of the slider's touch area

/** Unique id for a new overlay (module scope: ids use the clock, which render code must not). */
function newId() {
  return `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * The text tool, laid out like TikTok's on purpose: the text is typed live in the middle over a dimmed
 * still of the video, in its real font, size and box; the look controls sit above it, the styles below,
 * the hook starters just above the keyboard. Done saves (one undo step); empty text removes it.
 */
export default function TextEditorScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const params = useLocalSearchParams<{ projectId: string; overlayId?: string; poster?: string; ratio?: string; focus?: string }>();
  const { projectId, overlayId, poster, focus } = params;
  const existing = useLibrary((s) => s.docs[projectId]?.textOverlays?.find((o) => o.id === overlayId));
  const [draft, setDraft] = useState<TextOverlay>(() => existing ?? newOverlay('new'));
  const [panel, setPanel] = useState<'styles' | 'colors'>('styles');
  const [sizing, setSizing] = useState(false);
  const selection = useRef({ start: draft.text.length, end: draft.text.length });
  const input = useRef<TextInput>(null);

  // The canvas as it will be exported, fitted to the screen, so sizes read true.
  const ratio = Number(params.ratio) > 0 ? Number(params.ratio) : 9 / 16;
  const frameW = Math.min(screenW, screenH * ratio);
  const frameH = frameW / ratio;
  const m = overlayMetrics(draft, frameW, frameH);

  const set = (patch: Partial<TextOverlay>) => setDraft((d) => ({ ...d, ...patch }));

  const done = () => {
    const latest = useLibrary.getState().docs[projectId];
    if (latest) {
      const text = normalizeText(draft.text);
      let next = null;
      if (!text.trim()) next = existing ? removeOverlay(latest, existing.id) : null;
      else if (!existing || JSON.stringify({ ...draft, text }) !== JSON.stringify(existing)) {
        next = upsertOverlay(latest, { ...draft, text, id: existing?.id ?? newId() });
      }
      if (next) commitDoc(projectId, next);
    }
    router.back();
  };

  const insertHook = (hook: string) => {
    const { start, end } = selection.current;
    const t = draft.text;
    const before = t.slice(0, start);
    const insert = `${before && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : ''}${hook} `;
    const next = before + insert + t.slice(end);
    const caret = before.length + insert.length;
    selection.current = { start: caret, end: caret };
    set({ text: next });
  };

  const pickSystemColor = async () => {
    const hex = await Engine.pickColor(draft.color);
    if (hex) set({ color: hex });
  };

  // Size slider on the left edge: top = biggest.
  const setFromY = (y: number) => {
    const f = 1 - Math.min(1, Math.max(0, (y - SLIDER_PAD) / SLIDER_H));
    set({ size: Math.round((MIN_SIZE + f * (MAX_SIZE - MIN_SIZE)) * 1000) / 1000 });
  };
  const slide = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      scheduleOnRN(setFromY, e.y);
    })
    .onUpdate((e) => {
      scheduleOnRN(setFromY, e.y);
    });
  const sizeFraction = (draft.size - MIN_SIZE) / (MAX_SIZE - MIN_SIZE);

  const inputStyle: TextStyle = {
    fontFamily: m.family,
    fontSize: m.fontSize,
    lineHeight: m.lineHeight,
    color: m.textColor,
    textAlign: draft.align,
    backgroundColor: m.boxColor,
    borderRadius: m.radius,
    paddingHorizontal: m.padX,
    paddingTop: m.padY,
    paddingBottom: m.padY,
    maxWidth: m.maxTextWidth + m.padX * 2,
    minWidth: m.fontSize,
    // Outline and neon glow as a shadow while typing; the canvas and export draw the real outline.
    ...(m.glow
      ? { textShadowColor: m.glow.color, textShadowRadius: m.glow.radius, textShadowOffset: { width: 0, height: 0 } }
      : m.stroke
        ? { textShadowColor: m.stroke.color, textShadowRadius: m.stroke.width * 1.5, textShadowOffset: { width: 0, height: 0 } }
        : null),
  };

  return (
    <View style={styles.flex}>
      {/* The video under the text, dimmed. */}
      <View style={[styles.frame, { width: frameW, height: frameH, left: (screenW - frameW) / 2, top: (screenH - frameH) / 2 }]}>
        {poster ? <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={styles.dim} />
      </View>

      <KeyboardAvoidingView behavior="padding" style={[styles.flex, { paddingTop: insets.top }]}>
        {/* Floating chrome over the still: the look tools in one glass capsule, Done in another. */}
        <View style={styles.toolbar}>
          <GlassCapsule style={styles.tools}>
            <ToolButton icon="textformat.size" label="Size" on={sizing} onPress={() => setSizing((s) => !s)} />
            <Pressable
              onPress={() => setPanel((p) => (p === 'colors' ? 'styles' : 'colors'))}
              accessibilityRole="button"
              accessibilityLabel="Colour"
              accessibilityState={{ selected: panel === 'colors' }}
              style={styles.tool}>
              <View style={[styles.colorRing, panel === 'colors' && styles.colorRingOn]}>
                <View style={[styles.colorDot, { backgroundColor: draft.color }]} />
              </View>
            </Pressable>
            <ToolButton icon={BOX_ICON[draft.box].icon} label={BOX_ICON[draft.box].label} dim={draft.box === 'translucent'} onPress={() => set({ box: nextBox(draft.box) })} />
            <ToolButton icon={ALIGN_ICON[draft.align]} label={ALIGN_LABEL[draft.align]} onPress={() => set({ align: ALIGN_NEXT[draft.align] })} />
          </GlassCapsule>
          <View style={styles.flex} />
          <PressableScale onPress={done} haptic="impact" accessibilityRole="button" accessibilityLabel="Done" hitSlop={8}>
            <GlassCapsule interactive style={styles.done}>
              <AppText variant="bodyStrong">Done</AppText>
            </GlassCapsule>
          </PressableScale>
        </View>

        {/* Tapping the empty space around the text keeps typing, like TikTok. */}
        <Pressable style={styles.middle} onPress={() => input.current?.focus()} accessible={false}>
          <TextInput
            ref={input}
            autoFocus={focus !== 'style'}
            multiline
            scrollEnabled={false}
            value={draft.text}
            onChangeText={(text) => set({ text })}
            onSelectionChange={(e) => {
              selection.current = e.nativeEvent.selection;
            }}
            placeholder="Enter text"
            placeholderTextColor="rgba(255,255,255,0.5)"
            keyboardAppearance="dark"
            selectionColor={dark.accent}
            allowFontScaling={false}
            accessibilityLabel="Text"
            style={inputStyle}
          />
        </Pressable>

        <View style={styles.bottom}>
          {panel === 'styles' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.row}>
              {TEXT_STYLES.map((s) => {
                const on = draft.style === s.id;
                return (
                  <Pressable
                    key={s.id}
                    // A style brings its own colour, unless the user already picked one.
                    onPress={() => set({ style: s.id, color: draft.color === TEXT_STYLES.find((x) => x.id === draft.style)?.color ? s.color : draft.color })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Style: ${s.name}`}
                    hitSlop={{ top: 4, bottom: 4 }}
                    style={[styles.chip, on && styles.chipOn]}>
                    <Text allowFontScaling={false} style={[styles.chipText, on && styles.chipTextOn, { fontFamily: s.family }]}>
                      {s.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.row}>
              {Engine.canPickColor() && (
                <Pressable onPress={pickSystemColor} accessibilityRole="button" accessibilityLabel="More colours" hitSlop={2} style={styles.swatchHit}>
                  <View style={[styles.swatch, styles.swatchMore]}>
                    <SymbolView name="eyedropper" size={14} tintColor={dark.textPrimary} />
                  </View>
                </Pressable>
              )}
              {TEXT_COLORS.map((c) => {
                const on = draft.color.toUpperCase() === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => set({ color: c })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Colour ${c}`}
                    hitSlop={2}
                    style={[styles.swatchHit, on && styles.swatchHitOn]}>
                    <View style={[styles.swatch, { backgroundColor: c }]} />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={[styles.row, styles.hooks]}>
            {HOOKS.map((h) => (
              <Pressable key={h} onPress={() => insertHook(h)} accessibilityRole="button" accessibilityLabel={`Insert “${h}”`} hitSlop={{ top: 6, bottom: 6 }} style={styles.hook}>
                <AppText variant="label">{h}</AppText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {sizing && (
        <View style={[styles.slider, { top: insets.top + TOOLBAR_H + spacing.sm }]}>
          <GestureDetector gesture={slide}>
            <View
              style={styles.sliderHit}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="Text size"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(sizeFraction * 100) }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => {
                const step = e.nativeEvent.actionName === 'increment' ? 0.01 : -0.01;
                set({ size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round((draft.size + step) * 1000) / 1000)) });
              }}>
              <View style={styles.sliderTrack} />
              <View style={[styles.sliderThumb, { top: (1 - sizeFraction) * SLIDER_H - 11 }]} />
            </View>
          </GestureDetector>
        </View>
      )}
    </View>
  );
}

function ToolButton({ icon, label, onPress, on, dim }: { icon: SFSymbol; label: string; onPress: () => void; on?: boolean; dim?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={on === undefined ? undefined : { selected: on }} style={[styles.tool, on && styles.toolOn]}>
      <SymbolView name={icon} size={19} weight="regular" tintColor={on ? dark.textInverse : dark.textPrimary} style={dim ? styles.dimIcon : undefined} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  frame: { position: 'absolute', overflow: 'hidden', backgroundColor: dark.bg },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, height: TOOLBAR_H },
  tools: { minHeight: sizes.iconButton, paddingHorizontal: 0, gap: 0 },
  tool: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  // Selected tool: a white disc with a black glyph, as in the system's own editors.
  toolOn: { backgroundColor: dark.textPrimary },
  dimIcon: { opacity: 0.6 },
  colorRing: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  colorRingOn: { borderColor: dark.textPrimary },
  colorDot: { width: 20, height: 20, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.5)' },
  done: { minHeight: sizes.iconButton, paddingHorizontal: spacing.lg },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  bottom: { gap: spacing.sm, paddingBottom: spacing.sm },
  row: { paddingHorizontal: spacing.md, gap: spacing.sm, alignItems: 'center' },
  // Style chips: dark translucent so they read over any frame; the chosen one is white with black text.
  chip: {
    height: sizes.chipHeight,
    paddingHorizontal: 14,
    borderRadius: radii.chip,
    justifyContent: 'center',
    backgroundColor: 'rgba(28,28,30,0.82)',
  },
  chipOn: { backgroundColor: dark.chipSelectedFill },
  chipText: { fontSize: 15, color: dark.textPrimary },
  chipTextOn: { color: dark.chipSelectedText },
  // Swatches: a white ring with a small gap marks the chosen colour; the hairline keeps black visible.
  swatchHit: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatchHitOn: { borderColor: dark.textPrimary },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.4)' },
  swatchMore: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(28,28,30,0.82)' },
  hooks: { paddingBottom: 2 },
  hook: { height: 32, paddingHorizontal: spacing.md, borderRadius: radii.round, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  slider: { position: 'absolute', left: spacing.xs, height: SLIDER_H + SLIDER_PAD * 2, width: 44 },
  sliderHit: { flex: 1, alignItems: 'center', paddingTop: SLIDER_PAD },
  sliderTrack: { width: 4, height: SLIDER_H, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)' },
  sliderThumb: {
    position: 'absolute',
    marginTop: SLIDER_PAD,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: dark.textPrimary,
  },
});
