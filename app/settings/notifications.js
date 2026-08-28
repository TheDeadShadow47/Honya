import { ScrollView, Switch, Text, View } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import { SectionLabel, Surface } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import { RADIUS } from '../../theme/theme';
import { getPermissionInfo, requestPermission, openNotificationSettings, getBackgroundTaskInfo } from '../../lib/notifications';

function ToggleRow({ title, subtitle, value, onValueChange, theme, disabled }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        {subtitle ? <Text style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.outline, true: theme.primaryContainer }}
        thumbColor={value ? theme.primary : theme.surface}
        disabled={disabled}
      />
    </View>
  );
}

function Divider() {
  const theme = useAppTheme();
  return <View style={{ height: 1, backgroundColor: theme.outline, marginLeft: 16 }} />;
}

const INTERVAL_OPTIONS = ['never', '6h', '12h', 'daily'];

function IntervalPicker({ theme, t, value, onChange, disabled }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600', marginBottom: 10 }}>
        {t('settingsNotifications.autoUpdate')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {INTERVAL_OPTIONS.map((opt) => {
          const selected = value === opt;
          return (
            <View key={opt} style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
              <Ripple onPress={() => !disabled && onChange(opt)}>
                <View
                  style={{
                    paddingHorizontal: 14,
                    height: 34,
                    borderRadius: RADIUS.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? theme.primary : theme.surface2,
                  }}
                >
                  <Text style={{ color: selected ? theme.onPrimary : theme.text, fontSize: 12.5, fontWeight: '700' }}>
                    {t(`settingsNotifications.interval.${opt}`)}
                  </Text>
                </View>
              </Ripple>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const setPref = useStore((s) => s.setPref);
  const prefs = useStore((s) => s.prefs);
  const {
    notificationsEnabled,
    notificationsUpdates,
    notificationsDownloads,
    notifyDownloadStart,
    notifyDownloadComplete,
    notifyDownloadFailed,
    notifyNewChaptersFound,
    notifyUpdateComplete,
    notifyUpdateFailed,
    autoUpdateInterval,
  } = prefs;

  const [permissionStatus, setPermissionStatus] = useState('unknown');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [taskInfo, setTaskInfo] = useState({ available: false, registered: false });

  useEffect(() => {
    getBackgroundTaskInfo('honya-library-update').then(setTaskInfo).catch(() => {});
  }, []);

  // Re-read on every focus, not just mount — catches the user granting the
  // permission from the OS Settings app and coming back to Honya.
  useFocusEffect(
    useCallback(() => {
      getPermissionInfo()
        .then(({ status, canAskAgain: again }) => {
          setPermissionStatus(status);
          setCanAskAgain(again);
        })
        .catch(() => {});
    }, []),
  );

  const handleMasterToggle = async (value) => {
    setPref('notificationsEnabled', value);
    if (value) {
      const { status, canAskAgain: again } = await getPermissionInfo();
      if (status === 'undetermined' && again) {
        await requestPermission();
      }
    }
  };

  const updatesEnabled = notificationsEnabled && notificationsUpdates !== false;
  const downloadsEnabled = notificationsEnabled && notificationsDownloads !== false;

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionLabel>{t('settingsNotifications.title')}</SectionLabel>
      <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>
        {t('settingsNotifications.masterSubtitle')}
      </Text>

      <Surface level={1} style={{ overflow: 'hidden', marginBottom: 18 }}>
        <ToggleRow
          title={t('settingsNotifications.master')}
          value={notificationsEnabled}
          onValueChange={handleMasterToggle}
          theme={theme}
        />
      </Surface>

      <Surface level={1} style={{ overflow: 'hidden', marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>{t('settingsNotifications.permissionStatus')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: permissionStatus === 'granted' ? '#4caf50' : '#f44336',
                marginRight: 8,
              }}
            />
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>
              {permissionStatus === 'granted'
                ? t('settingsNotifications.permissionGranted')
                : permissionStatus === 'denied'
                  ? t('settingsNotifications.permissionDenied')
                  : t('settingsNotifications.permissionUndetermined')}
            </Text>
          </View>
        </View>
        {permissionStatus !== 'granted' ? (
          <>
            <Divider />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>
                  {canAskAgain ? t('settingsNotifications.enableNotifications') : t('settingsNotifications.openSettings')}
                </Text>
              </View>
              <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
                <Ripple onPress={async () => {
                  if (!canAskAgain) {
                    openNotificationSettings();
                    return;
                  }
                  const status = await requestPermission();
                  const info = await getPermissionInfo();
                  setPermissionStatus(status);
                  setCanAskAgain(info.canAskAgain);
                }}>
                  <View style={{ paddingHorizontal: 14, height: 34, borderRadius: RADIUS.pill, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: theme.onPrimary, fontSize: 12.5, fontWeight: '700' }}>
                      {canAskAgain ? t('settingsNotifications.enableNotifications') : t('settingsNotifications.openSettings')}
                    </Text>
                  </View>
                </Ripple>
              </View>
            </View>
          </>
        ) : null}
      </Surface>

      <SectionLabel>{t('settingsNotifications.downloads')}</SectionLabel>
      <Surface level={1} style={{ overflow: 'hidden', marginBottom: 18 }}>
        <ToggleRow
          title={t('settingsNotifications.downloadsMaster')}
          subtitle={t('settingsNotifications.downloadsSubtitle')}
          value={notificationsDownloads !== false}
          onValueChange={(v) => setPref('notificationsDownloads', v)}
          theme={theme}
          disabled={!notificationsEnabled}
        />
        <Divider />
        <ToggleRow
          title={t('settingsNotifications.notifyDownloadStart')}
          value={notifyDownloadStart !== false}
          onValueChange={(v) => setPref('notifyDownloadStart', v)}
          theme={theme}
          disabled={!downloadsEnabled}
        />
        <Divider />
        <ToggleRow
          title={t('settingsNotifications.notifyDownloadComplete')}
          value={notifyDownloadComplete !== false}
          onValueChange={(v) => setPref('notifyDownloadComplete', v)}
          theme={theme}
          disabled={!downloadsEnabled}
        />
        <Divider />
        <ToggleRow
          title={t('settingsNotifications.notifyDownloadFailed')}
          value={notifyDownloadFailed !== false}
          onValueChange={(v) => setPref('notifyDownloadFailed', v)}
          theme={theme}
          disabled={!downloadsEnabled}
        />
      </Surface>

      <SectionLabel>{t('settingsNotifications.updates')}</SectionLabel>
      <Surface level={1} style={{ overflow: 'hidden', marginBottom: 18 }}>
        <ToggleRow
          title={t('settingsNotifications.updatesMaster')}
          subtitle={t('settingsNotifications.updatesSubtitle')}
          value={notificationsUpdates !== false}
          onValueChange={(v) => setPref('notificationsUpdates', v)}
          theme={theme}
          disabled={!notificationsEnabled}
        />
        <Divider />
        <IntervalPicker
          theme={theme}
          t={t}
          value={autoUpdateInterval ?? 'never'}
          onChange={(v) => setPref('autoUpdateInterval', v)}
          disabled={!notificationsEnabled}
        />
        <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: taskInfo.registered ? '#4caf50' : '#ff9800',
                marginRight: 6,
              }}
            />
            <Text style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {taskInfo.registered ? t('settingsNotifications.taskRegistered') : t('settingsNotifications.taskNotRegistered')}
            </Text>
          </View>
        </View>
        <Divider />
        <ToggleRow
          title={t('settingsNotifications.notifyNewChaptersFound')}
          value={notifyNewChaptersFound !== false}
          onValueChange={(v) => setPref('notifyNewChaptersFound', v)}
          theme={theme}
          disabled={!updatesEnabled}
        />
        <Divider />
        <ToggleRow
          title={t('settingsNotifications.notifyUpdateComplete')}
          value={notifyUpdateComplete !== false}
          onValueChange={(v) => setPref('notifyUpdateComplete', v)}
          theme={theme}
          disabled={!updatesEnabled}
        />
        <Divider />
        <ToggleRow
          title={t('settingsNotifications.notifyUpdateFailed')}
          value={notifyUpdateFailed !== false}
          onValueChange={(v) => setPref('notifyUpdateFailed', v)}
          theme={theme}
          disabled={!updatesEnabled}
        />
      </Surface>
    </ScrollView>
  );
}
