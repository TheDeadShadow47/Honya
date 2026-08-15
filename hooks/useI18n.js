// Hook exposing the current translation function and language info, re-rendering on language change.

import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { getLanguage, setLanguage, isRTL, applyDirection, t as translate } from '../lib/i18n';

// Returns the translation function bound to the current language: const { t, lang, rtl } = useI18n();
export function useI18n() {
  const lang = useStore((s) => s.prefs.lang);

  // Keep the in-memory language in sync with the persisted preference.
  useEffect(() => {
    if (getLanguage() !== lang) {
      setLanguage(lang);
      applyDirection();
    }
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return { t: translate, lang, rtl: isRTL() };
}
