// A single list (or the Favorites virtual list): manage recipes, shop, rename.
import { store } from '../store.js';
import { h, setTopbar, toast, confirmDialog, promptDialog, modal } from '../ui.js';
import { navigate, back } from '../router.js';
import { recipeCard } from './recipes.js';

export async function listView(params, root) {
  const isFav = params.fav === true;
  const recipes = await store.allRecipes();
  const recipeById = new Map(recipes.map((r) => [r.id, r]));

  let list;
  if (isFav) {
    list = { id: '__fav', name: 'Favorites', recipeIds: recipes.filter((r) => r.favorite).map((r) => r.id) };
  } else {
    list = await store.getList(params.id);
    if (!list) { toast('List not found'); navigate('/lists'); return; }
  }

  setTopbar({
    title: list.name,
    back: true,
    action: isFav ? null : { label: '⋯', onClick: manage }
  });

  const items = (list.recipeIds || []).map((id) => recipeById.get(id)).filter(Boolean);
  root.innerHTML = '';

  root.append(
    h('button', {
      class: 'btn btn--primary btn--block',
      style: 'margin-bottom:14px',
      disabled: !items.length,
      onclick: () => navigate(`/shopping/${isFav ? 'fav' : list.id}`)
    }, '🛒  Shopping list from these recipes')
  );

  if (!isFav) {
    root.append(h('button', { class: 'btn btn--block', style: 'margin-bottom:16px', onclick: pickRecipes }, '+ Add recipes'));
  }

  if (!items.length) {
    root.append(h('div', { class: 'empty' }, [
      h('div', { class: 'empty__emoji' }, isFav ? '⭐' : '🍽️'),
      h('p', { class: 'muted' }, isFav ? 'Mark recipes as favorite to see them here.' : 'This list is empty.')
    ]));
  } else {
    root.append(h('div', { class: 'grid' }, items.map(recipeCard)));
  }

  async function pickRecipes() {
    const selected = new Set(list.recipeIds || []);
    const box = h('div', { class: 'list', style: 'max-height:55vh;overflow:auto' },
      recipes.map((r) => h('label', { class: 'shop-item' }, [
        h('input', {
          type: 'checkbox', checked: selected.has(r.id),
          onchange: (e) => e.target.checked ? selected.add(r.id) : selected.delete(r.id)
        }),
        h('span', { class: 'tile__emoji' }, r.emoji || '🍽️'),
        h('span', { class: 'grow' }, r.title)
      ]))
    );
    const ok = await modal({
      title: 'Add recipes',
      content: box,
      actions: [{ label: 'Cancel', value: false }, { label: 'Save', primary: true, value: true }]
    });
    if (!ok) return;
    list.recipeIds = [...selected];
    await store.saveList(list);
    toast('List updated');
    listView(params, root);
  }

  async function manage() {
    const action = await modal({
      title: list.name,
      content: h('p', { class: 'muted', style: 'margin:0' }, (list.recipeIds || []).length + ' recipes'),
      actions: [
        { label: 'Rename', value: 'rename' },
        { label: 'Delete list', danger: true, value: 'delete' },
        { label: 'Close', value: null }
      ]
    });
    if (action === 'rename') {
      const name = await promptDialog('Rename list', { value: list.name, label: 'List name' });
      if (name) { list.name = name; await store.saveList(list); toast('Renamed'); listView(params, root); }
    } else if (action === 'delete') {
      if (await confirmDialog(`Delete list “${list.name}”? Recipes are kept.`)) {
        await store.deleteList(list.id);
        toast('List deleted');
        back();
      }
    }
  }
}
