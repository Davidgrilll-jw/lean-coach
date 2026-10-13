// Workout Tracker: weekly dumbbell plan, live session logging with a rest
// timer, progression advice, history and per-exercise progress.
import { addDays, fmtLong, fmtShort, today, weekStart, weekday, WEEKDAY_NAMES } from '../domain/dates.js';
import * as v from '../domain/validate.js';
import { MUSCLES, exerciseHistory, muscleSets, progressionAdvice, recoveryConflicts, workoutDays } from '../domain/workout.js';
import * as repo from '../store/repo.js';
import { lineChart } from '../ui/charts.js';
import { confirmDialog, emptyState, esc, formValues, handleError, icon, n0, n1, openModal, toast } from '../ui/dom.js';

let rest = null; // { until: epoch ms, total: seconds }
let ticker = null;
let progressEx = null;

const sessions = () => repo.list('workoutSessions');
const exMap = () => new Map(repo.list('exercises').map((e) => [e.id, e]));
const activeSession = () => sessions().find((s) => s.status === 'active') || null;
const finished = () => sessions().filter((s) => s.status !== 'active');
const unitLabel = (unit) => (unit === 'sec' ? 'วินาที' : 'ครั้ง');
const setText = (s, unit) => (s.kg > 0 ? `${n1(s.kg)} กก. × ${s.reps}` : `${s.reps} ${unitLabel(unit)}`);
const muscleBadges = (ex) => (ex?.muscles || []).map((m) => `<span class="badge">${MUSCLES[m] || m}</span>`).join(' ');
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

export function leave() {
  clearInterval(ticker);
  ticker = null;
}

function startTicker(root) {
  clearInterval(ticker);
  const paint = () => {
    const el = root.querySelector('#rest-bar');
    if (!el) return;
    const left = rest ? Math.ceil((rest.until - Date.now()) / 1000) : 0;
    if (!rest || left <= -120) {
      rest = null;
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.querySelector('#rest-text').textContent = left > 0 ? `พัก ${mmss(left)} / ${mmss(rest.total)}` : `ครบเวลาพักแล้ว — เริ่มเซตถัดไป (+${mmss(-left)})`;
  };
  paint();
  ticker = setInterval(paint, 500);
}

// ---------- start / log / finish ----------

async function startPlan(app, plan) {
  const t = today();
  const ex = exMap();
  const conflicts = recoveryConflicts(finished(), ex, plan.exercises.map((r) => r.exerciseId), t);
  if (conflicts.length) {
    const ok = await confirmDialog({
      title: 'กล้ามเนื้อยังพักไม่ครบ',
      message: `เมื่อวานฝึก ${conflicts.map((m) => MUSCLES[m]).join(', ')} ไปแล้ว ซึ่งอยู่ในตารางวันนี้ด้วย\n\nควรเว้นอย่างน้อย 1 วัน (ประมาณ 48 ชั่วโมง) ก่อนฝึกกล้ามเนื้อเดิม ต้องการเริ่มฝึกต่อหรือไม่?`,
      confirmText: 'เริ่มฝึกต่อ',
    });
    if (!ok) return;
  } else if (workoutDays(finished(), t, t) > 0) {
    if (!(await confirmDialog({ title: 'วันนี้ฝึกไปแล้ว', message: 'มีการฝึกที่บันทึกไว้ของวันนี้แล้ว ต้องการเริ่มอีกรอบหรือไม่?', confirmText: 'เริ่มอีกรอบ' }))) return;
  }
  await repo.save('workoutSessions', {
    date: t,
    type: 'workout',
    status: 'active',
    planId: plan.id,
    planName: plan.name,
    items: plan.exercises.filter((r) => ex.has(r.exerciseId)).map((r) => ({ ...r, name: ex.get(r.exerciseId).name, unit: ex.get(r.exerciseId).unit })),
    sets: [],
    startedAt: new Date().toISOString(),
  });
  rest = null;
  app.refresh();
}

async function logSet(app, session, form) {
  const item = session.items.find((i) => i.exerciseId === form.dataset.ex);
  const f = formValues(form);
  const kg = v.num(f.kg === '' ? '0' : f.kg, v.LIMITS.dumbbellKg);
  const reps = v.num(f.reps, { ...v.LIMITS.reps, label: item.unit === 'sec' ? 'เวลา (วินาที)' : 'จำนวนครั้ง' });
  const now = Date.now();
  const prev = session.sets[session.sets.length - 1];
  const gap = prev ? Math.round((now - Date.parse(prev.at)) / 1000) : null;
  const set = {
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    exerciseId: item.exerciseId,
    exerciseName: item.name,
    kg,
    reps,
    restSec: gap != null && gap <= 900 ? gap : null, // actual rest since the previous set
    plannedRestSec: item.restSec,
    at: new Date(now).toISOString(),
  };
  await repo.save('workoutSessions', { ...session, sets: [...session.sets, set] });
  rest = { until: now + item.restSec * 1000, total: item.restSec };
  app.refresh();
}

function openFinishModal(app, session) {
  openModal({
    title: 'จบการฝึก',
    html: `
      <form novalidate>
        <p class="muted small">${session.sets.length} เซต · ${new Set(session.sets.map((s) => s.exerciseId)).size} ท่า</p>
        <label class="field"><span>แรงวันนี้เทียบกับปกติ</span><select name="energy">
          <option value="3">ดีกว่าปกติ</option><option value="2" selected>ปกติ</option><option value="1">แย่กว่าปกติ / ล้า</option>
        </select></label>
        <label class="field"><span>หมายเหตุ (ไม่บังคับ)</span><textarea name="note" maxlength="300" placeholder="เช่น นอนน้อย, เตะบอลเมื่อวาน"></textarea></label>
        <div class="btn-row"><button type="button" class="btn btn-ghost" data-close>ฝึกต่อ</button><button class="btn btn-primary">บันทึกการฝึก</button></div>
      </form>`,
    onMount: (body, close) => {
      const form = body.querySelector('form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const f = formValues(form);
          const end = new Date();
          await repo.save('workoutSessions', {
            ...session,
            status: 'done',
            finishedAt: end.toISOString(),
            durationMin: Math.max(1, Math.round((end - Date.parse(session.startedAt)) / 60000)),
            energy: Number(f.energy),
            note: v.text(f.note, { label: 'หมายเหตุ', max: 300 }),
          });
          rest = null;
          close();
          toast('บันทึกการฝึกแล้ว');
          app.refresh();
        } catch (err) {
          handleError(err);
        }
      };
    },
  });
}

