import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { AppText } from '@/design/components';
import { colors } from '@/design/tokens';
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
};

export function toSource(segs: CompSegment[], comp: number) {
  for (const s of segs) if (comp <= s.compEnd) return s.start + Math.max(0, comp - s.compStart);
  return segs.length ? segs[segs.length - 1].end : 0;
}

/** Edit points → regions the user can tap to select. */
/** Ruler label: "0s", "15s", "1:05". */
function tickLabel(t: number) {
  if (t < 60) return `${t}s`;
  return `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
}

/** "1:05" for VoiceOver values and labels. */
function clock(t: number) {
  const s = Math.max(0, Math.round(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

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
        {/* VoiceOver: swipe up or down on the playhead to move it by a second. */}
        <View
          pointerEvents="none"
          style={[styles.playhead, { left: pad - 6 }]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Playhead"
          accessibilityValue={{ text: `${clock(time)} of ${clock(total)}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            const t = Math.max(0, Math.min(total, time + (e.nativeEvent.actionName === 'increment' ? 1 : -1)));
            onScrubStart();
            lastScrub.current = t;
            scroll.current?.scrollTo({ x: t * PPS, animated: false });
            onScrubEnd(t);
          }}>
          <SymbolView name="arrowtriangle.down.fill" size={12} tintColor={colors.accent} />
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
    // One bar every 4 pt, but never more than ~1,200 views (long clips get wider spacing).
    const stepPx = Math.max(4, (total * PPS) / 1200);
    for (let px = 0; px < total * PPS; px += stepPx) {
      const src = toSource(segments, px / PPS);
      const db = envelopeDb[Math.floor(src / ENVELOPE_STEP)] ?? -100;
      out.push({ left: px, h: 2 + Math.max(0, Math.min(1, (db + 60) / 50)) * 34 });
    }
    return out;
  }, [segments, envelopeDb, total]);

  // Filmstrip tiles widen on long clips so the strip stays at ~240 images.
  const fw = Math.max(FRAME_W, (total * PPS) / 240);

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
            <AppText variant="caption" color={colors.ruler} tabular>
              {tickLabel(t)}
            </AppText>
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
          const n = Math.max(1, Math.ceil(w / fw));
          const isSel = same(selected, r);
          return (
            <Pressable
              key={`${r.start.toFixed(3)}`}
              onPress={() => onSelect(isSel ? null : r)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              accessibilityLabel={`Clip from ${clock(r.start)} to ${clock(r.end)}`}
              accessibilityHint={isSel ? 'Deselects the clip.' : 'Selects the clip for delete.'}
              style={[styles.clip, { left: x(r.start) + 1, width: w }, isSel && styles.clipSelected]}>
              {Array.from({ length: n }).map((_, k) => {
                const uri = frameFor(toSource(segments, r.start + ((k + 0.5) * fw) / PPS));
                return uri ? (
                  <Image key={k} source={{ uri }} style={[styles.frame, { left: k * fw, width: fw }]} contentFit="cover" />
                ) : (
                  <View key={k} style={[styles.frame, styles.framePlaceholder, { left: k * fw, width: fw }]} />
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

      <View style={styles.captionTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {cards.map((c, i) => (
          <View key={i} style={[styles.captionChip, { left: x(c.start), width: Math.max(28, (c.end - c.start) * PPS - 4) }]}>
            <SymbolView name="textformat" size={12} tintColor={colors.textPrimary} />
            <AppText variant="caption" style={styles.captionText} numberOfLines={1}>
              {c.words.map((w) => w.text).join(' ')}
            </AppText>
          </View>
        ))}
      </View>

      <View style={[styles.wave, { marginLeft: pad, width: total * PPS }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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
  ruler: { height: 24 },
  tick: { position: 'absolute', top: 2 },
  dot: { position: 'absolute', top: 9, width: 2, height: 2, borderRadius: 1, backgroundColor: colors.ruler },
  clipTrack: { height: 56, justifyContent: 'center' },
  clip: { position: 'absolute', top: 6, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.cardHigh },
  clipSelected: { borderWidth: 2, borderColor: '#FFFFFF' },
  selectedTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.12)' },
  frame: { position: 'absolute', top: 0, width: FRAME_W, height: 44, borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.35)' },
  framePlaceholder: { backgroundColor: colors.cardHigh },
  handle: {
    position: 'absolute',
    top: 10,
    width: 11,
    height: 36,
    borderRadius: 5,
    backgroundColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleGrip: { width: 3, height: 16, borderRadius: 1.5, backgroundColor: '#3A3A3F' },
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
  captionText: { flexShrink: 1 },
  wave: { height: 48, marginTop: 4, justifyContent: 'center' },
  bar: { position: 'absolute', width: 2, borderRadius: 1, backgroundColor: colors.waveform },
  playhead: { position: 'absolute', top: 12, bottom: 0, width: 12, alignItems: 'center' },
  playLine: { flex: 1, width: 2, marginTop: -2, backgroundColor: colors.accent, borderRadius: 1 },
});
