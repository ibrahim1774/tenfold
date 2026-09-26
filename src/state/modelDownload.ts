import { useSettings } from './settings';

// M0: simulated download that keeps running while the user moves through the app.
// M1 replaces this with TenfoldEngine.ensureSpeechModel() + onModelDownloadProgress events.
let timer: ReturnType<typeof setInterval> | null = null;

export function startModelDownload() {
  const { speechModel, setSpeechModel } = useSettings.getState();
  if (speechModel !== 'notDownloaded' || timer) return;
  let p = 0;
  setSpeechModel('downloading', 0);
  timer = setInterval(() => {
    p += 0.012;
    if (p >= 1) {
      if (timer) clearInterval(timer);
      timer = null;
      useSettings.getState().setSpeechModel('installed', 1);
    } else {
      useSettings.getState().setSpeechModel('downloading', p);
    }
  }, 120);
}

export function deleteModel() {
  if (timer) clearInterval(timer);
  timer = null;
  useSettings.getState().setSpeechModel('notDownloaded', 0);
}
