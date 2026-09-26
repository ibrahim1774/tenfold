import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import type { SFSymbol } from '../symbols';
import { colors, radii } from '../tokens';
import { AppText } from './AppText';

export type FeatureRowProps = {
  icon: SFSymbol;
  title: string;
  subtitle: string;
  iconColor?: string;
};

export function FeatureRow({ icon, title, subtitle, iconColor = colors.orange }: FeatureRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <SymbolView name={icon} size={20} tintColor={iconColor} weight="regular" />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="label" color={colors.textSecondary}>
          {subtitle}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.tile,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    backgroundColor: colors.cardHigh,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
});
