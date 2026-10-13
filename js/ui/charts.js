// Dependency-free SVG charts with a hover/touch readout.
// One y-axis only. Series colours come from CSS variables so light and dark
// themes are both handled in the stylesheet.
import { esc } from './dom.js';

const PAD = { top: 12, right: 12, bottom: 24, left: 38 };

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 1e-6; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

const fmtTick = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10));

function frame(container, height) {
  const width = Math.max(260, Math.floor(container.clientWidth || 340));
  return { width, height, iw: width - PAD.left - PAD.right, ih: height - PAD.top - PAD.bottom };
}

function axes({ width, iw, ih }, ticks, y, labels, xOf) {
  let out = '';
  for (const t of ticks) {
    const ty = y(t).toFixed(1);
    out += `<line class="grid" x1="${PAD.left}" x2="${width - PAD.right}" y1="${ty}" y2="${ty}"/>`;
    out += `<text class="tick" x="${PAD.left - 6}" y="${ty}" text-anchor="end" dominant-baseline="middle">${fmtTick(t)}</text>`;
  }
  const n = labels.length;
  const idx = n <= 1 ? [0] : n <= 3 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
  idx.forEach((i, k) => {
    const anchor = idx.length === 1 ? 'middle' : k === 0 ? 'start' : k === idx.length - 1 ? 'end' : 'middle';
    out += `<text class="tick" x="${xOf(i).toFixed(1)}" y="${PAD.top + ih + 16}" text-anchor="${anchor}">${esc(labels[i])}</text>`;
  });
  return out;
}

