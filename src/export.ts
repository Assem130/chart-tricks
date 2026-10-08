import { CHART_HEIGHT, chartBody, escape } from './chart.ts';
import { PALETTES, type Theme } from './theme.ts';
import { affectedPoints, amount, axisNotice, counts, explanation, getDataset, rangeLabel, view, type State } from './model.ts';

function lines(text: string, maxCharacters: number): string[] {
  const result: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + word.length + 1 > maxCharacters) { result.push(line); line = ''; }
    line += (line ? ' ' : '') + word;
  }
  if (line) result.push(line);
  return result;
}

/** The exact chart renderer is shared with the app. Export changes layout, never values. */
export function comparisonSvg(state: State, theme: Theme = 'light'): string {
  const palette = PALETTES[theme];
  const { ink, muted, orange } = palette;
  const dataset = getDataset(state.datasetId);
  const reference = view(dataset, dataset.reference, false), modified = view(dataset, state, state.hideOutliers);
  const text = explanation(state), pieces: string[] = [];
  const width = 1440, margin = 56, chartWidth = 644, rightX = 740;
  const write = (value: string, x: number, y: number, size = 18, color: string = ink, weight = 400) => {
    pieces.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${escape(value)}</text>`);
  };
  const paragraph = (value: string, x: number, y: number, maxCharacters = 126, size = 18, color: string = ink) => {
    const wrapped = lines(value, maxCharacters);
    wrapped.forEach((line, i) => write(line, x, y + i * (size + 9), size, color));
    return y + wrapped.length * (size + 9);
  };
  write('Chart Tricks', margin, 64, 34, orange, 750);
  write(`${dataset.name} · Synthetic data · ${dataset.pattern}`, margin, 110, 20);
  write(`${dataset.observations.length} unchanged values · ${dataset.unit} · linear scales`, margin, 139, 16, muted);
  write(dataset.headline, margin, 194, 26, orange, 700);
  write(text.headline, rightX, 194, 26, orange, 700);
  write('Reference', margin, 229, 23, ink, 700);
  write('Modified', rightX, 229, 23, ink, 700);
  write(`Fixed range: ${rangeLabel(dataset.reference, dataset.unit)}`, margin, 257, 16, muted);
  write(axisNotice(state, dataset.unit), rightX, 257, 16, orange, 600);
  for (const [current, x, isModified, id] of [
    [reference, margin, false, 'export-reference'], [modified, rightX, true, 'export-modified'],
  ] as const) {
    pieces.push(`<g transform="translate(${x} 282)">${chartBody(dataset, current, isModified ? state.statistic : 'median', chartWidth, isModified, id, theme)}</g>`);
    write(counts(current), x + 72, 282 + CHART_HEIGHT + 24, 16, muted);
  }
  let cursor = 282 + CHART_HEIGHT + 54;
  for (const status of ['hidden', 'clipped'] as const) {
    if (modified[status]) cursor = paragraph(`${status === 'hidden' ? 'Hidden' : 'Outside range'}: ${affectedPoints(dataset, modified, status)}`, rightX, cursor, 58, 15, orange);
  }
  pieces.push(`<rect x="${margin}" y="${cursor}" width="${width - margin * 2}" height="80" rx="8" fill="#ff541a"/>`);
  write(`Modified Y-axis: ${rangeLabel(state, dataset.unit)}`, margin + 22, cursor + 33, 20, '#17212b', 650);
  write(`Reference guide: Median · Modified guide: ${state.statistic === 'mean' ? 'Mean' : 'Median'} · Hide outliers: ${state.hideOutliers ? 'on' : 'off'}`, margin + 22, cursor + 61, 18, '#17212b');
  cursor += 125;
  write(`Mean  ${amount(modified.stats.mean, dataset.unit)}`, margin, cursor, 24, ink, 650);
  write(`Median  ${amount(modified.stats.median, dataset.unit)}`, rightX, cursor, 24, ink, 650);
  cursor += 32;
  write(`Both summaries use all ${dataset.observations.length} source values. Visual hiding never changes the statistics.`, margin, cursor, 17, muted);
  cursor += 34;
  cursor = paragraph(`Outlier rule: strict 1.5 × IQR fences; ${modified.stats.outliers.filter(Boolean).length} of ${dataset.observations.length} points flagged. Quartiles are medians of halves; for odd counts, exclude the middle value.`, margin, cursor, 133, 16, muted);
  cursor += 18;
  cursor = paragraph(text.message, margin, cursor, 120, 19);
  cursor += 10;
  cursor = paragraph(text.statisticMessage, margin, cursor, 129, 17, muted);
  cursor += 22;
  pieces.push(`<line x1="${margin}" y1="${cursor}" x2="${width - margin}" y2="${cursor}" stroke="${palette.line}"/>`);
  cursor += 31;
  cursor = paragraph(`Source values (${dataset.unit}): ${dataset.observations.map(point => `${point.label}: ${point.value}`).join(' · ')}`, margin, cursor, 145, 15, muted);
  cursor += 22;
  write('Illustrative data, authored for Chart Tricks. Same values. Different view.', margin, cursor, 15, muted);
  const height = cursor + 38;
  const metadata = escape(JSON.stringify({ theme, dataset: dataset.id, observations: dataset.observations, state, statistics: modified.stats, visibility: { shown: modified.shown, hidden: modified.hidden, clipped: modified.clipped } }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Arial,Helvetica,sans-serif"><title>Chart Tricks: ${escape(dataset.name)} comparison</title><metadata>${metadata}</metadata><rect width="${width}" height="${height}" fill="${palette.background}"/>${pieces.join('')}</svg>`;
}

export async function exportComparison(state: State, theme: Theme = 'light'): Promise<void> {
  const svg = comparisonSvg(state, theme);
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The image could not be rendered. Try exporting again.'));
      image.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth * 2;
    canvas.height = image.naturalHeight * 2;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot create an image. Try a current browser.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('The PNG could not be created. Try exporting again.'));
    }, 'image/png'));
    const pngUrl = URL.createObjectURL(png);
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = `chart-tricks-${state.datasetId}-${theme}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 10_000);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
