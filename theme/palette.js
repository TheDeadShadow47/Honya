import { READER_BACKGROUNDS, THEMES } from './theme.js';

export const DEFAULT_THEME_KEY = 'honya';
export const DEFAULT_APPEARANCE_KEY = 'amoled';

export const APPEARANCES = {
  light: {
    key: 'light',
    nameKey: 'appearance.light.name',
    descriptionKey: 'appearance.light.description',
  },
  dark: {
    key: 'dark',
    nameKey: 'appearance.dark.name',
    descriptionKey: 'appearance.dark.description',
  },
  amoled: {
    key: 'amoled',
    nameKey: 'appearance.amoled.name',
    descriptionKey: 'appearance.amoled.description',
  },
};

export const APPEARANCE_KEYS = Object.keys(APPEARANCES);

// The legacy themes bundled an appearance with an identity. Keep the original
// look selectable when the matching mode is chosen, and use it to migrate old prefs.
export const LEGACY_APPEARANCE = {
  dark: 'dark',
  light: 'light',
  oled: 'amoled',
  forest: 'dark',
  blossom: 'light',
  honya: 'amoled',
  ocean: 'dark',
  amethyst: 'dark',
  ember: 'dark',
  arctic: 'light',
  coffee: 'dark',
  sage: 'dark',
  rosewood: 'dark',
  parchment: 'light',
  lemon: 'dark',
};

