// Hash-based router. Routes are registered as { pattern, handler }.
// Pattern segments starting with ':' are params.

const routes = [];

export function route(pattern, handler) {
  routes.push({ parts: pattern.split('/').filter(Boolean), handler });
}

export function navigate(path) {
  if (('#' + path) === location.hash) handleRoute();
  else location.hash = path;
}

export function back() {
  history.back();
}

function match(parts, hashParts) {
  if (parts.length !== hashParts.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(hashParts[i]);
    else if (parts[i] !== hashParts[i]) return null;
  }
  return params;
}

let current = null;

export async function handleRoute() {
  const hash = location.hash.replace(/^#/, '') || '/recipes';
  const hashParts = hash.split('/').filter(Boolean);
  const viewEl = document.getElementById('view');

  for (const r of routes) {
    const params = match(r.parts, hashParts);
    if (params) {
      current = hash;
      viewEl.scrollTo?.(0, 0);
      window.scrollTo(0, 0);
      // Restore app chrome (cook mode hides it and may be left via browser back).
      document.querySelector('.topbar').style.display = '';
      document.querySelector('.tabbar').style.display = '';
      updateTabs(hashParts[0]);
      try {
        await r.handler(params, viewEl);
      } catch (err) {
        console.error(err);
        viewEl.innerHTML = '<div class="empty"><div class="empty__emoji">⚠️</div><h3>Something went wrong</h3><p class="muted">' +
          (err && err.message ? err.message : '') + '</p></div>';
      }
      return;
    }
  }
  // Fallback
  navigate('/recipes');
}

function updateTabs(top) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === top);
  });
}

export function startRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
