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
import { setLanguage, applyDirection, getLanguage, isRTL } from '../lib/i18n';
import { useI18n } from '../hooks/useI18n';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const ready = useStore((s) => s.ready);
  const hydrate = useStore((s) => s.hydrate);
  const lang = useStore((s) => s.prefs.lang);
  const theme = useAppTheme();
  const isDark = isThemeDark(theme);
  const { t } = useI18n();

  useEffect(() => {
    hydrate().catch((e) => console.warn('hydrate failed', e));
  }, [hydrate]);

  // Mirror the persisted language to the in-memory state and native I18nManager before the first layout commits.
  if (ready && lang && getLanguage() !== lang) {
    setLanguage(lang);
    applyDirection();
  }

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  return (
    <GestureHandlerRootView
      style={{
        flex: 1,
        backgroundColor: theme.background,
        direction: isRTL() ? 'rtl' : 'ltr',
      }}
    >
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
              animation: isRTL() ? 'slide_from_left' : 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="novel/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="novel/migrate" options={{ title: t('novel.migrateTitle') }} />
            <Stack.Screen name="reader/[chapterId]" options={{ headerShown: false }} />
            <Stack.Screen name="browse/[pluginId]" options={{ title: t('catalogs.browseSources') }} />
            <Stack.Screen name="settings/repositories" options={{ title: t('settingsRepositories.title') }} />
            <Stack.Screen name="settings/extensions" options={{ title: t('settingsExtensions.title') }} />
            <Stack.Screen name="settings/theme" options={{ title: t('settingsTheme.title') }} />
            <Stack.Screen name="settings/reader" options={{ title: t('settingsReader.title') }} />
            <Stack.Screen name="settings/language" options={{ title: t('settingsLanguage.title') }} />
            <Stack.Screen name="settings/storage" options={{ title: t('settingsStorage.title') }} />
            <Stack.Screen name="settings/backup" options={{ title: t('settingsBackup.title') }} />
            <Stack.Screen name="settings/about" options={{ title: t('settingsAbout.title') }} />
          </Stack>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
