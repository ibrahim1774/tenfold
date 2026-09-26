import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, IconButton } from '@/design/components';
import { colors, fonts } from '@/design/tokens';
import type { CaptionCard, CompSegment, Thumbnail } from '@/engine/types';

const PPS = 46; // points per second of composition time
const LEFT = 8;
const FRAME_W = 34;
const ENVELOPE_STEP = 0.02; // seconds per envelope frame (Swift Envelope.frameSec)

export type TimelineProps = {
  segments: CompSegment[];
  compDuration: number;
  cards: CaptionCard[]; // composition time
  envelopeDb: number[]; // source time
  thumbs: Thumbnail[]; // source time
  time: number; // composition time
  playing: boolean;
  muted: boolean;
  onSeek: (compTime: number) => void;
  onAddCut: () => void;
  onToggleMute: () => void;
};

function toSource(segs: CompSegment[], comp: number) {
  for (const s of segs) if (comp <= s.compEnd) return s.start + Math.max(0, comp - s.compStart);
  return segs.length ? segs[segs.length - 1].end : 0;
}

export function Timeline({ segments, compDuration, cards, envelopeDb, thumbs, time, playing, muted, onSeek, onAddCut, onToggleMute }: TimelineProps) {
  const scroll = useRef<ScrollView>(null);
  const total = compDuration;
  const width = Math.max(total * PPS + LEFT * 2, 200);
  const x = (t: number) => LEFT + t * PPS;
  const seekRef = useRef(onSeek);
  useEffect(() => {
    seekRef.current = onSeek;
  });

  useEffect(() => {
    if (playing) scroll.current?.scrollTo({ x: Math.max(0, x(time) - 60), animated: false });
  }, [time, playing]);

  return (
    <View style={styles.wrap}>
      <View style={styles.side}>
        <View style={styles.rulerSpacer} />
        <View style={styles.sideButtons}>
          <IconButton icon="scissors" label="Cut the word at the playhead" tone="ghost" size={40} iconScale={0.5} onPress={onAddCut} />
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
          onPress={(e) => seekRef.current(Math.max(0, Math.min(total, (e.nativeEvent.locationX - LEFT) / PPS)))}
          accessibilityLabel="Timeline. Tap to move the playhead.">
          <TimelineTracks segments={segments} total={total} cards={cards} envelopeDb={envelopeDb} thumbs={thumbs} muted={muted} />
          <View pointerEvents="none" style={[styles.playhead, { left: x(time) - 6 }]}>
            <SymbolView name="arrowtriangle.down.fill" size={12} tintColor="#FFFFFF" />
            <View style={styles.playLine} />
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

type TracksProps = {
  segments: CompSegment[];
  total: number;
  cards: CaptionCard[];
  envelopeDb: number[];
  thumbs: Thumbnail[];
  muted: boolean;
};

/** Everything that doesn't move with the playhead, memoised so playback only re-renders the playhead. */
const TimelineTracks = memo(function TimelineTracks({ segments, total, cards, envelopeDb, thumbs, muted }: TracksProps) {
  const x = (t: number) => LEFT + t * PPS;

  const ticks = useMemo(() => {
    const step = total > 40 ? 10 : total > 16 ? 5 : 2;
    const out: number[] = [];
    for (let t = 0; t <= total + 0.01; t += step) out.push(t);
    return { step, out };
  }, [total]);

  const bars = useMemo(() => {
    const out: { left: number; h: number }[] = [];
    for (let px = 0; px < total * PPS; px += 4) {
      const src = toSource(segments, px / PPS);
      const db = envelopeDb[Math.floor(src / ENVELOPE_STEP)] ?? -100;
      out.push({ left: LEFT + px, h: 2 + Math.max(0, Math.min(1, (db + 60) / 50)) * 34 });
    }
    return out;
  }, [segments, envelopeDb, total]);

  const frameFor = (sourceT: number) => {
    if (!thumbs.length) return undefined;
    let best = thumbs[0];
    for (const t of thumbs) if (Math.abs(t.time - sourceT) < Math.abs(best.time - sourceT)) best = t;
    return best.uri;
  };

  return (
    <>
      <View style={styles.ruler}>
        {ticks.out.map((t) => (
          <View key={t} style={[styles.tick, { left: x(t) }]}>
            <AppText style={styles.tickText}>{t === 0 ? '0s' : t >= 60 ? `${Math.floor(t / 60)}m${t % 60 ? `${t % 60}` : ''}` : `${t}s`}</AppText>
          </View>
        ))}
        {ticks.out.slice(0, -1).flatMap((t) =>
          [0.25, 0.5, 0.75].map((f) => <View key={`${t}-${f}`} style={[styles.dot, { left: x(t + ticks.step * f) + 10 }]} />),
        )}
      </View>

      {/* One block per kept segment; a handle marks every cut. */}
      <View style={styles.clipTrack}>
        {segments.map((s, i) => {
          const w = Math.max(4, (s.compEnd - s.compStart) * PPS - 2);
          const n = Math.max(1, Math.ceil(w / FRAME_W));
          return (
            <View key={i} style={[styles.clip, { left: x(s.compStart) + 1, width: w }]}>
              {Array.from({ length: n }).map((_, k) => {
                const uri = frameFor(s.start + ((k + 0.5) * FRAME_W) / PPS);
                return uri ? (
                  <Image key={k} source={{ uri }} style={[styles.frame, { left: k * FRAME_W }]} contentFit="cover" />
                ) : (
                  <View key={k} style={[styles.frame, styles.framePlaceholder, { left: k * FRAME_W }]} />
                );
              })}
            </View>
          );
        })}
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

      <View style={styles.captionTrack}>
        {cards.map((c, i) => (
          <View key={i} style={[styles.captionChip, { left: x(c.start), width: Math.max(28, (c.end - c.start) * PPS - 4) }]}>
            <SymbolView name="textformat" size={12} tintColor={colors.textPrimary} />
            <AppText style={styles.captionText} numberOfLines={1}>
              {c.words.map((w) => w.text).join(' ')}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.wave}>
        {bars.map((b, i) => (
          <View key={i} style={[styles.bar, { left: b.left, height: muted ? 2 : b.h }]} />
        ))}
      </View>
    </>
  );
});

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
  clip: { position: 'absolute', top: 6, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.cardHigh },
  frame: { position: 'absolute', top: 0, width: FRAME_W, height: 44, borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.35)' },
  framePlaceholder: { backgroundColor: '#2A2733' },
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
