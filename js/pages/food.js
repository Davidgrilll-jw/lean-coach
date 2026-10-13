// Food Tracker: daily log by meal, food search, favourites, custom foods,
// meal templates and copying from earlier days.
import { addDays, fmtRelative, isValid, today } from '../domain/dates.js';
import { checkTargets, foodNutrients, kcalFromMacros, sumNutrients } from '../domain/nutrition.js';
import * as v from '../domain/validate.js';
import { FOOD_CATEGORIES, FOOD_STATES } from '../data/foods.js';
import { dayTotals } from '../services/insights.js';
import * as repo from '../store/repo.js';
import { bar, confirmDialog, emptyState, esc, formValues, handleError, icon, n0, n1, openModal, toast } from '../ui/dom.js';

let day = today();
let view = 'log';
let dbQuery = '';
let pendingAdd = false;

/** Called by the dashboard quick action: open the add sheet as soon as the page shows. */
export function requestAdd() {
  pendingAdd = true;
  day = today();
  view = 'log';
}

const mealName = (m) => (m === 0 ? 'ของว่าง/เครื่องดื่ม' : `มื้อที่ ${m}`);
const stateBadge = (state) => (FOOD_STATES[state] ? `<span class="badge badge-${state}">${FOOD_STATES[state]}</span>` : '');
const per100 = (f) => `${n0(f.kcal)} kcal · โปรตีน ${n1(f.p)} · คาร์บ ${n1(f.c)} · ไขมัน ${n1(f.f)} ก. /100 ก.`;
const byName = (a, b) => a.name.localeCompare(b.name, 'th');

function mealNumbers() {
  const n = repo.settings().goals.mealsPerDay;
  return [...Array.from({ length: n }, (_, i) => i + 1), 0];
}

function makeLog(food, grams, unitLabel, unitQty, date, meal) {
  return { date, meal, foodId: food.id, name: food.name, state: food.state, grams, unitLabel, unitQty, ...foodNutrients(food, grams) };
}

/** A logged entry still works after its food item was deleted: rebuild per-100 g values from the snapshot. */
function foodForLog(log) {
  const food = repo.get('foodItems', log.foodId);
  if (food) return food;
  const k = 100 / log.grams;
  return { id: log.foodId, name: log.name, state: log.state || 'na', kcal: log.kcal * k, p: log.p * k, c: log.c * k, f: log.f * k, servings: [], source: 'รายการนี้ถูกลบออกจากฐานข้อมูลแล้ว' };
}

// ---------- custom food form ----------

