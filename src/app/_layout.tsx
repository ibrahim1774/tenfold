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
            <Stack.Screen name="batch/setup" />
            <Stack.Screen name="batch/[batchId]" />
            <Stack.Screen name="editor/[projectId]" />
            <Stack.Screen
              name="editor/captions"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.8, 1],
                sheetGrabberVisible: true,
                sheetCornerRadius: 28,
                contentStyle: { backgroundColor: colors.bgRaised },
              }}
            />
            <Stack.Screen name="export/[projectId]" options={{ presentation: 'modal' }} />
          </Stack.Protected>

          {/* Reachable from onboarding (last step) and from inside the app. */}
          <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
