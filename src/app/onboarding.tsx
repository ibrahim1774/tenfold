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
  SlideInRight,
  SlideOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, Card, GradientButton, IconButton, OutlineButton, PressableScale, ProgressBar, Thumb } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, fonts, motion, radii, spacing } from '@/design/tokens';
import { batchPreset, PRESET_OPTIONS } from '@/state/presets';
import { startModelDownload } from '@/state/modelDownload';
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
          entering={SlideInRight.springify().damping(20)}
          exiting={SlideOutLeft.duration(180)}
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
  return (
    <View style={styles.welcome}>
      <View style={styles.fan}>
        {Array.from({ length: 10 }).map((_, i) => (
          <FanCard key={i} i={i} />
        ))}
      </View>
      <Animated.View entering={FadeInDown.delay(500).duration(500)} style={styles.welcomeText}>
        <AppText variant="hero" style={styles.center}>
          Ten clips in.{'\n'}Ten videos out.
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.center}>
          Tenfold edits your talking videos in batches. Silences cut, captions added, ready to post.
        </AppText>
      </Animated.View>
    </View>
  );
}

function FanCard({ i }: { i: number }) {
  const off = i - 4.5;
  const p = useSharedValue(0);
  const float = useSharedValue(0);

  useEffect(() => {
    p.set(withDelay(i * 45, withSpring(1, { damping: 14, stiffness: 120 })));
    float.set(
      withDelay(900 + i * 80, withRepeat(withSequence(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.sin) })), -1)),
    );
  }, [i, p, float]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [
      { translateX: off * 27 * p.value },
      { translateY: (1 - p.value) * 160 + Math.abs(off) * Math.abs(off) * 3 - float.value * 6 },
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

const DEMO = [
  { t: 'So', filler: false },
  { t: 'um', filler: true },
  { t: 'here', filler: false },
  { t: 'are', filler: false },
  { t: 'three', filler: false },
  { t: 'editing', filler: false },
  { t: 'tips', filler: false },
  { t: 'that', filler: false },
  { t: 'like', filler: true },
  { t: 'actually', filler: false },
  { t: 'work', filler: false },
];

function Demo() {
  const [idx, setIdx] = useState(0);
  const zoom = useSharedValue(1);
  const spoken = DEMO.filter((w) => !w.filler);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % spoken.length), 420);
    return () => clearInterval(id);
  }, [spoken.length]);

  useEffect(() => {
    // Punch-in at every "cut" (after each removed filler) and at the loop start.
    if (idx === 0 || idx === 1 || idx === 6) {
      zoom.set(withSequence(withTiming(1.12, { duration: 140 }), withDelay(900, withSpring(1, motion.spring))));
    }
  }, [idx, zoom]);

  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
  const card = spoken.slice(Math.floor(idx / 3) * 3, Math.floor(idx / 3) * 3 + 3);
  const active = idx % 3;

  return (
    <View style={styles.stepPad}>
      <View style={styles.phone}>
        <Animated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
          <Thumb seed={0} style={StyleSheet.absoluteFill}>
            <View style={styles.person}>
              <SymbolView name="person.fill" size={120} tintColor="rgba(0,0,0,0.35)" />
            </View>
          </Thumb>
        </Animated.View>
        {/* Illustration only. In the real editor, captions are drawn natively so preview matches export. */}
        <View style={styles.demoCaption}>
          <AppText style={styles.demoText}>
            {card.map((w, i) => (
              <AppText key={`${w.t}-${i}`} style={[styles.demoText, i === active && styles.demoActive]}>
                {w.t}{' '}
              </AppText>
            ))}
          </AppText>
        </View>
      </View>

      <View style={styles.transcript}>
        {DEMO.map((w, i) => (
          <View key={i} style={[styles.word, w.filler && styles.wordCut]}>
            <AppText variant="chip" color={w.filler ? colors.danger : colors.chipText} style={w.filler && styles.strike}>
              {w.t}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.stepText}>
        <AppText variant="display" style={styles.center}>
          Dead air and ums, gone.
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.center}>
          Pauses and filler words are cut, every jump cut is hidden with a zoom, and captions follow each word.
        </AppText>
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
            <Animated.View key={c.v} entering={FadeInDown.delay(60 * i).duration(350)}>
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
            <Animated.View key={p.v} entering={FadeInDown.delay(50 * i).duration(350)} style={styles.tileWrap}>
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
  const { speechModel, modelProgress } = useSettings();
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
          <Animated.View key={r.title} entering={FadeInDown.delay(80 * i).duration(350)} style={styles.privacyRow}>
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
      <Card style={styles.modelCard}>
        <View style={styles.modelHead}>
          <SymbolView name="waveform" size={20} tintColor="#C9B6FF" />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">On-device speech model</AppText>
            <AppText variant="label" color={colors.textSecondary}>
              {speechModel === 'installed'
                ? 'Installed. Word-perfect captions are on.'
                : speechModel === 'downloading'
                  ? `Downloading ${Math.round(modelProgress * 100)}%. Keep going, it finishes in the background.`
                  : '600 MB, once. Best on Wi-Fi. Without it, captions use Apple speech.'}
            </AppText>
          </View>
        </View>
        {speechModel === 'downloading' && <ProgressBar progress={modelProgress} height={4} />}
        {speechModel === 'notDownloaded' && (
          <OutlineButton title="Download now" icon="arrow.down.circle" height={44} onPress={startModelDownload} />
        )}
        {speechModel === 'installed' && (
          <Animated.View entering={FadeIn} style={styles.installed}>
            <SymbolView name="checkmark.circle.fill" size={18} tintColor={colors.success} />
            <AppText variant="label" color={colors.success}>
              Ready
            </AppText>
          </Animated.View>
        )}
      </Card>
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
          <Animated.View key={r.label} entering={FadeInDown.delay(120 * i).duration(380)} style={styles.summaryRow}>
            <SymbolView name="checkmark.circle.fill" size={20} tintColor={colors.success} />
            <AppText variant="body" color={colors.textSecondary} style={styles.flex}>
              {r.label}
            </AppText>
            <AppText variant="bodyStrong">{r.value}</AppText>
          </Animated.View>
        ))}
      </Card>
      <Animated.View entering={FadeIn.delay(700)} exiting={FadeOut}>
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

  welcome: { flex: 1, justifyContent: 'center', gap: 56, paddingHorizontal: spacing.gutter },
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
  phone: {
    alignSelf: 'center',
    width: 200,
    height: 330,
    borderRadius: 30,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  person: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  demoCaption: { position: 'absolute', left: 12, right: 12, top: '58%', alignItems: 'center' },
  demoText: {
    fontFamily: fonts.bold,
    fontSize: 19,
    lineHeight: 24,
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 4,
  },
  demoActive: { color: '#FFE14D' },
  transcript: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  word: { height: 30, paddingHorizontal: 10, borderRadius: 15, justifyContent: 'center', backgroundColor: colors.chipFill },
  wordCut: { backgroundColor: colors.dangerSoft },
  strike: { textDecorationLine: 'line-through' },

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
