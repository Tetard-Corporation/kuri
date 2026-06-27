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
    if (isServingLine(line) || isIngredientsHeader(line) || looksLikeJunk(line)) continue; // OCR noise / serving / header
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

// A numeric run that may be a range: "4", "4 à 6", "4-6", "4/6".
const RANGE = String.raw`\d{1,3}(?:\s*[àa\-–/]\s*\d{1,3})?`;

// Recognise a "serves N" / "pour N personnes" line (not an ingredient).
// Tolerates ranges ("pour 4 à 6 personnes") and a leading "environ".
export function isServingLine(line) {
  const l = String(line).trim();
  if (/^serves?\b/i.test(l)) return true;
  if (/^(?:portions?|servings?)\s*:?\s*\d/i.test(l)) return true;
  const core = `(?:environ\\s+)?${RANGE}\\s+(?:personnes?|pers\\.?|convives?|portions?|servings?)`;
  if (new RegExp(`^(?:pour\\s+)?${core}\\b`, 'i').test(l)) return true;
  // serving phrase embedded in a short line, e.g. "Ajusté pour 1 portion."
  if (new RegExp(`\\bpour\\s+${core}\\b`, 'i').test(l) && l.split(/\s+/).length <= 7) return true;
  return false;
}

// An "Ingredients" / "INGRÉDIENTS — 2 personnes" header that slipped into the list.
export function isIngredientsHeader(line) {
  return /^ingr[ée]dients?\s*$/i.test(String(line).trim()) ||
    /^ingr[ée]dients?\s*[:\-–—(]/i.test(String(line).trim());
}

// Pull a servings count out of OCR'd text, if present (lower bound of a range).
export function extractServings(text) {
  const re = new RegExp(`pour\\s+(?:environ\\s+)?(${RANGE})\\s+(?:personnes?|pers|convives?)|serves?\\s+(${RANGE})|(${RANGE})\\s+(?:personnes|portions|servings)`, 'i');
  const m = String(text).match(re);
  if (!m) return null;
  const n = parseInt((m[1] || m[2] || m[3]).match(/\d+/)[0], 10);
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

// Named HTML entities common in recipe pages (esp. French). Accented forms are
// case-sensitive; generic ones (amp, nbsp…) fall back to a lowercase lookup.
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  laquo: '«', raquo: '»', deg: '°', middot: '·', bull: '•', euro: '€', pound: '£',
  cent: '¢', copy: '©', reg: '®', trade: '™', times: '×', divide: '÷',
  frac12: '½', frac13: '⅓', frac14: '¼', frac34: '¾', frac23: '⅔', sup2: '²', sup3: '³',
  agrave: 'à', Agrave: 'À', aacute: 'á', acirc: 'â', Acirc: 'Â', atilde: 'ã', auml: 'ä', Auml: 'Ä', aring: 'å', aelig: 'æ', AElig: 'Æ',
  ccedil: 'ç', Ccedil: 'Ç',
  egrave: 'è', Egrave: 'È', eacute: 'é', Eacute: 'É', ecirc: 'ê', Ecirc: 'Ê', euml: 'ë', Euml: 'Ë',
  igrave: 'ì', iacute: 'í', icirc: 'î', Icirc: 'Î', iuml: 'ï', Iuml: 'Ï',
  ntilde: 'ñ', Ntilde: 'Ñ',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', Ocirc: 'Ô', otilde: 'õ', ouml: 'ö', Ouml: 'Ö', oslash: 'ø', oelig: 'œ', OElig: 'Œ',
  ugrave: 'ù', Ugrave: 'Ù', uacute: 'ú', ucirc: 'û', Ucirc: 'Û', uuml: 'ü', Uuml: 'Ü',
  yacute: 'ý', yuml: 'ÿ', szlig: 'ß'
};

// Decode numeric (&#233; / &#xE9;) and named (&eacute;) HTML entities. A trailing
// semicolon is optional so half-mangled feeds ("sak&eacute de") still decode.
export function decodeEntities(s) {
  return String(s == null ? '' : s).replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z][a-zA-Z0-9]{1,9});?/g, (m, body) => {
    if (body[0] === '#') {
      const code = (body[1] === 'x' || body[1] === 'X') ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        try { return String.fromCodePoint(code); } catch { return m; }
      }
      return m;
    }
    const v = NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()];
    return v !== undefined ? v : m;
  });
}

