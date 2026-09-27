import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { router, type Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SFSymbol } from '../symbols';
import { colors, sizes } from '../tokens';
import { PressableScale } from './PressableScale';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, { icon: SFSymbol; active: SFSymbol; label: string }> = {
  index: { icon: 'house', active: 'house.fill', label: 'Home' },
  library: { icon: 'film.stack', active: 'film.stack.fill', label: 'Library' },
  settings: { icon: 'gearshape', active: 'gearshape.fill', label: 'Settings' },
};

/**
 * Floating frosted pill (reference Home screen). The plus slot is an action, not a route:
 * it opens the new-batch flow, the app's primary job.
 */
export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => ICONS[r.name]);

  const item = (routeName: string) => {
    const index = state.routes.findIndex((r) => r.name === routeName);
    const route = state.routes[index];
    const focused = state.index === index;
    const meta = ICONS[routeName];
    return (
      <PressableScale
        key={route.key}
        scaleTo={0.88}
        haptic={false}
        accessibilityRole="tab"
        accessibilityLabel={meta.label}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            Haptics.selectionAsync();
            navigation.navigate(route.name);
          }
        }}
        style={[styles.slot, focused && styles.slotActive]}>
        <SymbolView
          name={focused ? meta.active : meta.icon}
          size={22}
          tintColor={focused ? colors.textInverse : colors.textSecondary}
          weight="regular"
        />
      </PressableScale>
    );
  };

  const names = routes.map((r) => r.name);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom - 6, 12) }]}>
      <View style={styles.pill}>
        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.fill]} />
        {names.includes('index') && item('index')}
        {names.includes('library') && item('library')}
        <PressableScale
          scaleTo={0.88}
          accessibilityRole="button"
          accessibilityLabel="New batch"
          onPress={() => router.push('/import')}
          style={styles.slot}>
          <SymbolView name="plus" size={22} tintColor={colors.accentText} weight="regular" />
        </PressableScale>
        {names.includes('settings') && item('settings')}
      </View>
    </View>
  );
}

/** Bottom padding a tab screen needs so its last row clears the floating bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return sizes.tabBarHeight + Math.max(insets.bottom - 6, 12) + 24;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    height: sizes.tabBarHeight,
    borderRadius: 26,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
  },
  fill: { backgroundColor: 'rgba(24,23,30,0.72)' },
  slot: { width: 64, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  slotActive: { backgroundColor: '#FFFFFF' },
});
