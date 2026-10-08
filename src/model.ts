export type Statistic = 'mean' | 'median';
export type Range = Readonly<{ lower: number; upper: number }>;
export type Observation = Readonly<{ label: string; value: number }>;
export type Dataset = Readonly<{
  id: string;
  name: string;
  pattern: string;
  unit: string;
  xLabel: string;
  chart: 'line' | 'dot';
  observations: readonly Observation[];
  reference: Range;
  focus: Range;
  headline: string;
}>;

const datasets: Dataset[] = [
  {
    id: 'cafe-revenue', name: 'Cafe revenue', pattern: 'A small upward trend',
    unit: 'EUR', xLabel: 'Month', chart: 'line', headline: 'A steady climb.',
    observations: [4800, 4900, 4850, 5000, 5050, 5150].map((value, i) => ({
      label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][i]!, value,
    })),
    reference: { lower: 0, upper: 6000 }, focus: { lower: 4500, upper: 5500 },
  },
  {
    id: 'large-order', name: 'One large order', pattern: 'A cluster and an outlier',
    unit: 'EUR', xLabel: 'Order', chart: 'dot', headline: 'One order stands out.',
    observations: [24, 26, 27, 28, 29, 30, 31, 180].map((value, i) => ({ label: String(i + 1), value })),
    reference: { lower: 0, upper: 200 }, focus: { lower: 0, upper: 40 },
  },
  {
    id: 'survey-scores', name: 'Survey scores', pattern: 'A fairly balanced spread',
    unit: '%', xLabel: 'Group', chart: 'dot', headline: 'Scores are fairly close.',
    observations: [72, 79, 76, 81, 78, 75, 80, 77].map((value, i) => ({ label: String.fromCharCode(65 + i), value })),
    reference: { lower: 0, upper: 100 }, focus: { lower: 70, upper: 85 },
  },
];

// Freeze the source, including each observation. View choices never edit it.
export const DATASETS: readonly Dataset[] = Object.freeze(datasets.map(dataset => Object.freeze({
  ...dataset,
  observations: Object.freeze(dataset.observations.map(point => Object.freeze(point))),
  reference: Object.freeze(dataset.reference), focus: Object.freeze(dataset.focus),
})));

export function getDataset(id: string): Dataset {
  const dataset = DATASETS.find(candidate => candidate.id === id);
  if (!dataset) throw new Error(`Unknown dataset: ${id}`);
  return dataset;
}

export function median(values: readonly number[]): number {
  if (!values.length || values.some(value => !Number.isFinite(value))) throw new Error('Use a non-empty list of finite values.');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function statistics(values: readonly number[]) {
  const middleValue = median(values);
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  // Odd counts exclude the middle value from both halves. A singleton has IQR 0.
  const q1 = half ? median(sorted.slice(0, half)) : sorted[0]!;
  const q3 = half ? median(sorted.slice(sorted.length - half)) : sorted[0]!;
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    median: middleValue, q1, q3, iqr, lowerFence, upperFence,
    outliers: values.map(value => value < lowerFence || value > upperFence),
  };
}

export type State = Readonly<{
  datasetId: string; lower: number; upper: number;
  statistic: Statistic; hideOutliers: boolean; focus: number | null;
}>;

export function resetState(datasetId = 'cafe-revenue'): State {
  const dataset = getDataset(datasetId);
  return { datasetId, ...dataset.focus, statistic: 'median', hideOutliers: false, focus: 100 };
}

export function focusedRange(dataset: Dataset, focus: number): Range {
  if (!Number.isFinite(focus) || focus < 0 || focus > 100) throw new Error('Scale focus must be between 0 and 100.');
  const t = focus / 100;
  const interpolate = (from: number, to: number) => Number((from + (to - from) * t).toFixed(2));
  return { lower: interpolate(dataset.reference.lower, dataset.focus.lower), upper: interpolate(dataset.reference.upper, dataset.focus.upper) };
}

export function validateRange(lower: string | number, upper: string | number): string | null {
  if (String(lower).trim() === '' || String(upper).trim() === '') return 'Enter both axis bounds. The last valid view stays visible.';
  const a = Number(lower), b = Number(upper);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 'Enter finite numbers for both bounds.';
  if (Math.abs(a) > 1_000_000 || Math.abs(b) > 1_000_000) return 'Keep each bound between −1,000,000 and 1,000,000.';
  if (a >= b) return 'Upper must be greater than Lower. Adjust either bound.';
  const roundingTolerance = 4 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
  if (b - a < 0.01 - roundingTolerance) return 'Leave at least 0.01 between the bounds.';
  return null;
}

