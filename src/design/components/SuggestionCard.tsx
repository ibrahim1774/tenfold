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

/** A fact about the clip and what to do about it, with two plain actions. */
export function SuggestionCard({ title, body, primary, secondary, onPrimary, onSecondary }: SuggestionCardProps) {
  return (
    <Card style={styles.card}>
      <AppText variant="bodyStrong">{title}</AppText>
      <AppText variant="label" color={colors.textSecondary}>
        {body}
      </AppText>
      <View style={styles.buttons}>
        <OutlineButton title={primary} height={44} onPress={onPrimary} style={styles.flex} />
        <OutlineButton title={secondary} height={44} onPress={onSecondary} style={styles.flex} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex: { flex: 1 },
});
