import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, GradientButton, IconButton } from '@/design/components';
import { colors, motion, spacing } from '@/design/tokens';
import { usePaywallGate } from '@/monetization/superwall';
import { Demo } from '@/onboarding/Demo';
import { hasSampleClip } from '@/onboarding/fileImport';
import { Hook } from '@/onboarding/Hook';
import { Language } from '@/onboarding/Language';
import { EV, setTraits, track } from '@/analytics/posthog';
import { logAttributionEvent, startAttribution } from '@/attribution/appsflyer';
import { Included } from '@/onboarding/Included';
import { Payoff } from '@/onboarding/PayoffScreen';
import { computePayoff } from '@/onboarding/savings';
import { MAKES_Q, MINUTES_Q, PER_WEEK_Q, ROLE_Q } from '@/onboarding/questions';
import { Ready } from '@/onboarding/Ready';
import { ChoiceList, StepHead, onboardingStyles } from '@/onboarding/ui';
import { tierOf, useEntitlements } from '@/state/entitlements';
import { useOnboarding } from '@/state/onboarding';
import { presetForContent, useSettings } from '@/state/settings';

type StepId = 'hook' | 'included' | 'demo' | 'role' | 'makes' | 'perWeek' | 'minutes' | 'payoff' | 'language' | 'ready';
// The demo step only exists when this build bundles the sample clip.
const HAS_DEMO = hasSampleClip();
const ALL_STEPS: StepId[] = ['hook', 'included', 'demo', 'role', 'makes', 'perWeek', 'minutes', 'payoff', 'language', 'ready'].filter(
  (s) => s !== 'demo' || HAS_DEMO,
) as StepId[];
const QUESTIONS: StepId[] = ['role', 'makes', 'perWeek', 'minutes'];

