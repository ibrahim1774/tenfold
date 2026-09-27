import type { SFSymbol } from '../design/symbols';
import type { MinutesPerVideo, Role, VideosPerWeek } from '../state/onboarding';
import type { ContentType } from '../state/settings';

// The four onboarding questions: title, the one-line reason we ask, and the answers.

type Opt<T extends string> = { v: T; label: string; detail?: string; icon?: SFSymbol };

export const ROLE_Q = {
  title: 'Who’s behind the camera?',
  reason: 'Used to sum up your setup at the end. It stays on this iPhone.',
  options: [
    { v: 'creator', label: 'Creator', icon: 'person.crop.square' },
    { v: 'coach', label: 'Coach or educator', icon: 'graduationcap' },
    { v: 'brand', label: 'Brand or business', icon: 'building.2' },
    { v: 'agency', label: 'Agency', icon: 'person.3' },
    { v: 'seller', label: 'Seller', icon: 'bag' },
    { v: 'personal', label: 'Just me', icon: 'person' },
  ] as Opt<Role>[],
};

// "Product videos" is the existing `ads` content type (it maps to the Punchy preset).
export const MAKES_Q = {
  title: 'What do you make?',
  reason: 'Sets your starting cuts, captions and zoom. Choose all that apply.',
  options: [
    { v: 'talking', label: 'Talking to camera', detail: 'Tips, stories, opinions', icon: 'person.wave.2' },
    { v: 'podcast', label: 'Podcast clips', detail: 'Interviews and conversations', icon: 'mic' },
    { v: 'tutorial', label: 'Tutorials', detail: 'How-tos and explainers', icon: 'graduationcap' },
    { v: 'vlog', label: 'Vlogs', detail: 'Day in the life, travel', icon: 'camera' },
    { v: 'ads', label: 'Product videos', detail: 'Demos, reviews, offers', icon: 'shippingbox' },
  ] as Opt<ContentType>[],
};

export const PER_WEEK_Q = {
  title: 'How many videos a week?',
  reason: 'With the next answer, this estimates the editing time Tenfold saves you.',
  options: [
    { v: '1-2', label: '1–2' },
    { v: '3-5', label: '3–5' },
    { v: '6+', label: '6 or more' },
  ] as Opt<VideosPerWeek>[],
};

export const MINUTES_Q = {
  title: 'How long do you edit one video?',
  reason: 'Minutes from raw clip to ready to post. Used for the same estimate.',
  options: [
    { v: 'under10', label: 'Under 10 minutes' },
    { v: '10-30', label: '10–30 minutes' },
    { v: '30-60', label: '30–60 minutes' },
    { v: '60+', label: 'Over an hour' },
  ] as Opt<MinutesPerVideo>[],
};

export function labelOf<T extends string>(q: { options: Opt<T>[] }, v: T | null): string | null {
  return v ? (q.options.find((o) => o.v === v)?.label ?? null) : null;
}
