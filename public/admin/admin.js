import { money, esc, api, toast, brandHTML, applyBrand } from '/js/common.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $('#view');
let me = null;

/* ================= Utilidades ================= */
const fmtDate = (s) => (s ? new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const pct = (n) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);
const STATUS = { nuevo: ['Nuevo', 'info'], pagado: ['Pagado', 'ok'], en_produccion: ['En producción', 'accent'], enviado: ['Enviado', 'warn'], entregado: ['Entregado', 'ok'], cancelado: ['Cancelado', 'danger'] };
const PAY = { aprobado: 'ok', pendiente: 'warn', rechazado: 'danger', cancelado: 'danger', devuelto: 'danger' };
const CHANNEL = { web: 'Web', mercadolibre: 'MercadoLibre', whatsapp: 'WhatsApp', manual: 'Manual' };
const statusTag = (s) => `<span class="tag ${STATUS[s]?.[1] || ''}">${STATUS[s]?.[0] || esc(s)}</span>`;
const payTag = (s) => `<span class="tag ${PAY[s] || ''}">${esc(s)}</span>`;
const err = (e) => toast(e.message, 'err');

function setPage(title, actions = '') {
  $('#pageTitle').textContent = title;
  $('#pageActions').innerHTML = actions;
  document.title = `${title} · Panel`;
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); } catch { prompt('Copiá el texto:', text); }
}

// Modal genérico. onSubmit recibe el <form>; si devuelve false el modal queda abierto.
function modal(title, body, { submit = 'Guardar', onSubmit, extra = '', wide = false } = {}) {
  const d = $('#modal');
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalFoot').innerHTML = onSubmit ? `${extra}<button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn primary" value="ok">${submit}</button>` : extra;
  d.style.width = wide ? 'min(1000px, calc(100% - 24px))' : '';
  const form = $('#modalForm');
  form.onsubmit = async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    try { if ((await onSubmit(form)) !== false) d.close(); } catch (x) { err(x); } finally { btn.disabled = false; }
  };
  d.showModal();
  return d;
}

/* ---------- Formularios declarativos ----------
   Campos: [key, label, type, opts]  type: text|textarea|number|bool|color|select|list|products|date */
