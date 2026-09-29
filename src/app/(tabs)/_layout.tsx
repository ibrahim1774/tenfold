import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { colors } from '@/design/tokens';

/**
 * The system tab bar (UITabBarController), so iOS 26 draws its Liquid Glass bar, selection pill and
 * minimize-on-scroll itself. Tabs: Create (record or import, the route `index`), Cuts (every batch, `library`)
 * and You (plan, usage and settings, `settings`). Route file names stay as they were.
 */
export default function TabsLayout() {
  return (
    <NativeTabs tintColor={colors.accent} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index" contentStyle={{ backgroundColor: colors.bg }}>
        <NativeTabs.Trigger.Icon sf={{ default: 'plus.circle', selected: 'plus.circle.fill' }} />
        <NativeTabs.Trigger.Label>Create</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library" contentStyle={{ backgroundColor: colors.bg }}>
        <NativeTabs.Trigger.Icon sf={{ default: 'film.stack', selected: 'film.stack.fill' }} />
        <NativeTabs.Trigger.Label>Cuts</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" contentStyle={{ backgroundColor: colors.bg }}>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
        <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
