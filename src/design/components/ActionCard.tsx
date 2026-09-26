import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import type { SFSymbol } from '../symbols';
import { colors, radii } from '../tokens';
import { AppText } from './AppText';
import { Toggle } from './Toggle';

export type ActionCardProps = {
  icon: SFSymbol;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
};

/** Icon + toggle on top, title and hint below ("Auto Cut / Beat Sync / Smart Color" cards). */
export function ActionCard({ icon, title, subtitle, value, onChange }: ActionCardProps) {
  return (
    <View style={[styles.card, value && styles.on]}>
      <View style={styles.top}>
        <SymbolView name={icon} size={24} tintColor={colors.textPrimary} weight="light" />
        <Toggle value={value} onChange={onChange} label={title} />
      </View>
      <View>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 118,
    padding: 14,
    justifyContent: 'space-between',
    borderRadius: radii.tile,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  on: { borderColor: 'rgba(255,255,255,0.14)' },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
});
