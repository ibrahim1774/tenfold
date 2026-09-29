import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { AppText, Card, GlassSurface, GradientButton, ProgressBar, Thumb } from '@/design/components';
import { colors, motion, radii, spacing } from '@/design/tokens';
import {
  Engine,
  EngineEvents,
  TenfoldPreviewView,
  type Analysis,
  type Batch,
  type EditDocument,
  type JobProgressPayload,
} from '@/engine';
import { docFromAnalysis, formatDuration } from '@/state/library';
import { batchPreset } from '@/state/presets';

import { canImportFiles, importFile, SAMPLE_TITLE, sampleClipUri } from './fileImport';

export type DemoMode = 'onboarding' | 'replay';

type Result = {
  projectId: string;
  before: number;
  after: number;
  fillers: number;
  pauses: number;
  retakes: number;
  /** Removed ranges as fractions of the source, for the segment bar. */
  removed: { start: number; end: number }[];
  doc: EditDocument;
};

type Phase =
  | { kind: 'missing' }
  | { kind: 'unsupported' }
  | { kind: 'running'; stage: string; fraction: number }
  | { kind: 'done'; result: Result }
  | { kind: 'failed'; message: string };

const STAGES: Partial<Record<JobProgressPayload['stage'], string>> = {
  extractingAudio: 'Reading the audio',
  transcribing: 'Transcribing',
  detecting: 'Finding pauses and filler words',
  planning: 'Planning the cut',
};

// One demo project per app session: replaying the demo shows the same result without redoing the work.
let cached: Result | null = null;

function demoBatch(projectId: string): Batch {
  return {
    id: 'demo',
    createdAt: Date.now(),
    title: SAMPLE_TITLE,
    preset: batchPreset('cleanTalk'),
    captionsOff: false,
    projectIds: [projectId],
    paused: false,
  };
}

async function runDemo(onStage: (stage: string, fraction: number) => void): Promise<Result> {
  const uri = sampleClipUri();
  if (!uri) throw new Error('missing');
  onStage('Copying the sample clip', 0);
  const asset = await importFile(uri, SAMPLE_TITLE);
  const id = asset.projectId;
  const sub = EngineEvents.onJobProgress((e) => {
    if (e.projectId === id) onStage(STAGES[e.stage] ?? 'Working', e.fraction);
  });
  let analysis: Analysis;
  try {
    const batch = demoBatch(id);
    analysis = await Engine.analyze(id, batch.preset.analysis);
    const doc = docFromAnalysis(analysis, batch);
    const plan = await Engine.plan(id, doc);
    const before = analysis.media.durationSec;
    const accepted = doc.cuts.filter((c) => c.accepted);
    return {
      projectId: id,
      before,
      after: plan.compDuration,
      fillers: accepted.filter((c) => c.reason === 'filler').length,
      pauses: accepted.filter((c) => c.reason === 'silence').length,
      retakes: accepted.filter((c) => c.reason === 'retake').length,
      removed: before > 0 ? accepted.map((c) => ({ start: c.start / before, end: c.end / before })) : [],
      doc,
    };
  } finally {
    sub.remove();
  }
}

/**
 * Runs the real engine on the bundled sample clip and shows what it cut. Used as an onboarding step and
 * as the /demo screen ("Replay the demo" on Create and in You).
 */
export function Demo({ mode, onContinue }: { mode: DemoMode; onContinue: () => void }) {
  const [phase, setPhase] = useState<Phase>(() =>
    cached
      ? { kind: 'done', result: cached }
      : !sampleClipUri()
        ? { kind: 'missing' }
        : !canImportFiles()
          ? { kind: 'unsupported' }
          : { kind: 'running', stage: 'Starting', fraction: 0 },
  );
  const alive = useRef(true);

  // Runs the demo; the phase is already "running" when this is called.
  const launch = useCallback(() => {
    runDemo((stage, fraction) => alive.current && setPhase({ kind: 'running', stage, fraction }))
      .then((result) => {
        cached = result;
        if (alive.current) setPhase({ kind: 'done', result });
      })
      .catch((e) => alive.current && setPhase({ kind: 'failed', message: e instanceof Error ? e.message : String(e) }));
  }, []);

  const retry = () => {
    setPhase({ kind: 'running', stage: 'Starting', fraction: 0 });
    launch();
  };

  useEffect(() => {
    alive.current = true;
    if (phase.kind === 'running') launch();
    return () => {
      alive.current = false;
    };
    // Runs once on mount; `retry` restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unavailable = phase.kind === 'missing' || phase.kind === 'unsupported';
  const cta =
    phase.kind === 'failed'
      ? 'Try again'
      : unavailable
        ? mode === 'onboarding'
          ? 'Continue'
          : 'Import clips'
        : 'Now with your video';

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} alwaysBounceVertical={false}>
        <View style={styles.head}>
          <AppText variant="display" accessibilityRole="header">
            {phase.kind === 'done'
              ? 'Edited on this iPhone'
              : phase.kind === 'missing'
                ? 'Sample clip missing'
                : phase.kind === 'unsupported'
                  ? 'Demo unavailable'
                  : phase.kind === 'failed'
                    ? 'Demo stopped'
                    : 'Editing a real take'}
          </AppText>
          <AppText variant="body" color={colors.textSecondary}>
            {phase.kind === 'missing'
              ? 'This build doesn’t include the sample clip, so the demo can’t run. Your own clips work the same way.'
              : phase.kind === 'unsupported'
                ? 'This build of the video engine can’t open the sample clip yet. Your own clips from Photos work.'
                : phase.kind === 'failed'
                  ? `The demo stopped: ${phase.message}`
                  : 'A raw, unedited clip. Tenfold transcribes it, then cuts pauses, filler words and retakes.'}
          </AppText>
        </View>

        {phase.kind === 'done' ? <DemoResult result={phase.result} /> : <DemoPending phase={phase} />}
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton
          title={cta}
          shape="pill"
          disabled={phase.kind === 'running'}
          onPress={phase.kind === 'failed' ? retry : onContinue}
        />
        {/* A failed run never blocks the way on: skip the demo and carry on. */}
        {phase.kind === 'failed' && (
          <Pressable onPress={onContinue} accessibilityRole="button" style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
            <AppText variant="bodyStrong" color={colors.textSecondary}>
              {mode === 'onboarding' ? 'Continue' : 'Import clips'}
            </AppText>
          </Pressable>
        )}
        <AppText variant="caption" color={colors.textMuted} style={styles.center}>
          {unavailable ? 'Nothing uploaded, no permissions needed.' : 'Real sample clip. Nothing uploaded, no permissions needed.'}
        </AppText>
      </View>
    </View>
  );
}

