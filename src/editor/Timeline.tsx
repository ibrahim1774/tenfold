import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/design/components';
import { colors } from '@/design/tokens';
import type { AudioClip, CaptionCard, CompSegment, TextOverlay, Thumbnail } from '@/engine/types';
import { fileRows, originalsOf, trimLimits } from './audioClips';
import { MIN_CLIP_SEC as MIN_SOURCE_CLIP_SEC, type TimelineClip } from './clips';
import { overlayWindow } from './textLayout';
import { MIN_OVERLAY_SEC } from './textOverlays';

const PPS = 46; // points per second of composition time
const FRAME_W = 34;
const ENVELOPE_STEP = 0.02; // seconds per envelope frame (Swift Envelope.frameSec)
const MIN_CAPTION_SEC = 0.3; // CaptionGrouper.minRetimeSec
const MIN_CLIP_SEC = 0.2; // src/editor/trim.ts
const TEXT_ROW = 30; // height of one row of text bars
const SOUND_ROW = 34; // height of one row of added sounds

/** A stretch of the composition between two edit points (a cut or a user split), in composition seconds. */
export type Region = { start: number; end: number };

/**
 * One thing is selected at a time: a part of the video between edit points (region), a whole clip of a
 * video made of several clips, a caption group (by its stable id), a text overlay or a sound.
 */
export type TimelineSelection =
  | { kind: 'region'; region: Region }
  | { kind: 'clip'; id: string }
  | { kind: 'caption'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'audio'; id: string }
  | null;

