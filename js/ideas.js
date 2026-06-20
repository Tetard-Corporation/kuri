// "Seasonal ideas" popup: suggests recipe combinations from seasonal produce,
// or from what the user taps that they have on hand.
import { h, modal } from './ui.js';
import { navigate } from './router.js';
import { getSeasonal, pickIdea, ideaTitle, monthName } from './seasonal.js';

export async function openIdeasPopup() {
  const month = new Date().getMonth() + 1;
  const season = getSeasonal(month);
  const selected = new Set();
  let idea = pickIdea(month, []);

  const ideaEl = h('div', { class: 'ideas-idea' });
  function renderIdea() {
    idea = pickIdea(month, [...selected]);
    ideaEl.innerHTML = '';
    ideaEl.append(
      h('div', { class: 'ideas-idea__label' }, selected.size ? 'With what you picked' : 'Try this'),
      h('div', { class: 'ideas-idea__main' }, capitalize(idea.ingredient)),
      h('div', { class: 'ideas-idea__sub' }, [idea.prep, ...idea.companions].join(' · '))
    );
  }

  const chipFor = (name) => {
    const c = h('button', { class: 'chip', onclick: () => {
      if (selected.has(name)) { selected.delete(name); c.classList.remove('active'); }
      else { selected.add(name); c.classList.add('active'); }
      renderIdea();
    } }, name);
    return c;
  };

  renderIdea();

  const content = h('div', {}, [
    h('p', { class: 'muted', style: 'margin:0 0 10px;font-size:0.85rem' },
      `In season now · ${monthName(month)}. Tap what you have, or just shuffle for inspiration.`),
    ideaEl,
    h('button', { class: 'btn btn--block', style: 'margin-bottom:6px', onclick: renderIdea }, '🎲 Another idea'),
    h('div', { class: 'ideas-h' }, '🥬 Vegetables in season'),
    h('div', { class: 'chips' }, season.vegetables.map(chipFor)),
    h('div', { class: 'ideas-h' }, '🍑 Fruits in season'),
    h('div', { class: 'chips' }, season.fruits.map(chipFor))
  ]);

  const result = await modal({
    title: '💡 Seasonal ideas',
    content,
    actions: [
      { label: 'Close', value: null },
      { label: '✨ Start a recipe', primary: true, onClick: () => idea }
    ]
  });

  if (result) {
    const draft = {
      title: ideaTitle(result),
      emoji: result.type === 'fruit' ? '🍑' : '🥬',
      tags: [result.ingredient, 'de saison'],
      description: `Idea: ${result.ingredient} ${result.prep}, with ${result.companions.join(' & ')}.`
    };
    sessionStorage.setItem('importDraft', JSON.stringify(draft));
    navigate('/recipe/new/edit');
  }
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
