import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Background,
  Card,
  GradientButton,
  OutlineButton,
  PressableScale,
  ProgressBar,
  useTabBarSpace,
} from '@/design/components';
import { colors, gradients, spacing } from '@/design/tokens';
import { BatchCard } from '@/library/BatchCard';
import { useEntitlements } from '@/state/entitlements';
import { useLibrary } from '@/state/library';
import { useSettings } from '@/state/settings';
import { prepareSpeech } from '@/state/speech';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const isPro = useEntitlements((s) => s.isPro);
  const { speech, speechProgress } = useSettings();
  const batchMap = useLibrary((s) => s.batches);
  const batches = Object.values(batchMap).sort((a, b) => b.createdAt - a.createdAt);
  const recent = batches.slice(0, 4);

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: bottom }]}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
          <LinearGradient colors={gradients.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mark}>
            <AppText style={styles.markText}>10</AppText>
          </LinearGradient>
          <View style={styles.flex}>
            <AppText variant="label" color={colors.textSecondary}>
              {greeting()}
            </AppText>
            <AppText variant="bodyStrong" style={styles.brand}>
              Tenfold
            </AppText>
          </View>
          {isPro ? (
            <View style={styles.proPill}>
              <SymbolView name="crown.fill" size={15} tintColor="#FFC24D" />
              <AppText variant="chip">Pro</AppText>
            </View>
          ) : (
            <PressableScale onPress={() => router.push('/paywall')} style={styles.proPill} accessibilityRole="button" accessibilityLabel="Get Pro">
              <SymbolView name="crown" size={15} tintColor={colors.textPrimary} />
              <AppText variant="chip">Pro</AppText>
            </PressableScale>
          )}
        </Animated.View>

        {/* Hero */}
        <Animated.View entering={FadeInDown.delay(60).duration(450)} style={styles.hero}>
          <AppText variant="hero">
            Ten clips in.{'\n'}Ten videos out.
          </AppText>
          <AppText variant="label" color={colors.textSecondary} style={styles.heroSub}>
            Cuts, captions and zooms for every clip, edited on your iPhone.
          </AppText>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(450)} style={styles.ctaRow}>
          <GradientButton title="Edit a batch" onPress={() => router.push('/import')} style={styles.flex} height={58} />
          <OutlineButton title="Library" icon="film.stack" onPress={() => router.push('/library')} style={styles.flex} height={58} />
        </Animated.View>

        {/* On-device speech status (Apple manages the language assets) */}
        {(speech === 'supported' || speech === 'downloading') && (
          <Animated.View entering={FadeInDown.delay(160).duration(450)}>
            <Card style={styles.modelCard} padded={false}>
              <View style={styles.modelRow}>
                <View style={styles.modelIcon}>
                  <SymbolView name="waveform" size={18} tintColor="#C9B6FF" />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{speech === 'downloading' ? 'Setting up captions' : 'Turn on captions'}</AppText>
                  <AppText variant="caption" color={colors.textSecondary}>
                    {speech === 'downloading'
                      ? `${Math.round(speechProgress * 100)}% · you can keep going meanwhile`
                      : 'iOS downloads its on-device speech model once.'}
                  </AppText>
                </View>
                {speech === 'supported' && <OutlineButton title="Set up" height={36} onPress={prepareSpeech} style={styles.getBtn} />}
              </View>
              {speech === 'downloading' && <ProgressBar progress={speechProgress} height={4} />}
            </Card>
          </Animated.View>
        )}
        {speech === 'unsupported' && (
          <Card style={styles.modelCard}>
            <AppText variant="label" color={colors.textSecondary}>
              On-device speech isn’t available for your language on this iPhone, so captions are off. Cuts and zooms still work.
            </AppText>
          </Card>
        )}

        {/* Recent */}
        <Animated.View entering={FadeInDown.delay(200).duration(450)} style={styles.sectionHead}>
          <AppText variant="section">Recent batches</AppText>
          {batches.length > 0 && (
            <PressableScale haptic={false} onPress={() => router.push('/library')} accessibilityRole="link">
              <AppText variant="label" color={colors.textSecondary}>
                View all
              </AppText>
            </PressableScale>
          )}
        </Animated.View>

        {recent.length === 0 ? (
          <HowItWorks />
        ) : (
          <View style={styles.grid}>
            {Array.from({ length: Math.ceil(recent.length / 2) }).map((_, row) => (
              <Animated.View key={row} entering={FadeInDown.delay(240 + row * 60).duration(450)} style={styles.gridRow}>
                <BatchCard batch={recent[row * 2]} />
                {recent[row * 2 + 1] ? <BatchCard batch={recent[row * 2 + 1]} /> : <View style={styles.flex} />}
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function HowItWorks() {
  const steps = [
    { icon: 'photo.stack' as const, title: 'Pick up to 20 clips', body: 'Straight from your camera roll.' },
    { icon: 'wand.and.stars' as const, title: 'Choose a style', body: 'Captions, cuts and zoom in one preset.' },
    { icon: 'square.and.arrow.down' as const, title: 'Tap Edit all', body: 'Finished videos land in Photos.' },
  ];
  return (
    <Card style={styles.how}>
      {steps.map((s, i) => (
        <View key={s.title} style={styles.howRow}>
          <View style={styles.howIcon}>
            <SymbolView name={s.icon} size={18} tintColor={colors.textPrimary} weight="light" />
          </View>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">
              {i + 1}. {s.title}
            </AppText>
            <AppText variant="label" color={colors.textSecondary}>
              {s.body}
            </AppText>
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, gap: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: 'Poppins-Bold', fontSize: 17, lineHeight: 22, color: '#FFFFFF', letterSpacing: -0.5 },
  brand: { fontSize: 19, lineHeight: 24 },
  proPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(21,20,27,0.5)',
  },
  hero: { gap: spacing.sm, marginTop: spacing.sm },
  heroSub: { maxWidth: 300 },
  ctaRow: { flexDirection: 'row', gap: spacing.md },
  modelCard: { overflow: 'hidden' },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  modelIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.violetSoft,
  },
  getBtn: { paddingHorizontal: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -spacing.sm },
  grid: { gap: spacing.md },
  gridRow: { flexDirection: 'row', gap: spacing.md },
  how: { gap: spacing.lg },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  howIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
