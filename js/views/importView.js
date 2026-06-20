// Import recipes from a web URL, pasted text (e.g. Instagram caption), or a photo.
import { h, setTopbar, toast, modal, fileToDataURL } from '../ui.js';
import { navigate } from '../router.js';
import { importFromUrl, ocrImages } from '../import.js';
import { parseRecipeText, parseIngredientList, splitInstructions, extractServings, ingredientToString } from '../parse.js';
import { store, blankRecipe } from '../store.js';
import { exportData } from '../backup.js';
import { logImportCancelled, logImportSaved, recipeSnapshot } from '../feedback.js';

export async function importView(_params, root) {
  setTopbar({ title: 'Import' });
  root.innerHTML = '';

  root.append(
    h('div', { class: 'section' }, [
      h('div', { class: 'row row--between', style: 'gap:12px' }, [
        h('div', { class: 'grow' }, [
          h('h2', { style: 'margin:0' }, '✏️ New recipe'),
          h('p', { class: 'muted', style: 'margin:4px 0 0;font-size:0.85rem' }, 'Start from a blank recipe and type it in yourself.')
        ]),
        h('button', { class: 'btn btn--primary', onclick: () => navigate('/recipe/new/edit') }, '+ New')
      ])
    ]),
    section('🌐 From a website', 'Paste a recipe URL. We read the page’s structured recipe data when available.', [
      urlForm()
    ]),
    section('📝 Paste text', 'From an Instagram caption, a note, or a message. We’ll split ingredients and steps.', [
      textForm()
    ]),
    section('📷 From photos', 'Add photos of the ingredients and the instructions separately (camera or gallery). Text is read on-device in French & English.', [
      photoForm()
    ]),
    backupSection(),
    feedbackSection()
  );
}

// Connector feedback: corrections and cancelled imports collected to improve parsers.
function feedbackSection() {
  const wrap = h('div', { class: 'section' });
  const body = h('div', {});
  wrap.append(
    h('h2', { style: 'margin-top:0' }, '🛠️ Connector data'),
    h('p', { class: 'muted', style: 'margin-top:0;font-size:0.85rem' },
      'Your edits to imported recipes and any cancelled imports are logged on-device. Export them to help improve the importers.'),
    body
  );

  store.allFeedback().then((items) => {
    const counts = items.reduce((m, it) => ((m[it.type] = (m[it.type] || 0) + 1), m), {});
    const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ') || 'Nothing logged yet';
    body.innerHTML = '';
    body.append(
      h('p', { class: 'muted', style: 'font-size:0.82rem;margin-top:0' }, summary),
      h('div', { class: 'row', style: 'gap:10px' }, [
        h('button', { class: 'btn grow', disabled: !items.length, onclick: () => exportFeedback(items) }, '⬇️ Export data'),
        h('button', { class: 'btn grow', disabled: !items.length, onclick: () => clearFeedback() }, '🗑 Clear')
      ])
    );
  });

  async function clearFeedback() {
    if (!(await modal({
      content: h('p', { style: 'margin:0' }, 'Delete all collected connector data?'),
      actions: [{ label: 'Cancel', value: false }, { label: 'Delete', danger: true, value: true }]
    }))) return;
    await store.clearFeedback();
    toast('Connector data cleared');
    importView({}, document.getElementById('view'));
  }

  return wrap;
}

