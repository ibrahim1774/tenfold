import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../tokens';
import { AppText } from './AppText';
import { Toggle } from './Toggle';

export function OptionLabel({ children }: { children: ReactNode }) {
  return (
    <AppText variant="label" color={colors.textSecondary}>
      {children}
    </AppText>
  );
}

export type ToggleRowProps = {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
};

export function ToggleRow({ title, subtitle, value, onChange, disabled }: ToggleRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          <AppText variant="label" color={colors.textMuted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Toggle value={value} onChange={onChange} disabled={disabled} label={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1 },
});
