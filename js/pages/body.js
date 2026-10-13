// Weight & waist: logging, trend statistics, charts and the Plateau Detector.
import { addDays, diffDays, fmtLong, fmtShort, nowTime, today } from '../domain/dates.js';
import * as v from '../domain/validate.js';
import { overview } from '../services/insights.js';
import * as repo from '../store/repo.js';
import { lineChart } from '../ui/charts.js';
import { plateauCard, weightChart } from '../ui/components.js';
import { confirmDialog, emptyState, esc, formValues, handleError, icon, n0, n1, openModal, signed1, toast } from '../ui/dom.js';

let rangeKey = '30';
let showAllWeights = false;

export function openWeightForm(app, existing = null) {
  openModal({
    title: existing ? 'แก้ไขน้ำหนัก' : 'บันทึกน้ำหนัก',
    html: `
      <form novalidate>
        <label class="field"><span>น้ำหนัก (กก.)</span>
          <input name="kg" inputmode="decimal" autocomplete="off" required value="${existing ? existing.kg : ''}" placeholder="เช่น 79.6"></label>
        <div class="field-row">
          <label class="field"><span>วันที่</span><input name="date" type="date" max="${today()}" value="${existing ? existing.date : today()}"></label>
          <label class="field"><span>เวลา</span><input name="time" type="time" value="${existing ? existing.time || '' : nowTime()}"></label>
        </div>
        <label class="field"><span>หมายเหตุ (ไม่บังคับ)</span><input name="note" maxlength="200" value="${esc(existing?.note || '')}" placeholder="เช่น หลังตื่นนอน, กินเค็มเมื่อวาน"></label>
        <p class="hint">ชั่งตอนเช้าหลังเข้าห้องน้ำ ก่อนกินหรือดื่ม จะเทียบกันได้ดีที่สุด</p>
        <div class="btn-row"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn btn-primary">บันทึก</button></div>
      </form>`,
    onMount: (body, close) => {
      const form = body.querySelector('form');
      form.kg.focus();
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const f = formValues(form);
          await repo.save('weightLogs', {
            ...(existing || {}),
            kg: v.num(f.kg, v.LIMITS.weightKg),
            date: v.date(f.date),
            time: /^\d{2}:\d{2}$/.test(f.time) ? f.time : '',
            note: v.text(f.note, { label: 'หมายเหตุ' }),
          });
          close();
          toast('บันทึกน้ำหนักแล้ว');
          app.refresh();
        } catch (err) {
          handleError(err);
        }
      };
    },
  });
}

export function openWaistForm(app, existing = null) {
  openModal({
    title: existing ? 'แก้ไขรอบเอว' : 'บันทึกรอบเอว',
    html: `
      <form novalidate>
        <div class="field-row">
          <label class="field"><span>รอบเอว (ซม.)</span><input name="cm" inputmode="decimal" autocomplete="off" required value="${existing ? existing.cm : ''}" placeholder="เช่น 86.5"></label>
          <label class="field"><span>วันที่</span><input name="date" type="date" max="${today()}" value="${existing ? existing.date : today()}"></label>
        </div>
        <label class="field"><span>หมายเหตุ (ไม่บังคับ)</span><input name="note" maxlength="200" value="${esc(existing?.note || '')}"></label>
        <p class="hint">วัดที่ระดับสะดือ ตอนเช้า หายใจออกปกติ ไม่แขม่วท้อง — วัดตำแหน่งเดิมทุกครั้ง</p>
        <div class="btn-row"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn btn-primary">บันทึก</button></div>
      </form>`,
    onMount: (body, close) => {
      const form = body.querySelector('form');
      form.cm.focus();
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const f = formValues(form);
          await repo.save('waistLogs', {
            ...(existing || {}),
            cm: v.num(f.cm, v.LIMITS.waistCm),
            date: v.date(f.date),
            note: v.text(f.note, { label: 'หมายเหตุ' }),
          });
          close();
          toast('บันทึกรอบเอวแล้ว');
          app.refresh();
        } catch (err) {
          handleError(err);
        }
      };
    },
  });
}

async function applyPlateauAction(app, o, id, delta) {
  const { goals } = o;
  const patch = id === 'kcal' ? { kcal: goals.kcal + delta, carbG: Math.max(0, Math.round((goals.carbG + delta / 4) / 5) * 5) } : { steps: goals.steps + delta };
  const message =
    id === 'kcal'
      ? `เป้าหมายแคลอรี ${n0(goals.kcal)} → ${n0(patch.kcal)} kcal/วัน\nคาร์โบไฮเดรต ${n0(goals.carbG)} → ${n0(patch.carbG)} ก. (โปรตีนและไขมันคงเดิม)\n\nใช้เป้าหมายใหม่อย่างน้อย 2 สัปดาห์ก่อนประเมินอีกครั้ง`
      : `เป้าหมายก้าว ${n0(goals.steps)} → ${n0(patch.steps)} ก้าว/วัน\n\nใช้เป้าหมายใหม่อย่างน้อย 2 สัปดาห์ก่อนประเมินอีกครั้ง`;
  if (!(await confirmDialog({ title: 'ปรับเป้าหมาย?', message, confirmText: 'ปรับเป้าหมาย' }))) return;
  await repo.changeGoals(patch, `Plateau Detector: ${o.plateau.title}`, o.today);
  toast('ปรับเป้าหมายแล้ว');
  app.refresh();
}

