import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Background, IconButton } from '@/design/components';
import { spacing } from '@/design/tokens';
import { Demo } from '@/onboarding/Demo';

/** "Replay the demo" from Home and Settings. */
export default function DemoScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.flex, { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.md }]}>
      <Background />
      <View style={styles.top}>
        <IconButton icon="xmark" label="Close" onPress={() => router.back()} />
      </View>
      <Demo mode="replay" onContinue={() => router.replace('/import')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md, marginBottom: spacing.md },
});
