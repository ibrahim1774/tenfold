import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Toggle } from '@/design/components';
import { spacing } from '@/design/tokens';
import { themedStyles, useScheme, useTheme } from '@/design/theme';

// Grouped inset rows like iOS Settings (docs/DESIGN.md §5): a borderless graphite group, hairlines that
// start at the text inset, sentence-case headers, chevrons only on rows that navigate. Rows are 48 pt or taller.

export function SettingsGroup({ label, footer, children }: { label?: string; footer?: string; children: ReactNode }) {
  const colors = useTheme();
  const styles = themed[useScheme()];
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="label" color={colors.textSecondary} style={styles.groupLabel} accessibilityRole="header">
          {label}
        </AppText>
      ) : null}
      <Card padded={false}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <View style={styles.divider} />}
            {row}
          </Fragment>
        ))}
      </Card>
      {footer ? (
        <AppText variant="label" color={colors.textMuted} style={styles.footer}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

/** A row that opens another screen: label, current value, chevron. */
export function NavRow({ label, value, onPress, hint }: { label: string; value: string; onPress: () => void; hint?: string }) {
  const colors = useTheme();
  const styles = themed[useScheme()];
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
  const styles = themed[useScheme()];
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
  const styles = themed[useScheme()];
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
  const colors = useTheme();
  const styles = themed[useScheme()];
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
  const colors = useTheme();
  const styles = themed[useScheme()];
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
              hitSlop={{ top: 6, bottom: 6 }}
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

/** A read-only fact: label on the left, value on the right (no chevron, nothing to tap). */
export function ValueRow({ label, value }: { label: string; value: string }) {
  const colors = useTheme();
  const styles = themed[useScheme()];
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="body" style={styles.factLabel}>
        {label}
      </AppText>
      <AppText variant="body" tabular color={colors.textSecondary} style={styles.value}>
        {value}
      </AppText>
    </View>
  );
}

/** Placeholder in the shape of a ValueRow while the facts load. */
export function ValueRowSkeleton() {
  const styles = themed[useScheme()];
  return (
    <View style={styles.row}>
      <View style={[styles.bone, styles.boneLabel]} />
      <View style={styles.label} />
      <View style={[styles.bone, styles.boneValue]} />
    </View>
  );
}

/** Free-form content inside a group (a stepper, a swatch grid), padded like a row. */
export function RowBody({ children }: { children: ReactNode }) {
  const styles = themed[useScheme()];
  return <View style={styles.body}>{children}</View>;
}

const themed = themedStyles((colors) => ({
  wrap: { gap: spacing.sm },
  groupLabel: { marginLeft: spacing.lg },
  footer: { marginHorizontal: spacing.lg },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg, backgroundColor: colors.separator },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  pressed: { backgroundColor: colors.cardHigh },
  label: { flex: 1 },
  factLabel: { flexShrink: 0 },
  value: { flexShrink: 1, textAlign: 'right' },
  // A hairline edge so black and dark swatches still read on graphite.
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  swatchNone: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed' },
  checkSpace: { width: 15 },
  segmentRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  segment: { flexDirection: 'row', gap: 2, padding: 2, borderRadius: 9, borderCurve: 'continuous', backgroundColor: colors.cardHigh },
  segmentItem: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 7, borderCurve: 'continuous' },
  segmentOn: { backgroundColor: colors.chipSelectedFill },
  body: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  bone: { height: 12, borderRadius: 6, backgroundColor: colors.cardHigh },
  boneLabel: { width: 110 },
  boneValue: { width: 70 },
}));
