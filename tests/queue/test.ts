import { calls, control, running } from './mockEngine';
import { AppState } from './rnMock';
import { cancelBatch, queueExports, retryProject, setPaused, startBatch, startQueue, useQueueUI } from '@/batch/queue';
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

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}
main();
