import { createContext, use, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { palettes, type Palette, type Scheme } from './tokens';

/**
 * Which palette the current screen uses. The root stack sets it per route (`schemeForRoute`), glass and
 * thumbnails set `dark` for what they draw over footage, and shared components read it with `useTheme()`.
 * Light is the default: the app shell is light, the editor is the exception.
 */
const SchemeContext = createContext<Scheme>('light');

export function ThemeScope({ scheme, children }: { scheme: Scheme; children: ReactNode }) {
  return <SchemeContext value={scheme}>{children}</SchemeContext>;
}

export function useScheme(): Scheme {
  return use(SchemeContext);
}

export function useTheme(): Palette {
  return palettes[use(SchemeContext)];
}

/**
 * Both variants of a component's styles, built once at module load: `const s = styles[useScheme()]`.
 * (Built eagerly rather than cached on first render, which the React Compiler treats as impure.)
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(make: (p: Palette) => T): Record<Scheme, T> {
  return { light: StyleSheet.create(make(palettes.light)), dark: StyleSheet.create(make(palettes.dark)) };
}

// Routes shown in the dark palette: the editor and everything reached from it, export and the camera.
const DARK_ROUTES = ['editor/', 'export/', 'record'];
// Caption sheets are shared: light over batch setup (`batchId`), dark over the editor (`projectId`).
const SHARED_SHEETS = ['editor/captions', 'editor/style-picker', 'editor/font-picker'];

/** The palette a root-stack route draws in, from its name and params. */
export function schemeForRoute(name: string, params?: object): Scheme {
  if (SHARED_SHEETS.includes(name)) {
    const p = (params ?? {}) as { projectId?: string };
    return p.projectId ? 'dark' : 'light';
  }
  return DARK_ROUTES.some((r) => name.startsWith(r)) ? 'dark' : 'light';
}
