import type { ReactNode } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { colors } from '../tokens';
import { AppText } from './AppText';

export function OptionLabel({ children }: { children: ReactNode }) {
  return (
    <AppText variant="caption" color={colors.textMuted} style={styles.label}>
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
          <AppText variant="caption" color={colors.textMuted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: '#B07CFF', false: 'rgba(255,255,255,0.2)' }}
        accessibilityLabel={title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  text: {
    flex: 1,
  },
});
