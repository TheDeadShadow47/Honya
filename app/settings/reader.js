import { ScrollView, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import { Chip, SectionLabel, Surface } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import { RADIUS } from '../../theme/theme';
import { READER_BACKGROUND_OPTIONS } from '../../theme/palette';

export default function ReaderSettingsScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { prefs, setPref } = useStore(useShallow((s) => ({ prefs: s.prefs, setPref: s.setPref })));

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionLabel>{t('settingsReader.background')}</SectionLabel>
      {/* One row of equal cells: every swatch and label has the same size on any width, and the
          constant 2px border means selecting an option never shifts the layout. */}
      <Surface level={1} style={{ padding: 14, marginBottom: 18, flexDirection: 'row', gap: 8 }}>
        {READER_BACKGROUND_OPTIONS.map((b) => {
          const selected = prefs.readerBackground === b.key;
          return (
            <Ripple key={b.key} onPress={() => setPref('readerBackground', b.key)} style={{ flex: 1, minWidth: 0 }}>
              <View style={{ alignItems: 'stretch', gap: 6 }}>
                <View
                  style={{
                    height: 48,
                    borderRadius: RADIUS.md,
                    backgroundColor: b.bg,
                    borderWidth: 2,
                    borderColor: selected ? theme.primary : theme.outline,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: b.fg, fontWeight: '800' }}>Aa</Text>
                </View>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={{
                    color: selected ? theme.primary : theme.textMuted,
                    fontSize: 11,
                    fontWeight: '700',
                    textAlign: 'center',
                  }}
                >
                  {b.nameKey ? t(b.nameKey) : b.name}
                </Text>
              </View>
            </Ripple>
          );
        })}
      </Surface>

      <SectionLabel>{t('settingsReader.readingMode')}</SectionLabel>
      <Surface level={1} style={{ padding: 16, marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip
            icon="swap-vertical-outline"
            label={t('settingsReader.modeScroll')}
            selected={prefs.readingMode !== 'paged'}
            onPress={() => setPref('readingMode', 'scroll')}
          />
          <Chip
            icon="swap-horizontal-outline"
            label={t('settingsReader.modePaged')}
            selected={prefs.readingMode === 'paged'}
            onPress={() => setPref('readingMode', 'paged')}
          />
        </View>
        <Text style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
          {prefs.readingMode === 'paged' ? t('settingsReader.modePagedSubtitle') : t('settingsReader.modeScrollSubtitle')}
        </Text>
        {prefs.readingMode === 'paged' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{t('settingsReader.pageTurn')}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>{t('settingsReader.pageTurnSubtitle')}</Text>
            </View>
            <Switch
              value={prefs.pageTurnAnimation === true}
              onValueChange={(v) => setPref('pageTurnAnimation', v)}
              trackColor={{ false: theme.outline, true: theme.primary }}
              thumbColor={theme.surface}
            />
          </View>
        ) : null}
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
