// Import recipes from URLs (schema.org JSON-LD), text, and photos (OCR).
import { parseRecipeText, parseIngredient } from './parse.js';

// CORS proxies tried in order; static-site browsers can't fetch cross-origin HTML directly.
const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://r.jina.ai/${u}` // returns readable text/markdown
];

async function fetchThrough(url) {
  let lastErr;
  for (const make of PROXIES) {
    try {
      const res = await fetch(make(url), { headers: { Accept: 'text/html,*/*' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (text && text.length > 50) return text;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not reach the page.');
}

// Pull recipe from a web page URL.
export async function importFromUrl(url) {
  const body = await fetchThrough(url);
  // Prefer structured schema.org Recipe data when the page provides it.
  const recipe = extractFromHtml(body);
  if (recipe && (recipe.ingredients.length || recipe.steps.length)) {
    recipe.source = { type: 'url', url };
    return recipe;
  }
  // Fallback: treat as readable text (handles r.jina.ai output and plain pages).
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(body);
  const text = looksHtml ? stripHtml(body) : body;
  const parsed = parseRecipeText(text);
  parsed.source = { type: 'url', url };
  return parsed;
}

export function extractFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  for (const s of scripts) {
    let data;
    try { data = JSON.parse(s.textContent); } catch { continue; }
    const node = findRecipeNode(data);
    if (node) return recipeFromJsonLd(node, doc);
  }
  return null;
}

function findRecipeNode(data) {
  const items = [];
  const collect = (d) => {
    if (!d || typeof d !== 'object') return;
    if (Array.isArray(d)) return d.forEach(collect);
    if (d['@graph']) collect(d['@graph']);
    items.push(d);
  };
  collect(data);
  return items.find((it) => {
    const t = it['@type'];
    return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
  });
}

function recipeFromJsonLd(node, doc) {
  const text = (v) => (typeof v === 'string' ? v : v && v.text) || '';
  const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

  const ingredients = arr(node.recipeIngredient).map((s) => parseIngredient(String(s))).filter(Boolean);

  let steps = [];
  const inst = node.recipeInstructions;
  if (typeof inst === 'string') {
    steps = inst.split(/\r?\n|(?<=\.)\s{2,}/).map((s) => s.trim()).filter(Boolean);
  } else {
    const flat = [];
    const walk = (i) => {
      arr(i).forEach((step) => {
        if (typeof step === 'string') flat.push(step);
        else if (step['@type'] === 'HowToSection' && step.itemListElement) walk(step.itemListElement);
        else if (step.text) flat.push(text(step.text));
      });
    };
    walk(inst);
    steps = flat.map((s) => s.trim()).filter(Boolean);
  }

  let image = '';
  const img = node.image;
  if (typeof img === 'string') image = img;
  else if (Array.isArray(img)) image = typeof img[0] === 'string' ? img[0] : (img[0] && img[0].url) || '';
  else if (img && img.url) image = img.url;

  const tags = []
    .concat(arr(node.recipeCategory), arr(node.recipeCuisine), arr(node.keywords))
    .flatMap((t) => String(t).split(','))
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 6);

  return {
    title: text(node.name) || (doc && doc.title) || 'Imported recipe',
    description: text(node.description),
    image,
    servings: parseInt(arr(node.recipeYield)[0], 10) || 2,
    prepTime: isoDuration(node.prepTime),
    cookTime: isoDuration(node.cookTime) || isoDuration(node.totalTime),
    ingredients,
    steps,
    tags: [...new Set(tags)]
  };
}

function isoDuration(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return '';
  const hrs = m[1] ? +m[1] : 0;
  const min = m[2] ? +m[2] : 0;
  if (!hrs && !min) return '';
  return [hrs ? hrs + ' h' : '', min ? min + ' min' : ''].filter(Boolean).join(' ');
}

function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,nav,footer,header,noscript').forEach((n) => n.remove());
  const main = doc.querySelector('main, article, [itemtype*="Recipe"]') || doc.body;
  return (main ? main.innerText || main.textContent : '').replace(/\n{3,}/g, '\n\n');
}

// OCR a photo via Tesseract.js (lazy-loaded from CDN, cached by the service worker).
let tesseractPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error('Could not load OCR engine (offline?).'));
    document.head.append(s);
  });
  return tesseractPromise;
}

export async function ocrImage(fileOrUrl, onProgress) {
  const Tesseract = await loadTesseract();
  const { data } = await Tesseract.recognize(fileOrUrl, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
    }
  });
  return data.text || '';
}