function DemoPending({ phase }: { phase: Phase }) {
  const pct = phase.kind === 'running' ? Math.round(phase.fraction * 100) : 0;
  return (
    <View style={styles.stage}>
      <Thumb seed={3} style={styles.poster}>
        {phase.kind === 'missing' || phase.kind === 'unsupported' ? (
          <View style={styles.posterCenter}>
            <SymbolView name="film" size={28} tintColor={colors.textSecondary} weight="regular" />
          </View>
        ) : null}
      </Thumb>
      {phase.kind === 'running' && (
        <Card style={styles.progressCard}>
          <View style={styles.row}>
            <AppText variant="bodyStrong" style={styles.flex}>
              {phase.stage}
            </AppText>
            <AppText variant="label" color={colors.textSecondary} tabular>
              {pct}%
            </AppText>
          </View>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={phase.stage}
            accessibilityValue={{ min: 0, max: 100, now: pct }}>
            <ProgressBar progress={phase.fraction} height={4} />
          </View>
        </Card>
      )}
    </View>
  );
}

function DemoResult({ result }: { result: Result }) {
  const [muted, setMuted] = useState(true);
  const [previewFailed, setPreviewFailed] = useState(false);
  const facts = [
    `${formatDuration(result.before)} → ${formatDuration(result.after)}`,
    `${result.fillers} ${result.fillers === 1 ? 'filler' : 'fillers'}`,
    `${result.pauses} ${result.pauses === 1 ? 'pause' : 'pauses'}`,
    ...(result.retakes > 0 ? [`${result.retakes} ${result.retakes === 1 ? 'retake' : 'retakes'}`] : []),
  ].join(' · ');

  return (
    // No fade on the player: its glass mute badge wouldn't draw under a parent starting at opacity 0.
    <View style={styles.stage}>
      <Pressable
        onPress={() => setMuted((m) => !m)}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Play with sound' : 'Mute'}
        style={styles.poster}>
        {previewFailed ? (
          <Thumb seed={3} style={StyleSheet.absoluteFill} />
        ) : (
          <TenfoldPreviewView
            projectId={result.projectId}
            document={JSON.stringify(result.doc)}
            playing
            muted={muted}
            onEnd={() => {}}
            onError={() => setPreviewFailed(true)}
            style={StyleSheet.absoluteFill}
          />
        )}
        <GlassSurface variant="clear" pointerEvents="none" style={styles.mute}>
          <SymbolView name={muted ? 'speaker.slash.fill' : 'speaker.wave.2.fill'} size={14} tintColor={colors.textPrimary} />
        </GlassSurface>
      </Pressable>

      <Animated.View entering={FadeIn.duration(motion.fast).reduceMotion(ReduceMotion.System)} style={styles.resultText}>
        <AppText variant="title" tabular accessibilityLabel={facts.replace('→', 'to')}>
          {facts}
        </AppText>
        <SegmentBar removed={result.removed} />
        <View style={styles.legend}>
          <View style={[styles.swatch, styles.kept]} />
          <AppText variant="caption" color={colors.textSecondary}>
            Kept
          </AppText>
          <View style={[styles.swatch, styles.cut]} />
          <AppText variant="caption" color={colors.textSecondary}>
            Cut
          </AppText>
        </View>
      </Animated.View>
    </View>
  );
}

/** The source clip end to end: kept regions light, removed regions in the accent. */
function SegmentBar({ removed }: { removed: { start: number; end: number }[] }) {
  return (
    <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {removed.map((r, i) => (
        <View
          key={i}
          style={[styles.barCut, { left: `${Math.max(0, r.start) * 100}%`, width: `${Math.max(0.4, (r.end - r.start) * 100)}%` }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  content: { flexGrow: 1, paddingHorizontal: spacing.gutter, gap: spacing.xl, paddingBottom: spacing.lg },
  head: { gap: spacing.sm },
  stage: { gap: spacing.lg, alignItems: 'center' },
  poster: {
    width: 188,
    aspectRatio: 9 / 16,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  posterCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  progressCard: { alignSelf: 'stretch', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mute: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: { alignSelf: 'stretch', gap: spacing.md, alignItems: 'center' },
  bar: { alignSelf: 'stretch', height: 16, borderRadius: 4, backgroundColor: colors.textSecondary, overflow: 'hidden' },
  barCut: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.accent },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  kept: { backgroundColor: colors.textSecondary },
  cut: { backgroundColor: colors.accent, marginLeft: spacing.sm },
  footer: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.md },
  textButton: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  pressed: { opacity: 0.6 },
});
