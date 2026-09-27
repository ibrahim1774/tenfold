import { StyleSheet, View, type TextStyle } from 'react-native';

import { AppText } from '@/design/components';
import type { CaptionFont } from '@/engine';

import { CAPTION_FONTS, type CaptionBackground, type CaptionOutline, type CaptionAnimation } from './presets';

export type SampleLook = {
  font: CaptionFont;
  colors: { base: string; active: string; stroke: string; bg: string };
  uppercase: boolean;
  background: CaptionBackground;
  outline: CaptionOutline;
  animation: CaptionAnimation;
};

const DARK_BOX = 'rgba(15,18,34,0.85)';

/**
 * Two words drawn the way a caption style draws them: its font, colours, box and outline, with the
 * second word as the spoken one. An illustration; the editor preview shows the exact render.
 */
export function StyleSample({ look, words }: { look: SampleLook; words: [string, string] }) {
  const family = CAPTION_FONTS.find((f) => f.id === look.font)?.family;
  const font: TextStyle = family && family !== 'System' ? { fontFamily: family } : { fontWeight: '900' };
  const box = look.background === 'box' || look.background === 'translucent';
  const solid = look.colors.bg === 'transparent' ? DARK_BOX : look.colors.bg;
  // The engine draws translucent at 55% alpha; a fixed see-through dark stands in for it here.
  const bg = look.background === 'translucent' ? 'rgba(0,0,0,0.5)' : solid;
  const lit = look.animation !== 'none' && look.animation !== 'classic' && look.animation !== 'reveal' && look.animation !== 'highlight';
  const neon = look.animation === 'neon';
  const outline: TextStyle =
    look.outline === 'none'
      ? {}
      : { textShadowColor: look.colors.stroke === 'transparent' ? '#000000' : look.colors.stroke, textShadowRadius: look.outline === 'thick' ? 4 : 2, textShadowOffset: { width: 0, height: 0 } };
  const [a, b] = look.uppercase ? [words[0].toUpperCase(), words[1].toUpperCase()] : words;
  const base: TextStyle[] = [styles.word, font, outline, { color: neon ? look.colors.active : look.colors.base }];
  if (neon) base.push({ textShadowColor: look.colors.active, textShadowRadius: 8 });
  const spoken: TextStyle[] = [...base];
  if (lit && !neon && look.background !== 'highlight') spoken.push({ color: look.colors.active });
  if (neon) spoken.push({ color: '#FFFFFF' });
  if (look.animation === 'underline') spoken.push({ textDecorationLine: 'underline', textDecorationColor: look.colors.active });

  return (
    <View style={styles.frame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.line, box && { backgroundColor: bg }]}>
        <AppText variant="bodyStrong" style={base} numberOfLines={1}>
          {a}
        </AppText>
        <View style={[styles.pill, look.background === 'highlight' && { backgroundColor: look.colors.active }]}>
          <AppText variant="bodyStrong" style={spoken} numberOfLines={1}>
            {b}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: 132, height: 56, borderRadius: 10, backgroundColor: '#2A2A30', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  pill: { borderRadius: 5, paddingHorizontal: 3 },
  word: { fontSize: 17, lineHeight: 22 },
});
