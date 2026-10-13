// View fragments used on more than one page.
import { fmtShort } from '../domain/dates.js';
import { trendSeries } from '../domain/weight.js';
import { lineChart } from './charts.js';
import { esc } from './dom.js';

const TONE_LABEL = { ok: 'ไปได้ดี', info: 'รอข้อมูล', warn: 'ควรตรวจสอบ' };

/** Plateau Detector result. `full` adds the evidence and the optional goal changes. */
export function plateauCard(p, { full = false } = {}) {
  const list = (items) => `<ul class="plain">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
  let html = `
    <div class="card-head">
      <h2>Plateau Detector</h2>
      <span class="badge badge-${p.tone}">${TONE_LABEL[p.tone]}</span>
    </div>
    <div class="notice notice-${p.tone}"><b>${esc(p.title)}</b><br>${esc(p.summary)}</div>`;
  if (p.missing.length) html += `<p class="small muted" style="margin-top:10px">สิ่งที่ยังขาด</p>${list(p.missing)}`;
  if (full || p.status !== 'insufficient') html += `<p class="small muted" style="margin-top:10px">คำแนะนำ</p>${list(p.suggestions)}`;
  if (full && p.evidence.length) html += `<details class="more" style="margin-top:8px"><summary>ข้อมูลที่ใช้ตัดสิน</summary>${list(p.evidence)}</details>`;
  if (full && p.actions.length) {
    html += `<p class="small muted" style="margin-top:10px">ปรับเป้าหมาย (ไม่บังคับ — ระบบจะไม่ปรับเองโดยไม่ถาม)</p>
      <div class="btn-row start" style="margin-top:6px">${p.actions
        .map((a) => `<button type="button" class="btn btn-outline btn-sm" data-act="plateau-action" data-id="${a.id}" data-delta="${a.delta}">${esc(a.label)}</button>`)
        .join('')}</div>`;
  }
  return html;
}

/** Daily weigh-ins (dots) with the 7-day average (line) and the target zone. */
export function weightChart(container, daily, from, to, goals, height = 210) {
  const rows = trendSeries(daily, from, to);
  return lineChart(container, {
    labels: rows.map((r) => fmtShort(r.date)),
    unit: 'กก.',
    height,
    band: { min: goals.targetWeightMin, max: goals.targetWeightMax, label: `เป้าหมาย ${goals.targetWeightMin}–${goals.targetWeightMax} กก.` },
    series: [
      { name: 'น้ำหนักรายวัน', type: 'dots', color: 'var(--chart-raw)', values: rows.map((r) => r.kg) },
      { name: 'ค่าเฉลี่ย 7 วัน', type: 'line', color: 'var(--chart-avg)', values: rows.map((r) => r.avg) },
    ],
  });
}
