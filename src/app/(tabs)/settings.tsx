import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Background, ProgressBar, Toggle } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { light, radii, spacing } from '@/design/tokens';
import { Engine, engineAvailable } from '@/engine';
import { usePaywallGate, useStoreActions } from '@/monetization/superwall';
import { hasSampleClip } from '@/onboarding/fileImport';
import { PRIVACY_URL, TERMS_URL } from '@/onboarding/plans';
import {
  exportLimit,
  exportUsageLine,
  exportsUsedThisMonth,
  maxBatchSize,
  planLabel,
  tierOf,
  TIER_NAMES,
  useEntitlements,
} from '@/state/entitlements';
import { useOnboarding } from '@/state/onboarding';
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
// Brand text for in-place action rows (iOS tints these instead of adding a chevron).
const ACTION = light.accentText;

export default function YouScreen() {
  const { speech, speechProgress, speechLocale, defaultPreset, keepHDR, setDefaultPreset, setKeepHDR, setOnboarded } = useSettings();
  const ent = useEntitlements();
  const tier = tierOf(ent);
  const gate = usePaywallGate();
  const store = useStoreActions();
  const resetTour = useOnboarding((s) => s.resetTour);
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

  const limit = exportLimit(tier);
  const limited = Number.isFinite(limit);
  const used = limited ? Math.min(limit, exportsUsedThisMonth(ent)) : 0;
  const usage = exportUsageLine(ent);

  // Superwall's paywall for this placement, or Tenfold's own when none is shown. Nothing to unlock here.
  const seePlans = () => gate({ placement: 'settings_upgrade', params: { source: 'you', tier }, allowed: () => false });

  // Apple's own subscription screen (change, cancel, see renewal). The App Store app, else the web page.
  const manageSubscription = () =>
    Linking.openURL('itms-apps://apps.apple.com/account/subscriptions').catch(() =>
      Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {}),
    );

  const restore = async () => {
    const result = await store.restore();
    const now = tierOf(useEntitlements.getState());
    if (result.ok && now !== 'free') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(`Restored ${TIER_NAMES[now]}`, 'Your plan is active on this iPhone.');
    } else if (result.ok) {
      Alert.alert('Nothing to restore', 'No active subscription was found for this Apple ID.');
    } else {
      Alert.alert('Couldn’t restore purchases', result.message ?? 'Try again in a moment.');
    }
  };

  const replayTour = () => {
    resetTour();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Tour is on', 'It shows the next time you open batch setup and the editor.');
  };
  const presets = PRESET_OPTIONS.filter((p) => p.id !== 'custom');

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        // The native tab bar and status bar inset the scroll view (UIKit's automatic content insets).
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <AppText variant="display" accessibilityRole="header" style={styles.screenTitle}>
          You
        </AppText>

        <Group title="Plan">
          <Row icon="crown" title="Plan" value={planLabel(tier, ent.billing)} />
          <View style={styles.meter} accessible accessibilityLabel={usage}>
            {limited && <ProgressBar progress={used / limit} height={4} />}
            <AppText variant="caption" color={light.textSecondary} tabular>
              {usage}
            </AppText>
            <View style={[styles.divider, { left: ROW_PAD + ICON_BOX + ICON_GAP }]} />
          </View>
          <Row icon="square.stack" title="Batch size" value={`Up to ${maxBatchSize(tier)} clips`} />
          {tier === 'free' ? (
            <Row icon="arrow.up.circle" title="Upgrade" accessory="chevron" onPress={seePlans} />
          ) : tier !== 'studio' ? (
            <Row icon="arrow.up.arrow.down.circle" title="Change plan" accessory="chevron" onPress={seePlans} />
          ) : null}
          {tier !== 'free' ? (
            <Row icon="creditcard" title="Manage subscription" accessory="external" onPress={manageSubscription} />
          ) : null}
          <Row icon="arrow.clockwise" title="Restore purchases" action onPress={restore} last />
        </Group>

        <Group title="Speech">
          <Row icon="waveform" title="On-device speech" value={speechValue} last={speech === 'downloading'} />
          {speech === 'downloading' && (
            <View style={styles.progress}>
              <ProgressBar progress={speechProgress} height={4} />
              <View style={[styles.divider, { left: ROW_PAD + ICON_BOX + ICON_GAP }]} />
            </View>
          )}
          <Row icon="globe" title="Language" value={languageName(speechLocale)} last={speech !== 'supported'} />
          {speech === 'supported' && <Row icon="arrow.down.circle" title="Set up speech" action onPress={prepareSpeech} last />}
        </Group>

        <Group title="Default preset">
          {presets.map((p, i) => (
            <Row
              key={p.id}
              title={p.name}
              hint={p.blurb}
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

        <Group title="Video" footer="Keep HDR turns off captions, text and zooms.">
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

        <Group
          title="Privacy"
          footer="Videos never leave this iPhone. Purchase events go to Superwall, install and ad measurement to AppsFlyer.">
          <Row icon="hand.raised" title="Privacy policy" accessory="external" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} />
          <Row icon="doc.text" title="Terms of use" accessory="external" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} last />
        </Group>

        <Group title="About">
          {!engine && <Row icon="bolt.horizontal" title="Video engine" value="Update the app" />}
          {hasSampleClip() && (
            <Row icon="play.rectangle" title="Replay the demo" accessory="chevron" onPress={() => router.push('/demo')} />
          )}
          <Row icon="hand.point.up.left" title="Replay the tour" action onPress={replayTour} />
          <Row icon="arrow.counterclockwise" title="Replay onboarding" action onPress={replayOnboarding} last />
        </Group>
      </ScrollView>
    </View>
  );
}

