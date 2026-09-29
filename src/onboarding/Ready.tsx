import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/components';
import { TakesWall } from '@/design/TakesWall';
import { light, spacing } from '@/design/tokens';
import { useOnboarding } from '@/state/onboarding';
import { PRESET_OPTIONS } from '@/state/presets';
import { useSettings } from '@/state/settings';

import { labelOf, MAKES_Q, PER_WEEK_Q, ROLE_Q } from './questions';

/** One line with what was chosen; skipped answers are left out. */
export function useSetupSummary(): string {
  const { role, videosPerWeek } = useOnboarding();
  const { contentTypes, defaultPreset } = useSettings();
  const preset = PRESET_OPTIONS.find((p) => p.id === defaultPreset)?.name ?? 'Clean talk';
  const makes = MAKES_Q.options.filter((o) => contentTypes.includes(o.v)).map((o) => o.label);
  const perWeek = labelOf(PER_WEEK_Q, videosPerWeek);
  return [
    labelOf(ROLE_Q, role),
    makes.length ? makes.join(', ') : null,
    perWeek ? `${perWeek} videos a week` : null,
    `${preset} preset`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Last step: the batch wall again, now framed as theirs, and one line of what was set up. */
export function Ready() {
  const summary = useSetupSummary();
  return (
    <View style={styles.flex}>
      <TakesWall badges={false} label="A batch of finished videos" style={styles.flex} />
      <View style={styles.text}>
        <AppText variant="display" accessibilityRole="header">
          Your first batch is ready to make.
        </AppText>
        <AppText variant="label" color={light.textSecondary} numberOfLines={2}>
          {summary}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  text: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.sm },
});
