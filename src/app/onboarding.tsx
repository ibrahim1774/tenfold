import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { presetById } from '@/captions/presets';
import { AppText, Background, Card, GradientButton, IconButton, OutlineButton, ProgressBar, Thumb } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, motion, radii, spacing } from '@/design/tokens';
import { useEntitlements } from '@/state/entitlements';
import { batchPreset, PRESET_OPTIONS } from '@/state/presets';
import { prepareSpeech, refreshSpeechStatus } from '@/state/speech';
import { presetForContent, useSettings, type ContentType, type Platform } from '@/state/settings';

const STEPS = 6;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const { contentTypes, platforms, setContentTypes, setPlatforms, setDefaultPreset, setOnboarded } = useSettings();
  const isPro = useEntitlements((s) => s.isPro);

  // GradientButton already fires the light impact for the primary action.
  const next = () => {
    if (step === 2) setDefaultPreset(presetForContent(contentTypes));
    if (step < STEPS - 1) {
      setDir(1);
      setStep(step + 1);
    } else if (isPro) setOnboarded(true); // replaying onboarding: no paywall for subscribers
    else router.push({ pathname: '/paywall', params: { from: 'onboarding' } });
  };
  const back = () => {
    setDir(-1);
    setStep((s) => Math.max(0, s - 1));
  };

  const needsChoice = (step === 2 && contentTypes.length === 0) || (step === 3 && platforms.length === 0);
  const cta = step === 0 ? 'Get started' : step < STEPS - 1 ? 'Continue' : isPro ? 'Start editing' : 'See plans';

  return (
    <View style={[styles.flex, { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.md }]}>
      <Background />

      {/* Fixed height so the steps below never shift when the bar appears. */}
      <View style={styles.topBar}>
        {step > 0 && (
          <Animated.View entering={FadeIn.duration(motion.fast)} style={styles.topBarInner}>
            <IconButton icon="chevron.left" label="Back" size={44} tone="ghost" iconScale={0.45} onPress={back} />
            <StepProgress step={step} total={STEPS - 1} />
            <View style={styles.topBarSpacer} />
          </Animated.View>
        )}
      </View>

      <View style={styles.flex}>
        <Animated.View
          key={step}
          entering={(dir === 1 ? FadeInRight : FadeInLeft).duration(motion.base)}
          exiting={FadeOut.duration(motion.fast)}
          style={StyleSheet.absoluteFill}>
          {/* Scrolls on small phones and large text sizes instead of running under the button. */}
          <ScrollView contentContainerStyle={styles.stepScroll} showsVerticalScrollIndicator={false} alwaysBounceVertical={false}>
            {step === 0 && <Welcome />}
            {step === 1 && <Demo />}
            {step === 2 && (
              <ContentStep
                value={contentTypes}
                onChange={(v) => {
                  Haptics.selectionAsync();
                  setContentTypes(v);
                }}
              />
            )}
            {step === 3 && (
              <PlatformStep
                value={platforms}
                onChange={(v) => {
                  Haptics.selectionAsync();
                  setPlatforms(v);
                }}
              />
            )}
            {step === 4 && <Privacy />}
            {step === 5 && <Ready />}
          </ScrollView>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <GradientButton title={cta} shape="pill" disabled={needsChoice} onPress={next} />
        <AppText variant="caption" color={colors.textMuted} style={styles.center}>
          {step === 0 ? 'No account. No uploads. Everything stays on your iPhone.' : needsChoice ? 'Choose at least one to continue.' : ' '}
        </AppText>
      </View>
    </View>
  );
}

/** Thin continuous bar that eases to the new step, like iOS setup flows. */
function StepProgress({ step, total }: { step: number; total: number }) {
  const p = useSharedValue(step / total);
  useEffect(() => {
    p.set(withTiming(step / total, { duration: motion.base, easing: Easing.out(Easing.cubic) }));
  }, [p, step, total]);
  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View
      style={styles.progressTrack}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}
      accessibilityValue={{ min: 0, max: total, now: step }}>
      <Animated.View style={[styles.progressFill, fill]} />
    </View>
  );
}

/* ---------- Step 0: welcome with a fan of ten clips ---------- */

const WELCOME_FACTS: { value: string; label: string }[] = [
  { value: '~1 min', label: 'per clip' },
  { value: '12', label: 'caption styles' },
  { value: '9:16', label: 'ready to post' },
];

