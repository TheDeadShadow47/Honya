// Material Design 3 inspired token sets. No hardcoded component colors elsewhere.
export const THEMES = {
  dark: {
    key: 'dark',
    name: 'Midnight',
    description: 'Balanced dark theme',
    background: '#101014',
    surface: '#17171d',
    surface1: '#1d1d25',
    surface2: '#24242e',
    surface3: '#2b2b37',
    outline: '#3a3a46',
    primary: '#b7a4ff',
    onPrimary: '#241a55',
    primaryContainer: '#3b2f7a',
    onPrimaryContainer: '#e6ddff',
    secondaryContainer: '#332f45',
    text: '#e7e4ee',
    textMuted: '#a49fb4',
    error: '#ffb4ab',
  },
  light: {
    key: 'light',
    name: 'Daylight',
    description: 'Clean light theme',
    background: '#fdfbff',
    surface: '#ffffff',
    surface1: '#f4f1fa',
    surface2: '#eeeaf6',
    surface3: '#e7e2f2',
    outline: '#cfc9db',
    primary: '#5b45b8',
    onPrimary: '#ffffff',
    primaryContainer: '#e6ddff',
    onPrimaryContainer: '#20005f',
    secondaryContainer: '#e6e0ef',
    text: '#1c1b20',
    textMuted: '#5e5a68',
    error: '#ba1a1a',
  },
  oled: {
    key: 'oled',
    name: 'Onyx',
    description: 'Pure black OLED',
    background: '#000000',
    surface: '#000000',
    surface1: '#0e0e12',
    surface2: '#16161c',
    surface3: '#1e1e26',
    outline: '#2a2a33',
    primary: '#b7a4ff',
    onPrimary: '#241a55',
    primaryContainer: '#332569',
    onPrimaryContainer: '#e6ddff',
    secondaryContainer: '#241f33',
    text: '#ededf2',
    textMuted: '#9c97a8',
    error: '#ffb4ab',
  },
  forest: {
    key: 'forest',
    name: 'Forest',
    description: 'Earthy green tones',
    background: '#0f1512',
    surface: '#131a16',
    surface1: '#18211c',
    surface2: '#1d2821',
    surface3: '#233028',
    outline: '#2f3d34',
    primary: '#8fd4a8',
    onPrimary: '#0d2f1c',
    primaryContainer: '#1d3f2c',
    onPrimaryContainer: '#c9f0d6',
    secondaryContainer: '#203026',
    text: '#e2ece5',
    textMuted: '#a0b0a5',
    error: '#ffb4ab',
  },
  blossom: {
    key: 'blossom',
    name: 'Blossom',
    description: 'Soft rose light',
    background: '#fff8f9',
    surface: '#ffffff',
    surface1: '#fdeef1',
    surface2: '#f8e3e8',
    surface3: '#f2d6dc',
    outline: '#d8c0c6',
    primary: '#b0485f',
    onPrimary: '#ffffff',
    primaryContainer: '#ffd9e0',
    onPrimaryContainer: '#400412',
    secondaryContainer: '#f1dce0',
    text: '#241a1c',
    textMuted: '#6e6063',
    error: '#ba1a1a',
  },
  honya: {
    key: 'honya',
    name: 'Honya Sakura',
    description: 'Pure black with sakura pink accents',
    background: '#000000',
    surface: '#000000',
    surface1: '#0a0a0f',
    surface2: '#111118',
    surface3: '#181822',
    outline: '#2a2a35',
    primary: '#ED8DB0',
    onPrimary: '#000000',
    primaryContainer: '#3d1f2e',
    onPrimaryContainer: '#FFF8F3',
    secondaryContainer: '#1a1218',
    text: '#FFF8F3',
    textMuted: '#a89ba0',
    error: '#ff6b6b',
  },
};

export const isThemeDark = (t) => {
  const hex = String(t.background ?? '#000000').replace('#', '');
  const r = parseInt(hex.slice(0, 2) || '0', 16);
  const g = parseInt(hex.slice(2, 4) || '0', 16);
  const b = parseInt(hex.slice(4, 6) || '0', 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
};

export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };
export const READER_BACKGROUNDS = [
  { key: 'black', name: 'Pure black', bg: '#000000', fg: '#FFF8F3' },
  { key: 'dark', name: 'Dark', bg: '#15161a', fg: '#e2e2e6' },
  { key: 'mocha', name: 'Mocha', bg: '#2a211f', fg: '#e8d9c8' },
  { key: 'sepia', name: 'Sepia', bg: '#f4ecd8', fg: '#4a3c26' },
  { key: 'white', name: 'White', bg: '#ffffff', fg: '#16161a' },
];

/* ---------- shared layout tokens ----------
 * Single source of truth for spacing, type scale and elevation so every screen
 * uses the same rhythm instead of ad-hoc numbers.
 */
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const TYPE = {
  display: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
  section: { fontSize: 16, fontWeight: '800', letterSpacing: -0.1 },
  body: { fontSize: 14.5, fontWeight: '500' },
  bodyStrong: { fontSize: 14.5, fontWeight: '700' },
  label: { fontSize: 12.5, fontWeight: '600' },
  caption: { fontSize: 11.5, fontWeight: '600' },
};

/** Minimum comfortable Android touch target. */
export const TOUCH = 48;

/** Elevation that stays cheap on Android (no shadow rasterisation on low levels). */
export const ELEVATION = {
  none: {},
  low: { elevation: 2 },
  medium: { elevation: 4 },
  high: { elevation: 8 },
};

/** Adds an alpha channel to a #rrggbb token without allocating a color object. */
export const alpha = (hex, a = 1) => {
  const v = Math.round(Math.min(Math.max(a, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${v}`;
};
