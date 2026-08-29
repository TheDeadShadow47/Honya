import { useState, useEffect, useCallback } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { useI18n } from '../hooks/useI18n';
import { Dialog, Button } from './MD3';
import { checkWhatsNew, markWhatsNewSeen, parseReleaseNotes } from '../lib/updateManager';
import { alpha } from '../theme/theme';

/** What's New dialog — shown once after an app update is installed. */
export default function WhatsNew({ onDone } = {}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    checkWhatsNew()
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setData(result);
          setVisible(true);
        } else {
          onDone?.();
        }
      })
      .catch(() => onDone?.());
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = useCallback(async () => {
    setVisible(false);
    await markWhatsNewSeen();
    onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return null;

  const notes = parseReleaseNotes(data.body);
  const hasNotes = notes.newFeatures.length || notes.improvements.length || notes.bugFixes.length;

  return (
    <Dialog visible={visible} title={t('update.whatsNewTitle', { version: data.version })} onDismiss={handleDismiss}>
      <View style={{ maxHeight: 400 }}>
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
            <Ionicons name="sparkles" size={30} color={theme.primary} />
          </View>
        </View>

        {hasNotes ? (
          <>
            {notes.newFeatures.length > 0 && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>
                  {t('update.newFeatures').toUpperCase()}
                </Text>
                {notes.newFeatures.map((item, i) => (
                  <Text key={i} style={{ color: theme.text, fontSize: 13.5, lineHeight: 22, marginLeft: 4 }}>
                    {'• '}{item}
                  </Text>
                ))}
              </View>
            )}

            {notes.improvements.length > 0 && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>
                  {t('update.improvements').toUpperCase()}
                </Text>
                {notes.improvements.map((item, i) => (
                  <Text key={i} style={{ color: theme.text, fontSize: 13.5, lineHeight: 22, marginLeft: 4 }}>
                    {'• '}{item}
                  </Text>
                ))}
              </View>
            )}

            {notes.bugFixes.length > 0 && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>
                  {t('update.bugFixes').toUpperCase()}
                </Text>
                {notes.bugFixes.map((item, i) => (
                  <Text key={i} style={{ color: theme.text, fontSize: 13.5, lineHeight: 22, marginLeft: 4 }}>
                    {'• '}{item}
                  </Text>
                ))}
              </View>
            )}
          </>
        ) : data.body ? (
          <Text style={{ color: theme.textMuted, fontSize: 13.5, lineHeight: 20 }}>
            {data.body}
          </Text>
        ) : (
          <Text style={{ color: theme.textMuted, fontSize: 13.5, textAlign: 'center', lineHeight: 20 }}>
            {t('update.upToDateBody', { version: data.version })}
          </Text>
        )}
      </View>

      <View style={{ marginTop: 18 }}>
        <Button label={t('update.continue')} onPress={handleDismiss} />
      </View>
    </Dialog>
  );
}