function Welcome() {
  return (
    <View style={styles.welcome}>
      <View style={styles.fan} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: 10 }).map((_, i) => (
          <FanCard key={i} i={i} />
        ))}
      </View>
      <View style={styles.welcomeText}>
        <AppText variant="display" style={styles.center} accessibilityRole="header">
          Ten clips in.{'\n'}Ten videos out.
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.center}>
          Tenfold cuts pauses and filler words, adds captions and zooms, and saves every video to Photos.
        </AppText>
      </View>
      <View style={styles.facts}>
        {WELCOME_FACTS.map((f, i) => (
          <View key={f.label} style={[styles.fact, i > 0 && styles.factDivider]} accessible accessibilityLabel={`${f.value} ${f.label}`}>
            <AppText variant="title" tabular>
              {f.value}
            </AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              {f.label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

// Animates once on first show (about 500 ms in total), then holds still.
function FanCard({ i }: { i: number }) {
  const off = i - 4.5;
  const p = useSharedValue(0);

  useEffect(() => {
    p.set(withDelay(i * 20, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })));
  }, [i, p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [
      { translateX: off * 27 * p.value },
      { translateY: (1 - p.value) * 40 + Math.abs(off) * Math.abs(off) * 3 },
      { rotate: `${off * 6 * p.value}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.fanCard, { zIndex: 10 - Math.round(Math.abs(off)) }, style]}>
      <Thumb seed={i} style={styles.fanThumb}>
        <View style={styles.fanCaption}>
          <View style={styles.fanLine} />
          <View style={[styles.fanLine, styles.fanLineShort]} />
        </View>
      </Thumb>
    </Animated.View>
  );
}

/* ---------- Step 1: what one edit does, with real numbers ---------- */

const BENEFITS: { icon: SFSymbol; title: string; body: string }[] = [
  { icon: 'scissors', title: 'Pauses and filler words cut', body: 'Silences, “um” and “uh” are removed.' },
  { icon: 'captions.bubble', title: 'Word-by-word captions', body: '12 styles, synced to your voice.' },
  { icon: 'plus.magnifyingglass', title: 'A zoom at each cut', body: 'So the edit doesn’t jump.' },
  { icon: 'rectangle.portrait', title: 'Framed for vertical', body: '9:16, centred on your face.' },
];

function Demo() {
  // One pass under 600 ms: the clip shrinks as the cut sections fade out.
  const shrink = useSharedValue(0);
  useEffect(() => {
    shrink.set(withDelay(120, withTiming(1, { duration: 440, easing: Easing.inOut(Easing.cubic) })));
  }, [shrink]);
  const bar = useAnimatedStyle(() => ({ width: `${100 - shrink.value * 25}%` }));
  const cut = useAnimatedStyle(() => ({ opacity: 1 - shrink.value }));

  return (
    <View style={styles.stepPad}>
      <View style={styles.qHead}>
        <AppText variant="display" accessibilityRole="header">
          A batch of 10 in about 10 minutes
        </AppText>
        <AppText variant="body" color={colors.textSecondary}>
          Tenfold edits on your iPhone while you do something else.
        </AppText>
      </View>

      <Card style={styles.beforeAfter}>
        <View style={styles.baRow}>
          <AppText variant="label" color={colors.textSecondary}>
            Raw clip
          </AppText>
          <AppText variant="label" color={colors.textSecondary} tabular>
            1:12
          </AppText>
        </View>
        <View style={styles.baTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Animated.View style={[styles.baFill, bar]}>
            <Animated.View style={[styles.baCut, { left: '18%' }, cut]} />
            <Animated.View style={[styles.baCut, { left: '47%' }, cut]} />
            <Animated.View style={[styles.baCut, { left: '71%' }, cut]} />
          </Animated.View>
        </View>
        <View style={styles.baRow}>
          <AppText variant="bodyStrong">Edited</AppText>
          <AppText variant="label" color={colors.success} tabular>
            0:54 · 18 s removed
          </AppText>
        </View>
      </Card>

      <View style={styles.list}>
        {BENEFITS.map((b) => (
          <View key={b.title} style={styles.benefit}>
            <SymbolView name={b.icon} size={20} tintColor={colors.textPrimary} weight="regular" style={styles.rowIcon} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{b.title}</AppText>
              <AppText variant="label" color={colors.textSecondary}>
                {b.body}
              </AppText>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ---------- Step 2: what do you make ---------- */

const CONTENT: { v: ContentType; icon: SFSymbol; title: string; body: string }[] = [
  { v: 'talking', icon: 'person.wave.2', title: 'Talking to camera', body: 'Tips, stories, opinions' },
  { v: 'podcast', icon: 'mic', title: 'Podcast clips', body: 'Interviews and conversations' },
  { v: 'tutorial', icon: 'graduationcap', title: 'Tutorials', body: 'How-tos and explainers' },
  { v: 'vlog', icon: 'camera', title: 'Vlogs', body: 'Day in the life, travel' },
  { v: 'ads', icon: 'megaphone', title: 'Ads and promos', body: 'Products, UGC, offers' },
];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function ContentStep({ value, onChange }: { value: ContentType[]; onChange: (v: ContentType[]) => void }) {
  return (
    <View style={styles.stepPad}>
      <View style={styles.qHead}>
        <AppText variant="display" accessibilityRole="header">
          What do you make?
        </AppText>
        <AppText variant="body" color={colors.textSecondary}>
          This sets your starting cuts, captions and zoom. Choose all that apply.
        </AppText>
      </View>
      <View style={styles.group}>
        {CONTENT.map((c, i) => {
          const on = value.includes(c.v);
          return (
            <Pressable
              key={c.v}
              onPress={() => onChange(toggle(value, c.v))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${c.title}. ${c.body}`}
              style={({ pressed }) => [styles.groupRow, i > 0 && styles.divider, pressed && styles.rowPressed]}>
              <SymbolView name={c.icon} size={20} tintColor={colors.textPrimary} weight="regular" style={styles.rowIcon} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{c.title}</AppText>
                <AppText variant="label" color={colors.textSecondary}>
                  {c.body}
                </AppText>
              </View>
              <SymbolView
                name={on ? 'checkmark.circle.fill' : 'circle'}
                size={22}
                tintColor={on ? colors.textPrimary : colors.textMuted}
                weight="regular"
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ---------- Step 3: where do you post ---------- */

const PLATFORMS: { v: Platform; icon: SFSymbol; label: string }[] = [
  { v: 'tiktok', icon: 'music.note', label: 'TikTok' },
  { v: 'reels', icon: 'camera.aperture', label: 'Reels' },
  { v: 'shorts', icon: 'play.rectangle', label: 'Shorts' },
  { v: 'youtube', icon: 'play.tv', label: 'YouTube' },
  { v: 'linkedin', icon: 'briefcase', label: 'LinkedIn' },
];

function PlatformStep({ value, onChange }: { value: Platform[]; onChange: (v: Platform[]) => void }) {
  return (
    <View style={styles.stepPad}>
      <View style={styles.qHead}>
        <AppText variant="display" accessibilityRole="header">
          Where do you post?
        </AppText>
        <AppText variant="body" color={colors.textSecondary}>
          This sets the frame size and keeps captions clear of each app’s buttons.
        </AppText>
      </View>
      <View style={styles.tiles}>
        {PLATFORMS.map((p) => {
          const on = value.includes(p.v);
          return (
            <Pressable
              key={p.v}
              onPress={() => onChange(toggle(value, p.v))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={p.label}
              style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && styles.tilePressed]}>
              <SymbolView name={p.icon} size={22} tintColor={on ? colors.textInverse : colors.textPrimary} weight="regular" />
              <AppText variant="bodyStrong" color={on ? colors.textInverse : colors.textPrimary}>
                {p.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ---------- Step 4: privacy + on-device speech ---------- */

const PRIVACY_ROWS: { icon: SFSymbol; title: string; body: string }[] = [
  { icon: 'icloud.slash', title: 'No uploads', body: 'Clips are edited on this iPhone and saved to Photos.' },
  { icon: 'person.crop.circle.badge.xmark', title: 'No account', body: 'Nothing to sign up for.' },
  { icon: 'infinity', title: 'No credits', body: 'Your phone does the work, so nothing is metered.' },
];

function Privacy() {
  const { speech, speechProgress } = useSettings();
  useEffect(() => {
    refreshSpeechStatus();
  }, []);
  return (
    <View style={styles.stepPad}>
      <View style={styles.qHead}>
        <SymbolView name="lock.shield" size={32} tintColor={colors.violet} weight="regular" style={styles.headIcon} />
        <AppText variant="display" accessibilityRole="header">
          Your videos stay on your phone
        </AppText>
      </View>
      <View style={styles.list}>
        {PRIVACY_ROWS.map((r) => (
          <View key={r.title} style={styles.benefit}>
            <SymbolView name={r.icon} size={20} tintColor={colors.textPrimary} weight="regular" style={styles.rowIcon} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{r.title}</AppText>
              <AppText variant="label" color={colors.textSecondary}>
                {r.body}
              </AppText>
            </View>
          </View>
        ))}
      </View>
      {speech !== 'unsupported' && speech !== 'unknown' && (
        <Card style={styles.modelCard}>
          <View style={styles.modelHead}>
            <SymbolView
              name={speech === 'installed' ? 'checkmark.circle.fill' : 'waveform'}
              size={20}
              tintColor={speech === 'installed' ? colors.success : colors.textPrimary}
              weight="regular"
              style={styles.rowIcon}
            />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">On-device speech</AppText>
              <AppText variant="label" color={colors.textSecondary} tabular>
                {speech === 'installed'
                  ? 'Installed. Captions and filler-word cuts are on.'
                  : speech === 'downloading'
                    ? `Downloading, ${Math.round(speechProgress * 100)}%. It finishes in the background.`
                    : 'iOS downloads Apple’s speech model for your language once. Best on Wi-Fi.'}
              </AppText>
            </View>
          </View>
          {speech === 'downloading' && <ProgressBar progress={speechProgress} height={4} />}
          {speech === 'supported' && <OutlineButton title="Download speech model" icon="arrow.down.circle" height={44} onPress={prepareSpeech} />}
        </Card>
      )}
    </View>
  );
}

/* ---------- Step 5: personalised summary ---------- */

function capitalise(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function Ready() {
  const { defaultPreset, platforms } = useSettings();
  const preset = batchPreset(defaultPreset, platforms);
  const presetName = PRESET_OPTIONS.find((p) => p.id === defaultPreset)?.name ?? 'Clean Talk';
  const rows = [
    { label: 'Preset', value: presetName },
    { label: 'Captions', value: presetById(preset.captions.styleId).name },
    { label: 'Pause cuts', value: capitalise(preset.analysis.silence) },
    { label: 'Zoom', value: preset.zoom.mode === 'off' ? 'Off' : preset.zoom.mode === 'dynamic' ? 'Dynamic' : 'Subtle' },
    { label: 'Format', value: preset.crop.aspect === 'original' || !preset.crop.auto916 ? 'Original' : '9:16 vertical' },
  ];
  return (
    <View style={styles.stepPad}>
      <View style={styles.qHead}>
        <AppText variant="display" accessibilityRole="header">
          Your starting style
        </AppText>
        <AppText variant="body" color={colors.textSecondary}>
          Every batch uses these settings. You can change them before each one.
        </AppText>
      </View>
      <View style={styles.group}>
        {rows.map((r, i) => (
          <View key={r.label} style={[styles.summaryRow, i > 0 && styles.divider]} accessible accessibilityLabel={`${r.label}: ${r.value}`}>
            <AppText variant="body" color={colors.textSecondary} style={styles.flex}>
              {r.label}
            </AppText>
            <AppText variant="bodyStrong" tabular>
              {r.value}
            </AppText>
          </View>
        ))}
      </View>
      <AppText variant="label" color={colors.textMuted}>
        For the cleanest cuts, record in good light and leave a second of silence at the start.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },

  topBar: { height: 44, marginBottom: spacing.md },
  topBarInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  topBarSpacer: { width: 44 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: colors.textPrimary },

  footer: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.md },

  stepScroll: { flexGrow: 1, paddingBottom: spacing.lg },
  stepPad: { flex: 1, paddingHorizontal: spacing.gutter, gap: spacing.xxl },
  qHead: { gap: spacing.sm },
  headIcon: { width: 32, height: 32, marginBottom: spacing.xs },

  // Welcome
  welcome: { flex: 1, justifyContent: 'center', gap: spacing.xxl, paddingHorizontal: spacing.gutter },
  welcomeText: { gap: spacing.md },
  facts: { flexDirection: 'row' },
  fact: { flex: 1, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  factDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.borderStrong },
  fan: { height: 200, alignItems: 'center', justifyContent: 'center' },
  fanCard: { position: 'absolute' },
  fanThumb: {
    width: 78,
    height: 138,
    borderRadius: radii.thumb,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'flex-end',
  },
  fanCaption: { alignItems: 'center', gap: spacing.xs, paddingBottom: spacing.lg },
  fanLine: { width: 46, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)' },
  fanLineShort: { width: 28, backgroundColor: '#FFE14D' },

  // Demo
  beforeAfter: { gap: spacing.md },
  baRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  baTrack: { height: 32, borderRadius: spacing.sm, backgroundColor: colors.cardHigh, overflow: 'hidden' },
  baFill: { height: '100%', borderRadius: spacing.sm, backgroundColor: '#3A2E5C' },
  baCut: { position: 'absolute', top: 0, bottom: 0, width: '7%', backgroundColor: colors.danger },

  // Plain icon + text rows (benefits, privacy)
  list: { gap: spacing.xl },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  rowIcon: { width: 24, height: 24 },

  // Grouped inset list (content types, summary)
  group: {
    borderRadius: radii.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: 64, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  rowPressed: { backgroundColor: colors.cardHigh },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.lg },

  // Platform tiles: two per row, the odd one spans the width.
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexGrow: 1,
    flexBasis: '40%',
    height: 88,
    borderRadius: radii.tile,
    borderCurve: 'continuous',
    padding: spacing.lg,
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileOn: { backgroundColor: colors.chipSelectedFill, borderColor: colors.chipSelectedFill },
  tilePressed: { opacity: 0.7 },

  // Privacy
  modelCard: { gap: spacing.md },
  modelHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
});
