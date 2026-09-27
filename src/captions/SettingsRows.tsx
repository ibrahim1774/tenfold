import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Toggle } from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';

// Grouped inset rows like iOS Settings (docs/DESIGN.md §5): hairline dividers, chevrons only on rows
// that navigate. Every row is at least 48 pt tall.

export function SettingsGroup({ label, footer, children }: { label?: string; footer?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.groupLabel}>
          {label.toUpperCase()}
        </AppText>
      ) : null}
      <View style={styles.group}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <View style={styles.divider} />}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.footer}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

/** A row that opens another screen: label, current value, chevron. */
export function NavRow({ label, value, onPress, hint }: { label: string; value: string; onPress: () => void; hint?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <AppText variant="body" style={styles.label}>
        {label}
      </AppText>
      <AppText variant="body" color={colors.textSecondary} numberOfLines={1} style={styles.value}>
        {value}
      </AppText>
      <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.textMuted} />
    </Pressable>
  );
}

export function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <AppText variant="body" style={styles.label}>
        {label}
      </AppText>
      <Toggle value={value} onChange={onChange} label={label} />
    </View>
  );
}

/** A row with a colour swatch; tapping it opens the colour choices. */
export function ColorRow({ label, color, open, onPress }: { label: string; color: string; open?: boolean; onPress: () => void }) {
  const none = color === 'transparent' || color === '';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${none ? 'none' : color}`}
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <AppText variant="body" style={styles.label}>
        {label}
      </AppText>
      <View style={[styles.swatch, none ? styles.swatchNone : { backgroundColor: color }]} />
    </Pressable>
  );
}

/** One choice in an inline list: a checkmark marks the current one. */
export function CheckRow({ label, checked, onPress, children }: { label: string; checked: boolean; onPress: () => void; children?: ReactNode }) {
  return (
    <Pressable
      onPress={() => {
        if (!checked) Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: checked }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {children ?? (
        <AppText variant="body" style={styles.label}>
          {label}
        </AppText>
      )}
      {checked ? <SymbolView name="checkmark" size={15} weight="semibold" tintColor={colors.accent} /> : <View style={styles.checkSpace} />}
    </Pressable>
  );
}

/** A label above a segmented control that spans the row. */
export function SegmentRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmentRow}>
      <AppText variant="body">{label}</AppText>
      <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                if (on) return;
                Haptics.selectionAsync();
                onChange(o.value);
              }}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ selected: on }}
              hitSlop={{ top: 4, bottom: 4 }}
              style={[styles.segmentItem, on && styles.segmentOn]}>
              <AppText variant="chip" color={on ? colors.textInverse : colors.textPrimary} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Free-form content inside a group (a stepper, a swatch grid), padded like a row. */
export function RowBody({ children }: { children: ReactNode }) {
  return <View style={styles.body}>{children}</View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  groupLabel: { marginLeft: spacing.lg, letterSpacing: 0.4 },
  footer: { marginHorizontal: spacing.lg },
  group: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg, backgroundColor: colors.borderStrong },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  pressed: { backgroundColor: colors.cardHigh },
  label: { flex: 1 },
  value: { flexShrink: 1, textAlign: 'right' },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong },
  swatchNone: { backgroundColor: colors.bg, borderStyle: 'dashed' },
  checkSpace: { width: 15 },
  segmentRow: { paddingHorizontal: spacing.lg, paddingVertical: 12, gap: spacing.sm },
  segment: { flexDirection: 'row', gap: 2, padding: 2, borderRadius: 10, backgroundColor: colors.bg },
  segmentItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 8 },
  segmentOn: { backgroundColor: colors.chipSelectedFill },
  body: { paddingHorizontal: spacing.lg, paddingVertical: 12, gap: spacing.md },
});
