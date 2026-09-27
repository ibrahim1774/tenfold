import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/design/components';
import { colors } from '@/design/tokens';
import type { CaptionCard, CompSegment, Thumbnail } from '@/engine/types';

const PPS = 46; // points per second of composition time
const FRAME_W = 34;
const ENVELOPE_STEP = 0.02; // seconds per envelope frame (Swift Envelope.frameSec)
const MIN_CAPTION_SEC = 0.3; // CaptionGrouper.minRetimeSec
const MIN_CLIP_SEC = 0.2; // src/editor/trim.ts

/** A stretch of the composition between two edit points (a cut or a user split), in composition seconds. */
export type Region = { start: number; end: number };

/** One thing is selected at a time: a clip (region) or a caption group (by its stable id). */
export type TimelineSelection = { kind: 'region'; region: Region } | { kind: 'caption'; id: string } | null;

export type TimelineProps = {
  segments: CompSegment[];
  compDuration: number;
  cards: CaptionCard[]; // composition time
  hiddenCards: CaptionCard[]; // hidden caption groups (shown faded so they can be shown again)
  envelopeDb: number[]; // source time
  thumbs: Thumbnail[]; // source time
  splits: number[]; // composition time, strictly inside kept segments
  selection: TimelineSelection;
  /** How far (seconds) each end of the selected clip can be dragged outward, giving removed footage back. */
  restorable: { start: number; end: number };
  time: number; // composition time
  muted: boolean;
  onScrubStart: () => void;
  onScrub: (compTime: number) => void;
  onScrubEnd: (compTime: number) => void;
  onSelect: (selection: TimelineSelection) => void;
  /** An end of the selected clip was dragged by `delta` seconds (+ = right). True if the document changed. */
  onTrimRegion: (region: Region, side: 'start' | 'end', delta: number) => boolean;
  /** A caption's edges were moved (composition seconds). True if the document changed. */
  onRetimeCaption: (card: CaptionCard, edge: { start?: number; end?: number }) => boolean;
};

export function toSource(segs: CompSegment[], comp: number) {
  for (const s of segs) if (comp <= s.compEnd) return s.start + Math.max(0, comp - s.compStart);
  return segs.length ? segs[segs.length - 1].end : 0;
}

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

/** "1.4 s" for VoiceOver caption times. */
const secs = (t: number) => `${t.toFixed(1)} seconds`;

/** Edit points → regions the user can tap to select. */
export function regionsOf(segments: CompSegment[], splits: number[], total: number): Region[] {
  const points = [...new Set([0, ...segments.map((s) => s.compStart), ...splits, total])].sort((a, b) => a - b);
  const out: Region[] = [];
  for (let i = 0; i + 1 < points.length; i++) if (points[i + 1] - points[i] > 0.01) out.push({ start: points[i], end: points[i + 1] });
  return out;
}

/**
 * CapCut-style timeline: the playhead stays in the middle and the strip scrolls under it.
 * Dragging the strip scrubs the video; tapping a clip or a caption selects it, and the selected one's
 * ends can be dragged (trim a clip, retime a caption).
 */
export function Timeline({
  segments,
  compDuration,
  cards,
  hiddenCards,
  envelopeDb,
  thumbs,
  splits,
  selection,
  restorable,
  time,
  muted,
  onScrubStart,
  onScrub,
  onScrubEnd,
  onSelect,
  onTrimRegion,
  onRetimeCaption,
}: TimelineProps) {
  const scroll = useRef<ScrollView>(null);
  const [viewW, setViewW] = useState(0);
  const pad = viewW / 2;
  const total = compDuration;
  // True while the finger (or its momentum) drives the strip; programmatic scrolls are ignored.
  const dragging = useRef(false);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrub = useRef(-1);
  // The strip's own pan, so edge handles can hold it still while they are dragged.
  const [scrollGesture] = useState(() => Gesture.Native());

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
          <GestureDetector gesture={scrollGesture}>
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
                  selection={selection}
                  restorable={restorable}
                  total={total}
                  cards={cards}
                  hiddenCards={hiddenCards}
                  envelopeDb={envelopeDb}
                  thumbs={thumbs}
                  muted={muted}
                  scrollGesture={scrollGesture}
                  onSelect={onSelect}
                  onTrimRegion={onTrimRegion}
                  onRetimeCaption={onRetimeCaption}
                />
              </View>
            </ScrollView>
          </GestureDetector>
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
  selection: TimelineSelection;
  restorable: { start: number; end: number };
  total: number;
  cards: CaptionCard[];
  hiddenCards: CaptionCard[];
  envelopeDb: number[];
  thumbs: Thumbnail[];
  muted: boolean;
  scrollGesture: GestureType;
  onSelect: (selection: TimelineSelection) => void;
  onTrimRegion: TimelineProps['onTrimRegion'];
  onRetimeCaption: TimelineProps['onRetimeCaption'];
};

