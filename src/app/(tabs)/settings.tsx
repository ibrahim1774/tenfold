import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, ProgressBar, Toggle, useTabBarSpace } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, radii, spacing } from '@/design/tokens';
import { Engine, engineAvailable } from '@/engine';
import { exportsLeft, useEntitlements } from '@/state/entitlements';
import { PRESET_OPTIONS } from '@/state/presets';
import { useSettings } from '@/state/settings';
import { prepareSpeech, refreshSpeechStatus } from '@/state/speech';

/** "en_US" → "English (United States)"; empty → "Automatic". */
function languageName(locale: string) {
  if (!locale) return 'Automatic';
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(locale.replace('_', '-')) ?? locale;
  } catch {
    return locale;
  }
}

function formatBytes(n: number) {
  if (n < 1e6) return `${Math.round(n / 1e3)} KB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(0)} MB`;
  return `${(n / 1e9).toFixed(1)} GB`;
}

// Row geometry: the hairline divider starts where the title does, like iOS Settings.
const ROW_PAD = 16;
const ICON_BOX = 24;
const ICON_GAP = 14;
// Accent for in-place action rows (iOS tints these instead of adding a chevron).
const ACTION = colors.accentText;

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
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Clear exported files?',
        message: 'Videos already saved to Photos stay there. Your edits are kept.',
        options: ['Clear exported files', 'Cancel'],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      async (index) => {
        if (index !== 0) return;
        try {
          await Engine.clearExports();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setStorage(await Engine.storageBytes());
        } catch (e) {
          Alert.alert('Couldn’t clear files', e instanceof Error ? e.message : String(e));
        }
      },
    );

  const replayOnboarding = () =>
    Alert.alert('Replay onboarding?', 'Your answers set the default style for new batches. Existing batches don’t change.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replay', onPress: () => setOnboarded(false) },
    ]);

  const speechValue =
    speech === 'installed'
      ? 'Ready'
      : speech === 'downloading'
        ? `${Math.round(speechProgress * 100)}%`
        : speech === 'supported'
          ? 'Not set up'
          : speech === 'unsupported'
            ? 'Unavailable'
            : '…';

  const left = exportsLeft(ent);
  const presets = PRESET_OPTIONS.filter((p) => p.id !== 'custom');

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: bottom }]}
        showsVerticalScrollIndicator={false}>
        <AppText variant="display" accessibilityRole="header" style={styles.screenTitle}>
          Settings
        </AppText>

        <Group title="Plan">
          <Row icon="crown" title="Plan" value={isPro ? 'Pro' : `Free · ${left} ${left === 1 ? 'export' : 'exports'} left`} />
          {isPro ? (
            <Row
              icon="creditcard"
              title="Manage subscription"
              accessory="external"
              onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
            />
          ) : (
            <Row
              icon="arrow.up.circle"
              title="See Pro plans"
              subtitle="Unlimited exports, batches of 20, no watermark"
              accessory="chevron"
              onPress={() => router.push('/paywall')}
            />
          )}
          <Row
            icon="arrow.clockwise"
            title="Restore purchases"
            action
            onPress={() => Alert.alert('Not available yet', 'Purchases arrive with the Superwall integration.')}
            last
          />
        </Group>

        <Group title="Speech" footer="Transcription runs on this iPhone. Audio never leaves it.">
          <Row icon="waveform" title="On-device speech" value={speechValue} last={speech === 'downloading'} />
          {speech === 'downloading' && (
            <View style={styles.progress}>
              <ProgressBar progress={speechProgress} height={4} />
              <View style={[styles.divider, { left: ROW_PAD + ICON_BOX + ICON_GAP }]} />
            </View>
          )}
          <Row icon="globe" title="Language" value={languageName(speechLocale)} />
          <Row icon="cpu" title="Engine" value="Apple SpeechAnalyzer" last={speech !== 'supported'} />
          {speech === 'supported' && <Row icon="arrow.down.circle" title="Set up speech" action onPress={prepareSpeech} last />}
        </Group>

        <Group title="Default preset">
          {presets.map((p, i) => (
            <Row
              key={p.id}
              title={p.name}
              subtitle={p.blurb}
              selected={defaultPreset === p.id}
              onPress={() => {
                if (defaultPreset === p.id) return;
                Haptics.selectionAsync();
                setDefaultPreset(p.id);
              }}
              last={i === presets.length - 1}
            />
          ))}
        </Group>

        <Group title="Video" footer="Keep HDR turns off captions and zooms.">
          <Row icon="sun.max" title="Keep HDR" toggle={{ value: keepHDR, onChange: setKeepHDR }} last />
        </Group>

        <Group title="Storage">
          <Row
            icon="internaldrive"
            title="Projects and exports"
            value={!engine ? 'Unavailable' : storage == null ? '…' : formatBytes(storage)}
            last={!engine}
          />
          {engine && <Row icon="trash" title="Clear exported files" danger onPress={clearExports} last />}
        </Group>

        <Group title="Privacy">
          <View style={styles.privacy}>
            <SymbolView name="lock.shield" size={19} tintColor={colors.textSecondary} weight="regular" />
            <AppText variant="label" color={colors.textSecondary} style={styles.flex}>
              Nothing leaves your phone. No account, no uploads, no analytics.
            </AppText>
          </View>
        </Group>

        <Group title="About">
          <Row icon="bolt.horizontal" title="Video engine" value={engine ? 'Connected' : 'Update the app'} />
          <Row icon="arrow.counterclockwise" title="Replay onboarding" action onPress={replayOnboarding} last />
        </Group>
      </ScrollView>
    </View>
  );
}

