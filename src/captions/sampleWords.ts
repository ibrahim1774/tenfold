import { useEffect, useState } from 'react';

import { Engine } from '../engine';

/** Two real words from the video's transcript for style samples (a stock pair until it loads). */
export function useSampleWords(projectId?: string): [string, string] {
  const [words, setWords] = useState<[string, string]>(['Ten', 'videos']);
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    Engine.getAnalysis(projectId)
      .then((a) => {
        const clean = (a.transcript?.words ?? []).map((w) => w.text.replace(/[.,!?;:"“”]/g, '')).filter((t) => t.length >= 2 && t.length <= 8);
        if (alive && clean.length >= 2) setWords([clean[0], clean[1]]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId]);
  return words;
}
