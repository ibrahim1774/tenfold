import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useIsFocused } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { AppText } from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';

/**
 * What every video gets, shown rather than listed: a real take (a muted, looping stock clip) whose silent
 * gaps collapse, whose "um" drops out, whose captions light up word by word, and which then crops to
 * vertical. One loop, the only looping animation in the app (an explicit exception to docs/DESIGN.md §4);
 * under Reduce Motion the clip doesn't play and the still poster rests on the finished state.
 *
 * The clip (assets/onboarding/demo.mp4, Mixkit 39813, see assets/onboarding/VIDEO.md) is exactly one
 * cycle long, and the overlay timeline is re-synced to the player's position whenever playback starts.
 */
const DEMO = require('../../assets/onboarding/demo.mp4');
const POSTER = require('../../assets/onboarding/demo-poster.jpg');
const CYCLE = 7215;
const STILL = 0.9;

const BEATS = [
  { label: 'Silences', from: 0, to: 0.22 },
  { label: 'Filler words', from: 0.22, to: 0.44 },
  { label: 'Captions', from: 0.44, to: 0.68 },
  { label: 'Vertical', from: 0.68, to: 0.9 },
];

// Every step eases back to the start just before the loop wraps, so the jump from 1 to 0 is invisible.
const RESET: [number, number] = [0.93, 0.99];

const WORDS = ['Here’s', 'um', 'how', 'I', 'post', 'every', 'day'];
const FILLER = 1;
const WORD_STEP = 0.034;

// Waveform: speech runs with silent gaps between them. Bar heights are fixed so the strip is stable.
const SEGMENTS: { silent: boolean; bars: number[] }[] = [
  { silent: false, bars: [10, 18, 26, 14, 22, 30, 16, 12] },
  { silent: true, bars: [3, 3, 3, 3, 3] },
  { silent: false, bars: [14, 24, 32, 20, 12, 18, 26] },
  { silent: true, bars: [3, 3, 3, 3, 3, 3] },
  { silent: false, bars: [20, 12, 28, 34, 22, 16, 24, 10] },
  { silent: true, bars: [3, 3, 3, 3] },
  { silent: false, bars: [16, 26, 14, 20, 12] },
];
const BAR = 3;
const BAR_GAP = 3;

const A11Y =
  'Tenfold removes dead silences, cuts filler words like um and uh, drops retakes, adds word-by-word captions, frames every video for vertical, and edits ten videos at a time.';

/** Smoothstep of t between a and b, then back to 0 over the reset window. */
function step(t: number, a: number, b: number) {
  'worklet';
  const up = interpolate(t, [a, b], [0, 1], 'clamp');
  const down = interpolate(t, RESET, [1, 0], 'clamp');
  const p = Math.min(up, down);
  return p * p * (3 - 2 * p);
}

/** Runs t from the player's current position to the end of the cycle, then loops it with the clip. */
function follow(t: SharedValue<number>, player: VideoPlayer) {
  const at = Math.min(Math.max(player.currentTime * 1000, 0), CYCLE) / CYCLE;
  const linear = { easing: Easing.linear };
  t.set(at);
  t.set(
    withSequence(
      withTiming(1, { ...linear, duration: (1 - at) * CYCLE }),
      withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { ...linear, duration: CYCLE })), -1, false),
    ),
  );
}

export function Included() {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const t = useSharedValue(reduced ? STILL : 0);
  const [shown, setShown] = useState(false);

  const player = useVideoPlayer(reduced ? null : DEMO, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';
  });

  // Play only while this step is on screen; the hook releases the player on unmount.
  useEffect(() => {
    if (reduced) {
      t.set(STILL);
      return;
    }
    if (focused) player.play();
    else player.pause();
  }, [reduced, focused, player, t]);

  // The player pauses itself in the background; pick the loop back up on return.
  useEffect(() => {
    if (reduced || !focused) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') player.play();
    });
    return () => sub.remove();
  }, [reduced, focused, player]);

  // The overlays follow the clip: they start where playback starts and freeze when it pauses.
  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (reduced) return;
    if (isPlaying) follow(t, player);
    else cancelAnimation(t);
  });

  useEffect(() => () => cancelAnimation(t), [t]);

  const wide = width - spacing.gutter * 2;
  const frameH = Math.min(440, Math.round(height * 0.46));
  const narrow = Math.round((frameH * 9) / 16);

  const frame = useAnimatedStyle(() => ({ width: interpolate(step(t.get(), 0.7, 0.84), [0, 1], [wide, narrow]) }));

  return (
    <View style={styles.wrap}>
      <AppText variant="display" accessibilityRole="header">
        What Tenfold does for you
      </AppText>

      <View style={styles.demo} accessible accessibilityRole="image" accessibilityLabel={A11Y}>
        <View style={[styles.stage, { height: frameH }]}>
          <Animated.View style={[styles.frame, frame]}>
            <Image source={POSTER} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
            {!reduced && (
              <VideoView
                player={player}
                style={[StyleSheet.absoluteFill, !shown && styles.hidden]}
                contentFit="cover"
                nativeControls={false}
                allowsPictureInPicture={false}
                allowsVideoFrameAnalysis={false}
                onFirstFrameRender={() => setShown(true)}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
              />
            )}
            <View style={styles.caption}>
              {WORDS.map((w, i) => (
                <Word key={i} word={w} index={i} t={t} />
              ))}
            </View>
          </Animated.View>
        </View>

        <View style={styles.wave}>
          {SEGMENTS.map((s, i) => (
            <Segment key={i} segment={s} t={t} />
          ))}
        </View>

        <View style={styles.beats}>
          {BEATS.map((b) => (
            <Beat key={b.label} label={b.label} from={b.from} to={b.to} t={t} still={reduced} />
          ))}
        </View>
      </View>
    </View>
  );
}

