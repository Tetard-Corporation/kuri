// Single recipe: scalable ingredients, steps, actions (cook, edit, list, delete).
import { store } from '../store.js';
import { h, setTopbar, toast, confirmDialog, modal, escapeHtml } from '../ui.js';
import { navigate, back } from '../router.js';
import { formatQty } from '../parse.js';
import { produceStatus, monthName } from '../seasonal.js';

// Small "out of season" marker for a fruit/vegetable ingredient, or null.
export function seasonMarker(name) {
  const st = produceStatus(name);
  if (!st || st.inSeason) return null;
  return h('span', { class: 'season-tag', title: `Hors saison en ${monthName(new Date().getMonth() + 1)}` }, '🍂 hors saison');
}

export async function recipeView({ id }, root) {
  const r = await store.getRecipe(id);
  if (!r) { toast('Recipe not found'); navigate('/recipes'); return; }

  setTopbar({
    title: r.title,
    back: true,
    action: { label: 'Edit', onClick: () => navigate(`/recipe/${r.id}/edit`) }
  });

  let servings = r.servings || 1;
  const baseServings = r.servings || 1;
  root.innerHTML = '';

  const hero = r.image
    ? h('div', { class: 'hero', style: `background-image:url("${String(r.image).replace(/"/g, '%22')}")` })
    : h('div', { class: 'hero' }, r.emoji || '🍽️');

  const ingSection = h('div', {});
  function renderIngredients() {
    const factor = servings / baseServings;
    ingSection.innerHTML = '';
    let current = null;
    let list = null;
    (r.ingredients || []).forEach((ing) => {
      const sec = ing.section || '';
      if (sec !== current || !list) {
        if (sec) ingSection.append(h('div', { class: 'ing-group' }, sec));
        list = h('ul', { class: 'ing-list' });
        ingSection.append(list);
        current = sec;
      }
      const qty = ing.qty != null ? formatQty(ing.qty * factor) : '';
      list.append(h('li', {}, [
        h('span', { class: 'ing-qty' }, [qty, ing.unit].filter(Boolean).join(' ')),
        h('span', { class: 'grow' }, ing.name),
        seasonMarker(ing.name)
      ]));
    });
  }
  renderIngredients();

  const servingsLabel = h('span', {}, servings + (servings > 1 ? ' servings' : ' serving'));
  const stepper = h('div', { class: 'stepper' }, [
    h('button', { onclick: () => { if (servings > 1) { servings--; update(); } } }, '−'),
    servingsLabel,
    h('button', { onclick: () => { servings++; update(); } }, '+')
  ]);
  function update() {
    servingsLabel.textContent = servings + (servings > 1 ? ' servings' : ' serving');
    renderIngredients();
  }

  root.append(
    hero,
    r.description && h('p', { class: 'muted', style: 'margin-top:0' }, r.description),
    h('div', { class: 'metaline' }, [
      r.prepTime && h('span', {}, '⏱️ Prep ' + r.prepTime),
      r.cookTime && h('span', {}, '🔥 Cook ' + r.cookTime),
      h('span', {}, '🍽️ ' + baseServings + ' base')
    ].filter(Boolean)),
    (r.tags || []).length && h('div', { class: 'chips', style: 'margin-bottom:14px' },
      r.tags.map((t) => h('span', { class: 'tag' }, '#' + t))),
    h('button', {
      class: 'btn btn--primary btn--block',
      style: 'margin-bottom:16px;font-size:1.05rem;padding:14px',
      onclick: () => navigate(`/cook/${r.id}`)
    }, '👨‍🍳  Start cooking'),

    h('div', { class: 'section' }, [
      h('div', { class: 'row row--between', style: 'margin-bottom:10px' }, [
        h('h2', { style: 'margin:0' }, 'Ingredients'),
        stepper
      ]),
      ingSection
    ]),

    h('div', { class: 'section' }, [
      h('h2', { style: 'margin-top:0' }, 'Instructions'),
      (r.steps || []).length
        ? h('ol', { class: 'steps' }, r.steps.map((s) => h('li', {}, s)))
        : h('p', { class: 'muted' }, 'No steps yet.')
    ]),

    h('div', { class: 'row wrap', style: 'gap:10px;margin-bottom:30px' }, [
      h('button', { class: 'btn btn--sm', onclick: () => toggleFav() },
        (r.favorite ? '⭐ Favorited' : '☆ Favorite')),
      h('button', { class: 'btn btn--sm', onclick: () => addToList() }, '📚 Add to list'),
      h('button', { class: 'btn btn--sm', onclick: () => shareRecipe() }, '🔗 Share'),
      h('button', { class: 'btn btn--sm btn--danger', onclick: () => del() }, '🗑 Delete')
    ])
  );

  async function toggleFav() {
    r.favorite = !r.favorite;
    await store.saveRecipe(r);
    toast(r.favorite ? 'Added to favorites' : 'Removed from favorites');
    recipeView({ id }, root);
  }

  async function del() {
    if (!(await confirmDialog(`Delete “${r.title}”? This cannot be undone.`))) return;
    await store.deleteRecipe(id);
    toast('Recipe deleted');
    back();
  }

  async function addToList() {
    const lists = await store.allLists();
    const root2 = h('div', {});
    if (!lists.length) {
      root2.append(h('p', { class: 'muted' }, 'No lists yet — create one below.'));
    }
    lists.forEach((l) => {
      const inIt = (l.recipeIds || []).includes(r.id);
      root2.append(h('label', { class: 'shop-item' }, [
        h('input', {
          type: 'checkbox', checked: inIt,
          onchange: async (e) => {
            const set = new Set(l.recipeIds || []);
            e.target.checked ? set.add(r.id) : set.delete(r.id);
            l.recipeIds = [...set];
            await store.saveList(l);
            toast('Updated ' + l.name);
          }
        }),
        h('span', { class: 'grow' }, l.name),
        h('span', { class: 'muted' }, (l.recipeIds || []).length + '')
      ]));
    });
    const action = await modal({
      title: 'Add to list',
      content: root2,
      actions: [
        { label: 'New list…', value: 'new' },
        { label: 'Done', primary: true, value: null }
      ]
    });
    if (action === 'new') await createListWith(r.id);
  }

  async function createListWith(recipeId) {
    const { promptDialog } = await import('../ui.js');
    const name = await promptDialog('New list', { placeholder: 'e.g. This week', label: 'List name' });
    if (!name) return;
    await store.saveList({ name, recipeIds: [recipeId] });
    toast('List created');
  }

  async function shareRecipe() {
    const text = recipeToText(r);
    if (navigator.share) {
      try { await navigator.share({ title: r.title, text }); return; } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Recipe copied to clipboard');
    } catch {
      modal({ title: r.title, content: h('textarea', { rows: 12, value: text, readonly: true }), actions: [{ label: 'Close', value: null }] });
    }
  }
}

export function recipeToText(r) {
  const lines = [r.title, ''];
  if (r.description) lines.push(r.description, '');
  lines.push('Ingredients');
  (r.ingredients || []).forEach((i) =>
    lines.push('- ' + [i.qty != null ? formatQty(i.qty) : '', i.unit, i.name].filter(Boolean).join(' ')));
  lines.push('', 'Instructions');
  (r.steps || []).forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  return lines.join('\n');
}
