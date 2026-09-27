import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorText } from '@/batch/queue';
import { AppText, GradientButton, IconButton, OutlineButton, Thumb } from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import { canImportFiles, importFile } from '@/onboarding/fileImport';
import { formatDuration, useLibrary } from '@/state/library';
import { batchPreset } from '@/state/presets';
import { useSettings } from '@/state/settings';

const MAX_SEC = 15 * 60;
const WARN_SEC = MAX_SEC - 60;

type Take = { uri: string; seconds: number };

export default function RecordScreen() {
  const insets = useSafeAreaInsets();
  const [cam, requestCam] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();

  const close = (
    <View style={[styles.close, { top: insets.top + spacing.xs }]}>
      <IconButton icon="xmark" label="Close" size={44} tone="solid" iconScale={0.4} onPress={() => router.back()} />
    </View>
  );

  if (!cam || !mic) return <View style={styles.black}>{close}</View>;

  if (!cam.granted || !mic.granted) {
    const blocked = (!cam.granted && !cam.canAskAgain) || (!mic.granted && !mic.canAskAgain);
    const ask = async () => {
      if (!cam.granted) await requestCam();
      if (!mic.granted) await requestMic();
    };
    return (
      <View style={[styles.black, styles.permission, { paddingBottom: insets.bottom + spacing.lg }]}>
        {close}
        <View style={styles.permissionText}>
          <SymbolView name="video" size={32} tintColor={colors.textSecondary} weight="regular" />
          <AppText variant="title" style={styles.center} accessibilityRole="header">
            Record in Tenfold
          </AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.center}>
            {blocked
              ? `Camera or microphone access is off for Tenfold. Turn on ${!cam.granted && !mic.granted ? 'both' : !cam.granted ? 'Camera' : 'Microphone'} in Settings to record here. Importing from Photos works without it.`
              : 'Tenfold needs the camera and the microphone to record a clip. Recordings stay on this iPhone.'}
          </AppText>
        </View>
        <GradientButton
          title={blocked ? 'Open Settings' : 'Allow camera and microphone'}
          shape="pill"
          onPress={blocked ? () => Linking.openSettings() : ask}
          style={styles.permissionButton}
        />
      </View>
    );
  }

  return <Recorder close={close} />;
}

function Recorder({ close }: { close: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('front');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const elapsedRef = useRef(0);

  // 9:16 frame, as tall as the screen allows.
  const frameH = Math.min(height, (width * 16) / 9);
  const frameW = (frameH * 9) / 16;

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      elapsedRef.current = s;
      setElapsed(s);
    }, 250);
    return () => clearInterval(t);
  }, [recording]);

  const start = async () => {
    if (!camera.current || recording) return;
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    startedAt.current = Date.now();
    elapsedRef.current = 0;
    setElapsed(0);
    setRecording(true);
    try {
      const result = await camera.current.recordAsync({ maxDuration: MAX_SEC });
      if (result?.uri) setTake({ uri: result.uri, seconds: Math.max(1, elapsedRef.current) });
    } catch (e) {
      setError(`Recording stopped: ${errorText(e)}`);
    } finally {
      setRecording(false);
    }
  };

  const stop = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    camera.current?.stopRecording();
  };

  if (take) return <Review take={take} close={close} onRetake={() => setTake(null)} />;

  const left = MAX_SEC - elapsed;
  const warn = recording && elapsed >= WARN_SEC;

  return (
    <View style={styles.black}>
      <View style={[styles.frame, { width: frameW, height: frameH, marginTop: Math.max(0, (height - frameH) / 2) }]}>
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="video"
          videoQuality="1080p"
          onCameraReady={() => setReady(true)}
          onMountError={(e) => setError(e.message)}
        />
      </View>

      {!recording && close}

      <View style={[styles.timer, { top: insets.top + spacing.md }]} accessibilityLiveRegion="polite">
        {recording && (
          <View style={styles.timerPill}>
            <View style={styles.recDot} />
            <AppText variant="bodyStrong" tabular>
              {formatDuration(elapsed)}
            </AppText>
            {warn && (
              <AppText variant="label" color={colors.accentText} tabular>
                {formatDuration(left)} left
              </AppText>
            )}
          </View>
        )}
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.lg }]}>
        {error ? (
          <AppText variant="label" style={[styles.center, styles.errorText]}>
            {error}
          </AppText>
        ) : !recording ? (
          <AppText variant="caption" color={canImportFiles() ? colors.textSecondary : colors.textPrimary} style={styles.center}>
            {canImportFiles()
              ? 'Up to 15 minutes. Tap to start, tap again to stop.'
              : 'This build of Tenfold can’t add recordings to a batch yet, so a take can’t be edited. Import from Photos instead.'}
          </AppText>
        ) : null}
        <View style={styles.controlRow}>
          <View style={styles.side} />
          <Pressable
            onPress={recording ? stop : start}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
            style={[styles.shutter, !ready && styles.dim]}>
            <View style={recording ? styles.stopSquare : styles.recCircle} />
          </Pressable>
          <View style={styles.side}>
            {!recording && (
              <IconButton
                icon="arrow.triangle.2.circlepath.camera"
                label={facing === 'front' ? 'Use back camera' : 'Use front camera'}
                size={48}
                tone="solid"
                iconScale={0.42}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFacing((f) => (f === 'front' ? 'back' : 'front'));
                }}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

