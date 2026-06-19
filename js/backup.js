// Backup helpers: export all data to a JSON file and a floating "back up"
// reminder that nudges the user once enough recipes are unsaved-since-export.
import { store } from './store.js';
import { h, toast } from './ui.js';

const DAY = 24 * 60 * 60 * 1000;
const THRESHOLD = 3;   // show after this many recipes changed since last export
const SNOOZE = 3 * DAY; // "remind me later" delay

async function getCfg() {
  return (await store.getMeta('backup'))?.value || {};
}
function setCfg(cfg) {
  return store.setMeta('backup', cfg);
}

// Export everything as a downloadable JSON file and record the time.
export async function exportData() {
  const data = await store.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `hostel-recipes-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const cfg = await getCfg();
  cfg.lastExport = Date.now();
  cfg.snoozeUntil = 0;
  await setCfg(cfg);
  toast('Backup exported 💾');
  refreshBackupReminder();
}

let el = null;

// Re-evaluate whether the reminder should be visible. Safe to call often.
export async function refreshBackupReminder() {
  const cfg = await getCfg();
  const now = Date.now();

  // First run: set a baseline so the bundled sample recipes don't nag.
  if (cfg.baseline == null) {
    cfg.baseline = now;
    await setCfg(cfg);
  }

  const recipes = await store.allRecipes();
  const checkpoint = Math.max(cfg.lastExport || 0, cfg.baseline || 0);
  const pending = recipes.filter((r) => (r.updatedAt || 0) > checkpoint).length;
  const due = recipes.length > 0 && pending >= THRESHOLD && now > (cfg.snoozeUntil || 0);

  render(due, pending);
}

function render(show, pending) {
  if (!show) { el?.remove(); el = null; return; }
  if (el) {
    el.querySelector('.backup-nudge__sub').textContent = `${pending} recipes not backed up`;
    return;
  }
  el = h('div', { class: 'backup-nudge', role: 'status' }, [
    h('button', { class: 'backup-nudge__main', onclick: exportData, title: 'Export a backup file' }, [
      h('span', { class: 'backup-nudge__icon' }, '💾'),
      h('span', {}, [
        h('strong', {}, 'Back up your recipes'),
        h('div', { class: 'backup-nudge__sub' }, `${pending} recipes not backed up`)
      ])
    ]),
    h('button', { class: 'backup-nudge__close', title: 'Remind me later', onclick: snooze }, '×')
  ]);
  document.body.append(el);
}

async function snooze() {
  const cfg = await getCfg();
  cfg.snoozeUntil = Date.now() + SNOOZE;
  await setCfg(cfg);
  toast('We’ll remind you later');
  render(false);
}
