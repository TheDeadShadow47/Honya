/**
 * Centralized localization system for Honya.
 *
 * Usage:
 *   import { t, setLanguage, getLanguage, isRTL } from '../lib/i18n';
 *   const label = t('nav.library');
 *
 * Languages:
 *   en  – English (default / fallback)
 *   ar  – Arabic (RTL)
 *   fr  – French
 *
 * Adding a new language:
 *   1. Create lib/locales/<code>.js with all keys.
 *   2. Add the code to SUPPORTED_LANGUAGES below.
 *   3. Call setLanguage('<code>') from the language settings screen.
 */

import { Platform } from 'react-native';
import en from './locales/en';
import ar from './locales/ar';
import fr from './locales/fr';

const locales = { en, ar, fr };

// ---------------------------------------------------------------------------
// Supported languages
// ---------------------------------------------------------------------------

export const SUPPORTED_LANGUAGES = ['en', 'ar', 'fr'];

/** Human-readable labels shown in the language picker. */
export const LANGUAGE_LABELS = {
  en: 'English',
  ar: 'العربية',
  fr: 'Français',
};

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let currentLang = 'en';

// ---------------------------------------------------------------------------
// Loaders – each locale is required once and cached
// ---------------------------------------------------------------------------

function getLocale(lang) {
  return locales[lang] || locales['en'];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Translate a dot-path key.
 *
 * Falls back to English when the current locale lacks a key, so a key that is
 * missing in only one language never leaks its identifier. If a key is missing
 * in EVERY locale that is a genuine developer error — we log it loudly (console)
 * but return an empty string rather than the raw key, so an internal
 * translation identifier can never become user-facing text.
 *
 * Supports simple interpolation: t('chapter.remaining', { n: 5 }) → "5 remaining"
 * when the template contains {{n}}.
 */
export function t(key, params = {}) {
  let value = getLocale(currentLang)[key] ?? getLocale('en')[key];

  if (value === undefined || value === null) {
    // No translation exists anywhere. Do not leak the raw key to the user.
    if (__DEV__) {
      console.warn(`[i18n] Missing translation for key "${key}" in all locales`);
    }
    return '';
  }

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

/**
 * Heuristic: returns true if the text appears to be written in an RTL script
 * (predominantly Arabic/Uyghur characters). Used by the reader to set content
 * direction independently of the app's UI language.
 *
 * Checks the first 1 000 chars so it works even when the very first sentence
 * of an Arabic novel is a short Latin-language blurb or title.
 */
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
