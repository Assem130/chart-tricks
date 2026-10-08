import './style.css';
import { chartSvg, escape } from './chart.ts';
import { exportComparison } from './export.ts';
import { loadThemePreference, PALETTES, parseThemePreference, resolveTheme, saveThemePreference } from './theme.ts';
import { DATASETS, affectedPoints, amount, axisNotice, bound, counts, explanation, focusedRange, getDataset, rangeLabel, resetState, validateRange, view, type State, type Statistic } from './model.ts';

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing UI element: ${selector}`);
  return found;
}
const datasetSelect = element<HTMLSelectElement>('#dataset');
const lowerInput = element<HTMLInputElement>('#lower');
const upperInput = element<HTMLInputElement>('#upper');
const focusInput = element<HTMLInputElement>('#focus');
const hideInput = element<HTMLInputElement>('#hide-outliers');
const exportButton = element<HTMLButtonElement>('#export');
const rangeError = element<HTMLParagraphElement>('#range-error');
const exportStatus = element<HTMLParagraphElement>('#export-status');
const referenceChart = element<HTMLDivElement>('#reference-chart');
const modifiedChart = element<HTMLDivElement>('#modified-chart');
const themeSelect = element<HTMLSelectElement>('#theme');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let themePreference = loadThemePreference();
let theme = resolveTheme(themePreference, systemTheme.matches);
let state: State = resetState();
let renderedState: State | null = null;
let invalid = false;
let exporting = false;

const text = (selector: string, value: string) => { element(selector).textContent = value; };
datasetSelect.innerHTML = DATASETS.map(dataset => `<option value="${dataset.id}">${escape(dataset.name)}</option>`).join('');

function setError(message: string | null) {
  invalid = message !== null;
  rangeError.hidden = !invalid;
  rangeError.textContent = message ?? '';
  lowerInput.setAttribute('aria-invalid', String(invalid));
  upperInput.setAttribute('aria-invalid', String(invalid));
  exportButton.disabled = invalid || exporting;
}

function renderCharts() {
  const dataset = getDataset(state.datasetId);
  const width = Math.max(280, Math.floor(referenceChart.clientWidth));
  referenceChart.innerHTML = chartSvg(dataset, view(dataset, dataset.reference, false), state.statistic, width, false, theme);
  modifiedChart.innerHTML = chartSvg(dataset, view(dataset, state, state.hideOutliers), state.statistic, width, true, theme);
  if (renderedState) {
    const referenceChanged = renderedState.datasetId !== state.datasetId || renderedState.statistic !== state.statistic;
    const modifiedChanged = referenceChanged || renderedState.lower !== state.lower || renderedState.upper !== state.upper || renderedState.hideOutliers !== state.hideOutliers;
    if (referenceChanged) referenceChart.querySelector('svg')?.classList.add('updated');
    if (modifiedChanged) modifiedChart.querySelector('svg')?.classList.add('updated');
  }
  renderedState = state;
}

function render(syncBounds = false) {
  const dataset = getDataset(state.datasetId);
  const reference = view(dataset, dataset.reference, false), modified = view(dataset, state, state.hideOutliers);
  const copy = explanation(state), outlierCount = modified.stats.outliers.filter(Boolean).length;
  datasetSelect.value = dataset.id;
  text('#pattern', `${dataset.pattern}. Adjust the view, keep the values.`);
  text('#reference-headline', dataset.headline);
  text('#modified-headline', copy.headline);
  text('#reference-range', `${rangeLabel(dataset.reference, dataset.unit)} · linear`);
  text('#modified-range', `${rangeLabel(state, dataset.unit)} · linear`);
  text('#axis-notice', axisNotice(state, dataset.unit));
  element('#axis-notice').classList.toggle('truncated', state.lower > 0 || state.upper < 0);
  text('#reference-count', counts(reference));
  text('#modified-count', counts(modified));
  const notice = element<HTMLParagraphElement>('#visibility-note');
  notice.hidden = modified.hidden + modified.clipped === 0;
  notice.textContent = [
    modified.hidden ? `Hidden: ${affectedPoints(dataset, modified, 'hidden')}.` : '',
    modified.clipped ? `Outside range (triangle marker): ${affectedPoints(dataset, modified, 'clipped')}.` : '',
  ].filter(Boolean).join(' ');
  text('#axis-unit', `(${dataset.unit})`);
  text('#outlier-count', `${outlierCount} of ${dataset.observations.length} · 1.5 × IQR`);
  text('#mean-value', amount(modified.stats.mean, dataset.unit));
  text('#median-value', amount(modified.stats.median, dataset.unit));
  text('#all-values', `Statistics use all ${dataset.observations.length} values.`);
  text('#explanation', copy.message);
  text('#statistic-explanation', copy.statisticMessage);
  hideInput.disabled = outlierCount === 0;
  hideInput.checked = state.hideOutliers;
  hideInput.title = outlierCount ? 'Hide flagged markers in Modified; retain every value in the summaries.' : 'This dataset has no points flagged by the outlier rule.';
  document.querySelectorAll<HTMLInputElement>('input[name="statistic"]').forEach(input => { input.checked = input.value === state.statistic; });
  if (syncBounds) { lowerInput.value = String(state.lower); upperInput.value = String(state.upper); }
  if (state.focus !== null) focusInput.value = String(state.focus);
  text('#focus-value', state.focus === null ? 'Custom bounds' : `${state.focus}%`);
  focusInput.setAttribute('aria-valuetext', `${rangeLabel(state, dataset.unit)}${state.focus === null ? ', custom bounds' : ''}`);
  text('#source-caption', `${dataset.name} · all ${dataset.observations.length} synthetic values`);
  text('#source-label', dataset.xLabel);
  text('#source-unit', `Value (${dataset.unit})`);
  element('#source-data').innerHTML = dataset.observations.map((point, i) => `<tr><th scope="row">${escape(point.label)}</th><td>${escape(bound(point.value))}</td><td>${modified.stats.outliers[i] ? 'Yes' : 'No'}</td></tr>`).join('');
  text('#quartile-values', `Q1 ${amount(modified.stats.q1, dataset.unit)}; Q3 ${amount(modified.stats.q3, dataset.unit)}; IQR ${amount(modified.stats.iqr, dataset.unit)}. Fences: ${amount(modified.stats.lowerFence, dataset.unit)} and ${amount(modified.stats.upperFence, dataset.unit)}. ${outlierCount} points flagged.`);
  renderCharts();
}

function restore(datasetId: string) {
  state = resetState(datasetId);
  setError(null);
  exportStatus.hidden = true;
  render(true);
}
function applyTheme() {
  theme = resolveTheme(themePreference, systemTheme.matches);
  document.documentElement.dataset.theme = theme;
  themeSelect.value = themePreference;
  element<HTMLMetaElement>('meta[name="theme-color"]').content = PALETTES[theme].background;
  renderCharts();
}
themeSelect.addEventListener('change', () => {
  themePreference = parseThemePreference(themeSelect.value);
  saveThemePreference(themePreference);
  applyTheme();
});
systemTheme.addEventListener('change', () => { if (themePreference === 'system') applyTheme(); });
datasetSelect.addEventListener('change', () => restore(datasetSelect.value));
element('#reset').addEventListener('click', () => restore(state.datasetId));
for (const input of [lowerInput, upperInput]) {
  input.addEventListener('input', () => {
    const message = validateRange(lowerInput.value, upperInput.value);
    setError(message);
    if (message) return;
    state = { ...state, lower: Number(lowerInput.value), upper: Number(upperInput.value), focus: null };
    render();
  });
}
focusInput.addEventListener('input', () => {
  const focus = Number(focusInput.value);
  state = { ...state, ...focusedRange(getDataset(state.datasetId), focus), focus };
  setError(null);
  render(true);
});
document.querySelectorAll<HTMLInputElement>('input[name="statistic"]').forEach(input => {
  input.addEventListener('change', () => {
    state = { ...state, statistic: input.value as Statistic };
    render();
  });
});
hideInput.addEventListener('change', () => { state = { ...state, hideOutliers: hideInput.checked }; render(); });
exportButton.addEventListener('click', async () => {
  if (invalid || exporting) return;
  exporting = true;
  exportButton.disabled = true;
  exportButton.textContent = 'Exporting…';
  exportStatus.hidden = false;
  exportStatus.textContent = 'Creating your labelled comparison…';
  try {
    await exportComparison(state, theme);
    exportStatus.textContent = 'PNG download started. It includes both charts, labels, statistics and explanations.';
  } catch (error) {
    exportStatus.textContent = error instanceof Error ? error.message : 'Export failed. Try again in a current browser.';
  } finally {
    exporting = false;
    exportButton.disabled = invalid;
    exportButton.textContent = 'Export image';
  }
});

applyTheme();
render(true);
new ResizeObserver(renderCharts).observe(referenceChart);
