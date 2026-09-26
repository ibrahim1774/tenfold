import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Thumb, Toggle, seedOf } from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import type { Batch, EditKey, Project } from '@/engine/types';
import { setAllEdits, setEdit } from '@/state/batchSetup';
import { formatDuration } from '@/state/library';

import { EDITS, editsOf } from './edits';

/**
 * Which edits run, per video. The top block switches an edit for every video; each video row below
 * has its own checks. What's checked here is exactly what Generate does.
 */
export function EditsChecklist({ batch, clips }: { batch: Batch; clips: Project[] }) {
  const selections = clips.map((c) => editsOf(c, batch));
  const countOn = (key: EditKey) => selections.filter((s) => s[key]).length;
  const everything = clips.length > 0 && EDITS.every((e) => countOn(e.key) === clips.length);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <AppText variant="section">Edits</AppText>
        {clips.length > 0 && (
          <Pressable
            hitSlop={10}
            onPress={() => setAllEdits(batch.id, !everything)}
            accessibilityRole="button"
            accessibilityLabel={everything ? 'Clear all edits' : 'Select all edits'}>
            <AppText variant="label" color={colors.textSecondary}>
              {everything ? 'Clear all' : 'Select all'}
            </AppText>
          </Pressable>
        )}
      </View>

      <View style={styles.card}>
        {EDITS.map((e, i) => {
          const n = countOn(e.key);
          const all = clips.length > 0 && n === clips.length;
          const mixed = n > 0 && !all;
          return (
            <View key={e.key} style={[styles.row, i < EDITS.length - 1 && styles.divider]}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{e.label}</AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {e.detail}
                </AppText>
              </View>
              {mixed && (
                <AppText variant="caption" color={colors.textSecondary} style={styles.tabular}>
                  {n} of {clips.length}
                </AppText>
              )}
              <Toggle value={all} label={`${e.label} for every video`} onChange={(v) => setEdit(batch.id, e.key, v)} disabled={clips.length === 0} />
            </View>
          );
        })}
      </View>

      {clips.length > 1 && (
        <>
          <AppText variant="label" color={colors.textMuted} style={styles.subhead}>
            PER VIDEO
          </AppText>
          <View style={styles.card}>
            {clips.map((c, i) => {
              const sel = selections[i];
              return (
                <View key={c.id} style={[styles.video, i < clips.length - 1 && styles.divider]}>
                  <Thumb seed={seedOf(c.id)} uri={c.posterUri} style={styles.thumb} />
                  <View style={styles.flex}>
                    <View style={styles.titleRow}>
                      <AppText variant="chip" numberOfLines={1} style={styles.flex}>
                        {c.title}
                      </AppText>
                      <AppText variant="caption" color={colors.textMuted} style={styles.tabular}>
                        {formatDuration(c.media?.durationSec ?? 0)}
                      </AppText>
                    </View>
                    <View style={styles.checks}>
                      {EDITS.map((e) => (
                        <CheckPill
                          key={e.key}
                          label={e.label}
                          on={sel[e.key]}
                          onPress={() => setEdit(batch.id, e.key, !sel[e.key], [c.id])}
                        />
                      ))}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

function CheckPill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.pill, on ? styles.pillOn : styles.pillOff, pressed && styles.pressed]}>
      {on && <SymbolView name="checkmark" size={10} weight="bold" tintColor={colors.textInverse} />}
      <AppText variant="caption" color={on ? colors.textInverse : colors.textSecondary}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  flex: { flex: 1 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  subhead: { letterSpacing: 0.8, marginTop: spacing.sm, paddingHorizontal: 4 },
  card: {
    borderRadius: radii.card,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)' },
  tabular: { fontVariant: ['tabular-nums'] },
  video: { flexDirection: 'row', gap: 12, padding: 12 },
  thumb: { width: 44, height: 64, borderRadius: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 10, borderRadius: 13 },
  pillOn: { backgroundColor: '#FFFFFF' },
  pillOff: { borderWidth: 1, borderColor: colors.borderStrong },
  pressed: { opacity: 0.7 },
});
