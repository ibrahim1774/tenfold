import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, type as typeScale } from '../tokens';

type Variant = keyof typeof typeScale;

export type AppTextProps = TextProps & {
  variant?: Variant;
  color?: string;
  /** Fixed-width digits, for times, counts and sizes that change in place. */
  tabular?: boolean;
};

export function AppText({ variant = 'body', color = colors.textPrimary, tabular, style, maxFontSizeMultiplier = 1.6, ...rest }: AppTextProps) {
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[typeScale[variant], { color }, tabular && styles.tabular, style]}
    />
  );
}

const styles = StyleSheet.create({ tabular: { fontVariant: ['tabular-nums'] } });
