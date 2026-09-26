import { Text, type TextProps } from 'react-native';

import { colors, type as typeScale } from '../tokens';

type Variant = keyof typeof typeScale;

export type AppTextProps = TextProps & {
  variant?: Variant;
  color?: string;
};

export function AppText({ variant = 'body', color = colors.textPrimary, style, ...rest }: AppTextProps) {
  return <Text {...rest} style={[typeScale[variant], { color }, style]} />;
}
