import type { SymbolViewProps } from 'expo-symbols';

/** SF Symbol name, derived from expo-symbols so we don't import its transitive types package. */
export type SFSymbol = Extract<SymbolViewProps['name'], string>;
