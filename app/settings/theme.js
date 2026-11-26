import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import { alpha, RADIUS, THEMES, themeDescription, themeName } from '../../theme/theme';
import { APPEARANCES, APPEARANCE_KEYS, resolveActivePalette } from '../../theme/palette';
import Ripple from '../../components/Ripple';
import { SectionLabel } from '../../components/MD3';

function AppearanceCard({ mode, identityKey, selected, onPress, t }) {
  const preview = resolveActivePalette(mode.key, identityKey);
  return (
    <Ripple onPress={onPress}>
      <View
        style={{
          borderRadius: RADIUS.lg,
          overflow: 'hidden',
          backgroundColor: preview.background,
          borderWidth: 2,
          borderColor: selected ? preview.primary : alpha(preview.outline, 0.6),
        }}
      >
        <View style={{ padding: 12, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: preview.text, fontWeight: '800', fontSize: 14 }}>{t(mode.nameKey)}</Text>
            {selected ? (
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: preview.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="checkmark" size={14} color={preview.onPrimary} />
              </View>
            ) : null}
          </View>
          <Text style={{ color: preview.textMuted, fontSize: 11, lineHeight: 15 }}>{t(mode.descriptionKey)}</Text>
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
            {[preview.surface1, preview.surface2, preview.surface3, preview.primary].map((color, index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  height: 18,
                  borderRadius: RADIUS.sm,
                  backgroundColor: color,
                  borderWidth: 1,
                  borderColor: alpha(preview.outline, 0.5),
                }}
              />
            ))}
          </View>
        </View>
      </View>
    </Ripple>
  );
}

function IdentityCard({ identity, appearance, selected, onPress, t }) {
  const preview = resolveActivePalette(appearance, identity.key);
  return (
    <Ripple onPress={onPress}>
      <View
        style={{
          borderRadius: RADIUS.lg,
          overflow: 'hidden',
          backgroundColor: preview.background,
          borderWidth: 2,
          borderColor: selected ? preview.primary : alpha(preview.outline, 0.6),
        }}
      >
        <View style={{ padding: 14, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: preview.text, fontWeight: '800', fontSize: 15 }}>{themeName(t, identity)}</Text>
            {selected ? (
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: preview.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="checkmark" size={15} color={preview.onPrimary} />
              </View>
            ) : null}
          </View>
          {identity.description || identity.descriptionKey ? (
            <Text style={{ color: preview.textMuted, fontSize: 12 }}>{themeDescription(t, identity)}</Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
            {[preview.primary, preview.primaryContainer, preview.secondaryContainer, preview.surface2, preview.outline].map(
              (color, index) => (
                <View
                  key={index}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: color,
                    borderWidth: 1,
                    borderColor: alpha(preview.outline, 0.6),
                  }}
                />
              ),
            )}
          </View>

          <View
            style={{
              backgroundColor: preview.surface1,
              borderRadius: RADIUS.md,
              padding: 10,
              gap: 6,
              marginTop: 2,
            }}
          >
            <View style={{ height: 10, width: '60%', borderRadius: 5, backgroundColor: preview.surface3 }} />
            <View style={{ height: 10, width: '42%', borderRadius: 5, backgroundColor: preview.surface3 }} />
            <View
              style={{
                alignSelf: 'flex-start',
                marginTop: 6,
                paddingHorizontal: 14,
                height: 30,
                borderRadius: RADIUS.pill,
                backgroundColor: preview.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: preview.onPrimary, fontSize: 11, fontWeight: '800' }}>Aa</Text>
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
  const appearance = useStore((s) => s.prefs.appearance);
  const identityKey = useStore((s) => s.prefs.theme);
  const setPref = useStore((s) => s.setPref);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionLabel>{translate('settingsTheme.appearanceTitle')}</SectionLabel>
      <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>
        {translate('settingsTheme.appearanceSubtitle')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        {APPEARANCE_KEYS.map((key) => (
          <View key={key} style={{ flex: 1, minWidth: 100 }}>
            <AppearanceCard
              mode={APPEARANCES[key]}
              identityKey={identityKey}
              selected={key === appearance}
              onPress={() => setPref('appearance', key)}
              t={translate}
            />
          </View>
        ))}
      </View>

      <SectionLabel>{translate('settingsTheme.identityTitle')}</SectionLabel>
      <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>
        {translate('settingsTheme.identitySubtitle')}
      </Text>
      <View style={{ gap: 12 }}>
        {Object.values(THEMES).map((identity) => (
          <IdentityCard
            key={identity.key}
            identity={identity}
            appearance={appearance}
            selected={identity.key === identityKey}
            onPress={() => setPref('theme', identity.key)}
            t={translate}
          />
        ))}
      </View>
    </ScrollView>
  );
}
