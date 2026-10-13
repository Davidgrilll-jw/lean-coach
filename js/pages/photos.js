// Progress Photos: the user's own photos, kept only in this browser's
// database. Comparison is visual; no body-fat figure is derived from images.
import { fmtLong, fmtShort, today } from '../domain/dates.js';
import * as v from '../domain/validate.js';
import { dailyWeights } from '../domain/weight.js';
import * as repo from '../store/repo.js';
import { confirmDialog, emptyState, esc, formValues, handleError, icon, n1, openModal, toast } from '../ui/dom.js';

const POSES = { front: 'ด้านหน้า', side: 'ด้านข้าง', back: 'ด้านหลัง' };
const MAX_EDGE = 1400;

let picked = []; // [beforeId, afterId]
let mode = 'side';

/** Downscale to a JPEG data URL (this also drops EXIF data such as GPS position). */
async function toDataUrl(file) {
  if (!file.type.startsWith('image/')) throw new v.ValidationError('กรุณาเลือกไฟล์รูปภาพ');
  if (file.size > 30 * 1024 * 1024) throw new v.ValidationError('ไฟล์ใหญ่เกิน 30 MB');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new v.ValidationError('เปิดรูปนี้ไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG');
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.85);
}

function openPhotoForm(app, existing = null) {
  const weightOn = (date) => {
    const kg = dailyWeights(repo.list('weightLogs')).get(date);
    return kg == null ? '' : n1(kg);
  };
  openModal({
    title: existing ? 'แก้ไขข้อมูลภาพ' : 'เพิ่มภาพรูปร่าง',
    html: `
      <form novalidate>
        ${existing ? `<img src="${existing.image}" alt="" style="max-height:220px;border-radius:12px;justify-self:center">` : '<label class="field"><span>รูปภาพ</span><input type="file" name="file" accept="image/*"></label>'}
        <div class="field-row">
          <label class="field"><span>วันที่ถ่าย</span><input type="date" name="date" max="${today()}" value="${existing?.date || today()}"></label>
          <label class="field"><span>น้ำหนักวันนั้น (กก.)</span><input name="kg" inputmode="decimal" value="${existing ? existing.kg ?? '' : weightOn(today())}" placeholder="ไม่บังคับ"></label>
        </div>
        <label class="field"><span>มุมถ่าย</span><select name="pose">${Object.entries(POSES).map(([k, l]) => `<option value="${k}" ${existing?.pose === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>หมายเหตุเกี่ยวกับรูปร่าง (ไม่บังคับ)</span><textarea name="note" maxlength="300" placeholder="เช่น เอวเล็กลง, เห็นร่องท้องบน">${esc(existing?.note || '')}</textarea></label>
        ${existing ? '' : '<p class="hint">ถ่ายมุมเดิม แสงเดิม ระยะเดิม เวลาเดิม (ตอนเช้า) จะเปรียบเทียบได้ตรงที่สุด ภาพจะถูกย่อและเก็บในอุปกรณ์นี้เท่านั้น</p>'}
        <div class="btn-row">
          ${existing ? '<button type="button" class="btn btn-ghost" data-del style="color:var(--danger)">ลบภาพ</button>' : '<button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>'}
          <button class="btn btn-primary">บันทึก</button>
        </div>
      </form>`,
    onMount: (body, close) => {
      const form = body.querySelector('form');
      if (!existing) {
        form.date.onchange = () => {
          if (!form.kg.value) form.kg.value = weightOn(form.date.value);
        };
      }
      body.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (await confirmDialog({ title: 'ลบภาพนี้?', message: `${fmtLong(existing.date)}\n\nลบแล้วกู้คืนไม่ได้`, confirmText: 'ลบ', danger: true })) {
          await repo.remove('photos', existing.id);
          picked = picked.filter((id) => id !== existing.id);
          close();
          toast('ลบภาพแล้ว');
          app.refresh();
        }
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const submit = form.querySelector('.btn-primary');
        try {
          const f = formValues(form);
          const rec = {
            ...(existing || {}),
            date: v.date(f.date),
            kg: v.num(f.kg, { ...v.LIMITS.weightKg, optional: true }),
            pose: POSES[f.pose] ? f.pose : 'front',
            note: v.text(f.note, { label: 'หมายเหตุ', max: 300 }),
          };
          if (!existing) {
            const file = form.file.files[0];
            if (!file) throw new v.ValidationError('กรุณาเลือกรูปภาพ');
            submit.disabled = true;
            rec.image = await toDataUrl(file);
          }
          await repo.save('photos', rec);
          close();
          toast('บันทึกภาพแล้ว');
          app.refresh();
        } catch (err) {
          submit.disabled = false;
          handleError(err);
        }
      };
    },
  });
}

export function render(root, app) {
  const photos = [...repo.list('photos')].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  picked = picked.filter((id) => photos.some((p) => p.id === id));
  if (picked.length < 2 && photos.length >= 2) picked = [photos[0].id, photos[photos.length - 1].id];
  const [a, b] = picked.map((id) => photos.find((p) => p.id === id));
  const caption = (p) => `${fmtShort(p.date)} · ${POSES[p.pose] || ''}${p.kg != null ? ` · ${n1(p.kg)} กก.` : ''}`;

  let compare = '';
  if (a && b) {
    const delta = a.kg != null && b.kg != null ? b.kg - a.kg : null;
    compare = `
      <section class="card">
        <div class="card-head">
          <h2>เปรียบเทียบ</h2>
          <div class="seg" role="group" aria-label="รูปแบบการแสดง">
            <button data-mode="side" class="${mode === 'side' ? 'active' : ''}">เคียงกัน</button>
            <button data-mode="slider" class="${mode === 'slider' ? 'active' : ''}">เลื่อนเทียบ</button>
          </div>
        </div>
        ${
          mode === 'side'
            ? `<div class="compare">
                <figure><img src="${a.image}" alt="ภาพก่อน"><figcaption>ก่อน — ${esc(caption(a))}</figcaption></figure>
                <figure><img src="${b.image}" alt="ภาพหลัง"><figcaption>หลัง — ${esc(caption(b))}</figcaption></figure>
              </div>`
            : `<div class="slider" id="slider">
                <img src="${a.image}" alt="ภาพก่อน">
                <img class="after-img" src="${b.image}" alt="ภาพหลัง">
                <span class="handle"></span>
                <span class="lbl lbl-l">ก่อน ${esc(fmtShort(a.date))}</span><span class="lbl lbl-r">หลัง ${esc(fmtShort(b.date))}</span>
                <input type="range" min="0" max="100" value="50" aria-label="เลื่อนเพื่อเทียบภาพ">
              </div>`
        }
        <p class="small" style="margin-top:10px">${delta == null ? 'ไม่ได้บันทึกน้ำหนักครบทั้งสองภาพ' : `น้ำหนักต่างกัน <b>${delta > 0 ? '+' : delta < 0 ? '−' : ''}${n1(Math.abs(delta))} กก.</b>`}${a.note ? ` · ก่อน: ${esc(a.note)}` : ''}${b.note ? ` · หลัง: ${esc(b.note)}` : ''}</p>
        <p class="hint">เป็นการเทียบด้วยสายตาประกอบกับน้ำหนักและรอบเอวที่บันทึกไว้ แอปไม่คำนวณเปอร์เซ็นต์ไขมันจากภาพ เพราะทำให้แม่นยำไม่ได้</p>
      </section>`;
  }

  root.innerHTML = `
    <div class="page-head">
      <div><h1>ภาพเปรียบเทียบรูปร่าง</h1><p>${photos.length} ภาพ</p></div>
      <button class="btn btn-primary" data-act="add">${icon('plus')}เพิ่มภาพ</button>
    </div>
    <div class="notice notice-info"><b>ความเป็นส่วนตัว:</b> ภาพถูกเก็บในฐานข้อมูลของเบราว์เซอร์บนอุปกรณ์นี้เท่านั้น ไม่ถูกอัปโหลดไปที่ใด และไม่ถูกส่งให้ AI ภาพจะออกไปนอกอุปกรณ์เฉพาะเมื่อคุณสั่งสำรองข้อมูลแบบรวมภาพเอง</div>
    ${compare}
    <section class="card">
      <div class="card-head"><h2>ภาพทั้งหมด</h2>${photos.length >= 2 ? '<span class="muted">แตะเพื่อเลือก 2 ภาพ</span>' : ''}</div>
      ${
        photos.length
          ? `<div class="photo-grid">${photos
              .map((p) => {
                const i = picked.indexOf(p.id);
                return `<button class="photo-thumb${i >= 0 ? ' sel' : ''}" data-photo="${p.id}" aria-pressed="${i >= 0}">
                  <img src="${p.image}" alt="ภาพวันที่ ${esc(fmtShort(p.date))}" loading="lazy">
                  ${i >= 0 ? `<span class="pick">${i === 0 ? 'ก่อน' : 'หลัง'}</span>` : ''}
                  <span class="tag">${esc(caption(p))}</span>
                </button>`;
              })
              .join('')}</div>
              <div class="btn-row start" style="margin-top:12px">${picked.map((id, i) => `<button class="btn btn-outline btn-sm" data-act="edit" data-id="${id}">${icon('edit')}แก้ไขภาพ${i === 0 ? 'ก่อน' : 'หลัง'}</button>`).join('')}${photos.length === 1 ? `<button class="btn btn-outline btn-sm" data-act="edit" data-id="${photos[0].id}">${icon('edit')}แก้ไข/ลบภาพ</button>` : ''}</div>`
          : emptyState('ยังไม่มีภาพ — เพิ่มภาพของคุณเอง เช่น ภาพก่อนเริ่มและภาพปัจจุบัน เพื่อเริ่มเปรียบเทียบ', '<button class="btn btn-primary btn-sm" data-act="add">เพิ่มภาพแรก</button>')
      }
    </section>`;

  const slider = root.querySelector('#slider');
  if (slider) {
    const input = slider.querySelector('input');
    input.oninput = () => slider.style.setProperty('--pos', `${input.value}%`);
  }

  root.onclick = (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) {
      mode = m.dataset.mode;
      return app.refresh();
    }
    const thumb = e.target.closest('[data-photo]');
    if (thumb) {
      const id = thumb.dataset.photo;
      if (picked.includes(id)) return;
      // Newest pick replaces the older of the two; keep them in date order.
      picked = [...picked.slice(-1), id].sort((x, y) => (photos.find((p) => p.id === x).date < photos.find((p) => p.id === y).date ? -1 : 1));
      return app.refresh();
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'add') openPhotoForm(app);
    else if (btn.dataset.act === 'edit') openPhotoForm(app, repo.get('photos', btn.dataset.id));
  };
}
