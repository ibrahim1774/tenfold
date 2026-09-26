import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, GlassCard, GradientButton, PressableScale, ProgressRing } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, spacing } from '@/design/tokens';
import { useSettings } from '@/state/settings';

const SLIDES: { icon: SFSymbol; title: string; body: string }[] = [
  {
    icon: 'square.stack.3d.up.fill',
    title: 'Edit ten at once',
    body: 'Pick up to 20 clips, choose a preset, tap Edit all. Every video gets cut, zoomed and captioned.',
  },
  {
    icon: 'infinity',
    title: 'Truly unlimited',
    body: 'No credits. No minutes. No queue. Your iPhone does the work, so there is nothing to meter.',
  },
  {
    icon: 'lock.shield.fill',
    title: 'Private by design',
    body: 'Your videos never leave your phone. No uploads, no account, no tracking.',
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const { speechModel, modelProgress, setSpeechModel, setOnboarded } = useSettings();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const finish = () => {
    setOnboarded(true);
    router.replace('/');
  };

  // M0: simulated download. M1 calls TenfoldEngine.ensureSpeechModel() and listens to onModelDownloadProgress.
  const startDownload = () => {
    setSpeechModel('downloading', 0);
    let p = 0;
    timer.current = setInterval(() => {
      p += 0.04;
      if (p >= 1) {
        if (timer.current) clearInterval(timer.current);
        setSpeechModel('installed', 1);
      } else {
        setSpeechModel('downloading', p);
      }
    }, 120);
  };

  const onModelStep = step === SLIDES.length;

  return (
    <View style={[styles.flex, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
      <Background />
      <View style={styles.content}>
        {!onModelStep ? (
          <Animated.View key={step} entering={FadeInRight.springify()} exiting={FadeOutLeft} style={styles.slide}>
            <View style={styles.iconCircle}>
              <SymbolView name={SLIDES[step].icon} size={56} tintColor={colors.textPrimary} />
            </View>
            <AppText variant="display" style={styles.center}>
              {SLIDES[step].title}
            </AppText>
            <AppText variant="body" color={colors.textSecondary} style={styles.center}>
              {SLIDES[step].body}
            </AppText>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInRight.springify()} style={styles.slide}>
            <GlassCard style={styles.modelCard}>
              <View style={styles.ringWrap}>
                <ProgressRing
                  progress={speechModel === 'installed' ? 1 : modelProgress}
                  size={150}
                  label={speechModel === 'installed' ? 'Ready' : undefined}
                />
              </View>
              <AppText variant="title" style={styles.center}>
                Download speech model
              </AppText>
              <AppText variant="body" color={colors.textSecondary} style={styles.center}>
                600 MB, one time. Gives word-perfect caption timing and filler-word removal, fully offline.
              </AppText>
            </GlassCard>
          </Animated.View>
        )}
      </View>

      <View style={styles.dots}>
        {[...SLIDES, null].map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        {!onModelStep ? (
          <GradientButton title="Continue" icon={false} onPress={() => setStep((s) => s + 1)} />
        ) : speechModel === 'installed' ? (
          <GradientButton title="Start editing" onPress={finish} />
        ) : (
          <>
            <GradientButton
              title={speechModel === 'downloading' ? `Downloading ${Math.round(modelProgress * 100)}%` : 'Download (600 MB)'}
              icon={false}
              disabled={speechModel === 'downloading'}
              onPress={startDownload}
            />
            <PressableScale onPress={finish} style={styles.skip} accessibilityRole="button">
              <AppText variant="bodyStrong" color={colors.textSecondary}>
                Skip for now, use Apple speech
              </AppText>
            </PressableScale>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, paddingHorizontal: spacing.gutter + 4 },
  content: { flex: 1, justifyContent: 'center' },
  slide: { alignItems: 'center', gap: spacing.lg },
  iconCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,26,48,0.55)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: spacing.lg,
  },
  center: { textAlign: 'center' },
  modelCard: { alignSelf: 'stretch', gap: spacing.lg },
  ringWrap: { alignItems: 'center', marginBottom: spacing.sm },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: spacing.xl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { width: 24, backgroundColor: '#FFFFFF' },
  footer: { gap: spacing.md },
  skip: { alignSelf: 'center', padding: 12 },
});
