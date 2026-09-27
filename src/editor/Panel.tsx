import { SymbolView } from 'expo-symbols';
import { Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText, Card, PressableScale } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, motion, radii, spacing } from '@/design/tokens';

/**
 * One structure for every editor tool: title (20), one line of explanation (13, muted), then controls.
 * `animate` fades the panel in quickly when a tool is opened by a tap (docs/DESIGN.md §4).
 */
export function Panel({ title, detail, children, animate = true }: { title: string; detail?: string; children?: ReactNode; animate?: boolean }) {
  const body = (
    <Card style={styles.card}>
      <View style={styles.head}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {detail ? (
          <AppText variant="label" color={colors.textMuted}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {children}
    </Card>
  );
  return animate ? <Animated.View entering={FadeIn.duration(motion.fast)}>{body}</Animated.View> : body;
}

/** Small uppercase group label, as above an iOS Settings group. */
export function GroupLabel({ children }: { children: string }) {
  return (
    <AppText variant="caption" color={colors.textMuted} style={styles.groupLabel}>
      {children.toUpperCase()}
    </AppText>
  );
}

export type InfoRow = { label: string; value: string };

/** Grouped inset rows with hairline dividers (read-only facts, so no chevrons). */
export function RowGroup({ rows }: { rows: InfoRow[] }) {
  return (
    <View style={styles.group}>
      {rows.map((r, i) => (
        <Fragment key={r.label}>
          {i > 0 && <View style={styles.divider} />}
          <View style={styles.row} accessible accessibilityLabel={`${r.label}: ${r.value}`}>
            <AppText variant="body" color={colors.textSecondary} style={styles.rowLabel}>
              {r.label}
            </AppText>
            <AppText variant="body" tabular style={styles.rowValue}>
              {r.value}
            </AppText>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

/** Placeholder rows in the shape of a RowGroup, while the facts load. */
export function RowGroupSkeleton({ count }: { count: number }) {
  return (
    <View style={styles.group}>
      {Array.from({ length: count }).map((_, i) => (
        <Fragment key={i}>
          {i > 0 && <View style={styles.divider} />}
          <View style={styles.row}>
            <View style={[styles.bone, { width: 110 }]} />
            <View style={[styles.bone, { width: 70 }]} />
          </View>
        </Fragment>
      ))}
    </View>
  );
}

export type ToolId = 'cuts' | 'words' | 'captions' | 'text' | 'zoom' | 'crop' | 'audio';

/** Tools that open a screen of their own instead of a panel (plain buttons, never selected). */
const OPENS_SCREEN: ToolId[] = ['captions', 'text'];

/**
 * The editor's tool row. The open tool sits on a raised fill so it reads as selected at a glance;
 * Captions and Text open their own screens, so they are plain buttons that never stay selected.
 */
export function ToolBar({ tools, active, onPress }: { tools: { id: ToolId; icon: SFSymbol; label: string }[]; active: ToolId | null; onPress: (id: ToolId) => void }) {
  return (
    <View style={styles.tools} accessibilityRole="tablist">
      {tools.map((t) => {
        const on = active === t.id;
        return (
          <PressableScale
            key={t.id}
            haptic={false}
            scaleTo={0.94}
            onPress={() => onPress(t.id)}
            accessibilityRole={OPENS_SCREEN.includes(t.id) ? 'button' : 'tab'}
            accessibilityLabel={t.label}
            accessibilityState={OPENS_SCREEN.includes(t.id) ? undefined : { selected: on }}
            style={[styles.tool, on && styles.toolOn]}>
            <SymbolView name={t.icon} size={22} weight="regular" tintColor={on ? colors.textPrimary : colors.textSecondary} />
            <AppText variant="caption" color={on ? colors.textPrimary : colors.textSecondary} numberOfLines={1} style={styles.toolLabel}>
              {t.label}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

export type BarAction = { id: string; icon: SFSymbol; label: string; onPress: () => void; disabled?: boolean; danger?: boolean };

/**
 * The tool row's contextual form: what can be done to the selected thing (a caption), laid out like the
 * tool row so the bar doesn't jump when the selection changes.
 */
export function ActionBar({ actions, label }: { actions: BarAction[]; label: string }) {
  return (
    <View style={styles.tools} accessibilityRole="toolbar" accessibilityLabel={label}>
      {actions.map((a) => {
        const tint = a.disabled ? colors.textMuted : a.danger ? colors.danger : colors.textPrimary;
        return (
          <PressableScale
            key={a.id}
            haptic={false}
            scaleTo={0.94}
            disabled={a.disabled}
            onPress={a.onPress}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            accessibilityState={{ disabled: a.disabled }}
            style={[styles.tool, a.disabled && styles.toolOff]}>
            <SymbolView name={a.icon} size={22} weight="regular" tintColor={tint} />
            <AppText variant="caption" color={tint} numberOfLines={1} style={styles.toolLabel}>
              {a.label}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  toolOff: { opacity: 0.5 },
  card: { gap: spacing.lg },
  head: { gap: 2 },
  groupLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: spacing.lg, letterSpacing: 0.4 },
  group: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  rowLabel: { flexShrink: 0 },
  rowValue: { flexShrink: 1, textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg, backgroundColor: colors.borderStrong },
  bone: { height: 12, borderRadius: 6, backgroundColor: colors.cardHigh },
  tools: { flexDirection: 'row', gap: 2 },
  tool: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: radii.tile, borderCurve: 'continuous', paddingHorizontal: 2 },
  toolOn: { backgroundColor: colors.cardHigh },
  toolLabel: { fontSize: 11, lineHeight: 13 },
});