export function openFoodForm(app, existing = null, onSaved = null) {
  const s0 = existing?.servings?.[0];
  openModal({
    title: existing ? 'แก้ไขรายการอาหาร' : 'สร้างรายการอาหาร',
    html: `
      <form novalidate>
        <label class="field"><span>ชื่ออาหาร</span><input name="name" maxlength="80" required value="${esc(existing?.name || '')}"></label>
        <div class="field-row">
          <label class="field"><span>หมวด</span><select name="category">${Object.entries(FOOD_CATEGORIES).map(([k, l]) => `<option value="${k}" ${existing?.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>น้ำหนักที่ใช้ชั่ง</span><select name="state">
            <option value="na" ${existing?.state === 'na' ? 'selected' : ''}>ไม่ระบุ/พร้อมกิน</option>
            <option value="raw" ${existing?.state === 'raw' ? 'selected' : ''}>ดิบ (ก่อนปรุง)</option>
            <option value="cooked" ${existing?.state === 'cooked' ? 'selected' : ''}>สุก (หลังปรุง)</option>
          </select></label>
        </div>
        <p class="hint">กรอกค่าต่อ 100 กรัม ตามฉลากหรือแหล่งข้อมูลที่เชื่อถือได้</p>
        <div class="field-row four">
          <label class="field"><span>kcal</span><input name="kcal" inputmode="decimal" value="${existing?.kcal ?? ''}"></label>
          <label class="field"><span>โปรตีน</span><input name="p" inputmode="decimal" value="${existing?.p ?? ''}"></label>
          <label class="field"><span>คาร์บ</span><input name="c" inputmode="decimal" value="${existing?.c ?? ''}"></label>
          <label class="field"><span>ไขมัน</span><input name="f" inputmode="decimal" value="${existing?.f ?? ''}"></label>
        </div>
        <p class="hint" id="kcal-check"></p>
        <div class="field-row">
          <label class="field"><span>หน่วยบริโภค (ไม่บังคับ)</span><input name="servingLabel" maxlength="20" placeholder="เช่น ชิ้น, ถ้วย" value="${esc(s0?.label || '')}"></label>
          <label class="field"><span>หนักกี่กรัมต่อหน่วย</span><input name="servingGrams" inputmode="decimal" value="${s0?.grams ?? ''}"></label>
        </div>
        <label class="check"><input type="checkbox" name="favorite" ${existing?.favorite ? 'checked' : ''}> เพิ่มในรายการโปรด</label>
        <div class="btn-row">
          <button type="button" class="btn btn-ghost" data-calc>คำนวณ kcal จากสารอาหาร</button>
          <button class="btn btn-primary">บันทึก</button>
        </div>
      </form>`,
    onMount: (body, close) => {
      const form = body.querySelector('form');
      const check = body.querySelector('#kcal-check');
      const macroKcal = () => {
        const [p, c, f] = ['p', 'c', 'f'].map((k) => v.parseNum(form[k].value));
        return [p, c, f].every(Number.isFinite) ? kcalFromMacros(p, c, f) : null;
      };
      const update = () => {
        const mk = macroKcal();
        const k = v.parseNum(form.kcal.value);
        if (mk == null) check.textContent = '';
        else if (!Number.isFinite(k)) check.textContent = `พลังงานจากสารอาหาร (4/4/9) ≈ ${n0(mk)} kcal`;
        else if (Math.abs(mk - k) > Math.max(15, k * 0.15)) check.textContent = `พลังงานจากสารอาหาร ≈ ${n0(mk)} kcal ต่างจากที่กรอก ${n0(Math.abs(mk - k))} kcal — ตรวจสอบอีกครั้ง (ปกติถ้ามีแอลกอฮอล์หรือใยอาหารมาก)`;
        else check.textContent = `สอดคล้องกับสารอาหาร (≈ ${n0(mk)} kcal)`;
      };
      form.oninput = update;
      update();
      body.querySelector('[data-calc]').onclick = () => {
        const mk = macroKcal();
        if (mk == null) return toast('กรอกโปรตีน คาร์บ และไขมันก่อน', 'error');
        form.kcal.value = Math.round(mk);
        update();
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const f = formValues(form);
          const g = { min: 0, max: 100 };
          const rec = {
            ...(existing || { custom: true, source: 'ผู้ใช้สร้างเอง' }),
            name: v.text(f.name, { label: 'ชื่ออาหาร', max: 80, optional: false }),
            category: FOOD_CATEGORIES[f.category] ? f.category : 'dish',
            state: FOOD_STATES[f.state] !== undefined ? f.state : 'na',
            kcal: v.num(f.kcal, { label: 'kcal ต่อ 100 ก.', min: 0, max: 900 }),
            p: v.num(f.p, { label: 'โปรตีน ต่อ 100 ก.', ...g }),
            c: v.num(f.c, { label: 'คาร์บ ต่อ 100 ก.', ...g }),
            f: v.num(f.f, { label: 'ไขมัน ต่อ 100 ก.', ...g }),
            favorite: f.favorite,
          };
          if (rec.p + rec.c + rec.f > 100.5) throw new v.ValidationError('โปรตีน + คาร์บ + ไขมัน รวมกันเกิน 100 กรัมต่อ 100 กรัมไม่ได้');
          const label = v.text(f.servingLabel, { label: 'หน่วยบริโภค', max: 20 });
          const rest = (existing?.servings || []).slice(1);
          rec.servings = label ? [{ label, grams: v.num(f.servingGrams, { label: 'น้ำหนักต่อหน่วย (กรัม)', min: 0.1, max: 2000 }) }, ...rest] : rest;
          if (existing && !existing.custom) rec.source = 'ฐานข้อมูลเริ่มต้น (แก้ไขโดยผู้ใช้)';
          const saved = await repo.save('foodItems', rec);
          close();
          toast('บันทึกรายการอาหารแล้ว');
          if (onSaved) onSaved(saved);
          else app.refresh();
        } catch (err) {
          handleError(err);
        }
      };
    },
  });
}

// ---------- add / edit an entry ----------

function openAddModal(app, meal, existing = null) {
  const foods = () => [...repo.list('foodItems')].sort(byName);
  let filter = repo.list('foodItems').some((f) => f.favorite) ? 'fav' : 'all';
  let query = '';
  const modal = openModal({ title: existing ? 'แก้ไขรายการ' : `เพิ่มอาหาร — ${mealName(meal)}`, html: '<div id="add-root" style="display:grid;gap:12px"></div>' });
  const el = modal.el.querySelector('#add-root');
  const done = (msg) => {
    modal.close();
    toast(msg);
    app.refresh();
  };

  function frequent() {
    const count = new Map();
    for (const l of repo.list('foodLogs')) count.set(l.foodId, (count.get(l.foodId) || 0) + 1);
    return foods()
      .filter((f) => count.has(f.id))
      .sort((a, b) => count.get(b.id) - count.get(a.id))
      .slice(0, 15);
  }

  function listHtml() {
    if (filter === 'tpl' && !query) {
      const tpls = repo.list('mealTemplates');
      if (!tpls.length) return emptyState('ยังไม่มีชุดอาหาร — บันทึกมื้อที่กินบ่อยเป็นชุดได้จากปุ่ม "บันทึกเป็นชุด" ในแต่ละมื้อ');
      return tpls
        .map((t) => {
          const total = sumNutrients(t.items);
          return `<div class="row">
            <button type="button" class="row-btn" data-tpl="${t.id}"><div class="row-main"><div class="row-title">${esc(t.name)}</div><div class="row-sub">${t.items.length} รายการ · ${n0(total.kcal)} kcal · โปรตีน ${n0(total.p)} ก.</div></div></button>
            <button type="button" class="icon-btn" data-del-tpl="${t.id}" aria-label="ลบชุดอาหาร">${icon('trash')}</button>
          </div>`;
        })
        .join('');
    }
    let items;
    const q = query.trim().toLowerCase();
    if (q) items = foods().filter((f) => f.name.toLowerCase().includes(q));
    else if (filter === 'fav') items = foods().filter((f) => f.favorite);
    else if (filter === 'freq') items = frequent();
    else if (filter === 'all') items = foods();
    else items = foods().filter((f) => f.category === filter);
    if (!items.length) {
      return emptyState(q ? `ไม่พบ "${query.trim()}" ในฐานข้อมูล` : filter === 'freq' ? 'ยังไม่มีประวัติการบันทึก' : 'ไม่มีรายการในหมวดนี้');
    }
    return items
      .slice(0, 80)
      .map(
        (f) => `<div class="row">
          <button type="button" class="row-btn" data-food="${f.id}"><div class="row-main"><div class="row-title">${esc(f.name)} ${stateBadge(f.state)}</div><div class="row-sub">${per100(f)}</div></div></button>
          <button type="button" class="icon-btn${f.favorite ? ' on' : ''}" data-star="${f.id}" aria-label="รายการโปรด" aria-pressed="${!!f.favorite}">${icon('star')}</button>
        </div>`
      )
      .join('');
  }

  function showList() {
    const chips = [['fav', '★ โปรด'], ['freq', 'ใช้บ่อย'], ['all', 'ทั้งหมด'], ['tpl', 'ชุดอาหาร'], ...Object.entries(FOOD_CATEGORIES)];
    el.innerHTML = `
      <input type="search" id="q" placeholder="ค้นหาอาหาร เช่น อกไก่, ข้าว, น้ำมัน" value="${esc(query)}" autocomplete="off">
      <div class="chips">${chips.map(([k, l]) => `<button type="button" class="chip${k === filter ? ' active' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
      <div class="food-list list" id="results">${listHtml()}</div>
      <button type="button" class="btn btn-outline btn-block" data-new>${icon('plus')}สร้างรายการอาหารใหม่</button>
      <p class="hint">ค่าโภชนาการในฐานข้อมูลเริ่มต้นเป็นค่าประมาณ แก้ไขได้ในเมนู "ฐานข้อมูลอาหาร"</p>`;
    el.querySelector('#q').oninput = (e) => {
      query = e.target.value;
      el.querySelector('#results').innerHTML = listHtml();
    };
  }

  function showQty(food, log = null) {
    const servings = food.servings || [];
    let unit = 'g';
    let qty = 100;
    if (log) {
      const i = servings.findIndex((s) => s.label === log.unitLabel);
      if (i >= 0 && log.unitQty) {
        unit = String(i);
        qty = log.unitQty;
      } else qty = log.grams;
    } else if (servings.length) {
      unit = '0';
      qty = 1;
    }
    const hint =
      food.state === 'raw'
        ? 'ค่านี้คิดจากน้ำหนักดิบ — ชั่งก่อนปรุง (เนื้อสัตว์สุกแล้วน้ำหนักลดลงราว 20–30%)'
        : food.state === 'cooked'
          ? 'ค่านี้คิดจากน้ำหนักหลังปรุงสุก — ชั่งตอนพร้อมกิน'
          : '';
    el.innerHTML = `
      <form novalidate>
        <div><div class="row-title">${esc(food.name)} ${stateBadge(food.state)}</div><div class="row-sub">${per100(food)}</div></div>
        ${hint ? `<div class="notice notice-info">${hint}</div>` : ''}
        <div class="field-row">
          <label class="field"><span>จำนวน</span><input name="qty" inputmode="decimal" autocomplete="off" value="${qty}"></label>
          <label class="field"><span>หน่วย</span><select name="unit">
            <option value="g" ${unit === 'g' ? 'selected' : ''}>กรัม</option>
            ${servings.map((s, i) => `<option value="${i}" ${unit === String(i) ? 'selected' : ''}>${esc(s.label)} (${s.grams} ก.)</option>`).join('')}
          </select></label>
        </div>
        <label class="field"><span>มื้อ</span><select name="meal">${mealNumbers().map((m) => `<option value="${m}" ${m === (log ? log.meal : meal) ? 'selected' : ''}>${mealName(m)}</option>`).join('')}</select></label>
        <div class="preview" id="preview"></div>
        <p class="hint">${esc(food.source || '')}</p>
        <div class="btn-row">
          ${log ? '<button type="button" class="btn btn-ghost" data-del style="color:var(--danger)">ลบ</button>' : '<button type="button" class="btn btn-ghost" data-back>ย้อนกลับ</button>'}
          <button class="btn btn-primary">${log ? 'บันทึกการแก้ไข' : 'เพิ่ม'}</button>
        </div>
      </form>`;
    const form = el.querySelector('form');
    const grams = () => {
      const q = v.parseNum(form.qty.value);
      if (!Number.isFinite(q)) return NaN;
      return form.unit.value === 'g' ? q : q * servings[Number(form.unit.value)].grams;
    };
    const preview = () => {
      const g = grams();
      const nut = Number.isFinite(g) && g > 0 ? foodNutrients(food, g) : null;
      el.querySelector('#preview').innerHTML = [
        ['kcal', nut ? n0(nut.kcal) : '–'],
        ['โปรตีน (ก.)', nut ? n1(nut.p) : '–'],
        ['คาร์บ (ก.)', nut ? n1(nut.c) : '–'],
        ['ไขมัน (ก.)', nut ? n1(nut.f) : '–'],
      ]
        .map(([l, val]) => `<div><b>${val}</b><span>${l}</span></div>`)
        .join('');
    };
    form.oninput = preview;
    preview();
    form.qty.focus();
    form.qty.select();
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const g = v.num(grams(), v.LIMITS.grams);
        const isG = form.unit.value === 'g';
        const s = isG ? null : servings[Number(form.unit.value)];
        const entry = makeLog(food, g, s ? s.label : 'กรัม', v.parseNum(form.qty.value), log ? log.date : day, Number(form.meal.value));
        await repo.save('foodLogs', log ? { ...log, ...entry } : entry);
        done(log ? 'แก้ไขแล้ว' : `เพิ่ม ${food.name} แล้ว`);
      } catch (err) {
        handleError(err);
      }
    };
  }

  el.onclick = async (e) => {
    const t = e.target.closest('[data-filter],[data-food],[data-star],[data-new],[data-back],[data-del],[data-tpl],[data-del-tpl]');
    if (!t) return;
    try {
      if (t.dataset.filter) {
        filter = t.dataset.filter;
        query = '';
        showList();
      } else if (t.dataset.food) showQty(repo.get('foodItems', t.dataset.food));
      else if (t.dataset.star) {
        const f = repo.get('foodItems', t.dataset.star);
        await repo.save('foodItems', { ...f, favorite: !f.favorite });
        el.querySelector('#results').innerHTML = listHtml();
      } else if ('new' in t.dataset) {
        modal.close();
        openFoodForm(app, null, () => openAddModal(app, meal));
      } else if ('back' in t.dataset) showList();
      else if ('del' in t.dataset) {
        await repo.remove('foodLogs', existing.id);
        done('ลบรายการแล้ว');
      } else if (t.dataset.tpl) {
        const tpl = repo.get('mealTemplates', t.dataset.tpl);
        for (const it of tpl.items) {
          const { id, createdAt, updatedAt, ...rest } = it;
          await repo.save('foodLogs', { ...rest, date: day, meal });
        }
        done(`เพิ่มชุด "${tpl.name}" แล้ว`);
      } else if (t.dataset.delTpl) {
        const tpl = repo.get('mealTemplates', t.dataset.delTpl);
        if (await confirmDialog({ title: 'ลบชุดอาหาร?', message: tpl.name, confirmText: 'ลบ', danger: true })) {
          await repo.remove('mealTemplates', tpl.id);
          el.querySelector('#results').innerHTML = listHtml();
        }
      }
    } catch (err) {
      handleError(err);
    }
  };

  if (existing) showQty(foodForLog(existing), existing);
  else showList();
}

// ---------- copy & templates ----------

async function copyEntries(entries, targetMeal = null) {
  for (const e of entries) {
    const { id, createdAt, updatedAt, ...rest } = e;
    await repo.save('foodLogs', { ...rest, date: day, meal: targetMeal ?? e.meal });
  }
}

function openCopyModal(app) {
  const meals = mealNumbers();
  openModal({
    title: 'คัดลอกจากวันอื่น',
    html: `
      <form novalidate>
        <div class="field-row">
          <label class="field"><span>คัดลอกจากวันที่</span><input type="date" name="from" max="${today()}" value="${addDays(day, -1)}"></label>
          <label class="field"><span>มื้อ</span><select name="meal"><option value="all">ทั้งวัน</option>${meals.map((m) => `<option value="${m}">${mealName(m)}</option>`).join('')}</select></label>
        </div>
        <p class="hint" id="copy-info"></p>
        <div class="btn-row"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn btn-primary">คัดลอก</button></div>
      </form>`,
    onMount: (body, close) => {
      const form = body.querySelector('form');
      const pick = () => repo.list('foodLogs').filter((e) => e.date === form.from.value && (form.meal.value === 'all' || e.meal === Number(form.meal.value)));
      const info = () => {
        const list = pick();
        body.querySelector('#copy-info').textContent = list.length ? `พบ ${list.length} รายการ รวม ${n0(sumNutrients(list).kcal)} kcal — จะถูกเพิ่มเข้า ${fmtRelative(day)}` : 'ไม่มีรายการในวันและมื้อที่เลือก';
      };
      form.oninput = info;
      info();
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          if (!isValid(form.from.value)) throw new v.ValidationError('วันที่ไม่ถูกต้อง');
          if (form.from.value === day) throw new v.ValidationError('เลือกวันอื่นที่ไม่ใช่วันเดียวกัน');
          const list = pick();
          if (!list.length) throw new v.ValidationError('ไม่มีรายการให้คัดลอก');
          await copyEntries(list);
          close();
          toast(`คัดลอก ${list.length} รายการแล้ว`);
          app.refresh();
        } catch (err) {
          handleError(err);
        }
      };
    },
  });
}

