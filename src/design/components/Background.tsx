import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { colors, gradients } from '../tokens';

/** Near-black canvas with a soft plum/violet glow bleeding in from the top, like the reference screens. */
export function Background({ glow = true }: { glow?: boolean }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.base]} pointerEvents="none">
      {glow && (
        <>
          <View style={[styles.blob, styles.plum]} />
          <View style={[styles.blob, styles.violet]} />
          <LinearGradient colors={gradients.glow} locations={[0, 0.35, 0.62]} style={StyleSheet.absoluteFill} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.bg, overflow: 'hidden' },
  blob: { position: 'absolute', width: 320, height: 320, borderRadius: 160 },
  plum: {
    top: -200,
    left: -120,
    backgroundColor: colors.glowPlum,
    boxShadow: `0 0 140px 90px ${colors.glowPlum}`,
  },
  violet: {
    top: -230,
    right: -160,
    backgroundColor: colors.glowViolet,
    boxShadow: `0 0 140px 80px ${colors.glowViolet}`,
  },
});
