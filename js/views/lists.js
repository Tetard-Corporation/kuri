// Collections of recipes ("This week", "Desserts", …).
import { store } from '../store.js';
import { h, setTopbar, toast, promptDialog } from '../ui.js';
import { navigate } from '../router.js';

export async function listsView(_params, root) {
  setTopbar({ title: 'Lists', action: { label: '+ New', onClick: createList } });

  const [lists, recipes] = await Promise.all([store.allLists(), store.allRecipes()]);
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  root.innerHTML = '';

  // Favorites virtual list
  const favs = recipes.filter((r) => r.favorite);
  const tiles = [];
  tiles.push(h('a', { href: '#/favorites', class: 'tile' }, [
    h('span', { class: 'tile__emoji' }, '⭐'),
    h('div', { class: 'grow' }, [
      h('div', { class: 'tile__title' }, 'Favorites'),
      h('div', { class: 'tile__sub' }, favs.length + ' recipe' + (favs.length === 1 ? '' : 's'))
    ]),
    h('span', { class: 'muted' }, '›')
  ]));

  if (!lists.length) {
    tiles.push(h('div', { class: 'empty', style: 'padding:30px 10px' }, [
      h('div', { class: 'empty__emoji' }, '📚'),
      h('p', { class: 'muted' }, 'Create lists to group recipes for the week, a dinner party, or by theme.'),
      h('button', { class: 'btn btn--primary', onclick: createList }, '+ New list')
    ]));
  }

  lists.forEach((l) => {
    const emojis = (l.recipeIds || []).map((id) => recipeById.get(id)).filter(Boolean).slice(0, 3)
      .map((r) => r.emoji || '🍽️').join('');
    tiles.push(h('a', { href: `#/list/${l.id}`, class: 'tile' }, [
      h('span', { class: 'tile__emoji' }, emojis || '📋'),
      h('div', { class: 'grow' }, [
        h('div', { class: 'tile__title' }, l.name),
        h('div', { class: 'tile__sub' }, (l.recipeIds || []).length + ' recipe' + ((l.recipeIds || []).length === 1 ? '' : 's'))
      ]),
      h('span', { class: 'muted' }, '›')
    ]));
  });

  root.append(h('div', { class: 'list' }, tiles));

  async function createList() {
    const name = await promptDialog('New list', { placeholder: 'e.g. This week', label: 'List name' });
    if (!name) return;
    const l = await store.saveList({ name, recipeIds: [] });
    toast('List created');
    navigate(`/list/${l.id}`);
  }
}
