// Simulated native engine for exercising the JS batch queue on Node.
type Listener = (e: any) => void;
const listeners: Record<string, Listener[]> = {};
export const calls: { fn: string; id?: string; t: number }[] = [];
export const running = { analyze: 0, export: 0, maxAnalyze: 0, maxExport: 0 };
export const control = {
  failAnalyze: new Set<string>(),
  analyzeMs: 15,
  exportMs: 15,
  thermal: 'nominal' as string,
  cancelled: new Set<string>(),
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const Engine = {
  async analyze(id: string, _o: any) {
    calls.push({ fn: 'analyze', id, t: Date.now() });
    running.analyze++;
    running.maxAnalyze = Math.max(running.maxAnalyze, running.analyze);
    try {
      for (const stage of ['extractingAudio', 'transcribing', 'detecting', 'planning']) {
        (listeners.onJobProgress ?? []).forEach((l) => l({ projectId: id, stage, fraction: 0.5 }));
        await sleep(control.analyzeMs / 4);
        if (control.cancelled.has(id)) throw new Error('CancellationError');
      }
      if (control.failAnalyze.has(id)) throw new Error('Error: Transcription failed: test');
      return {
        version: 1,
        media: { durationSec: 10, width: 1080, height: 1920, fps: 30, isHDR: false, hasAudio: true },
        transcript: { words: [{ text: 'hi', start: 0, end: 0.3, confidence: 1, isFiller: false }], language: 'en', engine: 'apple', wordTimingIsExact: true, stats: { runCount: 1, singleWordRunRatio: 1, lexicalFillerCount: 0, elapsedSec: 0.1 } },
        envelopeDb: [], noiseFloorDb: -60, speechThresholdDb: -38, speechCoverage: 0.8, noSpeech: false,
        cuts: [{ id: 's1', start: 1, end: 2, reason: 'silence', accepted: true, confidence: 1 }],
        faces: [], warnings: [],
      };
    } finally {
      running.analyze--;
    }
  },
  async export(id: string, doc: any, opts: any) {
    calls.push({ fn: 'export', id, t: Date.now() });
    if (!doc || !doc.cuts) throw new Error('no doc');
    running.export++;
    running.maxExport = Math.max(running.maxExport, running.export);
    try {
      await sleep(control.exportMs);
      if (control.cancelled.has(id)) throw new Error('CancellationError');
      return { uri: `file:///exports/${id}.mp4`, savedToPhotos: true, photosDenied: false, durationSec: 9, elapsedSec: 0.1, watermark: opts.watermark };
    } finally {
      running.export--;
    }
  },
  async cancel(id: string) {
    control.cancelled.add(id);
  },
  setKeepAwake: async (_on: boolean) => {},
  thermalState: () => control.thermal,
  isLowPowerMode: () => false,
};

export const EngineEvents = {
  onJobProgress: (cb: Listener) => {
    (listeners.onJobProgress ??= []).push(cb);
    return { remove() {} };
  },
};
