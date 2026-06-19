// Parsing helpers: ingredient lines, free-text recipes, shopping aggregation.

const UNICODE_FRACTIONS = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
};

const UNITS = {
  g: 'g', gram: 'g', grams: 'g', gr: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  mg: 'mg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp',
  cup: 'cup', cups: 'cup',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  pinch: 'pinch', pinches: 'pinch',
  clove: 'clove', cloves: 'clove',
  can: 'can', cans: 'can',
  slice: 'slice', slices: 'slice',
  piece: 'piece', pieces: 'piece',
  pkg: 'pkg', package: 'pkg', packages: 'pkg',
  handful: 'handful', stick: 'stick', sticks: 'stick',
  bunch: 'bunch', bunches: 'bunch', dash: 'dash',
  // Metric / French
  cl: 'cl',
  'c-à-s': 'tbsp', 'càs': 'tbsp', 'c.à.s': 'tbsp', cas: 'tbsp', 'càd': 'tbsp',
  'c-à-c': 'tsp', 'càc': 'tsp', 'c.à.c': 'tsp', cac: 'tsp',
  cuillère: 'tbsp', cuillères: 'tbsp', 'cuiller': 'tbsp',
  gousse: 'clove', gousses: 'clove',
  pincée: 'pinch', pincées: 'pinch',
  sachet: 'pkg', sachets: 'pkg',
  tranche: 'slice', tranches: 'slice',
  morceau: 'piece', morceaux: 'piece',
  boîte: 'can', boîtes: 'can', boite: 'can', boites: 'can',
  poignée: 'handful', botte: 'bunch'
};

function parseQtyToken(token) {
  if (!token) return null;
  // Unicode fraction possibly attached: "1½"
  let total = 0;
  let matched = false;
  const unicodeMatch = token.match(/^(\d+)?([½⅓⅔¼¾⅕⅖⅗⅘⅙⅛⅜⅝⅞])$/);
  if (unicodeMatch) {
    if (unicodeMatch[1]) total += parseInt(unicodeMatch[1], 10);
    total += UNICODE_FRACTIONS[unicodeMatch[2]];
    return total;
  }
  if (UNICODE_FRACTIONS[token] !== undefined) return UNICODE_FRACTIONS[token];
  if (/^\d+\/\d+$/.test(token)) {
    const [a, b] = token.split('/').map(Number);
    return b ? a / b : null;
  }
  if (/^\d+([.,]\d+)?$/.test(token)) return parseFloat(token.replace(',', '.'));
  return matched ? total : null;
}

// Parse a single ingredient line into { raw, qty, unit, name }.
export function parseIngredient(raw) {
  const line = String(raw).trim()
    // Split a quantity glued to its unit: "700gr" -> "700 gr", "30cl" -> "30 cl".
    .replace(/(\d)(gr|g|kg|mg|ml|cl|l|oz|lb|tbsp|tsp)\b/gi, '$1 $2')
    .replace(/\s+/g, ' ');
  if (!line) return null;
  const tokens = line.split(' ');
  let qty = null;
  let i = 0;

  // Accumulate leading quantity tokens like "1 1/2" or "1½" or "2-3".
  const first = tokens[0];
  const rangeMatch = first && first.match(/^(\d+(?:[.,]\d+)?)[-–](\d+(?:[.,]\d+)?)$/);
  if (rangeMatch) {
    qty = parseFloat(rangeMatch[2].replace(',', '.')); // use upper bound for shopping
    i = 1;
  } else {
    const q0 = parseQtyToken(first);
    if (q0 !== null) {
      qty = q0;
      i = 1;
      // possible mixed number "1 1/2"
      const q1 = tokens[1] ? parseQtyToken(tokens[1]) : null;
      if (q1 !== null && q1 < 1 && Number.isInteger(qty)) {
        qty += q1;
        i = 2;
      }
    }
  }

  let unit = null;
  if (tokens[i]) {
    const cleaned = tokens[i].toLowerCase().replace(/\.$/, '');
    if (UNITS[cleaned]) {
      unit = UNITS[cleaned];
      i += 1;
    }
  }

  let name = tokens.slice(i).join(' ').trim();
  // Strip a leading "of" / French "de, d', du, des" (d' may attach to the word).
  name = name.replace(/^d['’]\s*/i, '').replace(/^(of|de|du|des)\s+/i, '');
  if (!name) name = line; // fallback: whole line is the name

  return { raw: line, qty, unit, name };
}

export function parseIngredientList(text) {
  return String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-*•·–]\s*/, ''))
    .map(parseIngredient)
    .filter(Boolean);
}

export function ingredientToString(ing) {
  const parts = [];
  if (ing.qty != null) parts.push(formatQty(ing.qty));
  if (ing.unit) parts.push(ing.unit);
  parts.push(ing.name);
  return parts.join(' ');
}

export function formatQty(n) {
  if (n == null) return '';
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  // Nice fractions for common values
  const frac = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔' };
  const whole = Math.floor(rounded);
  const rem = Math.round((rounded - whole) * 100) / 100;
  const key = Object.keys(frac).find((k) => Math.abs(Number(k) - rem) < 0.02);
  if (key) return (whole ? whole : '') + frac[key];
  return String(rounded);
}

