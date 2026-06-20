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
  // Multi-word French spoon units: "c. à soupe", "cuil. à café", "cuillères à soupe".
  if (tokens[i]) {
    const t0 = tokens[i].toLowerCase().replace(/\.$/, '');
    const t1 = (tokens[i + 1] || '').toLowerCase();
    const t2 = (tokens[i + 2] || '').toLowerCase().replace(/\.$/, '');
    if (/^(c|cuil|cuiller|cuillère|cuillere|cuillères|cuilleres|cuillerée|cuillerées)$/.test(t0) && /^[àa]$/.test(t1)) {
      if (/^(soupe|s)$/.test(t2)) { unit = 'tbsp'; i += 3; }
      else if (/^(café|cafe|c)$/.test(t2)) { unit = 'tsp'; i += 3; }
    }
  }
  if (unit === null && tokens[i]) {
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
  return linesToIngredients(String(text).split('\n'));
}

// Convert raw lines (ingredients possibly interleaved with sub-section headers
// like "Pour la sauce", "For the meat", "# Sauce") into ingredient objects,
// tagging each with the current `section`.
export function linesToIngredients(lines) {
  // First pass: clean lines, drop noise/headers, and merge wrapped continuation
  // lines into the previous ingredient (e.g. "…en morceaux" + "3 cm de côté").
  const cleaned = [];
  let section = '';
  for (const raw of lines) {
    const line = stripLead(String(raw).replace(/\*\*/g, ''));
    if (!line) continue;
    const header = sectionHeaderName(line);
    if (header) { section = header; continue; }
    if (isServingLine(line) || looksLikeJunk(line)) continue; // OCR noise / serving info
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.section === section && isContinuationLine(line)) {
      prev.text += ' ' + line;
    } else {
      cleaned.push({ section, text: line });
    }
  }
  return cleaned.map(({ section: s, text }) => {
    const ing = parseIngredient(text);
    if (s) ing.section = s;
    return ing;
  }).filter(Boolean);
}

function startsWithAmount(line) {
  return /^(?:\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅛⅜⅝⅞])\b/.test(line);
}

