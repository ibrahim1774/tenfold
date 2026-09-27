import * as Haptics from 'expo-haptics';
import { router, type Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SFSymbol } from '../symbols';
import { colors, sizes } from '../tokens';
import { AppText } from './AppText';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, { icon: SFSymbol; active: SFSymbol; label: string }> = {
  index: { icon: 'house', active: 'house.fill', label: 'Home' },
  library: { icon: 'film.stack', active: 'film.stack.fill', label: 'Library' },
  settings: { icon: 'gearshape', active: 'gearshape.fill', label: 'Settings' },
};

/**
 * A standard iOS tab bar: opaque, full width, hairline on top, icon over label. The middle slot is an
 * action, not a route: it starts a new batch, the app's primary job.
 */
export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => ICONS[r.name]);

  const item = (routeName: string) => {
    const index = state.routes.findIndex((r) => r.name === routeName);
    const route = state.routes[index];
    const focused = state.index === index;
    const meta = ICONS[routeName];
    const tint = focused ? colors.textPrimary : colors.textMuted;
    return (
      <Pressable
        key={route.key}
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
        style={styles.slot}>
        <SymbolView name={focused ? meta.active : meta.icon} size={24} tintColor={tint} weight="regular" />
        <AppText variant="caption" color={tint} style={styles.label}>
          {meta.label}
        </AppText>
      </Pressable>
    );
  };

  const names = routes.map((r) => r.name);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      <View style={styles.row}>
        {names.includes('index') && item('index')}
        {names.includes('library') && item('library')}
        <Pressable accessibilityRole="button" accessibilityLabel="New batch" onPress={() => router.push('/import')} style={styles.slot}>
          <View style={styles.plus}>
            <SymbolView name="plus" size={20} tintColor={colors.textInverse} weight="semibold" />
          </View>
          <AppText variant="caption" color={colors.textMuted} style={styles.label}>
            New
          </AppText>
        </Pressable>
        {names.includes('settings') && item('settings')}
      </View>
    </View>
  );
}

/** Bottom padding a tab screen needs so its last row clears the bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return sizes.tabBarHeight + Math.max(insets.bottom, 8) + 16;
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  row: { flexDirection: 'row', height: sizes.tabBarHeight },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 4 },
  label: { fontSize: 10, lineHeight: 12 },
  plus: { width: 30, height: 24, borderRadius: 7, backgroundColor: colors.textPrimary, alignItems: 'center', justifyContent: 'center' },
});