function Group({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <AppText variant="label" color={light.textSecondary} style={styles.groupTitle} accessibilityRole="header">
        {title}
      </AppText>
      <View style={styles.groupCard}>{children}</View>
      {footer ? (
        <AppText variant="caption" color={light.textMuted} style={styles.groupFooter}>
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
  /** VoiceOver hint when there's no visible subtitle. */
  hint?: string;
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

function Row({ icon, title, subtitle, hint, value, toggle, onPress, accessory, selected, action, danger, last }: RowProps) {
  const tint = danger ? light.danger : action ? ACTION : light.textPrimary;
  const inset = icon ? ROW_PAD + ICON_BOX + ICON_GAP : ROW_PAD;
  const content = (pressed: boolean) => (
    <View style={[styles.row, pressed && styles.rowPressed]}>
      {icon ? (
        <View style={styles.iconBox}>
          <SymbolView name={icon} size={18} tintColor={danger ? light.danger : light.textSecondary} weight="regular" />
        </View>
      ) : null}
      <View style={styles.flex}>
        <AppText variant="body" color={tint}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="label" color={light.textMuted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="body" color={light.textSecondary} tabular numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {toggle ? (
        // The whole row is the switch (touch and VoiceOver); the UISwitch is only its picture.
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Toggle value={toggle.value} onChange={toggle.onChange} label={title} />
        </View>
      ) : null}
      {selected ? <SymbolView name="checkmark" size={15} tintColor={light.accent} weight="semibold" /> : null}
      {accessory === 'chevron' ? <SymbolView name="chevron.right" size={13} tintColor={light.glyph} weight="semibold" /> : null}
      {accessory === 'external' ? <SymbolView name="arrow.up.right" size={13} tintColor={light.glyph} weight="semibold" /> : null}
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
      accessibilityHint={subtitle ?? hint}>
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.xxl },
  screenTitle: { paddingHorizontal: spacing.xs, marginBottom: -spacing.sm },
  group: { gap: 6 },
  groupTitle: { paddingHorizontal: ROW_PAD },
  groupFooter: { paddingHorizontal: ROW_PAD },
  groupCard: {
    borderRadius: radii.card,
    borderCurve: 'continuous',
    backgroundColor: light.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ICON_GAP,
    paddingHorizontal: ROW_PAD,
    paddingVertical: 11,
    minHeight: 50,
  },
  rowPressed: { backgroundColor: light.cardHigh },
  iconBox: { width: ICON_BOX, alignItems: 'center' },
  value: { flexShrink: 1, maxWidth: '55%', textAlign: 'right' },
  divider: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: light.separator,
  },
  progress: { paddingLeft: ROW_PAD + ICON_BOX + ICON_GAP, paddingRight: ROW_PAD, paddingBottom: 14, marginTop: -4 },
  meter: { gap: spacing.sm, paddingLeft: ROW_PAD + ICON_BOX + ICON_GAP, paddingRight: ROW_PAD, paddingBottom: 12, marginTop: -2 },
});
