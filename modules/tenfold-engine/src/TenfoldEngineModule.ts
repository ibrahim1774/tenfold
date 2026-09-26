import { NativeModule, requireOptionalNativeModule } from 'expo';

import { TenfoldEngineModuleEvents } from './TenfoldEngine.types';

declare class TenfoldEngineModule extends NativeModule<TenfoldEngineModuleEvents> {
  ping(): string;
}

// Optional so the JS bundle still loads in a client that was built before the module existed.
export default requireOptionalNativeModule<TenfoldEngineModule>('TenfoldEngine');
