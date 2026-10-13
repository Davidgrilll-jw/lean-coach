// Small DOM utilities shared by all pages: escaping, number formatting,
// icons, toasts, modal sheets and confirmation dialogs.
import { ValidationError } from '../domain/validate.js';

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const n0 = (v) => (v == null || !Number.isFinite(v) ? '–' : Math.round(v).toLocaleString('en-US'));
export const n1 = (v) => (v == null || !Number.isFinite(v) ? '–' : (Math.round(v * 10) / 10).toFixed(1));
export const signed1 = (v) => (v == null || !Number.isFinite(v) ? '–' : `${v > 0.049 ? '+' : v < -0.049 ? '−' : ''}${n1(Math.abs(v))}`);

const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  food: '<path d="M7 3v8a2 2 0 0 0 4 0V3"/><path d="M9 11v10"/><path d="M17 3c-2 2-2 6 0 9v9"/>',
  scale: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9a5 5 0 0 1 8 0"/><path d="M12 9l1.5-2"/>',
  dumbbell: '<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  report: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export function toast(message, type = 'success') {
  // An open <dialog> sits in the top layer, so a toast has to live inside it to be visible.
  const dialogs = document.querySelectorAll('dialog[open]');
  let root = document.getElementById('toast-root');
  if (dialogs.length) {
    const host = dialogs[dialogs.length - 1];
    root = host.querySelector(':scope > .toast-root');
    if (!root) {
      root = document.createElement('div');
      root.className = 'toast-root';
      host.appendChild(root);
    }
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.classList.add('toast-out'), type === 'error' ? 4200 : 2200);
  setTimeout(() => el.remove(), type === 'error' ? 4600 : 2600);
}

/** Show validation problems as they are; log anything unexpected. */
export function handleError(err) {
  if (err instanceof ValidationError) {
    toast(err.message, 'error');
  } else {
    console.error(err);
    toast(`เกิดข้อผิดพลาด: ${err?.message || 'ไม่ทราบสาเหตุ'}`, 'error');
  }
}

/** Read every named control of a form into a plain object. */
export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else if (el.type === 'checkbox') {
      out[el.name] = el.checked;
    } else {
      out[el.name] = el.value;
    }
  }
  return out;
}

/**
 * Open a modal sheet. `onMount(body, close)` wires up the content.
 * Returns { close }.
 */
export function openModal({ title, html, onMount, onClose, wide = false }) {
  const dlg = document.createElement('dialog');
  dlg.className = `sheet${wide ? ' sheet-wide' : ''}`;
  dlg.innerHTML = `
    <div class="sheet-head">
      <h2>${esc(title)}</h2>
      <button type="button" class="icon-btn" data-close aria-label="ปิด">${icon('x')}</button>
    </div>
    <div class="sheet-body">${html}</div>`;
  document.body.appendChild(dlg);
  // Clean up synchronously; the native "close" event (Esc key) arrives later and can be delayed.
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    dlg.remove();
    if (onClose) onClose();
  };
  const close = () => {
    if (dlg.open) dlg.close();
    finish();
  };
  dlg.addEventListener('close', finish);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) close();
  });
  dlg.showModal();
  if (onMount) onMount(dlg.querySelector('.sheet-body'), close);
  return { close, el: dlg };
}

export function confirmDialog({ title = 'ยืนยัน', message, confirmText = 'ยืนยัน', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    openModal({
      title,
      onClose: () => resolve(answer),
      html: `<p class="confirm-text">${esc(message)}</p>
        <div class="btn-row">
          <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmText)}</button>
        </div>`,
      onMount: (body, close) => {
        body.querySelector('[data-ok]').addEventListener('click', () => {
          answer = true;
          close();
        });
      },
    });
  });
}

/** Progress bar markup. `over` colours the bar when the value passes the goal. */
export function bar(value, goal, { over = false } = {}) {
  const pct = goal > 0 ? Math.min(100, Math.max(0, (value / goal) * 100)) : 0;
  const cls = over && value > goal * 1.05 ? ' bar-over' : '';
  return `<div class="bar${cls}" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct.toFixed(1)}%"></span></div>`;
}

export function emptyState(text, actionHtml = '') {
  return `<div class="empty"><p>${esc(text)}</p>${actionHtml}</div>`;
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
