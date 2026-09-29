import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/components';
import { spacing } from '@/design/tokens';
import { Engine } from '@/engine';

import { CAPTION_COLORS, MORE_CAPTION_COLORS } from './presets';
import { useRecentColors } from './recentColors';
import { themedStyles, useScheme, useTheme } from '@/design/theme';

const NAMES: Record<string, string> = {
  '#FFE14D': 'Yellow',
  '#7C4DFF': 'Violet',
  '#FF3DCB': 'Pink',
  '#4DD8FF': 'Cyan',
  '#FF7A59': 'Coral',
  '#5BE3A5': 'Green',
  '#FFFFFF': 'White',
  '#000000': 'Black',
};

/**
 * Inline colour choices under a colour row: recent colours, the caption palette, and the system colour
 * picker ("Other colour"). Builds without the picker get a larger swatch grid instead.
 */
export function ColorChoices({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  const colors = useTheme();
  const styles = themed[useScheme()];
  const recent = useRecentColors((s) => s.colors);
  const add = useRecentColors((s) => s.add);
  // Checked once per open: a build either has the picker or it doesn't.
  const [native] = useState(() => Engine.canPickColor());
  const [error, setError] = useState<string | null>(null);

  const pick = (hex: string) => {
    add(hex);
    onPick(hex);
  };

  const openPicker = async () => {
    try {
      setError(null);
      const hex = await Engine.pickColor(value.startsWith('#') ? value : '#FFFFFF');
      if (hex) pick(hex);
    } catch {
      setError('Couldn’t open the colour picker. Choose a colour above.');
    }
  };

  const palette = native ? CAPTION_COLORS : [...CAPTION_COLORS, ...MORE_CAPTION_COLORS];
  const shownRecent = recent.filter((c) => !palette.includes(c));
  const current = value.toUpperCase();

  return (
    <View style={styles.wrap}>
      {shownRecent.length > 0 && <Swatches label="Recent" list={shownRecent} current={current} onPick={pick} />}
      <Swatches label={shownRecent.length > 0 ? 'Palette' : undefined} list={palette} current={current} onPick={pick} />
      {native && (
        <Pressable onPress={openPicker} accessibilityRole="button" hitSlop={8} style={styles.more}>
          <AppText variant="chip" color={colors.accentText}>
            Other colour
          </AppText>
        </Pressable>
      )}
      {error && (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      )}
    </View>
  );
}

function Swatches({ label, list, current, onPick }: { label?: string; list: string[]; current: string; onPick: (hex: string) => void }) {
  const colors = useTheme();
  const styles = themed[useScheme()];
  return (
    <View style={styles.section}>
      {label ? (
        <AppText variant="caption" color={colors.textMuted}>
          {label}
        </AppText>
      ) : null}
      <View style={styles.grid}>
        {list.map((c) => {
          const on = c.toUpperCase() === current;
          return (
            // The selected colour gets a white ring with a small gap, like the system colour wells.
            <Pressable
              key={c}
              onPress={() => onPick(c)}
              hitSlop={2}
              accessibilityRole="button"
              accessibilityLabel={NAMES[c.toUpperCase()] ?? c}
              accessibilityState={{ selected: on }}
              style={[styles.ring, on && styles.ringOn]}>
              <View style={[styles.dot, { backgroundColor: c }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const themed = themedStyles((colors) => ({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md, gap: spacing.md },
  section: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  ring: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  ringOn: { borderColor: colors.textPrimary },
  // A hairline edge so black stays visible on graphite.
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  more: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
}));
