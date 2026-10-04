import { AppState } from 'react-native';
import { create } from 'zustand';

import { errorReason, EV, track } from '../analytics/posthog';
import { Engine, EngineEvents, type Project } from '../engine';
import { limitsFor } from '../onboarding/plans';
import { exportsLeft, tierOf, useEntitlements } from '../state/entitlements';
import { docFromAnalysis, projectsOf, useLibrary } from '../state/library';
import { useSettings } from '../state/settings';
import { editsOf, effectiveLevels } from './edits';

// JS-side orchestration (spec §4.13): two serial lanes. Analysis of project N+1 runs while
// project N exports; the native engine serialises the heavy work per lane.

export const STAGE_LABELS: Record<string, string> = {
  extractingAudio: 'Reading audio',
  transcribing: 'Transcribing',
  detecting: 'Finding the speaker',
  planning: 'Planning cuts',
  rendering: 'Preparing export',
  exporting: 'Exporting',
  saving: 'Saving to Photos',
  cooling: 'Cooling down',
};

// Overall progress weight of each analysis stage.
const STAGE_SPAN: Record<string, [number, number]> = {
  extractingAudio: [0, 0.12],
  transcribing: [0.12, 0.72],
  detecting: [0.72, 0.95],
  planning: [0.95, 1],
  rendering: [0, 0.05],
  exporting: [0.05, 0.95],
  saving: [0.95, 1],
};

/** Overall 0..1 of one analysis (or export) from a stage and its own fraction. */
export function stageProgress(stage: string, fraction: number): number {
  const [a, b] = STAGE_SPAN[stage] ?? [0, 1];
  return a + (b - a) * Math.max(0, Math.min(1, fraction));
}

type QueueUI = {
  /** The export lane stopped at this month's export limit. */
  limitReached: boolean;
  /** The videos it put back to `ready` when it stopped, so only their screens show the export_limit paywall. */
  parked: string[];
  setLimitReached: (v: boolean, parked?: string[]) => void;
};
export const useQueueUI = create<QueueUI>((set) => ({
  limitReached: false,
  parked: [],
  setLimitReached: (limitReached, parked = []) => set({ limitReached, parked: limitReached ? parked : [] }),
}));

/** A screen showed the export_limit paywall for these parked videos: they no longer need one. */
export function unpark(ids: readonly string[]) {
  const ui = useQueueUI.getState();
  if (!ui.limitReached) return;
  const parked = ui.parked.filter((id) => !ids.includes(id));
  ui.setLimitReached(parked.length > 0, parked);
}

// Exports became available again (an upgrade, a restore): the limit stop is over, so no paywall pops up later.
useEntitlements.subscribe((s) => {
  if (useQueueUI.getState().limitReached && exportsLeft(s) > 0) useQueueUI.getState().setLimitReached(false);
});

let analysisBusy = false;
let exportBusy = false;
let started = false;
const lastUpdate: Record<string, number> = {};
const lastStage: Record<string, string> = {};

const lib = () => useLibrary.getState();

function nextProject(status: Project['status']): Project | undefined {
  const { batches, projects } = lib();
  const ordered = Object.values(batches)
    .filter((b) => b.startedAt && !b.paused)
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
  for (const b of ordered) {
    const p = projectsOf(b, projects).find((x) => x.status === status);
    if (p) return p;
  }
  return undefined;
}

function keepAwake() {
  Engine.setKeepAwake(analysisBusy || exportBusy).catch(() => {});
}

/** Call once at app start: resumes work interrupted by a kill and listens for native progress. */
export function startQueue() {
  if (started) return;
  started = true;
  const { projects, updateProject } = lib();
  for (const p of Object.values(projects)) {
    if (p.status === 'analyzing') updateProject(p.id, { status: 'queued', progress: 0, stage: undefined });
    if (p.status === 'exporting') updateProject(p.id, { status: 'exportQueued', progress: 0, stage: undefined });
    if (p.status === 'importing') updateProject(p.id, { status: 'failed', error: 'Import was interrupted.' });
  }
  EngineEvents.onJobProgress(({ projectId, stage, fraction, clipIndex, clipCount, scope }) => {
    // Clips added in the editor report their own progress there; the video's status doesn't change.
    if (scope === 'clips') return;
    const now = Date.now();
    // Throttle progress, but never drop a stage change ("Saving to Photos" arrives right after 100%).
    if (fraction < 1 && stage === lastStage[projectId] && now - (lastUpdate[projectId] ?? 0) < 100) return;
    lastUpdate[projectId] = now;
    lastStage[projectId] = stage;
    const within = stageProgress(stage, fraction);
    // A video of several clips is analysed clip by clip: progress runs once over all of them.
    const clips = clipCount && clipCount > 1 ? clipCount : 1;
    const progress = clips > 1 ? (Math.min(clips - 1, clipIndex ?? 0) + within) / clips : within;
    useLibrary.getState().updateProject(projectId, { stage, progress });
  });
  // Exports only start in the foreground (iOS would cut them short); resume when the app comes back.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') pump();
  });
  pump();
}

