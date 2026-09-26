import { StyleSheet, View } from 'react-native';

import { fonts, radii } from '../tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { Thumb } from './Thumb';

export type StyleTileProps = {
  name: string;
  seed: number;
  sample: string;
  highlight: string;
  uppercase?: boolean;
  boxed?: boolean;
  selected?: boolean;
  locked?: boolean;
  onPress?: () => void;
  width?: number;
};

/** Image tile with a label underneath ("Choose a style" row). Shows a sample caption on a moody frame. */
export function StyleTile({ name, seed, sample, highlight, uppercase, boxed, selected, locked, onPress, width = 112 }: StyleTileProps) {
  const words = (uppercase ? sample.toUpperCase() : sample).split(' ');
  const last = words.pop();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.95}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${name}, Pro` : name}
      accessibilityState={{ selected }}
      style={[styles.wrap, { width }]}>
      <View style={[styles.frame, selected && styles.frameSelected]}>
        <Thumb seed={seed} style={styles.thumb}>
          <View style={styles.captionWrap}>
            <View style={boxed ? styles.box : undefined}>
              <AppText style={[styles.caption, uppercase && styles.upper]}>
                {words.join(' ')} <AppText style={[styles.caption, uppercase && styles.upper, { color: highlight }]}>{last}</AppText>
              </AppText>
            </View>
          </View>
          {locked ? (
            <View style={styles.lock}>
              <AppText style={styles.lockText}>PRO</AppText>
            </View>
          ) : null}
        </Thumb>
      </View>
      <AppText variant="label" style={styles.label} color={selected ? '#FFFFFF' : '#B3B0BD'}>
        {name}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  frame: { borderRadius: radii.tile, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', padding: 2 },
  frameSelected: { borderColor: '#A98BFF', boxShadow: '0 0 18px rgba(139,92,246,0.45)' },
  thumb: { height: 128, borderRadius: radii.tile - 3, justifyContent: 'flex-end' },
  captionWrap: { padding: 8, alignItems: 'center' },
  caption: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 17,
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 3,
  },
  upper: { letterSpacing: 0.6 },
  box: { backgroundColor: 'rgba(10,9,14,0.8)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  lock: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(10,9,14,0.7)',
  },
  lockText: { fontFamily: fonts.semiBold, fontSize: 9, lineHeight: 12, color: '#C9B6FF' },
  label: { textAlign: 'center' },
});
