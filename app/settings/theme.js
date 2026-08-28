import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import { RADIUS, THEMES, themeName, themeDescription } from '../../theme/theme';
import Ripple from '../../components/Ripple';
import { SectionLabel } from '../../components/MD3';

function ThemePreview({ theme, selected, onPress, t }) {
  return (
    <Ripple onPress={onPress}>
      <View
        style={{
          borderRadius: RADIUS.lg,
          overflow: 'hidden',
          backgroundColor: theme.background,
          borderWidth: 2,
          borderColor: selected ? theme.primary : 'transparent',
        }}
      >
        <View style={{ padding: 14, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{themeName(t, theme)}</Text>
            {selected ? (
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: theme.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="checkmark" size={15} color={theme.onPrimary} />
              </View>
            ) : null}
          </View>
          {theme.description ? (
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>{themeDescription(t, theme)}</Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
            {[theme.primary, theme.primaryContainer, theme.secondaryContainer, theme.surface2, theme.outline].map(
              (c, i) => (
                <View
                  key={i}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: c,
                    borderWidth: 1,
                    borderColor: 'rgba(128,128,128,0.3)',
                  }}
                />
              ),
            )}
          </View>

          <View
            style={{
              backgroundColor: theme.surface1,
              borderRadius: RADIUS.md,
              padding: 10,
              gap: 6,
              marginTop: 2,
            }}
          >
            <View style={{ height: 10, width: '60%', borderRadius: 5, backgroundColor: theme.surface3 }} />
            <View style={{ height: 10, width: '42%', borderRadius: 5, backgroundColor: theme.surface3 }} />
            <View
              style={{
                alignSelf: 'flex-start',
                marginTop: 6,
                paddingHorizontal: 14,
                height: 30,
                borderRadius: RADIUS.pill,
                backgroundColor: theme.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.onPrimary, fontSize: 11, fontWeight: '800' }}>Aa</Text>
            </View>
          </View>
        </View>
      </View>
    </Ripple>
  );
}

export default function ThemeScreen() {
  const theme = useAppTheme();
  const { t: translate } = useI18n();
  const currentKey = useStore((s) => s.prefs.theme);
  const setPref = useStore((s) => s.setPref);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionLabel>{translate('settingsTheme.title')}</SectionLabel>
      <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>
        {translate('settingsTheme.subtitle')}
      </Text>
      <View style={{ gap: 12 }}>
        {Object.values(THEMES).map((t) => (
          <ThemePreview
            key={t.key}
            theme={t}
            t={translate}
            selected={t.key === currentKey}
            onPress={() => setPref('theme', t.key)}
          />
        ))}
      </View>
    </ScrollView>
  );
}
