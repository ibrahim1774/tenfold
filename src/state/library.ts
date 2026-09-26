import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Analysis, Batch, BatchPreset, BatchStatus, EditDocument, EditSelection, ImportedAsset, Project } from '../engine/types';
import { batchAspect, defaultEdits, editsForPreset, effectiveLevels, effectiveZoom } from '../batch/edits';
import { persistStorage } from './storage';

// Batches, projects and edit documents. Heavy per-project data (source video, transcript,
// envelope, exports) lives in the native project folder; this store keeps the index.

type LibraryState = {
  batches: Record<string, Batch>;
  projects: Record<string, Project>;
  docs: Record<string, EditDocument>;
  createBatch: (assets: ImportedAsset[], preset: BatchPreset) => string;
  addToBatch: (batchId: string, assets: ImportedAsset[]) => void;
  removeProject: (projectId: string) => void;
  deleteBatch: (batchId: string) => void;
  updateBatch: (batchId: string, patch: Partial<Batch>) => void;
  updateProject: (projectId: string, patch: Partial<Project>) => void;
  setDoc: (projectId: string, doc: EditDocument) => void;
};

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      batches: {},
      projects: {},
      docs: {},
      createBatch: (assets, preset) => {
        const id = `b${Date.now().toString(36)}`;
        const now = Date.now();
        const ok = assets.filter((a) => !a.error);
        const projects: Record<string, Project> = {};
        ok.forEach((a, i) => {
          projects[a.projectId] = {
            id: a.projectId,
            batchId: id,
            title: cleanTitle(a.title, i),
            posterUri: a.posterUri,
            media: a.media,
            status: 'pending',
            progress: 0,
            edits: editsForPreset(preset),
            createdAt: now + i,
          };
        });
        const title = defaultTitle(now);
        set((s) => ({
          batches: {
            ...s.batches,
            [id]: { id, createdAt: now, title, preset, captionsOff: false, projectIds: ok.map((a) => a.projectId), paused: false },
          },
          projects: { ...s.projects, ...projects },
        }));
        return id;
      },
      addToBatch: (batchId, assets) =>
        set((s) => {
          const batch = s.batches[batchId];
          if (!batch) return s;
          const ok = assets.filter((a) => !a.error && !batch.projectIds.includes(a.projectId));
          const projects = { ...s.projects };
          ok.forEach((a, i) => {
            projects[a.projectId] = {
              id: a.projectId,
              batchId,
              title: cleanTitle(a.title, batch.projectIds.length + i),
              posterUri: a.posterUri,
              media: a.media,
              status: 'pending',
              progress: 0,
              // New clips join with the same checks as the rest of the batch.
              edits: editsForPreset(batch.preset, batch.captionsOff),
              createdAt: Date.now() + i,
            };
          });
          return {
            projects,
            batches: { ...s.batches, [batchId]: { ...batch, projectIds: [...batch.projectIds, ...ok.map((a) => a.projectId)] } },
          };
        }),
      removeProject: (projectId) =>
        set((s) => {
          const p = s.projects[projectId];
          if (!p) return s;
          const { [projectId]: _p, ...projects } = s.projects;
          const { [projectId]: _d, ...docs } = s.docs;
          const batch = s.batches[p.batchId];
          return {
            projects,
            docs,
            batches: batch
              ? { ...s.batches, [batch.id]: { ...batch, projectIds: batch.projectIds.filter((x) => x !== projectId) } }
              : s.batches,
          };
        }),
      deleteBatch: (batchId) =>
        set((s) => {
          const batch = s.batches[batchId];
          if (!batch) return s;
          const projects = { ...s.projects };
          const docs = { ...s.docs };
          batch.projectIds.forEach((id) => {
            delete projects[id];
            delete docs[id];
          });
          const { [batchId]: _b, ...batches } = s.batches;
          return { batches, projects, docs };
        }),
      updateBatch: (batchId, patch) =>
        set((s) => (s.batches[batchId] ? { batches: { ...s.batches, [batchId]: { ...s.batches[batchId], ...patch } } } : s)),
      updateProject: (projectId, patch) =>
        set((s) => (s.projects[projectId] ? { projects: { ...s.projects, [projectId]: { ...s.projects[projectId], ...patch } } } : s)),
      setDoc: (projectId, doc) => set((s) => ({ docs: { ...s.docs, [projectId]: doc } })),
    }),
    { name: 'tenfold.library', storage: persistStorage, version: 1 },
  ),
);

function cleanTitle(title: string, i: number) {
  const t = title.replace(/\.[a-z0-9]+$/i, '').replace(/^IMG_/, 'Clip ');
  return t.length > 0 ? t : `Clip ${i + 1}`;
}

function defaultTitle(ms: number) {
  const d = new Date(ms);
  return `Batch · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export function projectsOf(batch: Batch, projects: Record<string, Project>): Project[] {
  return batch.projectIds.map((id) => projects[id]).filter((p): p is Project => !!p);
}

export function batchStatus(batch: Batch, projects: Record<string, Project>): BatchStatus {
  const ps = projectsOf(batch, projects);
  if (!batch.startedAt) return 'setup';
  if (ps.length > 0 && ps.every((p) => p.status === 'done')) return 'exported';
  if (ps.some((p) => ['queued', 'analyzing', 'exportQueued', 'exporting'].includes(p.status))) return 'processing';
  return 'ready';
}

/** Initial edit document from the analysis's suggested cuts and the batch preset. */
/** The edit document Tenfold generates for a video: its analysis, the batch style, and its edit selection. */
export function docFromAnalysis(analysis: Analysis, batch: Batch, edits: EditSelection = defaultEdits(batch)): EditDocument {
  const aspect = batchAspect(batch.preset);
  return {
    version: 1,
    cuts: analysis.cuts,
    wordOverrides: [],
    captions: { ...batch.preset.captions, enabled: edits.captions && !!analysis.transcript?.words.length },
    zoom: { ...batch.preset.zoom, mode: effectiveZoom(batch.preset, edits) },
    // Reframe = automatic framing (fill + follow the speaker) in the batch ratio; off = the clip's own shape.
    crop: edits.reframe ? { auto916: aspect === '9:16', aspect } : { auto916: false, aspect: 'original' },
    audio: batch.preset.audio,
    levels: effectiveLevels(batch.preset, edits),
  };
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function timeAgo(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
