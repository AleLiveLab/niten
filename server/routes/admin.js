const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const config = require('../config');
const { db, getContent, setContent, productFromRow, json } = require('../db');
const auth = require('../auth');
const defaults = require('../defaults');
const settings = require('../settings');
const orders = require('../services/orders');
const stats = require('../services/stats');
const images = require('../services/images');
const social = require('../services/social');
const wa = require('../services/whatsapp');
const ml = require('../services/mercadolibre');
const mp = require('../services/mercadopago');

const router = express.Router();
const admin = auth.requireRole('admin');
const anyUser = auth.requireRole('admin', 'seller');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';

/* ---------- Sesión ---------- */
// Máximo 10 intentos fallidos cada 15 minutos por IP
const attempts = new Map();
router.post('/api/auth/login', (req, res) => {
  const now = Date.now();
  const a = attempts.get(req.ip) || { n: 0, t: now };
  if (now - a.t > 15 * 60e3) { a.n = 0; a.t = now; }
  if (a.n >= 10) return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
  const r = auth.login(req.body.email, req.body.password);
  if (!r) { a.n++; attempts.set(req.ip, a); return res.status(401).json({ error: 'Email o contraseña incorrectos' }); }
  attempts.delete(req.ip);
  res.cookie(auth.COOKIE, r.token, auth.cookieOptions()).json(r.user);
});
router.post('/api/auth/logout', (req, res) => res.clearCookie(auth.COOKIE).json({ ok: true }));
router.get('/api/auth/me', anyUser, (req, res) => res.json(req.user));
router.post('/api/auth/password', anyUser, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(String(req.body.current || ''), u.password_hash)) return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  if (String(req.body.next || '').length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(req.body.next, 10), u.id);
  res.json({ ok: true });
});

/* ---------- Panel del vendedor ---------- */
router.get('/api/seller/me', anyUser, (req, res) => {
  const id = req.user.role === 'admin' ? Number(req.query.seller_id) : req.user.seller_id;
  const s = stats.sellerStats(id);
  if (!s) return res.status(404).json({ error: 'Vendedor no encontrado' });
  const list = db.prepare('SELECT code, customer_name, subtotal, discount, total, status, payment_status, coupon_code, created_at FROM orders WHERE seller_id = ? ORDER BY id DESC LIMIT 100').all(id)
    .map((o) => ({ ...o, customer_name: req.user.role === 'admin' ? o.customer_name : o.customer_name.split(' ')[0] }));
  res.json({ ...s, orders_list: list, site_url: config.publicUrl });
});

// Imagen promocional con el código del vendedor (para que la comparta en sus redes)
router.post('/api/seller/promo', anyUser, wrap(async (req, res) => {
  const code = String(req.body.couponCode || '');
  const coupon = orders.findCoupon(code);
  if (req.user.role !== 'admin' && (!coupon || coupon.seller_id !== req.user.seller_id)) return res.status(403).json({ error: 'Ese código no es tuyo' });
  const p = productFromRow(db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(Number(req.body.product_id)));
  if (!p) return res.status(404).json({ error: 'Producto inexistente' });
  res.type('png').send(await images.promoImage(p, { template: req.body.template, couponCode: coupon?.code }));
}));

/* ---------- Dashboard ---------- */
router.get('/api/admin/dashboard', admin, (req, res) => res.json(stats.dashboard()));

/* ---------- Imágenes ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)),
});
router.post('/api/admin/upload', admin, upload.array('files', 10), wrap(async (req, res) => {
  const dir = path.join(config.uploadsDir, 'products');
  fs.mkdirSync(dir, { recursive: true });
  const urls = [];
  for (const f of req.files || []) {
    const name = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.webp`;
    await sharp(f.buffer).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(dir, name));
    urls.push(`/uploads/products/${name}`);
  }
  res.json({ urls });
}));

/* ---------- Productos y categorías ---------- */
router.get('/api/admin/products', admin, (req, res) => {
  res.json(db.prepare('SELECT p.*, c.name category FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.sort, p.id').all().map(productFromRow));
});

function productFields(b) {
  const num = (v) => (v === '' || v == null ? null : Number(v));
  return {
    name: String(b.name || '').trim(), short: String(b.short || ''), description: String(b.description || ''),
    price: Number(b.price) || 0, compare_price: num(b.compare_price), stock: Math.max(0, Number(b.stock) || 0),
    category_id: num(b.category_id), images: JSON.stringify(Array.isArray(b.images) ? b.images : []),
    colors: JSON.stringify(Array.isArray(b.colors) ? b.colors : []), material: String(b.material || 'PLA'),
    print_hours: num(b.print_hours), badge: b.badge ? String(b.badge) : null,
    featured: b.featured ? 1 : 0, active: b.active === false ? 0 : 1, sort: Number(b.sort) || 0,
  };
}

