import { useState, useCallback } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../hooks/useI18n';
import { Surface, Button, ProgressBar } from '../../components/MD3';
import { getCurrentVersion, formatBytes, parseReleaseNotes } from '../../lib/updateManager';
import { alpha, RADIUS } from '../../theme/theme';

export default function UpdateScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const appUpdateState = useStore((s) => s.appUpdateState);
  const checkForAppUpdate = useStore((s) => s.checkForAppUpdate);
  const downloadAppUpdate = useStore((s) => s.downloadAppUpdate);
  const cancelAppUpdateDownload = useStore((s) => s.cancelAppUpdateDownload);
  const installAppUpdate = useStore((s) => s.installAppUpdate);
  const skipAppUpdateVersion = useStore((s) => s.skipAppUpdateVersion);
  const dismissAppUpdate = useStore((s) => s.dismissAppUpdate);

  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(null);
  const [installResult, setInstallResult] = useState(null);

  const currentVersion = getCurrentVersion();
  const release = appUpdateState.latestRelease;
  const downloadedVersion = appUpdateState.downloadedVersion;
  const isDownloading = appUpdateState.downloading;
  const progress = appUpdateState.downloadProgress;
  const dlError = appUpdateState.downloadError;

  const pct = progress.totalBytes > 0
    ? Math.round((progress.bytesWritten / progress.totalBytes) * 100)
    : 0;

  const isUpToDate = !release && !downloadedVersion && !checking && !checkError && !dlError;
  const isUpdateAvailable = !!release && !downloadedVersion && !isDownloading;
  const isReadyToInstall = !!downloadedVersion;
  const isFailed = !!checkError || (!!dlError && !isDownloading);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const result = await checkForAppUpdate({ force: true });
      if (result.error) {
        setCheckError(result.error);
      }
    } catch {
      setCheckError('unknown');
    } finally {
      setChecking(false);
    }
  }, [checkForAppUpdate]);

  const handleDownload = useCallback(async () => {
    setInstallResult(null);
    const result = await downloadAppUpdate();
    if (result && !result.completed && result.error) {
      // Download failed — the error is shown via state
    }
  }, [downloadAppUpdate]);

  const handleCancel = useCallback(() => {
    Alert.alert(t('update.cancel'), t('update.cancel'), [
      { text: t('update.later'), style: 'cancel' },
      { text: t('update.cancel'), style: 'destructive', onPress: () => cancelAppUpdateDownload() },
    ]);
  }, [cancelAppUpdateDownload, t]);

  const handleInstall = useCallback(async () => {
    setInstallResult(null);
    const result = await installAppUpdate();
    if (!result.success) {
      if (result.needsPermission) {
        Alert.alert(t('update.permissionTitle'), t('update.permissionBody'), [
          { text: t('update.permissionCancel'), style: 'cancel' },
          { text: t('update.permissionSettings'), onPress: () => {} },
        ]);
      } else {
        setInstallResult(result.error);
      }
    }
  }, [installAppUpdate, t]);

  const handleSkip = useCallback(() => {
    Alert.alert(t('update.skipThisVersion'), t('update.skipThisVersion'), [
      { text: t('update.later'), style: 'cancel' },
      { text: t('update.skipThisVersion'), style: 'destructive', onPress: () => skipAppUpdateVersion() },
    ]);
  }, [skipAppUpdateVersion, t]);

  const handleLater = useCallback(() => {
    dismissAppUpdate();
  }, [dismissAppUpdate]);

  // Parse release notes
  const notes = release ? parseReleaseNotes(release.body) : null;
  const hasNotes = notes && (notes.newFeatures.length || notes.improvements.length || notes.bugFixes.length);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16 }}>
      {/* ── Current Version ────────────────────────────────────────────── */}
      <Surface level={1} style={{ padding: 18, marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Honya</Text>
            <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13.5 }}>
              {t('settingsAbout.version')} {currentVersion}
            </Text>
          </View>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: alpha(theme.primary, 0.12),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="sparkles" size={26} color={theme.primary} />
          </View>
        </View>
      </Surface>

      {/* ── Checking ──────────────────────────────────────────────────── */}
      {checking && (
        <Surface level={1} style={{ padding: 22, marginBottom: 18, alignItems: 'center' }}>
          <Ionicons name="sync-outline" size={28} color={theme.primary} style={{ marginBottom: 12 }} />
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>
            {t('update.checking')}
          </Text>
        </Surface>
      )}

      {/* ── Up To Date ────────────────────────────────────────────────── */}
      {isUpToDate && (
        <Surface level={1} style={{ padding: 22, marginBottom: 18, alignItems: 'center' }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: alpha(theme.primary, 0.12),
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Ionicons name="checkmark-circle" size={28} color={theme.primary} />
          </View>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
            {t('update.upToDate')}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
            {t('update.upToDateBody', { version: currentVersion })}
          </Text>
          <View style={{ marginTop: 18 }}>
            <Button label={t('update.checkForUpdates')} variant="tonal" onPress={handleCheck} />
          </View>
        </Surface>
      )}

      {/* ── Check / Download Error ─────────────────────────────────────── */}
      {isFailed && !checking && !isDownloading && (
        <Surface level={1} style={{ padding: 22, marginBottom: 18, alignItems: 'center' }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: alpha(theme.error, 0.14),
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Ionicons name="cloud-offline-outline" size={28} color={theme.error} />
          </View>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
            {dlError ? t('update.downloadFailed') : t('update.failedToCheck')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Button
              label={dlError ? 'update.retry' : 'update.retry'}
              variant="tonal"
              onPress={dlError ? handleDownload : handleCheck}
            />
          </View>
        </Surface>
      )}

      {/* ── Update Available ──────────────────────────────────────────── */}
      {isUpdateAvailable && release && (
        <Surface level={1} style={{ padding: 20, marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: alpha(theme.primary, 0.12),
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 14,
              }}
            >
              <Ionicons name="arrow-up-circle" size={24} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>
                {t('update.available', { version: release.version })}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 3 }}>
                {t('update.currentVersion', { version: currentVersion })}
              </Text>
            </View>
          </View>

          {/* Release notes */}
          {hasNotes && (
            <View style={{ marginBottom: 18 }}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>
                {t('update.whatsNew')}
              </Text>

              {notes.newFeatures.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 }}>
                    {t('update.newFeatures').toUpperCase()}
                  </Text>
                  {notes.newFeatures.map((item, i) => (
                    <Text key={i} style={{ color: theme.text, fontSize: 13.5, lineHeight: 20, marginLeft: 4 }}>
                      {'• '}{item}
                    </Text>
                  ))}
                </View>
              )}

              {notes.improvements.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 }}>
                    {t('update.improvements').toUpperCase()}
                  </Text>
                  {notes.improvements.map((item, i) => (
                    <Text key={i} style={{ color: theme.text, fontSize: 13.5, lineHeight: 20, marginLeft: 4 }}>
                      {'• '}{item}
                    </Text>
                  ))}
                </View>
              )}

              {notes.bugFixes.length > 0 && (
                <View>
                  <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 }}>
                    {t('update.bugFixes').toUpperCase()}
                  </Text>
                  {notes.bugFixes.map((item, i) => (
                    <Text key={i} style={{ color: theme.text, fontSize: 13.5, lineHeight: 20, marginLeft: 4 }}>
                      {'• '}{item}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}

          {!hasNotes && release.body ? (
            <View style={{ marginBottom: 18 }}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>
                {t('update.whatsNew')}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 13.5, lineHeight: 20 }}>
                {release.body}
              </Text>
            </View>
          ) : null}

          {/* APK size */}
          {release.apkSize > 0 && (
            <Text style={{ color: theme.textMuted, fontSize: 12.5, marginBottom: 14 }}>
              {formatBytes(release.apkSize)}
            </Text>
          )}

          {/* Actions */}
          <View style={{ gap: 10 }}>
            <Button label={t('update.downloadUpdate')} onPress={handleDownload} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label={t('update.later')} variant="tonal" onPress={handleLater} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={t('update.skipThisVersion')} variant="text" onPress={handleSkip} />
              </View>
            </View>
          </View>
        </Surface>
      )}

      {/* ── Downloading ───────────────────────────────────────────────── */}
      {isDownloading && (
        <Surface level={1} style={{ padding: 22, marginBottom: 18 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>
            {t('update.downloading')}
          </Text>
          {release && (
            <Text style={{ color: theme.textMuted, fontSize: 13.5, textAlign: 'center', marginBottom: 16 }}>
              {t('update.downloadingVersion', { version: release.version })}
            </Text>
          )}

          <ProgressBar value={pct / 100} height={6} style={{ marginBottom: 10 }} />

          <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 18 }}>
            {progress.totalBytes > 0
              ? t('update.downloadProgress', {
                  downloaded: formatBytes(progress.bytesWritten),
                  total: formatBytes(progress.totalBytes),
                })
              : t('update.downloadPercent', { pct: pct || 0 })}
          </Text>

          <View style={{ alignItems: 'center' }}>
            <Button label={t('update.cancel')} variant="text" onPress={handleCancel} />
          </View>
        </Surface>
      )}

      {/* ── Ready to Install ──────────────────────────────────────────── */}
      {isReadyToInstall && (
        <Surface level={1} style={{ padding: 22, marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: alpha(theme.primary, 0.12),
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 14,
              }}
            >
              <Ionicons name="checkmark-circle" size={28} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>
                {t('update.updateReady')}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 13.5, marginTop: 3 }}>
                {t('update.updateReadyBody', { version: downloadedVersion })}
              </Text>
            </View>
          </View>

          <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 16 }}>
            {t('update.tapToInstall')}
          </Text>

          {installResult && (
            <View
              style={{
                padding: 12,
                borderRadius: RADIUS.sm,
                backgroundColor: alpha(theme.error, 0.12),
                marginBottom: 14,
              }}
            >
              <Text style={{ color: theme.error, fontSize: 13 }}>{installResult}</Text>
            </View>
          )}

          <Button label={t('update.installUpdate')} onPress={handleInstall} />
        </Surface>
      )}
    </ScrollView>
  );
}
