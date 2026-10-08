import assert from 'node:assert/strict';
import test from 'node:test';
import { chartSvg } from '../src/chart.ts';
import { comparisonSvg } from '../src/export.ts';
import { DATASETS, resetState, view } from '../src/model.ts';
import { loadThemePreference, PALETTES, parseThemePreference, resolveTheme, saveThemePreference } from '../src/theme.ts';

test('saved appearance overrides the system while unknown values follow it', () => {
  for (const value of [null, '', 'unexpected', 'system']) {
    assert.equal(resolveTheme(parseThemePreference(value), false), 'light');
    assert.equal(resolveTheme(parseThemePreference(value), true), 'dark');
  }
  assert.equal(resolveTheme(parseThemePreference('light'), true), 'light');
  assert.equal(resolveTheme(parseThemePreference('dark'), false), 'dark');
});

test('blocked browser storage falls back to System and never prevents a theme change', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
  try {
    assert.equal(loadThemePreference(), 'system');
    assert.doesNotThrow(() => saveThemePreference('dark'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('both themes retain exact point geometry, guides, clipping and all-data statistics', () => {
  for (const dataset of DATASETS) {
    for (const hideOutliers of [false, true]) {
      for (const statistic of ['mean', 'median'] as const) {
        const state = { ...resetState(dataset.id), hideOutliers, statistic };
        const current = view(dataset, state, hideOutliers);
        const normalizeColors = (svg: string) => svg.replace(/#[0-9a-f]{6}/g, '#COLOR');
        const light = chartSvg(dataset, current, statistic, 644, true, 'light');
        const dark = chartSvg(dataset, current, statistic, 644, true, 'dark');
        assert.equal(normalizeColors(light), normalizeColors(dark));
        const metadata = (svg: string) => JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/)![1]!.replace(/&quot;/g, '"'));
        const lightExport = comparisonSvg(state, 'light');
        const darkExport = comparisonSvg(state, 'dark');
        const { theme: lightTheme, ...lightData } = metadata(lightExport);
        const { theme: darkTheme, ...darkData } = metadata(darkExport);
        assert.equal(lightTheme, 'light');
        assert.equal(darkTheme, 'dark');
        assert.deepEqual(lightData, darkData);
        assert.match(darkExport, new RegExp(`fill="${PALETTES.dark.background}"`));
        assert.match(darkExport, new RegExp(`fill="${PALETTES.dark.orange}"`));
        assert.equal(normalizeColors(lightExport.replace(/&quot;light&quot;/, 'THEME')), normalizeColors(darkExport.replace(/&quot;dark&quot;/, 'THEME')));
      }
    }
  }
});

test('labels and chart marks have readable contrast against either canvas', () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(start => {
      const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return r! * .2126 + g! * .7152 + b! * .0722;
  };
  for (const palette of Object.values(PALETTES)) {
    const bg = luminance(palette.background);
    for (const color of [palette.ink, palette.muted, palette.orange]) {
      const fg = luminance(color);
      assert.ok((Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05) >= 4.5, `${color} on ${palette.background}`);
    }
  }
});
