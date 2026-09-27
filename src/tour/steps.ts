import type { TourScreen } from '../state/onboarding';

// Tour content and its state machine. Pure: no React, so the tests can run it on Node.

export type Rect = { x: number; y: number; width: number; height: number };

export type TourTargetId =
  | 'setup.clips'
  | 'setup.edits'
  | 'setup.generate'
  | 'editor.header'
  | 'editor.tools'
  | 'editor.editbar';

export type TourStep = {
  title: string;
  body: string;
  /** Targets whose measured rects this step needs. */
  targets: TourTargetId[];
  /** Turns the measured rects into the highlight. Default: the first target's rect. */
  area?: (rects: Record<string, Rect>, window: { width: number; height: number }) => Rect | null;
};

export const TOUR_STEPS: Record<TourScreen, TourStep[]> = {
  batchSetup: [
    {
      title: 'Your clips',
      body: 'Tap a clip to give it its own edits. A dot marks a clip that differs from the rest.',
      targets: ['setup.clips'],
    },
    {
      title: 'Edits for the whole batch',
      body: 'Captions, pause and filler cuts, retakes, zoom and reframe, switched on or off for every clip at once.',
      targets: ['setup.edits'],
    },
    {
      title: 'Generate',
      body: 'Tenfold edits the clips one after another on this iPhone. You check each video before it’s saved.',
      targets: ['setup.generate'],
    },
  ],
  editor: [
    {
      title: 'Timeline',
      body: 'Drag to scrub. Tap a section to select it, then split or delete it.',
      targets: ['editor.tools', 'editor.editbar'],
      // The timeline is the band between the tool bar and the Split / Delete row.
      area: (r, win) => {
        const tools = r['editor.tools'];
        const bar = r['editor.editbar'];
        if (!tools || !bar) return null;
        const top = tools.y + tools.height;
        const height = bar.y - top;
        return height > 24 ? { x: 8, y: top, width: win.width - 16, height } : bar;
      },
    },
    {
      title: 'Tools',
      body: 'Cuts, words, captions, zoom, frame and audio for this video.',
      targets: ['editor.tools'],
    },
    {
      title: 'Export',
      body: 'Export, top right, renders this video and saves it to Photos.',
      targets: ['editor.header'],
    },
  ],
};

export type TourState = { screen: TourScreen | null; index: number; done: boolean };
export type TourAction = { type: 'start'; screen: TourScreen } | { type: 'next' } | { type: 'back' } | { type: 'skip' };

export const initialTour: TourState = { screen: null, index: 0, done: false };

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case 'start':
      return { screen: action.screen, index: 0, done: false };
    case 'next': {
      if (!state.screen || state.done) return state;
      const last = TOUR_STEPS[state.screen].length - 1;
      return state.index >= last ? { ...state, done: true } : { ...state, index: state.index + 1 };
    }
    case 'back':
      return state.screen && !state.done ? { ...state, index: Math.max(0, state.index - 1) } : state;
    case 'skip':
      return state.screen ? { ...state, done: true } : state;
    default:
      return state;
  }
}

/** Area to highlight for a step, or null while its targets aren't measured yet. */
export function stepArea(step: TourStep, rects: Record<string, Rect>, win: { width: number; height: number }): Rect | null {
  if (step.area) return step.area(rects, win);
  return rects[step.targets[0]] ?? null;
}
