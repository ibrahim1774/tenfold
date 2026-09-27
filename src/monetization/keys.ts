// Superwall public API key (Dashboard > Settings > Keys). Public keys are safe in the app and the repo;
// `.env` sets EXPO_PUBLIC_SUPERWALL_IOS_KEY, and this constant covers builds made without it.
export const SUPERWALL_IOS_KEY = process.env.EXPO_PUBLIC_SUPERWALL_IOS_KEY ?? 'pk_Hmc1Ks7K5bZeFyG0TzVwj';