router.post('/api/admin/products', admin, (req, res) => {
  const f = productFields(req.body);
  if (!f.name) return res.status(400).json({ error: 'Falta el nombre' });
  let slug = slugify(req.body.slug || f.name);
  while (db.prepare('SELECT 1 FROM products WHERE slug = ?').get(slug)) slug += '-' + crypto.randomBytes(2).toString('hex');
  const id = db.prepare(`INSERT INTO products (slug, ${Object.keys(f).join(', ')}) VALUES (@slug, ${Object.keys(f).map((k) => '@' + k).join(', ')})`).run({ slug, ...f }).lastInsertRowid;
  res.json(productFromRow(db.prepare('SELECT * FROM products WHERE id = ?').get(id)));
});

router.put('/api/admin/products/:id', admin, (req, res) => {
  const f = productFields(req.body);
  if (!f.name) return res.status(400).json({ error: 'Falta el nombre' });
  const r = db.prepare(`UPDATE products SET ${Object.keys(f).map((k) => `${k} = @${k}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`).run({ ...f, id: Number(req.params.id) });
  if (!r.changes) return res.status(404).json({ error: 'Producto inexistente' });
  ml.syncQuietly(Number(req.params.id));
  res.json(productFromRow(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)));
});

router.delete('/api/admin/products/:id', admin, (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/api/admin/categories', admin, (req, res) => res.json(db.prepare('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) products FROM categories c ORDER BY sort, name').all()));
router.post('/api/admin/categories', admin, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  try { res.json(db.prepare('INSERT INTO categories (name, slug, sort) VALUES (?, ?, ?) RETURNING *').get(name, slugify(name), Number(req.body.sort) || 0)); } catch { res.status(400).json({ error: 'Ya existe una categoría con ese nombre' }); }
});
router.put('/api/admin/categories/:id', admin, (req, res) => {
  db.prepare('UPDATE categories SET name = ?, sort = ? WHERE id = ?').run(String(req.body.name).trim(), Number(req.body.sort) || 0, req.params.id);
  res.json({ ok: true });
});
router.delete('/api/admin/categories/:id', admin, (req, res) => { db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id); res.json({ ok: true }); });

/* ---------- Contenido del sitio ---------- */
const CONTENT_KEYS = Object.keys(defaults);
router.get('/api/admin/content', admin, (req, res) => res.json(Object.fromEntries(CONTENT_KEYS.map((k) => [k, getContent(k, defaults[k])]))));
router.put('/api/admin/content/:key', admin, (req, res) => {
  if (!CONTENT_KEYS.includes(req.params.key)) return res.status(400).json({ error: 'Sección desconocida' });
  if (typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'Formato inválido' });
  setContent(req.params.key, req.body);
  res.json({ ok: true });
});
router.post('/api/admin/content/:key/reset', admin, (req, res) => {
  if (!CONTENT_KEYS.includes(req.params.key)) return res.status(400).json({ error: 'Sección desconocida' });
  setContent(req.params.key, defaults[req.params.key]);
  res.json(defaults[req.params.key]);
});

/* ---------- Cupones ---------- */
router.get('/api/admin/coupons', admin, (req, res) => res.json(stats.couponStats()));
function couponFields(b) {
  return {
    code: String(b.code || '').trim().toUpperCase().replace(/\s+/g, ''),
    type: b.type === 'fixed' ? 'fixed' : 'percent', value: Number(b.value) || 0,
    seller_id: b.seller_id ? Number(b.seller_id) : null, min_total: Number(b.min_total) || 0,
    max_uses: b.max_uses === '' || b.max_uses == null ? null : Number(b.max_uses),
    starts_at: b.starts_at || null, ends_at: b.ends_at || null, active: b.active === false ? 0 : 1, description: b.description || null,
  };
}
const couponError = (f) => (!/^[A-Z0-9_-]{3,30}$/.test(f.code) ? 'El código debe tener entre 3 y 30 letras, números, - o _' : f.value <= 0 ? 'El valor debe ser mayor a 0' : f.type === 'percent' && f.value > 100 ? 'El porcentaje no puede superar 100' : null);
router.post('/api/admin/coupons', admin, (req, res) => {
  const f = couponFields(req.body);
  const err = couponError(f);
  if (err) return res.status(400).json({ error: err });
  try { db.prepare(`INSERT INTO coupons (${Object.keys(f).join(', ')}) VALUES (${Object.keys(f).map((k) => '@' + k).join(', ')})`).run(f); } catch { return res.status(400).json({ error: 'Ese código ya existe' }); }
  res.json({ ok: true });
});
router.put('/api/admin/coupons/:id', admin, (req, res) => {
  const f = couponFields(req.body);
  const err = couponError(f);
  if (err) return res.status(400).json({ error: err });
  try { db.prepare(`UPDATE coupons SET ${Object.keys(f).map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...f, id: Number(req.params.id) }); } catch { return res.status(400).json({ error: 'Ese código ya existe' }); }
  res.json({ ok: true });
});
router.delete('/api/admin/coupons/:id', admin, (req, res) => { db.prepare('DELETE FROM coupons WHERE id = ?').run(req.params.id); res.json({ ok: true }); });

