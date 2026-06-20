// Data layer on top of IndexedDB: recipes, lists, and seeding.
import { db } from './db.js';

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const store = {
  // Recipes
  async allRecipes() {
    const list = await db.getAll('recipes');
    return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
  getRecipe: (id) => db.get('recipes', id),
  async saveRecipe(recipe) {
    const now = Date.now();
    if (!recipe.id) {
      recipe.id = uid();
      recipe.createdAt = now;
    }
    recipe.updatedAt = now;
    return db.put('recipes', recipe);
  },
  deleteRecipe: (id) => db.delete('recipes', id),

  // Lists (collections of recipe ids)
  async allLists() {
    const list = await db.getAll('lists');
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },
  getList: (id) => db.get('lists', id),
  async saveList(list) {
    if (!list.id) {
      list.id = uid();
      list.createdAt = Date.now();
    }
    if (!list.recipeIds) list.recipeIds = [];
    return db.put('lists', list);
  },
  deleteList: (id) => db.delete('lists', id),

  // Meta
  getMeta: (key) => db.get('meta', key),
  setMeta: (key, value) => db.put('meta', { key, value }),

  // Connector feedback (edits/corrections + cancelled imports) for improving parsers.
  async addFeedback(entry) {
    const record = { id: uid(), at: Date.now(), ...entry };
    return db.put('feedback', record);
  },
  async allFeedback() {
    const list = await db.getAll('feedback');
    return list.sort((a, b) => (b.at || 0) - (a.at || 0));
  },
  clearFeedback: () => db.clear('feedback'),

  async exportAll() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      recipes: await db.getAll('recipes'),
      lists: await db.getAll('lists')
    };
  },
  async importAll(data, { replace = false } = {}) {
    if (replace) {
      await db.clear('recipes');
      await db.clear('lists');
    }
    for (const r of data.recipes || []) await db.put('recipes', r);
    for (const l of data.lists || []) await db.put('lists', l);
  }
};

export function blankRecipe() {
  return {
    id: null,
    title: '',
    description: '',
    image: '',
    emoji: '🍽️',
    servings: 2,
    prepTime: '',
    cookTime: '',
    ingredients: [],
    steps: [],
    tags: [],
    favorite: false,
    source: null
  };
}

// Default recipes shipped with the app. Bump SEED_VERSION when this list changes.
const SEED_VERSION = 3;

