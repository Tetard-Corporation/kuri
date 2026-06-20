// "Ideas / Plan" popup: an on-the-fly preparation helper. Check the ingredients
// and preparations you have (built from your recipes, plus what's in season),
// see which recipes you can make, build a menu, and turn it into a shopping list.
import { h, toast } from './ui.js';
import { navigate } from './router.js';
import { store } from './store.js';
import { getSeasonal, pickIdea, ideaTitle, monthName } from './seasonal.js';
import { buildLibraryIdea, buildMashupDraft, extractTechnique } from './mashup.js';

export async function openIdeasPopup() {
  const month = new Date().getMonth() + 1;
  const season = getSeasonal(month);
  const recipes = await store.allRecipes();

  // Pre-compute per-recipe normalized ingredient tokens and technique.
  const recIndex = recipes.map((r) => ({
    r,
    tokens: (r.ingredients || []).map((i) => normalize(i.name)).filter(Boolean),
    tech: extractTechnique(r)
  }));

  const have = new Set();   // normalized ingredient tokens the user has
  const preps = new Set();  // selected preparations
  const menu = new Set();   // recipe ids chosen for the menu
  let tab = 'fridge';
  let query = '';

  // Vocabularies.
  const fridgeVocab = ingredientVocab(recipes);                 // [{ norm, label }]
  const seasonVocab = [...season.vegetables, ...season.fruits]
    .map((n) => ({ norm: normalize(n), label: n }));
  const prepVocab = [...new Set(recIndex.map((x) => x.tech))]
    .filter((p) => p && p !== 'à votre façon').sort();

  // ---- elements ----
  const root = document.getElementById('modalRoot');
  const finish = () => { root.innerHTML = ''; };

  const search = h('input', { type: 'search', placeholder: 'Filter…', value: query,
    oninput: (e) => { query = e.target.value.toLowerCase(); renderChips(); } });
  const tabsRow = h('div', { class: 'segmented', style: 'margin:0 0 10px;width:100%' }, [
    seg('🧊 My fridge', 'fridge'), seg('🥬 Season', 'season'), seg('🍳 Prep', 'prep')
  ]);
  const chipsBox = h('div', { class: 'chips', style: 'max-height:26vh;overflow:auto' });
  const haveSummary = h('div', { class: 'muted', style: 'font-size:0.8rem;margin:8px 0' });
  const recHeader = h('div', { class: 'ideas-h', style: 'margin-top:4px' });
  const recBox = h('div', { class: 'list', style: 'max-height:34vh;overflow:auto' });
  const ideaRow = h('div', { style: 'margin-top:12px' });
  const shopBtn = h('button', { class: 'btn btn--primary', onclick: buildShopping }, '🛒 Shopping list');

  function seg(label, id) {
    return h('button', { class: 'seg' + (tab === id ? ' active' : ''), onclick: () => { tab = id; query = ''; search.value = ''; syncTabs(); renderChips(); } }, label);
  }
  function syncTabs() {
    [...tabsRow.children].forEach((c, i) => c.classList.toggle('active', ['fridge', 'season', 'prep'][i] === tab));
  }

  function renderChips() {
    chipsBox.innerHTML = '';
    if (tab === 'prep') {
      if (!prepVocab.length) { chipsBox.append(hint('No preparations found in your recipes yet.')); return; }
      prepVocab.filter((p) => p.includes(query)).forEach((p) => {
        chipsBox.append(chip(p, preps.has(p), () => { preps.has(p) ? preps.delete(p) : preps.add(p); renderChips(); renderRecipes(); }));
      });
      return;
    }
    const vocab = tab === 'fridge' ? fridgeVocab : seasonVocab;
    const items = vocab.filter((v) => v.label.toLowerCase().includes(query) || v.norm.includes(query));
    if (!items.length) { chipsBox.append(hint('Nothing here.')); return; }
    items.forEach((v) => {
      chipsBox.append(chip(v.label, have.has(v.norm), () => {
        have.has(v.norm) ? have.delete(v.norm) : have.add(v.norm);
        renderChips(); renderRecipes(); renderSummary();
      }));
    });
  }

  function renderSummary() {
    const n = have.size + preps.size;
    haveSummary.innerHTML = '';
    haveSummary.append(
      h('span', {}, n ? `Selected: ${[...have].length} ingredient(s)${preps.size ? `, ${preps.size} prep` : ''}` : 'Tap what you have, or a preparation.'),
      n ? h('button', { class: 'btn btn--sm', style: 'margin-left:8px', onclick: () => { have.clear(); preps.clear(); renderChips(); renderRecipes(); renderSummary(); } }, 'Clear') : null
    );
  }

  function renderRecipes() {
    const hv = [...have];
    let cands = recIndex.map((x) => ({
      x,
      m: hv.length ? hv.filter((t) => x.tokens.some((n) => n.includes(t) || t.includes(n))).length : 0
    }));
    if (hv.length) cands = cands.filter((c) => c.m > 0);
    if (preps.size) cands = cands.filter((c) => preps.has(c.x.tech));
    cands.sort((a, b) => b.m - a.m || (a.x.r.ingredients?.length || 0) - (b.x.r.ingredients?.length || 0));

    recHeader.textContent = (hv.length || preps.size) ? `🍽️ You can make (${cands.length})` : `🍽️ Your recipes (${cands.length})`;
    recBox.innerHTML = '';
    if (!cands.length) { recBox.append(hint('No matches — try fewer ingredients.')); }
    cands.forEach(({ x, m }) => {
      const r = x.r;
      const row = h('label', { class: 'shop-item' }, [
        h('input', { type: 'checkbox', checked: menu.has(r.id),
          onchange: (e) => { e.target.checked ? menu.add(r.id) : menu.delete(r.id); renderFooter(); } }),
        h('span', { class: 'tile__emoji' }, r.emoji || '🍽️'),
        h('span', { class: 'grow' }, [
          h('div', {}, r.title),
          h('div', { class: 'muted', style: 'font-size:0.74rem' }, [
            hv.length ? `uses ${m}/${hv.length}` : `${(r.ingredients || []).length} ingredients`,
            x.tech !== 'à votre façon' ? ' · ' + x.tech : ''
          ].join(''))
        ]),
        h('a', { href: `#/recipe/${r.id}`, class: 'btn btn--sm', onclick: () => finish() }, 'Open')
      ]);
      recBox.append(row);
    });
  }

  function renderIdea() {
    ideaRow.innerHTML = '';
    const idea = buildLibraryIdea([...have], recipes) || pickIdea(month, [...have]);
    const sub = idea.fromLibrary ? `${idea.prep} · remix of ${idea.sources.map((s) => s.title).join(' + ')}` : [idea.prep, ...idea.companions].join(' · ');
    ideaRow.append(
      h('div', { class: 'ideas-idea', style: 'padding:12px' }, [
        h('div', { class: 'ideas-idea__label' }, '🎲 Idea'),
        h('div', { class: 'ideas-idea__main', style: 'font-size:1.1rem' }, capitalize(idea.ingredient)),
        h('div', { class: 'ideas-idea__sub', style: 'font-size:0.85rem' }, sub)
      ]),
      h('div', { class: 'row', style: 'gap:8px;margin-top:6px' }, [
        h('button', { class: 'btn btn--sm grow', onclick: renderIdea }, '🎲 Another'),
        h('button', { class: 'btn btn--sm grow', onclick: () => startRecipe(idea) }, '✨ Start a recipe')
      ])
    );
  }

  function startRecipe(idea) {
    const draft = idea.fromLibrary ? buildMashupDraft(idea) : {
      title: ideaTitle(idea), emoji: idea.type === 'fruit' ? '🍑' : '🥬',
      tags: [idea.ingredient, 'de saison'], description: `Idea: ${idea.ingredient} ${idea.prep}.`
    };
    sessionStorage.setItem('importDraft', JSON.stringify(draft));
    finish();
    navigate('/recipe/new/edit');
  }

  async function buildShopping() {
    if (!menu.size) { toast('Tick recipes for your menu first'); return; }
    const cfg = (await store.getMeta('shopping'))?.value || {};
    cfg.recipeIds = [...menu];
    cfg.checked = {};
    await store.setMeta('shopping', cfg);
    finish();
    navigate('/shopping');
  }

  function renderFooter() {
    shopBtn.textContent = menu.size ? `🛒 Shopping list (${menu.size})` : '🛒 Shopping list';
    shopBtn.disabled = !menu.size;
  }

  // ---- assemble ----
  const content = h('div', {}, [
    h('p', { class: 'muted', style: 'margin:0 0 10px;font-size:0.83rem' },
      `Plan from what you have — in season (${monthName(month)}) or from your recipes.`),
    tabsRow,
    h('div', { class: 'searchbar', style: 'margin-bottom:8px' }, [search]),
    chipsBox,
    haveSummary,
    h('hr', { style: 'border:none;border-top:1px solid var(--border);margin:6px 0' }),
    recHeader,
    recBox,
    h('hr', { style: 'border:none;border-top:1px solid var(--border);margin:10px 0' }),
    ideaRow
  ]);

  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) finish(); } }, [
    h('div', { class: 'modal' }, [
      h('h3', {}, '💡 Ideas & menu'),
      content,
      h('div', { class: 'row', style: 'gap:10px;justify-content:flex-end;margin-top:14px' }, [
        h('button', { class: 'btn btn--ghost', onclick: finish }, 'Close'),
        shopBtn
      ])
    ])
  ]);
  root.innerHTML = '';
  root.append(back);

  syncTabs(); renderChips(); renderSummary(); renderRecipes(); renderIdea(); renderFooter();
}

