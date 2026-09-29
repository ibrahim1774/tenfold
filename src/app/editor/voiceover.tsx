import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorText } from '@/batch/queue';
import { AppText, GradientButton, OutlineButton, PressableScale } from '@/design/components';
import { colors, spacing } from '@/design/tokens';
import { addFileClip, nextVoiceoverTitle } from '@/editor/audioClips';
import { setPreviewPlaying } from '@/editor/previewBus';
import { Engine, type AddedAudio } from '@/engine';
import { commitDoc } from '@/state/history';
import { useLibrary } from '@/state/library';

type Phase = 'idle' | 'starting' | 'recording' | 'stopping' | 'recorded' | 'denied';

/** "0:04.2" */
function stopwatch(t: number) {
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

/**
 * Voiceover over the video: the editor's preview plays from the playhead while the microphone records,
 * then the recording is added at that playhead (full volume, no ducking), or thrown away.
 * `at` and `total` are output seconds.
 */
export default function VoiceoverSheet() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ projectId: string; at: string; total: string }>();
  const projectId = params.projectId;
  const at = Number(params.at) || 0;
  const total = Number(params.total) || 0;
  const limit = Math.max(0, total - at);

  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<AddedAudio | null>(null);
  const [error, setError] = useState<string | null>(null);
  // For cleanup when the sheet is swiped away: what is recording, and a file nobody used yet.
  const recordingRef = useRef(false);
  const unusedFile = useRef<string | null>(null);
  const startedAt = useRef(0);

  // Leaving the sheet stops a recording and deletes a take that wasn't added.
  useEffect(() => {
    return () => {
      setPreviewPlaying(false);
      const leftover = unusedFile.current;
      if (recordingRef.current) {
        recordingRef.current = false;
        Engine.stopVoiceover()
          .then((r) => (r.file ? Engine.deleteAudioFile(projectId, r.file) : false))
          .catch(() => {});
      } else if (leftover) {
        Engine.deleteAudioFile(projectId, leftover).catch(() => {});
      }
    };
  }, [projectId]);

  const stop = async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setPhase('stopping');
    setPreviewPlaying(false, at);
    try {
      const r = await Engine.stopVoiceover();
      if (r.error || !r.file) throw new Error(r.error ?? 'The recording was empty.');
      unusedFile.current = r.file;
      setTake(r);
      setElapsed(r.durationSec ?? elapsed);
      setPhase('recorded');
    } catch (e) {
      setError(`Couldn’t save the recording: ${errorText(e)}`);
      setPhase('idle');
    }
  };

  // The clock, and an automatic stop when the video ends.
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => {
      const t = (Date.now() - startedAt.current) / 1000;
      setElapsed(t);
      if (t >= limit) stopRef.current();
    }, 100);
    return () => clearInterval(id);
  }, [phase, limit]);

  const start = async () => {
    setError(null);
    setPhase('starting');
    try {
      const r = await Engine.startVoiceover(projectId);
      if (r.error === 'microphone') {
        setPhase('denied');
        return;
      }
      if (r.error || !r.file) throw new Error(r.error === 'unavailable' ? 'This build of Tenfold can’t record voiceovers. Install the latest build.' : (r.error ?? 'The microphone didn’t start.'));
      recordingRef.current = true;
      unusedFile.current = r.file;
      startedAt.current = Date.now();
      setElapsed(0);
      setPhase('recording');
      // The session is play-and-record now, so the preview plays out loud while the mic listens.
      setPreviewPlaying(true, at);
    } catch (e) {
      setError(errorText(e));
      setPhase('idle');
    }
  };

  const discard = () => {
    const file = unusedFile.current;
    unusedFile.current = null;
    if (file) Engine.deleteAudioFile(projectId, file).catch(() => {});
    setTake(null);
    setElapsed(0);
    setPhase('idle');
  };

  const use = () => {
    const latest = useLibrary.getState().docs[projectId];
    if (!latest || !take) return;
    const id = `v-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const r = addFileClip(latest, take, at, total, { id, ducking: false, title: nextVoiceoverTitle(latest) });
    if ('error' in r) {
      setError(r.error);
      return;
    }
    unusedFile.current = null;
    commitDoc(projectId, r.doc);
    router.back();
  };

  const recording = phase === 'recording';
  const busy = phase === 'starting' || phase === 'stopping';

  return (
    <View style={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.head}>
        <AppText variant="bodyStrong" accessibilityRole="header" style={styles.centre}>
          Record voiceover
        </AppText>
        <AppText variant="label" color={colors.textMuted} style={styles.centre}>
          {phase === 'recorded'
            ? `Adds at ${stopwatch(at)} at full volume.`
            : `The video plays from ${stopwatch(at)} while you record. Headphones keep its sound out of the recording.`}
        </AppText>
      </View>

      {phase === 'denied' ? (
        <View style={styles.denied}>
          <AppText variant="body">Tenfold can’t use the microphone. Turn on Microphone for Tenfold in Settings, then come back.</AppText>
          <OutlineButton title="Open Settings" height={44} onPress={() => Linking.openSettings()} />
        </View>
      ) : (
        <View style={styles.recorder}>
          <AppText variant="title" tabular accessibilityLiveRegion="polite" accessibilityLabel={`${elapsed.toFixed(1)} seconds recorded`}>
            {stopwatch(elapsed)}
            <AppText variant="label" tabular color={colors.textMuted}>
              {` / ${stopwatch(limit)}`}
            </AppText>
          </AppText>
          {phase !== 'recorded' && (
            <PressableScale
              onPress={recording ? stop : start}
              disabled={busy}
              haptic="impact"
              scaleTo={0.94}
              accessibilityRole="button"
              accessibilityLabel={recording ? 'Stop recording' : 'Record'}
              accessibilityState={{ disabled: busy }}
              style={[styles.recordRing, busy && styles.dim]}>
              <View style={recording ? styles.stopSquare : styles.recordDot} />
            </PressableScale>
          )}
        </View>
      )}

      {error && (
        <AppText variant="label" color={colors.danger} style={styles.centre}>
          {error}
        </AppText>
      )}

      {phase === 'recorded' && take && (
        <View style={styles.actions}>
          <GradientButton title={`Add voiceover (${(take.durationSec ?? elapsed).toFixed(1)} s)`} onPress={use} />
          <OutlineButton title="Discard" height={44} onPress={discard} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: spacing.gutter, paddingTop: spacing.xl, gap: spacing.lg },
  // Small centred sheet title under the grabber, like the system's own sheets.
  head: { gap: spacing.xs, alignItems: 'center' },
  centre: { textAlign: 'center' },
  recorder: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.sm },
  recordRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordDot: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.danger },
  stopSquare: { width: 28, height: 28, borderRadius: 6, backgroundColor: colors.danger },
  dim: { opacity: 0.5 },
  denied: { gap: spacing.md },
  actions: { gap: spacing.md },
});
