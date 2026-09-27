import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useAppTheme } from '../hooks/useAppTheme';
import { useI18n } from '../hooks/useI18n';
import { Button, Field } from './MD3';
import Ripple from './Ripple';
import { alpha, RADIUS, THEMES } from '../theme/theme';
import { pickBackupFolder, getBackupFolderUri, BackupError } from '../lib/backup';
import { getPermissionInfo, requestPermission, openNotificationSettings } from '../lib/notifications';
import { isExpoGo } from '../lib/nativeSupport';

const TOTAL_STEPS = 8;

function StepIcon({ name, theme }) {
  return (
    <View style={{ alignItems: 'center', marginBottom: 18 }}>
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
        <Ionicons name={name} size={30} color={theme.primary} />
      </View>
    </View>
  );
}

export default function StarterGuide() {
  const theme = useAppTheme();
  const { t, rtl } = useI18n();
  const insets = useSafeAreaInsets();
  const completeStarterGuide = useStore((s) => s.completeStarterGuide);
  const setPref = useStore((s) => s.setPref);
  const prefs = useStore((s) => s.prefs);
  const userRepositories = useStore((s) => s.userRepositories);
  const addRepository = useStore((s) => s.addRepository);

  const [step, setStep] = useState(0);

  // Any step-completed/finished path funnels through here so the separate, older
  // notification-permission prompt never redundantly re-asks right after this guide
  // already covered the same ground.
  const finish = useCallback(async () => {
    await setPref('notificationPromptSeen', true);
    await completeStarterGuide();
  }, [setPref, completeStarterGuide]);

  const goNext = useCallback(() => {
    if (step >= TOTAL_STEPS - 1) {
      finish();
      return;
    }
    setStep((s) => s + 1);
  }, [step, finish]);

  const goBack = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  const BackIcon = rtl ? 'chevron-forward' : 'chevron-back';
  const NextIcon = rtl ? 'chevron-back' : 'chevron-forward';

  return (
    <Modal visible animationType="slide" onRequestClose={goBack} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        {/* Header: progress + skip */}
        <View
          style={{
            flexDirection: rtl ? 'row-reverse' : 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 4,
          }}
        >
          <Text style={{ color: theme.textMuted, fontSize: 12.5, fontWeight: '700' }}>
            {t('starterGuide.progress', { current: step + 1, total: TOTAL_STEPS })}
          </Text>
          {step < TOTAL_STEPS - 1 ? (
            <Button label={t('starterGuide.skip')} variant="text" onPress={finish} />
          ) : (
            <View style={{ width: 1 }} />
          )}
        </View>

        {/* Progress dots */}
        <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={{
                width: i === step ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === step ? theme.primary : theme.outline,
              }}
            />
          ))}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          <StepBody
            step={step}
            theme={theme}
            t={t}
            prefs={prefs}
            setPref={setPref}
            userRepositories={userRepositories}
            addRepository={addRepository}
          />
        </ScrollView>

        {/* Footer nav */}
        <View
          style={{
            flexDirection: rtl ? 'row-reverse' : 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 14,
            gap: 12,
          }}
        >
          {step > 0 ? (
            <Button
              label={t('starterGuide.back')}
              variant="tonal"
              icon={<Ionicons name={BackIcon} size={17} color={theme.text} />}
              onPress={goBack}
              style={{ flex: 1 }}
            />
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Button
            label={step >= TOTAL_STEPS - 1 ? t('starterGuide.done.start') : t('starterGuide.next')}
            icon={step >= TOTAL_STEPS - 1 ? undefined : <Ionicons name={NextIcon} size={17} color={theme.onPrimary} />}
            onPress={goNext}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Modal>
  );
}

function StepBody({ step, theme, t, prefs, setPref, userRepositories, addRepository }) {
  switch (step) {
    case 0:
      return <WelcomeStep theme={theme} t={t} />;
    case 1:
      return <BackupStep theme={theme} t={t} />;
    case 2:
      return <RepoStep theme={theme} t={t} userRepositories={userRepositories} addRepository={addRepository} />;
    case 3:
      return <NotificationsStep theme={theme} t={t} setPref={setPref} />;
    case 4:
      return <ThemeStep theme={theme} t={t} prefs={prefs} setPref={setPref} />;
    case 5:
      return <LibraryStep theme={theme} t={t} />;
    case 6:
      return <ReadingStep theme={theme} t={t} />;
    default:
      return <DoneStep theme={theme} t={t} />;
  }
}

function Title({ theme, children }) {
  return (
    <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 10 }}>
      {children}
    </Text>
  );
}

function Body({ theme, children }) {
  return (
    <Text style={{ color: theme.textMuted, fontSize: 14.5, lineHeight: 21, textAlign: 'center', marginBottom: 22 }}>
      {children}
    </Text>
  );
}

function WelcomeStep({ theme, t }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <StepIcon name="book-outline" theme={theme} />
      <Title theme={theme}>{t('starterGuide.welcome.title')}</Title>
      <Body theme={theme}>{t('starterGuide.welcome.body')}</Body>
    </View>
  );
}

