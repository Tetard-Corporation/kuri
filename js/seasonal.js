// Seasonal produce (France / Northern hemisphere) and a small idea generator
// to spark new recipes from combinations of ingredients and preparations.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// Vegetables and fruits roughly in season, by month (1 = January).
const SEASON = {
  1:  { v: ['poireau', 'carotte', 'chou', 'endive', 'courge', 'betterave', 'panais', 'topinambour', 'navet', 'épinard', 'mâche', 'oignon'], f: ['pomme', 'poire', 'orange', 'clémentine', 'mandarine', 'kiwi', 'citron'] },
  2:  { v: ['poireau', 'carotte', 'chou', 'endive', 'betterave', 'panais', 'topinambour', 'navet', 'épinard', 'mâche', 'salsifis'], f: ['pomme', 'poire', 'orange', 'clémentine', 'kiwi', 'citron', 'pamplemousse'] },
  3:  { v: ['poireau', 'carotte', 'chou', 'endive', 'épinard', 'betterave', 'radis', 'blette', 'oignon nouveau'], f: ['pomme', 'poire', 'orange', 'kiwi', 'citron'] },
  4:  { v: ['asperge', 'radis', 'épinard', 'carotte', 'navet nouveau', 'petit pois', 'blette', 'oignon nouveau', 'laitue'], f: ['pomme', 'rhubarbe', 'fraise', 'kiwi'] },
  5:  { v: ['asperge', 'radis', 'petit pois', 'courgette', 'épinard', 'artichaut', 'fève', 'laitue', 'oignon nouveau', 'navet'], f: ['fraise', 'rhubarbe', 'cerise'] },
  6:  { v: ['courgette', 'aubergine', 'tomate', 'concombre', 'haricot vert', 'petit pois', 'poivron', 'radis', 'artichaut', 'fenouil', 'blette', 'laitue', 'ail nouveau'], f: ['fraise', 'cerise', 'abricot', 'framboise', 'groseille', 'melon', 'rhubarbe', 'pêche'] },
  7:  { v: ['tomate', 'courgette', 'aubergine', 'poivron', 'concombre', 'haricot vert', 'maïs', 'fenouil', 'oignon'], f: ['abricot', 'pêche', 'nectarine', 'melon', 'pastèque', 'framboise', 'cassis', 'cerise', 'prune', 'mirabelle', 'figue'] },
  8:  { v: ['tomate', 'courgette', 'aubergine', 'poivron', 'concombre', 'haricot vert', 'maïs', 'brocoli'], f: ['pêche', 'nectarine', 'abricot', 'melon', 'pastèque', 'prune', 'mirabelle', 'figue', 'raisin', 'framboise', 'mûre'] },
  9:  { v: ['tomate', 'courgette', 'aubergine', 'poivron', 'brocoli', 'chou-fleur', 'épinard', 'blette', 'potiron', 'champignon', 'maïs'], f: ['raisin', 'figue', 'prune', 'pomme', 'poire', 'pêche', 'mûre', 'noisette', 'melon'] },
  10: { v: ['potiron', 'courge', 'champignon', 'brocoli', 'chou-fleur', 'épinard', 'poireau', 'carotte', 'betterave', 'panais', 'blette'], f: ['raisin', 'pomme', 'poire', 'coing', 'châtaigne', 'noix', 'figue', 'kaki'] },
  11: { v: ['potiron', 'courge', 'poireau', 'carotte', 'chou', 'endive', 'panais', 'topinambour', 'betterave', 'champignon', 'mâche', 'épinard'], f: ['pomme', 'poire', 'coing', 'châtaigne', 'noix', 'clémentine', 'kaki', 'orange'] },
  12: { v: ['poireau', 'carotte', 'chou', 'endive', 'courge', 'betterave', 'panais', 'topinambour', 'mâche', 'épinard', 'salsifis'], f: ['pomme', 'poire', 'orange', 'clémentine', 'mandarine', 'kiwi', 'citron', 'kaki'] }
};