const same = (a: Region | null, b: Region) => !!a && Math.abs(a.start - b.start) < 1e-3 && Math.abs(a.end - b.end) < 1e-3;

/** Everything that doesn't move with the playhead, memoised so playback only scrolls. */
const TimelineTracks = memo(function TimelineTracks({
  pad,
  segments,
  regions,
  selection,
  restorable,
  total,
  cards,
  hiddenCards,
  envelopeDb,
  thumbs,
  muted,
  scrollGesture,
  onSelect,
  onTrimRegion,
  onRetimeCaption,
}: TracksProps) {
  const x = (t: number) => pad + t * PPS;
  const selectedRegion = selection?.kind === 'region' ? selection.region : null;
  const selectedCaption = selection?.kind === 'caption' ? selection.id : null;

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

  // Every caption group in time order (hidden ones included): neighbours for retiming.
  const allCards = useMemo(() => [...cards, ...hiddenCards].sort((a, b) => a.start - b.start), [cards, hiddenCards]);
  const hiddenIds = useMemo(() => new Set(hiddenCards.map((c) => c.id)), [hiddenCards]);

  // Filmstrip tiles widen on long clips so the strip stays at ~240 images.
  const fw = Math.max(FRAME_W, (total * PPS) / 240);

  const frameFor = (sourceT: number) => {
    if (!thumbs.length) return undefined;
    let best = thumbs[0];
    for (const t of thumbs) if (Math.abs(t.time - sourceT) < Math.abs(best.time - sourceT)) best = t;
    return best.uri;
  };

  const selRegion = regions.find((r) => same(selectedRegion, r)) ?? null;
  const selCardIndex = selectedCaption ? allCards.findIndex((c) => c.id === selectedCaption) : -1;
  const selCard = selCardIndex >= 0 ? allCards[selCardIndex] : null;

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
          const isSel = same(selectedRegion, r);
          return (
            <Pressable
              key={`${r.start.toFixed(3)}`}
              onPress={() => onSelect(isSel ? null : { kind: 'region', region: r })}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              accessibilityLabel={`Clip from ${clock(r.start)} to ${clock(r.end)}`}
              accessibilityHint={isSel ? 'Deselects the clip. Actions trim its ends.' : 'Selects the clip to split, delete or trim.'}
              accessibilityActions={
                isSel
                  ? [
                      { name: 'trimStart', label: 'Trim half a second from the start' },
                      { name: 'trimEnd', label: 'Trim half a second from the end' },
                    ]
                  : undefined
              }
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'trimStart') onTrimRegion(r, 'start', 0.5);
                else if (e.nativeEvent.actionName === 'trimEnd') onTrimRegion(r, 'end', -0.5);
              }}
              style={[styles.clip, { left: x(r.start) + 1, width: w }]}>
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
        {selRegion && (
          <EdgeFrame
            key={`sel-${selRegion.start.toFixed(3)}-${selRegion.end.toFixed(3)}`}
            left={x(selRegion.start) + 1}
            width={Math.max(4, (selRegion.end - selRegion.start) * PPS - 2)}
            top={6}
            height={44}
            radius={10}
            color="#FFFFFF"
            // Inward up to the shortest clip; outward only as far as there is removed footage.
            startRange={[-restorable.start * PPS, Math.max(0, (selRegion.end - selRegion.start - MIN_CLIP_SEC) * PPS)]}
            endRange={[-Math.max(0, (selRegion.end - selRegion.start - MIN_CLIP_SEC) * PPS), restorable.end * PPS]}
            scrollGesture={scrollGesture}
            onCommit={(side, dx) => onTrimRegion(selRegion, side, dx / PPS)}
          />
        )}
      </View>

      <View style={styles.captionTrack}>
        {allCards.map((c) => {
          const isSel = c.id === selectedCaption;
          const hidden = hiddenIds.has(c.id);
          const text = c.words.map((w) => w.text).join(' ');
          return (
            <Pressable
              key={c.id}
              onPress={() => onSelect(isSel ? null : { kind: 'caption', id: c.id })}
              accessibilityRole={isSel ? 'adjustable' : 'button'}
              accessibilityLabel={`Caption${hidden ? ', hidden' : ''}: ${text}`}
              accessibilityValue={{ text: `${secs(c.start)} to ${secs(c.end)}` }}
              accessibilityState={{ selected: isSel }}
              accessibilityHint={isSel ? 'Swipe up or down to lengthen or shorten it.' : 'Selects the caption to edit it.'}
              accessibilityActions={
                isSel
                  ? [
                      { name: 'increment' },
                      { name: 'decrement' },
                      { name: 'startEarlier', label: 'Start earlier' },
                      { name: 'startLater', label: 'Start later' },
                    ]
                  : undefined
              }
              onAccessibilityAction={(e) => {
                const i = allCards.indexOf(c);
                const prevEnd = i > 0 ? allCards[i - 1].end : 0;
                const nextStart = i + 1 < allCards.length ? allCards[i + 1].start : total;
                const a = e.nativeEvent.actionName;
                if (a === 'increment') onRetimeCaption(c, { end: Math.min(nextStart, c.end + 0.1) });
                else if (a === 'decrement') onRetimeCaption(c, { end: Math.max(c.start + MIN_CAPTION_SEC, c.end - 0.1) });
                else if (a === 'startEarlier') onRetimeCaption(c, { start: Math.max(prevEnd, c.start - 0.1) });
                else if (a === 'startLater') onRetimeCaption(c, { start: Math.min(c.end - MIN_CAPTION_SEC, c.start + 0.1) });
              }}
              style={[
                styles.captionChip,
                { left: x(c.start), width: Math.max(28, (c.end - c.start) * PPS - 4) },
                hidden && styles.captionHidden,
                isSel && styles.captionSelected,
              ]}>
              <SymbolView name={hidden ? 'eye.slash' : 'textformat'} size={12} tintColor={hidden ? colors.textMuted : colors.textPrimary} />
              <AppText variant="caption" color={hidden ? colors.textMuted : colors.textPrimary} style={styles.captionText} numberOfLines={1}>
                {text}
              </AppText>
            </Pressable>
          );
        })}
        {selCard && (
          <EdgeFrame
            key={`cap-${selCard.id}-${selCard.start.toFixed(3)}-${selCard.end.toFixed(3)}`}
            left={x(selCard.start)}
            width={Math.max(28, (selCard.end - selCard.start) * PPS - 4)}
            top={4}
            height={26}
            radius={8}
            color={colors.accent}
            // Can't cross the neighbours, can't get shorter than MIN_CAPTION_SEC.
            startRange={[
              ((selCardIndex > 0 ? allCards[selCardIndex - 1].end : 0) - selCard.start) * PPS,
              Math.max(0, selCard.end - selCard.start - MIN_CAPTION_SEC) * PPS,
            ]}
            endRange={[
              -Math.max(0, selCard.end - selCard.start - MIN_CAPTION_SEC) * PPS,
              Math.max(0, (selCardIndex + 1 < allCards.length ? allCards[selCardIndex + 1].start : total) - selCard.end) * PPS,
            ]}
            scrollGesture={scrollGesture}
            onCommit={(side, dx) =>
              onRetimeCaption(selCard, side === 'start' ? { start: selCard.start + dx / PPS } : { end: selCard.end + dx / PPS })
            }
          />
        )}
      </View>

      <View style={[styles.wave, { marginLeft: pad, width: total * PPS }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {bars.map((b, i) => (
          <View key={i} style={[styles.bar, { left: b.left, height: muted ? 2 : b.h }]} />
        ))}
      </View>
    </>
  );
});

