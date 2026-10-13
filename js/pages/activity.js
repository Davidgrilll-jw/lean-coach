// Activity Tracker: daily steps, football and other cardio. All entries are
// typed in by the user; nothing is read from a device.
import { addDays, fmtLong, fmtShort, range, today, weekStart } from '../domain/dates.js';
import * as v from '../domain/validate.js';
import { weekWorkouts } from '../services/insights.js';
import * as repo from '../store/repo.js';
import { barChart } from '../ui/charts.js';
import { bar, confirmDialog, emptyState, esc, formValues, handleError, icon, n0, openModal, toast } from '../ui/dom.js';

const FATIGUE = { 1: 'สบายมาก', 2: 'เบา', 3: 'ปานกลาง', 4: 'เหนื่อย', 5: 'เหนื่อยมาก' };
const TYPE_LABEL = { football: 'ฟุตบอล', cardio: 'คาร์ดิโอ' };

const logs = () => repo.list('activityLogs');

function openStepsForm(app, date = today()) {
  const existing = logs().find((a) => a.type === 'steps' && a.date === date);
  openModal({
    title: 'บันทึกจำนวนก้าว',
    html: `
      <form novalidate>
        <div class="field-row">
          <label class="field"><span>จำนวนก้าว</span><input name="steps" inputmode="numeric" autocomplete="off" value="${existing ? existing.steps : ''}" placeholder="เช่น 6200"></label>
          <label class="field"><span>วันที่</span><input type="date" name="date" max="${today()}" value="${date}"></label>
        </div>
        <p class="hint">ดูตัวเลขจากแอปสุขภาพในมือถือหรือนาฬิกา แล้วกรอกยอดรวมของวันนั้น บันทึกซ้ำวันเดิมจะแทนที่ค่าเก่า</p>
        <div class="btn-row"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn btn-primary">บันทึก</button></div>
      </form>`,
    onMount: (body, close) => {
      const form = body.querySelector('form');
      form.steps.focus();
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const f = formValues(form);
          const d = v.date(f.date);
          const same = logs().find((a) => a.type === 'steps' && a.date === d);
          await repo.save('activityLogs', { ...(same || {}), type: 'steps', date: d, steps: v.num(f.steps, v.LIMITS.steps) });
          close();
          toast('บันทึกจำนวนก้าวแล้ว');
          app.refresh();
        } catch (err) {
          handleError(err);
        }
      };
    },
  });
}

function openActivityForm(app, type, existing = null) {
  const kind = existing?.type || type;
  openModal({
    title: existing ? 'แก้ไขกิจกรรม' : kind === 'football' ? 'บันทึกการเตะฟุตบอล' : 'บันทึกคาร์ดิโอ',
    html: `
      <form novalidate>
        ${kind === 'cardio' ? `<label class="field"><span>ชนิดกิจกรรม</span><input name="name" maxlength="40" value="${esc(existing?.name || '')}" placeholder="เช่น วิ่ง, ปั่นจักรยาน, เดินเร็ว"></label>` : ''}
        <div class="field-row">
          <label class="field"><span>ระยะเวลา (นาที)</span><input name="minutes" inputmode="numeric" autocomplete="off" value="${existing?.minutes ?? ''}" placeholder="${kind === 'football' ? 'เช่น 60' : 'เช่น 30'}"></label>
          <label class="field"><span>วันที่</span><input type="date" name="date" max="${today()}" value="${existing?.date || today()}"></label>
        </div>
        <label class="field"><span>ความเหนื่อย</span><select name="fatigue">${Object.entries(FATIGUE).map(([k, l]) => `<option value="${k}" ${String(existing?.fatigue || 3) === k ? 'selected' : ''}>${k} — ${l}</option>`).join('')}</select></label>
        <label class="field"><span>หมายเหตุ (ไม่บังคับ)</span><input name="note" maxlength="200" value="${esc(existing?.note || '')}" placeholder="เช่น ขาล้า, เล่นเต็มสนาม"></label>
        <div class="btn-row"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn btn-primary">บันทึก</button></div>
      </form>`,
    onMount: (body, close) => {
      const form = body.querySelector('form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const f = formValues(form);
          await repo.save('activityLogs', {
            ...(existing || {}),
            type: kind,
            name: kind === 'cardio' ? v.text(f.name, { label: 'ชนิดกิจกรรม', max: 40, optional: false }) : 'ฟุตบอล',
            minutes: v.num(f.minutes, v.LIMITS.minutes),
            date: v.date(f.date),
            fatigue: Number(f.fatigue),
            note: v.text(f.note, { label: 'หมายเหตุ' }),
          });
          close();
          toast('บันทึกกิจกรรมแล้ว');
          app.refresh();
        } catch (err) {
          handleError(err);
        }
      };
    },
  });
}

