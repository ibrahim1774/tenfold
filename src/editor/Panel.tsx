import { SymbolView } from 'expo-symbols';
import { Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, PressableScale } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, radii, spacing } from '@/design/tokens';

/**
 * One structure for every editor tool: title (20), one line of explanation (13, secondary), then controls.
 * No entrance fade: panels hold glass buttons, and glass doesn't draw under a parent that starts at
 * opacity 0. `animate` is kept for call sites and has no effect.
 */
export function Panel({ title, detail, children }: { title: string; detail?: string; children?: ReactNode; animate?: boolean }) {
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {detail ? (
          <AppText variant="label" color={colors.textSecondary}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

/** Sentence-case label above an inset group (iOS 26 grouped lists). */
export function GroupLabel({ children }: { children: string }) {
  return (
    <AppText variant="label" color={colors.textSecondary} style={styles.groupLabel} accessibilityRole="header">
      {children}
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
 * The editor's tool row: each icon on its own dark rounded tile, label underneath. The open tool's tile is lighter;
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
            style={styles.tool}>
            <View style={[styles.tile, on && styles.tileOn]}>
              <SymbolView name={t.icon} size={19} weight={on ? 'medium' : 'regular'} tintColor={on ? colors.textPrimary : colors.textSecondary} />
            </View>
            <AppText variant="caption" color={on ? colors.textPrimary : colors.textSecondary} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.toolLabel}>
              {t.label}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** `on` marks a switch that is on (Loop, Ducking, Mute) with the same raised fill as an open tool. */
export type BarAction = { id: string; icon: SFSymbol; label: string; onPress: () => void; disabled?: boolean; danger?: boolean; on?: boolean };

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
            accessibilityRole={a.on === undefined ? 'button' : 'switch'}
            accessibilityLabel={a.label}
            accessibilityState={a.on === undefined ? { disabled: a.disabled } : { disabled: a.disabled, checked: a.on }}
            style={[styles.tool, a.disabled && styles.toolOff]}>
            <View style={[styles.tile, a.on && styles.tileOn]}>
              <SymbolView name={a.icon} size={19} weight={a.on ? 'medium' : 'regular'} tintColor={tint} />
            </View>
            <AppText variant="caption" color={tint} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.toolLabel}>
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
  groupLabel: { marginTop: spacing.xl, marginBottom: spacing.sm, marginLeft: spacing.lg },
  group: { backgroundColor: colors.card, borderRadius: radii.card, borderCurve: 'continuous', overflow: 'hidden' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  rowLabel: { flexShrink: 0 },
  rowValue: { flexShrink: 1, textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg, backgroundColor: colors.separator },
  bone: { height: 12, borderRadius: 6, backgroundColor: colors.cardHigh },
  tools: { flexDirection: 'row', gap: spacing.xs },
  tool: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 2 },
  // Each icon sits on its own dark rounded tile, label underneath (the user's reference, 2026-09-29).
  tile: { width: 42, height: 42, borderRadius: 13, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  tileOn: { backgroundColor: '#3A3A3C' },
  toolLabel: { textAlign: 'center' },
});
