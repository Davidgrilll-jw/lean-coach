// Weekly Coach report. The rule-based report is always available; the AI
// commentary is an optional extra that needs the bundled server with an API key.
import { addDays, fmtShort, today, weekStart } from '../domain/dates.js';
import { overview, reportFor } from '../services/insights.js';
import * as repo from '../store/repo.js';
import { plateauCard } from '../ui/components.js';
import { esc, handleError, icon, n0, n1, signed1, toast } from '../ui/dom.js';

let monday = null;
let ai = null; // null = not checked yet, true/false = server answer
let aiBusy = false;

async function checkAi(app) {
  try {
    const res = await fetch('./api/health', { cache: 'no-store' });
    ai = res.ok && (await res.json()).ai === true;
  } catch {
    ai = false;
  }
  if (location.hash.includes('report')) app.refresh();
}

async function askAi(app, report, o) {
  aiBusy = true;
  app.refresh();
  try {
    const res = await fetch('./api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: { sex: o.profile.sex, age: o.profile.age, heightCm: o.profile.heightCm, weightKg: o.weightKg },
        goals: o.goals,
        estimates: { bmr: Math.round(o.bmr), tdee: Math.round(o.tdee) },
        report,
        plateau: { status: o.plateau.status, title: o.plateau.title, summary: o.plateau.summary },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.text) throw new Error(data.error || 'AI ไม่ตอบกลับ');
    const saved = repo.get('weeklyReports', report.monday) || { id: report.monday };
    await repo.save('weeklyReports', { ...saved, aiText: data.text, aiModel: data.model, aiAt: new Date().toISOString() });
    toast('ได้คำแนะนำจาก AI แล้ว');
  } catch (err) {
    toast(`ใช้ AI ไม่ได้ในขณะนี้ (${err.message}) — รายงานตามกฎด้านบนยังใช้ได้ตามปกติ`, 'error');
  } finally {
    aiBusy = false;
    app.refresh();
  }
}

