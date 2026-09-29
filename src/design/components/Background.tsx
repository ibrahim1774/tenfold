import { StyleSheet, View } from 'react-native';

import { colors } from '../tokens';

/** Flat black canvas behind every screen. (`glow` is kept for call sites; it no longer draws anything.) */
export function Background({ glow: _glow = true }: { glow?: boolean }) {
  return <View style={[StyleSheet.absoluteFill, styles.base]} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.bg },
});