function openTemplateModal(app, meal, entries) {
  openModal({
    title: 'บันทึกเป็นชุดอาหาร',
    html: `
      <form novalidate>
        <label class="field"><span>ชื่อชุด</span><input name="name" maxlength="60" value="${esc(mealName(meal))} ประจำ"></label>
        <p class="hint">${entries.length} รายการ · ${n0(sumNutrients(entries).kcal)} kcal — เรียกใช้ได้จากแท็บ "ชุดอาหาร" ตอนเพิ่มอาหาร</p>
        <div class="btn-row"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn btn-primary">บันทึกชุด</button></div>
      </form>`,
    onMount: (body, close) => {
      const form = body.querySelector('form');
      form.name.select();
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const name = v.text(form.name.value, { label: 'ชื่อชุด', max: 60, optional: false });
          const items = entries.map(({ id, createdAt, updatedAt, date, meal: m, userId, ...rest }) => rest);
          await repo.save('mealTemplates', { name, items });
          close();
          toast('บันทึกชุดอาหารแล้ว');
        } catch (err) {
          handleError(err);
        }
      };
    },
  });
}

// ---------- page ----------

function renderLog(root, app) {
  const { goals } = repo.settings();
  const totals = dayTotals(day);
  const remaining = goals.kcal - totals.kcal;
  const yesterday = repo.list('foodLogs').filter((e) => e.date === addDays(day, -1));
  const tcheck = checkTargets(goals);

  const macro = (label, value, goal) => `
    <div class="macro">
      <div class="macro-row"><span class="muted">${label}</span><span class="num"><b>${n0(value)}</b>/${n0(goal)} ก.</span></div>
      ${bar(value, goal)}
    </div>`;

  const mealCard = (m) => {
    const entries = totals.entries.filter((e) => e.meal === m);
    const sum = sumNutrients(entries);
    const prev = yesterday.filter((e) => e.meal === m);
    return `
      <section class="card">
        <div class="card-head">
          <div><h2>${mealName(m)}</h2><div class="meal-total">${entries.length ? `${n0(sum.kcal)} kcal · โปรตีน ${n0(sum.p)} · คาร์บ ${n0(sum.c)} · ไขมัน ${n0(sum.f)} ก.` : 'ยังไม่มีรายการ'}</div></div>
          <button class="btn btn-primary btn-sm" data-act="add" data-meal="${m}">${icon('plus')}เพิ่ม</button>
        </div>
        <div class="list">
          ${entries
            .map(
              (e) => `<div class="row">
                <button class="row-btn" data-act="edit" data-id="${e.id}">
                  <div class="row-main"><div class="row-title">${esc(e.name)} ${stateBadge(e.state)}</div>
                  <div class="row-sub">${e.unitLabel && e.unitLabel !== 'กรัม' ? `${n1(e.unitQty)} ${esc(e.unitLabel)} · ` : ''}${n0(e.grams)} ก. · โปรตีน ${n1(e.p)} · คาร์บ ${n1(e.c)} · ไขมัน ${n1(e.f)}</div></div>
                  <div class="row-value">${n0(e.kcal)}<span class="small muted"> kcal</span></div>
                </button>
                <button class="icon-btn" data-act="del" data-id="${e.id}" aria-label="ลบ ${esc(e.name)}">${icon('trash')}</button>
              </div>`
            )
            .join('')}
        </div>
        ${
          entries.length
            ? `<div class="btn-row start" style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-act="save-tpl" data-meal="${m}">${icon('copy')}บันทึกเป็นชุด</button></div>`
            : prev.length
              ? `<button class="btn btn-outline btn-sm btn-block" data-act="repeat" data-meal="${m}">${icon('copy')}ซ้ำเหมือนเมื่อวาน (${prev.length} รายการ · ${n0(sumNutrients(prev).kcal)} kcal)</button>`
              : ''
        }
      </section>`;
  };

  root.innerHTML = `
    <div class="page-head">
      <div><h1>อาหาร</h1><p>${esc(fmtRelative(day))}</p></div>
      <div class="btn-row start">
        <button class="btn btn-outline btn-sm" data-act="copy">${icon('copy')}คัดลอกจากวันอื่น</button>
        <button class="btn btn-outline btn-sm" data-act="db">ฐานข้อมูลอาหาร</button>
      </div>
    </div>
    <div class="date-nav">
      <button class="icon-btn" data-act="prev" aria-label="วันก่อนหน้า">${icon('left')}</button>
      <input type="date" id="day" value="${day}" max="${today()}" aria-label="วันที่">
      <button class="icon-btn" data-act="next" aria-label="วันถัดไป" ${day >= today() ? 'disabled' : ''}>${icon('right')}</button>
    </div>

    <section class="card">
      <div class="grid grid-3">
        <div><div class="stat-label">กินไปแล้ว</div><div class="stat-value">${n0(totals.kcal)}<small>kcal</small></div></div>
        <div><div class="stat-label">เป้าหมาย</div><div class="stat-value">${n0(goals.kcal)}<small>kcal</small></div></div>
        <div><div class="stat-label">${remaining >= 0 ? 'เหลือ' : 'เกิน'}</div><div class="stat-value" ${remaining < -50 ? 'style="color:var(--warn)"' : ''}>${n0(Math.abs(remaining))}<small>kcal</small></div></div>
      </div>
      <div style="margin-top:10px">${bar(totals.kcal, goals.kcal, { over: true })}</div>
      <div class="macros">${macro('โปรตีน', totals.p, goals.proteinG)}${macro('คาร์บ', totals.c, goals.carbG)}${macro('ไขมัน', totals.f, goals.fatG)}</div>
      ${tcheck.consistent ? '' : `<p class="hint" style="margin-top:10px">เป้าหมายสารอาหารรวมได้ ${n0(tcheck.macroKcal)} kcal ไม่ตรงกับเป้าหมายแคลอรี ${n0(goals.kcal)} — ปรับได้ที่หน้าตั้งค่า</p>`}
    </section>

    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr))">${mealNumbers().map(mealCard).join('')}</div>
    <p class="hint">พลังงานคิดจากค่าในฐานข้อมูลของแต่ละรายการ (โดยทั่วไป โปรตีนและคาร์บ 4 kcal/ก. ไขมัน 9 kcal/ก.) อาหารจริงอาจต่างได้ 10–20% — อย่าลืมน้ำมัน ซอส น้ำตาล และเครื่องดื่ม</p>`;

  root.querySelector('#day').onchange = (e) => {
    if (isValid(e.target.value) && e.target.value <= today()) day = e.target.value;
    app.refresh();
  };

  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    const meal = Number(btn.dataset.meal);
    try {
      if (act === 'prev') {
        day = addDays(day, -1);
        app.refresh();
      } else if (act === 'next') {
        if (day < today()) day = addDays(day, 1);
        app.refresh();
      } else if (act === 'add') openAddModal(app, meal);
      else if (act === 'edit') openAddModal(app, 0, repo.get('foodLogs', id));
      else if (act === 'del') {
        const rec = repo.get('foodLogs', id);
        if (await confirmDialog({ title: 'ลบรายการนี้?', message: `${rec.name} — ${n0(rec.grams)} ก.`, confirmText: 'ลบ', danger: true })) {
          await repo.remove('foodLogs', id);
          toast('ลบรายการแล้ว');
          app.refresh();
        }
      } else if (act === 'repeat') {
        const prev = yesterday.filter((x) => x.meal === meal);
        await copyEntries(prev);
        toast(`เพิ่ม ${prev.length} รายการจากเมื่อวานแล้ว`);
        app.refresh();
      } else if (act === 'save-tpl') openTemplateModal(app, meal, totals.entries.filter((x) => x.meal === meal));
      else if (act === 'copy') openCopyModal(app);
      else if (act === 'db') {
        view = 'db';
        app.refresh();
      }
    } catch (err) {
      handleError(err);
    }
  };

  if (pendingAdd) {
    pendingAdd = false;
    const meals = mealNumbers().filter((m) => m !== 0);
    openAddModal(app, meals.find((m) => !totals.entries.some((e) => e.meal === m)) ?? meals[meals.length - 1]);
  }
}

