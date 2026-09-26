import { requireNativeView } from 'expo';
import * as React from 'react';

import { TenfoldPreviewViewProps } from './TenfoldEngine.types';

const NativeView: React.ComponentType<TenfoldPreviewViewProps> = requireNativeView('TenfoldEngine');

export default function TenfoldPreviewView(props: TenfoldPreviewViewProps) {
  return <NativeView {...props} />;
}
