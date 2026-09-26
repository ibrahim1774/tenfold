import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from '../symbols';
import { StyleSheet, View } from 'react-native';

import { colors, radii } from '../tokens';
import { AppText } from './AppText';

export type FeatureRowProps = {
  icon: SFSymbol;
  title: string;
  subtitle: string;
  iconColor?: string;
};

/** Paywall feature row: round icon, title, muted subtitle (reference screen 3). */
export function FeatureRow({ icon, title, subtitle, iconColor = colors.badgeOrange }: FeatureRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <SymbolView name={icon} size={20} tintColor={iconColor} weight="semibold" />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong" style={styles.title}>
          {title}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary}>
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
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(22,26,48,0.55)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    backgroundColor: 'rgba(15,18,34,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: 17,
  },
});
