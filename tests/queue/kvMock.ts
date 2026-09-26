const m = new Map<string, string>();
export default {
  getItemSync: (k: string) => m.get(k) ?? null,
  setItemSync: (k: string, v: string) => void m.set(k, v),
  removeItemSync: (k: string) => m.delete(k),
};
