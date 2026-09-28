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

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "45 min", "1 hour", "1 hour 5 min", "12 hours". Never "0 hours". */
export function formatMinutes(total: number): string {
  const min = Math.max(0, Math.round(total));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  const hours = `${h} ${h === 1 ? 'hour' : 'hours'}`;
  return r ? `${hours} ${r} min` : hours;
}

/** The payoff screen's headline: whole hours from one hour up, minutes below that. */
export function payoffHeadline(p: Pick<Payoff, 'hours' | 'savedMinutes'>): string {
  if (p.hours === 0) return `About ${formatMinutes(p.savedMinutes)} back a month`;
  return `About ${p.hours} ${p.hours === 1 ? 'hour' : 'hours'} back a month`;
}

/**
 * videos a month = round(videos a week × 4.33); saved = videos a month × (minutes a video − 2 min checking);
 * hours = floor(saved / 60). Rounding the videos first keeps every number shown adding up.
 * Null when either answer was skipped: we don't guess.
 */
export function computePayoff(videosPerWeek: VideosPerWeek | null, minutesPerVideo: MinutesPerVideo | null): Payoff | null {
  if (!videosPerWeek || !minutesPerVideo) return null;
  const v = VIDEOS_PER_WEEK[videosPerWeek];
  const m = MINUTES_PER_VIDEO[minutesPerVideo];
  const videosPerMonth = Math.round(v * WEEKS_PER_MONTH);
  const editingMinutes = videosPerMonth * m;
  const savedMinutes = Math.max(0, videosPerMonth * (m - CHECK_MINUTES));
  const hours = Math.floor(savedMinutes / 60);
  return {
    hours,
    videosPerWeek: v,
    minutesPerVideo: m,
    videosPerMonth,
    editingMinutes,
    savedMinutes,
    lines: [
      `${num(v)} videos a week × ${WEEKS_PER_MONTH} weeks ≈ ${videosPerMonth} videos a month`,
      `${videosPerMonth} × (${m} min editing − ${CHECK_MINUTES} min checking) = ${formatMinutes(savedMinutes)}`,
    ],
  };
}
