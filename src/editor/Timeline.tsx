import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { AppText, IconButton } from '@/design/components';
import { colors, fonts } from '@/design/tokens';
import type { CaptionCard, CompSegment, Thumbnail } from '@/engine/types';

const PPS = 46; // points per second of composition time
const FRAME_W = 34;
const ENVELOPE_STEP = 0.02; // seconds per envelope frame (Swift Envelope.frameSec)

/** A stretch of the composition between two edit points (a cut or a user split), in composition seconds. */
export type Region = { start: number; end: number };

export type TimelineProps = {
  segments: CompSegment[];
  compDuration: number;
  cards: CaptionCard[]; // composition time
  envelopeDb: number[]; // source time
  thumbs: Thumbnail[]; // source time
  splits: number[]; // composition time, strictly inside kept segments
  selected: Region | null;
  time: number; // composition time
  muted: boolean;
  onScrubStart: () => void;
  onScrub: (compTime: number) => void;
  onScrubEnd: (compTime: number) => void;
  onSelect: (region: Region | null) => void;
  onSplit: () => void;
  onToggleMute: () => void;
};

export function toSource(segs: CompSegment[], comp: number) {
  for (const s of segs) if (comp <= s.compEnd) return s.start + Math.max(0, comp - s.compStart);
  return segs.length ? segs[segs.length - 1].end : 0;
}

/** Edit points → regions the user can tap to select. */
export function regionsOf(segments: CompSegment[], splits: number[], total: number): Region[] {
  const points = [...new Set([0, ...segments.map((s) => s.compStart), ...splits, total])].sort((a, b) => a - b);
  const out: Region[] = [];
  for (let i = 0; i + 1 < points.length; i++) if (points[i + 1] - points[i] > 0.01) out.push({ start: points[i], end: points[i + 1] });
  return out;
}

/**
 * CapCut-style timeline: the playhead stays in the middle and the strip scrolls under it.
 * Dragging the strip scrubs the video; tapping a clip selects it for Split / Delete.
 */
export function Timeline({
  segments,
  compDuration,
  cards,
  envelopeDb,
  thumbs,
  splits,
  selected,
  time,
  muted,
  onScrubStart,
  onScrub,
  onScrubEnd,
  onSelect,
  onSplit,
  onToggleMute,
}: TimelineProps) {
  const scroll = useRef<ScrollView>(null);
  const [viewW, setViewW] = useState(0);
  const pad = viewW / 2;
  const total = compDuration;
  // True while the finger (or its momentum) drives the strip; programmatic scrolls are ignored.
  const dragging = useRef(false);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrub = useRef(-1);

  const clampT = (x: number) => Math.max(0, Math.min(total, x / PPS));

  // Follow the playhead (playback, taps on words, undo) unless the user is the one moving it.
  useEffect(() => {
    if (dragging.current || !viewW) return;
    if (Math.abs(time - lastScrub.current) < 0.02) return;
    scroll.current?.scrollTo({ x: time * PPS, animated: false });
  }, [time, viewW]);

  const finish = (t: number) => {
    dragging.current = false;
    lastScrub.current = t;
    onScrubEnd(t);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!dragging.current) return;
    const t = clampT(e.nativeEvent.contentOffset.x);
    lastScrub.current = t;
    onScrub(t);
  };

  const regions = useMemo(() => regionsOf(segments, splits, total), [segments, splits, total]);

  return (
    <View style={styles.wrap}>
      <View style={styles.side}>
        <View style={styles.rulerSpacer} />
        <View style={styles.sideButtons}>
          <IconButton icon="scissors" label="Split at the playhead" tone="ghost" size={40} iconScale={0.5} onPress={onSplit} />
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

      <View style={styles.flex} onLayout={(e) => setViewW(e.nativeEvent.layout.width)}>
        {viewW > 0 && (
          <ScrollView
            ref={scroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            decelerationRate="fast"
            onScroll={onScroll}
            onScrollBeginDrag={() => {
              if (endTimer.current) clearTimeout(endTimer.current);
              dragging.current = true;
              onScrubStart();
            }}
            onScrollEndDrag={(e) => {
              const t = clampT(e.nativeEvent.contentOffset.x);
              // If no momentum follows, the scrub ends here.
              endTimer.current = setTimeout(() => finish(t), 80);
            }}
            onMomentumScrollBegin={() => {
              if (endTimer.current) clearTimeout(endTimer.current);
            }}
            onMomentumScrollEnd={(e) => {
              if (dragging.current) finish(clampT(e.nativeEvent.contentOffset.x));
            }}>
            <View style={{ width: total * PPS + viewW }}>
              <TimelineTracks
                pad={pad}
                segments={segments}
                regions={regions}
                selected={selected}
                total={total}
                cards={cards}
                envelopeDb={envelopeDb}
                thumbs={thumbs}
                muted={muted}
                onSelect={onSelect}
              />
            </View>
          </ScrollView>
        )}
        <View pointerEvents="none" style={[styles.playhead, { left: pad - 6 }]}>
          <SymbolView name="arrowtriangle.down.fill" size={12} tintColor="#FFFFFF" />
          <View style={styles.playLine} />
        </View>
      </View>
    </View>
  );
}