export function render(root, app) {
  const t = today();
  const { goals } = repo.settings();
  const monday = weekStart(t);
  const sunday = addDays(monday, 6);
  const all = logs();
  const stepsBy = new Map(all.filter((a) => a.type === 'steps').map((a) => [a.date, a]));
  const week = all.filter((a) => a.date >= monday && a.date <= sunday);
  const weekSteps = week.filter((a) => a.type === 'steps' && a.steps > 0);
  const stepAvg = weekSteps.length ? weekSteps.reduce((a, s) => a + s.steps, 0) / weekSteps.length : null;
  const football = week.filter((a) => a.type === 'football').reduce((a, x) => a + x.minutes, 0);
  const cardio = week.filter((a) => a.type === 'cardio').reduce((a, x) => a + x.minutes, 0);
  const lifted = weekWorkouts(t);
  const todaySteps = stepsBy.get(t)?.steps ?? null;
  const days = range(addDays(t, -13), t);
  const sessions = all.filter((a) => a.type !== 'steps').sort((a, b) => (a.date < b.date ? 1 : -1));
  const stepRows = [...stepsBy.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);
  const nextStepGoal = goals.steps < 7000 ? 7000 : goals.steps < 8000 ? 8000 : null;

  root.innerHTML = `
    <div class="page-head">
      <div><h1>กิจกรรม</h1><p>ก้าวเดิน ฟุตบอล และคาร์ดิโอ</p></div>
      <div class="btn-row start">
        <button class="btn btn-primary" data-act="steps">${icon('plus')}ก้าว</button>
        <button class="btn btn-outline" data-act="football">${icon('plus')}ฟุตบอล</button>
        <button class="btn btn-outline" data-act="cardio">${icon('plus')}คาร์ดิโอ</button>
      </div>
    </div>
    <div class="notice notice-info">ข้อมูลหน้านี้มาจากการกรอกด้วยตนเองทั้งหมด — แอปยังไม่ได้เชื่อมต่อ Apple Health, Google Fit หรือนาฬิกา</div>

    <div class="grid grid-3">
      <div class="card">
        <div class="stat-label">ก้าววันนี้</div>
        <div class="stat-value">${todaySteps == null ? '–' : n0(todaySteps)}</div>
        <div class="stat-sub">เป้าหมาย ${n0(goals.steps)} ก้าว</div>
        <div style="margin-top:6px">${bar(todaySteps || 0, goals.steps)}</div>
      </div>
      <div class="card">
        <div class="stat-label">ก้าวเฉลี่ยสัปดาห์นี้</div>
        <div class="stat-value">${stepAvg == null ? '–' : n0(stepAvg)}</div>
        <div class="stat-sub">${weekSteps.length ? `จาก ${weekSteps.length} วันที่บันทึก` : 'ยังไม่มีข้อมูล'}</div>
      </div>
      <div class="card">
        <div class="stat-label">ฟุตบอลสัปดาห์นี้</div>
        <div class="stat-value">${n0(football)}<small>นาที</small></div>
        <div class="stat-sub">เป้าหมาย ${goals.footballMin}–${goals.footballMax} นาที</div>
        <div style="margin-top:6px">${bar(football, goals.footballMin)}</div>
      </div>
      <div class="card">
        <div class="stat-label">เวทสัปดาห์นี้</div>
        <div class="stat-value">${lifted}<small>/ ${goals.workoutsPerWeek} ครั้ง</small></div>
        <div class="stat-sub"><a href="#/workout">ไปที่ตารางเวท</a></div>
      </div>
      <div class="card">
        <div class="stat-label">คาร์ดิโออื่นสัปดาห์นี้</div>
        <div class="stat-value">${n0(cardio)}<small>นาที</small></div>
        <div class="stat-sub">ไม่มีเป้าหมายบังคับ</div>
      </div>
      <div class="card">
        <div class="stat-label">เป้าหมายก้าวขั้นถัดไป</div>
        <div class="stat-value">${nextStepGoal ? n0(nextStepGoal) : n0(goals.steps)}</div>
        <div class="stat-sub">${nextStepGoal ? `ทำ ${n0(goals.steps)} ได้สม่ำเสมอ 2 สัปดาห์แล้วค่อยเพิ่ม (ปรับที่หน้าตั้งค่า)` : 'อยู่ในช่วงเป้าหมายระยะยาวแล้ว'}</div>
      </div>
    </div>

    <div class="cols">
      <section class="card">
        <div class="card-head"><h2>ก้าวเดิน 14 วัน</h2></div>
        <div id="steps-chart"></div>
        ${
          stepRows.length
            ? `<div class="list" style="margin-top:8px">${stepRows
                .map(
                  (s) => `<div class="row"><div class="row-main"><div class="row-title">${esc(fmtLong(s.date))}</div></div><div class="row-value">${n0(s.steps)}</div>
                    <button class="icon-btn" data-act="edit-steps" data-date="${s.date}" aria-label="แก้ไข">${icon('edit')}</button>
                    <button class="icon-btn" data-act="del" data-id="${s.id}" aria-label="ลบ">${icon('trash')}</button></div>`
                )
                .join('')}</div>`
            : ''
        }
      </section>
      <section class="card">
        <div class="card-head"><h2>ฟุตบอลและคาร์ดิโอ</h2><span class="muted">${sessions.length} รายการ</span></div>
        ${
          sessions.length
            ? `<div class="list">${sessions
                .slice(0, 20)
                .map(
                  (a) => `<div class="row">
                    <div class="row-main"><div class="row-title">${esc(a.type === 'cardio' ? a.name : TYPE_LABEL.football)} · ${n0(a.minutes)} นาที</div>
                    <div class="row-sub">${esc(fmtLong(a.date))} · ความเหนื่อย ${a.fatigue}/5 (${FATIGUE[a.fatigue] || ''})${a.note ? ` · ${esc(a.note)}` : ''}</div></div>
                    <button class="icon-btn" data-act="edit" data-id="${a.id}" aria-label="แก้ไข">${icon('edit')}</button>
                    <button class="icon-btn" data-act="del" data-id="${a.id}" aria-label="ลบ">${icon('trash')}</button>
                  </div>`
                )
                .join('')}</div>`
            : emptyState('ยังไม่มีการบันทึกฟุตบอลหรือคาร์ดิโอ')
        }
      </section>
    </div>`;

  const chart = root.querySelector('#steps-chart');
  if (!barChart(chart, { labels: days.map(fmtShort), values: days.map((d) => stepsBy.get(d)?.steps ?? null), goal: goals.steps, unit: 'ก้าว', name: 'ก้าวเดิน 14 วัน' })) {
    chart.innerHTML = emptyState('ยังไม่มีข้อมูลก้าวเดินใน 14 วันนี้', '<button class="btn btn-primary btn-sm" data-act="steps">บันทึกก้าววันนี้</button>');
  }

  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    try {
      if (act === 'steps') openStepsForm(app);
      else if (act === 'edit-steps') openStepsForm(app, btn.dataset.date);
      else if (act === 'football' || act === 'cardio') openActivityForm(app, act);
      else if (act === 'edit') openActivityForm(app, null, repo.get('activityLogs', id));
      else if (act === 'del') {
        const rec = repo.get('activityLogs', id);
        const label = rec.type === 'steps' ? `${n0(rec.steps)} ก้าว` : `${rec.name} ${n0(rec.minutes)} นาที`;
        if (await confirmDialog({ title: 'ลบรายการนี้?', message: `${fmtLong(rec.date)} — ${label}`, confirmText: 'ลบ', danger: true })) {
          await repo.remove('activityLogs', id);
          toast('ลบแล้ว');
          app.refresh();
        }
      }
    } catch (err) {
      handleError(err);
    }
  };
}