function toggle<T>(list: readonly T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<StepId>('hook');
  const [dir, setDir] = useState<1 | -1>(1);

  const { contentTypes, setContentTypes, setDefaultPreset, setOnboarded } = useSettings();
  const ob = useOnboarding();
  const free = useEntitlements((s) => tierOf(s) === 'free');
  const gate = usePaywallGate();
  const payoff = computePayoff(ob.videosPerWeek, ob.minutesPerVideo);

  // The payoff screen only exists when both of its answers were given.
  const stepsFor = (hasPayoff: boolean) => ALL_STEPS.filter((s) => s !== 'payoff' || hasPayoff);
  const steps = stepsFor(!!payoff);
  // Position in the full order, so a step that just dropped out (payoff) still has a place. Drives Back.
  const at = Math.max(0, steps.indexOf(step === 'payoff' && !payoff ? 'language' : step));
  // The progress bar counts the payoff screen whether or not it shows, so its total never changes mid-flow;
  // a missing payoff (answers from an older version that allowed skipping) moves the bar on by two.
  const shownAt = Math.max(0, ALL_STEPS.indexOf(step));

  useEffect(() => {
    track(EV.onboardingStep, { step, index: shownAt });
    // Only when the step changes; shownAt follows from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const go = (to: StepId | undefined, d: 1 | -1) => {
    if (!to) return;
    setDir(d);
    setStep(to);
  };
  /** The step after the current one, given whether the payoff screen will exist. */
  const after = (hasPayoff: boolean) => {
    const list = stepsFor(hasPayoff);
    const i = ALL_STEPS.indexOf(step);
    return list.find((s) => ALL_STEPS.indexOf(s) > i);
  };
  const next = () => go(after(!!payoff), 1);
  const back = () => go(steps[at - 1], -1);

  const finish = (tour: boolean) => {
    ob.setTourEnabled(tour);
    track(EV.onboardingCompleted, { tour, language: useSettings.getState().language });
    setTraits({
      role: ob.role,
      content_types: contentTypes.join(','),
      videos_per_week: ob.videosPerWeek,
      minutes_per_video: ob.minutesPerVideo,
      language: useSettings.getState().language,
      onboarded: true,
    });
    logAttributionEvent('af_complete_registration', { af_registration_method: 'onboarding' });
    // Replaying onboarding as a subscriber: no paywall.
    if (!free) {
      setOnboarded(true);
      return;
    }
    // Non-gated: Superwall's paywall (if the campaign shows one), then into the app either way.
    // Tenfold's own paywall when Superwall can't present; it finishes onboarding when closed.
    gate({
      placement: 'onboarding_end',
      run: () => setOnboarded(true),
      fallback: { pathname: '/paywall', params: { from: 'onboarding' } },
    });
  };

  const continueQuestion = () => {
    const value =
      step === 'role' ? ob.role : step === 'makes' ? contentTypes.join(',') : step === 'perWeek' ? ob.videosPerWeek : ob.minutesPerVideo;
    track(EV.onboardingAnswered, { question: step, value: value == null ? null : String(value) });
    if (step === 'makes' && contentTypes.length) setDefaultPreset(presetForContent(contentTypes));
    next();
  };

  const isQuestion = QUESTIONS.includes(step);
  const answered =
    (step === 'role' && !!ob.role) ||
    (step === 'makes' && contentTypes.length > 0) ||
    (step === 'perWeek' && !!ob.videosPerWeek) ||
    (step === 'minutes' && !!ob.minutesPerVideo);

  return (
    <View style={[styles.flex, { paddingTop: step === 'hook' ? 0 : insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.md }]}>
      <Background />

      {step !== 'hook' && (
        <View style={styles.topBar}>
          <IconButton icon="chevron.left" label="Back" onPress={back} />
          <StepProgress step={shownAt} total={ALL_STEPS.length - 1} />
          {/* Balances the back button so the bar stays centred. Questions have no skip: each needs an answer. */}
          <View style={styles.topBarEnd} />
        </View>
      )}

      <View style={styles.flex}>
        <Animated.View
          key={step}
          // Steps with Liquid Glass (the hook's badges, the demo's player) skip the fade-in: glass
          // doesn't draw under a parent that starts at opacity 0.
          entering={
            step === 'hook' || step === 'demo'
              ? undefined
              : (dir === 1 ? FadeInRight : FadeInLeft).duration(motion.base).reduceMotion(ReduceMotion.System)
          }
          exiting={FadeOut.duration(motion.fast).reduceMotion(ReduceMotion.System)}
          style={StyleSheet.absoluteFill}>
          {step === 'hook' ? (
            <Hook />
          ) : step === 'included' ? (
            <Included />
          ) : step === 'ready' ? (
            <Ready />
          ) : step === 'demo' ? (
            <Demo mode="onboarding" onContinue={next} />
          ) : (
            <ScrollView contentContainerStyle={onboardingStyles.pad} showsVerticalScrollIndicator={false} alwaysBounceVertical={false}>
              {step === 'role' && (
                <>
                  <StepHead title={ROLE_Q.title} />
                  <ChoiceList choices={ROLE_Q.options} selected={ob.role ? [ob.role] : []} onToggle={ob.setRole} />
                </>
              )}
              {step === 'makes' && (
                <>
                  <StepHead title={MAKES_Q.title} body={MAKES_Q.reason} />
                  <ChoiceList multi choices={MAKES_Q.options} selected={contentTypes} onToggle={(v) => setContentTypes(toggle(contentTypes, v))} />
                </>
              )}
              {step === 'perWeek' && (
                <>
                  <StepHead title={PER_WEEK_Q.title} />
                  <ChoiceList
                    choices={PER_WEEK_Q.options}
                    selected={ob.videosPerWeek ? [ob.videosPerWeek] : []}
                    onToggle={ob.setVideosPerWeek}
                  />
                </>
              )}
              {step === 'minutes' && (
                <>
                  <StepHead title={MINUTES_Q.title} />
                  <ChoiceList
                    choices={MINUTES_Q.options}
                    selected={ob.minutesPerVideo ? [ob.minutesPerVideo] : []}
                    onToggle={ob.setMinutesPerVideo}
                  />
                </>
              )}
              {step === 'payoff' && payoff && <Payoff payoff={payoff} />}
              {step === 'language' && <Language />}
            </ScrollView>
          )}
        </Animated.View>
      </View>

      {/* The demo draws its own footer (its button depends on the run). */}
      {step !== 'demo' && (
        <View style={styles.footer}>
          {step === 'hook' && (
            <>
              <GradientButton
                title={HAS_DEMO ? 'See it happen' : 'Get started'}
                shape="pill"
                onPress={() => {
                  // Apple's tracking prompt, then AppsFlyer; onboarding carries on underneath.
                  startAttribution();
                  next();
                }}
              />
              <AppText variant="caption" color={colors.textMuted} style={styles.center}>
                No account. Your videos never leave your iPhone.
              </AppText>
            </>
          )}
          {/* Every question needs an answer (at least one for the multi-select) before Continue works. */}
          {isQuestion && <GradientButton title="Continue" shape="pill" disabled={!answered} onPress={continueQuestion} />}
          {step === 'payoff' && <GradientButton title="Claim my time" shape="pill" onPress={next} />}
          {(step === 'included' || step === 'language') && <GradientButton title="Continue" shape="pill" onPress={next} />}
          {step === 'ready' && (
            <>
              <GradientButton title="Show me around" shape="pill" onPress={() => finish(true)} />
              <Pressable
                onPress={() => finish(false)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
                <AppText variant="bodyStrong" color={colors.textSecondary}>
                  I’ll explore on my own
                </AppText>
              </Pressable>
            </>
          )}
        </View>
      )}
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
    <Animated.View
      entering={FadeIn.duration(motion.fast).reduceMotion(ReduceMotion.System)}
      style={styles.progressTrack}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}
      accessibilityValue={{ min: 0, max: total, now: step }}>
      <Animated.View style={[styles.progressFill, fill]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  topBar: { height: 44, marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  topBarEnd: { width: 44, height: 44 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: colors.textPrimary },
  footer: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.sm },
  textButton: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  pressed: { opacity: 0.6 },
});
