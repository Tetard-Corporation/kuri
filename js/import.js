// Import recipes from URLs (schema.org JSON-LD), text, and photos (OCR).
import { parseRecipeText, parseIngredient, cleanText } from './parse.js';

// Static-site browsers can't fetch cross-origin HTML directly (CORS), so we go
// through public read-only proxies. Jina (r.jina.ai) is reliable and CORS-enabled:
// in HTML mode it preserves the page's schema.org data; its default markdown mode
// is great for social posts (the caption lands in the "Title:" field).

async function fetchVia(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  if (!text || text.length < 40) throw new Error('Empty response');
  return text;
}

// Fetch the page HTML (for structured-data extraction).
async function fetchHtml(url) {
  const attempts = [
    () => fetchVia(`https://r.jina.ai/${url}`, { headers: { 'X-Return-Format': 'html' } }),
    () => fetchVia(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`),
    () => fetchVia(`https://corsproxy.io/?url=${encodeURIComponent(url)}`)
  ];
  for (const attempt of attempts) {
    try { return await attempt(); } catch { /* try next */ }
  }
  return null;
}

// Fetch readable markdown (Jina's reader view) — best for pages without structured data.
async function fetchReadable(url) {
  try { return await fetchVia(`https://r.jina.ai/${url}`); } catch { return null; }
}

// Pull a recipe from a web page URL, trying the most accurate source first.
export async function importFromUrl(url) {
  const src = { type: /instagram\.com/i.test(url) ? 'instagram' : 'url', url };

  // 1) Structured schema.org/Recipe data (most accurate).
  const html = await fetchHtml(url);
  if (html) {
    const recipe = extractFromHtml(html);
    if (recipe && (recipe.ingredients.length || recipe.steps.length)) {
      recipe.source = src;
      return recipe;
    }
    // 1b) Some sites put the whole recipe in the og:description meta tag.
    const metaText = extractMetaText(html);
    if (metaText && metaText.length > 120) {
      const parsed = parseRecipeText(metaText);
      if (parsed.ingredients.length || parsed.steps.length) { parsed.source = src; return parsed; }
    }
  }

  // 2) Readable markdown fallback (handles social posts like Instagram).
  const md = await fetchReadable(url);
  if (md) {
    const { title, body } = parseJinaMarkdown(md);
    // Prefer the article body; if it's empty/junk (e.g. a login wall), fall back to
    // the title — for social posts the full caption lives there.
    const fromBody = parseRecipeText((title ? title + '\n' : '') + body);
    const fromCaption = title ? parseRecipeText(captionFromTitle(title)) : fromBody;
    // Ingredient count is the reliable signal — a login wall inflates step count with
    // junk but adds no ingredients. Prefer the caption (cleaner title) when it ties.
    const ings = (p) => p.ingredients.length;
    const best = (ings(fromCaption) > 0 && ings(fromCaption) >= ings(fromBody)) ? fromCaption : fromBody;
    best.title = cleanSocialTitle(best.title);
    best.steps = best.steps.map((s) => s.replace(/^["“]+|["”]+$/g, '').trim()).filter(Boolean);
    best.source = src;
    return best;
  }

  throw new Error('Could not reach the page.');
}

// Read the recipe-bearing meta tags from page HTML.
function extractMetaText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pick = (sel) => doc.querySelector(sel)?.getAttribute('content') || '';
  const candidates = [
    pick('meta[property="og:description"]'),
    pick('meta[name="description"]'),
    pick('meta[name="twitter:description"]')
  ].map((s) => s.trim());
  return candidates.sort((a, b) => b.length - a.length)[0] || '';
}

// Jina's markdown output starts with "Title: …", "URL Source: …", then "Markdown Content:".
function parseJinaMarkdown(md) {
  const titleMatch = md.match(/^Title:\s*([\s\S]*?)\n(?:URL Source:|Published Time:|Markdown Content:)/m);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const idx = md.indexOf('Markdown Content:');
  let body = idx >= 0 ? md.slice(idx + 'Markdown Content:'.length) : md;
  body = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')        // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')      // links -> text
    .replace(/^={3,}|^-{3,}|^#{1,6}\s*/gm, '');   // heading/rule markers
  return { title, body };
}

// For social posts Jina's title is like: `Author on Instagram: "<caption>"`.
// The caption (the actual recipe) sits between the first and last quote.
function captionFromTitle(title) {
  const m = title.match(/["“]([\s\S]+)["”]/);
  return (m ? m[1] : title).trim();
}

