import * as Haptics from 'expo-haptics';
import { Switch } from 'react-native';

import { colors } from '../tokens';

export type ToggleProps = {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
};

/** The system switch (UISwitch: Liquid Glass thumb on iOS 26), tinted with the accent when on. */
export function Toggle({ value, onChange, label, disabled }: ToggleProps) {
  return (
    <Switch
      value={value}
      disabled={disabled}
      accessibilityLabel={label}
      trackColor={{ true: colors.accent, false: undefined }}
      onValueChange={(v) => {
        Haptics.selectionAsync();
        onChange(v);
      }}
    />
  );
}
