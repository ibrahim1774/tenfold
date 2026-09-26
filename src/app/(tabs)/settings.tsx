import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Background,
  Chip,
  ChipGroup,
  PressableScale,
  ProgressBar,
  Toggle,
  useTabBarSpace,
} from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, radii, spacing } from '@/design/tokens';
import { Engine, engineAvailable } from '@/engine';
import { exportsLeft, useEntitlements } from '@/state/entitlements';
import { PRESET_OPTIONS } from '@/state/presets';
import { useSettings } from '@/state/settings';
import { prepareSpeech, refreshSpeechStatus } from '@/state/speech';

function formatBytes(n: number) {
  if (n < 1e6) return `${Math.round(n / 1e3)} KB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(0)} MB`;
  return `${(n / 1e9).toFixed(1)} GB`;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const { speech, speechProgress, speechLocale, defaultPreset, keepHDR, setDefaultPreset, setKeepHDR, setOnboarded } = useSettings();
  const ent = useEntitlements();
  const isPro = ent.isPro;
  const engine = engineAvailable();
  const [storage, setStorage] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      refreshSpeechStatus();
      if (engine) Engine.storageBytes().then(setStorage).catch(() => {});
    }, [engine]),
  );

  const clearExports = () =>
    Alert.alert('Clear exported files?', 'Videos already saved to Photos stay there. Your edits are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await Engine.clearExports().catch(() => {});
          Engine.storageBytes().then(setStorage).catch(() => {});
        },
      },
    ]);

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: bottom }]}
        showsVerticalScrollIndicator={false}>
        <AppText variant="display">Settings</AppText>

        {!isPro && (
          <PressableScale onPress={() => router.push('/paywall')} style={styles.proCard} accessibilityRole="button">
            <View style={styles.proIcon}>
              <SymbolView name="crown.fill" size={20} tintColor="#FFC24D" />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">Go Pro</AppText>
              <AppText variant="label" color={colors.textSecondary}>
                Unlimited exports, batches of 20, no watermark
              </AppText>
            </View>
            <SymbolView name="chevron.right" size={14} tintColor={colors.textMuted} />
          </PressableScale>
        )}

        <Group title="Speech">
          <Row
            icon="waveform"
            title="On-device speech"
            value={
              speech === 'installed'
                ? 'Ready'
                : speech === 'downloading'
                  ? `${Math.round(speechProgress * 100)}%`
                  : speech === 'supported'
                    ? 'Not set up'
                    : speech === 'unsupported'
                      ? 'Unavailable'
                      : '…'
            }
          />
          {speech === 'downloading' && (
            <View style={styles.inset}>
              <ProgressBar progress={speechProgress} height={4} />
            </View>
          )}
          <Row icon="globe" title="Language" value={speechLocale || 'Automatic'} />
          <Row icon="cpu" title="Engine" value="Apple SpeechAnalyzer" last={speech !== 'supported'} />
          {speech === 'supported' && <Row icon="arrow.down.circle" title="Set up speech" onPress={prepareSpeech} last />}
        </Group>

        <Group title="Editing">
          <View style={[styles.inset, styles.presetBlock]}>
            <AppText variant="label" color={colors.textSecondary}>
              Default preset
            </AppText>
            <ChipGroup>
              {PRESET_OPTIONS.filter((p) => p.id !== 'custom').map((p) => (
                <Chip key={p.id} label={p.name} selected={defaultPreset === p.id} onPress={() => setDefaultPreset(p.id)} />
              ))}
            </ChipGroup>
          </View>
          <Row
            icon="sun.max"
            title="Keep HDR"
            subtitle="Turns off captions and zooms"
            right={<Toggle value={keepHDR} onChange={setKeepHDR} label="Keep HDR" />}
            last
          />
        </Group>

        <Group title="Storage">
          <Row icon="internaldrive" title="Projects and exports" value={storage == null ? '…' : formatBytes(storage)} />
          <Row icon="trash" title="Clear exported files" onPress={clearExports} last />
        </Group>

        <Group title="Subscription">
          <Row icon="crown" title="Plan" value={isPro ? 'Pro' : `Free · ${exportsLeft(ent)} exports left`} />
          <Row icon="arrow.clockwise" title="Restore purchases" onPress={() => Alert.alert('Coming soon', 'Purchases arrive with the Superwall integration.')} />
          <Row icon="creditcard" title="Manage subscription" onPress={() => router.push('/paywall')} last />
        </Group>

        <Group title="Privacy">
          <View style={[styles.inset, styles.privacy]}>
            <SymbolView name="lock.shield" size={22} tintColor="#C9B6FF" weight="light" />
            <AppText variant="label" color={colors.textSecondary} style={styles.flex}>
              Nothing leaves your phone. No account, no uploads, no analytics.
            </AppText>
          </View>
        </Group>

        <Group title="About">
          <Row icon="bolt.horizontal" title="Video engine" value={engine ? 'Connected' : 'Update the app'} />
          <Row icon="arrow.counterclockwise" title="Replay onboarding" onPress={() => setOnboarded(false)} last />
        </Group>
      </ScrollView>
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <AppText variant="label" color={colors.textMuted} style={styles.groupTitle}>
        {title.toUpperCase()}
      </AppText>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

type RowProps = {
  icon: SFSymbol;
  title: string;
  subtitle?: string;
  value?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
};

function Row({ icon, title, subtitle, value, right, onPress, danger, last }: RowProps) {
  const content = (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <SymbolView name={icon} size={19} tintColor={danger ? colors.danger : colors.textPrimary} weight="light" />
      <View style={styles.flex}>
        <AppText variant="body" color={danger ? colors.danger : colors.textPrimary}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color={colors.textMuted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="label" color={colors.textSecondary}>
          {value}
        </AppText>
      ) : null}
      {right}
      {onPress && !right ? <SymbolView name="chevron.right" size={13} tintColor={colors.textMuted} /> : null}
    </View>
  );
  return onPress ? (
    <PressableScale onPress={onPress} scaleTo={0.99} accessibilityRole="button" accessibilityLabel={title}>
      {content}
    </PressableScale>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, gap: spacing.xl },
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    backgroundColor: '#1D1628',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
  },
  proIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,194,77,0.14)',
  },
  group: { gap: 8 },
  groupTitle: { letterSpacing: 0.8, paddingHorizontal: 4 },
  groupCard: {
    borderRadius: radii.card,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 54, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)' },
  inset: { paddingHorizontal: 16, paddingVertical: 12 },
  presetBlock: { gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)' },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
