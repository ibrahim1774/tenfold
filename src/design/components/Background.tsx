import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';

/** Flat page canvas behind every screen, in the screen's palette. (`glow` is kept for call sites; it draws nothing.) */
export function Background({ glow: _glow = true }: { glow?: boolean }) {
  const theme = useTheme();
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]} pointerEvents="none" />;
}
