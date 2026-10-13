// Dashboard: today's status at a glance and the three quick actions.
import { addDays, fmtLong, fmtShort, weekday } from '../domain/dates.js';
import { dailyAdvice } from '../domain/report.js';
import { progressToTarget } from '../domain/weight.js';
import { dayTotals, latestWaist, overview, stepsOn, weekWorkouts } from '../services/insights.js';
import * as repo from '../store/repo.js';
import { plateauCard, weightChart } from '../ui/components.js';
import { bar, esc, icon, n0, n1, signed1 } from '../ui/dom.js';
import { openWeightForm } from './body.js';
import { requestAdd } from './food.js';

function workoutStatus(o) {
  const todays = o.data.sessions.filter((s) => s.date === o.today);
  const active = todays.find((s) => s.status === 'active');
  if (active) return { text: 'กำลังฝึกอยู่', sub: active.planName, tone: 'info' };
  const done = todays.find((s) => s.type !== 'rest' && (s.sets || []).length);
  if (done) return { text: 'ฝึกแล้ว', sub: `${done.planName || 'เวท'} · ${done.sets.length} เซต`, tone: 'ok' };
  if (todays.some((s) => s.type === 'rest')) return { text: 'วันพัก', sub: 'บันทึกการฟื้นตัวแล้ว', tone: 'ok' };
  const planned = repo.list('workoutPlans').find((p) => p.weekday === weekday(o.today));
  if (planned) return { text: 'ยังไม่ได้ฝึก', sub: `ตามตาราง: ${planned.name}`, tone: 'warn' };
  return { text: 'ไม่มีในตาราง', sub: 'วันพักตามแผน', tone: 'info' };
}