function field(prefix, [key, label, type = 'text', opts = {}], value) {
  const name = `${prefix}${key}`;
  const cls = opts.full || type === 'textarea' || type === 'list' || type === 'products' ? 'f full' : 'f';
  if (type === 'bool') return `<label class="switch ${opts.full ? 'full' : ''}"><input type="checkbox" name="${name}" ${value !== false && value != null ? 'checked' : ''}> ${esc(label)}</label>`;
  if (type === 'textarea') return `<label class="${cls}">${esc(label)}<textarea name="${name}" rows="${opts.rows || 3}">${esc(value ?? '')}</textarea>${opts.hint ? `<p class="hint">${opts.hint}</p>` : ''}</label>`;
  if (type === 'select') return `<label class="${cls}">${esc(label)}<select name="${name}">${opts.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  if (type === 'color') return `<label class="${cls}">${esc(label)}<input type="color" name="${name}" value="${esc(value || '#ff5a1f')}"></label>`;
  if (type === 'products') {
    const sel = new Set(value || []);
    return `<fieldset class="${cls}" style="border:0;padding:0;margin:0">${esc(label)}<div class="filters">${opts.products.map((p) => `<label class="check"><input type="checkbox" name="${name}" value="${esc(p.slug)}" ${sel.has(p.slug) ? 'checked' : ''}> ${esc(p.name)}</label>`).join('')}</div></fieldset>`;
  }
  if (type === 'list') {
    const items = Array.isArray(value) ? value : [];
    return `<div class="${cls}"><span>${esc(label)}</span><div class="list-editor" data-list="${name}" data-fields='${esc(JSON.stringify(opts.fields))}'>${items.map((it) => listItem(opts.fields, it)).join('')}</div><button type="button" class="btn sm" data-add-item="${name}" style="margin-top:8px">+ Agregar</button></div>`;
  }
  return `<label class="${cls}">${esc(label)}<input type="${type}" name="${name}" value="${esc(value ?? '')}" ${opts.step ? `step="${opts.step}"` : ''} ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''} ${opts.required ? 'required' : ''}>${opts.hint ? `<p class="hint">${opts.hint}</p>` : ''}</label>`;
}
function listItem(fields, it = {}) {
  return `<div class="list-item">${fields.map(([k, l, t = 'text']) => (t === 'textarea'
    ? `<label class="f wide">${esc(l)}<textarea data-k="${k}" rows="2">${esc(it[k] ?? '')}</textarea></label>`
    : `<label class="f">${esc(l)}<input data-k="${k}" type="${t}" value="${esc(it[k] ?? '')}"></label>`)).join('')}<button type="button" class="btn sm danger rm" data-rm-item>×</button></div>`;
}
function renderForm(fields, values = {}, prefix = '') {
  return `<div class="form">${fields.map((f) => field(prefix, f, values[f[0]])).join('')}</div>`;
}
function readForm(form, fields, prefix = '') {
  const out = {};
  for (const [key, , type = 'text'] of fields) {
    const name = `${prefix}${key}`;
    if (type === 'bool') out[key] = !!form.querySelector(`[name="${name}"]`)?.checked;
    else if (type === 'products') out[key] = $$(`[name="${name}"]:checked`, form).map((i) => i.value);
    else if (type === 'list') {
      out[key] = $$(`[data-list="${name}"] .list-item`, form).map((row) => Object.fromEntries($$('[data-k]', row).map((i) => [i.dataset.k, i.type === 'number' ? Number(i.value) : i.value])));
    } else if (type === 'number') { const v = form.querySelector(`[name="${name}"]`)?.value; out[key] = v === '' ? null : Number(v); }
    else out[key] = form.querySelector(`[name="${name}"]`)?.value ?? '';
  }
  return out;
}
document.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add-item]');
  if (add) {
    const list = $(`[data-list="${add.dataset.addItem}"]`, add.parentElement);
    list.insertAdjacentHTML('beforeend', listItem(JSON.parse(list.dataset.fields)));
  }
  const rm = e.target.closest('[data-rm-item]');
  if (rm) rm.closest('.list-item').remove();
});

// Gráfico de barras simple en SVG
function barChart(rows, { value = 'revenue', label = 'day' } = {}) {
  if (!rows.length) return '<p class="empty">Todavía no hay ventas en este período.</p>';
  const max = Math.max(...rows.map((r) => r[value] || 0), 1);
  const w = 100 / rows.length;
  return `<svg class="chart" viewBox="0 0 100 50" preserveAspectRatio="none"><defs><linearGradient id="bg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5a1f"/><stop offset="1" stop-color="#ffc34d"/></linearGradient></defs>
    ${rows.map((r, i) => { const h = r[value] ? Math.max(0.8, (r[value] / max) * 46) : 0.4; return `<rect x="${i * w + w * 0.15}" y="${50 - h}" width="${w * 0.7}" height="${h}" rx=".6" fill="url(#bg)"><title>${esc(r[label])}: ${money(r[value])} (${r.orders} pedidos)</title></rect>`; }).join('')}</svg>
    <div class="muted small" style="display:flex;justify-content:space-between"><span>${esc(rows[0][label])}</span><span>${esc(rows.at(-1)[label])}</span></div>`;
}
function bars(rows, { label, value, fmt = money }) {
  if (!rows.length) return '<p class="empty">Sin datos todavía.</p>';
  const max = Math.max(...rows.map((r) => r[value] || 0), 1);
  return `<div class="bars">${rows.map((r) => `<div class="bar-row"><span>${esc(r[label])}</span><div class="track"><i style="width:${((r[value] || 0) / max) * 100}%"></i></div><strong>${fmt(r[value] || 0)}</strong></div>`).join('')}</div>`;
}

// Completa los días sin ventas para que el gráfico muestre los 30 días
function last30(rows) {
  const map = Object.fromEntries(rows.map((r) => [r.day, r]));
  return Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10);
    return map[day] || { day, orders: 0, revenue: 0 };
  });
}

/* ================= Vistas ================= */
const ADMIN_MENU = [
  ['dashboard', '📊', 'Resumen'], ['pedidos', '🧾', 'Pedidos'], ['productos', '🧩', 'Productos'], ['marca', '🏷️', 'Marca y logo'], ['contenido', '🎨', 'Contenido del sitio'],
  ['sep', 'Ventas'], ['cupones', '🎟️', 'Cupones'], ['vendedores', '🧑‍💼', 'Vendedores'],
  ['sep', 'Canales'], ['redes', '📣', 'Redes sociales'], ['whatsapp', '💬', 'Bot de WhatsApp'], ['mercadolibre', '🛒', 'MercadoLibre'],
  ['sep', 'Sistema'], ['integraciones', '🔌', 'Integraciones'], ['cuenta', '👤', 'Mi cuenta'],
];
const SELLER_MENU = [['mis-ventas', '📈', 'Mis ventas'], ['cuenta', '👤', 'Mi cuenta']];

const views = {};

/* ---------- Resumen ---------- */
views.dashboard = async () => {
  setPage('Resumen', '<a class="btn" href="/" target="_blank">Ver tienda ↗</a>');
  const d = await api('/api/admin/dashboard');
  view.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Ventas del mes</span><strong>${money(d.month.revenue)}</strong><small>${d.month.orders} pedidos</small></div>
      <div class="kpi"><span>Ventas totales</span><strong>${money(d.totals.revenue)}</strong><small>${d.totals.orders} pedidos</small></div>
      <div class="kpi"><span>Cobrado</span><strong>${money(d.totals.paid)}</strong><small>pagos aprobados</small></div>
      <div class="kpi"><span>Ticket promedio</span><strong>${money(d.totals.avg_ticket)}</strong></div>
    </div>
    <div class="cols-2">
      <div class="panel"><h3>Ventas últimos 30 días</h3>${barChart(last30(d.byDay))}</div>
      <div class="panel"><h3>Por canal</h3>${bars(d.byChannel.map((c) => ({ ...c, channel: CHANNEL[c.channel] || c.channel })), { label: 'channel', value: 'revenue' })}
        <h3 style="margin-top:18px">Productos más vendidos</h3>${bars(d.topProducts, { label: 'name', value: 'qty', fmt: (n) => `${n} u.` })}</div>
    </div>
    <div class="cols-2">
      <div class="panel"><h3>Ranking de vendedores <a href="#vendedores" class="small">Ver todos</a></h3>
        <div class="table-wrap"><table><thead><tr><th>Vendedor</th><th class="num">Visitas</th><th class="num">Pedidos</th><th class="num">Conversión</th><th class="num">Ventas</th><th class="num">Comisión</th></tr></thead>
        <tbody>${d.sellers.map((s) => `<tr class="click" data-href="#vendedor/${s.id}"><td>${esc(s.name)} ${s.active ? '' : '<span class="tag">inactivo</span>'}</td><td class="num">${s.visits}</td><td class="num">${s.orders}</td><td class="num">${pct(s.conversion)}</td><td class="num">${money(s.revenue)}</td><td class="num">${money(s.commission)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin vendedores</td></tr>'}</tbody></table></div></div>
      <div class="panel"><h3>Stock bajo</h3>${d.lowStock.length ? `<table><tbody>${d.lowStock.map((p) => `<tr class="click" data-href="#producto/${p.id}"><td>${esc(p.name)}</td><td class="num"><span class="tag ${p.stock ? 'warn' : 'danger'}">${p.stock} u.</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Todo en orden 👌</p>'}</div>
    </div>
    <div class="panel"><h3>Últimos pedidos <a href="#pedidos" class="small">Ver todos</a></h3>${ordersTable(d.recent)}</div>`;
};

/* ---------- Pedidos ---------- */
function ordersTable(list) {
  if (!list.length) return '<p class="empty">No hay pedidos.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Código</th><th>Fecha</th><th>Cliente</th><th>Canal</th><th>Cupón</th><th>Estado</th><th>Pago</th><th class="num">Total</th></tr></thead><tbody>
    ${list.map((o) => `<tr class="click" data-order="${o.id}"><td><strong>${esc(o.code)}</strong></td><td class="nowrap">${fmtDate(o.created_at)}</td><td>${esc(o.customer_name)}</td><td>${CHANNEL[o.channel] || esc(o.channel)}</td><td>${o.coupon_code ? `<span class="tag accent">${esc(o.coupon_code)}</span>` : ''}${o.seller_name ? ` <span class="muted small">${esc(o.seller_name)}</span>` : ''}</td><td>${statusTag(o.status)}</td><td>${payTag(o.payment_status)}</td><td class="num">${money(o.total)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
let orderFilter = {};
views.pedidos = async () => {
  setPage('Pedidos', '<button class="btn" id="newSale">+ Venta manual</button>');
  const sellers = await api('/api/admin/sellers');
  const qs = new URLSearchParams(Object.entries(orderFilter).filter(([, v]) => v)).toString();
  const list = await api(`/api/admin/orders?${qs}`);
  view.innerHTML = `<div class="panel"><form class="filters" id="of">
      <input name="q" placeholder="Buscar código, cliente, teléfono…" value="${esc(orderFilter.q || '')}" style="max-width:260px">
      <select name="status"><option value="">Todos los estados</option>${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${orderFilter.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select name="channel"><option value="">Todos los canales</option>${Object.entries(CHANNEL).map(([k, l]) => `<option value="${k}" ${orderFilter.channel === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select name="seller_id"><option value="">Todos los vendedores</option>${sellers.map((s) => `<option value="${s.id}" ${String(orderFilter.seller_id) === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    </form></div>
    <div class="panel">${ordersTable(list)}</div>`;
  const f = $('#of');
  f.onchange = f.onsubmit = (e) => { e?.preventDefault(); orderFilter = Object.fromEntries(new FormData(f)); views.pedidos(); };
  let t; f.q.oninput = () => { clearTimeout(t); t = setTimeout(() => f.onchange(), 400); };
  view._orders = list;
  $('#newSale').onclick = manualSale;
};
async function openOrder(id) {
  const list = view._orders || (await api('/api/admin/orders'));
  const o = list.find((x) => x.id === Number(id)) || (await api('/api/admin/orders')).find((x) => x.id === Number(id));
  if (!o) return;
  const phone = String(o.phone || '').replace(/\D/g, '');
  modal(`Pedido ${o.code}`, `
    <div class="cols" style="grid-template-columns:1fr 1fr">
      <div><h3>Cliente</h3><p>${esc(o.customer_name)}<br>${esc(o.phone || '')}${phone ? ` · <a href="https://wa.me/${phone}?text=${encodeURIComponent(`Hola ${o.customer_name.split(' ')[0]}! Te escribo por tu pedido ${o.code}`)}" target="_blank">WhatsApp ↗</a>` : ''}<br>${esc(o.email || '')}<br>${esc([o.address, o.city].filter(Boolean).join(', '))}</p></div>
      <div><h3>Origen</h3><p>Canal: ${CHANNEL[o.channel] || esc(o.channel)}<br>Cupón: ${o.coupon_code ? `<span class="tag accent">${esc(o.coupon_code)}</span>` : '—'}<br>Vendedor: ${esc(o.seller_name || '—')}<br>Creado: ${fmtDate(o.created_at)}</p></div>
    </div>
    <table><thead><tr><th>Producto</th><th>Color</th><th class="num">Cant.</th><th class="num">Total</th></tr></thead><tbody>${o.items.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.color ? `<span class="tag" style="background:${esc(l.color)};color:#000">&nbsp;&nbsp;</span>` : ''}</td><td class="num">${l.qty}</td><td class="num">${money(l.total)}</td></tr>`).join('')}</tbody></table>
    <p class="num" style="text-align:right">Subtotal ${money(o.subtotal)} · Descuento −${money(o.discount)} · Envío ${money(o.shipping)} · <strong>Total ${money(o.total)}</strong></p>
    <div class="form">
      ${field('', ['status', 'Estado del pedido', 'select', { options: Object.entries(STATUS).map(([k, [l]]) => [k, l]) }], o.status)}
      ${field('', ['payment_status', 'Pago', 'select', { options: ['pendiente', 'aprobado', 'rechazado', 'devuelto'].map((s) => [s, s]) }], o.payment_status)}
      ${field('', ['notes', 'Notas', 'textarea'], o.notes)}
    </div>`, {
    onSubmit: async (form) => {
      const body = { status: form.status.value, notes: form.notes.value };
      if (form.payment_status.value !== o.payment_status) body.payment_status = form.payment_status.value;
      await api(`/api/admin/orders/${o.id}`, body, 'PATCH');
      toast('Pedido actualizado');
      route();
    },
  });
}
async function manualSale() {
  const { products } = await api('/api/site');
  const coupons = await api('/api/admin/coupons');
  modal('Registrar venta manual', `<p class="hint">Para ventas en persona, por WhatsApp o eventos: descuenta stock y suma la comisión al vendedor si usás su código.</p>
    <div class="list-editor" id="saleItems"></div><button type="button" class="btn sm" id="addLine" style="margin:8px 0 16px">+ Producto</button>
    <div class="form">
      ${field('', ['name', 'Cliente', 'text', { required: true }])}${field('', ['phone', 'Teléfono'])}
      ${field('', ['coupon', 'Código de vendedor / cupón', 'select', { options: [['', 'Sin código'], ...coupons.map((c) => [c.code, `${c.code}${c.seller_name ? ` (${c.seller_name})` : ''}`])] }])}
      ${field('', ['channel', 'Canal', 'select', { options: [['manual', 'Manual / en persona'], ['whatsapp', 'WhatsApp']] }])}
    </div>`, {
    submit: 'Registrar venta',
    onSubmit: async (form) => {
      const items = $$('#saleItems .list-item').map((r) => ({ id: Number($('select', r).value), qty: Number($('input', r).value) || 1 }));
      await api('/api/admin/orders', { items, coupon: form.coupon.value || null, channel: form.channel.value, customer: { name: form.name.value, phone: form.phone.value || '-' } });
      toast('Venta registrada'); route();
    },
  });
  const addLine = () => $('#saleItems').insertAdjacentHTML('beforeend', `<div class="list-item"><label class="f">Producto<select>${products.map((p) => `<option value="${p.id}">${esc(p.name)} — ${money(p.price)} (stock ${p.stock})</option>`).join('')}</select></label><label class="f">Cantidad<input type="number" min="1" value="1"></label><button type="button" class="btn sm danger rm" data-rm-item>×</button></div>`);
  $('#addLine').onclick = addLine;
  addLine();
}

/* ---------- Productos ---------- */
let cats = [];
views.productos = async () => {
  setPage('Productos', '<button class="btn" id="catsBtn">Categorías</button><button class="btn primary" id="newProd">+ Nuevo producto</button>');
  const [list, c] = await Promise.all([api('/api/admin/products'), api('/api/admin/categories')]);
  cats = c;
  view.innerHTML = `<div class="panel"><div class="table-wrap"><table><thead><tr><th></th><th>Producto</th><th>Categoría</th><th class="num">Precio</th><th class="num">Stock</th><th>Estado</th><th>MercadoLibre</th><th></th></tr></thead><tbody>
    ${list.map((p) => `<tr class="click" data-href="#producto/${p.id}"><td><img class="thumb" src="${esc(p.images[0] || '/img/favicon.svg')}" alt=""></td><td><strong>${esc(p.name)}</strong>${p.featured ? ' <span class="tag accent">destacado</span>' : ''}<div class="muted small">${esc(p.short)}</div></td><td>${esc(p.category || '—')}</td>
      <td class="num">${money(p.price)}${p.compare_price ? `<div class="muted small"><s>${money(p.compare_price)}</s></div>` : ''}</td><td class="num"><span class="tag ${p.stock > 3 ? 'ok' : p.stock ? 'warn' : 'danger'}">${p.stock}</span></td>
      <td>${p.active ? '<span class="tag ok">visible</span>' : '<span class="tag">oculto</span>'}</td><td>${p.ml_permalink ? `<a href="${esc(p.ml_permalink)}" target="_blank" onclick="event.stopPropagation()">${esc(p.ml_item_id)} ↗</a>` : '<span class="muted">—</span>'}</td>
      <td class="nowrap"><a class="btn sm" href="#redes/${p.id}" onclick="event.stopPropagation()">📣 Promocionar</a></td></tr>`).join('')}
  </tbody></table></div></div>`;
  $('#newProd').onclick = () => { location.hash = '#producto/nuevo'; };
  $('#catsBtn').onclick = categoriesModal;
};

function categoriesModal() {
  const render = () => `<table><tbody>${cats.map((c) => `<tr><td><input value="${esc(c.name)}" data-cat-name="${c.id}"></td><td style="width:90px"><input type="number" value="${c.sort}" data-cat-sort="${c.id}"></td><td class="muted small">${c.products} prod.</td><td><button type="button" class="btn sm" data-cat-save="${c.id}">Guardar</button> <button type="button" class="btn sm danger" data-cat-del="${c.id}">×</button></td></tr>`).join('')}</tbody></table>
    <div class="filters" style="margin-top:14px"><input id="newCat" placeholder="Nueva categoría" style="max-width:260px"><button type="button" class="btn" id="addCat">Agregar</button></div>`;
  modal('Categorías', render());
  const body = $('#modalBody');
  const reload = async () => { cats = await api('/api/admin/categories'); body.innerHTML = render(); };
  body.onclick = async (e) => {
    const t = e.target;
    try {
      if (t.id === 'addCat') { await api('/api/admin/categories', { name: $('#newCat').value }); await reload(); }
      if (t.dataset.catSave) { await api(`/api/admin/categories/${t.dataset.catSave}`, { name: $(`[data-cat-name="${t.dataset.catSave}"]`).value, sort: $(`[data-cat-sort="${t.dataset.catSave}"]`).value }, 'PUT'); toast('Guardado'); await reload(); }
      if (t.dataset.catDel && confirm('¿Eliminar la categoría? Los productos quedarán sin categoría.')) { await api(`/api/admin/categories/${t.dataset.catDel}`, undefined, 'DELETE'); await reload(); }
    } catch (x) { err(x); }
  };
}

views.producto = async (id) => {
  const isNew = id === 'nuevo';
  const [list, c] = await Promise.all([isNew ? [] : api('/api/admin/products'), api('/api/admin/categories')]);
  cats = c;
  const p = isNew ? { name: '', short: '', description: '', price: '', stock: 0, images: [], colors: [], material: 'PLA', active: true, featured: false, sort: 0 } : list.find((x) => x.id === Number(id));
  if (!p) { view.innerHTML = '<p class="empty">Producto no encontrado</p>'; return; }
  setPage(isNew ? 'Nuevo producto' : p.name, `<a class="btn" href="#productos">← Volver</a>${isNew ? '' : `<a class="btn" href="/#p/${esc(p.slug)}" target="_blank">Ver en tienda ↗</a><a class="btn" href="#redes/${p.id}">📣 Promocionar</a><button class="btn" id="mlPub">${p.ml_item_id ? '🔄 Sincronizar ML' : '🛒 Publicar en ML'}</button><button class="btn danger" id="del">Eliminar</button>`}`);
  let images = [...p.images];
  let colors = [...p.colors];
  const fields = [
    ['name', 'Nombre', 'text', { required: true }], ['category_id', 'Categoría', 'select', { options: [['', 'Sin categoría'], ...cats.map((x) => [x.id, x.name])] }],
    ['price', 'Precio', 'number', { step: '0.01', required: true }], ['compare_price', 'Precio anterior (tachado)', 'number', { step: '0.01', hint: 'Dejalo vacío si no está en oferta' }],
    ['stock', 'Stock', 'number'], ['material', 'Material'],
    ['badge', 'Etiqueta', 'text', { placeholder: 'Nuevo, Best seller, -20%…' }], ['sort', 'Orden', 'number'],
    ['short', 'Descripción corta', 'text', { full: true }], ['description', 'Descripción completa', 'textarea', { rows: 5 }],
    ['print_hours', 'Horas de impresión (interno)', 'number', { step: '0.5' }],
    ['featured', 'Destacado en la portada', 'bool'], ['active', 'Visible en la tienda', 'bool'],
  ];
  view.innerHTML = `<form id="pf" class="cols-2">
    <div class="panel"><h3>Datos</h3>${renderForm(fields, p)}</div>
    <div style="display:grid;gap:20px">
      <div class="panel"><h3>Fotos <span class="muted small">la primera es la principal</span></h3><div class="imgs" id="imgs"></div><input type="file" id="file" accept="image/*" multiple hidden></div>
      <div class="panel"><h3>Colores disponibles</h3><div class="colors" id="colors"></div><p class="hint">Hacé clic en un color para quitarlo.</p></div>
      <button class="btn primary" style="justify-content:center;padding:.8rem">💾 Guardar producto</button>
    </div></form>`;
  const drawImgs = () => {
    $('#imgs').innerHTML = images.map((src, i) => `<figure><img src="${esc(src)}" alt=""><div><button type="button" data-mv="${i}|-1" title="Mover">◀</button><button type="button" data-rmimg="${i}" title="Quitar">🗑</button><button type="button" data-mv="${i}|1" title="Mover">▶</button></div></figure>`).join('') + '<label class="up" for="file">+ Subir<br>fotos</label>';
  };
  const drawColors = () => {
    $('#colors').innerHTML = colors.map((c, i) => `<span style="background:${esc(c)}" data-rmcolor="${i}" title="${esc(c)}"></span>`).join('') + '<input type="color" id="addColor" title="Agregar color" value="#ff5a1f"><button type="button" class="btn sm" id="addColorBtn">+ Agregar</button>';
    $('#addColorBtn').onclick = () => { colors.push($('#addColor').value); drawColors(); };
  };
  drawImgs(); drawColors();
  $('#pf').onclick = (e) => {
    const t = e.target.closest('[data-mv],[data-rmimg],[data-rmcolor]');
    if (!t) return;
    if (t.dataset.mv) { const [i, d] = t.dataset.mv.split('|').map(Number); const j = i + d; if (j >= 0 && j < images.length) { [images[i], images[j]] = [images[j], images[i]]; drawImgs(); } }
    if (t.dataset.rmimg) { images.splice(Number(t.dataset.rmimg), 1); drawImgs(); }
    if (t.dataset.rmcolor) { colors.splice(Number(t.dataset.rmcolor), 1); drawColors(); }
  };
  $('#file').onchange = async (e) => {
    const fd = new FormData();
    for (const f of e.target.files) fd.append('files', f);
    toast('Subiendo…');
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) return err(new Error(data.error));
    images.push(...data.urls); drawImgs(); e.target.value = '';
  };
  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const body = { ...readForm(e.target, fields), images, colors };
      const saved = isNew ? await api('/api/admin/products', body) : await api(`/api/admin/products/${p.id}`, body, 'PUT');
      toast('Producto guardado ✔');
      if (isNew) location.hash = `#producto/${saved.id}`;
    } catch (x) { err(x); }
  };
  if (!isNew) {
    $('#del').onclick = async () => { if (confirm(`¿Eliminar "${p.name}"?`)) { await api(`/api/admin/products/${p.id}`, undefined, 'DELETE'); location.hash = '#productos'; } };
    $('#mlPub').onclick = async (e) => {
      e.target.disabled = true;
      try { const r = await api(`/api/admin/ml/publish/${p.id}`, {}); toast(`MercadoLibre: ${r.id} ${r.status || 'publicado'}`); route(); } catch (x) { err(x); } finally { e.target.disabled = false; }
    };
  }
};

/* ---------- Marca ---------- */
const brandMock = (b, kind) => `<div class="brand-mock ${kind}">${brandHTML(b)}<span class="accent-bar" style="background:${esc(b.accent)}"></span></div>`;
function brandForm(b, id) {
  return `<div class="form">
    <label class="f">Nombre de la pyme<input name="name" value="${esc(b.name)}" required maxlength="60"></label>
    <label class="f">Color principal<input type="color" name="accent" value="${esc(b.accent || '#ff5a1f')}"></label>
    <label class="f full">Frase / eslogan<input name="tagline" value="${esc(b.tagline)}" maxlength="160"></label>
    <div class="f full">Logo <span class="hint">PNG con fondo transparente o SVG. Se ve mejor si es horizontal.</span>
      <div class="logo-drop"><div class="box" id="${id}Box">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : '<span class="muted small">Sin logo</span>'}</div>
        <input type="hidden" name="logo" value="${esc(b.logo)}">
        <label class="btn sm">⬆ Subir logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden data-logo-file="${id}"></label>
        <button type="button" class="btn sm danger" data-logo-clear="${id}" ${b.logo ? '' : 'hidden'}>Quitar</button></div></div>
    <div class="f full">Mostrar en el encabezado<div class="modes">${[['logo+name', 'Logo + nombre'], ['logo', 'Solo logo'], ['name', 'Solo nombre']].map(([v, l]) => `<label><input type="radio" name="logoMode" value="${v}" ${(b.logoMode || 'logo+name') === v ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
  </div>`;
}
const readBrand = (el) => { const v = (n) => el.querySelector(`[name=${n}]`).value; return { name: v('name'), tagline: v('tagline'), accent: v('accent'), logo: v('logo'), logoMode: (el.querySelector('[name=logoMode]:checked') || {}).value }; };
// Subida y borrado de logo en cualquier formulario de marca (panel o modal)
function bindLogo(root, id, onChange) {
  const form = { get logo() { return root.querySelector('[name=logo]'); } };
  root.querySelector(`[data-logo-file="${id}"]`).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/admin/brand/logo', { method: 'POST', body: fd });
    const data = await res.json();
    e.target.value = '';
    if (!res.ok) return err(new Error(data.error));
    form.logo.value = data.url;
    root.querySelector(`#${id}Box`).innerHTML = `<img src="${esc(data.url)}" alt="">`;
    root.querySelector(`[data-logo-clear="${id}"]`).hidden = false;
    onChange();
  };
  root.querySelector(`[data-logo-clear="${id}"]`).onclick = (e) => {
    form.logo.value = '';
    root.querySelector(`#${id}Box`).innerHTML = '<span class="muted small">Sin logo</span>';
    e.target.hidden = true;
    onChange();
  };
}

views.marca = async () => {
  setPage('Marca y logo', '<a class="btn" href="/" target="_blank">Ver tienda ↗</a>');
  const { current, variants } = await api('/api/admin/brand');
  const origin = location.origin;
  const same = (v) => ['name', 'tagline', 'logo', 'logoMode', 'accent'].every((k) => (v[k] || '') === (current[k] || ''));
  view.innerHTML = `
    <div class="cols-2">
      <form class="panel" id="bf"><h3>Marca actual <span class="tag ok">la ven los clientes</span></h3>${brandForm(current, 'cur')}
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:16px"><button class="btn primary">💾 Guardar y publicar</button><button type="button" class="btn" id="saveAsVariant">＋ Guardar como variante</button></div></form>
      <div class="panel"><h3>Así se ve</h3><div style="display:grid;gap:12px" id="mocks"></div>
        <p class="hint" style="margin-top:12px">El logo también se usa como ícono de la pestaña del navegador y en las imágenes que se generan para redes sociales.</p>
        <h3 style="margin-top:18px">Imagen para redes <button type="button" class="btn sm" id="promoBtn">Generar</button></h3><div class="preview" id="promoPrev" style="position:static"></div></div>
    </div>
    <div class="panel"><h3>Variantes para comparar <button type="button" class="btn sm primary" id="newVariant">＋ Nueva variante</button></h3>
      <p class="hint" style="margin-bottom:14px">Guardá distintas combinaciones de nombre y logo. Con <b>Vista previa</b> ves la tienda completa con esa marca sin que la vean tus clientes, y podés mandar el link a quien quieras para que opine. Cuando te decidas, tocá <b>Usar esta</b>.</p>
      <div class="variants">${variants.map((v) => `<div class="variant ${same(v) ? 'active' : ''}">
        ${brandMock(v, 'dark')}
        <p><strong>${esc(v.name)}</strong>${same(v) ? ' <span class="tag ok">en uso</span>' : ''}<br><span class="muted small">${esc(v.tagline)}</span></p>
        <div class="actions">
          <a class="btn sm" href="/?marca=${esc(v.id)}" target="_blank">👀 Vista previa</a>
          <button class="btn sm" data-copy="${esc(origin)}/?marca=${esc(v.id)}">🔗 Link</button>
          <button class="btn sm" data-edit-variant="${esc(v.id)}">Editar</button>
          ${same(v) ? '' : `<button class="btn sm primary" data-apply="${esc(v.id)}">Usar esta</button>`}
          <button class="btn sm danger" data-del-variant="${esc(v.id)}">×</button>
        </div></div>`).join('') || '<p class="muted">Todavía no guardaste variantes. Cargá un nombre y logo arriba y tocá "Guardar como variante", o creá una nueva.</p>'}</div>
    </div>`;

  const f = $('#bf');
  const drawMocks = () => { const b = readBrand(f); $('#mocks').innerHTML = brandMock(b, 'dark') + brandMock(b, 'light'); };
  drawMocks();
  f.oninput = f.onchange = drawMocks;
  bindLogo(view, 'cur', drawMocks);
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { const b = await api('/api/admin/brand', readBrand(f), 'PUT'); applyBrand(b); toast('Marca publicada ✔'); views.marca(); } catch (x) { err(x); }
  };
  $('#saveAsVariant').onclick = async () => {
    try { await api('/api/admin/brand/variants', readBrand(f)); toast('Variante guardada'); views.marca(); } catch (x) { err(x); }
  };
  $('#promoBtn').onclick = async () => {
    const { products } = await api('/api/site');
    if (!products.length) return;
    // la vista previa usa la marca guardada: si hay cambios sin guardar, avisamos
    if (JSON.stringify(readBrand(f)) !== JSON.stringify({ name: current.name, tagline: current.tagline, accent: current.accent, logo: current.logo, logoMode: current.logoMode || 'logo+name' })) toast('Mostrando la marca guardada; guardá para ver los cambios');
    const blob = await api('/api/admin/social/preview', { product_id: products[0].id, template: 'impacto' });
    $('#promoPrev').innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="" style="max-height:340px">`;
  };
  const variantModal = (v) => {
    modal(v ? `Editar variante: ${v.name}` : 'Nueva variante', `<div id="vf">${brandForm(v || { name: '', tagline: current.tagline, accent: current.accent, logoMode: 'logo+name' }, 'var')}</div><div style="margin-top:14px" id="vMock"></div>`, {
      onSubmit: async () => {
        const body = readBrand($('#vf'));
        await (v ? api(`/api/admin/brand/variants/${v.id}`, body, 'PUT') : api('/api/admin/brand/variants', body));
        toast('Variante guardada'); views.marca();
      },
    });
    const vf = $('#vf');
    const draw = () => { $('#vMock').innerHTML = brandMock(readBrand(vf), 'dark'); };
    vf.oninput = vf.onchange = draw;
    bindLogo($('#modalBody'), 'var', draw);
    draw();
  };
  $('#newVariant').onclick = () => variantModal();
  view.onclick = async (e) => {
    const t = e.target.closest('[data-copy],[data-apply],[data-del-variant],[data-edit-variant]');
    if (!t) return;
    try {
      if (t.dataset.copy) copy(t.dataset.copy);
      if (t.dataset.editVariant) variantModal(variants.find((v) => v.id === t.dataset.editVariant));
      if (t.dataset.apply && confirm('¿Publicar esta marca? Tus clientes la van a ver de inmediato.')) { applyBrand(await api(`/api/admin/brand/variants/${t.dataset.apply}/apply`, {})); toast('Marca publicada ✔'); views.marca(); }
      if (t.dataset.delVariant && confirm('¿Borrar esta variante?')) { await api(`/api/admin/brand/variants/${t.dataset.delVariant}`, undefined, 'DELETE'); views.marca(); }
    } catch (x) { err(x); }
  };
};

/* ---------- Contenido ---------- */
const CONTENT = {
  site: ['General', [['announcement', 'Barra de anuncio (arriba de todo)', 'text', { full: true, hint: 'Dejala vacía para ocultarla' }], ['whatsapp', 'WhatsApp (con código de país, sin +)', 'text', { placeholder: '5491122334455' }], ['email', 'Email'], ['instagram', 'Instagram (URL)'], ['facebook', 'Facebook (URL)'], ['tiktok', 'TikTok (URL)'], ['mercadolibre', 'Tienda de MercadoLibre (URL)'], ['shippingFlat', 'Costo de envío', 'number'], ['freeShippingFrom', 'Envío gratis desde', 'number', { hint: '0 = nunca' }]]],
  hero: ['Portada (hero)', [['visible', 'Mostrar', 'bool', { full: true }], ['eyebrow', 'Etiqueta superior'], ['title', 'Título', 'textarea', { rows: 2, hint: 'Cada renglón se anima por separado; el segundo va con degradado.' }], ['subtitle', 'Subtítulo', 'textarea'], ['ctaText', 'Botón principal'], ['ctaLink', 'Link botón principal'], ['secondaryText', 'Botón secundario'], ['secondaryLink', 'Link botón secundario'], ['showcase', 'Productos que "imprime" la animación', 'products']]],
  stats: ['Números', [['visible', 'Mostrar', 'bool', { full: true }], ['items', 'Datos', 'list', { fields: [['value', 'Valor'], ['label', 'Texto']] }]]],
  featured: ['Destacados', [['visible', 'Mostrar', 'bool', { full: true }], ['title', 'Título'], ['subtitle', 'Subtítulo']]],
  catalog: ['Catálogo', [['visible', 'Mostrar', 'bool', { full: true }], ['title', 'Título'], ['subtitle', 'Subtítulo']]],
  process: ['Cómo trabajamos', [['visible', 'Mostrar', 'bool', { full: true }], ['title', 'Título', 'text', { full: true }], ['steps', 'Pasos', 'list', { fields: [['icon', 'Ícono (emoji)'], ['title', 'Título'], ['text', 'Texto', 'textarea']] }]]],
  custom: ['Pedidos personalizados', [['visible', 'Mostrar', 'bool', { full: true }], ['title', 'Título', 'text', { full: true }], ['text', 'Texto', 'textarea'], ['ctaText', 'Texto del botón (abre WhatsApp)', 'text', { full: true }]]],
  testimonials: ['Opiniones', [['visible', 'Mostrar', 'bool', { full: true }], ['title', 'Título', 'text', { full: true }], ['items', 'Opiniones', 'list', { fields: [['name', 'Nombre'], ['rating', 'Estrellas (1-5)', 'number'], ['text', 'Opinión', 'textarea']] }]]],
  faq: ['Preguntas frecuentes', [['visible', 'Mostrar', 'bool', { full: true }], ['title', 'Título', 'text', { full: true }], ['items', 'Preguntas', 'list', { fields: [['q', 'Pregunta'], ['a', 'Respuesta', 'textarea']] }]]],
};
let contentTab = 'site';
views.contenido = async () => {
  setPage('Contenido del sitio', '<a class="btn" href="/" target="_blank">Ver tienda ↗</a>');
  const [content, site] = await Promise.all([api('/api/admin/content'), api('/api/site')]);
  const [label, fields] = CONTENT[contentTab];
  const f = fields.map((x) => (x[2] === 'products' ? [x[0], x[1], x[2], { products: site.products }] : x));
  view.innerHTML = `<div class="filters">${Object.entries(CONTENT).map(([k, [l]]) => `<button class="btn ${k === contentTab ? 'primary' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    ${contentTab === 'site' ? '<p class="hint">El nombre, el logo, la frase y el color se cambian en <a href="#marca">Marca y logo</a>.</p>' : ''}
    <form class="panel" id="cf"><h3>${label}<button type="button" class="btn sm" id="reset">Restaurar valores originales</button></h3>${renderForm(f, content[contentTab])}
      <div style="margin-top:18px;display:flex;gap:.6rem"><button class="btn primary">💾 Guardar</button><a class="btn" href="/" target="_blank">Ver cambios ↗</a></div></form>`;
  $$('[data-tab]').forEach((b) => { b.onclick = () => { contentTab = b.dataset.tab; views.contenido(); }; });
  $('#cf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api(`/api/admin/content/${contentTab}`, { ...content[contentTab], ...readForm(e.target, f) }, 'PUT'); toast('Guardado ✔ — ya se ve en la tienda'); } catch (x) { err(x); }
  };
  $('#reset').onclick = async () => { if (confirm('¿Volver a los textos originales de esta sección?')) { await api(`/api/admin/content/${contentTab}/reset`, {}); views.contenido(); } };
};

/* ---------- Cupones ---------- */
views.cupones = async () => {
  setPage('Cupones y códigos', '<button class="btn primary" id="newCoupon">+ Nuevo cupón</button>');
  const [list, sellers, site] = await Promise.all([api('/api/admin/coupons'), api('/api/admin/sellers'), api('/api/admin/integrations')]);
  view.innerHTML = `<div class="panel"><p class="hint" style="margin-bottom:12px">Cada código tiene su link de seguimiento (<code>?ref=CÓDIGO</code>): registra las visitas y aplica el descuento automáticamente. Los códigos asignados a un vendedor suman a sus comisiones.</p>
    <div class="table-wrap"><table><thead><tr><th>Código</th><th>Descuento</th><th>Vendedor</th><th class="num">Usos</th><th class="num">Visitas</th><th class="num">Aplicado</th><th class="num">Pedidos</th><th class="num">Ventas</th><th>Estado</th><th></th></tr></thead><tbody>
    ${list.map((c) => `<tr class="click" data-coupon="${c.id}"><td><strong>${esc(c.code)}</strong><div class="muted small">${esc(c.description || '')}</div></td>
      <td>${c.type === 'percent' ? `${c.value}%` : money(c.value)}${c.min_total ? `<div class="muted small">desde ${money(c.min_total)}</div>` : ''}</td><td>${esc(c.seller_name || '—')}</td>
      <td class="num">${c.uses}${c.max_uses ? ` / ${c.max_uses}` : ''}</td><td class="num">${c.visits}</td><td class="num">${c.applied}</td><td class="num">${c.orders}</td><td class="num">${money(c.revenue)}</td>
      <td>${c.active ? (c.ends_at && c.ends_at < new Date().toISOString().slice(0, 10) ? '<span class="tag warn">vencido</span>' : '<span class="tag ok">activo</span>') : '<span class="tag">pausado</span>'}</td>
      <td><button class="btn sm" data-copy="${esc(site.publicUrl)}/?ref=${esc(c.code)}" title="Copiar link de seguimiento">🔗 Link</button></td></tr>`).join('') || '<tr><td colspan="10" class="empty">No hay cupones</td></tr>'}
    </tbody></table></div></div>`;
  const form = (c = { type: 'percent', active: true }) => {
    const fields = [['code', 'Código', 'text', { required: true, placeholder: 'VERANO20' }], ['description', 'Descripción interna'], ['type', 'Tipo', 'select', { options: [['percent', 'Porcentaje %'], ['fixed', 'Monto fijo $']] }], ['value', 'Valor', 'number', { step: '0.01', required: true }],
      ['seller_id', 'Vendedor', 'select', { options: [['', 'Ninguno (cupón general)'], ...sellers.map((s) => [s.id, s.name])] }], ['min_total', 'Compra mínima', 'number'], ['max_uses', 'Límite de usos', 'number', { hint: 'Vacío = ilimitado' }], ['starts_at', 'Desde', 'date'], ['ends_at', 'Hasta', 'date'], ['active', 'Activo', 'bool']];
    modal(c.id ? `Cupón ${c.code}` : 'Nuevo cupón', renderForm(fields, c), {
      extra: c.id ? '<button type="button" class="btn danger left" id="delCoupon">Eliminar</button>' : '',
      onSubmit: async (f) => { const body = readForm(f, fields); await api(c.id ? `/api/admin/coupons/${c.id}` : '/api/admin/coupons', body, c.id ? 'PUT' : 'POST'); toast('Cupón guardado'); views.cupones(); },
    });
    if (c.id) $('#delCoupon').onclick = async () => { if (confirm('¿Eliminar el cupón? Se pierde su historial de visitas.')) { await api(`/api/admin/coupons/${c.id}`, undefined, 'DELETE'); $('#modal').close(); views.cupones(); } };
  };
  $('#newCoupon').onclick = () => form();
  view.onclick = (e) => {
    const cp = e.target.closest('[data-copy]');
    if (cp) { e.stopPropagation(); copy(cp.dataset.copy); return; }
    const row = e.target.closest('[data-coupon]');
    if (row) form(list.find((c) => c.id === Number(row.dataset.coupon)));
  };
};

/* ---------- Vendedores ---------- */
views.vendedores = async () => {
  setPage('Vendedores', '<button class="btn primary" id="newSeller">+ Nuevo vendedor</button>');
  const list = await api('/api/admin/sellers');
  view.innerHTML = `<div class="panel"><div class="table-wrap"><table><thead><tr><th>Vendedor</th><th>Códigos</th><th>Acceso al panel</th><th class="num">Visitas</th><th class="num">Pedidos</th><th class="num">Ventas</th><th class="num">Cobrado</th><th class="num">Comisión</th><th></th></tr></thead><tbody>
    ${list.map((s) => `<tr class="click" data-href="#vendedor/${s.id}"><td><strong>${esc(s.name)}</strong> ${s.active ? '' : '<span class="tag">inactivo</span>'}<div class="muted small">${esc(s.phone || '')} · ${s.commission_pct}% comisión</div></td>
      <td>${s.codes.map((c) => `<span class="tag accent">${esc(c)}</span>`).join(' ') || '—'}</td><td>${s.login ? esc(s.login) : '<span class="muted">sin acceso</span>'}</td>
      <td class="num">${s.visits}</td><td class="num">${s.orders}</td><td class="num">${money(s.revenue)}</td><td class="num">${money(s.paid_revenue)}</td><td class="num"><strong>${money(s.commission)}</strong></td>
      <td><button class="btn sm" data-edit="${s.id}">Editar</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Todavía no cargaste vendedores</td></tr>'}
    </tbody></table></div><p class="hint" style="margin-top:12px">La comisión se calcula sobre pedidos con pago aprobado (subtotal menos descuento, sin envío).</p></div>`;
  const form = (s = { active: true, commission_pct: 10 }) => {
    const fields = [['name', 'Nombre', 'text', { required: true }], ['phone', 'Teléfono'], ['email', 'Email (usuario para entrar al panel)', 'email'], ['password', s.id ? 'Nueva contraseña (vacío = no cambiar)' : 'Contraseña para el panel (opcional)', 'password'], ['commission_pct', 'Comisión %', 'number', { step: '0.5' }],
      ...(s.id ? [['active', 'Activo (si lo desactivás, sus códigos dejan de funcionar)', 'bool']] : [['code', 'Código de descuento propio', 'text', { placeholder: 'JUAN10' }], ['code_value', '% de descuento del código', 'number']])];
    modal(s.id ? `Editar ${s.name}` : 'Nuevo vendedor', renderForm(fields, { ...s, email: s.login || s.email, code_value: 10 }), {
      extra: s.id ? '<button type="button" class="btn danger left" id="delSeller">Eliminar</button>' : '',
      onSubmit: async (f) => { await api(s.id ? `/api/admin/sellers/${s.id}` : '/api/admin/sellers', readForm(f, fields), s.id ? 'PUT' : 'POST'); toast('Vendedor guardado'); views.vendedores(); },
    });
    if (s.id) $('#delSeller').onclick = async () => { if (confirm(`¿Eliminar a ${s.name}? Sus pedidos quedan registrados pero sin vendedor.`)) { await api(`/api/admin/sellers/${s.id}`, undefined, 'DELETE'); $('#modal').close(); views.vendedores(); } };
  };
  $('#newSeller').onclick = () => form();
  view.onclick = (e) => { const b = e.target.closest('[data-edit]'); if (b) { e.stopPropagation(); form(list.find((s) => s.id === Number(b.dataset.edit))); } };
};

/* ---------- Panel de un vendedor (lo usa el vendedor y el admin) ---------- */
async function sellerDashboard(sellerId) {
  const d = await api(`/api/seller/me${sellerId ? `?seller_id=${sellerId}` : ''}`);
  const { products, site } = await api('/api/site');
  const s = d.seller;
  setPage(sellerId ? `Vendedor: ${s.name}` : `¡Hola ${s.name.split(' ')[0]}!`, sellerId ? '<a class="btn" href="#vendedores">← Volver</a>' : '');
  view.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Visitas con tu link</span><strong>${d.visits}</strong></div>
      <div class="kpi"><span>Pedidos</span><strong>${d.orders}</strong><small>${d.paid_orders} pagados</small></div>
      <div class="kpi"><span>Conversión</span><strong>${pct(d.conversion)}</strong><small>pedidos / visitas</small></div>
      <div class="kpi"><span>Ventas</span><strong>${money(d.revenue)}</strong><small>${money(d.paid_revenue)} cobrado</small></div>
      <div class="kpi"><span>Comisión (${s.commission_pct}%)</span><strong>${money(d.commission)}</strong><small>sobre ventas cobradas</small></div>
    </div>
    <div class="cols-2">
      <div class="panel"><h3>Tus códigos</h3>${d.coupons.map((c) => {
        const link = `${d.site_url}/?ref=${c.code}`;
        const msg = `🔥 Mirá los productos impresos en 3D de ${site.name}. Con mi código *${c.code}* tenés ${c.type === 'percent' ? `${c.value}%` : money(c.value)} de descuento 👉 ${link}`;
        return `<div style="display:grid;gap:8px;padding:12px 0;border-bottom:1px solid var(--line)">
          <div><span class="tag accent" style="font-size:1rem">${esc(c.code)}</span> ${c.type === 'percent' ? `${c.value}% off` : `${money(c.value)} off`} ${c.active ? '' : '<span class="tag danger">pausado</span>'}</div>
          <div class="muted small">${c.visits} visitas · ${c.applied} veces aplicado · ${c.orders} pedidos · ${money(c.revenue)}</div>
          <div class="copy-field"><input readonly value="${esc(link)}"><button class="btn sm" data-copy="${esc(link)}">Copiar</button><a class="btn sm" target="_blank" href="https://wa.me/?text=${encodeURIComponent(msg)}">WhatsApp</a></div></div>`;
      }).join('') || '<p class="muted">No tenés códigos asignados.</p>'}</div>
      <div class="panel"><h3>Imagen para compartir</h3><p class="hint">Generá una imagen con tu código para tus historias y publicaciones.</p>
        <div class="form" style="margin:12px 0">
          ${field('', ['pp', 'Producto', 'select', { options: products.map((p) => [p.id, p.name]) }])}
          ${field('', ['pt', 'Formato', 'select', { options: [['impacto', 'Post cuadrado'], ['story', 'Historia'], ['minimal', 'Minimal']] }])}
          ${field('', ['pc', 'Código', 'select', { options: d.coupons.map((c) => [c.code, c.code]) }])}
        </div>
        <button class="btn primary" id="genPromo" ${d.coupons.length ? '' : 'disabled'}>Generar imagen</button>
        <div class="preview" id="sellerPreview" style="margin-top:14px;position:static"></div></div>
    </div>
    <div class="panel"><h3>Ventas por mes</h3>${bars(d.monthly, { label: 'month', value: 'revenue' })}</div>
    <div class="panel"><h3>Pedidos con tus códigos</h3>${d.orders_list.length ? `<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Código</th><th>Estado</th><th>Pago</th><th class="num">Monto</th></tr></thead><tbody>${d.orders_list.map((o) => `<tr><td>${esc(o.code)}</td><td>${fmtDate(o.created_at)}</td><td>${esc(o.customer_name)}</td><td>${esc(o.coupon_code || '')}</td><td>${statusTag(o.status)}</td><td>${payTag(o.payment_status)}</td><td class="num">${money(o.subtotal - o.discount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Todavía no hay pedidos. ¡Compartí tu link!</p>'}</div>`;
  view.onclick = (e) => { const c = e.target.closest('[data-copy]'); if (c) copy(c.dataset.copy); };
  const gen = $('#genPromo');
  if (gen) gen.onclick = async () => {
    gen.disabled = true;
    try {
      const blob = await api('/api/seller/promo', { product_id: $('[name=pp]').value, template: $('[name=pt]').value, couponCode: $('[name=pc]').value });
      const url = URL.createObjectURL(blob);
      $('#sellerPreview').innerHTML = `<img src="${url}" alt="Imagen promocional"><a class="btn primary" download="promo-${esc($('[name=pc]').value)}.png" href="${url}">⬇ Descargar</a>`;
    } catch (x) { err(x); } finally { gen.disabled = false; }
  };
}
views.vendedor = (id) => sellerDashboard(id);
views['mis-ventas'] = () => sellerDashboard();

/* ---------- Redes sociales ---------- */
views.redes = async (productId) => {
  setPage('Redes sociales', '<a class="btn" href="#integraciones">⚙ Conectar redes</a>');
  const [st, { products }, coupons, posts, content] = await Promise.all([api('/api/admin/social/status'), api('/api/site'), api('/api/admin/coupons'), api('/api/admin/social/posts'), api('/api/admin/content')]);
  const pid = Number(productId) || products[0]?.id;
  view.innerHTML = `<div class="studio">
    <form class="panel" id="sf" style="display:grid;gap:14px">
      <h3>1. Diseñá la publicación</h3>
      ${field('', ['product_id', 'Producto', 'select', { options: products.map((p) => [p.id, p.name]) }], pid)}
      ${field('', ['template', 'Plantilla', 'select', { options: Object.entries(st.templates).map(([k, t]) => [k, t.label]) }])}
      ${field('', ['headline', 'Título (opcional)', 'text', { placeholder: 'Por defecto: nombre del producto' }])}
      <div class="form">${field('', ['discountText', 'Sello de descuento', 'text', { placeholder: '-20% / 2x1 / HOT' }])}${field('', ['price', 'Precio a mostrar', 'number', { placeholder: 'Precio actual' }])}</div>
      ${field('', ['couponCode', 'Código en la imagen', 'select', { options: [['', 'Ninguno'], ...coupons.filter((c) => c.active).map((c) => [c.code, `${c.code}${c.seller_name ? ` (${c.seller_name})` : ''}`])] }])}
      <h3>2. Texto</h3>
      <label class="f">Texto de la publicación<textarea name="caption" rows="8"></textarea></label>
      <button type="button" class="btn sm" id="genCaption">✨ Regenerar texto</button>
      <h3>3. ¿Dónde publicar?</h3>
      <div class="nets">${Object.entries(st.networks).map(([k, n]) => `<label class="net ${n.ready ? '' : 'off'}" title="${esc(n.note || '')}"><input type="checkbox" name="net" value="${k}" ${n.ready ? 'checked' : 'disabled'}><span>${esc(n.label)}<small>${n.ready ? 'conectado' : 'no configurado'}</small></span></label>`).join('')}</div>
      ${Object.values(st.networks).some((n) => n.ready) ? '' : '<p class="hint">Todavía no conectaste ninguna red. Igual podés descargar la imagen y el texto. <a href="#integraciones">Conectar redes →</a></p>'}
      <div style="display:flex;gap:.6rem;flex-wrap:wrap"><button class="btn primary" id="publish">🚀 Publicar en todas</button><a class="btn" id="download" download="promo.png">⬇ Descargar imagen</a><button type="button" class="btn" id="copyCaption">Copiar texto</button></div>
      <div class="results" id="results"></div>
    </form>
    <div class="preview"><img id="prev" alt="Vista previa"><span class="muted small">Vista previa en alta resolución</span></div>
  </div>
  <form class="panel" id="socialCfg"><h3>Configuración de textos</h3>${renderForm([['hashtags', 'Hashtags', 'text', { full: true }], ['captionTemplate', 'Plantilla del texto', 'textarea', { rows: 5, hint: 'Variables: {nombre} {descripcion} {precio} {descuento} {link} {hashtags} {codigo}' }]], content.social)}<button class="btn" style="margin-top:12px">Guardar</button></form>
  <div class="panel"><h3>Publicaciones anteriores</h3><div class="posts">${posts.map((p) => `<figure><a href="${esc(p.image)}" target="_blank"><img src="${esc(p.image)}" alt="" loading="lazy"></a><figcaption><span class="muted" style="width:100%">${esc(p.product || '')} · ${fmtDate(p.created_at)}</span>${Object.entries(p.results).map(([n, r]) => (r.ok ? `<a class="tag ok" href="${esc(r.url || '#')}" target="_blank">${esc(n)} ✓</a>` : `<span class="tag danger" title="${esc(r.error)}">${esc(n)} ✗</span>`)).join('') || '<span class="tag">solo descargada</span>'}</figcaption></figure>`).join('') || '<p class="muted">Aún no publicaste nada.</p>'}</div></div>`;

  const f = $('#sf');
  const opts = () => ({ product_id: f.product_id.value, template: f.template.value, headline: f.headline.value, discountText: f.discountText.value, price: f.price.value, couponCode: f.couponCode.value });
  let seq = 0, lastUrl;
  const refresh = async () => {
    const my = ++seq;
    $('#prev').classList.add('loading');
    try {
      const blob = await api('/api/admin/social/preview', opts());
      if (my !== seq) return;
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      $('#prev').src = lastUrl; $('#download').href = lastUrl;
      $('#download').download = `promo-${products.find((p) => String(p.id) === f.product_id.value)?.slug || 'producto'}.png`;
    } catch (x) { err(x); } finally { $('#prev').classList.remove('loading'); }
  };
  const caption = async () => { f.caption.value = (await api(`/api/admin/social/caption?product_id=${f.product_id.value}&coupon=${encodeURIComponent(f.couponCode.value)}`)).caption; };
  let t;
  f.oninput = (e) => { if (e.target.name === 'caption' || e.target.name === 'net') return; clearTimeout(t); t = setTimeout(refresh, 350); };
  f.product_id.onchange = f.couponCode.onchange = () => { refresh(); caption(); };
  $('#genCaption').onclick = caption;
  $('#copyCaption').onclick = () => copy(f.caption.value);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const networks = $$('[name=net]:checked', f).map((i) => i.value);
    if (!networks.length && !confirm('No hay redes seleccionadas. ¿Guardar la imagen en el historial igualmente?')) return;
    const btn = $('#publish'); btn.disabled = true; btn.textContent = 'Publicando…';
    $('#results').innerHTML = '';
    try {
      const r = await api('/api/admin/social/publish', { ...opts(), caption: f.caption.value, networks });
      $('#results').innerHTML = Object.entries(r.results).map(([n, x]) => `<div>${x.ok ? `<span class="tag ok">${esc(st.networks[n].label)} ✓</span> ${x.url ? `<a href="${esc(x.url)}" target="_blank">ver publicación ↗</a>` : ''}` : `<span class="tag danger">${esc(st.networks[n].label)} ✗</span> <span class="small">${esc(x.error)}</span>`}</div>`).join('') || '<span class="tag">Imagen guardada en el historial</span>';
      toast(Object.values(r.results).every((x) => x.ok) ? '🚀 ¡Publicado!' : 'Terminado, revisá los resultados');
    } catch (x) { err(x); } finally { btn.disabled = false; btn.textContent = '🚀 Publicar en todas'; }
  };
  $('#socialCfg').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/admin/content/social', readForm(e.target, [['hashtags'], ['captionTemplate']]), 'PUT'); toast('Guardado'); caption(); } catch (x) { err(x); }
  };
  refresh(); caption();
};

/* ---------- WhatsApp ---------- */
views.whatsapp = async (phone) => {
  setPage('Bot de WhatsApp', '<a class="btn" href="#integraciones">⚙ Conectar WhatsApp</a>');
  const [w, content] = await Promise.all([api('/api/admin/whatsapp'), api('/api/admin/content')]);
  const botFields = [['enabled', 'Bot activado', 'bool', { full: true }], ['greeting', 'Saludo', 'text', { full: true, hint: 'Variables: {nombre} {tienda}' }], ['menu', 'Menú de opciones', 'textarea', { rows: 6 }], ['hours', 'Horario de atención', 'text', { full: true }], ['human', 'Mensaje al derivar a una persona', 'textarea', { hint: 'Variable: {horario}' }], ['custom', 'Mensaje para pedidos personalizados', 'textarea'], ['fallback', 'Cuando no entiende', 'textarea'],
    ['faq', 'Respuestas automáticas por palabra clave', 'list', { fields: [['keywords', 'Palabras clave (separadas por coma)'], ['answer', 'Respuesta', 'textarea']] }]];
  view.innerHTML = `
    ${w.enabled ? '' : `<div class="panel"><h3>⚠ WhatsApp todavía no está conectado</h3><p class="muted">Podés configurar y probar el bot con el simulador. Para que responda de verdad, seguí los pasos en <a href="#integraciones">Integraciones</a> y configurá en Meta el webhook:</p>
      <p>URL: <code>${esc(w.webhook)}</code> · Verify token: <code>${esc(w.verifyToken)}</code></p></div>`}
    <div class="cols-2">
      <div class="panel"><h3>Conversaciones <span class="muted small">${w.chats.filter((c) => c.phone !== 'simulador').length}</span></h3>
        <div class="wa"><div class="wa-list">${w.chats.filter((c) => c.phone !== 'simulador').map((c) => `<button data-phone="${esc(c.phone)}" class="${c.phone === phone ? 'active' : ''}"><strong>${esc(c.name || c.phone)} ${c.human ? '<span class="tag warn">humano</span>' : ''}</strong><small>${esc(c.last || '')}</small><small>${fmtDate(c.last_at)}</small></button>`).join('') || '<p class="empty">Sin conversaciones todavía</p>'}</div>
        <div class="chat" id="chat">${phone ? '' : '<p class="empty" style="margin:auto">Elegí una conversación</p>'}</div></div></div>
      <div class="panel"><h3>🧪 Simulador del bot <button class="btn sm" id="simReset">Reiniciar</button></h3>
        <div class="chat" style="border-radius:12px;overflow:hidden"><div class="msgs" id="simMsgs"></div><form id="simForm"><input placeholder="Escribí como si fueras un cliente…" autocomplete="off"><button class="btn primary sm">Enviar</button></form></div></div>
    </div>
    <form class="panel" id="botCfg"><h3>Respuestas del bot</h3>${renderForm(botFields, content.bot)}<button class="btn primary" style="margin-top:14px">💾 Guardar</button></form>`;

  const bubble = (m, dir) => {
    const body = m.type === 'image' ? `<img src="${esc(m.link)}" alt="">${esc(m.caption)}` : esc(m.body ?? m);
    return `<div class="msg ${dir}">${body}<time>${new Date().toLocaleTimeString('es-AR', { timeStyle: 'short' })}</time></div>`;
  };
  const sim = $('#simMsgs');
  const send = async (text, reset = false) => {
    if (text) sim.insertAdjacentHTML('beforeend', bubble(text, 'out'));
    const replies = await api('/api/admin/whatsapp-sim', { text, reset });
    // las imágenes del simulador se muestran desde el sitio local
    for (const r of replies) sim.insertAdjacentHTML('beforeend', bubble(r.type === 'image' ? { ...r, link: new URL(r.link).pathname + new URL(r.link).search } : r, 'in'));
    sim.scrollTop = sim.scrollHeight;
  };
  $('#simForm').onsubmit = (e) => { e.preventDefault(); const i = $('input', e.target); if (i.value.trim()) { send(i.value.trim()); i.value = ''; } };
  $('#simReset').onclick = () => { sim.innerHTML = ''; send('hola', true); };
  send('hola', true);

  $$('[data-phone]').forEach((b) => { b.onclick = () => { location.hash = `#whatsapp/${b.dataset.phone}`; }; });
  if (phone) {
    const msgs = await api(`/api/admin/whatsapp/${encodeURIComponent(phone)}`);
    const chat = w.chats.find((c) => c.phone === phone);
    $('#chat').innerHTML = `<div class="chat-head"><span><strong>${esc(chat?.name || phone)}</strong> <span class="muted small">+${esc(phone)}</span></span>${chat?.human ? '<button class="btn sm" id="release">Devolver al bot</button>' : '<span class="tag ok">atiende el bot</span>'}</div>
      <div class="msgs" id="msgs">${msgs.map((m) => `<div class="msg ${m.direction === 'in' ? 'in' : 'out'}">${esc(m.body)}<time>${fmtDate(m.created_at)}</time></div>`).join('')}</div>
      <form id="replyForm"><input placeholder="Responder como persona (pausa el bot en este chat)…" autocomplete="off"><button class="btn primary sm">Enviar</button></form>`;
    $('#msgs').scrollTop = 1e9;
    $('#replyForm').onsubmit = async (e) => { e.preventDefault(); const i = $('input', e.target); try { await api(`/api/admin/whatsapp/${encodeURIComponent(phone)}/send`, { text: i.value }); views.whatsapp(phone); } catch (x) { err(x); } };
    if ($('#release')) $('#release').onclick = async () => { await api(`/api/admin/whatsapp/${encodeURIComponent(phone)}/release`, {}); views.whatsapp(phone); };
  }
  $('#botCfg').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/admin/content/bot', readForm(e.target, botFields), 'PUT'); toast('Bot actualizado ✔'); } catch (x) { err(x); } };
};

/* ---------- MercadoLibre ---------- */
views.mercadolibre = async () => {
  setPage('MercadoLibre');
  const [s, products] = await Promise.all([api('/api/admin/ml/status'), api('/api/admin/products')]);
  view.innerHTML = `
    <div class="panel"><h3>Conexión</h3>
      ${!s.configured ? `<p>Primero cargá el <b>App ID</b> y el <b>Client secret</b> de tu aplicación de MercadoLibre en <a href="#integraciones">Integraciones</a>.</p>
        <ol class="steps-list"><li>Entrá a <a href="https://developers.mercadolibre.com.ar/devcenter" target="_blank">developers.mercadolibre.com.ar</a> y creá una aplicación.</li><li>Redirect URI: <code>${esc(s.redirectUri)}</code></li><li>Notificaciones (tópico <b>orders_v2</b>): <code>${esc(s.webhook)}</code></li><li>Copiá App ID y Secret en Integraciones.</li></ol>`
        : s.connected ? `<p><span class="tag ok">Conectado</span> como <b>${esc(s.nickname)}</b> <a href="${esc(s.permalink || '#')}" target="_blank">ver tienda ↗</a></p><div class="filters"><button class="btn primary" id="import">⬇ Importar ventas de ML</button><button class="btn danger" id="disc">Desconectar</button></div>`
        : `<p><span class="tag warn">Sin conectar</span> ${s.error ? esc(s.error) : ''}</p><a class="btn primary" href="/api/admin/ml/connect">Conectar mi cuenta de MercadoLibre</a><p class="hint" style="margin-top:8px">Redirect URI configurada en tu app: <code>${esc(s.redirectUri)}</code></p>`}
    </div>
    <div class="panel"><h3>Productos</h3><p class="hint" style="margin-bottom:10px">Al publicar, MercadoLibre sugiere la categoría automáticamente. Cada vez que cambies precio o stock acá (o se venda en la web) se sincroniza solo.</p>
      <div class="table-wrap"><table><thead><tr><th></th><th>Producto</th><th class="num">Precio</th><th class="num">Stock</th><th>Publicación</th><th></th></tr></thead><tbody>
      ${products.map((p) => `<tr><td><img class="thumb" src="${esc(p.images[0] || '')}" alt=""></td><td>${esc(p.name)}</td><td class="num">${money(p.price)}</td><td class="num">${p.stock}</td><td>${p.ml_item_id ? `<a href="${esc(p.ml_permalink || '#')}" target="_blank">${esc(p.ml_item_id)} ↗</a>` : '<span class="muted">no publicado</span>'}</td>
        <td><button class="btn sm" data-pub="${p.id}" ${s.connected ? '' : 'disabled'}>${p.ml_item_id ? '🔄 Sincronizar' : '🛒 Publicar'}</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
  if ($('#import')) $('#import').onclick = async () => { try { const r = await api('/api/admin/ml/import', {}); toast(`${r.added} ventas nuevas importadas`); } catch (x) { err(x); } };
  if ($('#disc')) $('#disc').onclick = async () => { if (confirm('¿Desconectar MercadoLibre?')) { await api('/api/admin/ml/disconnect', {}); views.mercadolibre(); } };
  view.onclick = async (e) => {
    const b = e.target.closest('[data-pub]');
    if (!b) return;
    b.disabled = true;
    try { const r = await api(`/api/admin/ml/publish/${b.dataset.pub}`, {}); toast(`Listo: ${r.id}`); views.mercadolibre(); } catch (x) { err(x); b.disabled = false; }
  };
};

/* ---------- Integraciones ---------- */
const INTEGRATIONS = {
  mercadopago: ['💳 Mercado Pago', 'Cobros con tarjeta, débito y dinero en cuenta. Obtené el Access token en <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank">Mercado Pago Developers</a> → tu aplicación → Credenciales de producción.'],
  mercadolibre: ['🛒 MercadoLibre', 'Creá una app en <a href="https://developers.mercadolibre.com.ar/devcenter" target="_blank">el DevCenter</a>. Después conectá tu cuenta desde la sección <a href="#mercadolibre">MercadoLibre</a>.'],
  whatsapp: ['💬 WhatsApp Cloud API', 'En <a href="https://developers.facebook.com/apps" target="_blank">Meta for Developers</a> creá una app tipo Business, agregá WhatsApp, y copiá el Phone number ID y un token permanente (usuario de sistema). Webhook: <code>{url}/webhooks/whatsapp</code>, suscribite a <b>messages</b>.'],
  facebook: ['📘 Facebook (página)', 'Necesitás el ID de tu página y un Page access token de larga duración con permisos <b>pages_manage_posts</b> y <b>pages_read_engagement</b>.'],
  instagram: ['📸 Instagram', 'Cuenta profesional vinculada a tu página de Facebook. Permisos <b>instagram_basic</b> e <b>instagram_content_publish</b>. Requiere el sitio online con HTTPS.'],
  telegram: ['✈️ Telegram', 'Creá un bot con @BotFather, agregalo como administrador de tu canal y poné el @canal como chat.'],
  pinterest: ['📌 Pinterest', 'Token de <a href="https://developers.pinterest.com/apps/" target="_blank">Pinterest Developers</a> con permisos pins:write y boards:read, y el ID del tablero.'],
  x: ['𝕏 X (Twitter)', 'App en <a href="https://developer.x.com/" target="_blank">developer.x.com</a> con permisos Read and Write. Copiá API key/secret y Access token/secret.'],
};
views.integraciones = async () => {
  setPage('Integraciones');
  const d = await api('/api/admin/integrations');
  view.innerHTML = `<div class="panel"><p>URL pública del sitio: <code>${esc(d.publicUrl)}</code> ${d.publicUrl.startsWith('https://') ? '<span class="tag ok">HTTPS</span>' : '<span class="tag warn">local</span>'}</p>
    <p class="hint">Mientras trabajes en tu PC podés configurar todo, pero MercadoLibre, Instagram y los webhooks necesitan el sitio online con HTTPS (en el VPS). Se configura con <code>PUBLIC_URL</code> en el archivo <code>.env</code>. Los valores guardados acá tienen prioridad sobre el .env.</p></div>
    <div class="cols">${Object.entries(INTEGRATIONS).map(([k, [title, help]]) => {
      const fields = d.fields[k];
      const ready = Object.values(fields).filter((f) => !/opcional|vacío/.test(f.label)).every((f) => f.set);
      return `<form class="panel" data-int="${k}"><h3>${title} ${ready ? '<span class="tag ok">configurado</span>' : '<span class="tag">pendiente</span>'}</h3><p class="hint" style="margin-bottom:12px">${help.replace('{url}', esc(d.publicUrl))}</p>
        <div class="form">${Object.entries(fields).map(([fk, f]) => `<label class="f full">${esc(f.label)}<input name="${fk}" value="${esc(f.value)}" ${f.secret ? 'autocomplete="off"' : ''}></label>`).join('')}</div>
        <button class="btn" style="margin-top:12px">Guardar</button></form>`;
    }).join('')}</div>`;
  $$('[data-int]').forEach((f) => {
    f.onsubmit = async (e) => { e.preventDefault(); try { await api(`/api/admin/integrations/${f.dataset.int}`, Object.fromEntries(new FormData(f)), 'PUT'); toast('Guardado ✔'); views.integraciones(); } catch (x) { err(x); } };
  });
};

/* ---------- Cuenta ---------- */
views.cuenta = async () => {
  setPage('Mi cuenta');
  view.innerHTML = `<form class="panel" id="pw" style="max-width:460px"><h3>Cambiar contraseña</h3><p class="muted">${esc(me.email)}</p><div class="form">
    <label class="f full">Contraseña actual<input type="password" name="current" required></label><label class="f full">Nueva contraseña (mínimo 8)<input type="password" name="next" minlength="8" required></label></div>
    <button class="btn primary" style="margin-top:14px">Actualizar</button></form>`;
  $('#pw').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/auth/password', Object.fromEntries(new FormData(e.target))); toast('Contraseña actualizada'); e.target.reset(); } catch (x) { err(x); } };
};

/* ================= Router + sesión ================= */
async function route() {
  const [name, arg] = location.hash.slice(1).split('/');
  const menu = me.role === 'admin' ? ADMIN_MENU : SELLER_MENU;
  const fallback = menu[0][0];
  const page = views[name] && (me.role === 'admin' || SELLER_MENU.some(([k]) => k === name)) ? name : fallback;
  const parent = { producto: 'productos', vendedor: 'vendedores' }[page] || page;
  $$('#menu a').forEach((a) => a.classList.toggle('active', a.dataset.page === parent));
  document.body.classList.remove('nav-open');
  view.onclick = null;
  view._orders = null;
  view.innerHTML = '<p class="empty">Cargando…</p>';
  try { await views[page](arg && decodeURIComponent(arg)); } catch (e) {
    if (e.status === 401) return showLogin();
    view.innerHTML = `<div class="panel"><p class="error">${esc(e.message)}</p></div>`;
  }
}

// Navegación por filas clickeables y apertura de pedidos
document.addEventListener('click', (e) => {
  if (e.target.closest('a,button,input,select,label')) return;
  const row = e.target.closest('[data-href],[data-order]');
  if (!row) return;
  if (row.dataset.href) location.hash = row.dataset.href;
  else openOrder(row.dataset.order);
});

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
}

api('/api/brand').then((b) => { applyBrand(b); document.title = `Panel · ${b.name}`; }).catch(() => {});

async function start() {
  try { me = await api('/api/auth/me'); } catch { return showLogin(); }
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#meName').textContent = `${me.name} · ${me.role === 'admin' ? 'Administrador' : 'Vendedor'}`;
  const menu = me.role === 'admin' ? ADMIN_MENU : SELLER_MENU;
  $('#menu').innerHTML = menu.map(([k, i, l]) => (k === 'sep' ? `<div class="sep">${i}</div>` : `<a href="#${k}" data-page="${k}"><span>${i}</span>${l}</a>`)).join('');
  route();
}

$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try { await api('/api/auth/login', Object.fromEntries(new FormData(e.target))); start(); } catch (x) { $('#loginError').textContent = x.message; }
};
$('#logout').onclick = async () => { await api('/api/auth/logout', {}); location.hash = ''; location.reload(); };
$('#burger').onclick = () => document.body.classList.toggle('nav-open');
addEventListener('hashchange', () => me && route());
start();
