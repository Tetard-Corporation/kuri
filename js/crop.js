// Lightweight crop modal: drag to draw a rectangle over the photo, then crop to
// it. Helps OCR by removing margins and non-text areas. Returns a data URL, the
// original src ("whole image"), or null (cancel).
import { h } from './ui.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function cropImage(src) {
  return new Promise((resolve) => {
    const root = document.getElementById('modalRoot');
    const img = h('img', { src, class: 'crop-img', draggable: false });
    const box = h('div', { class: 'crop-box hidden' });
    const stage = h('div', { class: 'crop-stage' }, [img, box]);

    let rect = null;
    let startX = 0;
    let startY = 0;
    let drawing = false;

    const at = (e) => {
      const r = stage.getBoundingClientRect();
      return { x: clamp(e.clientX - r.left, 0, r.width), y: clamp(e.clientY - r.top, 0, r.height) };
    };
    const update = () => {
      if (rect && rect.w > 6 && rect.h > 6) {
        box.classList.remove('hidden');
        box.style.cssText = `left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px`;
        useBtn.disabled = false;
      } else {
        box.classList.add('hidden');
        useBtn.disabled = true;
      }
    };

    stage.addEventListener('pointerdown', (e) => {
      drawing = true;
      try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const p = at(e);
      startX = p.x; startY = p.y;
      rect = { x: p.x, y: p.y, w: 0, h: 0 };
      update();
      e.preventDefault();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = at(e);
      rect = { x: Math.min(startX, p.x), y: Math.min(startY, p.y), w: Math.abs(p.x - startX), h: Math.abs(p.y - startY) };
      update();
    });
    const stop = () => { drawing = false; };
    stage.addEventListener('pointerup', stop);
    stage.addEventListener('pointercancel', stop);

    function doCrop() {
      const dispW = img.clientWidth;
      const dispH = img.clientHeight;
      if (!rect || !dispW || !dispH) return src;
      const sx = (img.naturalWidth || dispW) / dispW;
      const sy = (img.naturalHeight || dispH) / dispH;
      const cw = Math.max(1, Math.round(rect.w * sx));
      const ch = Math.max(1, Math.round(rect.h * sy));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      canvas.getContext('2d').drawImage(img, rect.x * sx, rect.y * sy, cw, ch, 0, 0, cw, ch);
      return canvas.toDataURL('image/jpeg', 0.9);
    }

    const finish = (val) => { root.innerHTML = ''; resolve(val); };
    const useBtn = h('button', { class: 'btn btn--primary', disabled: true, onclick: () => finish(doCrop()) }, 'Use selection');

    const back = h('div', { class: 'modal-back' }, [
      h('div', { class: 'modal' }, [
        h('h3', {}, 'Crop to the text'),
        h('p', { class: 'muted', style: 'margin:0 0 10px;font-size:0.82rem' }, 'Drag a box around just the recipe text.'),
        stage,
        h('div', { class: 'row', style: 'gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap' }, [
          h('button', { class: 'btn btn--ghost', onclick: () => finish(null) }, 'Cancel'),
          h('button', { class: 'btn', onclick: () => finish(src) }, 'Whole image'),
          useBtn
        ])
      ])
    ]);
    root.innerHTML = '';
    root.append(back);
  });
}