function Word({ word, index, t }: { word: string; index: number; t: SharedValue<number> }) {
  const filler = index === FILLER;
  // The spoken word lights up in turn during the captions beat (the filler is gone by then).
  const lit = index > FILLER ? index - 1 : index;
  const start = 0.46 + lit * WORD_STEP;
  const box = useAnimatedStyle(() => {
    if (!filler) return {};
    const gone = step(t.get(), 0.27, 0.38);
    return { maxWidth: interpolate(gone, [0, 1], [60, 0]), opacity: 1 - gone, marginHorizontal: interpolate(gone, [0, 1], [3, 0]) };
  });
  const text = useAnimatedStyle(() => {
    if (filler) return {};
    const v = t.get();
    return {
      color: interpolateColor(v, [start - 0.004, start, start + WORD_STEP, start + WORD_STEP + 0.004], [
        '#FFFFFF',
        colors.accent,
        colors.accent,
        '#FFFFFF',
      ]),
    };
  });
  return (
    <Animated.View style={[styles.wordBox, box]}>
      <Animated.Text numberOfLines={1} style={[styles.word, filler && styles.filler, text]}>
        {word}
      </Animated.Text>
    </Animated.View>
  );
}

function Segment({ segment, t }: { segment: (typeof SEGMENTS)[number]; t: SharedValue<number> }) {
  const full = segment.bars.length * (BAR + BAR_GAP);
  const style = useAnimatedStyle(() => {
    if (!segment.silent) return {};
    const gone = step(t.get(), 0.04, 0.17);
    return { width: interpolate(gone, [0, 1], [full, 0]), opacity: 1 - gone };
  });
  return (
    <Animated.View style={[styles.segment, segment.silent && { width: full }, style]}>
      {segment.bars.map((h, i) => (
        <View key={i} style={[styles.bar, { height: h, backgroundColor: segment.silent ? colors.textMuted : colors.textPrimary }]} />
      ))}
    </Animated.View>
  );
}

function Beat({ label, from, to, t, still }: { label: string; from: number; to: number; t: SharedValue<number>; still: boolean }) {
  const style = useAnimatedStyle(() => {
    if (still) return { opacity: 1 };
    const v = t.get();
    // The first beat lights up across the reset window, so the loop's wrap from 1 to 0 doesn't pop.
    if (from === 0 && v >= RESET[0]) return { opacity: interpolate(v, [RESET[0], 1], [0.35, 1], 'clamp') };
    return { opacity: interpolate(v, [from - 0.01, from, to, to + 0.01], [0.35, 1, 1, 0.35], 'clamp') };
  });
  return (
    <Animated.View style={style}>
      <AppText variant="chip">{label}</AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: spacing.gutter, gap: spacing.xl },
  demo: { flex: 1, justifyContent: 'center', gap: spacing.xl },
  stage: { alignItems: 'center', justifyContent: 'center' },
  frame: {
    height: '100%',
    borderRadius: radii.card,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  caption: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: '18%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  hidden: { opacity: 0 },
  wordBox: { overflow: 'hidden', marginHorizontal: 3 },
  word: {
    fontFamily: 'TikTokSans-ExtraBold',
    fontSize: 22,
    lineHeight: 28,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  filler: { color: 'rgba(255,255,255,0.6)', textDecorationLine: 'line-through' },
  wave: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  segment: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  bar: { width: BAR, marginRight: BAR_GAP, borderRadius: BAR / 2 },
  beats: { flexDirection: 'row', justifyContent: 'space-between' },
});
