import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { thumbGradients } from '../tokens';

/** Video thumbnail: a real frame when `uri` is given, otherwise a moody gradient keyed by `seed`. */
export function Thumb({ seed, uri, style, children }: { seed: number; uri?: string | null; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const g = thumbGradients[Math.abs(seed) % thumbGradients.length];
  return (
    <LinearGradient colors={g} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[styles.base, style]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
        locations={[0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </LinearGradient>
  );
}

/** Stable small number from a string id, for gradient fallbacks. */
export function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
});