function Review({ take, close, onRetake }: { take: Take; close: ReactNode; onRetake: () => void }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = canImportFiles();

  const use = async () => {
    setBusy(true);
    setError(null);
    try {
      const asset = await importFile(take.uri, `Recording ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
      const { defaultPreset, platforms } = useSettings.getState();
      const batchId = useLibrary.getState().createBatch([asset], batchPreset(defaultPreset, platforms));
      router.replace({ pathname: '/batch/setup', params: { batchId } });
    } catch (e) {
      setError(`Couldn’t add the clip: ${errorText(e)}`);
      setBusy(false);
    }
  };

  return (
    <View style={[styles.black, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + spacing.md }]}>
      {close}
      <View style={styles.reviewBody}>
        {/* No player without a project: shows what was recorded until the engine can import the file. */}
        <Thumb seed={5} style={styles.reviewPoster}>
          <View style={styles.reviewCenter}>
            <SymbolView name="checkmark.circle" size={30} tintColor={colors.textPrimary} weight="regular" />
            <AppText variant="bodyStrong" tabular>
              {formatDuration(take.seconds)} recorded
            </AppText>
          </View>
        </Thumb>
      </View>
      <View style={styles.reviewFooter}>
        {error ? (
          <AppText variant="label" style={[styles.center, styles.errorText]}>
            {error}
          </AppText>
        ) : null}
        <GradientButton title={busy ? 'Adding clip…' : 'Use this clip'} shape="pill" disabled={!supported || busy} onPress={use} />
        {!supported && (
          <AppText variant="caption" color={colors.textMuted} style={styles.center}>
            This build of Tenfold can’t add recordings to a batch yet. Importing from Photos works.
          </AppText>
        )}
        <OutlineButton title="Retake" icon="arrow.counterclockwise" height={44} onPress={onRetake} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: colors.bg },
  center: { textAlign: 'center' },
  close: { position: 'absolute', left: spacing.md, zIndex: 2 },
  permission: { justifyContent: 'center', paddingHorizontal: spacing.gutter },
  permissionText: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  permissionButton: { alignSelf: 'stretch' },
  frame: { alignSelf: 'center', overflow: 'hidden', borderRadius: radii.card, borderCurve: 'continuous', backgroundColor: colors.card },
  timer: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 32,
    borderRadius: radii.round,
    backgroundColor: colors.overlay,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: spacing.md, paddingHorizontal: spacing.gutter },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { width: 64, alignItems: 'center' },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recCircle: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.danger },
  stopSquare: { width: 30, height: 30, borderRadius: 6, backgroundColor: colors.danger },
  dim: { opacity: 0.4 },
  errorText: { color: colors.danger },
  reviewBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.gutter },
  reviewPoster: { width: '70%', aspectRatio: 9 / 16, borderRadius: radii.card, borderCurve: 'continuous', overflow: 'hidden' },
  reviewCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: 'rgba(0,0,0,0.35)' },
  reviewFooter: { paddingHorizontal: spacing.gutter, gap: spacing.sm },
});