export type Visibility = 'shown' | 'hidden' | 'clipped';
export function view(dataset: Dataset, range: Range, hideOutliers: boolean) {
  const stats = statistics(dataset.observations.map(point => point.value));
  const statuses: Visibility[] = dataset.observations.map((point, i) =>
    hideOutliers && stats.outliers[i] ? 'hidden' :
      point.value < range.lower || point.value > range.upper ? 'clipped' : 'shown');
  return {
    range, stats, statuses,
    shown: statuses.filter(status => status === 'shown').length,
    hidden: statuses.filter(status => status === 'hidden').length,
    clipped: statuses.filter(status => status === 'clipped').length,
  };
}
export type View = ReturnType<typeof view>;

export const number = (value: number, decimals = 2) => new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: decimals, maximumFractionDigits: decimals,
}).format(value);
export const amount = (value: number, unit: string) => `${number(value)} ${unit}`;
export const bound = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 6 }).format(value);
export const rangeLabel = (range: Range, unit: string) => `${bound(range.lower)} to ${bound(range.upper)} ${unit}`;
export const counts = (current: View) => `${current.shown} shown · ${current.hidden} hidden · ${current.clipped} clipped`;
export function affectedPoints(dataset: Dataset, current: View, status: 'hidden' | 'clipped'): string {
  return dataset.observations.filter((_, i) => current.statuses[i] === status)
    .map(point => `${dataset.xLabel} ${point.label}: ${amount(point.value, dataset.unit)}`).join('; ');
}

export function axisNotice(range: Range, unit: string): string {
  const start = `Axis starts at ${bound(range.lower)} ${unit}`;
  return range.lower > 0 || range.upper < 0 ? `${start} · zero excluded` : start;
}

export function explanation(state: State) {
  const dataset = getDataset(state.datasetId);
  const current = view(dataset, state, state.hideOutliers);
  const ratio = (dataset.reference.upper - dataset.reference.lower) / (state.upper - state.lower);
  const outlierCount = current.stats.outliers.filter(Boolean).length;
  let headline = 'A different frame.';
  let message = 'The range shifts where values sit. The underlying values and the statistical summaries stay the same.';
  if (!current.shown) {
    headline = 'No points in this range.';
    message = 'This view shows no data points. Widen the range or show the outliers to see them again. The reference and summaries retain every value.';
  } else if (current.hidden) {
    headline = 'An outlier is out of sight.';
    message = `${current.hidden} flagged ${current.hidden === 1 ? 'point is' : 'points are'} hidden in Modified. ${affectedPoints(dataset, current, 'hidden')}. Both summaries still use all ${dataset.observations.length} values.`;
  } else if (current.clipped) {
    headline = 'Some values are out of frame.';
    message = `${current.clipped} ${current.clipped === 1 ? 'point falls' : 'points fall'} outside the modified range. ${affectedPoints(dataset, current, 'clipped')}. Widening the range brings them into view; both summaries still include them.`;
  } else if (ratio > 1.2) {
    headline = dataset.id === 'cafe-revenue' ? 'A stronger impression.' : 'Differences look larger.';
    if (dataset.id === 'cafe-revenue') {
      const first = dataset.observations[0]!.value, last = dataset.observations.at(-1)!.value;
      message = `A tighter scale makes the same ${number((last - first) / first * 100, 1)}% rise look steeper. It reveals small changes, but compare the axis ranges.`;
    } else message = 'A tighter scale makes differences look larger and reveals the spread. That can be useful, but compare the axis ranges before judging its size.';
  } else if (ratio < 0.85) {
    headline = 'Differences look smaller.';
    message = 'A wider range compresses the visible differences. It adds scale context, but makes small changes harder to see.';
  } else if (state.lower === dataset.reference.lower && state.upper === dataset.reference.upper) {
    headline = 'The same view, for now.';
    message = 'Both charts use the same range and show every point. Adjust the scale to explore how the impression changes.';
  }
  let statisticMessage = state.statistic === 'mean'
    ? `Mean: ${amount(current.stats.mean, dataset.unit)}. It adds all values and divides by ${dataset.observations.length}.`
    : `Median: ${amount(current.stats.median, dataset.unit)}. It is the middle of the sorted values.`;
  if (outlierCount) statisticMessage += ' The large order pulls the mean above the median, even when its point is hidden.';
  return { headline, message, statisticMessage };
}
