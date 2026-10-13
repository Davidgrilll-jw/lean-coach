// Settings: profile, energy estimates, goals, backup/restore and install.
import { fmtShort, today } from '../domain/dates.js';
import { ACTIVITY_LEVELS, activityFactor, bmrMifflin, checkTargets, suggestTargets, tdee } from '../domain/nutrition.js';
import * as v from '../domain/validate.js';
import { overview } from '../services/insights.js';
import * as repo from '../store/repo.js';
import { confirmDialog, download, esc, formValues, handleError, n0, n1, toast } from '../ui/dom.js';

const GOAL_LABEL = { kcal: 'แคลอรี', proteinG: 'โปรตีน', fatG: 'ไขมัน', carbG: 'คาร์บ', steps: 'ก้าว', targetWeightKg: 'น้ำหนักเป้าหมาย' };

// The browser fires this once when the app is installable; keep it for the button.
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});

function targetHint(form, bmr, tdeeKcal) {
  const [kcal, p, c, f] = ['kcal', 'proteinG', 'carbG', 'fatG'].map((k) => v.parseNum(form[k].value));
  if (![kcal, p, c, f].every(Number.isFinite)) return { text: 'กรอกตัวเลขให้ครบทั้ง 4 ช่อง', tone: 'info' };
  const chk = checkTargets({ kcal, proteinG: p, carbG: c, fatG: f });
  const parts = [];
  let tone = 'ok';
  parts.push(chk.consistent ? `สารอาหารรวม ${n0(chk.macroKcal)} kcal สอดคล้องกับเป้าหมายแคลอรี` : `สารอาหารรวม ${n0(chk.macroKcal)} kcal ${chk.diff > 0 ? 'มากกว่า' : 'น้อยกว่า'}เป้าหมายแคลอรี ${n0(Math.abs(chk.diff))} kcal — ปรับคาร์บหรือไขมันให้ตรงกัน`);
  if (!chk.consistent) tone = 'warn';
  if (bmr && kcal < bmr) {
    parts.push(`ต่ำกว่า BMR (${n0(bmr)} kcal) — ต่ำเกินไปสำหรับการรักษากล้ามเนื้อ`);
    tone = 'warn';
  } else if (tdeeKcal && kcal >= tdeeKcal) {
    parts.push('ไม่ต่ำกว่า TDEE โดยประมาณ — ระดับนี้จะไม่ลดไขมัน');
    tone = 'warn';
  } else if (tdeeKcal && kcal < tdeeKcal * 0.75) {
    parts.push(`ต่ำกว่า TDEE มากกว่า 25% — ลดเร็วเกินไปเสี่ยงเสียกล้ามเนื้อ`);
    tone = 'warn';
  } else if (tdeeKcal) {
    parts.push(`ต่ำกว่า TDEE โดยประมาณ ${n0(tdeeKcal - kcal)} kcal (${Math.round((1 - kcal / tdeeKcal) * 100)}%)`);
  }
  return { text: parts.join(' · '), tone };
}