// Heuristic parser for pasted / OCR'd recipe text -> {title, ingredients[], steps[]}
export function parseRecipeText(text) {
  const lines = String(text).split('\n').map((l) => l.replace(/\s+$/, ''));
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  const title = nonEmpty[0] || 'Untitled recipe';

  // Section headers (English + French).
  const ingHeader = /^(ingredients?|shopping list|you will need|what you need|ingr[ée]dients?|pour la (recette|sauce|garniture|p[âa]te))\b/i;
  const stepHeader = /^(instructions?|directions?|method|steps?|preparation|how to|to make|pr[ée]paration|r[ée]alisation|[ée]tapes?|recette|montage)\b/i;

  let mode = 'pre';
  const ingredients = [];
  const steps = [];
  const cleanStep = (l) => l.replace(/^(\d+[.)]\s*|[-*•·–]\s*)/, '').trim();
  const cleanIng = (l) => l.replace(/^[-*•·–]\s*/, '').trim();

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;
    if (ingHeader.test(line)) { mode = 'ing'; continue; }
    if (stepHeader.test(line)) { mode = 'step'; continue; }

    if (mode === 'ing') ingredients.push(cleanIng(line));
    else if (mode === 'step') steps.push(cleanStep(line));
  }

  // No headers found: guess by line shape, skipping obvious social-media noise.
  if (mode === 'pre' || (ingredients.length === 0 && steps.length === 0)) {
    for (let idx = 1; idx < nonEmpty.length; idx++) {
      const line = nonEmpty[idx];
      if (isNoise(line)) continue;
      if (looksLikeIngredient(line)) ingredients.push(cleanIng(line));
      else steps.push(cleanStep(line));
    }
  }

  return {
    title,
    ingredients: ingredients.map(parseIngredient).filter(Boolean),
    steps: steps.filter((s) => s.length > 1)
  };
}

function looksLikeIngredient(line) {
  if (line.length > 100) return false;
  if (/^\d/.test(line)) return true;                 // "2 oeufs", "700gr de courgettes"
  if (/[½⅓⅔¼¾]/.test(line)) return true;
  const words = line.toLowerCase().split(/\s+/);
  if (words.some((w) => UNITS[w.replace(/[.,]$/, '')])) return true;
  return false;
}

// Lines that are clearly captions/social chatter rather than recipe content.
function isNoise(line) {
  return /\b(like[rz]?|abonne|partage|comment(aire)?s?|lien en bio|recipe in comments|recette en commentaire|follow|swipe|#\w+|@\w+)\b/i
    .test(line) || /^#\w/.test(line) || /^@\w/.test(line);
}

// Aggregate ingredients across recipes into a merged shopping list.
export function aggregateShopping(entries) {
  // entries: [{ ing, recipeTitle }]
  const groups = new Map(); // key: normalizedName -> { name, units: Map(unit-> qty), noQty: count, raw:[], recipes:Set }
  for (const { ing, recipeTitle } of entries) {
    const key = normalizeName(ing.name);
    if (!groups.has(key)) {
      groups.set(key, { name: ing.name, units: new Map(), plain: [], recipes: new Set() });
    }
    const g = groups.get(key);
    g.recipes.add(recipeTitle);
    if (ing.qty != null) {
      const u = ing.unit || '';
      g.units.set(u, (g.units.get(u) || 0) + ing.qty);
    } else {
      g.plain.push(ing.raw);
    }
  }

  const items = [];
  for (const g of groups.values()) {
    const qtyParts = [];
    for (const [unit, total] of g.units.entries()) {
      qtyParts.push((formatQty(total) + (unit ? ' ' + unit : '')).trim());
    }
    items.push({
      name: g.name,
      qty: qtyParts.join(' + '),
      recipes: [...g.recipes],
      category: categorize(g.name)
    });
  }
  items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return items;
}

function normalizeName(name) {
  return name.toLowerCase().trim()
    .replace(/[.,()]/g, '')
    .replace(/\b(fresh|chopped|sliced|diced|minced|ground|large|small|medium|to taste|finely|roughly)\b/g, '')
    .replace(/s\b/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CATEGORIES = [
  { name: 'Produce', words: ['onion', 'garlic', 'tomato', 'pepper', 'carrot', 'potato', 'lettuce', 'spinach', 'lemon', 'lime', 'apple', 'banana', 'herb', 'basil', 'cilantro', 'parsley', 'ginger', 'mushroom', 'celery', 'cucumber', 'avocado', 'leek', 'chili', 'cabbage', 'broccoli', 'zucchini', 'corn'] },
  { name: 'Meat & Fish', words: ['chicken', 'beef', 'pork', 'lamb', 'fish', 'salmon', 'shrimp', 'bacon', 'sausage', 'turkey', 'tuna', 'ham', 'mince'] },
  { name: 'Dairy & Eggs', words: ['milk', 'butter', 'cheese', 'cream', 'yogurt', 'egg', 'parmesan', 'mozzarella', 'feta'] },
  { name: 'Pantry', words: ['flour', 'sugar', 'salt', 'oil', 'rice', 'pasta', 'bean', 'lentil', 'stock', 'broth', 'vinegar', 'sauce', 'spice', 'pepper', 'baking', 'yeast', 'honey', 'oat', 'bread', 'noodle', 'can', 'tomato paste'] },
  { name: 'Other', words: [] }
];

function categorize(name) {
  const n = name.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.words.some((w) => n.includes(w))) return cat.name;
  }
  return 'Other';
}
