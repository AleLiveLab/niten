// Integración con MercadoLibre: OAuth, publicar productos, sincronizar precio/stock e importar ventas.
const config = require('../config');
const { creds } = require('../settings');
const { request } = require('./http');
const { db, getContent, setContent, productFromRow } = require('../db');

const API = 'https://api.mercadolibre.com';
const redirectUri = () => `${config.publicUrl}/api/admin/ml/callback`;
const configured = () => { const c = creds('mercadolibre'); return !!(c.clientId && c.clientSecret); };
const connection = () => getContent('ml_auth', null);

function authUrl(state) {
  const c = creds('mercadolibre');
  return `${c.authHost}/authorization?response_type=code&client_id=${encodeURIComponent(c.clientId)}&redirect_uri=${encodeURIComponent(redirectUri())}&state=${encodeURIComponent(state)}`;
}

async function tokenRequest(params) {
  const c = creds('mercadolibre');
  const body = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...params });
  const t = await request(`${API}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
  const saved = { access_token: t.access_token, refresh_token: t.refresh_token, user_id: t.user_id, expires_at: Date.now() + (t.expires_in - 300) * 1000 };
  if (!saved.user_id) saved.user_id = connection()?.user_id;
  setContent('ml_auth', saved);
  return saved;
}

const exchangeCode = (code) => tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });

async function token() {
  const conn = connection();
  if (!conn) throw new Error('MercadoLibre no está conectado');
  if (Date.now() < conn.expires_at) return conn.access_token;
  return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: conn.refresh_token })).access_token;
}

const api = async (path, opts = {}) => request(`${API}${path}`, { ...opts, headers: { Authorization: `Bearer ${await token()}`, ...(opts.headers || {}) } });

async function status() {
  if (!configured()) return { configured: false, connected: false };
  const conn = connection();
  if (!conn) return { configured: true, connected: false };
  try {
    const me = await api('/users/me');
    return { configured: true, connected: true, nickname: me.nickname, user_id: me.id, permalink: me.permalink };
  } catch (e) { return { configured: true, connected: false, error: e.message }; }
}

// ML necesita URLs públicas de imágenes JPG/PNG: usamos el rasterizador del sitio
const pictureUrls = (p) => p.images.map((src) => ({ source: `${config.publicUrl}/media/raster?src=${encodeURIComponent(src)}` }));

async function publish(productId) {
  const p = productFromRow(db.prepare('SELECT * FROM products WHERE id = ?').get(productId));
  if (!p) throw new Error('Producto inexistente');
  if (!config.publicUrl.startsWith('https://')) throw new Error('Para publicar en MercadoLibre el sitio tiene que estar online con HTTPS (PUBLIC_URL), así ML puede descargar las fotos.');
  const site = creds('mercadolibre').siteId;
  const title = p.name.slice(0, 60);

  if (p.ml_item_id) return sync(productId);

  const [guess] = await request(`${API}/sites/${site}/domain_discovery/search?limit=1&q=${encodeURIComponent(p.name + ' impresion 3d')}`);
  if (!guess) throw new Error('MercadoLibre no sugirió una categoría para este producto');
  const brand = getContent('site', {}).name || 'Tienda';
  const item = await api('/items', {
    method: 'POST',
    json: {
      title, category_id: guess.category_id, price: p.price, currency_id: config.currency,
      available_quantity: Math.max(p.stock, 1), buying_mode: 'buy_it_now', condition: 'new', listing_type_id: 'gold_special',
      pictures: pictureUrls(p),
      attributes: [{ id: 'BRAND', value_name: brand }, { id: 'MODEL', value_name: title }, { id: 'MATERIAL', value_name: p.material }],
    },
  });
  await api(`/items/${item.id}/description`, { method: 'POST', json: { plain_text: `${p.description}\n\nMaterial: ${p.material}\nImpreso en 3D por ${brand}.` } }).catch(() => {});
  db.prepare('UPDATE products SET ml_item_id = ?, ml_permalink = ? WHERE id = ?').run(item.id, item.permalink, p.id);
  return { id: item.id, permalink: item.permalink, category: guess.category_name };
}

async function sync(productId) {
  const p = productFromRow(db.prepare('SELECT * FROM products WHERE id = ?').get(productId));
  if (!p?.ml_item_id) return null;
  const body = { price: p.price, available_quantity: Math.max(p.stock, 0) };
  if (p.stock <= 0 || !p.active) body.status = 'paused'; else body.status = 'active';
  const item = await api(`/items/${p.ml_item_id}`, { method: 'PUT', json: body });
  return { id: item.id, permalink: item.permalink, status: item.status };
}

// Sincroniza en segundo plano sin romper la operación principal si ML falla
function syncQuietly(productId) {
  if (!connection()) return;
  sync(productId).catch((e) => console.warn(`[ML] no se pudo sincronizar producto ${productId}: ${e.message}`));
}

function saveOrder(o) {
  const ext = `ML-${o.id}`;
  if (db.prepare('SELECT 1 FROM orders WHERE external_id = ?').get(ext)) return false;
  const items = (o.order_items || []).map((it) => {
    const local = db.prepare('SELECT id, slug, images FROM products WHERE ml_item_id = ?').get(it.item.id);
    return { id: local?.id || null, name: it.item.title, slug: local?.slug || null, image: local ? JSON.parse(local.images)[0] : null, price: it.unit_price, qty: it.quantity, color: null, total: it.unit_price * it.quantity };
  });
  const total = Number(o.total_amount || items.reduce((s, l) => s + l.total, 0));
  const paid = o.status === 'paid';
  db.transaction(() => {
    db.prepare(`INSERT INTO orders (code, channel, customer_name, items, subtotal, total, status, payment_status, payment_id, external_id, created_at)
      VALUES (?, 'mercadolibre', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      ext, o.buyer?.nickname || 'Comprador ML', JSON.stringify(items), total, total,
      paid ? 'pagado' : o.status === 'cancelled' ? 'cancelado' : 'nuevo', paid ? 'aprobado' : 'pendiente',
      o.payments?.[0]?.id ? String(o.payments[0].id) : null, ext, (o.date_created || new Date().toISOString()).replace('T', ' ').slice(0, 19));
    for (const l of items) if (l.id) db.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?').run(l.qty, l.id);
  })();
  return true;
}

async function importOrders() {
  const conn = connection();
  if (!conn) throw new Error('MercadoLibre no está conectado');
  const res = await api(`/orders/search?seller=${conn.user_id}&sort=date_desc&limit=50`);
  let added = 0;
  for (const o of res.results || []) if (saveOrder(o)) added++;
  return { added, total: res.results?.length || 0 };
}

async function handleNotification(body) {
  if (!connection() || !body?.resource) return;
  if (body.topic === 'orders_v2' || body.topic === 'orders') {
    const o = await api(body.resource);
    saveOrder(o);
  }
}

function disconnect() { setContent('ml_auth', null); }

module.exports = { configured, connection, authUrl, exchangeCode, status, publish, sync, syncQuietly, importOrders, handleNotification, disconnect, redirectUri };
