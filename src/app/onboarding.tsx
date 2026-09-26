import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeInRight,
  FadeOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, Card, GradientButton, IconButton, OutlineButton, PressableScale, ProgressBar, Thumb } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, fonts, radii, spacing } from '@/design/tokens';
import { batchPreset, PRESET_OPTIONS } from '@/state/presets';
import { prepareSpeech, refreshSpeechStatus } from '@/state/speech';
import { presetForContent, useSettings, type ContentType, type Platform } from '@/state/settings';

const STEPS = 6;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const { contentTypes, platforms, setContentTypes, setPlatforms, setDefaultPreset } = useSettings();

  const next = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 2) setDefaultPreset(presetForContent(contentTypes));
    if (step < STEPS - 1) setStep(step + 1);
    else router.push({ pathname: '/paywall', params: { from: 'onboarding' } });
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const canContinue = step === 2 ? contentTypes.length > 0 : step === 3 ? platforms.length > 0 : true;
  const cta = ['Get started', 'Continue', 'Continue', 'Continue', 'Continue', 'Start editing'][step];

  return (
    <View style={[styles.flex, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      <Background />

      {step > 0 && (
        <Animated.View entering={FadeIn} style={styles.topBar}>
          <IconButton icon="chevron.left" label="Back" size={40} onPress={back} />
          <View style={styles.segments}>
            {Array.from({ length: STEPS - 1 }).map((_, i) => (
              <View key={i} style={[styles.segment, i < step && styles.segmentOn]} />
            ))}
          </View>
          <View style={{ width: 40 }} />
        </Animated.View>
      )}

      <View style={styles.flex}>
        <Animated.View
          key={step}
          entering={FadeInRight.duration(220)}
          exiting={FadeOutLeft.duration(140)}
          style={StyleSheet.absoluteFill}>
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
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <GradientButton title={cta} icon={false} trailingArrow={step > 0} shape="pill" disabled={!canContinue} onPress={next} />
        {step === 0 && (
          <AppText variant="caption" color={colors.textMuted} style={styles.center}>
            No account. No uploads. Just your iPhone.
          </AppText>
        )}
      </View>
    </View>
  );
}

/* ---------- Step 0: welcome with a fan of ten clips ---------- */

function Welcome() {
  const stats: { value: string; label: string }[] = [
    { value: '10', label: 'clips edited at once' },
    { value: '~1 min', label: 'per clip, hands-off' },
    { value: '0', label: 'uploads or credits' },
  ];
  return (
    <View style={styles.welcome}>
      <View style={styles.fan}>
        {Array.from({ length: 10 }).map((_, i) => (
          <FanCard key={i} i={i} />
        ))}
      </View>
      <Animated.View entering={FadeInDown.delay(250).duration(300)} style={styles.welcomeText}>
        <AppText variant="hero" style={styles.center}>
          Ten clips in.{'\n'}Ten videos out.
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.center}>
          Pick your clips and tap once. Tenfold cuts the pauses and “ums”, adds captions and zooms, and saves every video to Photos.
        </AppText>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(350).duration(300)} style={styles.stats}>
        {stats.map((st) => (
          <View key={st.label} style={styles.stat}>
            <AppText style={styles.statValue}>{st.value}</AppText>
            <AppText variant="caption" color={colors.textSecondary} style={styles.center}>
              {st.label}
            </AppText>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

function FanCard({ i }: { i: number }) {
  const off = i - 4.5;
  const p = useSharedValue(0);

  useEffect(() => {
    p.set(withDelay(i * 22, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) })));
  }, [i, p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [
      { translateX: off * 27 * p.value },
      { translateY: (1 - p.value) * 60 + Math.abs(off) * Math.abs(off) * 3 },
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

/* ---------- Step 1: animated demo of what an edit does ---------- */


const BENEFITS: { icon: SFSymbol; title: string; body: string }[] = [
  { icon: 'scissors', title: 'Pauses and “ums” cut', body: 'Dead air and filler words, gone automatically.' },
  { icon: 'captions.bubble', title: 'Word-by-word captions', body: '12 styles, including TikTok’s own fonts.' },
  { icon: 'plus.magnifyingglass', title: 'Zooms hide every cut', body: 'No jumpy jump cuts.' },
  { icon: 'rectangle.portrait', title: 'Ready for TikTok and Reels', body: '9:16, framed on your face.' },
];

function Demo() {
  const shrink = useSharedValue(0);
  useEffect(() => {
    shrink.set(withDelay(250, withTiming(1, { duration: 650, easing: Easing.inOut(Easing.cubic) })));
  }, [shrink]);
  const bar = useAnimatedStyle(() => ({ width: `${100 - shrink.value * 25}%` }));
  const cut = useAnimatedStyle(() => ({ opacity: 1 - shrink.value }));

  return (
    <View style={styles.stepPad}>
      <View style={styles.qHead}>
        <AppText variant="display">Hours of editing, done in minutes</AppText>
        <AppText variant="body" color={colors.textSecondary}>
          A batch of 10 clips takes about 10 minutes on your iPhone, while you do something else.
        </AppText>
      </View>

      <Card style={styles.beforeAfter}>
        <View style={styles.baRow}>
          <AppText variant="label" color={colors.textSecondary}>
            Your raw clip
          </AppText>
          <AppText variant="label" color={colors.textSecondary}>
            1:12
          </AppText>
        </View>
        <View style={styles.baTrack}>
          <Animated.View style={[styles.baFill, bar]}>
            <Animated.View style={[styles.baCut, { left: '18%' }, cut]} />
            <Animated.View style={[styles.baCut, { left: '47%' }, cut]} />
            <Animated.View style={[styles.baCut, { left: '71%' }, cut]} />
          </Animated.View>
        </View>
        <View style={styles.baRow}>
          <AppText variant="bodyStrong">After Tenfold</AppText>
          <AppText variant="bodyStrong" color={colors.success}>
            0:54 · 18 s of dead air removed
          </AppText>
        </View>
      </Card>

      <View style={styles.options}>
        {BENEFITS.map((b, i) => (
          <Animated.View key={b.title} entering={FadeInDown.delay(60 * i).duration(260)} style={styles.benefit}>
            <View style={styles.benefitIcon}>
              <SymbolView name={b.icon} size={18} tintColor={colors.textPrimary} weight="regular" />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{b.title}</AppText>
              <AppText variant="label" color={colors.textSecondary}>
                {b.body}
              </AppText>
            </View>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

/* ---------- Step 2: what do you make ---------- */

const CONTENT: { v: ContentType; icon: SFSymbol; title: string; body: string }[] = [
  { v: 'talking', icon: 'person.wave.2', title: 'Talking to camera', body: 'Tips, stories, hot takes' },
  { v: 'podcast', icon: 'mic', title: 'Podcast clips', body: 'Interviews and conversations' },
  { v: 'tutorial', icon: 'graduationcap', title: 'Tutorials', body: 'How-tos and explainers' },
  { v: 'vlog', icon: 'camera', title: 'Vlogs', body: 'Day-in-the-life, travel' },
  { v: 'ads', icon: 'megaphone', title: 'Ads and promos', body: 'Products, UGC, offers' },
];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function ContentStep({ value, onChange }: { value: ContentType[]; onChange: (v: ContentType[]) => void }) {
  return (
    <View style={styles.stepPad}>
      <View style={styles.qHead}>
        <AppText variant="display">What do you make?</AppText>
        <AppText variant="body" color={colors.textSecondary}>
          We’ll pick your starting style. Choose all that fit.
        </AppText>
      </View>
      <View style={styles.options}>
        {CONTENT.map((c, i) => {
          const on = value.includes(c.v);
          return (
            <Animated.View key={c.v} entering={FadeInDown.delay(40 * i).duration(240)}>
              <PressableScale
                haptic={false}
                onPress={() => onChange(toggle(value, c.v))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[styles.option, on && styles.optionOn]}>
                <View style={[styles.optionIcon, on && styles.optionIconOn]}>
                  <SymbolView name={c.icon} size={20} tintColor={on ? colors.textInverse : colors.textPrimary} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{c.title}</AppText>
                  <AppText variant="label" color={colors.textSecondary}>
                    {c.body}
                  </AppText>
                </View>
                <SymbolView
                  name={on ? 'checkmark.circle.fill' : 'circle'}
                  size={22}
                  tintColor={on ? '#FFFFFF' : 'rgba(255,255,255,0.3)'}
                />
              </PressableScale>
            </Animated.View>
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
        <AppText variant="display">Where do you post?</AppText>
        <AppText variant="body" color={colors.textSecondary}>
          We’ll frame and place captions so the app buttons never cover them.
        </AppText>
      </View>
      <View style={styles.tiles}>
        {PLATFORMS.map((p, i) => {
          const on = value.includes(p.v);
          return (
            <Animated.View key={p.v} entering={FadeInDown.delay(35 * i).duration(240)} style={styles.tileWrap}>
              <PressableScale
                haptic={false}
                onPress={() => onChange(toggle(value, p.v))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[styles.tile, on && styles.tileOn]}>
                <SymbolView name={p.icon} size={26} tintColor={on ? colors.textInverse : colors.textPrimary} weight="light" />
                <AppText variant="bodyStrong" color={on ? colors.textInverse : colors.textPrimary}>
                  {p.label}
                </AppText>
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

/* ---------- Step 4: privacy + on-device model ---------- */

function Privacy() {
  const { speech, speechProgress } = useSettings();
  useEffect(() => {
    refreshSpeechStatus();
  }, []);
  const rows: { icon: SFSymbol; title: string; body: string }[] = [
    { icon: 'icloud.slash', title: 'No uploads', body: 'Your clips are edited on this iPhone.' },
    { icon: 'person.crop.circle.badge.xmark', title: 'No account', body: 'Nothing to sign up for.' },
    { icon: 'infinity', title: 'No credits', body: 'Your phone does the work, so nothing is metered.' },
  ];
  return (
    <View style={styles.stepPad}>
      <View style={styles.qHead}>
        <View style={styles.shield}>
          <SymbolView name="lock.shield" size={36} tintColor="#C9B6FF" weight="light" />
        </View>
        <AppText variant="display">Your videos never leave your phone</AppText>
      </View>
      <View style={styles.options}>
        {rows.map((r, i) => (
          <Animated.View key={r.title} entering={FadeInDown.delay(50 * i).duration(240)} style={styles.privacyRow}>
            <SymbolView name={r.icon} size={22} tintColor={colors.textPrimary} weight="light" />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{r.title}</AppText>
              <AppText variant="label" color={colors.textSecondary}>
                {r.body}
              </AppText>
            </View>
          </Animated.View>
        ))}
      </View>
      {speech !== 'unsupported' && speech !== 'unknown' && (
        <Card style={styles.modelCard}>
          <View style={styles.modelHead}>
            <SymbolView name="waveform" size={20} tintColor="#C9B6FF" />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">On-device speech</AppText>
              <AppText variant="label" color={colors.textSecondary}>
                {speech === 'installed'
                  ? 'Ready. Captions and filler-word cuts are on.'
                  : speech === 'downloading'
                    ? `Setting up ${Math.round(speechProgress * 100)}%. Keep going, it finishes in the background.`
                    : 'iOS downloads Apple’s speech model for your language once. Best on Wi-Fi.'}
              </AppText>
            </View>
          </View>
          {speech === 'downloading' && <ProgressBar progress={speechProgress} height={4} />}
          {speech === 'supported' && <OutlineButton title="Set up now" icon="arrow.down.circle" height={44} onPress={prepareSpeech} />}
          {speech === 'installed' && (
            <Animated.View entering={FadeIn} style={styles.installed}>
              <SymbolView name="checkmark.circle.fill" size={18} tintColor={colors.success} />
              <AppText variant="label" color={colors.success}>
                Ready
              </AppText>
            </Animated.View>
          )}
        </Card>
      )}
    </View>
  );
}

/* ---------- Step 5: personalised summary ---------- */

function Ready() {
  const { defaultPreset, platforms } = useSettings();
  const preset = batchPreset(defaultPreset);
  const presetName = PRESET_OPTIONS.find((p) => p.id === defaultPreset)?.name ?? 'Clean Talk';
  const vertical = platforms.some((p) => p !== 'youtube' && p !== 'linkedin') || platforms.length === 0;
  const rows = [
    { label: 'Preset', value: presetName },
    { label: 'Captions', value: preset.captions.styleId[0].toUpperCase() + preset.captions.styleId.slice(1) },
    { label: 'Silences', value: preset.analysis.silence[0].toUpperCase() + preset.analysis.silence.slice(1) },
    { label: 'Zoom', value: preset.zoom.mode === 'off' ? 'Off' : preset.zoom.mode === 'dynamic' ? 'Dynamic' : 'Subtle' },
    { label: 'Format', value: vertical ? '9:16 vertical' : 'Keep original' },
  ];
  return (
    <View style={styles.stepPad}>
      <View style={styles.qHead}>
        <AppText variant="display">You’re set up</AppText>
        <AppText variant="body" color={colors.textSecondary}>
          This is your starting style. Every batch can change it.
        </AppText>
      </View>
      <Card style={styles.summary}>
        {rows.map((r, i) => (
          <Animated.View key={r.label} entering={FadeInDown.delay(60 * i).duration(260)} style={styles.summaryRow}>
            <SymbolView name="checkmark.circle.fill" size={20} tintColor={colors.success} />
            <AppText variant="body" color={colors.textSecondary} style={styles.flex}>
              {r.label}
            </AppText>
            <AppText variant="bodyStrong">{r.value}</AppText>
          </Animated.View>
        ))}
      </Card>
      <Animated.View entering={FadeIn.delay(350)} exiting={FadeOut}>
        <AppText variant="label" color={colors.textMuted} style={styles.center}>
          Tip: record in good light and leave a second of silence at the start.
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.gutter, marginBottom: spacing.lg },
  segments: { flex: 1, flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  segmentOn: { backgroundColor: '#FFFFFF' },
  footer: { paddingHorizontal: spacing.gutter, gap: spacing.md },

  welcome: { flex: 1, justifyContent: 'center', gap: 36, paddingHorizontal: spacing.gutter },
  stats: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: radii.tile,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  statValue: { fontFamily: fonts.semiBold, fontSize: 22, lineHeight: 28, color: '#FFFFFF' },
  beforeAfter: { gap: 10 },
  baRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  baTrack: { height: 34, borderRadius: 10, backgroundColor: colors.cardHigh, overflow: 'hidden' },
  baFill: { height: '100%', borderRadius: 10, backgroundColor: '#3A2E5C' },
  baCut: { position: 'absolute', top: 0, bottom: 0, width: '7%', backgroundColor: colors.danger },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  benefitIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fan: { height: 200, alignItems: 'center', justifyContent: 'center' },
  fanCard: { position: 'absolute' },
  fanThumb: {
    width: 78,
    height: 138,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'flex-end',
  },
  fanCaption: { alignItems: 'center', gap: 4, paddingBottom: 18 },
  fanLine: { width: 46, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)' },
  fanLineShort: { width: 28, backgroundColor: '#FFE14D' },
  welcomeText: { gap: spacing.md },

  stepPad: { flex: 1, paddingHorizontal: spacing.gutter, gap: spacing.xl },
  stepText: { gap: spacing.sm },

  qHead: { gap: spacing.sm, marginTop: spacing.sm },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radii.tile,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionOn: { borderColor: 'rgba(255,255,255,0.5)', backgroundColor: colors.cardHigh },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardHigh,
  },
  optionIconOn: { backgroundColor: '#FFFFFF' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tileWrap: { width: '47.5%' },
  tile: {
    height: 104,
    borderRadius: radii.tile,
    borderCurve: 'continuous',
    padding: 16,
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },

  shield: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.violetSoft,
    boxShadow: '0 0 40px rgba(139,92,246,0.45)',
    marginBottom: spacing.sm,
  },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 6 },
  modelCard: { gap: spacing.md },
  modelHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  installed: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  summary: { gap: spacing.lg },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
