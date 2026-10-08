import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartSvg, geometry } from '../src/chart.ts';
import { comparisonSvg } from '../src/export.ts';
import { DATASETS, axisNotice, explanation, focusedRange, getDataset, median, resetState, statistics, validateRange, view } from '../src/model.ts';

test('known datasets have independently calculated means, medians, quartiles and outlier counts', () => {
  const expected = [
    [4958.333333333333, 4950, 4850, 5050, 0],
    [46.875, 28.5, 26.5, 30.5, 1],
    [77.25, 77.5, 75.5, 79.5, 0],
  ];
  DATASETS.forEach((dataset, i) => {
    const result = statistics(dataset.observations.map(point => point.value));
    assert.deepEqual([result.mean, result.median, result.q1, result.q3, result.outliers.filter(Boolean).length], expected[i]);
  });
});

test('median and quartiles handle odd counts, repeated values, zero IQR and invalid input without mutation', () => {
  const input = [5, 1, 4, 2, 3];
  const original = [...input];
  assert.equal(median(input), 3);
  const odd = statistics(input);
  assert.deepEqual([odd.q1, odd.q3, odd.iqr], [1.5, 4.5, 3]);
  assert.deepEqual(input, original);
  assert.equal(statistics([5]).median, 5);
  assert.deepEqual(statistics([5, 5, 5, 5]).outliers, [false, false, false, false]);
  assert.deepEqual(statistics([5, 5, 5, 5, 5, 5, 9]).outliers, [false, false, false, false, false, false, true]);
  assert.throws(() => statistics([]));
  assert.throws(() => statistics([1, NaN]));
});

test('points exactly on an IQR fence are not outliers', () => {
  const result = statistics([0, 6, 7, 8, 9, 10, 16]);
  assert.deepEqual([result.lowerFence, result.upperFence], [0, 16]);
  assert.equal(result.outliers.filter(Boolean).length, 0);
  assert.equal(statistics([-0.01, 6, 7, 8, 9, 10, 16.01]).outliers.filter(Boolean).length, 2);
});

test('hidden and clipped points are distinct; summaries always include the outlier', () => {
  const dataset = getDataset('large-order');
  const before = JSON.stringify(dataset.observations);
  const full = view(dataset, dataset.reference, false);
  const clipped = view(dataset, dataset.focus, false);
  const hidden = view(dataset, dataset.focus, true);
  assert.deepEqual([full.shown, full.hidden, full.clipped], [8, 0, 0]);
  assert.deepEqual([clipped.shown, clipped.hidden, clipped.clipped], [7, 0, 1]);
  assert.deepEqual([hidden.shown, hidden.hidden, hidden.clipped], [7, 1, 0]);
  assert.deepEqual(hidden.stats, full.stats);
  assert.deepEqual(clipped.stats, full.stats);
  assert.equal(JSON.stringify(dataset.observations), before);
  assert.throws(() => { dataset.observations[0]!.value = 999; });
});

test('linear transforms preserve values, matching x positions, range endpoints and exact median placement', () => {
  const dataset = getDataset('cafe-revenue');
  const reference = geometry(640, dataset.reference, 6), modified = geometry(640, dataset.focus, 6);
  assert.equal(modified.y(4500), modified.bottom);
  assert.equal(modified.y(5500), modified.top);
  assert.ok(Math.abs((modified.bottom - modified.y(4800)) / (modified.bottom - modified.top) - 0.3) < 1e-12);
  assert.ok(Math.abs((reference.bottom - reference.y(4800)) / (reference.bottom - reference.top) - 0.8) < 1e-12);
  assert.ok(Math.abs((modified.bottom - modified.y(4950)) / (modified.bottom - modified.top) - 0.45) < 1e-12);
  for (let i = 0; i < 6; i++) assert.equal(reference.x(i), modified.x(i));
});