// Remove HTML tags, turning block-level ones into line breaks so structure survives.
export function stripTags(s) {
  return String(s == null ? '' : s)
    .replace(/<\s*(br|\/p|\/div|\/li|li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
}

// Strip tags + decode entities + tidy whitespace, while preserving line breaks.
export function cleanText(s) {
  return decodeEntities(stripTags(s))
    .replace(/[ \t ]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Heuristic parser for pasted / OCR'd recipe text -> {title, ingredients[], steps[]}
export function parseRecipeText(text) {
  const lines = cleanText(text).split('\n').map((l) => l.replace(/\s+$/, ''));
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

// Units that can be summed within a measurement family, with their base factor.
const UNIT_FAMILY = {
  mg: ['mass', 0.001], g: ['mass', 1], kg: ['mass', 1000],
  ml: ['vol', 1], cl: ['vol', 10], l: ['vol', 1000]
};

// Render a summed family total in a friendly unit (1500 g → "1.5 kg", 400 ml → "40 cl").
function formatFamily(fam, total) {
  if (fam === 'mass') return total >= 1000 ? formatQty(total / 1000) + ' kg' : formatQty(total) + ' g';
  if (total >= 1000) return formatQty(total / 1000) + ' l';
  if (total >= 100 && total % 10 === 0) return formatQty(total / 10) + ' cl';
  return formatQty(total) + ' ml';
}

// Most frequent display label for a group; ties broken by shortest (most canonical).
function bestLabel(counts) {
  let best = '';
  let bestN = -1;
  for (const [label, n] of counts) {
    if (n > bestN || (n === bestN && label.length < best.length)) { best = label; bestN = n; }
  }
  return best;
}

// Aggregate ingredients across recipes into a merged shopping list.
export function aggregateShopping(entries) {
  // entries: [{ ing, recipe?: { id, title, emoji } }]
  const groups = new Map(); // key: ingredientKey -> group
  for (const { ing, recipe } of entries) {
    const key = ingredientKey(ing.name);
    if (!key) continue; // non-food / junk (serving lines, "à votre goût"…): never listed
    if (!groups.has(key)) {
      groups.set(key, { key, units: new Map(), fam: {}, labels: new Map(), recipes: new Map() });
    }
    const g = groups.get(key);
    const label = ingredientLabel(ing.name) || capitalizeWords(key);
    g.labels.set(label, (g.labels.get(label) || 0) + 1);
    if (recipe && recipe.title) g.recipes.set(recipe.id || recipe.title, recipe);
    if (ing.qty != null) {
      const u = (ing.unit || '').toLowerCase();
      const fam = UNIT_FAMILY[u];
      if (fam) g.fam[fam[0]] = (g.fam[fam[0]] || 0) + ing.qty * fam[1];
      else g.units.set(u, (g.units.get(u) || 0) + ing.qty);
    }
  }

  const items = [];
  for (const g of groups.values()) {
    const qtyParts = [];
    for (const fam of Object.keys(g.fam)) qtyParts.push(formatFamily(fam, g.fam[fam]));
    for (const [unit, total] of g.units.entries()) {
      qtyParts.push((formatQty(total) + (unit ? ' ' + unit : '')).trim());
    }
    items.push({
      name: DISPLAY[g.key] || bestLabel(g.labels) || capitalizeWords(g.key),
      qty: qtyParts.join(' + '),
      recipes: [...g.recipes.values()],
      category: categorize(g.key)
    });
  }
  items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return items;
}

function capitalizeWords(s) {
  return String(s).replace(/^\p{L}/u, (c) => c.toUpperCase());
}

// Lowercase + strip accents and fold ligatures, so "Épinard", "epinard", "œuf"
// and "oeuf" all compare equal when matching/merging ingredients.
export function foldAccents(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss');
}

// Words that describe an ingredient's form/prep/size/colour but not its identity,
// stripped so the same ingredient written differently maps to one shopping line.
// Stored accent-folded (see foldAccents) so matching is accent-insensitive.
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
  // quality / origin (not identity)
  'bio fermier fermière fermiers fermières maison artisanal artisanale extra vierge label nature plein air bonne premium ' +
  'rouge rouges jaune jaunes vert verte verts vertes blanc blanche blanches noir noire ' +
  // shapes / portions + derived (juice/zest merge to the fruit for shopping)
  'morceaux morceau tranches tranche cubes dés lanières rondelles quartiers quartier moitié bâtonnets ' +
  'jus zeste zest juice deux trois quatre cinq six demi demie demis demies allongé allongée allongés allongées rond ronde ronds rondes ' +
  // French grammar
  'en de du des la le les un une à au aux et ou avec sans pour bien très plus quelques de qualité bonne environ côté épaisseur largeur longueur ' +
  'votre vos notre nos mon ma mes ton ta tes son sa ses leur leurs ' +
  // English
  'fresh chopped sliced diced minced ground large small medium finely roughly to taste of the a an dried frozen ripe cooked raw'
).split(/\s+/).filter(Boolean).map(foldAccents));

// Tokens that are never an ingredient on their own (serving counts, leftovers of
// "à votre goût", optional markers…). If a name reduces to only these, it's dropped.
const NON_FOOD = new Set((
  'personne convive portion serving part facultatif optionnel option ' +
  'gout assaisonnement decoration garniture service quantite suffisant ' +
  'choix volonte besoin presentation accompagnement total'
).split(/\s+/).map(foldAccents));

// Singular words that end in -s (don't strip their trailing s). Accent-folded.
const SINGULAR_S = new Set(['radis', 'ananas', 'anchois', 'maïs', 'mais', 'brebis', 'souris', 'couscous', 'houmous', 'cassis'].map(foldAccents));

// Unit-ish words that may survive number-stripping; never part of an identity.
const UNIT_WORDS = new Set('cm mm kg cl ml tbsp tsp cuil soupe cafe clove gousse oz lb cup'.split(/\s+/).map(foldAccents));

// Canonical merges that plural/accent folding alone can't catch (key-form → key-form).
const CANON = {
  patate: 'pomme terre', pdt: 'pomme terre', 'pomme terre': 'pomme terre',
  echalotte: 'echalote',
  yogourt: 'yaourt', yogurt: 'yaourt',
  'piment doux': 'poivron',
  'sucre cassonade': 'cassonade',
  'huile dolive': 'huile olive'
};

// Pretty display labels for some canonical keys (keys are accent-stripped).
const DISPLAY = {
  'pomme terre': 'Pomme de terre', 'patate douce': 'Patate douce',
  'huile olive': "Huile d'olive", 'creme fraiche': 'Crème fraîche',
  'creme liquide': 'Crème liquide', echalote: 'Échalote',
  'pois chiche': 'Pois chiches', 'concentre tomate': 'Concentré de tomate',
  'coulis tomate': 'Coulis de tomate', oeuf: 'Œufs', cafe: 'Café',
  celeri: 'Céleri', epinard: 'Épinards', creme: 'Crème',
  gingembre: 'Gingembre', poivron: 'Poivron'
};

// Identity words of an ingredient name, accent-folded, plural-stripped, noise removed.
function keyWords(name) {
  let s = foldAccents(name);
  s = s.replace(/\([^)]*\)/g, ' ');                                   // drop "(facultatif)"
  s = s.replace(/\d+([.,]\d+)?/g, ' ').replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅛⅜⅝⅞]/g, ' ');
  s = s.replace(/[^\p{L}\s'’-]/gu, ' ');
  const drop = (w) => UNIT_WORDS.has(w) || NON_FOOD.has(w) || NON_FOOD.has(w.replace(/[sx]$/, '')) ||
    KEY_STOP.has(w) || KEY_STOP.has(w.replace(/[sx]$/, ''));
  return s.split(/[\s'’-]+/)
    .filter((w) => w.length > 1 && !drop(w))
    .map((w) => (w.length >= 5 && !SINGULAR_S.has(w)) ? w.replace(/[sx]$/, '') : w);
}

// A normalized identity key for an ingredient (used to merge shopping duplicates
// and to build the planner's fridge vocabulary). Returns '' for non-foods.
export function ingredientKey(name) {
  const words = keyWords(name);
  if (!words.length) return '';
  const key = words.slice(0, 3).join(' ').trim();
  return CANON[key] || key;
}

// A clean display label: preserves accents/case but drops prep/qualifier noise.
export function ingredientLabel(name) {
  const k = ingredientKey(name);
  if (k && DISPLAY[k]) return DISPLAY[k];
  let s = String(name || '').replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\d+([.,]\d+)?/g, ' ').replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅛⅜⅝⅞]/g, ' ');
  s = s.replace(/[^\p{L}\s'’-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const words = s.split(/\s+/).filter((w) => {
    const f = foldAccents(w);
    return w.length > 1 && !UNIT_WORDS.has(f) && !KEY_STOP.has(f) && !KEY_STOP.has(f.replace(/[sx]$/, ''));
  });
  const out = words.slice(0, 4).join(' ');
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : (k ? capitalizeWords(k) : '');
}

// Of a recipe's ingredients, those whose identity word(s) appear in a step's text
// — used in cook mode to show "what you need for this step". Accent-insensitive.
export function ingredientsInText(text, ingredients) {
  const norm = (w) => (w.length >= 4 ? w.replace(/s$/, '') : w);
  const words = new Set(foldAccents(text).split(/[^a-z]+/).filter((w) => w.length > 2).map(norm));
  return (ingredients || []).filter((ing) => {
    const kw = ingredientKey(ing.name);
    if (!kw) return false;
    return kw.split(' ').some((w) => w.length >= 3 && words.has(norm(w)));
  });
}

const CATEGORIES = [
  { name: 'Produce', words: ['onion', 'oignon', 'échalote', 'garlic', 'ail', 'tomato', 'tomate', 'pepper', 'poivron', 'piment', 'carrot', 'carotte', 'potato', 'patate', 'lettuce', 'laitue', 'salade', 'spinach', 'épinard', 'lemon', 'citron', 'lime', 'apple', 'pomme', 'banana', 'herb', 'basil', 'basilic', 'cilantro', 'coriandre', 'parsley', 'persil', 'menthe', 'estragon', 'cerfeuil', 'thym', 'laurier', 'ginger', 'gingembre', 'mushroom', 'champignon', 'celery', 'céleri', 'cucumber', 'concombre', 'avocado', 'leek', 'poireau', 'chili', 'cabbage', 'chou', 'broccoli', 'brocoli', 'zucchini', 'courgette', 'aubergine', 'courge', 'potiron', 'fenouil', 'corn', 'maïs', 'mangue', 'grenade', 'fève', 'haricot', 'panais', 'betterave', 'radis', 'artichaut'] },
  { name: 'Meat & Fish', words: ['chicken', 'poulet', 'beef', 'boeuf', 'bœuf', 'pork', 'porc', 'lamb', 'agneau', 'fish', 'poisson', 'salmon', 'saumon', 'shrimp', 'crevette', 'bacon', 'lardon', 'sausage', 'saucisse', 'turkey', 'dinde', 'tuna', 'thon', 'ham', 'jambon', 'mince'] },
  { name: 'Dairy & Eggs', words: ['milk', 'lait', 'butter', 'beurre', 'cheese', 'fromage', 'cream', 'crème', 'yogurt', 'yaourt', 'egg', 'oeuf', 'œuf', 'parmesan', 'mozzarella', 'feta', 'ricotta', 'chèvre', 'mascarpone'] },
  { name: 'Pantry', words: ['flour', 'farine', 'sugar', 'sucre', 'salt', 'sel', 'oil', 'huile', 'rice', 'riz', 'pasta', 'pâte', 'nouille', 'soba', 'bean', 'lentil', 'lentille', 'stock', 'broth', 'bouillon', 'vinegar', 'vinaigre', 'sauce', 'soja', 'tahini', 'spice', 'épice', 'pepper', 'poivre', 'baking', 'levure', 'yeast', 'honey', 'miel', 'oat', 'avoine', 'bread', 'pain', 'noodle', 'can', 'conserve', 'concentré', 'safran', 'curcuma', 'paprika', 'cumin', 'origan', 'mélasse', 'olive'] },
  { name: 'Other', words: [] }
];

const CATEGORIES_F = CATEGORIES.map((c) => ({ name: c.name, words: c.words.map(foldAccents) }));

function categorize(name) {
  const n = foldAccents(name);
  for (const cat of CATEGORIES_F) {
    if (cat.words.some((w) => n.includes(w))) return cat.name;
  }
  return 'Other';
}
