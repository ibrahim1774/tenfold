import Storage from 'expo-sqlite/kv-store';
import { createJSONStorage } from 'zustand/middleware';

// Synchronous SQLite-backed storage so persisted stores are hydrated before the first render
// (no onboarding flash on cold start).
export const persistStorage = createJSONStorage(() => ({
  getItem: (key: string) => Storage.getItemSync(key),
  setItem: (key: string, value: string) => Storage.setItemSync(key, value),
  removeItem: (key: string) => {
    Storage.removeItemSync(key);
  },
}));
