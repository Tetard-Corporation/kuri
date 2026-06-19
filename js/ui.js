// Small UI helpers: DOM creation, escaping, toasts, modals, topbar config.

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

let toastTimer;
export function toast(message, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function setTopbar({ title, back = false, action = null }) {
  const titleEl = document.getElementById('topTitle');
  const backBtn = document.getElementById('backBtn');
  const actionBtn = document.getElementById('topAction');
  titleEl.textContent = title || 'Hostel';
  backBtn.hidden = !back;
  if (action) {
    actionBtn.hidden = false;
    actionBtn.textContent = action.label;
    actionBtn.onclick = action.onClick;
  } else {
    actionBtn.hidden = true;
    actionBtn.onclick = null;
  }
}

// Promise-based modal. content is a DOM node or HTML string.
export function modal({ title, content, actions }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modalRoot');
    const close = (val) => {
      root.innerHTML = '';
      resolve(val);
    };
    const body = typeof content === 'string'
      ? h('div', { html: content })
      : (content || h('div'));

    const btns = (actions || [{ label: 'Close', value: null }]).map((a) =>
      h('button', {
        class: 'btn ' + (a.primary ? 'btn--primary' : a.danger ? 'btn--danger' : 'btn--ghost'),
        onclick: () => {
          if (a.keepOpen) { a.onClick && a.onClick(); return; }
          close(a.onClick ? a.onClick() : a.value);
        }
      }, a.label)
    );

    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(null); } }, [
      h('div', { class: 'modal' }, [
        title && h('h3', {}, title),
        body,
        h('div', { class: 'row', style: 'gap:10px;margin-top:18px;justify-content:flex-end;flex-wrap:wrap' }, btns)
      ])
    ]);
    root.innerHTML = '';
    root.append(back);
  });
}

export function confirmDialog(message, { danger = true, confirmLabel = 'Delete' } = {}) {
  return modal({
    content: h('p', { style: 'margin:0' }, message),
    actions: [
      { label: 'Cancel', value: false },
      { label: confirmLabel, value: true, danger, primary: !danger }
    ]
  });
}

export function promptDialog(title, { value = '', placeholder = '', label = '' } = {}) {
  const input = h('input', { value, placeholder });
  setTimeout(() => input.focus(), 50);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.closest('.modal').querySelector('.btn--primary').click();
  });
  return modal({
    title,
    content: h('div', { class: 'field' }, [label && h('label', {}, label), input]),
    actions: [
      { label: 'Cancel', value: null },
      { label: 'OK', primary: true, onClick: () => input.value.trim() || null }
    ]
  });
}

// Read a File/Blob as a resized data URL to keep storage small.
export function fileToDataURL(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