export function render(root, app) {
  const t = today();
  const thisMonday = weekStart(t);
  if (!monday || monday > thisMonday) monday = thisMonday;
  const o = overview(t);
  const r = reportFor(monday, t);
  const stored = repo.get('weeklyReports', monday);
  if (ai === null) checkAi(app);

  // Keep a snapshot of every finished week (WeeklyReports).
  if (r.complete && !stored?.snapshot) {
    repo.save('weeklyReports', { ...(stored || { id: monday }), snapshot: r, savedAt: new Date().toISOString() }).catch(handleError);
  }

  const row = (label, value, sub = '') => `<div class="row"><div class="row-main"><div class="row-title" style="font-weight:550">${label}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div><div class="row-value">${value}</div></div>`;
  const list = (items, empty) => (items.length ? `<ul class="plain">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : `<p class="muted small">${empty}</p>`);
  const n = r.nutrition;

  root.innerHTML = `
    <div class="page-head">
      <div><h1>รายงานประจำสัปดาห์</h1><p>${r.complete ? 'สัปดาห์ที่จบแล้ว' : `สัปดาห์นี้ (ผ่านไป ${r.daysElapsed} วัน — ตัวเลขยังเปลี่ยนได้)`}</p></div>
    </div>
    <div class="date-nav">
      <button class="icon-btn" data-act="prev" aria-label="สัปดาห์ก่อนหน้า">${icon('left')}</button>
      <div style="flex:1;text-align:center;font-weight:650">${fmtShort(r.monday)} – ${fmtShort(r.sunday)}</div>
      <button class="icon-btn" data-act="next" aria-label="สัปดาห์ถัดไป" ${monday >= thisMonday ? 'disabled' : ''}>${icon('right')}</button>
    </div>

    ${r.enough ? '' : '<div class="notice notice-info"><b>ข้อมูลสัปดาห์นี้ยังไม่พอสรุปผล</b><br>ต้องมีการชั่งน้ำหนักอย่างน้อย 3 วัน และบันทึกอาหารครบอย่างน้อย 3 วัน ตัวเลขที่ไม่มีข้อมูลจะแสดงเป็น "–" ไม่ถูกนับเป็นศูนย์</div>'}

    <div class="cols">
      <section class="card">
        <div class="card-head"><h2>สรุปตัวเลข</h2></div>
        <div class="list">
          ${row('น้ำหนักเฉลี่ย', r.weight.avg == null ? '–' : `${n1(r.weight.avg)} กก.`, `ชั่ง ${r.weight.n} วัน · ${r.weight.delta == null ? 'ยังเทียบสัปดาห์ก่อนไม่ได้' : `เทียบสัปดาห์ก่อน ${signed1(r.weight.delta)} กก.`}`)}
          ${row('รอบเอว', r.waist.latest == null ? '–' : `${n1(r.waist.latest)} ซม.`, r.waist.delta == null ? (r.waist.latest == null ? 'ไม่ได้วัดในสัปดาห์นี้' : 'ไม่มีค่าก่อนหน้าใน 3 สัปดาห์ให้เทียบ') : `เปลี่ยนแปลง ${signed1(r.waist.delta)} ซม.`)}
          ${row('พลังงานเฉลี่ย', n.kcal == null ? '–' : `${n0(n.kcal)} kcal`, `เป้าหมาย ${n0(n.kcalGoal)} · บันทึกครบ ${n.completeDays} วัน${n.loggedDays > n.completeDays ? ` (ไม่นับ ${n.loggedDays - n.completeDays} วันที่บันทึกไม่ครบ)` : ''}`)}
          ${row('โปรตีนเฉลี่ย', n.p == null ? '–' : `${n0(n.p)} ก.`, `เป้าหมาย ${n0(n.proteinGoal)} ก.`)}
          ${row('เวท', `${r.workouts.done}/${r.workouts.goal} ครั้ง`, r.workouts.done >= r.workouts.goal ? 'ครบตามเป้าหมาย' : 'ยังไม่ครบ')}
          ${row('ก้าวเฉลี่ย', r.steps.avg == null ? '–' : n0(r.steps.avg), `เป้าหมาย ${n0(r.steps.goal)} · บันทึก ${r.steps.days} วัน`)}
          ${row('ฟุตบอล', `${n0(r.football.minutes)} นาที`, `เป้าหมาย ${r.football.goalMin}–${r.football.goalMax} นาที${r.cardioMinutes ? ` · คาร์ดิโออื่น ${n0(r.cardioMinutes)} นาที` : ''}`)}
          ${row('ความสม่ำเสมอในการบันทึก', `${Math.round(r.consistency.pct * 100)}%`, `น้ำหนัก ${r.consistency.weightDays} · อาหาร ${r.consistency.foodDays} · ก้าว ${r.consistency.stepDays} จาก ${r.consistency.days} วัน`)}
        </div>
      </section>
      <div class="grid">
        <section class="card"><div class="card-head"><h2>จุดที่ทำได้ดี</h2></div>${list(r.wins, 'ยังไม่มีข้อมูลพอจะระบุ')}</section>
        <section class="card"><div class="card-head"><h2>สิ่งที่ควรปรับสัปดาห์ถัดไป</h2></div>${list(r.improvements, 'ไม่มีข้อที่ต้องปรับจากข้อมูลที่มี — รักษาแผนเดิม')}</section>
        ${r.notes.length ? `<section class="card"><div class="card-head"><h2>ข้อสังเกต</h2></div>${list(r.notes, '')}</section>` : ''}
      </div>
    </div>

    <div class="cols">
      <section class="card">${plateauCard(o.plateau, { full: false })}<p class="hint" style="margin-top:8px">ผลนี้คิดจาก 3 สัปดาห์ล่าสุดนับถึงวันนี้ ไม่ใช่เฉพาะสัปดาห์ที่เลือก · ${o.empirical ? `TDEE จากข้อมูลจริงของคุณ ≈ ${n0(o.empirical.kcal)} kcal/วัน (จากอาหาร ${o.empirical.completeDays} วันและแนวโน้มน้ำหนัก)` : 'ยังคำนวณ TDEE จากข้อมูลจริงไม่ได้ (ต้องบันทึกอาหารครบ ≥14 วัน และชั่งน้ำหนัก ≥10 วัน ใน 3 สัปดาห์)'}</p></section>
      <section class="card">
        <div class="card-head"><h2>AI Coach</h2>${ai ? '<span class="badge badge-ok">พร้อมใช้งาน</span>' : '<span class="badge">ยังไม่ได้ตั้งค่า</span>'}</div>
        ${stored?.aiText ? `<div class="notice" style="white-space:pre-wrap">${esc(stored.aiText)}</div><p class="hint" style="margin-top:6px">สร้างโดย AI (${esc(stored.aiModel || '')}) จากตัวเลขสรุปในหน้านี้ ไม่ใช่คำแนะนำทางการแพทย์</p>` : ''}
        ${
          ai
            ? `<div class="btn-row start" style="margin-top:8px"><button class="btn btn-primary btn-sm" data-act="ai" ${aiBusy ? 'disabled' : ''}>${aiBusy ? '<span class="spinner"></span> กำลังขอคำแนะนำ…' : stored?.aiText ? 'ขอคำแนะนำใหม่' : 'ขอคำแนะนำจาก AI'}</button></div>
               <p class="hint" style="margin-top:6px">จะส่งเฉพาะตัวเลขสรุปของสัปดาห์นี้ไปยังเซิร์ฟเวอร์ ไม่ส่งรูปภาพหรือรายการอาหารรายชิ้น</p>`
            : `<p class="muted small">${ai === null ? 'กำลังตรวจสอบ…' : 'รายงานด้านบนสร้างจากกฎคำนวณบนข้อมูลของคุณและใช้งานได้ครบโดยไม่ต้องมี AI หากต้องการคำอธิบายเพิ่มจาก AI ให้รันแอปผ่าน server.py พร้อมตั้งค่า ANTHROPIC_API_KEY (ดู README)'}</p>`
        }
      </section>
    </div>`;

  root.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'prev') {
      monday = addDays(monday, -7);
      app.refresh();
    } else if (act === 'next' && monday < thisMonday) {
      monday = addDays(monday, 7);
      app.refresh();
    } else if (act === 'ai' && !aiBusy) askAi(app, r, o);
  };
}