function BackupStep({ theme, t }) {
  const [folderUri, setFolderUri] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBackupFolderUri().then((uri) => {
      if (!cancelled) setFolderUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onChoose = async () => {
    setBusy(true);
    try {
      const uri = await pickBackupFolder();
      if (uri) setFolderUri(uri);
    } catch (e) {
      const message = e instanceof BackupError ? e.message : t('settingsBackup.restoreFailedBody');
      Alert.alert(t('settingsBackup.createFailed'), message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <StepIcon name="save-outline" theme={theme} />
      <Title theme={theme}>{t('starterGuide.backup.title')}</Title>
      <Body theme={theme}>{t('starterGuide.backup.body')}</Body>
      {folderUri ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 14, gap: 6 }}>
          <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
          <Text style={{ color: theme.text, fontSize: 13 }}>{t('settingsBackup.folderSet')}</Text>
        </View>
      ) : null}
      <Button
        label={folderUri ? t('settingsBackup.changeFolder') : t('settingsBackup.chooseFolder')}
        variant="tonal"
        icon={<Ionicons name="folder-outline" size={17} color={theme.text} />}
        loading={busy}
        onPress={onChoose}
        style={{ alignSelf: 'center' }}
      />
    </View>
  );
}

function RepoStep({ theme, t, userRepositories, addRepository }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const onAdd = async () => {
    setBusy(true);
    try {
      await addRepository(value);
      setValue('');
      setJustAdded(true);
    } catch (e) {
      Alert.alert(t('md3.somethingWentWrong'), e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <StepIcon name="globe-outline" theme={theme} />
      <Title theme={theme}>{t('starterGuide.repo.title')}</Title>
      <Body theme={theme}>{t('starterGuide.repo.body')}</Body>
      <Field value={value} onChangeText={setValue} placeholder={t('starterGuide.repo.placeholder')} />
      <View style={{ height: 12 }} />
      <Button
        label={t('settingsRepositories.add')}
        loading={busy}
        onPress={onAdd}
        disabled={!value.trim()}
        style={{ alignSelf: 'center' }}
      />
      {justAdded || userRepositories.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, gap: 6 }}>
          <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
          <Text style={{ color: theme.text, fontSize: 13 }}>{t('starterGuide.repo.addedOne')}</Text>
        </View>
      ) : null}
    </View>
  );
}

function NotificationsStep({ theme, t, setPref }) {
  const [status, setStatus] = useState('unknown');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const isGo = isExpoGo();

  useEffect(() => {
    if (isGo) return;
    let cancelled = false;
    getPermissionInfo().then(({ status: s, canAskAgain: again }) => {
      if (cancelled) return;
      setStatus(s);
      setCanAskAgain(again);
    });
    return () => {
      cancelled = true;
    };
  }, [isGo]);

  const onEnable = async () => {
    if (!canAskAgain) {
      openNotificationSettings();
      return;
    }
    await setPref('notificationsEnabled', true);
    const s = await requestPermission();
    setStatus(s);
    const info = await getPermissionInfo();
    setCanAskAgain(info.canAskAgain);
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <StepIcon name="notifications-outline" theme={theme} />
      <Title theme={theme}>{t('starterGuide.notifications.title')}</Title>
      <Body theme={theme}>{t('starterGuide.notifications.body')}</Body>
      {isGo ? null : status === 'granted' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
          <Text style={{ color: theme.text, fontSize: 13 }}>{t('settingsNotifications.permissionGranted')}</Text>
        </View>
      ) : (
        <Button
          label={canAskAgain ? t('settingsNotifications.enableNotifications') : t('settingsNotifications.openSettings')}
          onPress={onEnable}
          style={{ alignSelf: 'center' }}
        />
      )}
    </View>
  );
}

function ThemeStep({ theme, t, prefs, setPref }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <StepIcon name="color-palette-outline" theme={theme} />
      <Title theme={theme}>{t('starterGuide.theme.title')}</Title>
      <Body theme={theme}>{t('starterGuide.theme.body')}</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        {Object.values(THEMES).map((th) => {
          const selected = th.key === prefs.theme;
          return (
            <Ripple key={th.key} onPress={() => setPref('theme', th.key)}>
              <View
                style={{
                  width: 72,
                  alignItems: 'center',
                  padding: 8,
                  borderRadius: RADIUS.md,
                  borderWidth: 2,
                  borderColor: selected ? theme.primary : 'transparent',
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: th.primary,
                    borderWidth: 1,
                    borderColor: alpha(theme.text, 0.1),
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 6,
                  }}
                >
                  {selected ? <Ionicons name="checkmark" size={16} color={th.onPrimary} /> : null}
                </View>
                <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 10.5, fontWeight: '600' }}>
                  {th.name}
                </Text>
              </View>
            </Ripple>
          );
        })}
      </View>
    </View>
  );
}

function LibraryStep({ theme, t }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <StepIcon name="library-outline" theme={theme} />
      <Title theme={theme}>{t('starterGuide.library.title')}</Title>
      <Body theme={theme}>{t('starterGuide.library.body')}</Body>
    </View>
  );
}

function ReadingStep({ theme, t }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <StepIcon name="headset-outline" theme={theme} />
      <Title theme={theme}>{t('starterGuide.reading.title')}</Title>
      <Body theme={theme}>{t('starterGuide.reading.body')}</Body>
    </View>
  );
}

function DoneStep({ theme, t }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <StepIcon name="checkmark-done-circle-outline" theme={theme} />
      <Title theme={theme}>{t('starterGuide.done.title')}</Title>
      <Body theme={theme}>{t('starterGuide.done.body')}</Body>
    </View>
  );
}
