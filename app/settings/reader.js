import { ScrollView, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import { SectionLabel, Surface } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import { RADIUS, READER_BACKGROUNDS } from '../../theme/theme';

export default function ReaderSettingsScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { prefs, setPref } = useStore();

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionLabel>{t('settingsReader.background')}</SectionLabel>
      <Surface level={1} style={{ padding: 16, marginBottom: 18, flexDirection: 'row', gap: 12 }}>
        {READER_BACKGROUNDS.map((b) => (
          <Ripple key={b.key} onPress={() => setPref('readerBackground', b.key)}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: RADIUS.md,
                  backgroundColor: b.bg,
                  borderWidth: prefs.readerBackground === b.key ? 2 : 1,
                  borderColor: prefs.readerBackground === b.key ? theme.primary : theme.outline,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: b.fg, fontWeight: '800' }}>Aa</Text>
              </View>
              <Text
                style={{
                  color: prefs.readerBackground === b.key ? theme.primary : theme.textMuted,
                  fontSize: 11,
                  fontWeight: '700',
                }}
              >
                {b.name}
              </Text>
            </View>
          </Ripple>
        ))}
      </Surface>

      <SectionLabel>{t('settingsReader.typography')}</SectionLabel>
      <Surface level={1} style={{ padding: 16 }}>
        <Text style={{ color: theme.text, fontWeight: '700' }}>{t('settingsReader.fontsize')} · {prefs.fontSize}</Text>
        <Slider
          minimumValue={12}
          maximumValue={32}
          step={1}
          value={prefs.fontSize}
          onValueChange={(v) => setPref('fontSize', Math.round(v))}
          minimumTrackTintColor={theme.primary}
          maximumTrackTintColor={theme.outline}
          thumbTintColor={theme.primary}
        />
        <Text style={{ color: theme.text, fontWeight: '700', marginTop: 10 }}>
          {t('settingsReader.lineheight')} · {prefs.lineHeight.toFixed(1)}
        </Text>
        <Slider
          minimumValue={1.2}
          maximumValue={2.4}
          step={0.1}
          value={prefs.lineHeight}
          onValueChange={(v) => setPref('lineHeight', Math.round(v * 10) / 10)}
          minimumTrackTintColor={theme.primary}
          maximumTrackTintColor={theme.outline}
          thumbTintColor={theme.primary}
        />
        <Text style={{ color: theme.text, fontWeight: '700', marginTop: 10 }}>
          {t('settingsReader.sidepadding')} · {prefs.horizontalPadding}
        </Text>
        <Slider
          minimumValue={8}
          maximumValue={48}
          step={2}
          value={prefs.horizontalPadding}
          onValueChange={(v) => setPref('horizontalPadding', Math.round(v))}
          minimumTrackTintColor={theme.primary}
          maximumTrackTintColor={theme.outline}
          thumbTintColor={theme.primary}
        />

        <View style={{ marginTop: 18, padding: 14, borderRadius: RADIUS.md, backgroundColor: theme.surface2 }}>
          <Text style={{ color: theme.text, fontSize: prefs.fontSize, lineHeight: prefs.fontSize * prefs.lineHeight }}>
            The lantern swayed once, and the road ahead finally became visible.
          </Text>
        </View>
      </Surface>

      <SectionLabel>{t('settingsReader.behavior')}</SectionLabel>
      <Surface
        level={1}
        style={{
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: theme.text, fontWeight: '700' }}>{t('settingsReader.markReadOnOpen')}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
            {t('settingsReader.markReadOnOpenSubtitle')}
          </Text>
        </View>
        <Switch
          value={prefs.markReadOnOpen}
          onValueChange={(v) => setPref('markReadOnOpen', v)}
          trackColor={{ false: theme.outline, true: theme.primary }}
          thumbColor={theme.surface}
        />
      </Surface>
    </ScrollView>
  );
}