export function render(root, app) {
  const o = overview();
  const { goals, summary: s, profile } = o;
  const totals = dayTotals(o.today);
  const steps = stepsOn(o.today);
  const waist = latestWaist();
  const lifted = weekWorkouts(o.today);
  const ws = workoutStatus(o);
  const remaining = goals.kcal - totals.kcal;
  const advice = dailyAdvice({
    today: o.today,
    hasWeightToday: s.daily.has(o.today),
    totals,
    goals,
    stepsToday: steps,
    workedOutToday: ws.tone === 'ok',
    weekWorkouts: lifted,
    plateau: o.plateau,
    weighIns7: s.avg7.n,
  });

  const latestText = s.latest
    ? `${n1(s.latest.kg)}<small>กก.</small>`
    : `${n1(profile.currentWeightKg)}<small>กก.</small>`;
  const latestSub = s.latest ? `ชั่งล่าสุด ${fmtShort(s.latest.date)}` : 'ค่าจากโปรไฟล์ — ยังไม่มีการชั่งในแอป';
  const lost = s.totalLost ?? profile.startWeightKg - profile.currentWeightKg;
  const toGo = (s.current ?? profile.currentWeightKg) - goals.targetWeightKg;
  const progress = s.progress ?? progressToTarget(profile.startWeightKg, profile.currentWeightKg, goals.targetWeightKg) ?? 0;

  const macro = (label, value, goal) => `
    <div class="macro">
      <div class="macro-row"><span class="muted">${label}</span><span class="num"><b>${n0(value)}</b>/${n0(goal)} ก.</span></div>
      ${bar(value, goal)}
    </div>`;

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Lean Coach</h1><p>${esc(fmtLong(o.today))}</p></div>
    </div>

    ${o.settings.profileConfirmed === false ? '<a class="notice notice-warn" href="#/settings" style="display:block;text-decoration:none"><b>ตั้งค่าโปรไฟล์ของคุณก่อน</b><br>ตัวเลขในหน้านี้ยังเป็นค่าตัวอย่าง แตะที่นี่เพื่อกรอกเพศ อายุ ส่วนสูง น้ำหนัก และเป้าหมายของคุณ</a>' : ''}

    <div class="quick">
      <button class="btn btn-primary" data-act="weight">${icon('scale')}บันทึกน้ำหนัก</button>
      <button class="btn btn-primary" data-act="food">${icon('food')}บันทึกอาหาร</button>
      <button class="btn btn-primary" data-act="workout">${icon('dumbbell')}เริ่มการฝึก</button>
    </div>

    <div class="cols">
      <section class="card hero">
        <div class="stat-label">น้ำหนักล่าสุด</div>
        <div class="stat-big">${latestText}</div>
        <div class="stat-sub">${esc(latestSub)}</div>
        <div class="hero-row">
          <div><div class="stat-label">เฉลี่ย 7 วัน</div><div class="stat-value">${s.avg7.n ? n1(s.avg7.avg) : '–'}</div><div class="stat-sub">${s.avg7.n ? `จาก ${s.avg7.n} วัน` : 'ยังไม่มีข้อมูล'}</div></div>
          <div><div class="stat-label">เป้าหมาย</div><div class="stat-value">${n1(goals.targetWeightKg)}</div><div class="stat-sub">${toGo > 0 ? `อีก ${n1(toGo)} กก.` : 'ถึงเป้าหมายแล้ว'}</div></div>
          <div><div class="stat-label">ลดไปแล้ว</div><div class="stat-value">${n1(lost)}</div><div class="stat-sub">จาก ${n1(profile.startWeightKg)} กก.</div></div>
        </div>
        <div style="margin-top:14px">
          <div class="macro-row"><span class="stat-label">ความคืบหน้าสู่เป้าหมาย</span><span class="num">${Math.round(progress * 100)}%</span></div>
          ${bar(progress, 1)}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>พลังงานวันนี้</h2><a href="#/food" class="small">รายละเอียด</a></div>
        <div class="grid grid-2">
          <div><div class="stat-label">กินไปแล้ว</div><div class="stat-value">${n0(totals.kcal)}<small>kcal</small></div><div class="stat-sub">เป้าหมาย ${n0(goals.kcal)}</div></div>
          <div><div class="stat-label">${remaining >= 0 ? 'เหลือ' : 'เกินเป้าหมาย'}</div><div class="stat-value">${n0(Math.abs(remaining))}<small>kcal</small></div><div class="stat-sub">${totals.items ? `${totals.items} รายการ` : 'ยังไม่ได้บันทึก'}</div></div>
        </div>
        <div style="margin-top:10px">${bar(totals.kcal, goals.kcal, { over: true })}</div>
        <div class="macros">
          ${macro('โปรตีน', totals.p, goals.proteinG)}
          ${macro('คาร์บ', totals.c, goals.carbG)}
          ${macro('ไขมัน', totals.f, goals.fatG)}
        </div>
      </section>
    </div>

    <div class="grid grid-3">
      <a class="card" href="#/body" style="text-decoration:none;color:inherit">
        <div class="stat-label">รอบเอวล่าสุด</div>
        <div class="stat-value">${waist ? `${n1(waist.cm)}<small>ซม.</small>` : '–'}</div>
        <div class="stat-sub">${waist ? fmtShort(waist.date) : 'ยังไม่ได้วัด'}</div>
      </a>
      <a class="card" href="#/activity" style="text-decoration:none;color:inherit">
        <div class="stat-label">ก้าววันนี้</div>
        <div class="stat-value">${steps == null ? '–' : n0(steps)}</div>
        <div class="stat-sub">เป้าหมาย ${n0(goals.steps)}</div>
        <div style="margin-top:6px">${bar(steps || 0, goals.steps)}</div>
      </a>
      <a class="card" href="#/workout" style="text-decoration:none;color:inherit">
        <div class="stat-label">เวทวันนี้</div>
        <div class="stat-value" style="font-size:1.15rem">${esc(ws.text)}</div>
        <div class="stat-sub">${esc(ws.sub || '')}</div>
        <div class="stat-sub" style="margin-top:4px">สัปดาห์นี้ ${lifted}/${goals.workoutsPerWeek} ครั้ง</div>
      </a>
    </div>

    <div class="cols">
      <section class="card">
        <div class="card-head"><h2>แนวโน้มน้ำหนัก 30 วัน</h2><span class="muted">${s.weekChange == null ? '' : `เทียบสัปดาห์ก่อน ${signed1(s.weekChange)} กก.`}</span></div>
        <div id="chart"></div>
      </section>
      <div class="grid">
        <section class="card">
          <div class="card-head"><h2>คำแนะนำวันนี้</h2></div>
          <ul class="advice">${advice.map((a) => `<li class="tone-${a.tone}"><span class="dot-ind"></span><span>${esc(a.text)}</span></li>`).join('')}</ul>
        </section>
        <section class="card">${plateauCard(o.plateau)}<div class="btn-row start" style="margin-top:10px"><a class="btn btn-outline btn-sm" href="#/body">ดูรายละเอียด</a></div></section>
      </div>
    </div>`;

  const chart = root.querySelector('#chart');
  if (!weightChart(chart, s.daily, addDays(o.today, -29), o.today, goals)) {
    chart.innerHTML = `<div class="empty"><p>ยังไม่มีข้อมูลน้ำหนักใน 30 วันนี้ กราฟจะแสดงเมื่อบันทึกน้ำหนักครั้งแรก</p><button class="btn btn-primary btn-sm" data-act="weight">บันทึกน้ำหนัก</button></div>`;
  }

  root.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'weight') openWeightForm(app);
    else if (act === 'food') {
      requestAdd();
      app.navigate('food');
    } else if (act === 'workout') app.navigate('workout');
  };
}
