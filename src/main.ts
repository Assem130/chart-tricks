import './style.css';
import { chartSvg, escape } from './chart.ts';
import { EXPERIMENTS, experimentState, type ExperimentId } from './discovery.ts';
import { exportComparison } from './export.ts';
import { loadThemePreference, PALETTES, parseThemePreference, resolveTheme, saveThemePreference } from './theme.ts';
import { DATASETS, affectedPoints, amount, axisNotice, bound, counts, explanation, focusedRange, getDataset, number, rangeLabel, resetState, validateRange, view, type State, type Statistic } from './model.ts';

function element<T extends Element = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error('Missing UI element: ' + selector);
  return found;
}
const app = element('#app');
const datasetSelect = element<HTMLSelectElement>('#dataset');
const lowerInput = element<HTMLInputElement>('#lower');
const upperInput = element<HTMLInputElement>('#upper');
const focusInput = element<HTMLInputElement>('#focus');
const hideInput = element<HTMLInputElement>('#hide-outliers');
const exportButton = element<HTMLButtonElement>('#export');
const exportLabel = exportButton.innerHTML;
const exportStatus = element('#export-status');
const rangeError = element('#range-error');
const referenceChart = element('#reference-chart');
const modifiedChart = element('#modified-chart');
const themeSelect = element<HTMLSelectElement>('#theme');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const phone = matchMedia('(max-width: 700px)');
let themePreference = loadThemePreference();
let theme = resolveTheme(themePreference, systemTheme.matches);
let mode: 'discover' | 'explore' = 'discover';
let experimentIndex = 0;
let revealed = false;
let operation: ExperimentId = 'scale';
let impression = '';
let state: State = experimentState(EXPERIMENTS[0]!);
let invalid = false;
let exporting = false;
const renderedCharts = new WeakMap<HTMLElement, string>();
const text = (selector: string, value: string) => { element(selector).textContent = value; };
const show = (selector: string, visible: boolean) => { element<HTMLElement>(selector).hidden = !visible; };
const currentExperiment = () => EXPERIMENTS[experimentIndex]!;
const announce = (message: string) => text('#live-status', message);

datasetSelect.innerHTML = DATASETS.map(dataset => '<option value="' + dataset.id + '">' + escape(dataset.name) + '</option>').join('');
element('#experiment-nav').innerHTML = EXPERIMENTS.map((experiment, index) =>
  '<button type="button" data-experiment="' + index + '"><span class="step-number">' + (index + 1) + '</span><span>' + escape(experiment.name) + '</span></button>'
).join('');

function setError(message: string | null) {
  invalid = message !== null;
  rangeError.hidden = !invalid;
  rangeError.textContent = message ?? '';
  lowerInput.setAttribute('aria-invalid', String(invalid));
  upperInput.setAttribute('aria-invalid', String(invalid));
  exportButton.disabled = invalid || exporting || !revealed;
}

function animateAttribute(target: SVGElement, attribute: string, from: string, to: string) {
  if (from === to) return;
  const animation = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
  for (const [key, value] of Object.entries({
    attributeName: attribute, from, to, dur: '0.42s',
    calcMode: 'spline', keyTimes: '0;1', keySplines: '0.16 1 0.3 1',
  })) animation.setAttribute(key, value);
  target.append(animation);
  animation.beginElement();
}

function updateChart(container: HTMLElement, svg: string, animate: boolean, seed?: string) {
  if (renderedCharts.get(container) === svg) return;
  const previous = seed ? new DOMParser().parseFromString(seed, 'image/svg+xml').documentElement : container.querySelector('svg');
  const positions = new Map<string, string>();
  previous?.querySelectorAll<SVGCircleElement>('[data-observation]').forEach(point => {
    positions.set(point.getAttribute('data-observation')!, String(point.cy.animVal.value));
  });
  const oldPath = previous?.querySelector('path[clip-path]')?.getAttribute('d');
  const oldGuide = previous?.querySelector('[data-statistic]');
  const oldGuideY = oldGuide?.getAttribute('y1');
  const previousBox = previous?.getAttribute('viewBox');
  container.innerHTML = svg;
  renderedCharts.set(container, svg);
  const next = container.querySelector('svg')!;
  if (!animate || reducedMotion.matches || previousBox !== next.getAttribute('viewBox')) return;
  next.querySelectorAll<SVGCircleElement>('[data-observation]').forEach(point => {
    const before = positions.get(point.getAttribute('data-observation')!);
    if (before !== undefined) animateAttribute(point, 'cy', before, point.getAttribute('cy')!);
  });
  const path = next.querySelector<SVGPathElement>('path[clip-path]');
  if (path && oldPath && oldPath.split(/[ML]/).length === path.getAttribute('d')!.split(/[ML]/).length) {
    animateAttribute(path, 'd', oldPath, path.getAttribute('d')!);
  }
  const guide = next.querySelector<SVGLineElement>('[data-statistic]');
  if (guide && oldGuideY) {
    animateAttribute(guide, 'y1', oldGuideY, guide.getAttribute('y1')!);
    animateAttribute(guide, 'y2', oldGuideY, guide.getAttribute('y2')!);
  }
}

