import { Engine, EngineEvents, engineAvailable } from '../engine';
import { useSettings } from './settings';

// Apple's on-device speech assets are downloaded and managed by iOS; we only ask for them.

export async function refreshSpeechStatus() {
  if (!engineAvailable()) return;
  try {
    const s = await Engine.speechStatus(useSettings.getState().language);
    useSettings.getState().setSpeech(s.state, s.state === 'installed' ? 1 : 0, s.locale);
  } catch {
    useSettings.getState().setSpeech('unsupported');
  }
}

let preparing = false;

export async function prepareSpeech() {
  if (preparing || !engineAvailable()) return;
  preparing = true;
  const { setSpeech, language } = useSettings.getState();
  setSpeech('downloading', 0);
  const sub = EngineEvents.onModelDownloadProgress(({ fraction }) => setSpeech('downloading', fraction));
  try {
    const s = await Engine.prepareSpeech(language);
    setSpeech('installed', 1, s.locale);
  } catch {
    await refreshSpeechStatus();
  } finally {
    sub.remove();
    preparing = false;
  }
}