function renderDb(root, app) {
  const rows = () => {
    const q = dbQuery.trim().toLowerCase();
    const items = [...repo.list('foodItems')].filter((f) => !q || f.name.toLowerCase().includes(q)).sort(byName);
    if (!items.length) return emptyState(q ? `ไม่พบ "${dbQuery.trim()}"` : 'ยังไม่มีรายการอาหาร');
    return items
      .map(
        (f) => `<div class="row">
          <div class="row-main"><div class="row-title">${esc(f.name)} ${stateBadge(f.state)} ${f.custom ? '<span class="badge badge-ok">สร้างเอง</span>' : ''}</div>
          <div class="row-sub">${FOOD_CATEGORIES[f.category] || ''} · ${per100(f)}</div></div>
          <button class="icon-btn${f.favorite ? ' on' : ''}" data-act="star" data-id="${f.id}" aria-label="รายการโปรด" aria-pressed="${!!f.favorite}">${icon('star')}</button>
          <button class="icon-btn" data-act="edit-food" data-id="${f.id}" aria-label="แก้ไข">${icon('edit')}</button>
          <button class="icon-btn" data-act="del-food" data-id="${f.id}" aria-label="ลบ">${icon('trash')}</button>
        </div>`
      )
      .join('');
  };
  root.innerHTML = `
    <div class="page-head">
      <div><h1>ฐานข้อมูลอาหาร</h1><p>${repo.list('foodItems').length} รายการ · ค่าต่อ 100 กรัม</p></div>
      <div class="btn-row start">
        <button class="btn btn-outline btn-sm" data-act="back">${icon('left')}กลับไปบันทึกอาหาร</button>
        <button class="btn btn-primary btn-sm" data-act="new-food">${icon('plus')}สร้างรายการ</button>
      </div>
    </div>
    <div class="notice notice-info">รายการเริ่มต้นเป็น<b>ค่าประมาณ</b>จากตารางคุณค่าอาหารทั่วไป ยี่ห้อ ส่วนของเนื้อ และวิธีปรุงทำให้ค่าจริงต่างได้ — แก้ไขให้ตรงกับฉลากของที่คุณกินจริงได้ทุกรายการ</div>
    <input type="search" id="dbq" placeholder="ค้นหา" value="${esc(dbQuery)}" autocomplete="off">
    <section class="card"><div class="list" id="db-list">${rows()}</div></section>`;
  root.querySelector('#dbq').oninput = (e) => {
    dbQuery = e.target.value;
    root.querySelector('#db-list').innerHTML = rows();
  };
  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    try {
      if (act === 'back') {
        view = 'log';
        app.refresh();
      } else if (act === 'new-food') openFoodForm(app);
      else if (act === 'edit-food') openFoodForm(app, repo.get('foodItems', id));
      else if (act === 'star') {
        const f = repo.get('foodItems', id);
        await repo.save('foodItems', { ...f, favorite: !f.favorite });
        root.querySelector('#db-list').innerHTML = rows();
      } else if (act === 'del-food') {
        const f = repo.get('foodItems', id);
        if (await confirmDialog({ title: 'ลบรายการอาหาร?', message: `${f.name}\n\nรายการที่เคยบันทึกไว้แล้วจะยังอยู่ครบ`, confirmText: 'ลบ', danger: true })) {
          await repo.remove('foodItems', id);
          toast('ลบแล้ว');
          root.querySelector('#db-list').innerHTML = rows();
        }
      }
    } catch (err) {
      handleError(err);
    }
  };
}

export function render(root, app) {
  if (day > today()) day = today();
  if (view === 'db') renderDb(root, app);
  else renderLog(root, app);
}
