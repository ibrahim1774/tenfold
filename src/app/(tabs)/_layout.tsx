import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { colors } from '@/design/tokens';

/**
 * The system tab bar (UITabBarController), so iOS 26 draws its Liquid Glass bar, selection pill and
 * minimize-on-scroll itself. New batches start from Home's primary button and Library's + button.
 */
export default function TabsLayout() {
  return (
    <NativeTabs tintColor={colors.accent} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index" contentStyle={{ backgroundColor: colors.bg }}>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library" contentStyle={{ backgroundColor: colors.bg }}>
        <NativeTabs.Trigger.Icon sf={{ default: 'film.stack', selected: 'film.stack.fill' }} />
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" contentStyle={{ backgroundColor: colors.bg }}>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
