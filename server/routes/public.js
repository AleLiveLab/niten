const express = require('express');
const config = require('../config');
const { db, getContent, productFromRow } = require('../db');
const orders = require('../services/orders');
const mp = require('../services/mercadopago');
const images = require('../services/images');
const brand = require('../services/brand');

const router = express.Router();
const PUBLIC_KEYS = ['site', 'hero', 'stats', 'featured', 'catalog', 'process', 'custom', 'testimonials', 'faq'];

router.get('/api/site', (req, res) => {
  const content = Object.fromEntries(PUBLIC_KEYS.map((k) => [k, getContent(k, {})]));
  // ?marca=<id>: muestra una variante de marca guardada sin publicarla
  const preview = req.query.marca ? brand.findVariant(String(req.query.marca)) : null;
  if (preview) content.site = { ...content.site, ...preview, preview: true };
  const categories = db.prepare('SELECT id, name, slug FROM categories ORDER BY sort, name').all();
  const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort, id').all().map(productFromRow)
    .map(({ ml_item_id, print_hours, created_at, updated_at, ...p }) => p);
  res.json({ ...content, categories, products, payments: { mercadopago: mp.enabled() }, currency: config.currency });
});

// Nombre, logo y color actuales (lo usan el panel y la página de pedidos)
router.get('/api/brand', (req, res) => {
  const v = req.query.marca ? brand.findVariant(String(req.query.marca)) : null;
  res.json(v ? { ...brand.current(), ...v } : brand.current());
});

// Favicon: el logo si hay uno cargado
router.get('/brand/favicon', (req, res) => {
  const { logo } = brand.current();
  res.set('Cache-Control', 'no-cache').redirect(logo || '/img/favicon.svg');
});

router.post('/api/cart/quote', (req, res, next) => {
  try { res.json(orders.quote(req.body.items, req.body.coupon)); } catch (e) { next(e); }
});

router.post('/api/coupons/check', (req, res, next) => {
  try {
    const q = orders.quote(req.body.items, req.body.code);
    if (q.couponError) return res.status(400).json({ error: q.couponError });
    orders.trackCoupon(req.body.code, 'applied');
    res.json(q);
  } catch (e) { next(e); }
});

// Visitas que llegan con ?ref=CODIGO (link de vendedor). Se deduplica por IP+código cada 6 h.
const seen = new Map();
router.post('/api/track', (req, res) => {
  const code = String(req.body.ref || '').trim().slice(0, 40);
  const coupon = orders.findCoupon(code);
  if (!coupon || !coupon.active) return res.json({ ok: false });
  const key = `${req.ip}|${coupon.code}`;
  const now = Date.now();
  if (!seen.has(key) || now - seen.get(key) > 6 * 3600e3) {
    seen.set(key, now);
    orders.trackCoupon(coupon.code, 'visit', null, { path: String(req.body.path || '').slice(0, 200) });
    if (seen.size > 50000) seen.clear();
  }
  res.json({ ok: true, code: coupon.code });
});

router.post('/api/orders', async (req, res, next) => {
  try {
    const order = orders.createOrder({ items: req.body.items, coupon: req.body.coupon, customer: req.body.customer });
    const site = getContent('site', {});
    let payUrl = null;
    if (mp.enabled() && req.body.payment !== 'transferencia') {
      try { payUrl = await mp.createPreference(order); } catch (e) { console.warn('[MP] no se pudo crear la preferencia:', e.message); }
    }
    const text = `Hola! Hice el pedido *${order.code}* por $${Math.round(order.total).toLocaleString('es-AR')} en la web.`;
    res.json({
      code: order.code, total: order.total, payUrl,
      whatsappUrl: site.whatsapp ? `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}` : null,
    });
  } catch (e) { next(e); }
});

router.get('/api/orders/:code', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE code = ?').get(req.params.code);
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado' });
  res.json({ code: o.code, status: o.status, payment_status: o.payment_status, total: o.total, subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, items: JSON.parse(o.items), created_at: o.created_at, customer_name: o.customer_name.split(' ')[0] });
});

// Versión JPG de cualquier imagen del sitio (MercadoLibre, WhatsApp e Instagram no aceptan SVG)
router.get('/media/raster', async (req, res, next) => {
  try {
    const buf = await images.raster(req.query.src, { size: Math.min(Number(req.query.size) || 1200, 2000) });
    if (!buf) return res.status(404).end();
    res.type('jpeg').set('Cache-Control', 'public, max-age=86400').send(buf);
  } catch (e) { next(e); }
});

module.exports = router;