/* ---------- Vendedores ---------- */
router.get('/api/admin/sellers', admin, (req, res) => {
  const rows = db.prepare('SELECT s.*, u.email AS login FROM sellers s LEFT JOIN users u ON u.seller_id = s.id ORDER BY s.name').all();
  res.json(rows.map((s) => { const st = stats.sellerStats(s.id); return { ...s, orders: st.orders, revenue: st.revenue, paid_revenue: st.paid_revenue, commission: st.commission, visits: st.visits, codes: st.coupons.map((c) => c.code) }; }));
});
router.post('/api/admin/sellers', admin, (req, res) => {
  const b = req.body;
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  if (b.password && String(b.password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  if (b.password && !email) return res.status(400).json({ error: 'Para darle acceso al panel necesita un email' });
  try {
    db.transaction(() => {
      const id = db.prepare('INSERT INTO sellers (name, email, phone, commission_pct) VALUES (?, ?, ?, ?)').run(name, email || null, b.phone || null, Number(b.commission_pct) || 0).lastInsertRowid;
      if (b.password) db.prepare("INSERT INTO users (email, name, password_hash, role, seller_id) VALUES (?, ?, ?, 'seller', ?)").run(email, name, bcrypt.hashSync(b.password, 10), id);
      if (b.code) {
        const f = couponFields({ code: b.code, type: 'percent', value: Number(b.code_value) || 10, seller_id: id, description: `Código de ${name}` });
        const err = couponError(f);
        if (err) throw new Error(err);
        db.prepare(`INSERT INTO coupons (${Object.keys(f).join(', ')}) VALUES (${Object.keys(f).map((k) => '@' + k).join(', ')})`).run(f);
      }
    })();
  } catch (e) { return res.status(400).json({ error: /UNIQUE/.test(e.message) ? 'El email o el código ya están en uso' : e.message }); }
  res.json({ ok: true });
});
router.put('/api/admin/sellers/:id', admin, (req, res) => {
  const b = req.body;
  const id = Number(req.params.id);
  try {
    db.transaction(() => {
      db.prepare('UPDATE sellers SET name = ?, email = ?, phone = ?, commission_pct = ?, active = ? WHERE id = ?').run(String(b.name).trim(), b.email || null, b.phone || null, Number(b.commission_pct) || 0, b.active === false ? 0 : 1, id);
      if (b.password) {
        if (String(b.password).length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
        const email = String(b.email || '').toLowerCase();
        if (!email) throw new Error('Para darle acceso al panel necesita un email');
        const u = db.prepare('SELECT id FROM users WHERE seller_id = ?').get(id);
        if (u) db.prepare('UPDATE users SET email = ?, name = ?, password_hash = ? WHERE id = ?').run(email, b.name, bcrypt.hashSync(b.password, 10), u.id);
        else db.prepare("INSERT INTO users (email, name, password_hash, role, seller_id) VALUES (?, ?, ?, 'seller', ?)").run(email, b.name, bcrypt.hashSync(b.password, 10), id);
      } else if (b.email) {
        db.prepare('UPDATE users SET email = ?, name = ? WHERE seller_id = ?').run(String(b.email).toLowerCase(), b.name, id);
      }
    })();
  } catch (e) { return res.status(400).json({ error: /UNIQUE/.test(e.message) ? 'Ese email ya está en uso' : e.message }); }
  res.json({ ok: true });
});
router.delete('/api/admin/sellers/:id', admin, (req, res) => { db.prepare('DELETE FROM sellers WHERE id = ?').run(req.params.id); res.json({ ok: true }); });

/* ---------- Pedidos ---------- */
router.get('/api/admin/orders', admin, (req, res) => {
  const where = []; const p = {};
  if (req.query.status) { where.push('o.status = @status'); p.status = req.query.status; }
  if (req.query.channel) { where.push('o.channel = @channel'); p.channel = req.query.channel; }
  if (req.query.seller_id) { where.push('o.seller_id = @seller'); p.seller = Number(req.query.seller_id); }
  if (req.query.q) { where.push('(o.code LIKE @q OR o.customer_name LIKE @q OR o.email LIKE @q OR o.phone LIKE @q)'); p.q = `%${req.query.q}%`; }
  const rows = db.prepare(`SELECT o.*, s.name seller_name FROM orders o LEFT JOIN sellers s ON s.id = o.seller_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 500`).all(p);
  res.json(rows.map((o) => ({ ...o, items: json(o.items, []) })));
});
const STATUSES = ['nuevo', 'pagado', 'en_produccion', 'enviado', 'entregado', 'cancelado'];
router.patch('/api/admin/orders/:id', admin, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (req.body.status) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Estado inválido' });
      const o = orders.setStatus(id, req.body.status);
      for (const l of o.items) if (l.id) ml.syncQuietly(l.id);
    }
    if (req.body.payment_status) {
      if (req.body.payment_status === 'aprobado') orders.markPaid(id, req.body.payment_id || 'manual');
      else db.prepare('UPDATE orders SET payment_status = ? WHERE id = ?').run(req.body.payment_status, id);
    }
    if ('notes' in req.body) db.prepare('UPDATE orders SET notes = ? WHERE id = ?').run(req.body.notes, id);
    res.json(orders.getOrder(id));
  } catch (e) { next(e); }
});
// Venta manual (ej: vendida en persona o por WhatsApp) para que cuente en stock y comisiones
router.post('/api/admin/orders', admin, (req, res, next) => {
  try {
    const o = orders.createOrder({ items: req.body.items, coupon: req.body.coupon, customer: req.body.customer, channel: req.body.channel || 'manual' });
    for (const l of o.items) ml.syncQuietly(l.id);
    res.json(o);
  } catch (e) { next(e); }
});

