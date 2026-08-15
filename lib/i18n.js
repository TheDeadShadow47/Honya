// Centralized localization: t(), setLanguage(), getLanguage(), isRTL(); locales en/ar/fr.
import { Platform } from 'react-native';
import en from './locales/en';
import ar from './locales/ar';
import fr from './locales/fr';

const locales = { en, ar, fr };

// Supported languages
export const SUPPORTED_LANGUAGES = ['en', 'ar', 'fr'];

/** Human-readable labels shown in the language picker. */
export const LANGUAGE_LABELS = {
  en: 'English',
  ar: 'العربية',
  fr: 'Français',
};

// Internal state
let currentLang = 'en';

function getLocale(lang) {
  return locales[lang] || locales['en'];
}

// Translate a dot-path key, falling back to English then the key itself; supports {{placeholder}} interpolation.
export function t(key, params = {}) {
  let value = getLocale(currentLang)[key] ?? getLocale('en')[key] ?? key;

  // Simple {{placeholder}} interpolation
  if (params && typeof value === 'string') {
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

// Heuristic: true if text looks predominantly Arabic (first 1000 chars), for per-content reading direction.
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
      // skip punctuation / spacing marks
    } else if (c > 127) {
      total++; // any other non-ASCII char counts toward the "non-Latin" pool
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