test('display transformation draws seven markers, preserves source indices and never pins an off-range statistic', () => {
  const dataset = getDataset('large-order');
  const hidden = view(dataset, dataset.focus, true);
  const svg = chartSvg(dataset, hidden, 'mean', 640, true);
  assert.equal((svg.match(/<circle data-observation=/g) ?? []).length, 7);
  assert.doesNotMatch(svg, /data-observation="7"/);
  assert.doesNotMatch(svg, /<line data-statistic="mean"/);
  assert.match(svg, /Mean 46\.88 EUR is above this range/);
  const clipped = chartSvg(dataset, view(dataset, dataset.focus, false), 'median', 640, true);
  assert.match(clipped, /data-clipped="7"/);
  assert.match(clipped, /triangle is a boundary marker, not the point/);
});

test('scale focus interpolates both bounds and never changes the dataset', () => {
  const dataset = getDataset('cafe-revenue');
  assert.deepEqual(focusedRange(dataset, 0), dataset.reference);
  assert.deepEqual(focusedRange(dataset, 100), dataset.focus);
  assert.deepEqual(focusedRange(dataset, 50), { lower: 2250, upper: 5750 });
  assert.throws(() => focusedRange(dataset, NaN));
  assert.throws(() => focusedRange(dataset, 101));
});

test('bounds reject empty, nonfinite, reversed, huge and too-narrow ranges while allowing exact hundredths', () => {
  for (const [lower, upper] of [['', '40'], ['0', ''], ['0', 'Infinity'], ['NaN', '40'], ['40', '0'], ['40', '40'], ['0', '1000001'], ['0', '0.009']]) {
    assert.notEqual(validateRange(lower!, upper!), null);
  }
  assert.equal(validateRange('28.6', '28.61'), null);
  assert.equal(validateRange('-10', '40'), null);
});

test('reset restores the current dataset preset, selected statistic and visibility without shared mutable state', () => {
  const modified = { ...resetState('large-order'), lower: 25, upper: 35, statistic: 'mean' as const, hideOutliers: true, focus: null };
  const reset = resetState(modified.datasetId);
  assert.deepEqual(reset, { datasetId: 'large-order', lower: 0, upper: 40, statistic: 'median', hideOutliers: false, focus: 100 });
  assert.notEqual(reset, resetState('large-order'));
});

test('captions disclose hidden, clipped, empty and shifted ranges without declaring all nonzero axes deceptive', () => {
  const state = resetState('large-order');
  assert.match(explanation(state).message, /outside the modified range/);
  assert.match(explanation({ ...state, hideOutliers: true }).message, /Both summaries still use all 8 values/);
  assert.match(explanation({ ...state, lower: 300, upper: 400 }).headline, /No points/);
  assert.match(axisNotice({ lower: 10, upper: 40 }, 'EUR'), /zero excluded/);
  assert.doesNotMatch(axisNotice({ lower: -10, upper: 40 }, 'EUR'), /zero excluded/);
});

test('export retains source values, exact all-data statistics, scales, visibility, rule and explanations', () => {
  const state = { ...resetState('large-order'), hideOutliers: true, statistic: 'mean' as const };
  const exported = comparisonSvg(state);
  for (const text of ['Reference', 'Modified', 'Synthetic data', '46.88 EUR', '28.50 EUR', '7 shown · 1 hidden · 0 clipped', 'strict 1.5 × IQR', 'Both summaries still use all 8 values', '180', 'above this range']) assert.ok(exported.includes(text), text);
  assert.match(exported, /width="1440" height="\d+"/);
  assert.equal((exported.match(/<circle data-observation=/g) ?? []).length, 15);
  assert.doesNotMatch(exported, /NaN|Infinity|undefined/);
});

test('all presets and empty-range exports produce finite geometry and retain every source observation', () => {
  for (const dataset of DATASETS) {
    for (const state of [resetState(dataset.id), { ...resetState(dataset.id), lower: 7000, upper: 8000 }]) {
      const exported = comparisonSvg(state);
      assert.doesNotMatch(exported, /NaN|Infinity|undefined/);
      const metadata = exported.match(/<metadata>(.*?)<\/metadata>/s)![1]!.replaceAll('&quot;', '"').replaceAll('&amp;', '&');
      const payload = JSON.parse(metadata);
      assert.deepEqual(payload.observations, dataset.observations);
    }
  }
});
