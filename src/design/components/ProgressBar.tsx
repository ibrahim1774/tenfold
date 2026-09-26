import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { gradients } from '../tokens';

export function ProgressBar({ progress, height = 6 }: { progress: number; height?: number }) {
  const pct = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` as const;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <LinearGradient
        colors={gradients.cta}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ width: pct, height, borderRadius: height / 2 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
});
