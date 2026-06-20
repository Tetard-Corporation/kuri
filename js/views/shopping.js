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
        h('button', { class: 'btn btn--sm', onclick: () => sendToReminders(items) }, '🍎 Reminders'),
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

    // Items still to buy (or all of them if nothing is checked yet), one per line.
    function remindersLines() {
      const pending = items.filter((it) => !meta.checked[key(it)]);
      const use = pending.length ? pending : items;
      return use.map((it) => [it.qty, it.name].filter(Boolean).join(' '));
    }

    function sendToReminders() {
      const lines = remindersLines();
      if (!lines.length) { toast('Nothing to add'); return; }
      const text = lines.join('\n');
      // Hand the list to a one-time "Kuri Shopping" Shortcut that adds each
      // line to Apple Reminders. This is the only reliable itemized path on iOS.
      const scURL = 'shortcuts://run-shortcut?name=' + encodeURIComponent('Kuri Shopping') +
        '&input=text&text=' + encodeURIComponent(text);

      const steps = h('ol', { style: 'margin:8px 0 0;padding-left:18px;font-size:0.85rem;line-height:1.5' }, [
        h('li', {}, 'Open the Shortcuts app and tap + to create a new shortcut.'),
        h('li', {}, [h('span', {}, 'Rename it exactly '), h('strong', {}, 'Kuri Shopping'), h('span', {}, '.')]),
        h('li', {}, [h('strong', {}, 'Split Text'), h('span', {}, ' → input “Shortcut Input”, separator “New Lines”.')]),
        h('li', {}, [h('strong', {}, 'Repeat with Each'), h('span', {}, ' (Split Text).')]),
        h('li', {}, [h('span', {}, 'Inside the repeat: '), h('strong', {}, 'Add New Reminder'), h('span', {}, ' with title “Repeat Item”, in your chosen list.')]),
        h('li', {}, 'Tap Done, come back here, and tap “Add to Reminders”.')
      ]);

      const content = h('div', {}, [
        h('p', { style: 'margin:0 0 12px;font-size:0.9rem' },
          `${lines.length} item${lines.length === 1 ? '' : 's'} will be added to Apple Reminders via the Shortcuts app.`),
        h('a', { href: scURL, class: 'btn btn--primary btn--block', style: 'margin-bottom:8px' }, '🍎 Add to Reminders'),
        navigator.share && h('button', {
          class: 'btn btn--block', style: 'margin-bottom:8px',
          onclick: () => { navigator.share({ title: 'Shopping list', text }).catch(() => {}); }
        }, '🔗 Share instead…'),
        h('button', {
          class: 'btn btn--block',
          onclick: () => navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => {})
        }, '📋 Copy list'),
        h('details', { style: 'margin-top:14px' }, [
          h('summary', { style: 'cursor:pointer;color:var(--muted);font-size:0.85rem' }, 'First time? Set up the shortcut'),
          h('a', { href: './shortcuts/Kuri%20Shopping.shortcut', class: 'btn btn--block', style: 'margin:10px 0 6px' }, '📲 Get the ready-made shortcut'),
          h('p', { class: 'muted', style: 'font-size:0.8rem;margin:0 0 4px' },
            'Opens in the Shortcuts app and must be named exactly “Kuri Shopping”. As it is unsigned, enable Settings → Shortcuts → Allow Untrusted Shortcuts first.'),
          h('p', { class: 'muted', style: 'font-size:0.8rem;margin:8px 0 0' }, 'Or build it manually:'),
          steps
        ])
      ].filter(Boolean));

      modal({ title: 'Add to Apple Reminders', content, actions: [{ label: 'Close', value: null }] });
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
