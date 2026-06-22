// Regression test for the import connectors, driven by real user feedback stored
// in connector-feedback/. Run: node test/connector.test.mjs
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseIngredientList, ingredientToString } from '../js/parse.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fbDir = join(dir, '..', 'connector-feedback');

let pass = 0;
let fail = 0;
const failures = [];

for (const file of readdirSync(fbDir).filter((f) => f.endsWith('.json'))) {
  const data = JSON.parse(readFileSync(join(fbDir, file), 'utf8'));
  for (const e of data.feedback || []) {
    if (e.type !== 'import-corrected') continue;
    // Text imports are clean enough that the parser should reproduce the user's
    // corrected ingredient lines exactly. (Photo imports are OCR-limited.)
    if ((e.source || {}).type !== 'text') continue;
    if (!e.imported?.ingredients || !e.after?.ingredients) continue;
    const got = parseIngredientList(e.imported.ingredients.map((i) => i.text).join('\n')).map(ingredientToString);
    const want = e.after.ingredients.map((i) => i.text);
    if (JSON.stringify(got) === JSON.stringify(want)) {
      pass++;
    } else {
      fail++;
      failures.push({ title: e.imported.title, got, want });
    }
  }
}

// Standalone lowercase items must never be merged into the previous ingredient.
const clean = parseIngredientList("200 g farine\nsel\nhuile d'olive\n2 oeufs\npoivre").map(ingredientToString);
const cleanOk = JSON.stringify(clean) === JSON.stringify(['200 g farine', 'sel', "huile d'olive", '2 oeufs', 'poivre']);
if (cleanOk) pass++; else { fail++; failures.push({ title: 'clean-input safety', got: clean, want: ['…'] }); }

for (const f of failures) {
  console.error('FAIL:', f.title);
  console.error('  got :', JSON.stringify(f.got));
  console.error('  want:', JSON.stringify(f.want));
}
console.log(`\nconnector tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
