import { Alert } from 'react-native';

import { Engine, EngineEvents, engineAvailable } from '../engine';
import { useSettings } from './settings';

// Apple's on-device speech assets are downloaded and managed by iOS; we only ask for them.

let preparing = false;

export async function refreshSpeechStatus() {
  if (!engineAvailable()) return;
  try {
    const s = await Engine.speechStatus(useSettings.getState().language);
    // iOS is still downloading (e.g. the app was closed mid-download): re-attach to get progress again.
    if (s.state === 'downloading' && !preparing) {
      void prepareSpeech();
      return;
    }
    const { speech, speechProgress, setSpeech } = useSettings.getState();
    const progress = s.state === 'installed' ? 1 : s.state === 'downloading' && speech === 'downloading' ? speechProgress : 0;
    setSpeech(s.state, progress, s.locale);
  } catch {
    useSettings.getState().setSpeech('unsupported');
  }
}


export async function prepareSpeech() {
  if (preparing || !engineAvailable()) return;
  preparing = true;
  const { setSpeech, language } = useSettings.getState();
  setSpeech('downloading', 0);
  const sub = EngineEvents.onModelDownloadProgress(({ fraction }) => setSpeech('downloading', fraction));
  try {
    const s = await Engine.prepareSpeech(language);
    setSpeech('installed', 1, s.locale);
  } catch (e) {
    // Still "preparing" here, so a status of "downloading" can't trigger another attempt (and another alert).
    await refreshSpeechStatus();
    const msg = e instanceof Error ? e.message : String(e);
    Alert.alert('Couldn’t set up speech', `${msg}\n\nCheck your connection and try again. Captions and filler removal need it.`);
  } finally {
    sub.remove();
    preparing = false;
  }
}