function Group({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <AppText variant="caption" color={colors.textMuted} style={styles.groupTitle} accessibilityRole="header">
        {title.toUpperCase()}
      </AppText>
      <View style={styles.groupCard}>{children}</View>
      {footer ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.groupFooter}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

type RowProps = {
  icon?: SFSymbol;
  title: string;
  subtitle?: string;
  value?: string;
  /** Inline switch; the whole row is the switch for touch and VoiceOver. */
  toggle?: { value: boolean; onChange: (v: boolean) => void };
  onPress?: () => void;
  /** Chevron for rows that open another screen, arrow for rows that leave the app. Actions get none. */
  accessory?: 'chevron' | 'external';
  /** Checkmark row in a single-choice list. */
  selected?: boolean;
  /** Tappable row that does something in place (no chevron): title in the accent colour. */
  action?: boolean;
  danger?: boolean;
  last?: boolean;
};

function Row({ icon, title, subtitle, value, toggle, onPress, accessory, selected, action, danger, last }: RowProps) {
  const tint = danger ? colors.danger : action ? ACTION : colors.textPrimary;
  const inset = icon ? ROW_PAD + ICON_BOX + ICON_GAP : ROW_PAD;
  const content = (pressed: boolean) => (
    <View style={[styles.row, pressed && styles.rowPressed]}>
      {icon ? (
        <View style={styles.iconBox}>
          <SymbolView name={icon} size={18} tintColor={danger ? colors.danger : colors.textSecondary} weight="regular" />
        </View>
      ) : null}
      <View style={styles.flex}>
        <AppText variant="body" color={tint}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="label" color={colors.textMuted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="body" color={colors.textSecondary} tabular numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {toggle ? <Toggle value={toggle.value} onChange={toggle.onChange} label={title} /> : null}
      {selected ? <SymbolView name="checkmark" size={15} tintColor={colors.textPrimary} weight="regular" /> : null}
      {accessory === 'chevron' ? <SymbolView name="chevron.right" size={13} tintColor={colors.textMuted} weight="regular" /> : null}
      {accessory === 'external' ? <SymbolView name="arrow.up.right" size={13} tintColor={colors.textMuted} weight="regular" /> : null}
      {!last ? <View style={[styles.divider, { left: inset }]} /> : null}
    </View>
  );

  if (toggle) {
    return (
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          toggle.onChange(!toggle.value);
        }}
        accessibilityRole="switch"
        accessibilityLabel={title}
        accessibilityState={{ checked: toggle.value }}>
        {({ pressed }) => content(pressed)}
      </Pressable>
    );
  }
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={value ? `${title}, ${value}` : title}>
        {content(false)}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={selected === undefined ? 'button' : 'radio'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      accessibilityLabel={title}
      accessibilityHint={subtitle}>
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, gap: spacing.xxl },
  screenTitle: { marginBottom: -spacing.sm },
  group: { gap: spacing.sm },
  groupTitle: { letterSpacing: 0.6, paddingHorizontal: ROW_PAD },
  groupFooter: { paddingHorizontal: ROW_PAD },
  groupCard: {
    borderRadius: radii.card,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ICON_GAP,
    paddingHorizontal: ROW_PAD,
    paddingVertical: 11,
    minHeight: 48,
  },
  rowPressed: { backgroundColor: colors.cardHigh },
  iconBox: { width: ICON_BOX, alignItems: 'center' },
  value: { flexShrink: 1, maxWidth: '55%', textAlign: 'right' },
  divider: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  progress: { paddingLeft: ROW_PAD + ICON_BOX + ICON_GAP, paddingRight: ROW_PAD, paddingBottom: 14, marginTop: -4 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: ICON_GAP, paddingHorizontal: ROW_PAD, paddingVertical: 14 },
});
