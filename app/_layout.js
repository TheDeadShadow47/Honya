import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useStore } from '../store/useStore';
import { useAppTheme } from '../hooks/useAppTheme';
import { isThemeDark } from '../theme/theme';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const ready = useStore((s) => s.ready);
  const hydrate = useStore((s) => s.hydrate);
  const theme = useAppTheme();
  const isDark = isThemeDark(theme);

  useEffect(() => {
    hydrate().catch((e) => console.warn('hydrate failed', e));
  }, [hydrate]);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        {!ready ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : (
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.surface1 },
              headerTitleStyle: { color: theme.text, fontSize: 17, fontWeight: '700' },
              headerTintColor: theme.text,
              headerShadowVisible: false,
              contentStyle: { backgroundColor: theme.background },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="novel/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="novel/migrate" options={{ title: 'Migrate novel' }} />
            <Stack.Screen name="reader/[chapterId]" options={{ headerShown: false }} />
            <Stack.Screen name="browse/[pluginId]" options={{ title: 'Browse' }} />
            <Stack.Screen name="settings/repositories" options={{ title: 'Repositories' }} />
            <Stack.Screen name="settings/extensions" options={{ title: 'Extensions' }} />
            <Stack.Screen name="settings/theme" options={{ title: 'Theme' }} />
            <Stack.Screen name="settings/reader" options={{ title: 'Reader settings' }} />
            <Stack.Screen name="settings/storage" options={{ title: 'Storage' }} />
            <Stack.Screen name="settings/about" options={{ title: 'About' }} />
          </Stack>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
