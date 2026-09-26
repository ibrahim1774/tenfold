import { TenfoldEngine } from '../../modules/tenfold-engine';

export * from './types';
export { TenfoldPreviewView } from '../../modules/tenfold-engine';

/** M0 smoke test. Returns null when the running client was built without the native module. */
export function pingEngine(): string | null {
  try {
    return TenfoldEngine?.ping() ?? null;
  } catch {
    return null;
  }
}