// ---- helpers ----
function chip(label, active, onClick) {
  return h('button', { class: 'chip' + (active ? ' active' : ''), onclick: onClick }, label);
}
function hint(text) { return h('span', { class: 'muted', style: 'font-size:0.8rem' }, text); }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

const PREP_WORDS = new Set(('haché hachée hachés hachées émincé émincée émincés émincées ciselé ciselée ciselés ciselées ' +
  'râpé râpée râpés râpées coupé coupée coupés coupées pelé pelée pelés pelées écrasé écrasée écrasés écrasées ' +
  'moulu moulue moulus moulues frais fraîche fraîches finement grossièrement moyen moyenne moyens moyennes ' +
  'petit petite petits petites gros grosse grosses en de du des à au aux le la les un une pour et ou avec sans ' +
  'moitié morceaux morceau tranches tranche cubes dés lanières rondelles fine fin fines séché séchée cuit cuite cuits cuites ' +
  'frit frite grillé grillée mûr mûre mûres bonne qualité environ côté épaisseur large largeur longueur').split(' '));

// Reduce an ingredient name to a comparable "head" (drop amounts, prep words…).
export function normalize(name) {
  let s = String(name || '').toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\d+([.,]\d+)?/g, ' ').replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅛⅜⅝⅞]/g, ' ');
  s = s.replace(/\b(cm|mm|g|kg|cl|ml|l|tbsp|tsp|cuil|soupe|café|cafe|clove|gousse|gousses)\b/g, ' ');
  s = s.replace(/[^\p{L}\s'’-]/gu, ' ');
  const words = s.split(/[\s'’]+/)
    .filter((w) => w.length > 1 && !PREP_WORDS.has(w) && !PREP_WORDS.has(w.replace(/s$/, '')))
    .map((w) => w.replace(/s$/, ''));
  return words.slice(0, 3).join(' ').trim();
}

function ingredientVocab(recipes) {
  const map = new Map(); // norm -> shortest label
  for (const r of recipes) {
    for (const ing of r.ingredients || []) {
      const norm = normalize(ing.name);
      if (!norm) continue;
      const label = capitalize(norm);
      if (!map.has(norm)) map.set(norm, label);
    }
  }
  return [...map.entries()].map(([norm, label]) => ({ norm, label })).sort((a, b) => a.label.localeCompare(b.label));
}