function exportFeedback(items) {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), feedback: items }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `kuri-connector-data-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Connector data exported');
}

function section(title, sub, children) {
  return h('div', { class: 'section' }, [
    h('h2', { style: 'margin-top:0' }, title),
    h('p', { class: 'muted', style: 'margin-top:0;font-size:0.85rem' }, sub),
    ...children
  ]);
}

function urlForm() {
  const inp = h('input', { type: 'url', placeholder: 'https://…', inputmode: 'url' });
  const btn = h('button', { class: 'btn btn--primary', onclick: run }, 'Import');
  async function run() {
    const url = inp.value.trim();
    if (!url) { toast('Paste a URL first'); return; }
    setBusy(btn, true, 'Fetching…');
    try {
      const recipe = await importFromUrl(url);
      preview(recipe);
    } catch (err) {
      toast('Could not import — try “Paste text” instead');
      console.error(err);
    } finally {
      setBusy(btn, false, 'Import');
    }
  }
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  return h('div', { class: 'row', style: 'gap:8px' }, [h('div', { class: 'grow' }, inp), btn]);
}

function textForm() {
  const ta = h('textarea', { rows: 6, placeholder: 'Paste the recipe text here…' });
  const btn = h('button', { class: 'btn btn--primary', style: 'margin-top:8px', onclick: () => {
    const text = ta.value.trim();
    if (text.length < 10) { toast('Paste a bit more text'); return; }
    const parsed = parseRecipeText(text);
    parsed.source = { type: 'text' };
    preview(parsed);
  } }, 'Parse text');
  return h('div', {}, [ta, btn]);
}

function photoForm() {
  // Two buckets so the user separates ingredients from instructions; each can
  // hold several photos (e.g. a long method over multiple pages).
  const ingPhotos = [];
  const stepPhotos = [];
  const titleInput = h('input', { type: 'text', placeholder: 'Recipe name (optional)' });
  const status = h('div', { class: 'muted', style: 'margin-top:10px;font-size:0.85rem' });

  // Optional cover photo (not OCR'd — used only as the recipe image).
  let cover = '';
  const coverInput = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
  const coverField = h('div', { class: 'field' });
  function renderCover() {
    coverField.innerHTML = '';
    coverField.append(h('label', {}, 'Cover photo (optional)'));
    if (cover) {
      coverField.append(h('div', { class: 'row', style: 'gap:10px;align-items:stretch' }, [
        h('div', { style: `flex:1;height:120px;border-radius:12px;background:#0001 center/cover no-repeat;background-image:url("${cover}")` }),
        h('button', { class: 'btn btn--sm', onclick: () => { cover = ''; renderCover(); } }, '✕ Remove')
      ]));
    } else {
      coverField.append(h('button', { class: 'btn btn--block', onclick: () => coverInput.click() }, '🖼️ Add cover photo'));
    }
    coverField.append(coverInput);
  }
  coverInput.onchange = async () => {
    if (coverInput.files[0]) cover = await fileToDataURL(coverInput.files[0], 1280, 0.85);
    coverInput.value = '';
    renderCover();
  };
  renderCover();

  function bucket(label, arr) {
    const gallery = h('div', { class: 'photo-gallery' });
    const input = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden' });
    const render = () => {
      gallery.innerHTML = '';
      arr.forEach((src, i) => {
        gallery.append(h('div', { class: 'photo-thumb', style: `background-image:url("${src}")` }, [
          h('button', { class: 'photo-thumb__x', title: 'Remove',
            onclick: () => { arr.splice(i, 1); render(); } }, '×')
        ]));
      });
      if (!arr.length) gallery.append(h('span', { class: 'muted', style: 'font-size:0.8rem' }, 'No photos yet'));
    };
    input.onchange = async () => {
      for (const f of input.files) arr.push(await fileToDataURL(f, 1600, 0.9));
      input.value = '';
      render();
    };
    render();
    return h('div', { class: 'photo-bucket' }, [
      h('div', { class: 'row row--between', style: 'margin-bottom:8px' }, [
        h('strong', {}, label),
        h('button', { class: 'btn btn--sm', onclick: () => input.click() }, '+ Add photos')
      ]),
      gallery, input
    ]);
  }

  const ingBucket = bucket('📋 Ingredients', ingPhotos);
  const stepBucket = bucket('👨‍🍳 Instructions', stepPhotos);
  const extractBtn = h('button', { class: 'btn btn--primary btn--block', style: 'margin-top:6px', onclick: extract },
    '🔍 Extract recipe');

  async function extract() {
    if (!ingPhotos.length && !stepPhotos.length) { toast('Add at least one photo'); return; }
    extractBtn.disabled = true;
    const setStatus = (frac, i, n) =>
      status.innerHTML = `<span class="spinner"></span> Reading photos${n > 1 ? ` (${i + 1}/${n})` : ''}… ${Math.round((frac || 0) * 100)}%`;
    try {
      // One OCR worker pass over all photos, then split back into the two buckets.
      const all = [...ingPhotos, ...stepPhotos];
      setStatus(0, 0, all.length);
      const texts = await ocrImages(all, { onProgress: setStatus });
      const ingText = texts.slice(0, ingPhotos.length).join('\n');
      const ingredients = parseIngredientList(ingText);
      const steps = splitInstructions(texts.slice(ingPhotos.length).join('\n'));
      const servings = extractServings(ingText);
      status.textContent = '';
      if (!ingredients.length && !steps.length) { toast('No text found in the photos'); return; }
      const parsed = {
        title: titleInput.value.trim() || 'Imported recipe',
        ingredients,
        steps,
        image: cover || ingPhotos[0] || stepPhotos[0] || '',
        source: { type: 'photo' }
      };
      if (servings) parsed.servings = servings;
      preview(parsed);
    } catch (err) {
      status.textContent = '';
      toast(err.message || 'OCR failed');
      console.error(err);
    } finally {
      extractBtn.disabled = false;
    }
  }

  return h('div', {}, [
    h('div', { class: 'field' }, [h('label', {}, 'Recipe name'), titleInput]),
    coverField,
    ingBucket,
    stepBucket,
    extractBtn,
    status
  ]);
}

