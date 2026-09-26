export const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// GET si no hay body; POST (u otro método) con JSON si lo hay
export async function api(url, body, method) {
  const opts = body === undefined && !method ? {} : { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) };
  const res = await fetch(url, { credentials: 'same-origin', ...opts });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.blob();
  if (!res.ok) { const e = new Error(data?.error || `Error ${res.status}`); e.status = res.status; throw e; }
  return data;
}

export function toast(text, kind = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = Object.assign(document.createElement('div'), { id: 'toasts', className: 'toasts' }); document.body.appendChild(box); }
  const t = Object.assign(document.createElement('div'), { className: `toast ${kind}`, textContent: text });
  box.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

// Contenido del logo: imagen y/o nombre según la configuración de la marca
export function brandHTML(site) {
  const mode = site.logoMode || 'logo+name';
  const img = site.logo && mode !== 'name' ? `<img class="logo-img" src="${esc(site.logo)}" alt="${esc(site.name)}">` : '';
  const mark = img || '<span class="logo-mark" aria-hidden="true"><i></i><i></i><i></i></span>';
  const name = !img || mode !== 'logo' ? `<span class="logo-text">${esc(site.name)}</span>` : '';
  return mark + name;
}

// Aplica nombre, logo, color y favicon a la página
export function applyBrand(site) {
  document.querySelectorAll('[data-brand]').forEach((el) => { el.innerHTML = brandHTML(site); });
  document.querySelectorAll('[data-brand-name]').forEach((el) => { el.textContent = site.name; });
  if (site.accent) document.documentElement.style.setProperty('--accent', site.accent);
  if (site.logo && !site.preview) document.querySelectorAll('link[rel=icon]').forEach((l) => { l.href = site.logo; l.type = 'image/png'; });
}
