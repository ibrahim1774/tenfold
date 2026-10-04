import { StyleSheet, View, type TextStyle } from 'react-native';

import type { CaptionAnimation } from '../../captions/presets';
import { sampleFrame } from '../sampleFrames';
import { colors, radii } from '../tokens';
import { AppText } from './AppText';
import { GlassCapsule } from './Glass';
import { PressableScale } from './PressableScale';
import { Thumb } from './Thumb';

export type StyleTileProps = {
  name: string;
  seed: number;
  sample: string;
  highlight: string;
  animation: CaptionAnimation;
  fontFamily?: string;
  uppercase?: boolean;
  maxWords?: number;
  selected?: boolean;
  locked?: boolean;
  onPress?: () => void;
  width?: number;
};

/**
 * Image tile with a label underneath ("Choose a style" row). A small illustration of the style in its
 * own font; the editor preview shows the exact, export-identical render.
 */
export function StyleTile({
  name,
  seed,
  sample,
  highlight,
  animation,
  fontFamily,
  uppercase,
  maxWords = 4,
  selected,
  locked,
  onPress,
  width = 112,
}: StyleTileProps) {
  let words = (uppercase ? sample.toUpperCase() : sample).split(' ').filter(Boolean);
  if (maxWords === 1) words = [words[Math.min(1, words.length - 1)] ?? 'WOW'];
  else words = words.slice(0, Math.min(maxWords, 4));
  if (animation === 'reveal') words = words.slice(0, Math.max(1, words.length - 1));
  const active = words.length - 1;
  const family: TextStyle = fontFamily && fontFamily !== 'System' ? { fontFamily } : { fontFamily: undefined, fontWeight: '900' };
  const big = maxWords === 1;

  const wordStyle = (i: number): TextStyle[] => {
    const isActive = i === active;
    const out: TextStyle[] = [styles.word, family, big ? styles.big : {}];
    if (animation === 'neon') out.push({ color: highlight, textShadowColor: highlight, textShadowRadius: 8 }, isActive ? { color: '#FFFFFF' } : {});
    else if ((animation === 'pop' || animation === 'karaoke') && isActive) out.push({ color: highlight });
    else if (animation === 'karaoke' && i < active) out.push({ color: highlight });
    if (animation === 'underline' && isActive) out.push({ textDecorationLine: 'underline', textDecorationColor: highlight });
    if (animation === 'pop' || animation === 'none') out.push(styles.stroke);
    return out;
  };

  return (
    <PressableScale
      haptic="selection"
      onPress={onPress}
      scaleTo={0.95}
      pop={selected}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${name}, needs a paid plan` : name}
      accessibilityState={{ selected }}
      style={[styles.wrap, { width }]}>
      <View style={[styles.frame, selected && styles.frameSelected]}>
        <Thumb seed={seed} source={sampleFrame(seed)} style={styles.thumb}>
          <View style={styles.captionWrap}>
            <View style={[styles.line, animation === 'box' && styles.box, animation === 'classic' && styles.classic]}>
              {words.map((w, i) =>
                animation === 'highlight' && i === active ? (
                  <View key={i} style={[styles.pill, { backgroundColor: highlight }]}>
                    <AppText style={[styles.word, family]}>{w}</AppText>
                  </View>
                ) : (
                  <AppText key={i} style={wordStyle(i)}>
                    {w}
                  </AppText>
                ),
              )}
              {animation === 'reveal' && <AppText style={[styles.word, styles.cursor]}>|</AppText>}
            </View>
          </View>
          {locked ? (
            <GlassCapsule style={styles.lock} pointerEvents="none">
              <AppText style={styles.lockText}>Pro</AppText>
            </GlassCapsule>
          ) : null}
        </Thumb>
      </View>
      <AppText variant="label" style={styles.label} color={selected ? colors.textPrimary : colors.textSecondary} numberOfLines={1}>
        {name}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  frame: { borderRadius: radii.tile + 3, borderCurve: 'continuous', borderWidth: 2, borderColor: 'transparent', padding: 2 },
  frameSelected: { borderColor: colors.textPrimary },
  thumb: { height: 128, borderRadius: radii.tile - 1, borderCurve: 'continuous', justifyContent: 'flex-end' },
  captionWrap: { padding: 8, paddingBottom: 18, alignItems: 'center' },
  line: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 3, rowGap: 1 },
  word: { fontWeight: '700', fontSize: 12, lineHeight: 16, color: '#FFFFFF', textAlign: 'center' },
  big: { fontSize: 20, lineHeight: 24 },
  stroke: { textShadowColor: 'rgba(0,0,0,0.95)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  box: { backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 2 },
  classic: { backgroundColor: 'rgba(0,0,0,0.9)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  pill: { borderRadius: 5, paddingHorizontal: 3 },
  cursor: { color: '#FFFFFF', opacity: 0.8 },
  lock: { position: 'absolute', top: 6, right: 6, minHeight: 20, paddingHorizontal: 7 },
  lockText: { fontWeight: '600', fontSize: 12, lineHeight: 16, color: colors.accentText },
  label: { textAlign: 'center' },
});
