import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, useColorScheme, View } from 'react-native';

import { colors, gradients } from '../tokens';

/**
 * Diagonal pastel mesh: two stacked linear gradients plus a soft blob.
 * `wash` darkens the lower part so glass cards read like the reference screens.
 */
export function Background({ wash = true }: { wash?: boolean }) {
  const dark = useColorScheme() === 'dark';

  if (dark) {
    return (
      <LinearGradient
        colors={gradients.backgroundDark}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={gradients.backgroundLight}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(255,170,140,0.45)', 'rgba(255,170,140,0)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.6, y: 0.45 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.blob} />
      {wash && (
        <LinearGradient colors={gradients.screenWash} locations={[0.18, 0.5, 1]} style={StyleSheet.absoluteFill} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
    top: '28%',
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.bgLavender,
    opacity: 0.55,
    boxShadow: `0 0 120px 60px ${colors.bgLavender}`,
  },
});
