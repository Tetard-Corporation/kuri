// App entry: register routes, seed sample data, start router & service worker.
import { route, startRouter } from './router.js';
import { seedIfEmpty } from './store.js';
import { refreshBackupReminder } from './backup.js';
import { recipesView } from './views/recipes.js';
import { recipeView } from './views/recipe.js';
import { editView } from './views/edit.js';
import { cookView } from './views/cook.js';
import { listsView } from './views/lists.js';
import { listView } from './views/list.js';
import { shoppingView } from './views/shopping.js';
import { importView } from './views/importView.js';

route('/recipes', recipesView);
route('/recipe/new/edit', (_p, root) => editView({ id: 'new' }, root));
route('/recipe/:id/edit', editView);
route('/recipe/:id', recipeView);
route('/cook/:id', cookView);
route('/lists', listsView);
route('/favorites', (_p, root) => listView({ fav: true }, root));
route('/list/:id', listView);
route('/shopping', shoppingView);
route('/shopping/:source', shoppingView);
route('/import', importView);

document.getElementById('backBtn').addEventListener('click', () => history.back());

(async function init() {
  await seedIfEmpty();
  startRouter();
  refreshBackupReminder();
})();

// Re-check the backup reminder whenever the user navigates (e.g. after import).
window.addEventListener('hashchange', refreshBackupReminder);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW failed', e));
  });
}
