import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../tokens';

/**
 * Video thumbnail: a real frame when `uri` (or a bundled `source`) is given, otherwise a flat graphite
 * tile. The footage is the only colour on screen, so there are no decorative gradient fallbacks. A soft
 * scrim at the bottom keeps overlaid labels legible on bright frames.
 */
export function Thumb({
  seed: _seed,
  uri,
  source,
  style,
  children,
}: {
  /** Kept for call sites; fallbacks no longer vary by seed. */
  seed: number;
  uri?: string | null;
  /** A bundled image (require()), used when there is no uri. */
  source?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const hasImage = !!uri || source != null;
  return (
    <View style={[styles.base, style]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : source != null ? (
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      ) : null}
      {hasImage && (
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)']}
          locations={[0.6, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      {children}
    </View>
  );
}

/** Stable small number from a string id, for gradient fallbacks. */
export function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden', backgroundColor: colors.cardHigh, borderCurve: 'continuous' },
});
