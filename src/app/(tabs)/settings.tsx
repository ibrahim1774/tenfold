import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Background,
  Chip,
  ChipGroup,
  GlassCard,
  OptionLabel,
  PressableScale,
  ToggleRow,
} from '@/design/components';
import { colors, spacing } from '@/design/tokens';
import { pingEngine } from '@/engine';
import { useEntitlements } from '@/state/entitlements';
import { PRESET_OPTIONS } from '@/state/presets';
import { useSettings } from '@/state/settings';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { speechModel, defaultPreset, keepHDR, setSpeechModel, setDefaultPreset, setKeepHDR, setOnboarded } = useSettings();
  const isPro = useEntitlements((s) => s.isPro);
  const engineStatus = pingEngine();

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 100 }]}>
        <AppText variant="display" color={colors.textOnLight}>
          Settings
        </AppText>

        <GlassCard style={styles.card}>
          <AppText variant="section">Speech model</AppText>
          <Row
            label="Tenfold model (600 MB)"
            value={speechModel === 'installed' ? 'Installed' : speechModel === 'downloading' ? 'Downloading' : 'Not downloaded'}
          />
          <Row label="Engine in use" value={speechModel === 'installed' ? 'Parakeet (on device)' : 'Apple Speech (on device)'} />
          <PressableScale
            style={styles.action}
            accessibilityRole="button"
            onPress={() => setSpeechModel(speechModel === 'installed' ? 'notDownloaded' : 'installed', 1)}>
            <AppText variant="bodyStrong" color={speechModel === 'installed' ? colors.danger : colors.textPrimary}>
              {speechModel === 'installed' ? 'Delete model' : 'Download model'}
            </AppText>
          </PressableScale>
        </GlassCard>

        <GlassCard style={styles.card}>
          <AppText variant="section">Editing</AppText>
          <OptionLabel>Default preset</OptionLabel>
          <ChipGroup>
            {PRESET_OPTIONS.filter((p) => p.id !== 'custom').map((p) => (
              <Chip key={p.id} label={p.name} selected={defaultPreset === p.id} onPress={() => setDefaultPreset(p.id)} />
            ))}
          </ChipGroup>
          <ToggleRow
            title="Keep HDR (no captions)"
            subtitle="Exports stay HDR, but captions and zooms are turned off"
            value={keepHDR}
            onChange={setKeepHDR}
          />
        </GlassCard>

        <GlassCard style={styles.card}>
          <AppText variant="section">Storage</AppText>
          <Row label="Projects and exports" value="0 MB" />
          <PressableScale style={styles.action} accessibilityRole="button">
            <AppText variant="bodyStrong">Clear exports</AppText>
          </PressableScale>
        </GlassCard>

        <GlassCard style={styles.card}>
          <AppText variant="section">Subscription</AppText>
          <Row label="Plan" value={isPro ? 'Pro' : 'Free'} />
          <PressableScale style={styles.action} accessibilityRole="button" onPress={() => router.push('/paywall')}>
            <AppText variant="bodyStrong">{isPro ? 'Manage subscription' : 'Upgrade to Pro'}</AppText>
          </PressableScale>
        </GlassCard>

        <GlassCard style={styles.card}>
          <AppText variant="section">Privacy</AppText>
          <AppText variant="body" color={colors.textSecondary}>
            Nothing leaves your phone. Tenfold has no account, no uploads and no analytics.
          </AppText>
        </GlassCard>

        <GlassCard style={styles.card}>
          <AppText variant="section">Developer</AppText>
          <Row label="Native engine" value={engineStatus === 'pong' ? 'Connected (pong)' : 'Not in this build'} />
          <PressableScale style={styles.action} accessibilityRole="button" onPress={() => setOnboarded(false)}>
            <AppText variant="bodyStrong">Replay onboarding</AppText>
          </PressableScale>
        </GlassCard>
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="body" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, gap: spacing.md },
  card: { gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  action: {
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});
