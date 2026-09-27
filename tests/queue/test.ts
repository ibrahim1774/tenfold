import { calls, control, running } from './mockEngine';
import { AppState } from './rnMock';
import { cancelBatch, queueExports, retryProject, setPaused, startBatch, startQueue, useQueueUI } from '@/batch/queue';
import { clampPlacement, fillUserScale, fitScale, MAX_SCALE, MIN_SCALE } from '@/editor/frame';
import { setAllEdits, setEdit, setPresetId } from '@/state/batchSetup';
import { useEntitlements } from '@/state/entitlements';
import { projectsOf, useLibrary } from '@/state/library';
import { batchPreset } from '@/state/presets';

let fails = 0, passes = 0;
const check = (c: boolean, m: string) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lib = () => useLibrary.getState();
async function until(pred: () => boolean, ms = 4000) {
  const t0 = Date.now();
  while (!pred()) { if (Date.now() - t0 > ms) return false; await sleep(5); }
  return true;
}
function newBatch(n: number, autoExport = false) {
  const assets = Array.from({ length: n }, (_, i) => ({ projectId: `p${Math.random().toString(36).slice(2, 8)}${i}`, title: `IMG_000${i}.MOV`, media: { durationSec: 10, width: 1080, height: 1920, fps: 30, isHDR: false, hasAudio: true }, posterUri: 'file:///p.jpg' }));
  const id = lib().createBatch(assets as any, { ...batchPreset('cleanTalk'), autoExport });
  return id;
}
const statuses = (bid: string) => projectsOf(lib().batches[bid], lib().projects).map((p) => p.status);

