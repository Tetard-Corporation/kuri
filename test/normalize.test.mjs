// Regression tests for ingredient normalization / standardization.
// Run: node test/normalize.test.mjs
import { ingredientKey, ingredientLabel, aggregateShopping, isServingLine, extractServings } from '../js/parse.js';

let pass = 0;
let fail = 0;
function check(cond, msg, got) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', msg, '=>', JSON.stringify(got)); }
}
const eq = (a, b, msg) => check(a === b, msg, a);

// --- serving lines are not ingredients ---
check(isServingLine('Pour 4 à 6 personnes'), 'serving range', true);
check(isServingLine('Pour 4 personnes'), 'serving simple', true);
check(isServingLine('Serves 4'), 'serving english', true);
check(!isServingLine('4 oeufs'), 'eggs are not a serving line', false);
eq(extractServings('Pour 4 à 6 personnes'), 4, 'servings from range = lower bound');
eq(ingredientKey('Pour 4 à 6 personnes'), '', 'serving -> empty key');
eq(ingredientKey('Sel à votre goût'), 'sel', 'goût stripped, sel kept');

// --- accent / ligature / plural / synonym merges ---
const merge = (a, b, msg) => check(ingredientKey(a) === ingredientKey(b) && ingredientKey(a) !== '', msg, [ingredientKey(a), ingredientKey(b)]);
merge('œufs', 'oeuf', 'oeuf ligature');
merge('Oignons rouges', 'oignon', 'oignon plural+colour');
merge('Épinards frais', 'epinard', 'epinard accent');
merge('patate', 'pommes de terre', 'patate = pomme de terre');
merge('Échalote', 'echalottes', 'echalote spelling/plural');
merge("huile d'olive", 'Huile dolive', 'huile olive');
merge('Tomates cerises', 'tomate cerise', 'tomate cerise plural');

// --- pretty display labels ---
eq(ingredientLabel('pommes de terre'), 'Pomme de terre', 'pdt label');
eq(ingredientLabel('œufs'), 'Œufs', 'oeuf label');
eq(ingredientLabel('Oignons rouges'), 'Oignons', 'oignon label keeps plural, drops colour');

// --- unit-family standardization + cross-recipe merge ---
const items = aggregateShopping([
  { ing: { name: 'farine', qty: 500, unit: 'g' }, recipe: { id: 'a', title: 'A' } },
  { ing: { name: 'Farine', qty: 1, unit: 'kg' }, recipe: { id: 'b', title: 'B' } },
  { ing: { name: 'lait', qty: 40, unit: 'cl' }, recipe: { id: 'a', title: 'A' } },
  { ing: { name: 'lait', qty: 20, unit: 'cl' }, recipe: { id: 'b', title: 'B' } },
  { ing: { name: 'Pour 4 à 6 personnes', qty: null, unit: null }, recipe: { id: 'a', title: 'A' } }
]);
const byName = Object.fromEntries(items.map((i) => [i.name, i]));
eq(byName['Farine'].qty, '1½ kg', 'mass 500 g + 1 kg -> 1.5 kg');
eq(byName['Lait'].qty, '60 cl', 'volume 40 cl + 20 cl -> 60 cl');
check(byName['Farine'].recipes.length === 2, 'farine from two recipes', byName['Farine'].recipes.length);
check(!items.some((i) => /personne/i.test(i.name)), 'serving line never reaches the list', items.map((i) => i.name));

console.log(`normalize tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
