// Regression checks for the appearance-mode + theme-identity palette system.
// Run with: node scripts/test-theme-system.js

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { READER_BACKGROUNDS, THEMES } from '../theme/theme.js';
import {
  APPEARANCE_KEYS,
  DEFAULT_APPEARANCE_KEY,
  DEFAULT_THEME_KEY,
  inferAppearance,
  isAppearanceKey,
  isPaletteDark,
  isThemeKey,
  normalizeThemePrefs,
  READER_BACKGROUND_OPTIONS,
  resolveActivePalette,
  resolveReaderBackground,
  selectActivePalette,
} from '../theme/palette.js';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const IDENTITY_KEYS = [
  'dark', 'light', 'oled', 'forest', 'blossom', 'honya', 'ocean', 'amethyst',
  'ember', 'arctic', 'coffee', 'sage', 'rosewood', 'parchment', 'lemon',
];
const TOKEN_KEYS = [
  'background', 'surface', 'surface1', 'surface2', 'surface3', 'outline',
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondaryContainer', 'text', 'textMuted', 'error',
];
const HEX = /^#[0-9a-f]{6}$/i;

check('all 15 original identities are available with unchanged names and descriptions', () => {
  assert.deepEqual(Object.keys(THEMES), IDENTITY_KEYS);
  assert.equal(THEMES.honya.name, 'Honya Sakura');
  assert.equal(THEMES.honya.description, 'Pure black with sakura pink accents');
  assert.equal(THEMES.parchment.name, 'Parchment');
  assert.equal(THEMES.ocean.name, 'Ocean');
});

check('every identity × appearance combination exposes complete six-digit hex tokens', () => {
  for (const identityKey of IDENTITY_KEYS) {
    for (const appearance of APPEARANCE_KEYS) {
      const palette = resolveActivePalette(appearance, identityKey);
      assert.equal(palette.appearance, appearance);
      assert.equal(palette.identityKey, identityKey);
      for (const token of TOKEN_KEYS) assert.match(palette[token], HEX);
    }
  }
});

check('AMOLED keeps pure black foundations and light text for every identity', () => {
  for (const identityKey of IDENTITY_KEYS) {
    const palette = resolveActivePalette('amoled', identityKey);
    assert.equal(palette.background, '#000000');
    assert.equal(palette.surface, '#000000');
    assert.equal(isPaletteDark(palette), true);
    assert.notEqual(palette.text, palette.background);
  }
});

check('AMOLED + Honya Sakura reproduces the original Honya palette exactly', () => {
  const active = resolveActivePalette('amoled', 'honya');
  for (const token of [...TOKEN_KEYS, 'key', 'name', 'description', 'nameKey', 'descriptionKey']) {
    assert.equal(active[token], THEMES.honya[token]);
  }
});