const DEFAULT_RECIPES = [
  {
    title: 'Sauce bolognaise aux protéines de soja texturées',
    emoji: '🍝',
    description: 'Une bolognaise vegan et sans gluten, riche et parfaite à préparer en grande quantité.',
    servings: 4,
    prepTime: '30 min',
    cookTime: '50 min',
    tags: ['vegan', 'sans gluten', 'pâtes', 'batch cooking'],
    ingredients: [
      '# Pour les protéines de soja',
      '175 g protéines de soja texturées',
      '40 cl eau bouillante',
      '6 c-à-s sauce soja tamari',
      '# Pour la sauce',
      '250 g carottes',
      '80 g céleri branche',
      '150 g oignons',
      '2 gousses ail',
      "6 c-à-s huile d'olive",
      '20 cl vin rouge',
      '3 feuilles de laurier',
      '10 branches de thym',
      "1 c-à-s origan",
      '800 g tomates concassées en conserve',
      '70 g concentré de tomate',
      '5 c-à-s eau',
      '1 c-à-c sucre',
      '1 gousse ail',
      'sel, poivre'
    ],
    steps: [
      "Mettez les protéines de soja texturées dans un bol avec l'eau bouillante et la sauce soja, couvrez. Laissez gonfler au minimum 15 min en remuant de temps en temps.",
      'Pendant ce temps, épluchez les légumes (carottes, oignon, ail, céleri) et passez-les au mixeur pour obtenir de petits dés.',
      "Faites chauffer l'huile d'olive dans une grande poêle à feu moyen et faites revenir les légumes une dizaine de minutes.",
      "Ajoutez le vin rouge et laissez cuire 3-4 min jusqu'à évaporation.",
      'Ajoutez les herbes et faites revenir encore 2-3 min.',
      "Ajoutez les protéines de soja avec l'eau et la sauce soja restantes, et faites revenir jusqu'à absorption (environ 10 min).",
      "Ajoutez la sauce tomate, le concentré de tomate, l'eau, la gousse d'ail pressée et le sucre. Mélangez et laissez mijoter 30 min en remuant de temps en temps.",
      'Servez avec les pâtes de votre choix.'
    ],
    source: { type: 'url', url: 'https://freethepickle.fr/2020/02/02/sauce-bolognaise-aux-proteines-de-soja-texturees-vegan-sans-gluten/' }
  },
  {
    title: 'Scarpaccia',
    emoji: '🥒',
    description: 'La version simplifiée de Simon Auscher : une fine tarte salée aux courgettes et parmesan.',
    servings: 6,
    prepTime: '20 min',
    cookTime: '40 min',
    tags: ['italien', 'courgette', 'végétarien', 'four'],
    ingredients: [
      '700 g courgettes',
      '160 g farine',
      '2 oeufs',
      '100 g parmesan',
      "huile d'olive",
      '1 gousse ail',
      'sel, poivre'
    ],
    steps: [
      'Coupez les courgettes en rondelles très fines et salez-les. Attendez 15 minutes qu’elles dégorgent.',
      "Mélangez les oeufs, la farine et l'ail.",
      "Pressez les courgettes en gardant l'eau de végétation, puis ajoutez-les à la préparation et mélangez. La pâte doit être épaisse mais malléable.",
      "Si besoin, ajoutez un peu d'eau de végétation pour la détendre.",
      'Huilez un moule de 30 cm de diamètre et râpez la moitié du parmesan dedans.',
      'Ajoutez les courgettes et étalez en couche très fine.',
      "Ajoutez à nouveau du parmesan et un filet d'huile d'olive.",
      'Enfournez 40 minutes à 200°C.'
    ],
    source: { type: 'url', url: 'https://www.instagram.com/simonauscher/reel/DZevuknMl6n/' }
  }
];

// Seed the bundled recipes on first run, refreshing when SEED_VERSION changes.
// Recipes are written by their stored id (db.put), so re-seeding overwrites the
// matching copy rather than duplicating it; the user's own recipes are kept.
export async function seedIfEmpty() {
  const current = (await store.getMeta('seedVersion'))?.value || 0;
  if (current >= SEED_VERSION) return;

  // The permanent collection lives in data/seed-recipes.json (recipes + lists).
  let seed = null;
  try {
    const res = await fetch(new URL('../data/seed-recipes.json', import.meta.url));
    if (res.ok) seed = await res.json();
  } catch { /* offline first load — fall back below */ }

  const existing = await db.getAll('recipes');

  if (seed && Array.isArray(seed.recipes) && seed.recipes.length) {
    const ids = new Set(seed.recipes.map((r) => r.id));
    // Drop previously shipped defaults that are no longer part of the set.
    for (const r of existing) {
      if ((r.seed === true || r.source?.type === 'sample') && !ids.has(r.id)) await store.deleteRecipe(r.id);
    }
    const now = Date.now();
    for (const r of seed.recipes) {
      await db.put('recipes', { ...blankRecipe(), ...r, seed: true, createdAt: r.createdAt || now, updatedAt: r.updatedAt || now });
    }
    for (const l of seed.lists || []) {
      if (l && l.id) await db.put('lists', l);
    }
    await store.setMeta('seedVersion', SEED_VERSION);
    return;
  }

  // Fallback (offline first load): seed minimal inline defaults and DON'T bump
  // the version, so the full collection is fetched on the next online load.
  if (!existing.length) {
    const { parseIngredientList } = await import('./parse.js');
    for (const r of DEFAULT_RECIPES) {
      await store.saveRecipe({ ...blankRecipe(), ...r, ingredients: parseIngredientList(r.ingredients.join('\n')), seed: true });
    }
  }
}
