import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '../tokens';
import { AppText } from './AppText';
import { Card } from './Card';
import { OutlineButton } from './GradientButton';

export type SuggestionCardProps = {
  title: string;
  body: string;
  primary: string;
  secondary: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
};

/** "AI Suggestion" card with two buttons. */
export function SuggestionCard({ title, body, primary, secondary, onPrimary, onSecondary }: SuggestionCardProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <SymbolView name="sparkles" size={20} tintColor={colors.textPrimary} weight="light" />
        <AppText variant="bodyStrong">{title}</AppText>
      </View>
      <AppText variant="label" color={colors.textSecondary}>
        {body}
      </AppText>
      <View style={styles.buttons}>
        <OutlineButton title={primary} tone="violet" height={44} onPress={onPrimary} style={styles.flex} />
        <OutlineButton title={secondary} height={44} onPress={onSecondary} style={styles.flex} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex: { flex: 1 },
});
