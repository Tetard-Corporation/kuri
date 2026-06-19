// Shopping list: pick recipes, aggregate ingredients, check items off.
import { store } from '../store.js';
import { h, setTopbar, toast, modal, confirmDialog } from '../ui.js';
import { aggregateShopping } from '../parse.js';

export async function shoppingView(params, root) {
  const recipes = await store.allRecipes();
  const recipeById = new Map(recipes.map((r) => [r.id, r]));

  const meta = (await store.getMeta('shopping'))?.value || { recipeIds: [], checked: {} };
  meta.recipeIds = (meta.recipeIds || []).filter((id) => recipeById.has(id));
  meta.checked = meta.checked || {};

  // Coming from a list: replace the current selection.
  if (params.source) {
    let ids = [];
    if (params.source === 'fav') ids = recipes.filter((r) => r.favorite).map((r) => r.id);
    else {
      const l = await store.getList(params.source);
      ids = l ? (l.recipeIds || []) : [];
    }
    meta.recipeIds = ids;
    await save();
    history.replaceState(null, '', '#/shopping');
  }

  setTopbar({ title: 'Shopping', back: !!params.source });

  function save() { return store.setMeta('shopping', meta); }

  function render() {
    root.innerHTML = '';
    const selected = meta.recipeIds.map((id) => recipeById.get(id)).filter(Boolean);

    root.append(
      h('button', { class: 'btn btn--block', style: 'margin-bottom:12px', onclick: pickRecipes },
        selected.length ? `🍽️ ${selected.length} recipe${selected.length === 1 ? '' : 's'} selected — edit` : '+ Select recipes')
    );

    if (!selected.length) {
      root.append(h('div', { class: 'empty' }, [
        h('div', { class: 'empty__emoji' }, '🛒'),
        h('h3', {}, 'Your shopping list is empty'),
        h('p', { class: 'muted' }, 'Pick a few recipes and we’ll combine all their ingredients into one tidy list.')
      ]));
      return;
    }

    // selected recipe chips
    root.append(h('div', { class: 'chips', style: 'margin-bottom:14px' },
      selected.map((r) => h('span', { class: 'tag' }, (r.emoji || '') + ' ' + r.title))));

    const entries = [];
    selected.forEach((r) => {
      (r.ingredients || []).forEach((ing) => entries.push({ ing, recipeTitle: r.title }));
    });
    const items = aggregateShopping(entries);
    const remaining = items.filter((it) => !meta.checked[key(it)]).length;

    root.append(h('div', { class: 'row row--between', style: 'margin-bottom:6px' }, [
      h('span', { class: 'muted' }, `${remaining} of ${items.length} to buy`),
      h('div', { class: 'row', style: 'gap:8px' }, [
        h('button', { class: 'btn btn--sm', onclick: copyList }, '📋 Copy'),
        h('button', { class: 'btn btn--sm', onclick: clearChecked }, 'Reset')
      ])
    ]));

    let lastCat = null;
    const listEl = h('div', {});
    items.forEach((it) => {
      if (it.category !== lastCat) {
        listEl.append(h('div', { class: 'shop-cat' }, it.category));
        lastCat = it.category;
      }
      const k = key(it);
      const done = !!meta.checked[k];
      const row = h('label', { class: 'shop-item' + (done ? ' done' : '') }, [
        h('input', {
          type: 'checkbox', checked: done,
          onchange: async (e) => {
            if (e.target.checked) meta.checked[k] = true; else delete meta.checked[k];
            await save();
            row.classList.toggle('done', e.target.checked);
          }
        }),
        h('span', { class: 'grow' }, [
          it.qty && h('span', { class: 'shop-qty' }, it.qty + '  '),
          h('span', { class: 'shop-name' }, it.name)
        ].filter(Boolean))
      ]);
      listEl.append(row);
    });
    root.append(listEl);

    function copyList() {
      const text = items.map((it) => '☐ ' + [it.qty, it.name].filter(Boolean).join(' ')).join('\n');
      navigator.clipboard?.writeText(text).then(
        () => toast('Shopping list copied'),
        () => modal({ title: 'Shopping list', content: h('textarea', { rows: 12, readonly: true, value: text }), actions: [{ label: 'Close', value: null }] })
      );
    }

    async function clearChecked() {
      if (!Object.keys(meta.checked).length) { toast('Nothing checked'); return; }
      meta.checked = {};
      await save();
      render();
    }
  }

  async function pickRecipes() {
    const selected = new Set(meta.recipeIds);
    if (!recipes.length) { toast('Add some recipes first'); return; }
    const box = h('div', { class: 'list', style: 'max-height:55vh;overflow:auto' },
      recipes.map((r) => h('label', { class: 'shop-item' }, [
        h('input', {
          type: 'checkbox', checked: selected.has(r.id),
          onchange: (e) => e.target.checked ? selected.add(r.id) : selected.delete(r.id)
        }),
        h('span', { class: 'tile__emoji' }, r.emoji || '🍽️'),
        h('span', { class: 'grow' }, r.title),
        h('span', { class: 'muted' }, (r.ingredients || []).length + '')
      ]))
    );
    const ok = await modal({
      title: 'Select recipes',
      content: box,
      actions: [{ label: 'Cancel', value: false }, { label: 'Done', primary: true, value: true }]
    });
    if (!ok) return;
    meta.recipeIds = [...selected];
    await save();
    render();
  }

  function key(it) { return it.category + '|' + it.name.toLowerCase(); }

  render();
}
