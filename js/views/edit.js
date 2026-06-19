// Create / edit a recipe.
import { store, blankRecipe } from '../store.js';
import { h, setTopbar, toast, fileToDataURL, confirmDialog } from '../ui.js';
import { navigate, back } from '../router.js';
import { parseIngredientList, ingredientToString } from '../parse.js';

const EMOJIS = ['🍽️', '🍝', '🥗', '🍲', '🍛', '🥘', '🍜', '🥞', '🍳', '🌮', '🍕', '🍔', '🥪', '🍰', '🍪', '🥧', '🍚', '🐟', '🥩', '🍗'];

export async function editView({ id }, root) {
  const isNew = !id || id === 'new';
  const recipe = isNew ? blankRecipe() : await store.getRecipe(id);
  if (!recipe) { toast('Recipe not found'); navigate('/recipes'); return; }

  // Draft passed via sessionStorage from the import flow.
  if (isNew) {
    const draftRaw = sessionStorage.getItem('importDraft');
    if (draftRaw) {
      try { Object.assign(recipe, JSON.parse(draftRaw)); } catch { /* ignore */ }
      sessionStorage.removeItem('importDraft');
    }
  }

  let emoji = recipe.emoji || '🍽️';
  let image = recipe.image || '';

  setTopbar({
    title: isNew ? 'New recipe' : 'Edit recipe',
    back: true,
    action: { label: 'Save', onClick: save }
  });

  root.innerHTML = '';

  const titleInput = input('text', recipe.title, 'Recipe name');
  const descInput = textarea(recipe.description, 'A short description (optional)', 2);
  const servingsInput = input('number', recipe.servings || 2);
  servingsInput.min = 1;
  const prepInput = input('text', recipe.prepTime, 'e.g. 10 min');
  const cookInput = input('text', recipe.cookTime, 'e.g. 25 min');
  const tagsInput = input('text', (recipe.tags || []).join(', '), 'comma, separated, tags');
  const ingInput = textarea(
    (recipe.ingredients || []).map(ingredientToString).join('\n'),
    'One ingredient per line, e.g.\n200 g spaghetti\n2 cloves garlic', 7
  );
  const stepsInput = textarea(
    (recipe.steps || []).join('\n'),
    'One step per line', 8
  );

  // Emoji + image picker
  const emojiPreview = h('div', { class: 'hero', style: heroStyle() }, image ? '' : emoji);
  function heroStyle() {
    return image ? `background-image:url("${String(image).replace(/"/g, '%22')}");height:160px` : 'height:160px';
  }
  function refreshHero() {
    emojiPreview.style.cssText = heroStyle();
    emojiPreview.textContent = image ? '' : emoji;
  }

  const emojiRow = h('div', { class: 'chips', style: 'overflow-x:auto;margin-bottom:10px' },
    EMOJIS.map((e) => h('button', {
      class: 'chip' + (e === emoji && !image ? ' active' : ''),
      onclick: () => { emoji = e; image = ''; refreshHero(); markEmoji(); }
    }, e)));
  function markEmoji() {
    [...emojiRow.children].forEach((c) => c.classList.toggle('active', c.textContent === emoji && !image));
  }

  const fileInput = h('input', {
    type: 'file', accept: 'image/*', class: 'hidden',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      toast('Processing image…');
      image = await fileToDataURL(file);
      refreshHero();
      markEmoji();
    }
  });

  root.append(
    emojiPreview,
    h('div', { class: 'row', style: 'gap:8px;margin-bottom:6px' }, [
      h('button', { class: 'btn btn--sm grow', onclick: () => fileInput.click() }, '📷 Photo'),
      image && h('button', { class: 'btn btn--sm', onclick: () => { image = ''; refreshHero(); markEmoji(); } }, '✕ Remove')
    ].filter(Boolean)),
    h('label', { class: 'field', style: 'display:block' }, [
      h('span', { style: 'font-size:0.82rem;color:var(--muted);font-weight:600' }, 'Or pick an icon'),
      emojiRow
    ]),
    fileInput,
    field('Name', titleInput),
    field('Description', descInput),
    h('div', { class: 'row', style: 'gap:12px' }, [
      h('div', { class: 'grow' }, field('Servings', servingsInput)),
      h('div', { class: 'grow' }, field('Prep time', prepInput)),
      h('div', { class: 'grow' }, field('Cook time', cookInput))
    ]),
    field('Tags', tagsInput),
    field('Ingredients', ingInput),
    field('Instructions', stepsInput),
    h('div', { class: 'row', style: 'gap:10px;margin:10px 0 40px' }, [
      h('button', { class: 'btn btn--primary grow', onclick: save }, 'Save recipe'),
      h('button', { class: 'btn', onclick: () => back() }, 'Cancel')
    ])
  );

  async function save() {
    const title = titleInput.value.trim();
    if (!title) { toast('Please add a name'); titleInput.focus(); return; }
    Object.assign(recipe, {
      title,
      description: descInput.value.trim(),
      emoji,
      image,
      servings: Math.max(1, parseInt(servingsInput.value, 10) || 1),
      prepTime: prepInput.value.trim(),
      cookTime: cookInput.value.trim(),
      tags: tagsInput.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      ingredients: parseIngredientList(ingInput.value),
      steps: stepsInput.value.split('\n').map((s) => s.trim()).filter(Boolean)
    });
    const saved = await store.saveRecipe(recipe);
    toast('Recipe saved');
    navigate(`/recipe/${saved.id}`);
  }
}

function input(type, value, placeholder) {
  return h('input', { type, value: value ?? '', placeholder: placeholder || '' });
}
function textarea(value, placeholder, rows) {
  return h('textarea', { value: value ?? '', placeholder: placeholder || '', rows: rows || 4 });
}
function field(label, control) {
  return h('div', { class: 'field' }, [h('label', {}, label), control]);
}
