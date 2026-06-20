// Import recipes from a web URL, pasted text (e.g. Instagram caption), or a photo.
import { h, setTopbar, toast, modal, fileToDataURL } from '../ui.js';
import { navigate } from '../router.js';
import { importFromUrl, ocrImage } from '../import.js';
import { parseRecipeText, ingredientToString } from '../parse.js';
import { store, blankRecipe } from '../store.js';
import { exportData } from '../backup.js';
import { logImportCancelled, logImportSaved, recipeSnapshot } from '../feedback.js';

export async function importView(_params, root) {
  setTopbar({ title: 'Import' });
  root.innerHTML = '';

  root.append(
    section('🌐 From a website', 'Paste a recipe URL. We read the page’s structured recipe data when available.', [
      urlForm()
    ]),
    section('📝 Paste text', 'From an Instagram caption, a note, or a message. We’ll split ingredients and steps.', [
      textForm()
    ]),
    section('📷 From a photo', 'Snap or upload a photo of a recipe; text is read on-device (OCR).', [
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
  const file = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden' });
  const btn = h('button', { class: 'btn btn--primary', onclick: () => file.click() }, '📷 Choose photo');
  const status = h('div', { class: 'muted', style: 'margin-top:8px;font-size:0.85rem' });
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    status.innerHTML = '<span class="spinner"></span> Reading text… 0%';
    try {
      const dataUrl = await fileToDataURL(f, 1600, 0.9);
      const text = await ocrImage(dataUrl, (p) => {
        status.innerHTML = `<span class="spinner"></span> Reading text… ${Math.round(p * 100)}%`;
      });
      status.textContent = '';
      if (!text.trim()) { toast('No text found in image'); return; }
      const parsed = parseRecipeText(text);
      parsed.image = dataUrl;
      parsed.source = { type: 'photo' };
      preview(parsed);
    } catch (err) {
      status.textContent = '';
      toast(err.message || 'OCR failed');
      console.error(err);
    }
    file.value = '';
  };
  return h('div', {}, [btn, file, status]);
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
