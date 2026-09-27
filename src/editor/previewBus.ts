import { create } from 'zustand';

// Lets a sheet over the editor (captions, voiceover) ask the editor's live preview to do something.
// The editor handles a request once and clears it.

export type PreviewRequest =
  | { kind: 'captionSample'; seconds: number; nonce: number }
  /** Play from `at` (output seconds), or pause. The voiceover sheet plays the video while recording. */
  | { kind: 'play'; playing: boolean; at?: number; nonce: number };

type Bus = { request: PreviewRequest | null };

export const usePreviewBus = create<Bus>(() => ({ request: null }));

let nonce = 0;

/** Seek to the first caption and play for `seconds`. */
export function playCaptionSample(seconds = 3) {
  nonce += 1;
  usePreviewBus.setState({ request: { kind: 'captionSample', seconds, nonce } });
}

/** Play the preview from `at`, or pause it. */
export function setPreviewPlaying(playing: boolean, at?: number) {
  nonce += 1;
  usePreviewBus.setState({ request: { kind: 'play', playing, at, nonce } });
}

export function clearPreviewRequest() {
  usePreviewBus.setState({ request: null });
}
