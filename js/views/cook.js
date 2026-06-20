// Full-screen, step-by-step cooking mode with a screen wake lock.
import { store } from '../store.js';
import { h, toast } from '../ui.js';
import { navigate } from '../router.js';
import { formatQty } from '../parse.js';
import { seasonMarker } from './recipe.js';

let wakeLock = null;

export async function cookView({ id }, root) {
  const r = await store.getRecipe(id);
  if (!r) { toast('Recipe not found'); navigate('/recipes'); return; }
  const steps = r.steps && r.steps.length ? r.steps : ['No steps for this recipe.'];

  // Hide chrome while cooking.
  document.querySelector('.topbar').style.display = 'none';
  document.querySelector('.tabbar').style.display = 'none';

  let i = 0;
  root.innerHTML = '';

  const stepNum = h('div', { class: 'cook__step-num' });
  const stepText = h('div', { class: 'cook__step-text' });
  const progressBar = h('i');
  const ingsBox = h('div', { class: 'cook__ings section' });

  const prevBtn = h('button', { class: 'btn grow', onclick: () => go(i - 1) }, '‹ Back');
  const nextBtn = h('button', { class: 'btn btn--primary grow', onclick: () => go(i + 1) }, 'Next ›');

  const overlay = h('div', { class: 'cook' }, [
    h('div', { class: 'cook__top' }, [
      h('button', { class: 'cook__close', onclick: exit }, '✕'),
      h('div', { class: 'cook__progress' }, [progressBar]),
      h('span', { class: 'muted', style: 'font-size:0.8rem;white-space:nowrap' }, r.title.slice(0, 20))
    ]),
    h('div', { class: 'cook__body' }, [stepNum, stepText, ingsBox]),
    h('div', { class: 'cook__nav' }, [prevBtn, nextBtn])
  ]);
  root.append(overlay);

  // Show ingredients only on the first step as a quick reference (grouped by section).
  ingsBox.append(h('h2', { style: 'margin-top:0;font-size:0.95rem' }, 'Ingredients'));
  {
    let current = null;
    let list = null;
    (r.ingredients || []).forEach((ing) => {
      const sec = ing.section || '';
      if (sec !== current || !list) {
        if (sec) ingsBox.append(h('div', { class: 'ing-group' }, sec));
        list = h('ul', { class: 'ing-list' });
        ingsBox.append(list);
        current = sec;
      }
      list.append(h('li', {}, [
        h('span', { class: 'ing-qty' }, [ing.qty != null ? formatQty(ing.qty) : '', ing.unit].filter(Boolean).join(' ')),
        h('span', { class: 'grow' }, ing.name),
        seasonMarker(ing.name)
      ]));
    });
  }

  function render() {
    stepNum.textContent = `Step ${i + 1} of ${steps.length}`;
    stepText.textContent = steps[i];
    progressBar.style.width = ((i + 1) / steps.length * 100) + '%';
    ingsBox.style.display = i === 0 ? '' : 'none';
    prevBtn.disabled = i === 0;
    prevBtn.style.visibility = i === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = i === steps.length - 1 ? '✓ Finish' : 'Next ›';
  }

  function go(n) {
    if (n < 0) return;
    if (n >= steps.length) { exit(); toast('Bon appétit! 🍽️'); return; }
    i = n;
    render();
  }

  function keyHandler(e) {
    if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
    else if (e.key === 'Escape') exit();
  }
  document.addEventListener('keydown', keyHandler);

  function exit() {
    document.removeEventListener('keydown', keyHandler);
    releaseWakeLock();
    document.querySelector('.topbar').style.display = '';
    document.querySelector('.tabbar').style.display = '';
    navigate(`/recipe/${r.id}`);
  }

  requestWakeLock();
  render();
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* unsupported or denied */ }
}
function releaseWakeLock() {
  try { wakeLock && wakeLock.release(); } catch { /* ignore */ }
  wakeLock = null;
}
