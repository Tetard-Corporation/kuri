// Build recipe ideas by reusing and mixing preparations from the user's own
// recipes. Given selected ingredients, find recipes that use them, extract their
// technique, and assemble a new starting recipe ("mashup").
import { ingredientToString, parseIngredientList } from './parse.js';

// Technique lexicon (French + English) searched across a recipe's title + steps.
const TECHNIQUES = [
  { label: 'au four', re: /four|enfourn|rôti|roti|roast|bake|gratin/i },
  { label: 'poêlé', re: /po[eê]l|saisi|pan.?fry|saut/i },
  { label: 'grillé', re: /gril|grill|barbecue|plancha/i },
  { label: 'mijoté', re: /mijot|simmer|brais|rago[uû]t|compot/i },
  { label: 'à la vapeur', re: /vapeur|steam/i },
  { label: 'en velouté', re: /velout|soupe|potage|soup/i },
  { label: 'frit', re: /frire|frit|friture|deep.?fry|beign/i },
  { label: 'en salade', re: /salade|crudit|salad|carpaccio|cru\b/i },
  { label: 'en purée', re: /pur[eé]e|[eé]cras|mash/i },
  { label: 'en tarte', re: /tarte|quiche|scarpaccia|tart|\bpie\b/i },
  { label: 'mariné', re: /marin|pickle|saumure/i },
  { label: 'au curry', re: /curry|curr[yi]/i },
  { label: 'en risotto', re: /risotto/i }
];

export function extractTechnique(recipe) {
  const hay = [recipe.title || '', ...(recipe.steps || [])].join(' ').toLowerCase();
  const hit = TECHNIQUES.find((t) => t.re.test(hay));
  return hit ? hit.label : 'à votre façon';
}

const rand = (a) => a[Math.floor(Math.random() * a.length)];

function ingredientNames(recipe) {
  return (recipe.ingredients || []).map((i) => (i.name || '').toLowerCase());
}

// Score how many of the selected ingredients a recipe contains.
function scoreRecipe(recipe, selected) {
  const names = ingredientNames(recipe);
  return selected.reduce((n, sel) => n + (names.some((nm) => nm.includes(sel.toLowerCase())) ? 1 : 0), 0);
}

// Distinctive companion ingredients from a recipe (excluding the selected ones).
function signatureIngredients(recipe, selected, max = 2) {
  const sel = selected.map((s) => s.toLowerCase());
  return (recipe.ingredients || [])
    .map((i) => i.name)
    .filter((nm) => nm && !sel.some((s) => nm.toLowerCase().includes(s)))
    .filter((nm) => nm.split(/\s+/).length <= 2)
    .slice(0, 8);
}

// Build an idea from the user's library, or null if nothing matches.
export function buildLibraryIdea(selected, recipes) {
  if (!selected.length || !recipes.length) return null;
  const matches = recipes
    .map((r) => ({ r, score: scoreRecipe(r, selected) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!matches.length) return null;

  // Primary preparation: a (randomised) top match. Mix-in: a different recipe.
  const top = matches.slice(0, Math.min(3, matches.length));
  const a = rand(top).r;
  const others = matches.map((m) => m.r).filter((r) => r !== a);
  const b = others.length ? rand(others.slice(0, Math.min(3, others.length))) : null;

  const prep = extractTechnique(a);
  const sigA = signatureIngredients(a, selected);
  const sigB = b ? signatureIngredients(b, selected) : [];
  const companions = [...sample(sigA, 1), ...sample(sigB, 1)].filter(Boolean);

  return {
    fromLibrary: true,
    ingredient: selected[0],
    type: 'veg',
    prep,
    companions,
    sources: [a, b].filter(Boolean)
  };
}

function sample(arr, n) {
  const c = [...arr];
  const out = [];
  while (c.length && out.length < n) out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
  return out;
}

// Turn a library idea into a starting recipe that reuses the source preparations.
export function buildMashupDraft(idea) {
  const sources = idea.sources || [];
  const a = sources[0];
  const b = sources[1];
  const ing = idea.ingredient;
  const title = `${capitalize(ing)} ${idea.prep}`.trim();

  // Ingredients: the picked ingredient, then each source's list under its name.
  const lines = ['# ' + capitalize(ing), ing];
  for (const s of sources) {
    lines.push('# ' + (s.title || 'Recipe'));
    (s.ingredients || []).forEach((i) => lines.push(ingredientToString(i)));
  }

  // Steps: reuse the primary preparation, then append the mix-in recipe's steps.
  let steps = [...(a?.steps || [])];
  if (b && b.steps && b.steps.length) {
    steps = [...steps, `— ${b.title} —`, ...b.steps];
  }

  const credit = sources.map((s) => s.title).join(' + ');
  return {
    title,
    emoji: a?.emoji || '🍽️',
    tags: [ing, 'idée'],
    description: credit ? `Idea: ${ing} ${idea.prep}, remixed from ${credit}.` : `Idea: ${ing} ${idea.prep}.`,
    ingredients: parseIngredientList(lines.join('\n')),
    steps
  };
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
