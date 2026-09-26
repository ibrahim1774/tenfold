import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, IconButton, Thumb } from '@/design/components';
import { colors, fonts } from '@/design/tokens';
import type { Word } from '@/engine/types';

import { compDuration, toComp, type CompSegment } from './timeMap';

const PPS = 46; // points per second of composition time
const LEFT = 8;

export type TimelineProps = {
  segments: CompSegment[];
  cards: { text: string; start: number; end: number }[]; // source time
  words: Word[];
  time: number; // composition time
  playing: boolean;
  muted: boolean;
  seed: number;
  onSeek: (compTime: number) => void;
  onAddCut: () => void;
  onToggleMute: () => void;
};

export function Timeline({ segments, cards, words, time, playing, muted, seed, onSeek, onAddCut, onToggleMute }: TimelineProps) {
  const scroll = useRef<ScrollView>(null);
  const total = compDuration(segments);
  const width = Math.max(total * PPS + LEFT * 2, 200);
  const x = (t: number) => LEFT + t * PPS;

  useEffect(() => {
    if (playing) scroll.current?.scrollTo({ x: Math.max(0, x(time) - 60), animated: false });
  }, [time, playing]);

  const ticks = useMemo(() => {
    const step = total > 40 ? 10 : total > 16 ? 5 : 2;
    const out: number[] = [];
    for (let t = 0; t <= total + 0.01; t += step) out.push(t);
    return { step, out };
  }, [total]);

  const bars = useMemo(() => {
    const out: { left: number; h: number }[] = [];
    for (let px = 0; px < total * PPS; px += 4) {
      const compT = px / PPS;
      const seg = segments.find((s) => compT <= s.compEnd) ?? segments[segments.length - 1];
      const src = seg ? seg.start + (compT - seg.compStart) : 0;
      const speaking = words.some((w) => src >= w.start && src <= w.end);
      const noise = Math.abs(Math.sin(px * 12.9898 + seed) * 43758.5453) % 1;
      out.push({ left: LEFT + px, h: speaking ? 8 + noise * 26 : 2 + noise * 5 });
    }
    return out;
  }, [segments, words, total, seed]);

  const captionChips = useMemo(
    () =>
      cards
        .map((c) => ({ text: c.text, start: toComp(segments, c.start), end: toComp(segments, c.end) }))
        .filter((c) => c.end - c.start > 0.05),
    [cards, segments],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.side}>
        <View style={styles.rulerSpacer} />
        <View style={styles.sideButtons}>
          <IconButton icon="plus.square" label="Cut at playhead" tone="ghost" size={40} iconScale={0.55} onPress={onAddCut} />
          <IconButton
            icon={muted ? 'speaker.slash' : 'speaker.wave.2'}
            label={muted ? 'Unmute' : 'Mute'}
            tone="ghost"
            size={40}
            iconScale={0.5}
            onPress={onToggleMute}
          />
        </View>
      </View>

      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} style={styles.flex}>
        <Pressable
          style={{ width }}
          onPress={(e) => onSeek(Math.max(0, Math.min(total, (e.nativeEvent.locationX - LEFT) / PPS)))}
          accessibilityLabel="Timeline. Tap to move the playhead.">
          {/* Ruler */}
          <View style={styles.ruler}>
            {ticks.out.map((t) => (
              <View key={t} style={[styles.tick, { left: x(t) }]}>
                <AppText style={styles.tickText}>{t === 0 ? '0s' : t >= 60 ? `${Math.floor(t / 60)}m` : `${t}s`}</AppText>
              </View>
            ))}
            {ticks.out.slice(0, -1).flatMap((t) =>
              [0.25, 0.5, 0.75].map((f) => (
                <View key={`${t}-${f}`} style={[styles.dot, { left: x(t + ticks.step * f) + 10 }]} />
              )),
            )}
          </View>

          {/* Clip track: one block per keep segment, a handle at every cut */}
          <View style={styles.clipTrack}>
            {segments.map((s, i) => (
              <Thumb
                key={i}
                seed={seed}
                style={[styles.clip, { left: x(s.compStart) + 1, width: Math.max(4, (s.compEnd - s.compStart) * PPS - 2) }]}>
                {Array.from({ length: Math.floor(((s.compEnd - s.compStart) * PPS) / 34) }).map((_, k) => (
                  <View key={k} style={[styles.frameLine, { left: (k + 1) * 34 }]} />
                ))}
              </Thumb>
            ))}
            {segments.map((s, i) => (
              <View key={`h${i}`} style={[styles.handle, { left: x(s.compStart) - 5 }]}>
                <View style={styles.handleGrip} />
              </View>
            ))}
            {segments.length > 0 && (
              <View style={[styles.handle, { left: x(total) - 5 }]}>
                <View style={styles.handleGrip} />
              </View>
            )}
          </View>

          {/* Caption track */}
          <View style={styles.captionTrack}>
            {captionChips.map((c, i) => (
              <View key={i} style={[styles.captionChip, { left: x(c.start), width: Math.max(28, (c.end - c.start) * PPS - 4) }]}>
                <SymbolView name="textformat" size={12} tintColor={colors.textPrimary} />
                <AppText style={styles.captionText} numberOfLines={1}>
                  {c.text}
                </AppText>
              </View>
            ))}
          </View>

          {/* Waveform */}
          <View style={styles.wave}>
            {bars.map((b, i) => (
              <View key={i} style={[styles.bar, { left: b.left, height: muted ? 2 : b.h }]} />
            ))}
          </View>

          {/* Playhead */}
          <View pointerEvents="none" style={[styles.playhead, { left: x(time) - 6 }]}>
            <SymbolView name="arrowtriangle.down.fill" size={12} tintColor="#FFFFFF" />
            <View style={styles.playLine} />
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row' },
  flex: { flex: 1 },
  side: { width: 92, paddingLeft: 8 },
  rulerSpacer: { height: 24 },
  sideButtons: { flexDirection: 'row', alignItems: 'center', height: 56, gap: 4 },
  ruler: { height: 24 },
  tick: { position: 'absolute', top: 2 },
  tickText: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.ruler },
  dot: { position: 'absolute', top: 9, width: 2, height: 2, borderRadius: 1, backgroundColor: colors.ruler },
  clipTrack: { height: 56, justifyContent: 'center' },
  clip: { position: 'absolute', top: 6, height: 44, borderRadius: 10 },
  frameLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  handle: {
    position: 'absolute',
    top: 10,
    width: 11,
    height: 36,
    borderRadius: 5,
    backgroundColor: '#D9D7DE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleGrip: { width: 3, height: 16, borderRadius: 1.5, backgroundColor: '#3A3842' },
  captionTrack: { height: 34, marginTop: 4 },
  captionChip: {
    position: 'absolute',
    top: 4,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.cardHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  captionText: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.textPrimary, flexShrink: 1 },
  wave: { height: 48, marginTop: 4, borderRadius: 10, backgroundColor: 'rgba(28,27,35,0.6)', justifyContent: 'center' },
  bar: { position: 'absolute', width: 2, borderRadius: 1, backgroundColor: colors.waveform },
  playhead: { position: 'absolute', top: 12, bottom: 0, width: 12, alignItems: 'center' },
  playLine: { flex: 1, width: 2, marginTop: -2, backgroundColor: '#FFFFFF', borderRadius: 1 },
});
