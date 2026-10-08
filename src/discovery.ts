import { getDataset, resetState, type State } from './model.ts';

export type ExperimentId = 'scale' | 'visibility' | 'average';
export type Experiment = Readonly<{
  id: ExperimentId; name: string; datasetId: string;
  question: string; context: string; choices: readonly string[];
  reveal: string; takeaway: string; lesson: string;
}>;

export const EXPERIMENTS: readonly Experiment[] = [
  {
    id: 'scale', name: 'The scale', datasetId: 'cafe-revenue',
    question: 'How big is this climb?',
    context: 'Six months of cafe revenue. Read the picture before checking the numbers.',
    choices: ['Almost flat', 'A modest rise', 'A dramatic jump'],
    reveal: 'Reveal the scale trick',
    takeaway: 'The picture changed. The rise did not.',
    lesson: 'Zoom gives small changes more room. It can reveal detail, but the axis tells you how much.',
  },
  {
    id: 'visibility', name: 'The missing point', datasetId: 'large-order',
    question: 'What catches your eye?',
    context: 'Eight shop orders, on one scale. What would you say about this shop?',
    choices: ['Mostly small orders', 'One huge order', 'A wide spread'],
    reveal: 'Reveal the missing point',
    takeaway: 'Out of sight. Still in the data.',
    lesson: 'An outlier flag is a reason to investigate, not proof of an error. Hiding a point changes its visibility, not what it contributes.',
  },
  {
    id: 'average', name: 'The average', datasetId: 'large-order',
    question: 'What is a typical order?',
    context: 'Seven small orders and one large order. Which amount feels representative?',
    choices: ['Around 29 EUR', 'Around 47 EUR', 'One number is not enough'],
    reveal: 'Reveal the two averages',
    takeaway: 'One dataset. Two meanings of average.',
    lesson: 'Mean and median answer different questions. Both use every order, including the large one. Watch the guide move while the points stay put.',
  },
];

export function experimentState(experiment: Experiment, revealed = false): State {
  const dataset = getDataset(experiment.datasetId);
  const baseline = { ...resetState(dataset.id), ...dataset.reference, focus: 0 };
  if (!revealed) return baseline;
  if (experiment.id === 'scale') return { ...baseline, ...dataset.focus, focus: 100 };
  if (experiment.id === 'visibility') return { ...baseline, hideOutliers: true };
  return { ...baseline, statistic: 'mean' };
}