export function pump() {
  void runAnalysisLane();
  void runExportLane();
}

async function runAnalysisLane() {
  if (analysisBusy) return;
  analysisBusy = true;
  keepAwake();
  try {
    for (let p = nextProject('queued'); p; p = nextProject('queued')) {
      await analyzeOne(p);
    }
  } finally {
    analysisBusy = false;
    keepAwake();
  }
}

async function analyzeOne(p: Project) {
  const batch = lib().batches[p.batchId];
  if (!batch) return;
  lib().updateProject(p.id, { status: 'analyzing', stage: 'extractingAudio', progress: 0, error: undefined });
  const t0 = Date.now();
  try {
    const edits = editsOf(p, batch);
    const analysis = await Engine.analyze(p.id, { ...effectiveLevels(batch.preset, edits), language: useSettings.getState().language });
    if (lib().projects[p.id]?.status !== 'analyzing') return; // cancelled meanwhile
    lib().setDoc(p.id, docFromAnalysis(analysis, batch, edits));
    // Out of exports this month: leave it ready instead of queueing an export that would only bounce to the paywall.
    const autoExport = batch.preset.autoExport && exportsLeft(useEntitlements.getState()) > 0;
    lib().updateProject(p.id, {
      status: autoExport ? 'exportQueued' : 'ready',
      stage: undefined,
      progress: 1,
      warnings: analysis.warnings,
    });
    track(EV.clipProcessed, {
      ms: Date.now() - t0,
      duration_sec: Math.round(p.media?.durationSec ?? 0),
      warnings: analysis.warnings?.length ?? 0,
      auto_export: autoExport,
    });
    if (autoExport) void runExportLane();
  } catch (e) {
    if (lib().projects[p.id]?.status !== 'analyzing') return;
    track(EV.clipFailed, { stage: lib().projects[p.id]?.stage ?? null, reason: errorReason(errorText(e)) });
    lib().updateProject(p.id, { status: 'failed', stage: undefined, error: errorText(e) });
  }
}

async function runExportLane() {
  if (exportBusy) return;
  exportBusy = true;
  keepAwake();
  try {
    for (let p = nextProject('exportQueued'); p; p = nextProject('exportQueued')) {
      if (AppState.currentState !== 'active') break;
      // Thermal pause (spec §7): wait until the phone cools down.
      let cooled = false;
      while (['serious', 'critical'].includes(Engine.thermalState())) {
        lib().updateProject(p.id, { stage: 'cooling' });
        await new Promise((r) => setTimeout(r, 10_000));
        cooled = true;
      }
      if (cooled) {
        lib().updateProject(p.id, { stage: undefined });
        // The user may have cancelled or paused while we waited: pick again.
        const fresh = lib().projects[p.id];
        const b = fresh && lib().batches[fresh.batchId];
        if (!fresh || fresh.status !== 'exportQueued' || !b || b.paused) continue;
      }
      if (exportsLeft(useEntitlements.getState()) <= 0) {
        // This month's exports used up: park everything waiting and show the export_limit paywall.
        const parked: string[] = [];
        for (let q = nextProject('exportQueued'); q; q = nextProject('exportQueued')) {
          lib().updateProject(q.id, { status: 'ready', stage: undefined, progress: 1 });
          parked.push(q.id);
        }
        useQueueUI.getState().setLimitReached(true, parked);
        break;
      }
      await exportOne(p);
    }
  } finally {
    exportBusy = false;
    keepAwake();
  }
}

