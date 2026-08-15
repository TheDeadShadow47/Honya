import React from 'react';
import { Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../hooks/useAppTheme';
import { RADIUS } from '../../theme/theme';
import { useI18n } from '../../hooks/useI18n';

// M3 nav bar; the active pill swaps background colour with no JS animation, so tab switching stays instant on Android.
const ICONS = {
  index: ['library', 'library-outline'],
  updates: ['notifications', 'notifications-outline'],
  history: ['time', 'time-outline'],
  catalogs: ['compass', 'compass-outline'],
  more: ['menu', 'menu-outline'],
};

function TabItem({ routeName, focused, theme }) {
  const [active, inactive] = ICONS[routeName] ?? ICONS.more;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 64 }}>
      <View
        style={{
          width: 60,
          height: 32,
          borderRadius: RADIUS.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused ? theme.primaryContainer : 'transparent',
        }}
      >
        <Ionicons
          name={focused ? active : inactive}
          size={21}
          color={focused ? theme.onPrimaryContainer : theme.textMuted}
        />
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
        tabBarItemStyle: { paddingTop: 6 },
        tabBarStyle: {
          backgroundColor: theme.surface1,
          borderTopWidth: 0,
          // Keeps the bar clear of the Android gesture pill / navigation bar.
          height: 62 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          elevation: 0,
        },
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ focused }) => <TabItem routeName={route.name} focused={focused} theme={theme} />,
        tabBarLabel: ({ focused, color, children }) => (
          <Text style={{ color, fontSize: 11, fontWeight: focused ? '800' : '600' }} numberOfLines={1}>
            {children}
          </Text>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: t('nav.library') }} />
      <Tabs.Screen name="updates" options={{ title: t('nav.updates') }} />
      <Tabs.Screen name="history" options={{ title: t('nav.history') }} />
      <Tabs.Screen name="catalogs" options={{ title: t('nav.catalogs') }} />
      <Tabs.Screen name="more" options={{ title: t('nav.more') }} />
    </Tabs>
  );
}