async function main() {
  startQueue();

  console.log('• batch of 5 analyses sequentially, docs created');
  let b = newBatch(5);
  check(statuses(b).every((s) => s === 'pending'), 'pending after import');
  startBatch(b);
  check(await until(() => statuses(b).every((s) => s === 'ready')), `all ready (${statuses(b)})`);
  check(projectsOf(lib().batches[b], lib().projects).every((p) => !!lib().docs[p.id]?.cuts.length), 'edit docs from analysis');
  check(running.maxAnalyze === 1, `one analysis at a time (max ${running.maxAnalyze})`);
  check(lib().projects[lib().batches[b].projectIds[0]].title === 'Clip 0000', 'IMG_ titles cleaned');

  console.log('• free tier: export all stops at 3 and asks for Pro');
  useEntitlements.setState({ isPro: false, exportsUsed: 0 });
  queueExports(lib().batches[b].projectIds);
  check(await until(() => useQueueUI.getState().limitReached), 'limit flag raised');
  check(statuses(b).filter((s) => s === 'done').length === 3, `3 exported (${statuses(b)})`);
  check(statuses(b).filter((s) => s === 'ready').length === 2, 'rest parked as ready');
  check(running.maxExport === 1, `one export at a time (max ${running.maxExport})`);
  const exp = calls.filter((c) => c.fn === 'export');
  check(exp.length === 3, `3 export calls (${exp.length})`);

  console.log('• pro: remaining export, no watermark');
  useQueueUI.getState().setLimitReached(false);
  useEntitlements.setState({ isPro: true });
  queueExports(lib().batches[b].projectIds);
  check(await until(() => statuses(b).every((s) => s === 'done')), `all done (${statuses(b)})`);

  console.log('• auto-export batch overlaps analysis N+1 with export N');
  calls.length = 0;
  control.analyzeMs = 40; control.exportMs = 60;
  b = newBatch(4, true);
  startBatch(b);
  check(await until(() => statuses(b).every((s) => s === 'done'), 6000), `all exported (${statuses(b)})`);
  const firstExport = calls.find((c) => c.fn === 'export')!.t;
  const lastAnalyze = calls.filter((c) => c.fn === 'analyze').at(-1)!.t;
  check(firstExport < lastAnalyze, 'export lane runs while later clips analyse');
  check(running.maxAnalyze === 1 && running.maxExport === 1, 'lanes stay serial');

  console.log('• pause and resume');
  control.analyzeMs = 30;
  b = newBatch(4);
  startBatch(b);
  await until(() => statuses(b).includes('analyzing'));
  setPaused(b, true);
  await sleep(150);
  const readyWhilePaused = statuses(b).filter((s) => s === 'ready').length;
  check(readyWhilePaused <= 1 && statuses(b).filter((s) => s === 'queued').length >= 3, `paused holds the queue (${statuses(b)})`);
  setPaused(b, false);
  check(await until(() => statuses(b).every((s) => s === 'ready')), `resumed to completion (${statuses(b)})`);

  console.log('• cancel mid-batch');
  control.analyzeMs = 60;
  b = newBatch(4);
  startBatch(b);
  await until(() => statuses(b).includes('analyzing'));
  await cancelBatch(b);
  await sleep(200);
  check(statuses(b).every((s) => s === 'cancelled'), `all cancelled (${statuses(b)})`);
  check(!calls.some((c) => c.fn === 'export' && lib().batches[b].projectIds.includes(c.id!)), 'nothing exported');

  console.log('• one clip fails, the rest continue, retry works');
  control.analyzeMs = 10;
  b = newBatch(3);
  const bad = lib().batches[b].projectIds[1];
  control.failAnalyze.add(bad);
  startBatch(b);
  check(await until(() => statuses(b).filter((s) => s === 'ready').length === 2 && statuses(b).includes('failed')), `2 ready, 1 failed (${statuses(b)})`);
  check((lib().projects[bad].error ?? '').includes('Transcription failed'), `error text shown (${lib().projects[bad].error})`);
  control.failAnalyze.delete(bad);
  retryProject(bad);
  check(await until(() => statuses(b).every((s) => s === 'ready')), 'retry succeeds');

  console.log('• removing a clip before start');
  b = newBatch(3);
  lib().removeProject(lib().batches[b].projectIds[0]);
  check(lib().batches[b].projectIds.length === 2, 'removed from batch');
  startBatch(b);
  check(await until(() => statuses(b).length === 2 && statuses(b).every((s) => s === 'ready')), 'remaining 2 ready');

  console.log('• delete batch removes projects and docs');
  const ids = [...lib().batches[b].projectIds];
  lib().deleteBatch(b);
  check(!lib().batches[b] && ids.every((id) => !lib().projects[id] && !lib().docs[id]), 'gone');

  console.log('• exporting from a paused batch unpauses it and exports');
  useEntitlements.setState({ isPro: true });
  b = newBatch(2);
  startBatch(b);
  check(await until(() => statuses(b).every((s) => s === 'ready')), 'ready');
  setPaused(b, true);
  queueExports([lib().batches[b].projectIds[0]]);
  check(await until(() => statuses(b)[0] === 'done'), `exported (${statuses(b)})`);
  check(!lib().batches[b].paused, 'batch unpaused');

  console.log('• iOS cancels an export in the background: re-queued, resumes in the foreground');
  const bgId = lib().batches[b].projectIds[1];
  control.systemCancel.add(bgId);
  control.exportMs = 60;
  queueExports([bgId]);
  await until(() => lib().projects[bgId].status === 'exporting');
  AppState.set('background');
  check(await until(() => lib().projects[bgId].status === 'exportQueued'), `back in the queue (${lib().projects[bgId].status})`);
  await sleep(150);
  check(lib().projects[bgId].status === 'exportQueued', 'no export starts in the background');
  AppState.set('active');
  check(await until(() => lib().projects[bgId].status === 'done'), `exported after returning (${lib().projects[bgId].status})`);
  control.exportMs = 15;

  console.log('• a failed Photos save still finishes the export, with a message');
  control.saveError = 'Disk full';
  queueExports([bgId]);
  check(await until(() => lib().projects[bgId].status === 'done' && lib().projects[bgId].savedToPhotos === false), 'done, not in Photos');
  check((lib().projects[bgId].error ?? '').includes('Share'), `tells the user to share (${lib().projects[bgId].error})`);
  control.saveError = undefined;

  console.log('• cancelled clips can be resumed');
  b = newBatch(3);
  control.analyzeMs = 60;
  startBatch(b);
  await until(() => statuses(b).includes('analyzing'));
  await cancelBatch(b);
  control.analyzeMs = 15;
  control.cancelled.clear();
  check(statuses(b).includes('cancelled'), `some cancelled (${statuses(b)})`);
  startBatch(b);
  check(await until(() => statuses(b).every((s) => s === 'ready')), `all ready after resume (${statuses(b)})`);

  console.log('• per-video edits decide what the analysis and the edit do');
  b = newBatch(3);
  const [e1, e2, e3] = lib().batches[b].projectIds;
  setEdit(b, 'pauses', false, [e1]);
  setEdit(b, 'captions', false, [e1]);
  setEdit(b, 'reframe', false, [e2]);
  setEdit(b, 'zoom', false);
  startBatch(b);
  check(await until(() => statuses(b).every((s) => s === 'ready')), 'ready');
  const opts = (id: string) => calls.filter((c) => c.fn === 'analyze' && c.id === id).at(-1)?.opts;
  check(opts(e1)?.silence === 'off' && opts(e1)?.fillers !== 'off', `pauses off → no silence detection (${JSON.stringify(opts(e1))})`);
  check(opts(e2)?.silence !== 'off', 'others keep pause cutting');
  setEdit(b, 'retakes', false, [e3]);
  check(lib().projects[e3].edits?.retakes === false && opts(e1)?.retakes === true, 'retakes on by default, off per video when unchecked');
  check(lib().docs[e1].captions.enabled === false && lib().docs[e2].captions.enabled === true, 'captions follow the checks');
  check(lib().docs[e1].levels?.silence === 'off' && lib().docs[e2].levels?.silence !== 'off', 'levels match what ran');
  check(lib().docs[e2].crop.aspect === 'original' && lib().docs[e3].crop.aspect === '9:16', 'reframe follows the checks');
  check([e1, e2, e3].every((id) => lib().docs[id].zoom.mode === 'off'), 'zoom off for all');
  check(lib().docs[e3].crop.scale === undefined, 'reframed videos use automatic framing');

  console.log('• clear all → nothing applied');
  b = newBatch(2);
  setAllEdits(b, false);
  startBatch(b);
  check(await until(() => statuses(b).every((s) => s === 'ready')), 'ready');
  const d = lib().docs[lib().batches[b].projectIds[0]];
  check(!d.captions.enabled && d.zoom.mode === 'off' && d.crop.aspect === 'original' && d.levels?.fillers === 'off', 'untouched edit');

  console.log('• changing the preset keeps every video\'s checks in agreement');
  b = newBatch(3);
  const [q1, q2] = lib().batches[b].projectIds;
  check(lib().projects[q1].edits?.captions === true, 'new clips get explicit checks');
  setEdit(b, 'captions', false, [q1]);
  setPresetId(b, 'podcast');
  const ed = lib().batches[b].projectIds.map((id) => lib().projects[id].edits!);
  check(ed.every((e) => e.zoom === false && e.reframe === false), `podcast turns zoom and reframe off everywhere (${JSON.stringify(ed.map((e) => [e.zoom, e.reframe]))})`);
  check(lib().projects[q1].edits?.captions === false && lib().projects[q2].edits?.captions === true, 'per-video caption choice survives the preset change');
  setPresetId(b, 'punchy');
  check(lib().batches[b].projectIds.every((id) => lib().projects[id].edits!.zoom === true), 'punchy turns zoom back on everywhere');

  console.log('• framing math matches the engine (same numbers as CoreTests)');
  const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
  check(near(fitScale(1920, 1080, 1080, 1920), 0.5625), 'fit scale');
  check(near(fillUserScale(1920, 1080, 1080, 1920), 3.160493827), 'fill user scale');
  const c1 = clampPlacement({ scale: 1, offsetX: 0.9, offsetY: -0.9 }, 1920, 1080, 1080, 1920);
  check(near(c1.offsetX, 0.5) && near(c1.offsetY, -0.5), 'fit offsets clamp to ±0.5');
  check(near(clampPlacement({ scale: 3, offsetX: 0, offsetY: 9 }, 1920, 1080, 1080, 1920).offsetY, 1.5), 'zoomed pan limit');
  check(clampPlacement({ scale: 9, offsetX: 0, offsetY: 0 }, 1920, 1080, 1080, 1920).scale === MAX_SCALE, 'scale capped');
  check(clampPlacement({ scale: 0.2, offsetX: 0, offsetY: 0 }, 1920, 1080, 1080, 1920).scale === MIN_SCALE, 'scale floored');

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}
main();