function openAddExerciseModal(app, session) {
  const used = new Set(session.items.map((i) => i.exerciseId));
  const options = repo.list('exercises').filter((e) => !used.has(e.id));
  openModal({
    title: 'เพิ่มท่าในการฝึกนี้',
    html: `
      <form novalidate>
        <label class="field"><span>ท่า</span><select name="exerciseId">${options.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label>
        <div class="field-row four">
          <label class="field"><span>เซต</span><input name="sets" inputmode="numeric" value="3"></label>
          <label class="field"><span>ต่ำสุด</span><input name="repMin" inputmode="numeric" value="8"></label>
          <label class="field"><span>สูงสุด</span><input name="repMax" inputmode="numeric" value="12"></label>
          <label class="field"><span>พัก (วิ)</span><input name="restSec" inputmode="numeric" value="75"></label>
        </div>
        <div class="btn-row"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn btn-primary" ${options.length ? '' : 'disabled'}>เพิ่ม</button></div>
      </form>`,
    onMount: (body, close) => {
      const form = body.querySelector('form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const row = readPlanRow(formValues(form));
          const ex = repo.get('exercises', row.exerciseId);
          await repo.save('workoutSessions', { ...session, items: [...session.items, { ...row, name: ex.name, unit: ex.unit }] });
          close();
          app.refresh();
        } catch (err) {
          handleError(err);
        }
      };
    },
  });
}

function readPlanRow(f) {
  const row = {
    exerciseId: f.exerciseId,
    sets: v.num(f.sets, { label: 'จำนวนเซต', min: 1, max: 8, integer: true }),
    repMin: v.num(f.repMin, { label: 'จำนวนต่ำสุด', min: 1, max: 300, integer: true }),
    repMax: v.num(f.repMax, { label: 'จำนวนสูงสุด', min: 1, max: 600, integer: true }),
    restSec: v.num(f.restSec, { label: 'เวลาพัก (วินาที)', min: 0, max: 600, integer: true }),
  };
  if (!repo.get('exercises', row.exerciseId)) throw new v.ValidationError('กรุณาเลือกท่า');
  if (row.repMax < row.repMin) throw new v.ValidationError('จำนวนสูงสุดต้องไม่น้อยกว่าจำนวนต่ำสุด');
  return row;
}

