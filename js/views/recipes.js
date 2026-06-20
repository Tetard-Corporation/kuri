// Recipe library: search, filter by tag, grid of cards.
import { store } from '../store.js';
import { h, setTopbar } from '../ui.js';
import { navigate } from '../router.js';

let filter = { q: '', tag: null, mode: 'all' };

export async function recipesView(_params, root) {
  setTopbar({
    title: 'Recipes',
    action: { label: '+ New', onClick: () => navigate('/recipe/new/edit') }
  });

  const recipes = await store.allRecipes();
  root.innerHTML = '';

  if (!recipes.length) {
    root.append(emptyState());
    return;
  }

  const tags = [...new Set(recipes.flatMap((r) => r.tags || []))].sort();

  const searchInput = h('input', {
    type: 'search',
    placeholder: filter.mode === 'ing' ? 'Ingredients you have, e.g. chicken, rice' : 'Search recipes & ingredients',
    value: filter.q,
    oninput: (e) => { filter.q = e.target.value; renderGrid(); }
  });
  const search = h('div', { class: 'searchbar' }, [searchInput]);

  // Toggle between general search and "what can I cook" ingredient search.
  const modeRow = h('div', { class: 'segmented', style: 'margin-bottom:10px' }, [
    segBtn('All', filter.mode === 'all', () => setMode('all')),
    segBtn('By ingredient', filter.mode === 'ing', () => setMode('ing'))
  ]);
  function setMode(m) {
    filter.mode = m;
    [...modeRow.children].forEach((c, i) => c.classList.toggle('active', i === (m === 'all' ? 0 : 1)));
    searchInput.placeholder = m === 'ing' ? 'Ingredients you have, e.g. chicken, rice' : 'Search recipes & ingredients';
    renderGrid();
  }

  const chipRow = h('div', { class: 'chips', style: 'margin-bottom:14px;overflow-x:auto' }, [
    chip('All', filter.tag === null, () => { filter.tag = null; refreshChips(); renderGrid(); }),
    ...tags.map((t) => chip('#' + t, filter.tag === t, () => {
      filter.tag = filter.tag === t ? null : t; refreshChips(); renderGrid();
    }))
  ]);

  const gridWrap = h('div', {});
  root.append(modeRow, search, chipRow, gridWrap);

  function refreshChips() {
    [...chipRow.children].forEach((c, i) => {
      const active = i === 0 ? filter.tag === null : filter.tag === tags[i - 1];
      c.classList.toggle('active', active);
    });
  }

  function renderGrid() {
    const q = filter.q.trim().toLowerCase();
    // Ingredient mode: comma/space separated terms, recipe must contain them all.
    const terms = filter.mode === 'ing'
      ? q.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean)
      : [];

    let matches = recipes.filter((r) => {
      if (filter.tag && !(r.tags || []).includes(filter.tag)) return false;
      if (filter.mode === 'ing') {
        if (!terms.length) return true;
        const names = (r.ingredients || []).map((i) => i.name.toLowerCase());
        return terms.every((t) => names.some((n) => n.includes(t)));
      }
      if (!q) return true;
      const hay = [r.title, r.description, ...(r.tags || []), ...(r.ingredients || []).map((i) => i.name)]
        .join(' ').toLowerCase();
      return hay.includes(q);
    });

    // In ingredient mode, surface the leanest recipes first (fewest extra items).
    if (filter.mode === 'ing' && terms.length) {
      matches = matches.slice().sort((a, b) => (a.ingredients || []).length - (b.ingredients || []).length);
    }

    gridWrap.innerHTML = '';
    if (!matches.length) {
      gridWrap.append(h('div', { class: 'empty' }, [
        h('div', { class: 'empty__emoji' }, '🔍'),
        h('p', { class: 'muted' }, filter.mode === 'ing'
          ? 'No recipes use all those ingredients.'
          : 'No recipes match your search.')
      ]));
      return;
    }
    gridWrap.append(h('div', { class: 'grid' }, matches.map(recipeCard)));
  }

  renderGrid();
}

export function recipeCard(r) {
  const img = r.image
    ? h('div', { class: 'card__img', style: `background-image:url("${cssUrl(r.image)}")` })
    : h('div', { class: 'card__img' }, r.emoji || '🍽️');
  return h('a', { href: `#/recipe/${r.id}`, class: 'card-wrap' }, [
    h('div', { class: 'card' }, [
      img,
      r.favorite && h('div', { class: 'card__fav' }, '⭐'),
      h('div', { class: 'card__body' }, [
        h('h3', { class: 'card__title' }, r.title || 'Untitled'),
        h('div', { class: 'card__meta' }, [
          (r.ingredients || []).length + ' ingredients',
          r.cookTime && '· ' + r.cookTime
        ].filter(Boolean))
      ])
    ])
  ]);
}

function segBtn(label, active, onClick) {
  return h('button', { class: 'seg' + (active ? ' active' : ''), onclick: onClick }, label);
}

function chip(label, active, onClick) {
  return h('button', { class: 'chip' + (active ? ' active' : ''), onclick: onClick }, label);
}

function cssUrl(u) { return String(u).replace(/"/g, '%22'); }

function emptyState() {
  return h('div', { class: 'empty' }, [
    h('div', { class: 'empty__emoji' }, '🍳'),
    h('h3', {}, 'No recipes yet'),
    h('p', { class: 'muted' }, 'Add your first recipe or import one from the web, a photo, or pasted text.'),
    h('div', { class: 'row', style: 'justify-content:center;gap:10px;margin-top:16px' }, [
      h('button', { class: 'btn btn--primary', onclick: () => navigate('/recipe/new/edit') }, '+ New recipe'),
      h('button', { class: 'btn', onclick: () => navigate('/import') }, '📥 Import')
    ])
  ]);
}