// Preparations tagged by what they suit: savory, sweet, or both.
const PREPARATIONS = [
  { n: 'rôti au four', k: 'both' }, { n: 'poêlé', k: 'savory' }, { n: 'grillé', k: 'savory' },
  { n: 'à la vapeur', k: 'savory' }, { n: 'en velouté', k: 'savory' }, { n: 'en gratin', k: 'savory' },
  { n: 'en tarte salée', k: 'savory' }, { n: 'en pickles', k: 'savory' }, { n: 'en salade', k: 'both' },
  { n: 'en purée', k: 'savory' }, { n: 'en risotto', k: 'savory' }, { n: 'au curry', k: 'savory' },
  { n: 'sauté au wok', k: 'savory' }, { n: 'farci', k: 'savory' }, { n: 'en soupe froide', k: 'savory' },
  { n: 'rôti au miel', k: 'both' }, { n: 'en carpaccio', k: 'both' }, { n: 'poêlé au beurre', k: 'both' },
  { n: 'en compote', k: 'sweet' }, { n: 'en crumble', k: 'sweet' }, { n: 'en tarte', k: 'sweet' },
  { n: 'en clafoutis', k: 'sweet' }, { n: 'en confiture', k: 'sweet' }
];

const COMPANIONS = {
  savory: ['ail', 'oignon', 'échalote', 'citron', 'basilic', 'persil', 'coriandre', 'menthe', 'thym',
    'gingembre', 'parmesan', 'feta', 'chèvre', 'noisettes', 'amandes', "huile d'olive", 'moutarde',
    'cumin', 'curry', 'piment', 'sauce soja', 'tahini', 'yaourt', 'pois chiches', 'œuf',
    'tomates séchées', 'olives', 'câpres'],
  sweet: ['miel', 'vanille', 'cannelle', 'citron', 'amandes', 'noisettes', 'chocolat', 'yaourt',
    'menthe', 'basilic', 'gingembre', "fleur d'oranger", 'mascarpone', 'caramel', 'pistache']
};

const rand = (a) => a[Math.floor(Math.random() * a.length)];
function sample(arr, n) {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < n) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  return out;
}

export function monthName(month) { return MONTH_NAMES[(month - 1 + 12) % 12]; }

export function getSeasonal(month) {
  const s = SEASON[month] || SEASON[1];
  return { vegetables: s.v, fruits: s.f };
}

// Build one idea. If `chosen` ingredients are given, the idea is built around them.
export function pickIdea(month, chosen = []) {
  const s = getSeasonal(month);
  const pool = [
    ...s.vegetables.map((n) => ({ name: n, type: 'veg' })),
    ...s.fruits.map((n) => ({ name: n, type: 'fruit' }))
  ];
  const base = chosen.length
    ? { name: chosen[0], type: s.fruits.includes(chosen[0]) ? 'fruit' : 'veg' }
    : rand(pool);

  const preps = PREPARATIONS.filter((p) => (base.type === 'fruit' ? p.k !== 'savory' : p.k !== 'sweet'));
  const prep = rand(preps.length ? preps : PREPARATIONS);
  const sweet = prep.k === 'sweet' || (base.type === 'fruit' && prep.k === 'both');

  const extra = chosen.slice(1);
  const sourcePool = (sweet ? COMPANIONS.sweet : COMPANIONS.savory).filter((c) => !chosen.includes(c));
  const companions = [...extra, ...sample(sourcePool, Math.max(1, 2 - extra.length))].slice(0, 3);

  return { ingredient: base.name, type: base.type, prep: prep.n, companions, sweet };
}

export function ideaTitle(idea) {
  const ing = idea.ingredient.charAt(0).toUpperCase() + idea.ingredient.slice(1);
  return `${ing} ${idea.prep}`;
}