type TracksProps = {
  pad: number;
  segments: CompSegment[];
  regions: Region[];
  selected: Region | null;
  total: number;
  cards: CaptionCard[];
  envelopeDb: number[];
  thumbs: Thumbnail[];
  muted: boolean;
  onSelect: (region: Region | null) => void;
};

const same = (a: Region | null, b: Region) => !!a && Math.abs(a.start - b.start) < 1e-3 && Math.abs(a.end - b.end) < 1e-3;

/** Everything that doesn't move with the playhead, memoised so playback only scrolls. */
const TimelineTracks = memo(function TimelineTracks({
  pad,
  segments,
  regions,
  selected,
  total,
  cards,
  envelopeDb,
  thumbs,
  muted,
  onSelect,
}: TracksProps) {
  const x = (t: number) => pad + t * PPS;

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
      out.push({ left: px, h: 2 + Math.max(0, Math.min(1, (db + 60) / 50)) * 34 });
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

      {/* One block per region (between cuts and splits); tap to select. */}
      <View style={styles.clipTrack}>
        {regions.map((r) => {
          const w = Math.max(4, (r.end - r.start) * PPS - 2);
          const n = Math.max(1, Math.ceil(w / FRAME_W));
          const isSel = same(selected, r);
          return (
            <Pressable
              key={`${r.start.toFixed(3)}`}
              onPress={() => onSelect(isSel ? null : r)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              accessibilityLabel={`Clip from ${r.start.toFixed(1)} to ${r.end.toFixed(1)} seconds`}
              style={[styles.clip, { left: x(r.start) + 1, width: w }, isSel && styles.clipSelected]}>
              {Array.from({ length: n }).map((_, k) => {
                const uri = frameFor(toSource(segments, r.start + ((k + 0.5) * FRAME_W) / PPS));
                return uri ? (
                  <Image key={k} source={{ uri }} style={[styles.frame, { left: k * FRAME_W }]} contentFit="cover" />
                ) : (
                  <View key={k} style={[styles.frame, styles.framePlaceholder, { left: k * FRAME_W }]} />
                );
              })}
              {isSel && <View pointerEvents="none" style={styles.selectedTint} />}
            </Pressable>
          );
        })}
        {regions.map((r, i) => (
          <View key={`h${i}`} pointerEvents="none" style={[styles.handle, { left: x(r.start) - 5 }]}>
            <View style={styles.handleGrip} />
          </View>
        ))}
        {regions.length > 0 && (
          <View pointerEvents="none" style={[styles.handle, { left: x(total) - 5 }]}>
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

      <View style={[styles.wave, { marginLeft: pad, width: total * PPS }]}>
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
  clipSelected: { borderWidth: 2, borderColor: '#FFFFFF' },
  selectedTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.12)' },
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
