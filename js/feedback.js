// Connector feedback: record edits/corrections and cancelled imports locally so
// the import parsers can be reviewed and improved. All data stays on-device and
// can be exported from the Import tab.
import { store } from './store.js';
import { ingredientToString } from './parse.js';

const IMPORT_TYPES = ['url', 'instagram', 'photo', 'text'];

export function recipeSnapshot(r) {
  return {
    title: r.title || '',
    ingredients: (r.ingredients || []).map((i) => ({
      section: i.section || '',
      text: ingredientToString(i)
    })),
    steps: (r.steps || []).slice()
  };
}

export function wasImported(r) {
  return !!(r && r.source && IMPORT_TYPES.includes(r.source.type));
}

// User dismissed an import preview — the parse was not good enough to keep.
export function logImportCancelled(parsed) {
  return store.addFeedback({
    type: 'import-cancelled',
    source: parsed.source || null,
    parsed: recipeSnapshot(parsed)
  });
}

// An imported recipe was saved as-is (baseline for measuring later corrections).
export function logImportSaved(recipe) {
  return store.addFeedback({
    type: 'import-saved',
    recipeId: recipe.id,
    source: recipe.source || null,
    imported: recipeSnapshot(recipe)
  });
}

// A recipe was edited; record before/after (plus the original import if any).
// `beforeSnap` is a snapshot (from recipeSnapshot); `after` is the saved recipe.
export function logRecipeEdit(beforeSnap, after) {
  const a = recipeSnapshot(after);
  if (JSON.stringify(beforeSnap) === JSON.stringify(a)) return Promise.resolve(null);
  return store.addFeedback({
    type: wasImported(after) ? 'import-corrected' : 'edit',
    recipeId: after.id || null,
    source: after.source || null,
    imported: after.imported || null,
    before: beforeSnap,
    after: a
  });
}
