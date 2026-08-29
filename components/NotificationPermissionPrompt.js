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

/**
 * First-launch notification permission explainer.
 *
 * Mounted in RootLayout, after the What's New dialog (if any) has resolved,
 * so the two never stack. Shown at most once per install: as soon as the
 * user resolves it (allow, deny, or "Not now") `notificationPromptSeen` is
 * persisted and this component never renders again, on this or any later
 * launch. If the OS permission is already 'granted' (or was already decided
 * before this build shipped) it resolves itself silently without ever
 * showing anything.
 */
export default function NotificationPermissionPrompt() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const promptSeen = useStore((s) => s.prefs.notificationPromptSeen);
  const setPref = useStore((s) => s.setPref);
  const [visible, setVisible] = useState(false);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [checked, setChecked] = useState(false);

  // Notifications are unavailable in Expo Go — never prompt there. Kept as a
  // variable (not an early return) so every hook still runs in a stable order.
  const isGo = isExpoGo();

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
          // Already granted some other way (e.g. restored from a backup on a
          // device that had already allowed it) — nothing to ask, just mark
          // it resolved so we never check again.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptSeen, isGo]);

  const resolve = useCallback(async () => {
    setVisible(false);
    await setPref('notificationPromptSeen', true);
  }, [setPref]);

  const handleEnable = useCallback(async () => {
    if (!canAskAgain) {
      // The OS will no longer show its own dialog (already denied once
      // before, or the device policy blocks re-prompting) — the only real
      // path back is the system settings screen.
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
