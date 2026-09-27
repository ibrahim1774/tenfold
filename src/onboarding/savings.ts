import type { MinutesPerVideo, VideosPerWeek } from '../state/onboarding';

// "About N hours back a month", from the two onboarding answers only.

export const WEEKS_PER_MONTH = 4.33;
/** Time to watch Tenfold's cut and fix anything, per video. */
export const CHECK_MINUTES = 2;

/** Each answer bucket as one number. Open-ended buckets use their lower bound, so the estimate stays low. */
export const VIDEOS_PER_WEEK: Record<VideosPerWeek, number> = { '1-2': 1.5, '3-5': 4, '6+': 6 };
export const MINUTES_PER_VIDEO: Record<MinutesPerVideo, number> = { under10: 5, '10-30': 20, '30-60': 45, '60+': 60 };

export type Payoff = {
  hours: number;
  videosPerWeek: number;
  minutesPerVideo: number;
  videosPerMonth: number;
  editingMinutes: number;
  savedMinutes: number;
  /** The maths, two caption lines. */
  lines: [string, string];
};

const round = (n: number) => Math.round(n);
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * hours = floor((videos a week × minutes a video × 4.33 − 2 min checking × videos a month) / 60), never below 0.
 * Null when either answer was skipped: we don't guess.
 */
export function computePayoff(videosPerWeek: VideosPerWeek | null, minutesPerVideo: MinutesPerVideo | null): Payoff | null {
  if (!videosPerWeek || !minutesPerVideo) return null;
  const v = VIDEOS_PER_WEEK[videosPerWeek];
  const m = MINUTES_PER_VIDEO[minutesPerVideo];
  const videosPerMonth = v * WEEKS_PER_MONTH;
  const editingMinutes = videosPerMonth * m;
  const savedMinutes = Math.max(0, editingMinutes - videosPerMonth * CHECK_MINUTES);
  const hours = Math.max(0, Math.floor(savedMinutes / 60));
  return {
    hours,
    videosPerWeek: v,
    minutesPerVideo: m,
    videosPerMonth,
    editingMinutes,
    savedMinutes,
    lines: [
      `${num(v)} videos a week × ${m} min × ${WEEKS_PER_MONTH} weeks = ${round(editingMinutes)} min editing a month`,
      `− ${CHECK_MINUTES} min checking each of ${round(videosPerMonth)} videos = ${round(savedMinutes)} min, ${hours} ${hours === 1 ? 'hour' : 'hours'}`,
    ],
  };
}
