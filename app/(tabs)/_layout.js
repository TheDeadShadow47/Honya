import { Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../hooks/useAppTheme';
import { RADIUS } from '../../theme/theme';

/**
 * Material 3 style navigation bar. The active pill is a plain View that swaps
 * background colour — no JS animation runs on tab change, which keeps switching
 * instant on Android.
 */
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
      <Tabs.Screen name="index" options={{ title: 'Library' }} />
      <Tabs.Screen name="updates" options={{ title: 'Updates' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="catalogs" options={{ title: 'Catalogs' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
