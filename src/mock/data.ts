import type { Batch, Cut, Project, Word } from '../engine/types';
import { batchPreset } from '../state/presets';

// M0 mock data so every screen renders before the engine exists. Removed in M1/M4.

const titles = [
  'Morning routine hook',
  '3 tips for creators',
  'Why I quit my job',
  'Studio tour',
  'Q&A part 1',
  'Q&A part 2',
  'Product teaser',
  'Behind the scenes',
  'Weekly recap',
  'Hot take: editing',
];

const stages = ['Transcribing', 'Cutting silences', 'Planning zooms', 'Rendering captions', 'Exporting'];

export const mockProjects: Project[] = titles.map((title, i) => ({
  id: `p${i + 1}`,
  batchId: 'b1',
  title,
  durationSec: 38 + ((i * 17) % 70),
  width: 1080,
  height: 1920,
  fps: i % 3 === 0 ? 60 : 30,
  isHDR: i % 2 === 0,
  hasAudio: true,
  status: i < 3 ? 'ready' : i < 5 ? 'analyzing' : 'queued',
  stage: i < 3 ? undefined : i < 5 ? stages[i - 3] : undefined,
  progress: i < 3 ? 1 : i < 5 ? 0.35 + (i - 3) * 0.3 : 0,
  thumbSeed: i,
}));

export const mockBatches: Batch[] = [
  {
    id: 'b1',
    createdAt: Date.now() - 1000 * 60 * 42,
    title: 'Creator tips, week 12',
    preset: batchPreset('cleanTalk'),
    projectIds: mockProjects.map((p) => p.id),
    status: 'processing',
  },
  {
    id: 'b2',
    createdAt: Date.now() - 1000 * 60 * 60 * 26,
    title: 'Podcast clips',
    preset: batchPreset('podcast'),
    projectIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    status: 'exported',
  },
  {
    id: 'b3',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
    title: 'Launch week',
    preset: batchPreset('punchy'),
    projectIds: ['p6', 'p7', 'p8'],
    status: 'ready',
  },
];

const sentence =
  'So um today I want to show you the three things that like completely changed how I edit my videos you know and the first one is batching';

let t = 0.4;
export const mockWords: Word[] = sentence.split(' ').map((text) => {
  const isFiller = ['um', 'like', 'you', 'know'].includes(text);
  const dur = 0.18 + (text.length % 5) * 0.05;
  const w: Word = { text, start: t, end: t + dur, confidence: 0.94, isFiller };
  t += dur + (text === 'videos' ? 0.6 : 0.06);
  return w;
});

export const mockCuts: Cut[] = [
  { id: 'c1', start: 0, end: 0.38, reason: 'silence', accepted: true, confidence: 1 },
  ...mockWords
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.isFiller)
    .map(({ w, i }) => ({
      id: `f${i}`,
      start: w.start - 0.03,
      end: w.end + 0.03,
      reason: 'filler' as const,
      accepted: w.text !== 'like',
      confidence: w.text === 'like' ? 0.6 : 0.95,
    })),
];

/** Source duration of the mock transcript clip, used by the editor timeline. */
export const mockClipDuration = Math.ceil(t + 0.6);

export type Segment = { start: number; end: number };

/** Inverts accepted cuts into keep segments (JS mirror of CutPlanner for the M0 mock). */
export function keepSegments(cuts: Cut[], duration: number): Segment[] {
  const accepted = cuts.filter((c) => c.accepted).sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let cursor = 0;
  for (const c of accepted) {
    if (c.start > cursor + 0.18) out.push({ start: cursor, end: c.start });
    cursor = Math.max(cursor, c.end);
  }
  if (duration > cursor + 0.18) out.push({ start: cursor, end: duration });
  return out;
}

/** Groups words into caption cards (JS mirror of CaptionGrouper for the M0 mock). */
export function captionCards(words: Word[], maxWords = 4): { text: string; start: number; end: number }[] {
  const cards: { text: string; start: number; end: number }[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) cards.push({ text: cur.map((w) => w.text).join(' '), start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  words.forEach((w, i) => {
    const gap = i > 0 ? w.start - words[i - 1].end : 0;
    if (cur.length >= maxWords || gap >= 0.35) flush();
    cur.push(w);
  });
  flush();
  return cards;
}

export function timeAgo(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function projectsForBatch(batch: Batch): Project[] {
  return batch.projectIds.map((id) => mockProjects.find((p) => p.id === id)).filter((p): p is Project => !!p);
}
