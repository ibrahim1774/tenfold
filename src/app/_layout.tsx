import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnalyticsBridge } from '@/analytics/AnalyticsBridge';
import { startQueue } from '@/batch/queue';
import { colors } from '@/design/tokens';
import { MonetizationProvider } from '@/monetization/superwall';
import { hasAccess, useEntitlements } from '@/state/entitlements';
import { useSettings } from '@/state/settings';
import { refreshSpeechStatus } from '@/state/speech';
import { TourHost } from '@/tour/TourHost';

SplashScreen.preventAutoHideAsync();
// Tenfold is dark only: system chrome (tab bar, glass, switches, sheets) follows the app, not the phone.
Appearance.setColorScheme('dark');

// Fonts (Poppins) are embedded at build time by the expo-font config plugin, so no runtime loading.
const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.violet },
};

export default function RootLayout() {
  const onboarded = useSettings((s) => s.onboarded);
  // Hard paywall. The tier is persisted and read synchronously at launch (last known plan), then kept current by
  // Superwall's subscription status: a purchase, restore or late status lets people in, an expiry locks them out.
  const subscribed = useEntitlements(hasAccess);

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
          <StatusBar style="light" />
          <AnalyticsBridge />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Protected guard={!onboarded}>
              <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
            </Stack.Protected>

            {/* Onboarded, no subscription or trial: the gate is the only screen there is. Closing Superwall's
                paywall, relaunching, the back gesture or a deep link all land here. */}
            <Stack.Protected guard={onboarded && !subscribed}>
              <Stack.Screen name="subscribe" options={{ animation: 'fade', gestureEnabled: false }} />
            </Stack.Protected>

            <Stack.Protected guard={onboarded && subscribed}>
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
              {/* Plans for subscribers, and the fallback when Superwall is missing from the build or can't present. */}
              <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
              {/* "Replay the demo" from Create and You (onboarding shows the demo inline). */}
              <Stack.Screen name="demo" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            </Stack.Protected>
          </Stack>
          {/* Coach marks for the batch setup and editor tours, above every pushed screen. */}
          <TourHost />
        </ThemeProvider>
      </MonetizationProvider>
    </GestureHandlerRootView>
  );
}