export function render(root, app) {
  const o = overview();
  const { profile, goals, settings } = o;
  const suggested = suggestTargets({ weightKg: o.weightKg, bmr: o.bmr, tdee: o.tdee });
  const sourceText = { profile: 'น้ำหนักจากโปรไฟล์ (ยังไม่มีการชั่งในแอป)', latest: 'น้ำหนักที่ชั่งล่าสุด', avg7: 'ค่าเฉลี่ยน้ำหนัก 7 วัน' }[o.weightSource];
  const history = [...(settings.goalHistory || [])].reverse().slice(0, 8);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  root.innerHTML = `
    <div class="page-head"><div><h1>ตั้งค่า</h1><p>โปรไฟล์ เป้าหมาย และข้อมูล</p></div></div>
    ${settings.profileConfirmed === false ? '<div class="notice notice-warn"><b>เริ่มต้นใช้งาน:</b> ค่าด้านล่างเป็นค่าตัวอย่าง กรอกเพศ อายุ ส่วนสูง และน้ำหนักของคุณในส่วน "โปรไฟล์" แล้วกดบันทึก ระบบจะคำนวณ BMR, TDEE และเป้าหมายแคลอรี/สารอาหารเริ่มต้นให้ จากนั้นตั้งน้ำหนักเป้าหมายในส่วนถัดไป</div>' : ''}

    <section class="card">
      <div class="card-head"><h2>พลังงานโดยประมาณ</h2><span class="badge badge-info">ค่าประมาณ</span></div>
      <div class="grid grid-3">
        <div><div class="stat-label">BMR</div><div class="stat-value">≈ ${n0(o.bmr)}<small>kcal</small></div><div class="stat-sub">พลังงานพื้นฐานที่ร่างกายใช้ขณะพัก</div></div>
        <div><div class="stat-label">TDEE</div><div class="stat-value">≈ ${n0(o.tdee)}<small>kcal</small></div><div class="stat-sub">พลังงานที่ใช้รวมต่อวัน (ช่วง ${n0(o.tdee * 0.95)}–${n0(o.tdee * 1.05)})</div></div>
        <div><div class="stat-label">เป้าหมายลดไขมัน</div><div class="stat-value">${n0(goals.kcal)}<small>kcal</small></div><div class="stat-sub">${o.tdee > goals.kcal ? `ต่ำกว่า TDEE ≈ ${n0(o.tdee - goals.kcal)} kcal (${Math.round((1 - goals.kcal / o.tdee) * 100)}%)` : 'ไม่ต่ำกว่า TDEE'}</div></div>
      </div>
      <ul class="plain muted" style="margin-top:12px">
        <li>BMR คำนวณด้วยสูตร Mifflin–St Jeor จากเพศ อายุ ส่วนสูง และ${esc(sourceText)} ${n1(o.weightKg)} กก.</li>
        <li>TDEE = BMR × ${o.factor} (ระดับกิจกรรม) ตัวคูณนี้<b>รวมเวทและฟุตบอลไว้แล้ว</b> จึงไม่นำแคลอรีจากการออกกำลังกายมาบวกเพิ่มอีก</li>
        <li>เป้าหมายลดไขมันต้องต่ำกว่า TDEE พอประมาณ (ราว 15–20%) เพื่อให้ลด 0.25–0.75% ของน้ำหนักตัวต่อสัปดาห์โดยไม่เสียกล้ามเนื้อ</li>
        <li>ทั้งหมดเป็นค่าประมาณ ไม่ใช่ค่าที่วัดจากห้องปฏิบัติการ ให้ปรับตามแนวโน้มน้ำหนักจริง 2–3 สัปดาห์${o.empirical ? ` — จากข้อมูลจริงของคุณ TDEE ≈ <b>${n0(o.empirical.kcal)} kcal</b>` : ''}</li>
      </ul>
    </section>

    <div class="cols">
      <section class="card">
        <div class="card-head"><h2>โปรไฟล์</h2></div>
        <form id="profile-form" novalidate>
          <div class="field-row three">
            <label class="field"><span>เพศ</span><select name="sex"><option value="male" ${profile.sex === 'male' ? 'selected' : ''}>ชาย</option><option value="female" ${profile.sex === 'female' ? 'selected' : ''}>หญิง</option></select></label>
            <label class="field"><span>อายุ (ปี)</span><input name="age" inputmode="numeric" value="${profile.age}"></label>
            <label class="field"><span>ส่วนสูง (ซม.)</span><input name="heightCm" inputmode="decimal" value="${profile.heightCm}"></label>
          </div>
          <div class="field-row three">
            <label class="field"><span>น้ำหนักเริ่มต้น</span><input name="startWeightKg" inputmode="decimal" value="${profile.startWeightKg}"></label>
            <label class="field"><span>วันที่เริ่ม</span><input type="date" name="startDate" max="${today()}" value="${profile.startDate}"></label>
            <label class="field"><span>น้ำหนักปัจจุบัน</span><input name="currentWeightKg" inputmode="decimal" value="${profile.currentWeightKg}"></label>
          </div>
          <p class="hint">"น้ำหนักปัจจุบัน" ใช้เฉพาะตอนที่ยังไม่มีการชั่งในแอป เมื่อเริ่มบันทึกน้ำหนักแล้วระบบจะใช้ค่าที่ชั่งจริงแทน</p>
          <label class="field"><span>ระดับกิจกรรม (ใช้คำนวณ TDEE)</span><select name="activityLevel">${ACTIVITY_LEVELS.map((l) => `<option value="${l.id}" ${l.id === profile.activityLevel ? 'selected' : ''}>× ${l.factor} — ${l.label}: ${l.desc}</option>`).join('')}</select></label>
          <div class="btn-row"><button class="btn btn-primary">บันทึกโปรไฟล์</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>เป้าหมายโภชนาการ</h2></div>
        <form id="nutrition-form" novalidate>
          <div class="field-row">
            <label class="field"><span>แคลอรี (kcal/วัน)</span><input name="kcal" inputmode="numeric" value="${goals.kcal}"></label>
            <label class="field"><span>โปรตีน (ก./วัน)</span><input name="proteinG" inputmode="numeric" value="${goals.proteinG}"></label>
          </div>
          <div class="field-row">
            <label class="field"><span>คาร์โบไฮเดรต (ก./วัน)</span><input name="carbG" inputmode="numeric" value="${goals.carbG}"></label>
            <label class="field"><span>ไขมัน (ก./วัน)</span><input name="fatG" inputmode="numeric" value="${goals.fatG}"></label>
          </div>
          <div class="notice" id="target-hint"></div>
          ${suggested ? `<p class="hint">ค่าที่ระบบแนะนำจากข้อมูลปัจจุบัน: ${n0(suggested.kcal)} kcal · โปรตีน ${suggested.proteinG} ก. (2.0 ก./กก.) · ไขมัน ${suggested.fatG} ก. (0.75 ก./กก.) · คาร์บ ${suggested.carbG} ก. — พลังงานคิดที่ 4/4/9 kcal ต่อกรัม</p>` : ''}
          <div class="btn-row">
            ${suggested ? '<button type="button" class="btn btn-ghost" data-act="use-suggested">ใส่ค่าที่แนะนำ</button>' : ''}
            <button class="btn btn-primary">บันทึกเป้าหมาย</button>
          </div>
        </form>
      </section>
    </div>

    <div class="cols">
      <section class="card">
        <div class="card-head"><h2>เป้าหมายน้ำหนักและกิจกรรม</h2></div>
        <form id="goals-form" novalidate>
          <div class="field-row three">
            <label class="field"><span>น้ำหนักเป้าหมาย</span><input name="targetWeightKg" inputmode="decimal" value="${goals.targetWeightKg}"></label>
            <label class="field"><span>ช่วงต่ำสุด</span><input name="targetWeightMin" inputmode="decimal" value="${goals.targetWeightMin}"></label>
            <label class="field"><span>ช่วงสูงสุด</span><input name="targetWeightMax" inputmode="decimal" value="${goals.targetWeightMax}"></label>
          </div>
          <div class="field-row three">
            <label class="field"><span>ก้าว/วัน</span><input name="steps" inputmode="numeric" value="${goals.steps}"></label>
            <label class="field"><span>ฟุตบอลต่ำสุด (นาที/สัปดาห์)</span><input name="footballMin" inputmode="numeric" value="${goals.footballMin}"></label>
            <label class="field"><span>ฟุตบอลสูงสุด</span><input name="footballMax" inputmode="numeric" value="${goals.footballMax}"></label>
          </div>
          <div class="field-row">
            <label class="field"><span>เวท (วัน/สัปดาห์)</span><input name="workoutsPerWeek" inputmode="numeric" value="${goals.workoutsPerWeek}"></label>
            <label class="field"><span>จำนวนมื้อ/วัน</span><input name="mealsPerDay" inputmode="numeric" value="${goals.mealsPerDay}"></label>
          </div>
          <div class="btn-row"><button class="btn btn-primary">บันทึก</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>ประวัติการปรับเป้าหมาย</h2></div>
        ${
          history.length
            ? `<div class="list">${history
                .map(
                  (h) => `<div class="row"><div class="row-main"><div class="row-title" style="font-weight:550">${Object.entries(h.changes)
                    .filter(([k]) => GOAL_LABEL[k])
                    .map(([k, c]) => `${GOAL_LABEL[k]} ${n0(c.from)} → ${n0(c.to)}`)
                    .join(' · ') || 'ปรับเป้าหมาย'}</div><div class="row-sub">${fmtShort(h.date)} · ${esc(h.reason)}</div></div></div>`
                )
                .join('')}</div>`
            : '<p class="muted small">ยังไม่เคยปรับเป้าหมาย ระบบจะไม่ปรับเป้าหมายเองโดยอัตโนมัติ ทุกครั้งต้องผ่านการยืนยันของคุณ</p>'
        }
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h2>ข้อมูลและการสำรอง</h2><span class="badge ${repo.isPersistent() ? 'badge-ok' : 'badge-warn'}">${repo.isPersistent() ? 'เก็บในอุปกรณ์นี้' : 'ไม่ถาวร'}</span></div>
      <div class="notice notice-warn">ข้อมูลทั้งหมดเก็บในเบราว์เซอร์ของอุปกรณ์นี้ (IndexedDB) ไม่มีการส่งขึ้นเซิร์ฟเวอร์ ข้อมูล<b>จะหาย</b>หากล้างข้อมูลเว็บไซต์/เบราว์เซอร์ ถอนการติดตั้งแอป หรือเปลี่ยนอุปกรณ์ — สำรองข้อมูลเป็นไฟล์เป็นระยะ</div>
      <div class="btn-row start" style="margin-top:12px">
        <button class="btn btn-primary" data-act="export">สำรองข้อมูล (รวมภาพ)</button>
        <button class="btn btn-outline" data-act="export-lite">สำรองแบบไม่รวมภาพ</button>
        <button class="btn btn-outline" data-act="import">กู้คืนจากไฟล์</button>
        <button class="btn btn-outline" data-act="persist">ขอพื้นที่จัดเก็บถาวร</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
      <p class="hint" style="margin-top:8px">ไฟล์สำรองเป็น JSON ที่ไม่ได้เข้ารหัส และแบบรวมภาพจะมีภาพรูปร่างของคุณอยู่ด้วย — เก็บในที่ปลอดภัย</p>
      <details class="more" style="margin-top:8px"><summary>ลบข้อมูลทั้งหมด</summary>
        <p class="small muted">ลบทุกอย่างในอุปกรณ์นี้และเริ่มใหม่จากค่าเริ่มต้น กู้คืนได้จากไฟล์สำรองเท่านั้น</p>
        <div class="btn-row start" style="margin-top:8px"><button class="btn btn-danger" data-act="wipe">ลบข้อมูลทั้งหมด</button></div>
      </details>
    </section>

    <section class="card">
      <div class="card-head"><h2>ติดตั้งบนหน้าจอมือถือ</h2>${standalone ? '<span class="badge badge-ok">ติดตั้งแล้ว</span>' : ''}</div>
      ${
        standalone
          ? '<p class="small muted">กำลังเปิดจากแอปที่ติดตั้งไว้</p>'
          : `<ul class="plain"><li><b>iPhone (Safari):</b> ปุ่มแชร์ → "เพิ่มไปยังหน้าจอโฮม"</li><li><b>Android (Chrome):</b> เมนู ⋮ → "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก"</li></ul>
             <p class="hint" style="margin-top:6px">การติดตั้งและการใช้งานออฟไลน์ต้องเปิดผ่าน HTTPS (หรือ localhost)</p>
             ${installPrompt ? '<div class="btn-row start" style="margin-top:8px"><button class="btn btn-primary" data-act="install">ติดตั้งแอป</button></div>' : ''}`
      }
    </section>

    <p class="hint">Lean Coach เป็นเครื่องมือติดตามและให้ข้อมูลทั่วไปด้านการออกกำลังกายและโภชนาการ ไม่ใช่การวินิจฉัยหรือคำแนะนำทางการแพทย์ หากมีโรคประจำตัวหรืออาการผิดปกติ ควรปรึกษาแพทย์หรือนักกำหนดอาหาร</p>`;

  const nform = root.querySelector('#nutrition-form');
  const paintHint = () => {
    const h = targetHint(nform, o.bmr, o.tdee);
    const el = root.querySelector('#target-hint');
    el.className = `notice notice-${h.tone}`;
    el.textContent = h.text;
  };
  nform.oninput = paintHint;
  paintHint();

  root.onsubmit = async (e) => {
    e.preventDefault();
    const f = formValues(e.target);
    try {
      if (e.target.id === 'profile-form') {
        const p = {
          sex: f.sex === 'female' ? 'female' : 'male',
          age: v.num(f.age, { label: 'อายุ', min: 14, max: 100, integer: true }),
          heightCm: v.num(f.heightCm, { label: 'ส่วนสูง (ซม.)', min: 120, max: 230 }),
          startWeightKg: v.num(f.startWeightKg, { ...v.LIMITS.weightKg, label: 'น้ำหนักเริ่มต้น' }),
          startDate: v.date(f.startDate, { label: 'วันที่เริ่ม' }),
          currentWeightKg: v.num(f.currentWeightKg, { ...v.LIMITS.weightKg, label: 'น้ำหนักปัจจุบัน' }),
          activityLevel: ACTIVITY_LEVELS.some((l) => l.id === f.activityLevel) ? f.activityLevel : 'light',
        };
        const firstSetup = settings.profileConfirmed === false;
        await repo.saveSettings({ profile: p, profileConfirmed: true });
        const weightKg = o.summary.current ?? p.currentWeightKg;
        const bmr = bmrMifflin({ ...p, weightKg });
        const tdeeKcal = tdee(bmr, activityFactor(p.activityLevel));
        if (firstSetup) {
          // First set-up only: replace the placeholder targets with ones computed for this profile.
          const t = suggestTargets({ weightKg, bmr, tdee: tdeeKcal });
          await repo.saveSettings({ goals: t });
          toast(`บันทึกโปรไฟล์แล้ว — ตั้งเป้าหมายเริ่มต้น ${n0(t.kcal)} kcal, โปรตีน ${t.proteinG} ก. ให้แล้ว ตรวจน้ำหนักเป้าหมายด้านล่างต่อได้เลย`);
        } else {
          toast(`บันทึกแล้ว — BMR ≈ ${n0(bmr)}, TDEE ≈ ${n0(tdeeKcal)} kcal (เป้าหมายแคลอรีไม่ถูกเปลี่ยนอัตโนมัติ)`);
        }
      } else if (e.target.id === 'nutrition-form') {
        const g = {
          kcal: v.num(f.kcal, { label: 'แคลอรี', min: 1000, max: 6000, integer: true }),
          proteinG: v.num(f.proteinG, { label: 'โปรตีน', min: 30, max: 400, integer: true }),
          carbG: v.num(f.carbG, { label: 'คาร์โบไฮเดรต', min: 0, max: 900, integer: true }),
          fatG: v.num(f.fatG, { label: 'ไขมัน', min: 20, max: 300, integer: true }),
        };
        const chk = checkTargets(g);
        if (!chk.consistent) {
          const ok = await confirmDialog({
            title: 'เป้าหมายไม่ตรงกัน',
            message: `สารอาหารที่ตั้งไว้รวมได้ ${n0(chk.macroKcal)} kcal แต่เป้าหมายแคลอรีคือ ${n0(g.kcal)} kcal (ต่างกัน ${n0(Math.abs(chk.diff))})\n\nต้องการบันทึกทั้งอย่างนี้หรือไม่?`,
            confirmText: 'บันทึกต่อ',
          });
          if (!ok) return;
        }
        await repo.changeGoals(g, 'ปรับเองที่หน้าตั้งค่า', o.today);
        toast('บันทึกเป้าหมายโภชนาการแล้ว');
      } else if (e.target.id === 'goals-form') {
        const g = {
          targetWeightKg: v.num(f.targetWeightKg, { ...v.LIMITS.weightKg, label: 'น้ำหนักเป้าหมาย' }),
          targetWeightMin: v.num(f.targetWeightMin, { ...v.LIMITS.weightKg, label: 'ช่วงต่ำสุด' }),
          targetWeightMax: v.num(f.targetWeightMax, { ...v.LIMITS.weightKg, label: 'ช่วงสูงสุด' }),
          steps: v.num(f.steps, { label: 'ก้าว/วัน', min: 1000, max: 40000, integer: true }),
          footballMin: v.num(f.footballMin, { label: 'ฟุตบอลต่ำสุด', min: 0, max: 1200, integer: true }),
          footballMax: v.num(f.footballMax, { label: 'ฟุตบอลสูงสุด', min: 0, max: 1200, integer: true }),
          workoutsPerWeek: v.num(f.workoutsPerWeek, { label: 'เวท (วัน/สัปดาห์)', min: 1, max: 7, integer: true }),
          mealsPerDay: v.num(f.mealsPerDay, { label: 'จำนวนมื้อ/วัน', min: 1, max: 8, integer: true }),
        };
        if (g.targetWeightMin > g.targetWeightMax) throw new v.ValidationError('ช่วงต่ำสุดต้องไม่มากกว่าช่วงสูงสุด');
        if (g.targetWeightKg < g.targetWeightMin || g.targetWeightKg > g.targetWeightMax) throw new v.ValidationError('น้ำหนักเป้าหมายต้องอยู่ในช่วงต่ำสุด–สูงสุด');
        if (g.footballMin > g.footballMax) throw new v.ValidationError('ฟุตบอลต่ำสุดต้องไม่มากกว่าสูงสุด');
        const bmi = g.targetWeightMin / (profile.heightCm / 100) ** 2;
        if (bmi < 18.5) throw new v.ValidationError(`น้ำหนัก ${g.targetWeightMin} กก. ต่ำกว่าเกณฑ์ BMI 18.5 สำหรับส่วนสูงนี้ — ตั้งเป้าหมายให้สูงขึ้น`);
        await repo.changeGoals(g, 'ปรับเองที่หน้าตั้งค่า', o.today);
        toast('บันทึกเป้าหมายแล้ว');
      }
      app.refresh();
    } catch (err) {
      handleError(err);
    }
  };

  const fileInput = root.querySelector('#import-file');
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      let backup;
      try {
        backup = JSON.parse(await file.text());
      } catch {
        throw new v.ValidationError('อ่านไฟล์ไม่ได้ — ไม่ใช่ไฟล์ JSON ที่ถูกต้อง');
      }
      const ok = await confirmDialog({
        title: 'กู้คืนข้อมูล?',
        message: `ข้อมูลปัจจุบันในอุปกรณ์นี้จะถูกแทนที่ด้วยข้อมูลจากไฟล์ "${file.name}"${backup?.exportedAt ? ` (สำรองเมื่อ ${String(backup.exportedAt).slice(0, 10)})` : ''}`,
        confirmText: 'กู้คืน',
        danger: true,
      });
      if (!ok) return;
      await repo.importAll(backup);
      toast('กู้คืนข้อมูลแล้ว');
      app.refresh();
    } catch (err) {
      if (err instanceof v.ValidationError) handleError(err);
      else toast(err.message, 'error');
    }
  };

  root.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    try {
      if (act === 'use-suggested') {
        for (const k of ['kcal', 'proteinG', 'carbG', 'fatG']) nform[k].value = suggested[k];
        paintHint();
        toast('ใส่ค่าที่แนะนำแล้ว — กด "บันทึกเป้าหมาย" เพื่อยืนยัน');
      } else if (act === 'export' || act === 'export-lite') {
        const data = repo.exportAll({ includePhotos: act === 'export' });
        download(`lean-coach-backup-${today()}.json`, JSON.stringify(data));
        toast('สร้างไฟล์สำรองแล้ว');
      } else if (act === 'import') fileInput.click();
      else if (act === 'persist') {
        if (!navigator.storage?.persist) return toast('เบราว์เซอร์นี้ไม่รองรับการขอพื้นที่ถาวร', 'error');
        const granted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
        toast(granted ? 'เบราว์เซอร์จะไม่ลบข้อมูลนี้เองเมื่อพื้นที่เต็ม' : 'เบราว์เซอร์ยังไม่อนุญาต (มักอนุญาตหลังติดตั้งแอปหรือใช้งานบ่อยขึ้น)', granted ? 'success' : 'error');
      } else if (act === 'wipe') {
        if (await confirmDialog({ title: 'ลบข้อมูลทั้งหมด?', message: 'น้ำหนัก อาหาร การฝึก กิจกรรม ภาพ และการตั้งค่าทั้งหมดจะถูกลบถาวร', confirmText: 'ลบทั้งหมด', danger: true })) {
          await repo.wipe();
          toast('ลบข้อมูลและเริ่มใหม่แล้ว');
          app.refresh();
        }
      } else if (act === 'install' && installPrompt) {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        app.refresh();
      }
    } catch (err) {
      handleError(err);
    }
  };
}