// Show a preview, let the user save directly or open the editor to tweak.
function preview(parsed) {
  const ingText = (parsed.ingredients || []).map((i) => '• ' + ingredientToString(i)).join('\n') || '(none detected)';
  const stepText = (parsed.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n') || '(none detected)';
  const body = h('div', {}, [
    h('div', { class: 'field' }, [h('label', {}, 'Title'), h('strong', {}, parsed.title || 'Untitled')]),
    h('div', { class: 'field' }, [h('label', {}, `Ingredients (${(parsed.ingredients || []).length})`),
      h('pre', { style: preStyle() }, ingText)]),
    h('div', { class: 'field' }, [h('label', {}, `Steps (${(parsed.steps || []).length})`),
      h('pre', { style: preStyle() }, stepText)])
  ]);
  modal({
    title: 'Import preview',
    content: body,
    actions: [
      { label: 'Discard', value: null },
      { label: 'Edit', value: 'edit' },
      { label: 'Save', primary: true, value: 'save' }
    ]
  }).then(async (action) => {
    if (!action) {
      // Cancelled import: log it so the connector can be improved later.
      await logImportCancelled(parsed);
      return;
    }
    const draft = { ...blankRecipe(), ...parsed };
    // Keep the raw parse as a baseline to measure corrections against.
    draft.imported = recipeSnapshot(parsed);
    if (action === 'edit') {
      sessionStorage.setItem('importDraft', JSON.stringify(draft));
      navigate('/recipe/new/edit');
    } else if (action === 'save') {
      const saved = await store.saveRecipe(draft);
      await logImportSaved(saved);
      toast('Recipe imported');
      navigate(`/recipe/${saved.id}`);
    }
  });
}

function preStyle() {
  return 'white-space:pre-wrap;background:var(--surface-2);padding:10px;border-radius:10px;max-height:160px;overflow:auto;font:inherit;margin:0';
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.innerHTML = busy ? '<span class="spinner"></span>' : '';
  btn.append(document.createTextNode(' ' + label));
}

// Backup / restore everything as a JSON file (fully offline, portable).
function backupSection() {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
  fileInput.onchange = async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const replace = await modal({
        title: 'Restore backup',
        content: h('p', { style: 'margin:0' }, `Found ${(data.recipes || []).length} recipes and ${(data.lists || []).length} lists. Merge with your data or replace everything?`),
        actions: [
          { label: 'Cancel', value: undefined },
          { label: 'Merge', value: false },
          { label: 'Replace all', danger: true, value: true }
        ]
      });
      if (replace === undefined) return;
      await store.importAll(data, { replace });
      toast('Backup restored');
      navigate('/recipes');
    } catch (err) {
      toast('Invalid backup file');
      console.error(err);
    }
    fileInput.value = '';
  };

  return h('div', { class: 'section' }, [
    h('h2', { style: 'margin-top:0' }, '💾 Backup & restore'),
    h('p', { class: 'muted', style: 'margin-top:0;font-size:0.85rem' },
      'Everything lives on this device. Export a file to keep it safe or move it to another device.'),
    h('div', { class: 'row', style: 'gap:10px' }, [
      h('button', { class: 'btn grow', onclick: exportData }, '⬇️ Export'),
      h('button', { class: 'btn grow', onclick: () => fileInput.click() }, '⬆️ Restore'),
      fileInput
    ])
  ]);
}