const NEUTRAL_KEYS = ['background', 'surface', 'surface1', 'surface2', 'surface3', 'outline', 'text', 'textMuted'];
const ACCENT_KEYS = ['primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'secondaryContainer'];

const BASE_NEUTRALS = {
  light: {
    background: '#fdfbff',
    surface: '#ffffff',
    surface1: '#f4f1fa',
    surface2: '#eeeaf6',
    surface3: '#e7e2f2',
    outline: '#cfc9db',
    text: '#1c1b20',
    textMuted: '#5e5a68',
  },
  dark: {
    background: '#101014',
    surface: '#17171d',
    surface1: '#1d1d25',
    surface2: '#24242e',
    surface3: '#2b2b37',
    outline: '#3a3a46',
    text: '#e7e4ee',
    textMuted: '#a49fb4',
  },
  amoled: {
    background: '#000000',
    surface: '#000000',
    surface1: '#0e0e12',
    surface2: '#16161c',
    surface3: '#1e1e26',
    outline: '#2a2a33',
    text: '#ededf2',
    textMuted: '#9c97a8',
  },
};

const TINT_STRENGTH = {
  light: { background: 0.025, surface: 0.02, surface1: 0.06, surface2: 0.1, surface3: 0.14, outline: 0.12, text: 0.04, textMuted: 0.08 },
  dark: { background: 0.06, surface: 0.08, surface1: 0.12, surface2: 0.16, surface3: 0.2, outline: 0.18, text: 0.04, textMuted: 0.1 },
  amoled: { background: 0, surface: 0, surface1: 0.1, surface2: 0.16, surface3: 0.22, outline: 0.18, text: 0.03, textMuted: 0.08 },
};

// Distinctive identities get a stronger hue in their non-native appearance so
// they never collapse into the same neutral surfaces with a different button tint.
const IDENTITY_TINT_STRENGTH = {
  forest: 1.35,
  blossom: 1.25,
  honya: 1.3,
  ocean: 1.4,
  amethyst: 1.3,
  ember: 1.4,
  arctic: 1.15,
  coffee: 1.55,
  sage: 1.2,
  rosewood: 1.45,
  parchment: 1.6,
  lemon: 1.45,
};

const IDENTITY_TINT = {
  dark: '#b7a4ff',
  oled: '#a6b1ff',
  honya: '#ed8db0',
  blossom: '#b0485f',
  parchment: '#a46a35',
  coffee: '#d39a6a',
  rosewood: '#c66a72',
  ocean: '#28b8c7',
  forest: '#8fd4a8',
};

const ERROR_BY_APPEARANCE = {
  light: '#ba1a1a',
  dark: '#ffb4ab',
  amoled: '#ff6b6b',
};

const READER_BACKGROUND_APP = {
  key: 'app',
  name: 'Use app appearance',
  nameKey: 'reader.backgroundApp',
};

const paletteCache = new Map();

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export const isAppearanceKey = (key) => Object.prototype.hasOwnProperty.call(APPEARANCES, key);
export const isThemeKey = (key) => Object.prototype.hasOwnProperty.call(THEMES, key);

export function isPaletteDark(palette) {
  return relativeLuminance(palette?.background ?? '#000000') < 0.25;
}

export function inferAppearance(themeKey) {
  return LEGACY_APPEARANCE[themeKey] ?? DEFAULT_APPEARANCE_KEY;
}

function pick(tokens, keys) {
  const out = {};
  for (const key of keys) out[key] = tokens[key];
  return out;
}

function hexToRgb(hex) {
  const value = String(hex ?? '').replace('#', '').trim();
  const normalized = value.length === 3 ? value.split('').map((c) => c + c).join('') : value.slice(0, 6);
  const n = Number.parseInt(normalized, 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function mix(from, to, amount) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function adjustForContrast(hex, against, target, direction) {
  const towards = direction === 'dark' ? '#000000' : '#ffffff';
  let candidate = hex;
  for (let i = 0; i <= 20; i += 1) {
    if (contrastRatio(candidate, against) >= target) return candidate;
    candidate = mix(candidate, towards, 0.05);
  }
  return candidate;
}

function deriveNeutrals(themeKey, appearance) {
  const identity = THEMES[themeKey];
  if (LEGACY_APPEARANCE[themeKey] === appearance) return pick(identity, NEUTRAL_KEYS);

  const base = BASE_NEUTRALS[appearance];
  const tint = IDENTITY_TINT[themeKey] ?? identity.primary;
  const strength = IDENTITY_TINT_STRENGTH[themeKey] ?? 1;
  const result = {};
  for (const key of NEUTRAL_KEYS) {
    result[key] = mix(base[key], tint, TINT_STRENGTH[appearance][key] * strength);
  }
  if (appearance === 'amoled') {
    result.background = '#000000';
    result.surface = '#000000';
  }
  return result;
}

function deriveAccents(themeKey, appearance) {
  const identity = THEMES[themeKey];
  if (LEGACY_APPEARANCE[themeKey] === appearance) return pick(identity, ACCENT_KEYS);

  const tint = IDENTITY_TINT[themeKey] ?? identity.primary;
  if (appearance === 'light') {
    return {
      primary: adjustForContrast(tint, '#ffffff', 4.5, 'dark'),
      onPrimary: '#ffffff',
      primaryContainer: mix('#ffffff', tint, 0.18),
      onPrimaryContainer: adjustForContrast(mix('#000000', tint, 0.45), '#ffffff', 4.5, 'dark'),
      secondaryContainer: mix('#ffffff', tint, 0.28),
    };
  }

  const containerBase = appearance === 'amoled' ? '#000000' : '#17171d';
  const secondaryBase = appearance === 'amoled' ? '#0e0e12' : '#24242e';
  const primary = adjustForContrast(tint, appearance === 'amoled' ? '#000000' : '#101014', 4.5, 'light');
  return {
    primary,
    onPrimary: '#000000',
    primaryContainer: mix(containerBase, tint, 0.3),
    onPrimaryContainer: adjustForContrast(mix('#ffffff', tint, 0.65), containerBase, 4.5, 'light'),
    secondaryContainer: mix(secondaryBase, tint, 0.24),
  };
}

/** Cached, immutable active palette. The token shape matches the legacy THEMES entries. */
export function resolveActivePalette(appearanceKey, themeKey) {
  const appearance = isAppearanceKey(appearanceKey) ? appearanceKey : DEFAULT_APPEARANCE_KEY;
  const theme = isThemeKey(themeKey) ? themeKey : DEFAULT_THEME_KEY;
  const cacheKey = `${appearance}:${theme}`;
  const cached = paletteCache.get(cacheKey);
  if (cached) return cached;

  const identity = THEMES[theme];
  const native = LEGACY_APPEARANCE[theme] === appearance;
  const palette = Object.freeze({
    ...identity,
    ...deriveNeutrals(theme, appearance),
    ...deriveAccents(theme, appearance),
    error: native ? identity.error : ERROR_BY_APPEARANCE[appearance],
    appearance,
    isDark: appearance !== 'light',
    identityKey: theme,
  });
  paletteCache.set(cacheKey, palette);
  return palette;
}

/** Pure selector used by useAppTheme; tests use it to verify independent switching. */
export function selectActivePalette(prefs) {
  if (!isObject(prefs)) return resolveActivePalette(DEFAULT_APPEARANCE_KEY, DEFAULT_THEME_KEY);
  return resolveActivePalette(prefs.appearance, prefs.theme);
}

/**
 * Fill in and validate only the two appearance-related pref fields.
 * Unknown prefs are preserved so older backups and future keys stay intact.
 */
export function normalizeThemePrefs(prefs) {
  const source = isObject(prefs) ? prefs : {};
  const theme = isThemeKey(source.theme) ? source.theme : DEFAULT_THEME_KEY;
  const appearance = isAppearanceKey(source.appearance) ? source.appearance : inferAppearance(theme);
  return { ...source, theme, appearance };
}

export const READER_BACKGROUNDS_APP = READER_BACKGROUND_APP;

export const READER_BACKGROUND_OPTIONS = [READER_BACKGROUND_APP, ...READER_BACKGROUNDS];

export function resolveReaderBackground(pref, activePalette) {
  const palette = isObject(activePalette) ? activePalette : selectActivePalette(null);
  if (pref === READER_BACKGROUND_APP.key) {
    return { ...READER_BACKGROUND_APP, bg: palette.background, fg: palette.text };
  }
  return (
    READER_BACKGROUNDS.find((preset) => preset.key === pref) ??
    READER_BACKGROUNDS.find((preset) => preset.key === 'dark') ??
    READER_BACKGROUNDS[0]
  );
}
