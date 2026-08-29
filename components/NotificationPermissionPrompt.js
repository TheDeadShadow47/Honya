import { useState, useEffect, useCallback } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useAppTheme } from '../hooks/useAppTheme';
import { useI18n } from '../hooks/useI18n';
import { Dialog, Button } from './MD3';
import { getPermissionInfo, requestPermission, openNotificationSettings } from '../lib/notifications';
import { isExpoGo } from '../lib/nativeSupport';
import { alpha } from '../theme/theme';

/** Shown at most once per install; resolves silently if permission is already granted. */
export default function NotificationPermissionPrompt() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const promptSeen = useStore((s) => s.prefs.notificationPromptSeen);
  const setPref = useStore((s) => s.setPref);
  const [visible, setVisible] = useState(false);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [checked, setChecked] = useState(false);

  // Expo Go has no notifications; kept as a variable so every hook runs in stable order.
  const isGo = isExpoGo();

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    // Notifications are unavailable in Expo Go — resolve silently without a prompt.
    if (isGo) {
      setChecked(true);
      return;
    }
    if (promptSeen) {
      setChecked(true);
      return;
    }
    let cancelled = false;
    getPermissionInfo()
      .then(({ status, canAskAgain: again }) => {
        if (cancelled) return;
        if (status === 'granted') {
          // Already granted (e.g. restored from a backup) — resolve silently so we never check again.
          setPref('notificationPromptSeen', true);
          setChecked(true);
          return;
        }
        setCanAskAgain(again);
        setVisible(true);
        setChecked(true);
      })
      .catch(() => setChecked(true));
    return () => {
      cancelled = true;
    };
  }, [promptSeen, isGo]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const resolve = useCallback(async () => {
    setVisible(false);
    await setPref('notificationPromptSeen', true);
  }, [setPref]);

  const handleEnable = useCallback(async () => {
    if (!canAskAgain) {
      // OS will no longer prompt again; the only path back is system settings.
      openNotificationSettings();
      await resolve();
      return;
    }
    await requestPermission();
    await resolve();
  }, [canAskAgain, resolve]);

  if (isGo) return null;
  if (!checked || !visible) return null;

  return (
    <Dialog visible={visible} title={t('notificationPrompt.title')} onDismiss={resolve}>
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: alpha(theme.primary, 0.12),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="notifications" size={30} color={theme.primary} />
        </View>
      </View>

      <Text style={{ color: theme.textMuted, fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginBottom: 20 }}>
        {t('notificationPrompt.body')}
      </Text>

      <Button label={t('notificationPrompt.enable')} onPress={handleEnable} />
      <View style={{ marginTop: 10 }}>
        <Button label={t('notificationPrompt.notNow')} onPress={resolve} variant="text" />
      </View>
    </Dialog>
  );
}
