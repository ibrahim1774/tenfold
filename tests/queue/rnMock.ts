// Minimal react-native stand-in for the queue: AppState, plus a silent Alert for the importer.
type Handler = (s: string) => void;
const handlers: Handler[] = [];
export const AppState = {
  currentState: 'active' as string,
  addEventListener(_: 'change', h: Handler) {
    handlers.push(h);
    return { remove() {} };
  },
  /** Test helper: move the app to the background / foreground. */
  set(state: string) {
    AppState.currentState = state;
    handlers.forEach((h) => h(state));
  },
};

export const alerts: string[] = [];
export const Alert = {
  alert(title: string) {
    alerts.push(title);
  },
};
