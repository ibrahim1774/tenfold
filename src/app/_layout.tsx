import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors } from '@/design/tokens';

SplashScreen.preventAutoHideAsync();

// Fonts (Poppins) are embedded at build time by the expo-font config plugin, so no runtime loading.
const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bgDarkTop, primary: '#B07CFF' },
};

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgDarkTop } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
          <Stack.Screen name="import" />
          <Stack.Screen name="batch/setup" />
          <Stack.Screen name="batch/[batchId]" />
          <Stack.Screen name="editor/[projectId]" />
          <Stack.Screen
            name="editor/captions"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.75, 1],
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
              contentStyle: { backgroundColor: colors.bgDarkBottom },
            }}
          />
          <Stack.Screen name="export/[projectId]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