function renderCharts(animate = false, fromBaseline = false) {
  const dataset = getDataset(state.datasetId);
  const reference = view(dataset, dataset.reference, false);
  for (const [container, modified] of [[referenceChart, false], [modifiedChart, true]] as const) {
    const width = Math.floor(container.clientWidth);
    const height = Math.floor(container.clientHeight);
    if (width < 100 || height < 100) continue;
    const guide = !revealed ? null : modified ? state.statistic : 'median';
    const svg = chartSvg(dataset, modified ? view(dataset, state, state.hideOutliers) : reference, guide, width, modified, theme, height);
    const seed = fromBaseline && modified
      ? chartSvg(dataset, reference, 'median', width, true, theme, height) : undefined;
    updateChart(container, svg, animate && modified, seed);
  }
}

function renderPrompt() {
  const experiment = currentExperiment();
  text('#question', experiment.question);
  text('#question-context', experiment.context);
  text('#reveal-label', experiment.reveal);
  element('#answer-options').innerHTML = experiment.choices.map((choice, index) =>
    '<label class="answer"><input type="radio" name="impression" value="' + index + '"/><span>' + escape(choice) + '</span></label>'
  ).join('');
}

function setMobileView(value: 'reference' | 'modified') {
  app.dataset.mobileView = value;
  element('#show-reference').setAttribute('aria-pressed', String(value === 'reference'));
  element('#show-modified').setAttribute('aria-pressed', String(value === 'modified'));
}

