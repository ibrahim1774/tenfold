import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, ProgressBar } from '@/design/components';
import { light, spacing } from '@/design/tokens';
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
      <StepHead title="I record in" />
      <ChoiceList choices={LANGUAGES} selected={[LANGUAGES.some((l) => l.v === language) ? language : 'auto']} onToggle={choose} />

      {speech === 'supported' || speech === 'downloading' || speech === 'installed' ? (
        <View style={styles.model}>
          <View style={styles.modelRow} accessible accessibilityLabel={modelLine(speech, speechProgress)}>
            <SymbolView
              name={speech === 'installed' ? 'checkmark.circle.fill' : 'waveform'}
              size={17}
              tintColor={speech === 'installed' ? light.textPrimary : light.textSecondary}
              weight="regular"
            />
            <AppText variant="label" color={light.textSecondary} tabular style={styles.flex}>
              {modelLine(speech, speechProgress)}
            </AppText>
            {speech === 'supported' && (
              <Pressable onPress={prepareSpeech} hitSlop={10} accessibilityRole="button" accessibilityLabel="Download speech model">
                {({ pressed }) => (
                  <AppText variant="chip" color={light.accentText} style={pressed && styles.pressed}>
                    Download
                  </AppText>
                )}
              </Pressable>
            )}
          </View>
          {speech === 'downloading' && <ProgressBar progress={speechProgress} height={3} />}
        </View>
      ) : speech === 'unsupported' ? (
        <AppText variant="label" color={light.textMuted}>
          Captions aren’t available in this language on this iPhone.
        </AppText>
      ) : null}
    </View>
  );
}

/** One quiet line about Apple's on-device speech model for the chosen language. */
function modelLine(speech: string, progress: number) {
  if (speech === 'installed') return 'On-device speech ready';
  if (speech === 'downloading') return `Downloading speech · ${Math.round(progress * 100)}%`;
  return 'Speech model for captions, once';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: spacing.xl },
  model: { gap: spacing.sm },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  pressed: { opacity: 0.6 },
});