/* ---------- Redes sociales ---------- */
const money = (n) => '$' + Math.round(n).toLocaleString('es-AR');
function loadProduct(id) {
  const p = productFromRow(db.prepare('SELECT * FROM products WHERE id = ?').get(Number(id)));
  if (!p) { const e = new Error('Producto inexistente'); e.status = 404; throw e; }
  return p;
}
function buildCaption(p, couponCode) {
  const s = getContent('social', defaults.social);
  const coupon = couponCode ? orders.findCoupon(couponCode) : null;
  const discount = coupon ? ` · ${coupon.type === 'percent' ? coupon.value + '% OFF' : money(coupon.value) + ' OFF'} con el código ${coupon.code}` : p.compare_price > p.price ? ` (antes ${money(p.compare_price)})` : '';
  const link = `${config.publicUrl}/${coupon ? `?ref=${coupon.code}` : ''}#p/${p.slug}`;
  return s.captionTemplate.replace(/\{(\w+)\}/g, (_, k) => ({ nombre: p.name, descripcion: p.short, precio: money(p.price), descuento: discount, link, hashtags: s.hashtags, codigo: coupon?.code || '' }[k] ?? ''));
}
router.get('/api/admin/social/status', admin, (req, res) => res.json({ networks: social.status(), templates: images.TEMPLATES, publicUrl: config.publicUrl }));
router.get('/api/admin/social/caption', admin, (req, res, next) => { try { res.json({ caption: buildCaption(loadProduct(req.query.product_id), req.query.coupon) }); } catch (e) { next(e); } });
const promoOpts = (b) => ({ template: b.template, headline: b.headline, discountText: b.discountText, couponCode: b.couponCode, price: b.price ? Number(b.price) : undefined });
router.post('/api/admin/social/preview', admin, wrap(async (req, res) => {
  const png = await images.promoImage(loadProduct(req.body.product_id), promoOpts(req.body));
  res.type('png').send(png);
}));
router.post('/api/admin/social/publish', admin, wrap(async (req, res) => {
  const p = loadProduct(req.body.product_id);
  const networks = Array.isArray(req.body.networks) ? req.body.networks : [];
  const png = await images.promoImage(p, promoOpts(req.body));
  const dir = path.join(config.uploadsDir, 'promos');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${p.slug}.png`;
  fs.writeFileSync(path.join(dir, name), png);
  const imagePath = `/uploads/promos/${name}`;
  const caption = String(req.body.caption || buildCaption(p, req.body.couponCode));
  const results = networks.length ? await social.publishAll({ image: png, imageUrl: config.publicUrl + imagePath, caption, title: p.name, link: `${config.publicUrl}/#p/${p.slug}` }, networks) : {};
  const id = db.prepare('INSERT INTO social_posts (product_id, image, caption, results) VALUES (?, ?, ?, ?)').run(p.id, imagePath, caption, JSON.stringify(results)).lastInsertRowid;
  res.json({ id, image: imagePath, caption, results });
}));
router.get('/api/admin/social/posts', admin, (req, res) => {
  res.json(db.prepare('SELECT sp.*, p.name product FROM social_posts sp LEFT JOIN products p ON p.id = sp.product_id ORDER BY sp.id DESC LIMIT 60').all().map((r) => ({ ...r, results: json(r.results, {}) })));
});

