import { requireNativeView } from 'expo';
import type { ComponentType, Ref } from 'react';

import type { TenfoldPreviewViewProps, TenfoldPreviewViewRef } from './TenfoldEngine.types';

// Exported directly (not wrapped) so refs reach the native view functions (`seek`).
const TenfoldPreviewView = requireNativeView('TenfoldEngine') as ComponentType<
  TenfoldPreviewViewProps & { ref?: Ref<TenfoldPreviewViewRef> }
>;

export default TenfoldPreviewView;
