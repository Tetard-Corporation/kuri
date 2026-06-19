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

export async function seedIfEmpty() {
  const seeded = await store.getMeta('seeded');
  const existing = await db.getAll('recipes');
  if (seeded || existing.length) return;

  const samples = [
    {
      title: 'Spaghetti Aglio e Olio',
      emoji: '🍝',
      description: 'The classic 15-minute Italian pasta — pantry magic.',
      servings: 2,
      prepTime: '5 min',
      cookTime: '15 min',
      tags: ['pasta', 'vegetarian', 'quick'],
      ingredients: [
        '200 g spaghetti',
        '4 cloves garlic',
        '6 tbsp olive oil',
        '1 tsp chili flakes',
        '1 handful parsley',
        'salt to taste'
      ],
      steps: [
        'Boil the spaghetti in well-salted water until al dente.',
        'Meanwhile, gently fry thinly sliced garlic and chili flakes in olive oil until golden.',
        'Drain pasta, reserving a splash of cooking water.',
        'Toss pasta in the oil with a little pasta water until glossy.',
        'Finish with chopped parsley and serve immediately.'
      ]
    },
    {
      title: 'Fluffy Pancakes',
      emoji: '🥞',
      description: 'Soft, tall breakfast pancakes from one bowl.',
      servings: 4,
      prepTime: '10 min',
      cookTime: '15 min',
      tags: ['breakfast', 'sweet'],
      ingredients: [
        '2 cups flour',
        '2 tbsp sugar',
        '1 tbsp baking powder',
        '1/2 tsp salt',
        '2 eggs',
        '1.5 cups milk',
        '3 tbsp butter'
      ],
      steps: [
        'Whisk the dry ingredients together in a bowl.',
        'Add eggs, milk and melted butter; stir until just combined.',
        'Heat a non-stick pan over medium heat.',
        'Pour batter and cook until bubbles form, then flip.',
        'Serve warm with maple syrup.'
      ]
    },
    {
      title: 'Chickpea Coconut Curry',
      emoji: '🍛',
      description: 'Cozy, creamy vegan curry ready in half an hour.',
      servings: 3,
      prepTime: '10 min',
      cookTime: '20 min',
      tags: ['vegan', 'dinner', 'curry'],
      ingredients: [
        '1 onion',
        '3 cloves garlic',
        '1 tbsp ginger',
        '2 tbsp curry powder',
        '1 can chickpeas',
        '1 can coconut milk',
        '1 can chopped tomatoes',
        '2 cups spinach',
        '2 tbsp oil'
      ],
      steps: [
        'Soften diced onion in oil, then add garlic and ginger.',
        'Stir in curry powder and cook for a minute until fragrant.',
        'Add tomatoes, chickpeas and coconut milk; simmer 15 minutes.',
        'Stir through spinach until wilted.',
        'Season and serve over rice.'
      ]
    }
  ];

  const { parseIngredientList } = await import('./parse.js');
  for (const s of samples) {
    await store.saveRecipe({
      ...blankRecipe(),
      ...s,
      ingredients: parseIngredientList(s.ingredients.join('\n')),
      source: { type: 'sample' }
    });
  }
  await store.setMeta('seeded', true);
}
