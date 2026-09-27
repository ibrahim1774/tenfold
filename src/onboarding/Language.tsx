import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, OutlineButton, ProgressBar } from '@/design/components';
import { colors, spacing } from '@/design/tokens';
import { useSettings } from '@/state/settings';
import { prepareSpeech, refreshSpeechStatus } from '@/state/speech';

import { ChoiceList, StepHead, type Choice } from './ui';

// Locale identifiers Apple's on-device speech accepts. "auto" follows the iPhone's language.
const LANGUAGES: Choice<string>[] = [
  { v: 'auto', label: 'Automatic', detail: 'The iPhone’s language' },
  { v: 'en-US', label: 'English (US)' },
  { v: 'en-GB', label: 'English (UK)' },
  { v: 'es-ES', label: 'Spanish' },
  { v: 'fr-FR', label: 'French' },
  { v: 'de-DE', label: 'German' },
  { v: 'pt-BR', label: 'Portuguese (Brazil)' },
  { v: 'it-IT', label: 'Italian' },
];

/** "I record in": the transcription language, plus the one-time speech model download. */
export function Language() {
  const { language, setLanguage, speech, speechProgress } = useSettings();

  useEffect(() => {
    refreshSpeechStatus();
  }, []);

  const choose = (v: string) => {
    if (v === language) return;
    setLanguage(v);
    refreshSpeechStatus();
  };

  return (
    <View style={styles.wrap}>
      <StepHead title="I record in" body="Tenfold transcribes on this iPhone, in the language you speak." />
      <ChoiceList choices={LANGUAGES} selected={[LANGUAGES.some((l) => l.v === language) ? language : 'auto']} onToggle={choose} />

      {speech !== 'unsupported' && speech !== 'unknown' ? (
        <Card style={styles.model}>
          <View style={styles.modelHead}>
            <SymbolView
              name={speech === 'installed' ? 'checkmark.circle.fill' : 'waveform'}
              size={20}
              tintColor={speech === 'installed' ? colors.success : colors.textPrimary}
              weight="regular"
              style={styles.icon}
            />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">On-device speech</AppText>
              <AppText variant="label" color={colors.textSecondary} tabular>
                {speech === 'installed'
                  ? 'Installed. Captions and filler-word cuts are on.'
                  : speech === 'downloading'
                    ? `Downloading, ${Math.round(speechProgress * 100)}%. It finishes in the background.`
                    : 'iOS downloads Apple’s speech model for this language once. Best on Wi-Fi.'}
              </AppText>
            </View>
          </View>
          {speech === 'downloading' && <ProgressBar progress={speechProgress} height={4} />}
          {speech === 'supported' && (
            <OutlineButton title="Download speech model" icon="arrow.down.circle" height={44} onPress={prepareSpeech} />
          )}
        </Card>
      ) : speech === 'unsupported' ? (
        <AppText variant="label" color={colors.textMuted}>
          On-device speech isn’t available for this language on this iPhone, so captions are off. Cuts and zooms still work.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { paddingHorizontal: spacing.gutter, gap: spacing.xl },
  model: { gap: spacing.md },
  modelHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  icon: { width: 24, height: 24 },
});