type EdgeFrameProps = {
  left: number;
  width: number;
  top: number;
  height: number;
  radius: number;
  color: string;
  /** Allowed drag of each edge in points: [most left, most right]. */
  startRange: [number, number];
  endRange: [number, number];
  scrollGesture: GestureType;
  /** Returns true if the document changed; otherwise the frame springs back. */
  onCommit: (side: 'start' | 'end', dx: number) => boolean;
};

/**
 * The selection outline with a drag handle on each end. While a handle moves, only this outline moves
 * (on the UI thread); on release the edit is committed once. Keyed by the selection's times, so a new
 * render of the document starts it fresh.
 */
function EdgeFrame({ left, width, top, height, radius, color, startRange, endRange, scrollGesture, onCommit }: EdgeFrameProps) {
  const dl = useSharedValue(0);
  const dr = useSharedValue(0);
  const [sMin, sMax] = startRange;
  const [eMin, eMax] = endRange;

  const commit = (side: 'start' | 'end', dx: number) => {
    const changed = Math.abs(dx) >= 1 && onCommit(side, dx);
    if (!changed) {
      dl.set(0);
      dr.set(0);
    }
  };

  const startPan = Gesture.Pan()
    .activeOffsetX([-3, 3])
    .hitSlop({ horizontal: 16, vertical: 8 })
    .blocksExternalGesture(scrollGesture)
    .onUpdate((e) => {
      dl.set(Math.min(sMax, Math.max(sMin, e.translationX)));
    })
    .onEnd(() => {
      scheduleOnRN(commit, 'start', dl.get());
    });

  const endPan = Gesture.Pan()
    .activeOffsetX([-3, 3])
    .hitSlop({ horizontal: 16, vertical: 8 })
    .blocksExternalGesture(scrollGesture)
    .onUpdate((e) => {
      dr.set(Math.min(eMax, Math.max(eMin, e.translationX)));
    })
    .onEnd(() => {
      scheduleOnRN(commit, 'end', dr.get());
    });

  const frame = useAnimatedStyle(() => ({ left: left + dl.get(), width: Math.max(8, width - dl.get() + dr.get()) }));

  return (
    <Animated.View pointerEvents="box-none" style={[styles.edgeFrame, { top, height, borderRadius: radius, borderColor: color }, frame]}>
      <GestureDetector gesture={startPan}>
        <View style={[styles.edge, styles.edgeStart, { backgroundColor: color }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.edgeGrip} />
        </View>
      </GestureDetector>
      <GestureDetector gesture={endPan}>
        <View style={[styles.edge, styles.edgeEnd, { backgroundColor: color }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.edgeGrip} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row' },
  flex: { flex: 1 },
  ruler: { height: 24 },
  tick: { position: 'absolute', top: 2 },
  dot: { position: 'absolute', top: 9, width: 2, height: 2, borderRadius: 1, backgroundColor: colors.ruler },
  clipTrack: { height: 56, justifyContent: 'center' },
  clip: { position: 'absolute', top: 6, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.cardHigh },
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
  captionHidden: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: colors.borderStrong },
  captionSelected: { backgroundColor: colors.accentSoft },
  captionText: { flexShrink: 1 },
  edgeFrame: { position: 'absolute', borderWidth: 2 },
  edge: { position: 'absolute', top: -2, bottom: -2, width: 12, alignItems: 'center', justifyContent: 'center' },
  edgeStart: { left: -8, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  edgeEnd: { right: -8, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  edgeGrip: { width: 2, height: '45%', borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  wave: { height: 48, marginTop: 4, justifyContent: 'center' },
  bar: { position: 'absolute', width: 2, borderRadius: 1, backgroundColor: colors.waveform },
  playhead: { position: 'absolute', top: 12, bottom: 0, width: 12, alignItems: 'center' },
  playLine: { flex: 1, width: 2, marginTop: -2, backgroundColor: colors.accent, borderRadius: 1 },
});