/* ---------- WhatsApp ---------- */
router.get('/api/admin/whatsapp', admin, (req, res) => {
  const chats = db.prepare(`SELECT s.*, (SELECT body FROM wa_messages m WHERE m.phone = s.phone ORDER BY id DESC LIMIT 1) last,
    (SELECT created_at FROM wa_messages m WHERE m.phone = s.phone ORDER BY id DESC LIMIT 1) last_at FROM wa_sessions s ORDER BY last_at DESC LIMIT 200`).all();
  res.json({ enabled: wa.enabled(), webhook: `${config.publicUrl}/webhooks/whatsapp`, verifyToken: settings.creds('whatsapp').verifyToken, chats });
});
router.get('/api/admin/whatsapp/:phone', admin, (req, res) => res.json(db.prepare('SELECT * FROM wa_messages WHERE phone = ? ORDER BY id DESC LIMIT 200').all(req.params.phone).reverse()));
router.post('/api/admin/whatsapp/:phone/send', admin, wrap(async (req, res) => {
  if (!wa.enabled()) return res.status(400).json({ error: 'WhatsApp no está configurado' });
  await wa.send(req.params.phone, { type: 'text', body: String(req.body.text || '') });
  db.prepare("UPDATE wa_sessions SET human = 1, updated_at = datetime('now') WHERE phone = ?").run(req.params.phone);
  res.json({ ok: true });
}));
router.post('/api/admin/whatsapp/:phone/release', admin, (req, res) => {
  db.prepare("UPDATE wa_sessions SET human = 0, state = 'menu' WHERE phone = ?").run(req.params.phone);
  res.json({ ok: true });
});
// Simulador: prueba las respuestas del bot sin enviar nada a WhatsApp
router.post('/api/admin/whatsapp-sim', admin, (req, res) => {
  const phone = 'simulador';
  if (req.body.reset) db.prepare('DELETE FROM wa_sessions WHERE phone = ?').run(phone);
  res.json(wa.reply(phone, 'Cliente', String(req.body.text || '')));
});

/* ---------- MercadoLibre ---------- */
router.get('/api/admin/ml/status', admin, wrap(async (req, res) => res.json({ ...(await ml.status()), redirectUri: ml.redirectUri(), webhook: `${config.publicUrl}/webhooks/mercadolibre` })));
router.get('/api/admin/ml/connect', admin, (req, res) => {
  if (!ml.configured()) return res.status(400).send('Configurá primero App ID y Client secret de MercadoLibre en Integraciones.');
  const state = crypto.randomBytes(12).toString('hex');
  res.cookie('ml_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 600000 }).redirect(ml.authUrl(state));
});
router.get('/api/admin/ml/callback', admin, wrap(async (req, res) => {
  if (!req.query.code || req.query.state !== req.cookies.ml_state) return res.status(400).send('Autorización inválida. Volvé a intentar desde el panel.');
  await ml.exchangeCode(req.query.code);
  res.clearCookie('ml_state').redirect('/admin/#mercadolibre');
}));
router.post('/api/admin/ml/disconnect', admin, (req, res) => { ml.disconnect(); res.json({ ok: true }); });
router.post('/api/admin/ml/publish/:id', admin, wrap(async (req, res) => res.json(await ml.publish(Number(req.params.id)))));
router.post('/api/admin/ml/import', admin, wrap(async (req, res) => res.json(await ml.importOrders())));

/* ---------- Integraciones ---------- */
router.get('/api/admin/integrations', admin, (req, res) => res.json({ fields: settings.describe(), publicUrl: config.publicUrl, mercadopago: mp.enabled() }));
router.put('/api/admin/integrations/:name', admin, (req, res) => {
  try { settings.update(req.params.name, req.body || {}); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