function attachHover(container, { count, xOf, rows }) {
  const svg = container.querySelector('svg');
  const tip = container.querySelector('.chart-tip');
  const cross = svg.querySelector('.cross');
  const show = (ev) => {
    const box = svg.getBoundingClientRect();
    const px = ev.clientX - box.left;
    let i = 0;
    let best = Infinity;
    for (let k = 0; k < count; k++) {
      const d = Math.abs(xOf(k) - px);
      if (d < best) {
        best = d;
        i = k;
      }
    }
    const html = rows(i);
    if (!html) return hide();
    const x = xOf(i);
    cross.setAttribute('x1', x);
    cross.setAttribute('x2', x);
    cross.style.display = '';
    tip.innerHTML = html;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.min(box.width - tw - 4, Math.max(4, x - tw / 2))}px`;
  };
  const hide = () => {
    tip.hidden = true;
    cross.style.display = 'none';
  };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', hide);
}

/**
 * Line / dot chart.
 * labels: x labels (one per point); series: [{ name, color, type: 'line'|'dots', values: (number|null)[] }]
 * band: optional { min, max, label } drawn as a horizontal target zone.
 */
export function lineChart(container, { labels, series, band, unit = '', height = 200, legend = true }) {
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!all.length) {
    container.innerHTML = '';
    return false;
  }
  const f = frame(container, height);
  let lo = Math.min(...all, band ? band.min : Infinity);
  let hi = Math.max(...all, band ? band.max : -Infinity);
  const pad = Math.max((hi - lo) * 0.12, 0.4);
  lo -= pad;
  hi += pad;
  const n = labels.length;
  const xOf = (i) => PAD.left + (n <= 1 ? f.iw / 2 : (i / (n - 1)) * f.iw);
  const y = (v) => PAD.top + f.ih - ((v - lo) / (hi - lo)) * f.ih;

  let marks = '';
  if (band) {
    const y1 = y(band.max);
    const y2 = y(band.min);
    marks += `<rect class="band" x="${PAD.left}" y="${y1.toFixed(1)}" width="${f.iw}" height="${Math.max(1, y2 - y1).toFixed(1)}"/>`;
    marks += `<text class="band-label" x="${f.width - PAD.right - 4}" y="${(y1 - 4).toFixed(1)}" text-anchor="end">${esc(band.label)}</text>`;
  }
  for (const s of series) {
    if (s.type === 'dots') {
      s.values.forEach((v, i) => {
        if (v != null) marks += `<circle cx="${xOf(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${s.color}" class="dot"/>`;
      });
      continue;
    }
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      const lone = !pen && (i === n - 1 || s.values[i + 1] == null);
      if (lone) marks += `<circle cx="${xOf(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5" fill="${s.color}"/>`;
      d += `${pen ? 'L' : 'M'}${xOf(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    marks += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  const legendHtml =
    legend && series.length > 1
      ? `<div class="legend">${series.map((s) => `<span><i class="${s.type === 'dots' ? 'sw-dot' : 'sw-line'}" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`
      : '';
  container.innerHTML = `
    <div class="chart">
      <svg width="${f.width}" height="${f.height}" viewBox="0 0 ${f.width} ${f.height}" role="img" aria-label="${esc(series.map((s) => s.name).join(', '))}">
        ${axes(f, niceTicks(lo, hi), y, labels, xOf)}
        ${marks}
        <line class="cross" y1="${PAD.top}" y2="${PAD.top + f.ih}" style="display:none"/>
      </svg>
      <div class="chart-tip" hidden></div>
    </div>${legendHtml}`;
  attachHover(container, {
    count: n,
    xOf,
    rows: (i) => {
      const lines = series.filter((s) => s.values[i] != null).map((s) => `<div><i style="background:${s.color}"></i>${esc(s.name)} <b>${(Math.round(s.values[i] * 10) / 10).toLocaleString('en-US')}${unit ? ` ${esc(unit)}` : ''}</b></div>`);
      return lines.length ? `<div class="tip-title">${esc(labels[i])}</div>${lines.join('')}` : '';
    },
  });
  return true;
}

/** Bar chart from zero with an optional goal line. values may contain null (no data). */
export function barChart(container, { labels, values, goal, unit = '', height = 170, name = '' }) {
  const present = values.filter((v) => v != null);
  if (!present.length) {
    container.innerHTML = '';
    return false;
  }
  const f = frame(container, height);
  const hi = Math.max(...present, goal || 0) * 1.1 || 1;
  const n = labels.length;
  const slot = f.iw / n;
  const bw = Math.max(3, Math.min(22, slot - 3));
  const xOf = (i) => PAD.left + slot * (i + 0.5);
  const y = (v) => PAD.top + f.ih - (v / hi) * f.ih;
  let marks = '';
  values.forEach((v, i) => {
    if (v == null) return;
    const top = y(v);
    const met = goal && v >= goal;
    marks += `<rect class="bar-mark${met ? ' met' : ''}" x="${(xOf(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, PAD.top + f.ih - top).toFixed(1)}" rx="3"/>`;
  });
  if (goal) {
    const gy = y(goal).toFixed(1);
    marks += `<line class="goal-line" x1="${PAD.left}" x2="${f.width - PAD.right}" y1="${gy}" y2="${gy}"/>`;
    marks += `<text class="band-label" x="${f.width - PAD.right - 4}" y="${gy - 4}" text-anchor="end">เป้าหมาย ${goal.toLocaleString('en-US')}</text>`;
  }
  container.innerHTML = `
    <div class="chart">
      <svg width="${f.width}" height="${f.height}" viewBox="0 0 ${f.width} ${f.height}" role="img" aria-label="${esc(name)}">
        ${axes(f, niceTicks(0, hi), y, labels, xOf)}
        ${marks}
        <line class="cross" y1="${PAD.top}" y2="${PAD.top + f.ih}" style="display:none"/>
      </svg>
      <div class="chart-tip" hidden></div>
    </div>`;
  attachHover(container, {
    count: n,
    xOf,
    rows: (i) => `<div class="tip-title">${esc(labels[i])}</div><div>${values[i] == null ? 'ไม่มีข้อมูล' : `<b>${Math.round(values[i]).toLocaleString('en-US')}${unit ? ` ${esc(unit)}` : ''}</b>`}</div>`,
  });
  return true;
}