// A line that continues the previous ingredient rather than starting a new one.
// Conservative: only clear fragments, never standalone items like "sel"/"huile".
function isContinuationLine(line) {
  if (startsWithAmount(line)) {
    // A leading dimension ("3 cm de côté", "2 à 3 cm") is a continuation;
    // a leading food amount ("200 g …") starts a new ingredient.
    return /^\d+\s*(?:[à\-–]\s*\d+\s*)?(?:cm|mm|°)\b/i.test(line);
  }
  if (/^[([]/.test(line) && !startsWithAmount(line.replace(/^[([|\s]+/, ''))) return true; // "(facultatif)" but not "(| 2 tomates"
  if (/^(?:de|du|des|d['’]|et|ou|à|au|aux|en|avec|dans|sur|sans|and|or|of|with|to|in|plus)\b/i.test(line)) return true;
  if (/^[a-zàâäçéèêëîïôûùüœ]+(?:ment|ly)\b/i.test(line)) return true;                      // adverb: "grossièrement", "finely"
  return false;
}

// Strip leading bullets and stray OCR symbols/quotes from a line.
export function stripLead(line) {
  return String(line).replace(/^[\s>~»«°|•·*§"“”'’.,_\-–—]+/, '').trim();
}

// A line with no real word, or mostly symbols, is treated as OCR garbage.
export function looksLikeJunk(line) {
  const l = String(line).trim();
  if (!l) return true;
  const words = l.match(/\p{L}{3,}/gu) || [];
  if (!words.length) return true;
  const letters = (l.match(/\p{L}/gu) || []).length;
  const nonSpace = l.replace(/\s/g, '').length;
  return nonSpace > 0 && letters / nonSpace < 0.45;
}

// Recognise a "serves N" / "pour N personnes" line (not an ingredient).
export function isServingLine(line) {
  return /^(?:pour\s+\d{1,3}\s+(?:personnes?|pers\.?|convives?)|serves?\s+\d|(?:portions?|servings?)\s*:?\s*\d|\d{1,3}\s+(?:personnes?|portions?|servings?))\b/i.test(line);
}

// Pull a servings count out of OCR'd text, if present.
export function extractServings(text) {
  const m = String(text).match(/pour\s+(\d{1,3})\s+(?:personnes?|pers|convives?)|serves?\s+(\d{1,3})|(\d{1,3})\s+(?:personnes|portions|servings)/i);
  if (!m) return null;
  const n = parseInt(m[1] || m[2] || m[3], 10);
  return n > 0 && n < 100 ? n : null;
}

// Recognize a line that introduces an ingredient sub-group; returns its name or null.
export function sectionHeaderName(line) {
  const l = line.trim();
  if (!l) return null;
  let m = l.match(/^#{1,6}\s*(.+?)\s*$/);                                  // "## Sauce"
  if (m) return tidySection(m[1]);
  m = l.match(/^(?:pour|for)\s+(?:la|le|les|l['’]|the)\s+(.+?)\s*:?\s*$/i); // "Pour la sauce"
  if (m) return tidySection(m[1]);
  m = l.match(/^(.{2,40}?)\s*:\s*$/);                                       // "Sauce:" / "Marinade :"
  if (m && !/^\d/.test(l) && !/[½⅓⅔¼¾]/.test(l) && m[1].split(/\s+/).length <= 5) {
    return tidySection(m[1]);
  }
  return null;
}

function tidySection(s) {
  const cleaned = String(s).replace(/^(la|le|les|l['’]|the|du|de la|des)\s+/i, '').trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : '';
}

// Serialize grouped ingredients back to editable text, emitting "# Section" headers.
export function ingredientsToText(ingredients) {
  const lines = [];
  let current = null;
  for (const ing of ingredients || []) {
    const sec = ing.section || '';
    if (sec !== current) {
      if (sec) { if (lines.length) lines.push(''); lines.push('# ' + sec); }
      current = sec;
    }
    lines.push(ingredientToString(ing));
  }
  return lines.join('\n');
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

// Turn a block of instruction text (e.g. OCR'd from a photo) into clean steps.
export function splitInstructions(text) {
  let t = String(text).replace(/\r/g, '').trim();
  if (!t) return [];
  const clean = (s) => stripLead(s).replace(/\s+/g, ' ').trim();
  const keep = (s) => s.length > 1 && !looksLikeJunk(s);

  // 1) Explicit numbering / "Étape N" / "Step N".
  const numbered = t
    .split(/\n?\s*(?:\d{1,2}\s*[.)]|[ée]tape\s*\d+\s*[:.)-]?|step\s*\d+\s*[:.)-]?)\s+/i)
    .map(clean).filter(keep);
  if (numbered.length > 1) return numbered;

  // 2) Merge OCR line-wrapping: a line that continues the previous sentence.
  const lines = t.split('\n').map((l) => stripLead(l)).filter((l) => l && !looksLikeJunk(l));
  const merged = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    if (prev && !/[.!?:]$/.test(prev) && /^[a-zàâçéèêëîïôûùü(]/.test(line)) {
      merged[merged.length - 1] = prev + ' ' + line;
    } else {
      merged.push(line);
    }
  }
  if (merged.length > 1) return merged.map(clean).filter(keep);

  // 3) Single block: split on sentence boundaries.
  return t.split(/(?<=[.!?])\s+/).map(clean).filter(keep);
}

// Heuristic parser for pasted / OCR'd recipe text -> {title, ingredients[], steps[]}
export function parseRecipeText(text) {
  const lines = String(text).split('\n').map((l) => l.replace(/\s+$/, ''));
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  const title = nonEmpty[0] || 'Untitled recipe';

  // Main section headers (English + French).
  const ingHeader = /^(ingredients?|shopping list|you will need|what you need|ingr[ée]dients?)\b/i;
  const stepHeader = /^(instructions?|directions?|method|steps?|preparation|how to|to make|pr[ée]paration|r[ée]alisation|[ée]tapes?|recette|montage)\b/i;

  let mode = 'pre';
  const ingLines = []; // raw ingredient lines, including sub-group headers
  const steps = [];
  const cleanStep = (l) => l.replace(/^(\d+[.)]\s*|[-*•·–]\s*)/, '').trim();

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;
    if (ingHeader.test(line)) { mode = 'ing'; continue; }
    if (stepHeader.test(line)) { mode = 'step'; continue; }

    if (mode === 'ing') ingLines.push(line);
    else if (mode === 'step') steps.push(cleanStep(line));
  }

  // No headers found: guess by line shape, skipping obvious social-media noise.
  if (mode === 'pre' || (ingLines.length === 0 && steps.length === 0)) {
    for (let idx = 1; idx < nonEmpty.length; idx++) {
      const line = nonEmpty[idx];
      if (isNoise(line)) continue;
      if (sectionHeaderName(line) || looksLikeIngredient(line)) ingLines.push(line);
      else steps.push(cleanStep(line));
    }
  }

  return {
    title,
    ingredients: linesToIngredients(ingLines),
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
  // entries: [{ ing, recipe?: { id, title, emoji } }]
  const groups = new Map(); // key: ingredientKey -> { name, units, recipes:Map }
  for (const { ing, recipe } of entries) {
    const key = ingredientKey(ing.name) || ing.name.toLowerCase().trim();
    if (!groups.has(key)) {
      // Display a clean, merged label (e.g. "oignon rouge finement haché" → "Oignon rouge").
      const label = ingredientKey(ing.name) ? capitalizeWords(key) : ing.name;
      groups.set(key, { name: label, units: new Map(), plain: [], recipes: new Map() });
    }
    const g = groups.get(key);
    if (recipe && recipe.title) g.recipes.set(recipe.id || recipe.title, recipe);
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
      recipes: [...g.recipes.values()],
      category: categorize(g.name)
    });
  }
  items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return items;
}

function capitalizeWords(s) {
  return String(s).replace(/^\p{L}/u, (c) => c.toUpperCase());
}

// Words that describe an ingredient's form/prep/size/colour but not its identity,
// stripped so the same ingredient written differently maps to one shopping line.
const KEY_STOP = new Set((
  // French prep / cut
  'haché hachée hachés hachées émincé émincée émincés émincées ciselé ciselée ciselés ciselées ' +
  'râpé râpée râpés râpées coupé coupée coupés coupées pelé pelée pelés pelées épluché épluchée épluchés épluchées ' +
  'écrasé écrasée écrasés écrasées moulu moulue moulus moulues paré parée parés parées dénoyauté dénoyautée dénoyautées ' +
  'écossé écossée écossés écossées effeuillé concassé concassée concassées tranché émietté dégermé dégermée dégermés dégermées ' +
  // French form / state / size / colour
  'frais fraîche fraîches sec sèche séché séchée séchés séchées surgelé surgelée surgelés surgelées conserve entier entière entiers entières ' +
  'mûr mûre mûres cuit cuite cuits cuites cru crue grillé grillée frit frite ' +
  'finement grossièrement moyen moyenne moyens moyennes petit petite petits petites gros grosse grosses mini ' +
  'rouge rouges jaune jaunes vert verte verts vertes blanc blanche blanches noir noire ' +
  // shapes / portions + derived (juice/zest merge to the fruit for shopping)
  'morceaux morceau tranches tranche cubes dés lanières rondelles quartiers quartier moitié bâtonnets ' +
  'jus zeste zest juice deux trois quatre cinq six demi demie demis demies allongé allongée allongés allongées rond ronde ronds rondes ' +
  // French grammar
  'en de du des la le les un une à au aux et ou avec sans pour bien très plus quelques de qualité bonne environ côté épaisseur largeur longueur ' +
  // English
  'fresh chopped sliced diced minced ground large small medium finely roughly to taste of the a an dried frozen ripe cooked raw'
).split(/\s+/).filter(Boolean));

// A normalized identity key for an ingredient (used to merge shopping duplicates
// and to build the planner's fridge vocabulary). Keeps distinguishing nouns.
export function ingredientKey(name) {
  let s = String(name || '').toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ');                                   // drop "(facultatif)"
  s = s.replace(/\d+([.,]\d+)?/g, ' ').replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅛⅜⅝⅞]/g, ' ');
  s = s.replace(/\b(cm|mm|kg|g|cl|ml|l|tbsp|tsp|cuil|soupe|café|cafe|clove|gousse|gousses)\b/g, ' ');
  s = s.replace(/[^\p{L}\s'’-]/gu, ' ');
  const words = s.split(/[\s'’]+/)
    .filter((w) => w.length > 1 && !KEY_STOP.has(w) && !KEY_STOP.has(w.replace(/[sx]$/, '')))
    .map((w) => (w.length >= 5 && !SINGULAR_S.has(w)) ? w.replace(/[sx]$/, '') : w);
  return words.slice(0, 3).join(' ').trim();
}

// Singular words that end in -s (don't strip their trailing s).
const SINGULAR_S = new Set(['radis', 'ananas', 'anchois', 'maïs', 'mais', 'brebis', 'souris', 'couscous', 'houmous']);

const CATEGORIES = [
  { name: 'Produce', words: ['onion', 'oignon', 'échalote', 'garlic', 'ail', 'tomato', 'tomate', 'pepper', 'poivron', 'piment', 'carrot', 'carotte', 'potato', 'patate', 'lettuce', 'laitue', 'salade', 'spinach', 'épinard', 'lemon', 'citron', 'lime', 'apple', 'pomme', 'banana', 'herb', 'basil', 'basilic', 'cilantro', 'coriandre', 'parsley', 'persil', 'menthe', 'estragon', 'cerfeuil', 'thym', 'laurier', 'ginger', 'gingembre', 'mushroom', 'champignon', 'celery', 'céleri', 'cucumber', 'concombre', 'avocado', 'leek', 'poireau', 'chili', 'cabbage', 'chou', 'broccoli', 'brocoli', 'zucchini', 'courgette', 'aubergine', 'courge', 'potiron', 'fenouil', 'corn', 'maïs', 'mangue', 'grenade', 'fève', 'haricot', 'panais', 'betterave', 'radis', 'artichaut'] },
  { name: 'Meat & Fish', words: ['chicken', 'poulet', 'beef', 'boeuf', 'bœuf', 'pork', 'porc', 'lamb', 'agneau', 'fish', 'poisson', 'salmon', 'saumon', 'shrimp', 'crevette', 'bacon', 'lardon', 'sausage', 'saucisse', 'turkey', 'dinde', 'tuna', 'thon', 'ham', 'jambon', 'mince'] },
  { name: 'Dairy & Eggs', words: ['milk', 'lait', 'butter', 'beurre', 'cheese', 'fromage', 'cream', 'crème', 'yogurt', 'yaourt', 'egg', 'oeuf', 'œuf', 'parmesan', 'mozzarella', 'feta', 'ricotta', 'chèvre', 'mascarpone'] },
  { name: 'Pantry', words: ['flour', 'farine', 'sugar', 'sucre', 'salt', 'sel', 'oil', 'huile', 'rice', 'riz', 'pasta', 'pâte', 'nouille', 'soba', 'bean', 'lentil', 'lentille', 'stock', 'broth', 'bouillon', 'vinegar', 'vinaigre', 'sauce', 'soja', 'tahini', 'spice', 'épice', 'pepper', 'poivre', 'baking', 'levure', 'yeast', 'honey', 'miel', 'oat', 'avoine', 'bread', 'pain', 'noodle', 'can', 'conserve', 'concentré', 'safran', 'curcuma', 'paprika', 'cumin', 'origan', 'mélasse', 'olive'] },
  { name: 'Other', words: [] }
];

function categorize(name) {
  const n = name.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.words.some((w) => n.includes(w))) return cat.name;
  }
  return 'Other';
}
