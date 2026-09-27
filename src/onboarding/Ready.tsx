import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/components';
import { colors, spacing } from '@/design/tokens';
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

export function Ready() {
  const summary = useSetupSummary();
  return (
    <View style={styles.wrap}>
      <AppText variant="display" accessibilityRole="header">
        Your first batch is ready to make.
      </AppText>
      <AppText variant="body" color={colors.textSecondary}>
        {summary}
      </AppText>
      <AppText variant="label" color={colors.textMuted}>
        You can change the preset before each batch, and in Settings.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.gutter, gap: spacing.md },
});
