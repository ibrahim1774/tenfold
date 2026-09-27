import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { startQueue } from '@/batch/queue';
import { colors } from '@/design/tokens';
import { useSettings } from '@/state/settings';
import { refreshSpeechStatus } from '@/state/speech';
import { TourHost } from '@/tour/TourHost';

SplashScreen.preventAutoHideAsync();

// Fonts (Poppins) are embedded at build time by the expo-font config plugin, so no runtime loading.
const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.violet },
};

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
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
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
                contentStyle: { backgroundColor: colors.bgRaised },
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
                contentStyle: { backgroundColor: colors.bgRaised },
              }}
            />
            <Stack.Screen
              name="editor/info"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.5, 1],
                sheetGrabberVisible: true,
                sheetCornerRadius: 28,
                contentStyle: { backgroundColor: colors.bgRaised },
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
                contentStyle: { backgroundColor: colors.bgRaised },
              }}
            />
            <Stack.Screen
              name="editor/font-picker"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [1],
                sheetGrabberVisible: true,
                sheetCornerRadius: 28,
                contentStyle: { backgroundColor: colors.bgRaised },
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
                contentStyle: { backgroundColor: colors.bgRaised },
              }}
            />
            {/* TikTok-style text tool: full screen over a still of the video. */}
            <Stack.Screen
              name="editor/text"
              options={{ presentation: 'fullScreenModal', animation: 'fade', contentStyle: { backgroundColor: '#000000' } }}
            />
            <Stack.Screen name="export/[projectId]" options={{ presentation: 'modal' }} />
          </Stack.Protected>

          {/* Reachable from onboarding (last step) and from inside the app. */}
          <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="demo" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        </Stack>
        {/* Coach marks for the batch setup and editor tours, above every pushed screen. */}
        <TourHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
