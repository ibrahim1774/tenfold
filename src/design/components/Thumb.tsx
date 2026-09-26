import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { thumbGradients } from '../tokens';

/** M0 stand-in for a video thumbnail: a moody gradient keyed by index. Replaced by engine thumbnails in M1. */
export function Thumb({ seed, style, children }: { seed: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const g = thumbGradients[Math.abs(seed) % thumbGradients.length];
  return (
    <LinearGradient colors={g} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[styles.base, style]}>
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
        locations={[0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
});