export function render(root, app) {
  const o = overview();
  const { summary: s, goals, profile } = o;
  const weights = [...o.data.weightLogs].sort((a, b) => (a.date + (a.time || '') < b.date + (b.time || '') ? 1 : -1));
  const waists = [...o.data.waistLogs].sort((a, b) => (a.date < b.date ? 1 : -1));
  const first = weights.length ? weights[weights.length - 1].date : o.today;
  const from = rangeKey === 'all' ? (first < addDays(o.today, -29) ? first : addDays(o.today, -29)) : addDays(o.today, -(Number(rangeKey) - 1));
  const shown = showAllWeights ? weights : weights.slice(0, 10);

  const stat = (label, value, sub = '') => `<div class="card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`;
  const rateText = s.rate == null ? '–' : `${signed1(s.rate)}<small>กก./สัปดาห์</small>`;

  root.innerHTML = `
    <div class="page-head">
      <div><h1>น้ำหนักและรอบเอว</h1><p>ดูแนวโน้มจากค่าเฉลี่ย ไม่ใช่ตัวเลขวันเดียว</p></div>
      <div class="btn-row start">
        <button class="btn btn-primary" data-act="add-weight">${icon('plus')}น้ำหนัก</button>
        <button class="btn btn-outline" data-act="add-waist">${icon('plus')}รอบเอว</button>
      </div>
    </div>

    <div class="grid grid-3">
      ${stat('น้ำหนักล่าสุด', s.latest ? `${n1(s.latest.kg)}<small>กก.</small>` : '–', s.latest ? fmtShort(s.latest.date) : 'ยังไม่มีการชั่ง')}
      ${stat('เฉลี่ย 7 วัน', s.avg7.n ? `${n1(s.avg7.avg)}<small>กก.</small>` : '–', s.avg7.n ? `จากการชั่ง ${s.avg7.n} วัน` : 'ยังไม่มีข้อมูล')}
      ${stat('เฉลี่ยสัปดาห์นี้', s.thisWeek.n ? `${n1(s.thisWeek.avg)}<small>กก.</small>` : '–', s.weekChange == null ? 'ยังเทียบสัปดาห์ก่อนไม่ได้' : `เทียบสัปดาห์ก่อน ${signed1(s.weekChange)} กก.`)}
      ${stat('ลดสะสม', s.totalLost == null ? '–' : `${n1(s.totalLost)}<small>กก.</small>`, `เริ่มต้น ${n1(profile.startWeightKg)} กก.`)}
      ${stat('อัตราการเปลี่ยนแปลง', rateText, s.rate == null ? 'ต้องชั่ง ≥6 วัน ในช่วง 3 สัปดาห์' : 'แนวโน้ม 3 สัปดาห์ล่าสุด')}
      ${stat('รอบเอวล่าสุด', waists.length ? `${n1(waists[0].cm)}<small>ซม.</small>` : '–', waists.length > 1 ? `ครั้งก่อน ${n1(waists[1].cm)} ซม. (${signed1(waists[0].cm - waists[1].cm)})` : waists.length ? fmtShort(waists[0].date) : 'ยังไม่ได้วัด')}
    </div>

    <div class="cols">
      <section class="card">
        <div class="card-head">
          <h2>กราฟน้ำหนัก</h2>
          <div class="seg" role="group" aria-label="ช่วงเวลา">
            ${[['30', '30 วัน'], ['90', '90 วัน'], ['all', 'ทั้งหมด']].map(([k, l]) => `<button data-range="${k}" class="${k === rangeKey ? 'active' : ''}">${l}</button>`).join('')}
          </div>
        </div>
        <div id="weight-chart"></div>
        <p class="hint" style="margin-top:8px">จุดสีเทา = น้ำหนักรายวัน ซึ่งขึ้นลงตามน้ำ เกลือ และไกลโคเจนได้ 0.5–1.5 กก. · เส้นสีเขียว = ค่าเฉลี่ย 7 วัน ใช้เส้นนี้ตัดสินความคืบหน้า</p>
      </section>
      <section class="card">${plateauCard(o.plateau, { full: true })}</section>
    </div>

    <div class="cols">
      <section class="card">
        <div class="card-head"><h2>ประวัติน้ำหนัก</h2><span class="muted">${weights.length} รายการ</span></div>
        ${
          weights.length
            ? `<div class="list">${shown
                .map(
                  (w) => `<div class="row">
                    <div class="row-main"><div class="row-title">${esc(fmtLong(w.date))}${w.time ? ` · ${esc(w.time)}` : ''}</div>${w.note ? `<div class="row-sub">${esc(w.note)}</div>` : ''}</div>
                    <div class="row-value">${n1(w.kg)} กก.</div>
                    <button class="icon-btn" data-act="edit-weight" data-id="${w.id}" aria-label="แก้ไข">${icon('edit')}</button>
                    <button class="icon-btn" data-act="del-weight" data-id="${w.id}" aria-label="ลบ">${icon('trash')}</button>
                  </div>`
                )
                .join('')}</div>
                ${weights.length > 10 ? `<button class="btn btn-ghost btn-sm btn-block" data-act="toggle-all">${showAllWeights ? 'แสดงน้อยลง' : `แสดงทั้งหมด (${weights.length})`}</button>` : ''}`
            : emptyState('ยังไม่มีการบันทึกน้ำหนัก', '<button class="btn btn-primary btn-sm" data-act="add-weight">บันทึกครั้งแรก</button>')
        }
      </section>
      <section class="card">
        <div class="card-head"><h2>รอบเอว</h2><span class="muted">${waists.length} รายการ</span></div>
        <div id="waist-chart"></div>
        ${
          waists.length
            ? `<div class="list">${waists
                .slice(0, 12)
                .map(
                  (w) => `<div class="row">
                    <div class="row-main"><div class="row-title">${esc(fmtLong(w.date))}</div>${w.note ? `<div class="row-sub">${esc(w.note)}</div>` : ''}</div>
                    <div class="row-value">${n1(w.cm)} ซม.</div>
                    <button class="icon-btn" data-act="edit-waist" data-id="${w.id}" aria-label="แก้ไข">${icon('edit')}</button>
                    <button class="icon-btn" data-act="del-waist" data-id="${w.id}" aria-label="ลบ">${icon('trash')}</button>
                  </div>`
                )
                .join('')}</div>`
            : emptyState('ยังไม่มีการวัดรอบเอว — วัดสัปดาห์ละครั้งเพื่อแยกไขมันออกจากน้ำหนักน้ำ', '<button class="btn btn-outline btn-sm" data-act="add-waist">บันทึกรอบเอว</button>')
        }
      </section>
    </div>

    <a class="card" href="#/photos" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:12px">
      ${icon('camera')}<div class="row-main"><div class="row-title">ภาพเปรียบเทียบรูปร่าง</div><div class="row-sub">อัปโหลดภาพของคุณเองเพื่อเทียบก่อน–หลัง เก็บไว้ในอุปกรณ์นี้เท่านั้น</div></div>${icon('right')}
    </a>`;

  const wc = root.querySelector('#weight-chart');
  if (!weightChart(wc, s.daily, from, o.today, goals, 230)) {
    wc.innerHTML = emptyState(`ไม่มีการชั่งน้ำหนักในช่วง ${diffDays(from, o.today) + 1} วันนี้`);
  }
  const asc = [...waists].reverse();
  if (asc.length >= 2) {
    lineChart(root.querySelector('#waist-chart'), {
      labels: asc.map((w) => fmtShort(w.date)),
      unit: 'ซม.',
      height: 150,
      series: [{ name: 'รอบเอว', type: 'line', color: 'var(--chart-alt)', values: asc.map((w) => w.cm) }],
    });
  }

  root.onclick = async (e) => {
    const range = e.target.closest('[data-range]');
    if (range) {
      rangeKey = range.dataset.range;
      return app.refresh();
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    try {
      if (act === 'add-weight') openWeightForm(app);
      else if (act === 'add-waist') openWaistForm(app);
      else if (act === 'edit-weight') openWeightForm(app, repo.get('weightLogs', id));
      else if (act === 'edit-waist') openWaistForm(app, repo.get('waistLogs', id));
      else if (act === 'toggle-all') {
        showAllWeights = !showAllWeights;
        app.refresh();
      } else if (act === 'del-weight' || act === 'del-waist') {
        const store = act === 'del-weight' ? 'weightLogs' : 'waistLogs';
        const rec = repo.get(store, id);
        const label = store === 'weightLogs' ? `${n1(rec.kg)} กก.` : `${n1(rec.cm)} ซม.`;
        if (await confirmDialog({ title: 'ลบรายการนี้?', message: `${fmtLong(rec.date)} — ${label}`, confirmText: 'ลบ', danger: true })) {
          await repo.remove(store, id);
          toast('ลบแล้ว');
          app.refresh();
        }
      } else if (act === 'plateau-action') {
        await applyPlateauAction(app, o, btn.dataset.id, Number(btn.dataset.delta));
      }
    } catch (err) {
      handleError(err);
    }
  };
}