export type TimelineProps = {
  segments: CompSegment[];
  compDuration: number;
  cards: CaptionCard[]; // composition time
  hiddenCards: CaptionCard[]; // hidden caption groups (shown faded so they can be shown again)
  /** Text overlays, timed in output (composition) seconds like everything else on the strip. */
  texts: TextOverlay[];
  envelopeDb: number[]; // source time
  thumbs: Thumbnail[]; // source time
  splits: number[]; // composition time, strictly inside kept segments
  selection: TimelineSelection;
  /** How far (seconds) each end of the selected clip can be dragged outward, giving removed footage back. */
  restorable: { start: number; end: number };
  time: number; // composition time
  muted: boolean;
  /**
   * The sound as clips (output time; src/editor/audioClips.ts). Null in builds whose engine can't edit
   * audio: the original waveform is drawn as one strip that can't be selected.
   */
  audioClips: AudioClip[] | null;
  /** Waveform bars (0..1) of each added sound file, by file name. */
  audioWaves: Record<string, number[]>;
  onScrubStart: () => void;
  onScrub: (compTime: number) => void;
  onScrubEnd: (compTime: number) => void;
  onSelect: (selection: TimelineSelection) => void;
  /** An end of the selected clip was dragged by `delta` seconds (+ = right). True if the document changed. */
  onTrimRegion: (region: Region, side: 'start' | 'end', delta: number) => boolean;
  /** A caption's edges were moved (composition seconds). True if the document changed. */
  onRetimeCaption: (card: CaptionCard, edge: { start?: number; end?: number }) => boolean;
  /** A text overlay's edges were moved (output seconds). True if the document changed. */
  onRetimeText: (id: string, edge: { start?: number; end?: number }) => boolean;
  /** A sound's edges were moved (output seconds). True if the document changed. */
  onRetimeAudio: (id: string, edge: { start?: number; end?: number }) => boolean;
  /** An added sound was dragged to start at `start` (output seconds). True if the document changed. */
  onMoveAudio: (id: string, start: number) => boolean;
  /**
   * The video's clips (composition seconds) when it is made of more than one; null otherwise. Each clip is a
   * block with its title: tap selects it (a second tap selects the part under the finger), hold and drag
   * moves it, and a selected clip's ends trim it.
   */
  clips: TimelineClip[] | null;
  /** How far (seconds) each end of the selected clip can be dragged outward: what is trimmed off it. */
  clipRestorable: { start: number; end: number };
  /** A clip block was tapped at `compTime` (null: select the clip, from VoiceOver). */
  onTapClip: (id: string, compTime: number | null) => void;
  /** A clip was dropped just before clip `beforeId` (null: after the last one). True if the document changed. */
  onReorderClip: (id: string, beforeId: string | null) => boolean;
  /** An end of the selected clip was dragged by `delta` seconds (+ = right). True if the document changed. */
  onTrimClip: (id: string, side: 'start' | 'end', delta: number) => boolean;
  /** Shows the "+" tile after the last frame (adds clips at the end). */
  onAddClip?: () => void;
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
  texts,
  envelopeDb,
  thumbs,
  splits,
  selection,
  restorable,
  time,
  muted,
  audioClips,
  audioWaves,
  onScrubStart,
  onScrub,
  onScrubEnd,
  onSelect,
  onTrimRegion,
  onRetimeCaption,
  onRetimeText,
  onRetimeAudio,
  onMoveAudio,
  clips,
  clipRestorable,
  onTapClip,
  onReorderClip,
  onTrimClip,
  onAddClip,
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
                  texts={texts}
                  envelopeDb={envelopeDb}
                  thumbs={thumbs}
                  muted={muted}
                  audioClips={audioClips}
                  audioWaves={audioWaves}
                  scrollGesture={scrollGesture}
                  onSelect={onSelect}
                  onTrimRegion={onTrimRegion}
                  onRetimeCaption={onRetimeCaption}
                  onRetimeText={onRetimeText}
                  onRetimeAudio={onRetimeAudio}
                  onMoveAudio={onMoveAudio}
                  clips={clips}
                  clipRestorable={clipRestorable}
                  onTapClip={onTapClip}
                  onReorderClip={onReorderClip}
                  onTrimClip={onTrimClip}
                  onAddClip={onAddClip}
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
  texts: TextOverlay[];
  envelopeDb: number[];
  thumbs: Thumbnail[];
  muted: boolean;
  audioClips: AudioClip[] | null;
  audioWaves: Record<string, number[]>;
  scrollGesture: GestureType;
  onSelect: (selection: TimelineSelection) => void;
  onTrimRegion: TimelineProps['onTrimRegion'];
  onRetimeCaption: TimelineProps['onRetimeCaption'];
  onRetimeText: TimelineProps['onRetimeText'];
  onRetimeAudio: TimelineProps['onRetimeAudio'];
  onMoveAudio: TimelineProps['onMoveAudio'];
  clips: TimelineClip[] | null;
  clipRestorable: { start: number; end: number };
  onTapClip: TimelineProps['onTapClip'];
  onReorderClip: TimelineProps['onReorderClip'];
  onTrimClip: TimelineProps['onTrimClip'];
  onAddClip?: () => void;
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
  texts,
  envelopeDb,
  thumbs,
  muted,
  audioClips,
  audioWaves,
  scrollGesture,
  onSelect,
  onTrimRegion,
  onRetimeCaption,
  onRetimeText,
  onRetimeAudio,
  onMoveAudio,
  clips,
  clipRestorable,
  onTapClip,
  onReorderClip,
  onTrimClip,
  onAddClip,
}: TracksProps) {
  const x = (t: number) => pad + t * PPS;
  const selectedRegion = selection?.kind === 'region' ? selection.region : null;
  const selectedClip = selection?.kind === 'clip' ? selection.id : null;
  // Several clips: blocks take the taps (clip first, then the part under the finger); one clip: the parts do.
  const multi = !!clips && clips.length > 1;
  const selClip = multi ? (clips.find((c) => c.id === selectedClip) ?? null) : null;
  const selectedCaption = selection?.kind === 'caption' ? selection.id : null;
  const selectedText = selection?.kind === 'text' ? selection.id : null;
  const selectedAudio = selection?.kind === 'audio' ? selection.id : null;

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

  // Text bars in rows, so overlays that overlap in time don't cover each other.
  const textRows = useMemo(() => {
    const rowEnds: number[] = [];
    const out: { o: TextOverlay; start: number; end: number; row: number }[] = [];
    const items = texts.map((o) => ({ o, ...overlayWindow(o, total) })).sort((a, b) => a.start - b.start);
    for (const it of items) {
      let row = rowEnds.findIndex((e) => e <= it.start + 1e-6);
      if (row < 0) {
        row = rowEnds.length;
        rowEnds.push(0);
      }
      rowEnds[row] = it.end;
      out.push({ ...it, row });
    }
    return { items: out, count: rowEnds.length };
  }, [texts, total]);
  const selText = textRows.items.find((t) => t.o.id === selectedText) ?? null;

  // Sound: the original in one lane (deleted stretches are empty), added sounds in rows below it.
  const originals = useMemo(() => (audioClips ? originalsOf(audioClips) : null), [audioClips]);
  const sounds = useMemo(() => fileRows(audioClips ?? []), [audioClips]);
  const selAudio = selectedAudio ? (audioClips?.find((c) => c.id === selectedAudio) ?? null) : null;
  const selAudioRow = selAudio?.source === 'file' ? (sounds.rows.find((r) => r.clip.id === selAudio.id)?.row ?? 0) : 0;
  const selAudioLimits = selAudio && audioClips ? trimLimits(audioClips, selAudio, total) : null;
  const barsIn = (a: number, b: number) => bars.filter((bar) => bar.left >= a * PPS - 1 && bar.left < b * PPS);

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

      {/* One block per region (between cuts, splits and clips); tap to select. */}
      <View style={styles.clipTrack}>
        {regions.map((r) => {
          const w = Math.max(4, (r.end - r.start) * PPS - 2);
          const n = Math.max(1, Math.ceil(w / fw));
          const isSel = same(selectedRegion, r);
          const frames = Array.from({ length: n }).map((_, k) => {
            const uri = frameFor(toSource(segments, r.start + ((k + 0.5) * fw) / PPS));
            return uri ? (
              <Image key={k} source={{ uri }} style={[styles.frame, { left: k * fw, width: fw }]} contentFit="cover" />
            ) : (
              <View key={k} style={[styles.frame, styles.framePlaceholder, { left: k * fw, width: fw }]} />
            );
          });
          if (multi) {
            // The clip blocks above take the touches; VoiceOver reaches parts through the selected clip.
            return (
              <View key={`${r.start.toFixed(3)}`} pointerEvents="none" style={[styles.clip, { left: x(r.start) + 1, width: w }]}>
                {frames}
                {isSel && <View style={styles.selectedTint} />}
              </View>
            );
          }
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
              {frames}
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
        {multi &&
          clips.map((c, i) => (
            <ClipBlock
              key={c.id}
              clip={c}
              index={i}
              clips={clips}
              pad={pad}
              selected={c.id === selectedClip}
              scrollGesture={scrollGesture}
              onTap={onTapClip}
              onReorder={onReorderClip}
            />
          ))}
        {multi &&
          clips.slice(1).map((c) => <View key={`d-${c.id}`} pointerEvents="none" style={[styles.clipDivider, { left: x(c.start) - 1 }]} />)}
        {multi &&
          clips.map((c) =>
            (c.end - c.start) * PPS > 48 ? (
              <View key={`t-${c.id}`} pointerEvents="none" style={[styles.clipTitle, { left: x(c.start) + 6, maxWidth: (c.end - c.start) * PPS - 14 }]}>
                <AppText variant="caption" numberOfLines={1}>
                  {c.title}
                </AppText>
              </View>
            ) : null,
          )}
        {selClip && (
          <EdgeFrame
            key={`clip-${selClip.id}-${selClip.start.toFixed(3)}-${selClip.end.toFixed(3)}`}
            left={x(selClip.start) + 1}
            width={Math.max(4, (selClip.end - selClip.start) * PPS - 2)}
            top={6}
            height={44}
            radius={10}
            color={colors.accent}
            // Inward up to the shortest clip; outward only as far as it was trimmed.
            startRange={[-clipRestorable.start * PPS, Math.max(0, (selClip.end - selClip.start - MIN_SOURCE_CLIP_SEC) * PPS)]}
            endRange={[-Math.max(0, (selClip.end - selClip.start - MIN_SOURCE_CLIP_SEC) * PPS), clipRestorable.end * PPS]}
            scrollGesture={scrollGesture}
            onCommit={(side, dx) => onTrimClip(selClip.id, side, dx / PPS)}
          />
        )}
        {onAddClip && (
          <Pressable
            onPress={onAddClip}
            accessibilityRole="button"
            accessibilityLabel="Add clip"
            accessibilityHint="Adds a clip from Photos, the camera or Files to the end of the video."
            style={({ pressed }) => [styles.addClip, { left: x(total) + 12 }, pressed && styles.addClipPressed]}>
            <SymbolView name="plus" size={20} weight="regular" tintColor={colors.textPrimary} />
          </Pressable>
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

      {textRows.count > 0 && (
        <View style={[styles.textTrack, { height: textRows.count * TEXT_ROW + 4 }]}>
          {textRows.items.map(({ o, start, end, row }) => {
            const isSel = o.id === selectedText;
            return (
              <Pressable
                key={o.id}
                onPress={() => onSelect(isSel ? null : { kind: 'text', id: o.id })}
                accessibilityRole={isSel ? 'adjustable' : 'button'}
                accessibilityLabel={`Text: ${o.text}`}
                accessibilityValue={{ text: `${secs(start)} to ${secs(end)}` }}
                accessibilityState={{ selected: isSel }}
                accessibilityHint={isSel ? 'Swipe up or down to lengthen or shorten it.' : 'Selects the text to edit it.'}
                accessibilityActions={isSel ? [{ name: 'increment' }, { name: 'decrement' }] : undefined}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === 'increment') onRetimeText(o.id, { end: Math.min(total, end + 0.5) });
                  else if (e.nativeEvent.actionName === 'decrement') onRetimeText(o.id, { end: Math.max(start + MIN_OVERLAY_SEC, end - 0.5) });
                }}
                style={[
                  styles.captionChip,
                  { top: 4 + row * TEXT_ROW, left: x(start), width: Math.max(28, (end - start) * PPS - 4) },
                  isSel && styles.captionSelected,
                ]}>
                <SymbolView name="textformat" size={12} tintColor={colors.textPrimary} />
                <AppText variant="caption" style={styles.captionText} numberOfLines={1}>
                  {o.text.replace(/\n/g, ' ')}
                </AppText>
              </Pressable>
            );
          })}
          {selText && (
            <EdgeFrame
              key={`text-${selText.o.id}-${selText.start.toFixed(3)}-${selText.end.toFixed(3)}`}
              left={x(selText.start)}
              width={Math.max(28, (selText.end - selText.start) * PPS - 4)}
              top={4 + selText.row * TEXT_ROW}
              height={26}
              radius={8}
              color={colors.accent}
              // Anywhere inside the video, never shorter than MIN_OVERLAY_SEC.
              startRange={[-selText.start * PPS, Math.max(0, selText.end - selText.start - MIN_OVERLAY_SEC) * PPS]}
              endRange={[-Math.max(0, selText.end - selText.start - MIN_OVERLAY_SEC) * PPS, Math.max(0, total - selText.end) * PPS]}
              scrollGesture={scrollGesture}
              onCommit={(side, dx) =>
                onRetimeText(selText.o.id, side === 'start' ? { start: selText.start + dx / PPS } : { end: selText.end + dx / PPS })
              }
            />
          )}
        </View>
      )}

      {originals === null ? (
        <View style={[styles.wave, { marginLeft: pad, width: total * PPS }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {bars.map((b, i) => (
            <View key={i} style={[styles.bar, { left: b.left, height: muted ? 2 : b.h }]} />
          ))}
        </View>
      ) : (
        <View style={styles.soundLane}>
          <View pointerEvents="none" style={[styles.laneLine, { left: pad, width: total * PPS }]} />
          {originals.map((c) => {
            const isSel = c.id === selectedAudio;
            const w = Math.max(4, (c.end - c.start) * PPS - 2);
            return (
              <Pressable
                key={c.id}
                onPress={() => onSelect(isSel ? null : { kind: 'audio', id: c.id })}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`Original sound${muted ? ', muted' : ''}, ${clock(c.start)} to ${clock(c.end)}`}
                accessibilityHint={isSel ? 'Deselects it.' : 'Selects it to split, delete, set volume or fade.'}
                style={[styles.soundClip, styles.originalClip, { left: x(c.start) + 1, width: w }, isSel && styles.soundSelected]}>
                {barsIn(c.start, c.end).map((b, i) => (
                  <View key={i} style={[styles.bar, { left: b.left - c.start * PPS, height: muted || c.volume === 0 ? 2 : Math.max(2, b.h * Math.min(1, 0.35 + c.volume * 0.65)) }]} />
                ))}
                {w > 70 && (
                  <View pointerEvents="none" style={styles.soundLabel}>
                    <SymbolView name={muted ? 'speaker.slash' : 'speaker.wave.2'} size={11} tintColor={colors.textSecondary} />
                    <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                      Original
                    </AppText>
                  </View>
                )}
              </Pressable>
            );
          })}
          {selAudio?.source === 'original' && selAudioLimits && (
            <EdgeFrame
              key={`aud-${selAudio.id}-${selAudio.start.toFixed(3)}-${selAudio.end.toFixed(3)}`}
              left={x(selAudio.start) + 1}
              width={Math.max(4, (selAudio.end - selAudio.start) * PPS - 2)}
              top={4}
              height={40}
              radius={8}
              color={colors.accent}
              startRange={[selAudioLimits.start[0] * PPS, selAudioLimits.start[1] * PPS]}
              endRange={[selAudioLimits.end[0] * PPS, selAudioLimits.end[1] * PPS]}
              scrollGesture={scrollGesture}
              onCommit={(side, dx) =>
                onRetimeAudio(selAudio.id, side === 'start' ? { start: selAudio.start + dx / PPS } : { end: selAudio.end + dx / PPS })
              }
            />
          )}
        </View>
      )}

      {sounds.count > 0 && (
        <View style={[styles.soundRows, { height: sounds.count * SOUND_ROW + 4 }]}>
          {sounds.rows.map(({ clip: c, row }) => {
            const isSel = c.id === selectedAudio;
            const w = Math.max(28, (c.end - c.start) * PPS - 4);
            const levels = c.file ? audioWaves[c.file] : undefined;
            const fileDur = c.fileDuration ?? 0;
            const marks: { left: number; h: number }[] = [];
            if (levels?.length && fileDur > 0) {
              for (let px = 0; px < w; px += 4) {
                let t = c.offset + px / PPS;
                if (c.loop) t %= fileDur;
                const v = t <= fileDur ? (levels[Math.min(levels.length - 1, Math.floor((t / fileDur) * levels.length))] ?? 0) : 0;
                marks.push({ left: px, h: 2 + v * 20 * Math.min(1, 0.35 + c.volume * 0.65) });
              }
            }
            const title = c.title ?? 'Sound';
            return (
              <Pressable
                key={c.id}
                onPress={() => onSelect(isSel ? null : { kind: 'audio', id: c.id })}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${title}, ${clock(c.start)} to ${clock(c.end)}${c.loop ? ', looping' : ''}`}
                accessibilityHint={isSel ? 'Deselects it.' : 'Selects it to trim, move, set volume or fade.'}
                style={[styles.soundClip, styles.fileClip, { top: 4 + row * SOUND_ROW, left: x(c.start), width: w }, isSel && styles.soundSelected]}>
                {marks.map((b, i) => (
                  <View key={i} style={[styles.fileBar, { left: b.left, height: b.h }]} />
                ))}
                <View pointerEvents="none" style={styles.soundLabel}>
                  <SymbolView name={c.loop ? 'repeat' : title.startsWith('Voiceover') ? 'mic' : 'music.note'} size={11} tintColor={colors.textPrimary} />
                  <AppText variant="caption" numberOfLines={1} style={styles.captionText}>
                    {title}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
          {selAudio?.source === 'file' && selAudioLimits && (
            <EdgeFrame
              key={`snd-${selAudio.id}-${selAudio.start.toFixed(3)}-${selAudio.end.toFixed(3)}`}
              left={x(selAudio.start)}
              width={Math.max(28, (selAudio.end - selAudio.start) * PPS - 4)}
              top={4 + selAudioRow * SOUND_ROW}
              height={26}
              radius={8}
              color={colors.accent}
              startRange={[selAudioLimits.start[0] * PPS, selAudioLimits.start[1] * PPS]}
              endRange={[selAudioLimits.end[0] * PPS, selAudioLimits.end[1] * PPS]}
              scrollGesture={scrollGesture}
              onCommit={(side, dx) =>
                onRetimeAudio(selAudio.id, side === 'start' ? { start: selAudio.start + dx / PPS } : { end: selAudio.end + dx / PPS })
              }
              move={{
                range: [-selAudio.start * PPS, Math.max(0, total - selAudio.end) * PPS],
                onCommit: (dx) => onMoveAudio(selAudio.id, selAudio.start + dx / PPS),
                onTap: () => onSelect(null),
              }}
            />
          )}
        </View>
      )}
    </>
  );
});

type ClipBlockProps = {
  clip: TimelineClip;
  index: number;
  clips: TimelineClip[];
  pad: number;
  selected: boolean;
  scrollGesture: GestureType;
  onTap: TimelineProps['onTapClip'];
  onReorder: TimelineProps['onReorderClip'];
};

/**
 * The touch surface over one clip of a multi-clip video. Tap selects (the editor decides clip or part);
 * hold and drag moves the clip: its outline follows the finger, a marker shows where it will land, and each
 * new slot ticks. The move is committed once, on release.
 */
function ClipBlock({ clip, index, clips, pad, selected, scrollGesture, onTap, onReorder }: ClipBlockProps) {
  const dx = useSharedValue(0);
  const lifted = useSharedValue(0);
  const target = useSharedValue(index);
  const left = pad + clip.start * PPS;
  const width = Math.max(4, (clip.end - clip.start) * PPS - 2);
  const mid = left + width / 2;
  // The other clips, in order: their middles decide the drop slot, their edges draw the marker.
  const others = clips.filter((c) => c.id !== clip.id);
  const otherMids = others.map((c) => pad + ((c.start + c.end) / 2) * PPS);
  const slots = [...others.map((c) => pad + c.start * PPS), pad + (others.length ? others[others.length - 1].end : clip.end) * PPS];

  const tick = () => {
    Haptics.selectionAsync().catch(() => {});
  };
  // Dropped before the clip now at slot `to` (ids, so clips cut away entirely don't shift the count).
  const drop = (to: number) => {
    if (to !== index) onReorder(clip.id, others[to]?.id ?? null);
  };
  const tap = (localX: number) => onTap(clip.id, clip.start + Math.max(0, localX) / PPS);

  const pan = Gesture.Pan()
    .activateAfterLongPress(350)
    .blocksExternalGesture(scrollGesture)
    .onStart(() => {
      lifted.set(1);
      target.set(index);
      scheduleOnRN(tick);
    })
    .onUpdate((e) => {
      dx.set(e.translationX);
      const center = mid + e.translationX;
      let to = 0;
      for (let i = 0; i < otherMids.length; i++) if (otherMids[i] < center) to++;
      if (to !== target.get()) {
        target.set(to);
        scheduleOnRN(tick);
      }
    })
    .onEnd(() => {
      scheduleOnRN(drop, target.get());
    })
    .onFinalize(() => {
      lifted.set(0);
      dx.set(0);
    });
  const tapGesture = Gesture.Tap().onEnd((e) => {
    scheduleOnRN(tap, e.x);
  });
  const gesture = Gesture.Exclusive(pan, tapGesture);

  const ghost = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.get() }],
    opacity: lifted.get(),
  }));
  const marker = useAnimatedStyle(() => ({
    left: (slots[Math.min(slots.length - 1, Math.max(0, target.get()))] ?? left) - 2,
    opacity: lifted.get(),
  }));

  return (
    <>
      <GestureDetector gesture={gesture}>
        <View
          style={[styles.clipBlock, { left: left + 1, width }]}
          accessible
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={`Clip ${index + 1} of ${clips.length}: ${clip.title}, ${clock(clip.start)} to ${clock(clip.end)}`}
          accessibilityHint={selected ? 'Actions move it or select a part.' : 'Selects the clip. Hold and drag to move it.'}
          accessibilityActions={[
            { name: 'activate' },
            ...(index > 0 ? [{ name: 'moveEarlier', label: 'Move earlier' }] : []),
            ...(index + 1 < clips.length ? [{ name: 'moveLater', label: 'Move later' }] : []),
          ]}
          onAccessibilityAction={(e) => {
            const a = e.nativeEvent.actionName;
            if (a === 'activate') onTap(clip.id, null);
            else if (a === 'moveEarlier') onReorder(clip.id, clips[index - 1]?.id ?? null);
            else if (a === 'moveLater') onReorder(clip.id, clips[index + 2]?.id ?? null);
          }}>
          <Animated.View pointerEvents="none" style={[styles.clipGhost, ghost]}>
            <AppText variant="caption" numberOfLines={1}>
              {clip.title}
            </AppText>
          </Animated.View>
        </View>
      </GestureDetector>
      <Animated.View pointerEvents="none" style={[styles.dropMarker, marker]} />
    </>
  );
}

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
  /** Drag the body to move the whole thing (added sounds); a tap on the body deselects. */
  move?: { range: [number, number]; onCommit: (dx: number) => boolean; onTap: () => void };
};

/**
 * The selection outline with a drag handle on each end. While a handle moves, only this outline moves
 * (on the UI thread); on release the edit is committed once. Keyed by the selection's times, so a new
 * render of the document starts it fresh.
 */
function EdgeFrame({ left, width, top, height, radius, color, startRange, endRange, scrollGesture, onCommit, move }: EdgeFrameProps) {
  const dl = useSharedValue(0);
  const dr = useSharedValue(0);
  const dm = useSharedValue(0);
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

  const [mMin, mMax] = move?.range ?? [0, 0];
  const commitMove = (dx: number) => {
    const changed = Math.abs(dx) >= 1 && !!move?.onCommit(dx);
    if (!changed) dm.set(0);
  };
  const tapBody = () => move?.onTap();
  const bodyPan = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .blocksExternalGesture(scrollGesture)
    .onUpdate((e) => {
      dm.set(Math.min(mMax, Math.max(mMin, e.translationX)));
    })
    .onEnd(() => {
      scheduleOnRN(commitMove, dm.get());
    });
  const bodyTap = Gesture.Tap().onEnd(() => {
    scheduleOnRN(tapBody);
  });
  const body = Gesture.Exclusive(bodyPan, bodyTap);

  const frame = useAnimatedStyle(() => ({ left: left + dl.get() + dm.get(), width: Math.max(8, width - dl.get() + dr.get()) }));

  return (
    <Animated.View pointerEvents="box-none" style={[styles.edgeFrame, { top, height, borderRadius: radius, borderColor: color }, frame]}>
      {move && (
        <GestureDetector gesture={body}>
          <View style={styles.edgeBody} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        </GestureDetector>
      )}
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

const SELECTED_FILL = '#3A3A3C';

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
  clipBlock: { position: 'absolute', top: 6, height: 44 },
  clipGhost: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  dropMarker: { position: 'absolute', top: 2, width: 4, height: 52, borderRadius: 2, backgroundColor: colors.accent },
  clipDivider: { position: 'absolute', top: 6, width: 2, height: 44, backgroundColor: colors.bg },
  clipTitle: { position: 'absolute', top: 9, paddingHorizontal: 6, height: 18, justifyContent: 'center', borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)' },
  addClip: {
    position: 'absolute',
    top: 6,
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardHigh,
  },
  addClipPressed: { opacity: 0.6 },
  captionTrack: { height: 34, marginTop: 4 },
  textTrack: { marginTop: 2 },
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
  },
  captionHidden: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  // Selected: one step lighter than the chip (the accent edge frame marks it), not a coloured fill.
  captionSelected: { backgroundColor: SELECTED_FILL },
  captionText: { flexShrink: 1 },
  edgeFrame: { position: 'absolute', borderWidth: 2 },
  edge: { position: 'absolute', top: -2, bottom: -2, width: 12, alignItems: 'center', justifyContent: 'center' },
  edgeStart: { left: -8, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  edgeEnd: { right: -8, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  edgeGrip: { width: 2, height: '45%', borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  edgeBody: { position: 'absolute', top: 0, bottom: 0, left: 6, right: 6 },
  soundLane: { height: 48, marginTop: 4 },
  laneLine: { position: 'absolute', top: 23, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  soundRows: { marginTop: 2 },
  soundClip: { position: 'absolute', borderRadius: 8, overflow: 'hidden', justifyContent: 'center' },
  originalClip: { top: 4, height: 40, backgroundColor: colors.card },
  fileClip: { height: 26, backgroundColor: colors.cardHigh },
  soundSelected: { backgroundColor: SELECTED_FILL },
  soundLabel: { position: 'absolute', top: 3, left: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  fileBar: { position: 'absolute', bottom: 2, width: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.18)' },
  wave: { height: 48, marginTop: 4, justifyContent: 'center' },
  bar: { position: 'absolute', width: 2, borderRadius: 1, backgroundColor: colors.waveform },
  playhead: { position: 'absolute', top: 12, bottom: 0, width: 12, alignItems: 'center' },
  playLine: { flex: 1, width: 2, marginTop: -2, backgroundColor: colors.accent, borderRadius: 1 },
});