function render(syncBounds = false, animate = false, fromBaseline = false) {
  const dataset = getDataset(state.datasetId);
  const reference = view(dataset, dataset.reference, false);
  const modified = view(dataset, state, state.hideOutliers);
  const copy = explanation(state);
  const outlierCount = modified.stats.outliers.filter(Boolean).length;
  app.dataset.mode = mode;
  app.dataset.stage = revealed ? 'revealed' : 'question';
  element('#discover-mode').setAttribute('aria-pressed', String(mode === 'discover'));
  element('#explore-mode').setAttribute('aria-pressed', String(mode === 'explore'));
  show('#experiment-nav', mode === 'discover');
  show('#explore-heading', mode === 'explore');
  show('#prompt-pane', !revealed);
  show('.modified-panel', revealed);
  show('#mobile-comparison', revealed);
  show('#controls', revealed);
  show('#facts', revealed);
  show('#insight', revealed);
  show('#operation-nav', mode === 'explore');
  for (const id of ['scale', 'visibility', 'average'] as const) {
    show('#' + id + '-controls', operation === id);
    element('[data-operation="' + id + '"]').setAttribute('aria-pressed', String(operation === id));
  }
  document.querySelectorAll('[data-experiment]').forEach(button => {
    if (Number(button.getAttribute('data-experiment')) === experimentIndex) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  datasetSelect.value = dataset.id;
  text('#dataset-name', dataset.name);
  text('#provenance', dataset.observations.length + ' values · synthetic data');
  text('#reference-title', revealed ? 'Reference' : 'Your first look');
  text('#reference-guide', revealed ? 'Full scale · median' : 'Full scale');
  text('#reference-range', rangeLabel(dataset.reference, dataset.unit) + ' · linear');
  text('#modified-range', rangeLabel(state, dataset.unit) + ' · linear');
  text('#axis-notice', axisNotice(state, dataset.unit));
  element('#axis-notice').classList.toggle('truncated', state.lower > 0 || state.upper < 0);
  text('#reference-count', counts(reference));
  text('#modified-count', counts(modified));
  show('#visibility-note', modified.hidden + modified.clipped > 0);
  text('#visibility-note', [
    modified.hidden ? 'Hidden: ' + affectedPoints(dataset, modified, 'hidden') + '.' : '',
    modified.clipped > 2 ? modified.clipped + ' points outside this range. Triangles mark their direction. Exact values are in Behind the chart.'
      : modified.clipped ? 'Clipped (triangle): ' + affectedPoints(dataset, modified, 'clipped') + '.' : '',
  ].filter(Boolean).join(' '));
  text('#mean-value', amount(modified.stats.mean, dataset.unit));
  text('#median-value', amount(modified.stats.median, dataset.unit));
  text('#all-values', 'All ' + dataset.observations.length + ' values count, including hidden and clipped points.');
  const first = dataset.observations[0]!.value, last = dataset.observations.at(-1)!.value;
  const values = dataset.observations.map(point => point.value);
  text('#dataset-fact', dataset.id === 'cafe-revenue'
    ? 'Jan ' + bound(first) + ' → Jun ' + bound(last) + ' EUR · +' + number((last - first) / first * 100, 1) + '%'
    : dataset.id === 'large-order' ? 'Order 8: 180 EUR · 1 flagged outlier'
    : 'Scores: ' + bound(Math.min(...values)) + ' to ' + bound(Math.max(...values)) + '% · 9 percentage points');
  const ratio = (dataset.reference.upper - dataset.reference.lower) / (state.upper - state.lower);
  text('#scale-effect', number(ratio, 1) + '× vertical detail');
  text('#axis-unit', '(' + dataset.unit + ')');
  text('#focus-value', state.focus === null ? 'Custom bounds' : state.focus + '%');
  focusInput.setAttribute('aria-valuetext', rangeLabel(state, dataset.unit) + (state.focus === null ? ', custom bounds' : ''));
  if (state.focus !== null) focusInput.value = String(state.focus);
  if (syncBounds) { lowerInput.value = String(state.lower); upperInput.value = String(state.upper); }
  hideInput.disabled = outlierCount === 0;
  hideInput.checked = state.hideOutliers;
  text('#outlier-count', outlierCount + ' of ' + values.length + ' · 1.5 × IQR');
  text('#outlier-help', outlierCount
    ? 'Hiding removes a marker. It does not change the axis or either average.'
    : 'No points meet the outlier rule in this dataset. Try One large order to see this effect.');
  document.querySelectorAll<HTMLInputElement>('input[name="statistic"]').forEach(input => { input.checked = input.value === state.statistic; });
  text('#takeaway', mode === 'discover' ? currentExperiment().takeaway : copy.headline);
  text('#lesson', mode === 'discover' ? currentExperiment().lesson : copy.message);
  show('#explanation', mode === 'discover');
  text('#explanation', copy.message);
  text('#statistic-explanation', copy.statisticMessage);
  show('#impression-note', mode === 'discover' && impression !== '');
  text('#impression-note', 'Your first impression: “' + impression + '”.');
  show('.insight-next', mode === 'discover');
  text('#next-experiment', experimentIndex < EXPERIMENTS.length - 1
    ? 'Next: ' + EXPERIMENTS[experimentIndex + 1]!.name.toLowerCase() + ' →' : 'Now make your own view →');
  text('#state-note', !revealed ? 'Reveal the comparison to export it.' : 'Exports include both charts and every disclosure.');
  exportButton.disabled = invalid || exporting || !revealed;
  text('#source-caption', dataset.name + ' · all ' + values.length + ' synthetic values');
  text('#source-label', dataset.xLabel);
  text('#source-unit', 'Value (' + dataset.unit + ')');
  element('#source-data').innerHTML = dataset.observations.map((point, index) =>
    '<tr><th scope="row">' + escape(point.label) + '</th><td>' + escape(bound(point.value)) + '</td><td>' + (modified.stats.outliers[index] ? 'Yes' : 'No') + '</td><td>' + modified.statuses[index] + '</td></tr>'
  ).join('');
  text('#quartile-values', 'Q1 ' + amount(modified.stats.q1, dataset.unit) + '; Q3 ' + amount(modified.stats.q3, dataset.unit) + '; IQR ' + amount(modified.stats.iqr, dataset.unit) + '. Fences: ' + amount(modified.stats.lowerFence, dataset.unit) + ' and ' + amount(modified.stats.upperFence, dataset.unit) + '. ' + outlierCount + ' points flagged.');
  renderCharts(animate, fromBaseline);
}

function focusHeading(selector: string) {
  const heading = element<HTMLElement>(selector);
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}
function scrollToChart() {
  element('#workspace').scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
}
function startExperiment(index: number, moveFocus = true) {
  mode = 'discover';
  experimentIndex = index;
  operation = currentExperiment().id;
  state = experimentState(currentExperiment());
  revealed = false;
  impression = '';
  setMobileView('modified');
  setError(null);
  exportStatus.hidden = true;
  element<HTMLDetailsElement>('#custom-range').open = false;
  renderPrompt();
  render(true);
  if (moveFocus) {
    focusHeading('#question');
    scrollToChart();
    announce('Experiment ' + (index + 1) + '. ' + currentExperiment().question);
  }
}
function explore() {
  mode = 'explore';
  revealed = true;
  operation = currentExperiment().id;
  setMobileView('modified');
  setError(null);
  render(true);
  if (phone.matches) scrollToChart();
  announce('Free exploration. Choose a dataset and change its scale, points or average.');
}
function changed(syncBounds = false, animate = true) {
  exportStatus.hidden = true;
  setMobileView('modified');
  render(syncBounds, animate);
  const dataset = getDataset(state.datasetId);
  const current = view(dataset, state, state.hideOutliers);
  announce('Modified: ' + rangeLabel(state, dataset.unit) + '. ' + counts(current) + '. ' + state.statistic + ' ' + amount(current.stats[state.statistic], dataset.unit) + '. All source values remain unchanged.');
}

element('#reveal').addEventListener('click', () => {
  const selected = document.querySelector<HTMLInputElement>('input[name="impression"]:checked');
  impression = selected ? currentExperiment().choices[Number(selected.value)]! : '';
  state = experimentState(currentExperiment(), true);
  revealed = true;
  setMobileView('modified');
  app.classList.add('reveal-moment');
  render(true, true, true);
  window.setTimeout(() => app.classList.remove('reveal-moment'), 450);
  if (phone.matches) element<HTMLButtonElement>('#show-modified').focus({ preventScroll: true });
  else focusHeading('#modified-title');
  if (phone.matches) scrollToChart();
  announce(currentExperiment().takeaway + ' ' + currentExperiment().lesson);
});
element('#experiment-nav').addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-experiment]');
  if (button) startExperiment(Number(button.dataset.experiment));
});
element('#discover-mode').addEventListener('click', () => startExperiment(experimentIndex));
element('#explore-mode').addEventListener('click', explore);
element('#keep-exploring').addEventListener('click', explore);
element('#next-experiment').addEventListener('click', () => {
  if (experimentIndex < EXPERIMENTS.length - 1) startExperiment(experimentIndex + 1);
  else explore();
});
element('#show-reference').addEventListener('click', () => { setMobileView('reference'); renderCharts(); announce('Reference. Full range and every value. Median guide.'); });
element('#show-modified').addEventListener('click', () => { setMobileView('modified'); renderCharts(); announce('Modified. Your current presentation choices.'); });
element('#operation-nav').addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-operation]');
  if (!button) return;
  operation = button.dataset.operation as ExperimentId;
  render();
  if (invalid) text('#range-error', validateRange(lowerInput.value, upperInput.value)! + (operation !== 'scale' ? ' Open Scale to correct the bounds.' : ''));
});
datasetSelect.addEventListener('change', () => {
  state = resetState(datasetSelect.value);
  setError(null);
  element<HTMLDetailsElement>('#custom-range').open = false;
  changed(true, false);
});
element('#reset').addEventListener('click', () => {
  if (mode === 'discover') startExperiment(experimentIndex);
  else {
    state = resetState(state.datasetId);
    setError(null);
    element<HTMLDetailsElement>('#custom-range').open = false;
    changed(true, false);
    announce('Reset. ' + getDataset(state.datasetId).name + ' preset restored. Theme kept.');
  }
});
for (const input of [lowerInput, upperInput]) {
  input.addEventListener('input', () => {
    exportStatus.hidden = true;
    const message = validateRange(lowerInput.value, upperInput.value);
    setError(message);
    if (message) return;
    state = { ...state, lower: Number(lowerInput.value), upper: Number(upperInput.value), focus: null };
    changed(false, false);
  });
}
focusInput.addEventListener('input', () => {
  const focus = Number(focusInput.value);
  state = { ...state, ...focusedRange(getDataset(state.datasetId), focus), focus };
  setError(null);
  changed(true, false);
});
document.querySelectorAll<HTMLInputElement>('input[name="statistic"]').forEach(input => {
  input.addEventListener('change', () => { state = { ...state, statistic: input.value as Statistic }; changed(); });
});
hideInput.addEventListener('change', () => { state = { ...state, hideOutliers: hideInput.checked }; changed(); });
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
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) document.querySelectorAll('svg animate').forEach(animation => animation.remove());
});
exportButton.addEventListener('click', async () => {
  if (invalid || exporting || !revealed) return;
  const snapshot = state, exportTheme = theme;
  exporting = true;
  exportButton.disabled = true;
  exportButton.textContent = 'Exporting…';
  exportStatus.hidden = false;
  exportStatus.textContent = 'Creating your labelled comparison…';
  try {
    await exportComparison(snapshot, exportTheme);
    exportStatus.hidden = false;
    exportStatus.textContent = 'PNG download started for ' + getDataset(snapshot.datasetId).name + '. Both charts, source values and disclosures use the view captured when you selected Export.';
  } catch (error) {
    exportStatus.hidden = false;
    exportStatus.textContent = error instanceof Error ? error.message : 'Export failed. Try again in a current browser.';
  } finally {
    exporting = false;
    exportButton.disabled = invalid || !revealed;
    exportButton.innerHTML = exportLabel;
  }
});

renderPrompt();
applyTheme();
render(true);
const resize = new ResizeObserver(() => renderCharts());
resize.observe(referenceChart);
resize.observe(modifiedChart);
