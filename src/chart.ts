import { amount, bound, counts, type Dataset, type Range, type Statistic, type View } from './model.ts';
import { PALETTES, type Theme } from './theme.ts';

export const CHART_HEIGHT = 340;
export const INK = '#17212b';
export const ORANGE = '#c43b0d';
export const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);

export function geometry(width: number, range: Range, count: number) {
  const left = 72, right = width - 20, top = 28, bottom = CHART_HEIGHT - 74;
  return {
    left, right, top, bottom,
    x: (index: number) => count === 1 ? (left + right) / 2 : left + index * (right - left) / (count - 1),
    y: (value: number) => bottom - (value - range.lower) / (range.upper - range.lower) * (bottom - top),
  };
}

export function chartBody(dataset: Dataset, current: View, statistic: Statistic, width: number, modified: boolean, id: string, theme: Theme = 'light'): string {
  const palette = PALETTES[theme];
  const { ink, muted, orange, background } = palette;
  const color = modified ? orange : ink;
  const g = geometry(width, current.range, dataset.observations.length);
  const clipId = `clip-${id}`;
  const selected = current.stats[statistic];
  const guideShown = selected >= current.range.lower && selected <= current.range.upper;
  const title = `${modified ? 'Modified' : 'Reference'}: ${dataset.name}`;
  const description = `${counts(current)}. Linear ${dataset.unit} scale from ${bound(current.range.lower)} to ${bound(current.range.upper)}. ${statistic}: ${amount(selected, dataset.unit)}, calculated using all ${dataset.observations.length} values. Source: ${dataset.observations.map(point => `${point.label}: ${amount(point.value, dataset.unit)}`).join('; ')}.`;
  const elements: string[] = [
    `<title id="title-${id}">${escape(title)}</title><desc id="desc-${id}">${escape(description)}</desc>`,
    `<defs><clipPath id="${clipId}"><rect x="${g.left - 5}" y="${g.top - 5}" width="${g.right - g.left + 10}" height="${g.bottom - g.top + 10}"/></clipPath></defs>`,
    `<text x="${g.left}" y="16" font-size="13" fill="${ink}">${escape(dataset.unit)}</text>`,
  ];
  for (let i = 0; i <= 4; i++) {
    const value = current.range.lower + (current.range.upper - current.range.lower) * i / 4;
    const y = g.y(value);
    elements.push(`<line x1="${g.left}" y1="${y}" x2="${g.right}" y2="${y}" stroke="${palette.grid}"/>`);
    elements.push(`<text x="${g.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="${muted}">${escape(bound(value))}</text>`);
  }
  dataset.observations.forEach((point, i) => {
    const x = g.x(i);
    elements.push(`<line x1="${x}" y1="${g.top}" x2="${x}" y2="${g.bottom}" stroke="${palette.minorGrid}"/>`);
    elements.push(`<text x="${x}" y="${g.bottom + 24}" text-anchor="middle" font-size="13" fill="${muted}">${escape(point.label)}</text>`);
  });
  elements.push(`<path d="M${g.left} ${g.top}V${g.bottom}H${g.right}" fill="none" stroke="${palette.axis}" stroke-width="1.2"/>`);
  if (guideShown) {
    const y = g.y(selected);
    elements.push(`<line data-statistic="${statistic}" data-value="${selected}" x1="${g.left}" y1="${y}" x2="${g.right}" y2="${y}" stroke="${muted}" stroke-dasharray="5 4" stroke-width="1.2"/>`);
    elements.push(`<text x="${g.right - 3}" y="${Math.min(g.bottom - 5, y + 18)}" text-anchor="end" font-size="12" fill="${muted}" stroke="${background}" stroke-width="4" paint-order="stroke">${statistic === 'mean' ? 'Mean' : 'Median'} ${escape(amount(selected, dataset.unit))}</text>`);
  } else {
    elements.push(`<text x="${(g.left + g.right) / 2}" y="${CHART_HEIGHT - 8}" text-anchor="middle" font-size="12" fill="${orange}">${statistic === 'mean' ? 'Mean' : 'Median'} ${escape(amount(selected, dataset.unit))} is ${selected > current.range.upper ? 'above' : 'below'} this range</text>`);
  }
  if (dataset.chart === 'line') {
    let path = '', connected = false;
    dataset.observations.forEach((point, i) => {
      if (current.statuses[i] === 'hidden') { connected = false; return; }
      path += `${connected ? 'L' : 'M'}${g.x(i)} ${g.y(point.value)} `;
      connected = true;
    });
    elements.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#${clipId})"/>`);
  }
  dataset.observations.forEach((point, i) => {
    if (current.statuses[i] === 'shown') {
      elements.push(`<circle data-observation="${i}" data-value="${point.value}" cx="${g.x(i)}" cy="${g.y(point.value)}" r="4.5" fill="${color}"><title>${escape(`${dataset.xLabel} ${point.label}: ${amount(point.value, dataset.unit)}`)}</title></circle>`);
    } else if (current.statuses[i] === 'clipped') {
      const x = g.x(i), above = point.value > current.range.upper;
      const y = above ? g.top + 2 : g.bottom - 2;
      const direction = above ? 1 : -1;
      elements.push(`<path data-clipped="${i}" d="M${x} ${y}l-5 ${7 * direction}h10Z" fill="${orange}"><title>${escape(`${dataset.xLabel} ${point.label}: ${amount(point.value, dataset.unit)}, ${above ? 'above' : 'below'} the range. This triangle is a boundary marker, not the point's position.`)}</title></path>`);
    }
  });
  if (!current.shown) {
    elements.push(`<rect x="${g.left + 5}" y="${g.top + 80}" width="${g.right - g.left - 10}" height="60" fill="${background}"/>`);
    elements.push(`<text x="${(g.left + g.right) / 2}" y="${g.top + 103}" text-anchor="middle" font-size="14" fill="${ink}">No points in this range</text>`);
    elements.push(`<text x="${(g.left + g.right) / 2}" y="${g.top + 123}" text-anchor="middle" font-size="12" fill="${muted}">The reference retains every value.</text>`);
  }
  elements.push(`<text x="${(g.left + g.right) / 2}" y="${g.bottom + 48}" text-anchor="middle" font-size="13" fill="${muted}">${escape(dataset.xLabel)}</text>`);
  return elements.join('');
}

export function chartSvg(dataset: Dataset, current: View, statistic: Statistic, width: number, modified: boolean, theme: Theme = 'light'): string {
  const id = `${modified ? 'modified' : 'reference'}-${dataset.id}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CHART_HEIGHT}" viewBox="0 0 ${width} ${CHART_HEIGHT}" role="img" aria-labelledby="title-${id} desc-${id}" font-family="Arial,Helvetica,sans-serif">${chartBody(dataset, current, statistic, width, modified, id, theme)}</svg>`;
}
