import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, PressableScale } from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import type { Batch, EditSelection, Project } from '@/engine/types';
import { setAllEdits, setEdit } from '@/state/batchSetup';

import { clipsDiffering, EDITS } from './edits';

const ROWS = [EDITS.slice(0, 3), EDITS.slice(3, 6)];

/**
 * Which edits run, for the whole batch: six chips in a 3×2 grid. A chip is on when every clip has that
 * edit, mixed when only some do. Per-clip changes live in the clip sheet (tap a clip).
 */
export function BatchEdits({ batch, clips, selections }: { batch: Batch; clips: Project[]; selections: EditSelection[] }) {
  const empty = clips.length === 0;
  const countOn = (key: (typeof EDITS)[number]['key']) => selections.filter((s) => s[key]).length;
  const everything = !empty && EDITS.every((e) => countOn(e.key) === clips.length);
  const differing = clipsDiffering(selections);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <AppText variant="title" accessibilityRole="header">
            Edits
          </AppText>
          <AppText variant="label" color={colors.textSecondary} numberOfLines={1} style={styles.titleHint}>
            (Select the edits you want)
          </AppText>
        </View>
        {!empty && (
          <Pressable
            hitSlop={6}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
            onPress={() => setAllEdits(batch.id, !everything)}
            accessibilityRole="button"
            accessibilityLabel={everything ? 'Clear all edits' : 'Select all edits'}>
            <AppText variant="chip" color={colors.textSecondary}>
              {everything ? 'Clear' : 'Select all'}
            </AppText>
          </Pressable>
        )}
      </View>

      <View style={styles.grid}>
        {ROWS.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((e) => {
              const n = countOn(e.key);
              const all = !empty && n === clips.length;
              const mixed = n > 0 && !all;
              return (
                <View key={e.key} style={styles.cell}>
                  <PressableScale
                    haptic="selection"
                    scaleTo={0.96}
                    disabled={empty}
                    // A mixed edit turns on for every clip (the usual tri-state rule).
                    onPress={() => setEdit(batch.id, e.key, !all)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: mixed ? 'mixed' : all, disabled: empty }}
                    accessibilityLabel={mixed ? `${e.label}, on for ${n} of ${clips.length} clips` : e.label}
                    accessibilityHint={e.detail}
                    style={[styles.chip, all && styles.on, mixed && styles.mixed, empty && styles.disabled]}>
                    {mixed && <SymbolView name="minus" size={12} weight="semibold" tintColor={colors.textPrimary} />}
                    <AppText variant="chip" numberOfLines={1} color={all ? colors.chipSelectedText : colors.chipText}>
                      {e.label}
                    </AppText>
                  </PressableScale>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {empty ? (
        <AppText variant="caption" color={colors.textMuted}>
          Add clips first.
        </AppText>
      ) : differing > 0 ? (
        <AppText variant="caption" color={colors.textSecondary} tabular>
          {differing} {differing === 1 ? 'clip differs' : 'clips differ'} · tap a clip to change it
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flexShrink: 1 },
  titleHint: { flexShrink: 1 },
  textButton: { minHeight: 32, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  pressed: { opacity: 0.6 },
  grid: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
  chip: {
    height: 44,
    borderRadius: radii.button,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.chipFill,
    // Transparent by default so the mixed state's outline doesn't shift the layout.
    borderWidth: 1,
    borderColor: 'transparent',
  },
  // On for every clip: white fill. On for some: a white outline and a minus.
  on: { backgroundColor: colors.chipSelectedFill, borderColor: colors.chipSelectedFill },
  mixed: { borderColor: colors.textSecondary },
  disabled: { opacity: 0.4 },
});