async function exportOne(p: Project) {
  const doc = lib().docs[p.id];
  if (!doc) {
    lib().updateProject(p.id, { status: 'failed', error: 'This video hasn’t been analysed yet.' });
    return;
  }
  const { uhd, watermark } = limitsFor(tierOf(useEntitlements.getState()));
  // Paid plans export at the clip's own resolution, up to 4K; there's no setting for it.
  const quality = uhd && Math.min(p.media?.width ?? 0, p.media?.height ?? 0) >= 2160 ? 'uhd' : 'hd';
  lib().updateProject(p.id, { status: 'exporting', stage: 'rendering', progress: 0, error: undefined });
  const t0 = Date.now();
  try {
    const result = await Engine.export(p.id, doc, {
      quality,
      watermark,
      saveToPhotos: true,
      keepHDR: false,
    });
    if (lib().projects[p.id]?.status !== 'exporting') return;
    useEntitlements.getState().recordExport();
    track(EV.exportCompleted, {
      ms: Date.now() - t0,
      duration_sec: Math.round(p.media?.durationSec ?? 0),
      quality,
      watermark,
      saved_to_photos: !!result.savedToPhotos,
    });
    lib().updateProject(p.id, {
      status: 'done',
      stage: undefined,
      progress: 1,
      exportUri: result.uri,
      exportedAt: Date.now(),
      savedToPhotos: result.savedToPhotos,
      error: result.photosDenied
        ? 'Photos access was denied. Use Share to save it.'
        : result.saveError
          ? `Couldn’t save to Photos (${result.saveError}). Use Share to save it.`
          : undefined,
    });
  } catch (e) {
    if (lib().projects[p.id]?.status !== 'exporting') return;
    // Still "exporting" means the user didn't cancel: iOS ended our background time. Try again when back.
    if (/cancel/i.test(errorText(e))) {
      lib().updateProject(p.id, { status: 'exportQueued', stage: undefined, progress: 0 });
      return;
    }
    track(EV.exportFailed, { reason: errorReason(errorText(e)) });
    lib().updateProject(p.id, { status: 'ready', stage: undefined, progress: 1, error: errorText(e) });
  }
}

// MARK: - Actions used by screens

export function startBatch(batchId: string) {
  const { batches, projects, updateBatch, updateProject } = lib();
  const batch = batches[batchId];
  if (!batch) return;
  updateBatch(batchId, { startedAt: Date.now(), paused: false });
  projectsOf(batch, projects)
    .filter((p) => p.status === 'pending' || p.status === 'failed' || p.status === 'cancelled')
    .forEach((p) => updateProject(p.id, { status: 'queued', progress: 0, error: undefined }));
  pump();
}

export function setPaused(batchId: string, paused: boolean) {
  lib().updateBatch(batchId, { paused });
  if (!paused) pump();
}

export async function cancelBatch(batchId: string) {
  const { batches, projects, updateProject } = lib();
  const batch = batches[batchId];
  if (!batch) return;
  for (const p of projectsOf(batch, projects)) {
    if (p.status === 'queued' || p.status === 'analyzing') {
      updateProject(p.id, { status: 'cancelled', stage: undefined, progress: 0 });
      if (p.status === 'analyzing') await Engine.cancel(p.id).catch(() => {});
    }
    if (p.status === 'exportQueued' || p.status === 'exporting') {
      updateProject(p.id, { status: 'ready', stage: undefined, progress: 1 });
      if (p.status === 'exporting') await Engine.cancel(p.id).catch(() => {});
    }
  }
}

/** Queue exports for the given projects (only analysed ones). Returns how many were queued. */
export function queueExports(projectIds: string[]): number {
  const { projects, batches, updateProject, updateBatch } = lib();
  let n = 0;
  for (const id of projectIds) {
    const p = projects[id];
    if (p && (p.status === 'ready' || p.status === 'done')) {
      updateProject(id, { status: 'exportQueued', progress: 0, error: undefined });
      // Exporting is an explicit "go": a paused batch would otherwise leave it waiting forever.
      if (batches[p.batchId]?.paused) updateBatch(p.batchId, { paused: false });
      n++;
    }
  }
  if (n > 0) {
    // Videos queued again are no longer parked at the limit.
    unpark(projectIds);
    void runExportLane();
  }
  return n;
}

export function retryProject(projectId: string) {
  const p = lib().projects[projectId];
  if (!p) return;
  lib().updateProject(projectId, { status: lib().docs[projectId] ? 'exportQueued' : 'queued', error: undefined, progress: 0 });
  pump();
}

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^.*?Error: /, '').slice(0, 200);
}