// ---------- plan editor ----------

function openExerciseForm(onSaved) {
  openModal({
    title: 'สร้างท่าใหม่',
    html: `
      <form novalidate>
        <label class="field"><span>ชื่อท่า</span><input name="name" maxlength="60" required></label>
        <div class="field"><span>กล้ามเนื้อหลัก (เลือกได้หลายส่วน)</span>
          <div class="grid grid-2" style="gap:6px">${Object.entries(MUSCLES).map(([k, l]) => `<label class="check"><input type="checkbox" name="m_${k}"> ${l}</label>`).join('')}</div>
        </div>
        <div class="field-row">
          <label class="field"><span>อุปกรณ์</span><select name="equipment"><option value="dumbbell">ดัมเบล</option><option value="bodyweight">น้ำหนักตัว</option></select></label>
          <label class="field"><span>นับเป็น</span><select name="unit"><option value="reps">จำนวนครั้ง</option><option value="sec">วินาที (ท่าค้าง)</option></select></label>
        </div>
        <div class="btn-row"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn btn-primary">บันทึก</button></div>
      </form>`,
    onMount: (body, close) => {
      const form = body.querySelector('form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const f = formValues(form);
          const muscles = Object.keys(MUSCLES).filter((k) => f[`m_${k}`]);
          if (!muscles.length) throw new v.ValidationError('เลือกกล้ามเนื้อหลักอย่างน้อย 1 ส่วน');
          const saved = await repo.save('exercises', {
            name: v.text(f.name, { label: 'ชื่อท่า', max: 60, optional: false }),
            muscles,
            secondary: [],
            unit: f.unit === 'sec' ? 'sec' : 'reps',
            equipment: f.equipment === 'bodyweight' ? 'bodyweight' : 'dumbbell',
            custom: true,
          });
          close();
          toast('เพิ่มท่าแล้ว');
          onSaved(saved);
        } catch (err) {
          handleError(err);
        }
      };
    },
  });
}

