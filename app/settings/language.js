import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { SectionLabel } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import { RADIUS } from '../../theme/theme';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, setLanguage, applyDirection } from '../../lib/i18n';
import { useI18n } from '../../hooks/useI18n';

function LanguageOption({ language, label, selected, onPress }) {
  const theme = useAppTheme();
  return (
    <Ripple onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: theme.outline,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 36,
              height: 24,
              borderRadius: 4,
              backgroundColor: theme.surface2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>
              {language.toUpperCase()}
            </Text>
          </View>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '500' }}>{label}</Text>
        </View>
        {selected ? (
          <Ionicons name="checkmark" size={20} color={theme.primary} />
        ) : null}
      </View>
    </Ripple>
  );
}

export default function LanguageScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const currentLang = useStore((s) => s.prefs.lang);
  const setPref = useStore((s) => s.setPref);

  const handleSelect = (lang) => {
    setPref('lang', lang);
    setLanguage(lang);
    applyDirection();
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionLabel>{t('settingsLanguage.title')}</SectionLabel>
      <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>
        {t('settingsLanguage.subtitle')}
      </Text>
      <View
        style={{
          borderRadius: RADIUS.lg,
          overflow: 'hidden',
          backgroundColor: theme.surface1,
        }}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <LanguageOption
            key={lang}
            language={lang}
            label={LANGUAGE_LABELS[lang]}
            selected={lang === currentLang}
            onPress={() => handleSelect(lang)}
          />
        ))}
      </View>
    </ScrollView>
  );
}
