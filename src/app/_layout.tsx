import { DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { startQueue } from '@/batch/queue';
import { schemeForRoute, ThemeScope } from '@/design/theme';
import { brand, light, palettes } from '@/design/tokens';
import { MonetizationProvider } from '@/monetization/superwall';
import { useSettings } from '@/state/settings';
import { refreshSpeechStatus } from '@/state/speech';
import { TourHost } from '@/tour/TourHost';

SplashScreen.preventAutoHideAsync();
// Tenfold's shell is light whatever the phone's setting: system chrome (tab bar, alerts, sheets, pickers,
// switches) draws light. The editor, export and record screens paint their own dark palette, set
// `keyboardAppearance` and `userInterfaceStyle: 'dark'` on their alerts, and use dark glass.
Appearance.setColorScheme('light');

// Fonts (Poppins) are embedded at build time by the expo-font config plugin, so no runtime loading.
const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: light.bg, card: light.bg, text: light.textPrimary, primary: brand.primary },
};

// Form sheets draw on the sheet colour of their palette; everything else on the page colour.
const SHEETS = new Set([
  'batch/clip',
  'editor/captions',
  'editor/info',
  'editor/style-picker',
  'editor/font-picker',
  'editor/voiceover',
]);

export default function RootLayout() {
  const onboarded = useSettings((s) => s.onboarded);

  useEffect(() => {
    SplashScreen.hideAsync();
    // Resume any batch interrupted by the app being closed, and read iOS speech status.
    startQueue();
    refreshSpeechStatus();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Superwall: paywalls, subscription status → tier. A pass-through in builds without the module. */}
      <MonetizationProvider>
        <ThemeProvider value={theme}>
          {/*
            Each route draws in its palette (light shell, dark editor), with a status bar to match: the
            topmost mounted screen's StatusBar wins, and popping it restores the one below.
          */}
          <Stack
            screenOptions={({ route }) => {
              const p = palettes[schemeForRoute(route.name, route.params)];
              return { headerShown: false, contentStyle: { backgroundColor: SHEETS.has(route.name) ? p.bgRaised : p.bg } };
            }}
            screenLayout={({ route, children }) => {
              const scheme = schemeForRoute(route.name, route.params);
              return (
                <ThemeScope scheme={scheme}>
                  <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                  {children}
                </ThemeScope>
              );
            }}>
            <Stack.Protected guard={!onboarded}>
              <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
            </Stack.Protected>

            <Stack.Protected guard={onboarded}>
              <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
              <Stack.Screen name="import" options={{ presentation: 'modal' }} />
              <Stack.Screen name="record" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="batch/setup" />
              <Stack.Screen
                name="batch/clip"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.5, 1],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 28,
                }}
              />
              <Stack.Screen name="batch/[batchId]" />
              <Stack.Screen name="editor/[projectId]" />
              <Stack.Screen
                name="editor/captions"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.5, 1],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 28,
                }}
              />
              <Stack.Screen
                name="editor/info"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.5, 1],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 28,
                }}
              />
              {/* Style and font lists, stacked over the captions sheet (itself a form sheet in this stack). */}
              <Stack.Screen
                name="editor/style-picker"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [1],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 28,
                }}
              />
              <Stack.Screen
                name="editor/font-picker"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [1],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 28,
                }}
              />
              {/* Voiceover recorder: a short sheet, so the preview playing above it stays in view. */}
              <Stack.Screen
                name="editor/voiceover"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.45],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 28,
                }}
              />
              {/* TikTok-style text tool: full screen over a still of the video. */}
              <Stack.Screen
                name="editor/text"
                options={{ presentation: 'fullScreenModal', animation: 'fade', contentStyle: { backgroundColor: '#000000' } }}
              />
              <Stack.Screen name="export/[projectId]" options={{ presentation: 'modal' }} />
            </Stack.Protected>

            {/* Native paywall: the fallback when Superwall is missing from the build or can't present. */}
            <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="demo" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          </Stack>
          {/* Coach marks for the batch setup and editor tours, above every pushed screen. */}
          <TourHost />
        </ThemeProvider>
      </MonetizationProvider>
    </GestureHandlerRootView>
  );
}
