import { Platform } from 'react-native';
import en from './locales/en';
import ar from './locales/ar';
import fr from './locales/fr';
import de from './locales/de';
import it from './locales/it';

const locales = { en, ar, fr, de, it };

export const SUPPORTED_LANGUAGES = ['en', 'ar', 'fr', 'de', 'it'];

/** Human-readable labels shown in the language picker. */
export const LANGUAGE_LABELS = {
  en: 'English',
  ar: 'العربية',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
};

let currentLang = 'en';

function getLocale(lang) {
  return locales[lang] || locales['en'];
}

export function t(key, params = {}) {
  let value = getLocale(currentLang)[key] ?? getLocale('en')[key];

  if (value === undefined || value === null) {
    if (__DEV__) {
      console.warn(`[i18n] Missing translation for key "${key}" in all locales`);
    }
    return '';
  }

  if (params && typeof value === 'string') {
    // {{name:one|other}} resolves one for count 1, else other.
    value = value.replace(/\{\{([A-Za-z]+):([^}|]+)\|([^}]+)\}\}/g, (m, name, one, other) => {
      const n = Number(params[name]);
      return Number.isFinite(n) ? (n === 1 ? one : other) : one;
    });

    // {{placeholder}} interpolation
    Object.entries(params).forEach(([k, v]) => {
      value = value.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    });
  }

  return value;
}

/** Set the application language. Call this from the language settings screen. */
export function setLanguage(lang) {
  if (!SUPPORTED_LANGUAGES.includes(lang)) lang = 'en';
  currentLang = lang;
}

/** Get the current application language code. */
export function getLanguage() {
  return currentLang;
}

/** Whether the current language is RTL. */
export function isRTL() {
  return currentLang === 'ar';
}

/** True if text is predominantly an RTL script (Arabic/Uyghur). */
export function isArabicText(text) {
  if (!text) return false;
  const slice = text.slice(0, 1000);
  let arCount = 0;
  let total = 0;
  for (let i = 0; i < slice.length; i++) {
    const c = slice.charCodeAt(i);
    if ((c >= 0x0600 && c <= 0x06FF) || (c >= 0xFB50 && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFF)) {
      arCount++;
      total++;
    } else if (c >= 0x2000 && c <= 0x206F) {
    } else if (c > 127) {
      total++;
    }
  }
  if (total === 0) return false;
  return arCount / total > 0.4;
}

/** Force React Native's I18nManager to match the current language direction. */
export function applyDirection() {
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { I18nManager } = require('react-native');
      I18nManager.forceRTL(isRTL());
    } catch {}
  }
}