check('all combinations meet baseline text and accent contrast', () => {
  const luminance = (hex) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((value) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (a, b) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  for (const identityKey of IDENTITY_KEYS) {
    for (const appearance of APPEARANCE_KEYS) {
      const palette = resolveActivePalette(appearance, identityKey);
      assert.ok(contrast(palette.text, palette.background) >= 4.5, `${identityKey} + ${appearance} text contrast`);
      assert.ok(contrast(palette.textMuted, palette.background) >= 4, `${identityKey} + ${appearance} muted text contrast`);
      assert.ok(contrast(palette.primary, palette.background) >= 3, `${identityKey} + ${appearance} accent contrast`);
      assert.ok(contrast(palette.onPrimary, palette.primary) >= 4, `${identityKey} + ${appearance} on-primary contrast`);
      assert.ok(contrast(palette.error, palette.background) >= 4.5, `${identityKey} + ${appearance} error contrast`);
    }
  }
});

check('identity-sensitive surfaces keep distinctive identities from becoming generic', () => {
  for (const appearance of APPEARANCE_KEYS) {
    const surfaces = new Set(IDENTITY_KEYS.map((key) => resolveActivePalette(appearance, key).surface2));
    assert.equal(surfaces.size, IDENTITY_KEYS.length);
  }
  const coffee = resolveActivePalette('dark', 'coffee');
  const ocean = resolveActivePalette('dark', 'ocean');
  assert.notEqual(coffee.surface2, ocean.surface2);
  assert.notEqual(coffee.outline, ocean.outline);
  assert.notEqual(coffee.primary, ocean.primary);
});

check('appearance and identity selectors are independent and stable', () => {
  const lightHonya = selectActivePalette({ appearance: 'light', theme: 'honya' });
  const amoledHonya = selectActivePalette({ appearance: 'amoled', theme: 'honya' });
  assert.equal(lightHonya.identityKey, 'honya');
  assert.equal(amoledHonya.identityKey, 'honya');
  assert.notEqual(lightHonya.background, amoledHonya.background);
  assert.equal(selectActivePalette({ appearance: 'light', theme: 'honya' }), lightHonya);

  const ocean = selectActivePalette({ appearance: 'dark', theme: 'ocean' });
  const coffee = selectActivePalette({ appearance: 'dark', theme: 'coffee' });
  assert.equal(ocean.appearance, coffee.appearance);
  assert.notEqual(ocean.primary, coffee.primary);
});

check('legacy identities infer the expected appearance', () => {
  const expected = {
    honya: 'amoled', oled: 'amoled',
    light: 'light', blossom: 'light', arctic: 'light', parchment: 'light',
    dark: 'dark', forest: 'dark', ocean: 'dark', amethyst: 'dark', ember: 'dark',
    coffee: 'dark', sage: 'dark', rosewood: 'dark', lemon: 'dark',
  };
  for (const [identity, appearance] of Object.entries(expected)) {
    assert.equal(inferAppearance(identity), appearance);
  }
});

check('pref normalization preserves explicit choices, repairs invalid values, and keeps unknown keys', () => {
  assert.deepEqual(
    { theme: normalizeThemePrefs({ theme: 'ocean', appearance: 'light', fontSize: 22 }).theme,
      appearance: normalizeThemePrefs({ theme: 'ocean', appearance: 'light', fontSize: 22 }).appearance,
      fontSize: normalizeThemePrefs({ theme: 'ocean', appearance: 'light', fontSize: 22 }).fontSize },
    { theme: 'ocean', appearance: 'light', fontSize: 22 },
  );
  assert.equal(normalizeThemePrefs({ theme: 'ocean' }).appearance, 'dark');
  assert.equal(normalizeThemePrefs({ theme: 'honya' }).appearance, 'amoled');
  assert.equal(normalizeThemePrefs({ theme: 'bogus', appearance: 'light' }).theme, DEFAULT_THEME_KEY);
  assert.equal(normalizeThemePrefs({ theme: 'bogus', appearance: 'light' }).appearance, 'light');
  assert.equal(normalizeThemePrefs({ theme: 'ocean', appearance: 'bogus' }).appearance, 'dark');
  assert.equal(normalizeThemePrefs(null).appearance, DEFAULT_APPEARANCE_KEY);
  const first = normalizeThemePrefs({ theme: 'ocean', appearance: 'dark', extra: true });
  assert.deepEqual(normalizeThemePrefs(first), first);
});

check('preferences survive a storage round-trip without changing either axis', () => {
  const saved = { theme: 'coffee', appearance: 'light', fontSize: 21, readerBackground: 'black' };
  const written = JSON.stringify(saved);
  const afterRestart = normalizeThemePrefs(JSON.parse(written));
  assert.deepEqual(afterRestart, saved);
  assert.equal(selectActivePalette(afterRestart), resolveActivePalette('light', 'coffee'));
  assert.equal(resolveReaderBackground(afterRestart.readerBackground, selectActivePalette(afterRestart)).key, 'black');
});

check('reader backgrounds are additive and existing presets are unchanged', () => {
  assert.deepEqual(READER_BACKGROUND_OPTIONS.map((option) => option.key), ['app', ...READER_BACKGROUNDS.map((b) => b.key)]);
  for (const preset of READER_BACKGROUNDS) {
    assert.deepEqual(resolveReaderBackground(preset.key, null), preset);
  }
  const appPalette = resolveActivePalette('amoled', 'honya');
  assert.equal(resolveReaderBackground('app', appPalette).bg, appPalette.background);
  assert.equal(resolveReaderBackground('app', appPalette).fg, appPalette.text);
  assert.equal(resolveReaderBackground('unknown', null).key, 'dark');
});

check('locale files retain all prior keys and values and gain all appearance keys', () => {
  const required = [
    'more.appearance', 'more.theme', 'settingsTheme.title', 'settingsTheme.subtitle',
    'settingsBackup.includedSettings', 'starterGuide.theme.title', 'starterGuide.theme.body',
    'settingsTheme.appearanceTitle', 'settingsTheme.appearanceSubtitle',
    'settingsTheme.identityTitle', 'settingsTheme.identitySubtitle',
    'appearance.light.name', 'appearance.light.description',
    'appearance.dark.name', 'appearance.dark.description',
    'appearance.amoled.name', 'appearance.amoled.description',
    'reader.backgroundApp',
    ...IDENTITY_KEYS.flatMap((key) => [`theme.${key}.name`, `theme.${key}.description`]),
  ];
  const entries = (source) => new Map(
    [...source.matchAll(/^\s*'([^']+)':\s*(.*?),?$/gm)].map((match) => [match[1], match[2].replace(/,\s*$/, '').trim()]),
  );
  for (const locale of ['en', 'de', 'fr', 'it', 'ar']) {
    const url = new URL(`../lib/locales/${locale}.js`, import.meta.url);
    const source = readFileSync(url, 'utf8');
    const current = entries(source);
    for (const key of required) assert.ok(current.has(key), `${locale}.js missing ${key}`);

    // Compare against the committed version: additions are fine, removals or edits are not.
    let previous;
    try {
      previous = execFileSync('git', ['show', `HEAD:lib/locales/${locale}.js`], { encoding: 'utf8' });
    } catch {
      continue;
    }
    for (const [key, value] of entries(previous)) {
      assert.equal(current.get(key), value, `${locale}.js changed or removed '${key}'`);
    }
  }
});

check('active palette is wired into root chrome, navigation, and all reader surfaces', () => {
  const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const root = source('../app/_layout.js');
  assert.match(root, /useAppTheme\(\)/);
  assert.match(root, /theme\.isDark/);

  const header = source('../components/NovelHeader.js');
  assert.match(header, /useAppTheme\(\)/);
  assert.match(header, /theme\.isDark/);

  const chapter = source('../app/reader/[chapterId].js');
  assert.match(chapter, /useAppTheme\(\)/);
  assert.match(chapter, /resolveReaderBackground\(/);
  assert.match(chapter, /READER_BACKGROUND_OPTIONS/);

  const document = source('../app/document/[id].js');
  assert.match(document, /resolveReaderBackground\(/);
  assert.match(document, /READER_BACKGROUND_OPTIONS/);

  const readerSettings = source('../app/settings/reader.js');
  assert.match(readerSettings, /READER_BACKGROUND_OPTIONS/);
  assert.match(readerSettings, /b\.nameKey \? t\(b\.nameKey\) : b\.name/);

  const store = source('../store/useStore.js');
  assert.match(store, /normalizeThemePrefs\(merged\)/);
  assert.match(store, /isThemeKey\(value\)/);
  assert.match(store, /isAppearanceKey\(value\)/);
  assert.match(store, /readerBackground: 'black'/);
});

check('palette and appearance key sets stay in sync with the resolver', () => {
  assert.deepEqual(APPEARANCE_KEYS, ['light', 'dark', 'amoled']);
  for (const key of APPEARANCE_KEYS) assert.equal(isAppearanceKey(key), true);
  for (const key of IDENTITY_KEYS) assert.equal(isThemeKey(key), true);
  assert.equal(isAppearanceKey('honya'), false);
  assert.equal(isThemeKey('amoled'), false);
});

console.log(`\n${passed} passed`);