function openPlanEditor(app, plan = null) {
  const state = {
    name: plan?.name || '',
    weekday: plan?.weekday ?? 1,
    rows: plan ? plan.exercises.map((r) => ({ ...r })) : [],
  };
  const modal = openModal({ title: plan ? 'แก้ไขตารางฝึก' : 'สร้างตารางฝึก', wide: true, html: '<form novalidate id="plan-form"></form>' });
  const form = modal.el.querySelector('#plan-form');

  // Keep what has been typed when rows are added or removed.
  const sync = () => {
    state.name = form.elements.name.value;
    state.weekday = Number(form.elements.weekday.value);
    state.rows = [...form.querySelectorAll('[data-row]')].map((el) => Object.fromEntries(['exerciseId', 'sets', 'repMin', 'repMax', 'restSec'].map((k) => [k, el.querySelector(`[data-f="${k}"]`).value])));
  };
  const draw = () => {
    const exercises = [...repo.list('exercises')].sort((a, b) => a.name.localeCompare(b.name));
    form.innerHTML = `
      <div class="field-row">
        <label class="field"><span>ชื่อตาราง</span><input name="name" maxlength="60" value="${esc(state.name)}" placeholder="เช่น วัน A — Full Body"></label>
        <label class="field"><span>วันที่แนะนำให้ฝึก</span><select name="weekday">${WEEKDAY_NAMES.map((d, i) => `<option value="${i}" ${i === state.weekday ? 'selected' : ''}>วัน${d}</option>`).join('')}</select></label>
      </div>
      ${state.rows
        .map(
          (r, i) => `<div class="card" data-row="${i}" style="padding:12px;box-shadow:none">
            <div style="display:flex;gap:8px;align-items:center">
              <select data-f="exerciseId" aria-label="ท่า">${exercises.map((e) => `<option value="${e.id}" ${e.id === r.exerciseId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
              <button type="button" class="icon-btn" data-remove="${i}" aria-label="ลบท่านี้">${icon('trash')}</button>
            </div>
            <div class="field-row four" style="margin-top:8px">
              <label class="field"><span>เซต</span><input data-f="sets" inputmode="numeric" value="${esc(r.sets)}"></label>
              <label class="field"><span>ต่ำสุด</span><input data-f="repMin" inputmode="numeric" value="${esc(r.repMin)}"></label>
              <label class="field"><span>สูงสุด</span><input data-f="repMax" inputmode="numeric" value="${esc(r.repMax)}"></label>
              <label class="field"><span>พัก (วิ)</span><input data-f="restSec" inputmode="numeric" value="${esc(r.restSec)}"></label>
            </div>
          </div>`
        )
        .join('')}
      <div class="btn-row start">
        <button type="button" class="btn btn-outline btn-sm" data-add-row>${icon('plus')}เพิ่มท่า</button>
        <button type="button" class="btn btn-ghost btn-sm" data-new-ex>สร้างท่าใหม่</button>
      </div>
      <p class="hint">แนะนำ 5–7 ท่าต่อวัน เซตละ 8–15 ครั้ง และเว้นอย่างน้อย 1 วันก่อนฝึกกล้ามเนื้อเดิมซ้ำ</p>
      <div class="btn-row">
        ${plan ? '<button type="button" class="btn btn-ghost" data-del-plan style="color:var(--danger)">ลบตาราง</button>' : ''}
        <button class="btn btn-primary">บันทึกตาราง</button>
      </div>`;
  };
  draw();

  form.onclick = async (e) => {
    const t = e.target.closest('[data-remove],[data-add-row],[data-new-ex],[data-del-plan]');
    if (!t) return;
    sync();
    if (t.dataset.remove) {
      state.rows.splice(Number(t.dataset.remove), 1);
      draw();
    } else if ('addRow' in t.dataset) {
      state.rows.push({ exerciseId: repo.list('exercises')[0]?.id, sets: 3, repMin: 8, repMax: 12, restSec: 75 });
      draw();
    } else if ('newEx' in t.dataset) {
      openExerciseForm((ex) => {
        state.rows.push({ exerciseId: ex.id, sets: 3, repMin: 8, repMax: 12, restSec: 75 });
        draw();
      });
    } else if ('delPlan' in t.dataset) {
      if (await confirmDialog({ title: 'ลบตารางนี้?', message: `${plan.name}\n\nประวัติการฝึกที่บันทึกไว้จะยังอยู่`, confirmText: 'ลบ', danger: true })) {
        await repo.remove('workoutPlans', plan.id);
        modal.close();
        toast('ลบตารางแล้ว');
        app.refresh();
      }
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      sync();
      const rows = state.rows.map(readPlanRow);
      if (!rows.length) throw new v.ValidationError('เพิ่มอย่างน้อย 1 ท่า');
      await repo.save('workoutPlans', {
        ...(plan || { order: repo.list('workoutPlans').length + 1 }),
        name: v.text(state.name, { label: 'ชื่อตาราง', max: 60, optional: false }),
        weekday: state.weekday,
        exercises: rows,
      });
      modal.close();
      toast('บันทึกตารางแล้ว');
      app.refresh();
    } catch (err) {
      handleError(err);
    }
  };
}

// ---------- rest day & history ----------

function openRestForm(app, existing = null) {
  openModal({
    title: existing ? 'แก้ไขวันพัก' : 'บันทึกวันพัก / การฟื้นตัว',
    html: `
      <form novalidate>
        <div class="field-row">
          <label class="field"><span>วันที่</span><input type="date" name="date" max="${today()}" value="${existing?.date || today()}"></label>
          <label class="field"><span>ชั่วโมงนอน (ไม่บังคับ)</span><input name="sleepHours" inputmode="decimal" value="${existing?.sleepHours ?? ''}" placeholder="เช่น 7.5"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>ปวดเมื่อยกล้ามเนื้อ</span><select name="soreness">${[['1', 'ไม่ปวด'], ['2', 'เล็กน้อย'], ['3', 'ปานกลาง'], ['4', 'มาก'], ['5', 'มากจนกระทบการขยับ']].map(([k, l]) => `<option value="${k}" ${String(existing?.soreness || 2) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>ความสดชื่น</span><select name="energy">${[['3', 'ดี'], ['2', 'ปกติ'], ['1', 'ล้า']].map(([k, l]) => `<option value="${k}" ${String(existing?.energy || 2) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>หมายเหตุ (ไม่บังคับ)</span><input name="note" maxlength="200" value="${esc(existing?.note || '')}"></label>
        <div class="btn-row"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn btn-primary">บันทึก</button></div>
      </form>`,
    onMount: (body, close) => {
      const form = body.querySelector('form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const f = formValues(form);
          await repo.save('workoutSessions', {
            ...(existing || {}),
            type: 'rest',
            status: 'done',
            sets: [],
            date: v.date(f.date),
            sleepHours: v.num(f.sleepHours, { label: 'ชั่วโมงนอน', min: 0, max: 24, optional: true }),
            soreness: Number(f.soreness),
            energy: Number(f.energy),
            note: v.text(f.note, { label: 'หมายเหตุ' }),
          });
          close();
          toast('บันทึกวันพักแล้ว');
          app.refresh();
        } catch (err) {
          handleError(err);
        }
      };
    },
  });
}

function openSessionDetail(app, session) {
  if (session.type === 'rest') return openRestForm(app, session);
  const ex = exMap();
  const groups = new Map();
  for (const s of session.sets) {
    if (!groups.has(s.exerciseId)) groups.set(s.exerciseId, []);
    groups.get(s.exerciseId).push(s);
  }
  openModal({
    title: `${fmtLong(session.date)}`,
    wide: true,
    html: `
      <form novalidate>
        <p class="muted small">${esc(session.planName || 'เวท')} · ${session.sets.length} เซต${session.durationMin ? ` · ${session.durationMin} นาที` : ''}</p>
        ${[...groups]
          .map(
            ([id, sets]) => `<div>
              <h3>${esc(sets[0].exerciseName)}</h3>
              ${sets
                .map(
                  (s, i) => `<div class="set-row" data-set="${s.id}" style="margin-top:6px">
                    <span class="idx">${i + 1}</span>
                    <input data-f="kg" inputmode="decimal" value="${s.kg}" aria-label="น้ำหนัก กก.">
                    <input data-f="reps" inputmode="numeric" value="${s.reps}" aria-label="${unitLabel(ex.get(id)?.unit)}">
                    <label class="check small"><input type="checkbox" data-f="del"> ลบ</label>
                  </div>`
                )
                .join('')}
            </div>`
          )
          .join('')}
        <label class="field"><span>วันที่</span><input type="date" name="date" max="${today()}" value="${session.date}"></label>
        <label class="field"><span>หมายเหตุ</span><textarea name="note" maxlength="300">${esc(session.note || '')}</textarea></label>
        <p class="hint">ช่องแรก = น้ำหนักดัมเบลต่อข้าง (กก.) ช่องที่สอง = จำนวนครั้งหรือวินาที</p>
        <div class="btn-row">
          <button type="button" class="btn btn-ghost" data-del-session style="color:var(--danger)">ลบการฝึกนี้</button>
          <button class="btn btn-primary">บันทึกการแก้ไข</button>
        </div>
      </form>`,
    onMount: (body, close) => {
      const form = body.querySelector('form');
      body.querySelector('[data-del-session]').onclick = async () => {
        if (await confirmDialog({ title: 'ลบการฝึกนี้?', message: `${fmtLong(session.date)} — ${session.sets.length} เซต`, confirmText: 'ลบ', danger: true })) {
          await repo.remove('workoutSessions', session.id);
          close();
          toast('ลบแล้ว');
          app.refresh();
        }
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const sets = [];
          for (const s of session.sets) {
            const row = form.querySelector(`[data-set="${s.id}"]`);
            if (row.querySelector('[data-f="del"]').checked) continue;
            sets.push({
              ...s,
              kg: v.num(row.querySelector('[data-f="kg"]').value, v.LIMITS.dumbbellKg),
              reps: v.num(row.querySelector('[data-f="reps"]').value, v.LIMITS.reps),
            });
          }
          await repo.save('workoutSessions', { ...session, sets, date: v.date(form.elements.date.value), note: v.text(form.elements.note.value, { label: 'หมายเหตุ', max: 300 }) });
          close();
          toast('บันทึกแล้ว');
          app.refresh();
        } catch (err) {
          handleError(err);
        }
      };
    },
  });
}

// ---------- views ----------

function renderActive(root, app, session) {
  const ex = exMap();
  const past = finished();
  const cards = session.items
    .map((item) => {
      const done = session.sets.filter((s) => s.exerciseId === item.exerciseId);
      const hist = exerciseHistory(past, item.exerciseId);
      const last = hist[hist.length - 1];
      const advice = progressionAdvice(last?.sets, item, item.unit);
      const template = done[done.length - 1] || last?.sets[Math.min(done.length, (last?.sets.length || 1) - 1)];
      const bodyweight = ex.get(item.exerciseId)?.equipment === 'bodyweight';
      const complete = done.length >= item.sets;
      return `
        <section class="card">
          <div class="card-head">
            <div><h2>${esc(item.name)}</h2><div class="muscles" style="margin-top:4px">${muscleBadges(ex.get(item.exerciseId))}</div></div>
            <span class="badge ${complete ? 'badge-ok' : ''}">${done.length}/${item.sets} เซต</span>
          </div>
          <p class="small muted">เป้าหมาย ${item.sets} เซต × ${item.repMin}–${item.repMax} ${unitLabel(item.unit)} · พัก ${item.restSec} วินาที</p>
          <p class="small muted">${last ? `ครั้งก่อน (${fmtShort(last.date)}): ${last.sets.map((s) => setText(s, item.unit)).join(', ')}` : 'ยังไม่เคยบันทึกท่านี้'}</p>
          <div class="notice" style="margin:8px 0">${esc(advice.text)}</div>
          ${done
            .map(
              (s, i) => `<div class="set-done"><span class="idx">${i + 1}</span><span style="flex:1"><b>${setText(s, item.unit)}</b>${s.restSec != null && i > 0 ? `<span class="muted small"> · พักจริง ${mmss(s.restSec)}</span>` : ''}</span>
                <button class="icon-btn" data-act="del-set" data-id="${s.id}" aria-label="ลบเซต">${icon('trash')}</button></div>`
            )
            .join('')}
          <form class="set-row" data-ex="${item.exerciseId}" novalidate style="margin-top:6px">
            <span class="idx">${done.length + 1}</span>
            <input name="kg" inputmode="decimal" autocomplete="off" placeholder="${bodyweight ? 'กก. (0 = ตัวเปล่า)' : 'กก./ข้าง'}" value="${template ? template.kg : bodyweight ? 0 : ''}" aria-label="น้ำหนักดัมเบล กก.">
            <input name="reps" inputmode="numeric" autocomplete="off" placeholder="${unitLabel(item.unit)}" value="${template ? template.reps : ''}" aria-label="${unitLabel(item.unit)}">
            <button class="btn ${complete ? 'btn-outline' : 'btn-primary'} btn-sm" aria-label="บันทึกเซต">${icon('check')}</button>
          </form>
        </section>`;
    })
    .join('');

  root.innerHTML = `
    <div class="page-head">
      <div><h1>กำลังฝึก</h1><p>${esc(session.planName)} · ${esc(fmtLong(session.date))}</p></div>
      <div class="btn-row start">
        <button class="btn btn-ghost btn-sm" data-act="cancel" style="color:var(--danger)">ยกเลิก</button>
        <button class="btn btn-primary" data-act="finish">${icon('check')}จบการฝึก</button>
      </div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))">${cards}</div>
    <button class="btn btn-outline" data-act="add-ex">${icon('plus')}เพิ่มท่าอื่น</button>
    <div class="rest-bar" id="rest-bar" hidden><span id="rest-text"></span><button class="btn btn-sm" data-act="skip-rest">ข้าม</button></div>`;
  startTicker(root);

  root.onsubmit = async (e) => {
    const form = e.target.closest('form[data-ex]');
    if (!form) return;
    e.preventDefault();
    try {
      await logSet(app, session, form);
    } catch (err) {
      handleError(err);
    }
  };
  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    try {
      if (act === 'finish') {
        if (!session.sets.length) return toast('ยังไม่มีเซตที่บันทึก — บันทึกอย่างน้อย 1 เซต หรือกดยกเลิก', 'error');
        openFinishModal(app, session);
      } else if (act === 'cancel') {
        if (await confirmDialog({ title: 'ยกเลิกการฝึกนี้?', message: `เซตที่บันทึกไว้ ${session.sets.length} เซตจะถูกลบ`, confirmText: 'ยกเลิกการฝึก', danger: true })) {
          await repo.remove('workoutSessions', session.id);
          rest = null;
          app.refresh();
        }
      } else if (act === 'del-set') {
        await repo.save('workoutSessions', { ...session, sets: session.sets.filter((s) => s.id !== id) });
        app.refresh();
      } else if (act === 'add-ex') openAddExerciseModal(app, session);
      else if (act === 'skip-rest') {
        rest = null;
        root.querySelector('#rest-bar').hidden = true;
      }
    } catch (err) {
      handleError(err);
    }
  };
}

function renderHome(root, app) {
  const t = today();
  const ex = exMap();
  const { goals } = repo.settings();
  const monday = weekStart(t);
  const sunday = addDays(monday, 6);
  const done = finished();
  const lifted = workoutDays(done, monday, sunday);
  const volume = muscleSets(done, ex, monday, sunday);
  const plans = [...repo.list('workoutPlans')].sort((a, b) => (a.order || 0) - (b.order || 0));
  const history = [...done].sort((a, b) => (a.date + (a.finishedAt || '') < b.date + (b.finishedAt || '') ? 1 : -1));
  const lastWorkout = history.find((s) => s.type !== 'rest' && s.planId);
  const lastIdx = lastWorkout ? plans.findIndex((p) => p.id === lastWorkout.planId) : -1;
  const next = plans.length ? plans[(lastIdx + 1) % plans.length] : null;

  const tracked = repo.list('exercises').filter((e) => exerciseHistory(done, e.id).length);
  if (!tracked.some((e) => e.id === progressEx)) progressEx = tracked[0]?.id || null;
  const hist = progressEx ? exerciseHistory(done, progressEx) : [];
  const pex = ex.get(progressEx);
  const loaded = hist.some((h) => h.topKg > 0);

  root.innerHTML = `
    <div class="page-head">
      <div><h1>ตารางเวท</h1><p>ดัมเบลที่บ้าน · ${goals.workoutsPerWeek} วัน/สัปดาห์</p></div>
      <div class="btn-row start">
        <button class="btn btn-outline btn-sm" data-act="rest">บันทึกวันพัก</button>
        <button class="btn btn-outline btn-sm" data-act="new-plan">${icon('plus')}สร้างตาราง</button>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><h2>สัปดาห์นี้</h2><span class="badge ${lifted >= goals.workoutsPerWeek ? 'badge-ok' : ''}">${lifted}/${goals.workoutsPerWeek} ครั้ง</span></div>
      ${
        Object.keys(volume).length
          ? `<p class="small muted" style="margin-bottom:6px">จำนวนเซตต่อกล้ามเนื้อ (กล้ามเนื้อรองนับครึ่งเซต)</p>
             <div class="muscles">${Object.keys(MUSCLES).map((m) => `<span class="badge ${volume[m] ? 'badge-ok' : ''}">${MUSCLES[m]} ${volume[m] ? n1(volume[m]) : '0'}</span>`).join('')}</div>`
          : '<p class="muted small">ยังไม่มีการฝึกในสัปดาห์นี้</p>'
      }
    </section>

    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))">
      ${
        plans.length
          ? plans
              .map(
                (p) => `<section class="card">
                  <div class="card-head">
                    <div><h2>${esc(p.name)}</h2><div class="small muted">แนะนำ: วัน${WEEKDAY_NAMES[p.weekday]}${p.weekday === weekday(t) ? ' (วันนี้)' : ''}</div></div>
                    ${next && next.id === p.id ? '<span class="badge badge-info">ครั้งถัดไป</span>' : ''}
                  </div>
                  <div class="list">${p.exercises
                    .map((r) => {
                      const e = ex.get(r.exerciseId);
                      return e ? `<div class="row" style="padding:7px 0"><div class="row-main"><div class="row-title" style="font-weight:550">${esc(e.name)}</div><div class="row-sub">${(e.muscles || []).map((m) => MUSCLES[m]).join(', ')}</div></div><div class="row-value small">${r.sets} × ${r.repMin}–${r.repMax}</div></div>` : '';
                    })
                    .join('')}</div>
                  <div class="btn-row">
                    <button class="btn btn-ghost btn-sm" data-act="edit-plan" data-id="${p.id}">${icon('edit')}แก้ไข</button>
                    <button class="btn btn-primary" data-act="start" data-id="${p.id}">${icon('dumbbell')}เริ่มฝึก</button>
                  </div>
                </section>`
              )
              .join('')
          : `<section class="card">${emptyState('ยังไม่มีตารางฝึก', '<button class="btn btn-primary btn-sm" data-act="new-plan">สร้างตาราง</button>')}</section>`
      }
    </div>

    <div class="cols">
      <section class="card">
        <div class="card-head"><h2>พัฒนาการรายท่า</h2></div>
        ${
          tracked.length
            ? `<select id="progress-ex" aria-label="เลือกท่า">${tracked.map((e) => `<option value="${e.id}" ${e.id === progressEx ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
               <div id="progress-chart" style="margin-top:10px"></div>
               <p class="hint">${loaded ? 'แกนตั้ง = 1RM โดยประมาณ (สูตร Epley จากเซตที่ดีที่สุด) ใช้ดูแนวโน้ม ไม่ใช่ค่าที่ยกได้จริง' : `แกนตั้ง = จำนวน${unitLabel(pex?.unit)}สูงสุดต่อเซต`}</p>
               <table class="tbl" style="margin-top:8px"><thead><tr><th>วันที่</th><th>เซตที่ทำ</th><th>ปริมาณรวม</th></tr></thead><tbody>
               ${[...hist].reverse().slice(0, 8).map((h) => `<tr><td>${fmtShort(h.date)}</td><td>${h.sets.map((s) => setText(s, pex?.unit)).join(', ')}</td><td>${h.volume ? `${n0(h.volume)} กก.` : `${h.totalReps} ${unitLabel(pex?.unit)}`}</td></tr>`).join('')}
               </tbody></table>`
            : emptyState('กราฟพัฒนาการจะแสดงหลังบันทึกการฝึกครั้งแรก')
        }
      </section>
      <section class="card">
        <div class="card-head"><h2>ประวัติการฝึก</h2><span class="muted">${history.length} รายการ</span></div>
        ${
          history.length
            ? `<div class="list">${history
                .slice(0, 20)
                .map((s) => {
                  const sub =
                    s.type === 'rest'
                      ? `วันพัก${s.sleepHours != null ? ` · นอน ${n1(s.sleepHours)} ชม.` : ''}${s.note ? ` · ${esc(s.note)}` : ''}`
                      : `${esc(s.planName || 'เวท')} · ${s.sets.length} เซต${s.durationMin ? ` · ${s.durationMin} นาที` : ''}${s.energy === 1 ? ' · ล้า' : ''}`;
                  return `<div class="row"><button class="row-btn" data-act="open" data-id="${s.id}"><div class="row-main"><div class="row-title">${esc(fmtLong(s.date))}</div><div class="row-sub">${sub}</div></div>${icon('right')}</button></div>`;
                })
                .join('')}</div>`
            : emptyState('ยังไม่มีประวัติการฝึก — กด "เริ่มฝึก" ที่ตารางด้านบน')
        }
      </section>
    </div>`;

  if (hist.length) {
    lineChart(root.querySelector('#progress-chart'), {
      labels: hist.map((h) => fmtShort(h.date)),
      unit: loaded ? 'กก.' : unitLabel(pex?.unit),
      height: 170,
      series: [{ name: loaded ? '1RM โดยประมาณ' : 'สูงสุดต่อเซต', type: 'line', color: 'var(--chart-avg)', values: hist.map((h) => h.score) }],
    });
  }
  const sel = root.querySelector('#progress-ex');
  if (sel) {
    sel.onchange = () => {
      progressEx = sel.value;
      app.refresh();
    };
  }

  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    try {
      if (act === 'start') await startPlan(app, repo.get('workoutPlans', id));
      else if (act === 'edit-plan') openPlanEditor(app, repo.get('workoutPlans', id));
      else if (act === 'new-plan') openPlanEditor(app);
      else if (act === 'rest') openRestForm(app);
      else if (act === 'open') openSessionDetail(app, repo.get('workoutSessions', id));
    } catch (err) {
      handleError(err);
    }
  };
}

export function render(root, app) {
  leave();
  const session = activeSession();
  if (session) renderActive(root, app, session);
  else renderHome(root, app);
}