// Strip a leading social-stats prefix and surrounding quotes from a title, e.g.
// `12K likes, 81 comments - user on June 12, 2026: "Scarpaccia` -> `Scarpaccia`.
function cleanSocialTitle(title) {
  return String(title)
    .split('\n')[0]
    .replace(/^[\d.,]+\s*[KkMm]?\s*(likes?|j’aime|j'aime).*?:\s*/i, '')
    .replace(/^["“]+|["”]+$/g, '')
    .trim() || 'Imported recipe';
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

  const ingredients = arr(node.recipeIngredient)
    .map((s) => parseIngredient(cleanText(String(s)))).filter(Boolean);

  let steps = [];
  const inst = node.recipeInstructions;
  if (typeof inst === 'string') {
    steps = cleanText(inst).split(/\r?\n|(?<=\.)\s{2,}/).map((s) => s.trim()).filter(Boolean);
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
    steps = flat.map((s) => cleanText(s)).filter(Boolean);
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
    title: cleanText(text(node.name)) || (doc && doc.title) || 'Imported recipe',
    description: cleanText(text(node.description)),
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

// OCR via Tesseract.js (lazy-loaded from CDN, cached by the service worker).
const OCR_CDNS = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js'
];
let tesseractPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error('load failed: ' + src));
    document.head.append(s);
  });
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = (async () => {
    let lastErr;
    for (const cdn of OCR_CDNS) {
      try { return await loadScript(cdn); } catch (e) { lastErr = e; }
    }
    tesseractPromise = null;
    throw new Error('Could not load the OCR engine. Check your connection and try again.');
  })();
  return tesseractPromise;
}

// Higher-accuracy ("best") trained models, served by the Tesseract.js CDN.
const TESSDATA_BEST = 'https://tessdata.projectnaptha.com/4.0.0_best';

// OCR several images in one worker. langs default to French + English for recipes.
// onProgress(fraction, index, total) reports per-image progress.
export async function ocrImages(images, { langs = 'eng+fra', onProgress, preprocess = true } = {}) {
  const list = (images || []).filter(Boolean);
  if (!list.length) return [];
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker(langs, 1, {
    langPath: TESSDATA_BEST,
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
    }
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '6',        // assume a single uniform block of text
      preserve_interword_spaces: '1'
    });
    const texts = [];
    for (let i = 0; i < list.length; i++) {
      onProgress && onProgress(0, i, list.length);
      const img = preprocess ? await preprocessForOCR(list[i]).catch(() => list[i]) : list[i];
      const { data } = await worker.recognize(img);
      texts.push(data.text || '');
    }
    return texts;
  } finally {
    await worker.terminate();
  }
}

// Prepare a photo for OCR: upscale small text, greyscale, and stretch contrast.
// (Tesseract is very sensitive to input quality; this is the biggest lever.)
export function preprocessForOCR(src, { target = 1800, maxDim = 2600 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        const longSide = Math.max(w, h);
        let scale = 1;
        if (longSide < target) scale = target / longSide;       // upscale small photos
        else if (longSide > maxDim) scale = maxDim / longSide;   // cap huge ones
        w = Math.round(w * scale);
        h = Math.round(h * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const id = ctx.getImageData(0, 0, w, h);
        const d = id.data;

        // Greyscale + luminance histogram.
        const hist = new Uint32Array(256);
        for (let p = 0; p < d.length; p += 4) {
          const g = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) | 0;
          d[p] = d[p + 1] = d[p + 2] = g;
          hist[g]++;
        }
        // Contrast stretch between the 2nd and 98th percentiles.
        const total = w * h;
        const lo = percentile(hist, total, 0.02);
        const hi = percentile(hist, total, 0.98);
        const range = Math.max(1, hi - lo);
        const lut = new Uint8ClampedArray(256);
        for (let v = 0; v < 256; v++) lut[v] = Math.round(((v - lo) * 255) / range);
        for (let p = 0; p < d.length; p += 4) {
          const v = lut[d[p]];
          d[p] = d[p + 1] = d[p + 2] = v;
        }
        ctx.putImageData(id, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function percentile(hist, total, frac) {
  const goal = total * frac;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= goal) return v;
  }
  return 255;
}

export async function ocrImage(image, onProgress) {
  const [text] = await ocrImages([image], { onProgress: (p) => onProgress && onProgress(p) });
  return text || '';
}
