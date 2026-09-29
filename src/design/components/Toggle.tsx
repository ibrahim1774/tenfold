import * as Haptics from 'expo-haptics';
import { Switch } from 'react-native';

import { useScheme } from '../theme';
import { brand } from '../tokens';

const DARK_OFF_TRACK = 'rgba(120,120,128,0.32)';

export type ToggleProps = {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
};

/** The system switch (UISwitch: Liquid Glass thumb on iOS 26), tinted with the brand colour when on. */
export function Toggle({ value, onChange, label, disabled }: ToggleProps) {
  // System chrome is light app-wide, so on dark screens give the off track iOS's dark-mode fill.
  const offTrack = useScheme() === 'dark' ? DARK_OFF_TRACK : undefined;
  return (
    <Switch
      value={value}
      disabled={disabled}
      accessibilityLabel={label}
      trackColor={{ true: brand.primary, false: offTrack }}
      ios_backgroundColor={offTrack}
      onValueChange={(v) => {
        Haptics.selectionAsync();
        onChange(v);
      }}
    />
  );
}
