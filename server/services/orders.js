const crypto = require('crypto');
const { db, getContent, productFromRow, json } = require('../db');

class OrderError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

const round = (n) => Math.round(n * 100) / 100;

function findCoupon(code) {
  if (!code) return null;
  return db.prepare('SELECT * FROM coupons WHERE code = ?').get(String(code).trim());
}

// Devuelve el motivo por el que el cupón no aplica, o null si es válido
function couponProblem(coupon, subtotal) {
  if (!coupon || !coupon.active) return 'Código inválido';
  const now = new Date().toISOString().slice(0, 10);
  if (coupon.starts_at && now < coupon.starts_at) return 'Este código todavía no está vigente';
  if (coupon.ends_at && now > coupon.ends_at) return 'Este código expiró';
  if (coupon.max_uses != null && coupon.uses >= coupon.max_uses) return 'Este código alcanzó su límite de usos';
  if (subtotal < coupon.min_total) return `Este código requiere una compra mínima de $${coupon.min_total.toLocaleString('es-AR')}`;
  if (coupon.seller_id && !db.prepare('SELECT active FROM sellers WHERE id = ?').get(coupon.seller_id)?.active) return 'Código inválido';
  return null;
}

function couponDiscount(coupon, subtotal) {
  const d = coupon.type === 'percent' ? subtotal * coupon.value / 100 : coupon.value;
  return round(Math.min(d, subtotal));
}

// items: [{ id, qty, color }]
function quote(items, couponCode) {
  if (!Array.isArray(items) || items.length === 0) throw new OrderError('El carrito está vacío');
  const site = getContent('site', {});
  const lines = items.map((it) => {
    const p = productFromRow(db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(Number(it.id)));
    if (!p) throw new OrderError('Uno de los productos ya no está disponible');
    const qty = Math.max(1, Math.min(99, Math.floor(Number(it.qty) || 1)));
    if (qty > p.stock) throw new OrderError(`Solo quedan ${p.stock} unidades de ${p.name}`);
    const color = p.colors.includes(it.color) ? it.color : p.colors[0] || null;
    return { id: p.id, name: p.name, slug: p.slug, image: p.images[0] || null, price: p.price, qty, color, total: round(p.price * qty) };
  });
  const subtotal = round(lines.reduce((s, l) => s + l.total, 0));

  let coupon = null, discount = 0, couponError = null;
  if (couponCode) {
    const c = findCoupon(couponCode);
    couponError = couponProblem(c, subtotal);
    if (!couponError) { coupon = c; discount = couponDiscount(c, subtotal); }
  }
  const afterDiscount = subtotal - discount;
  const shipping = site.freeShippingFrom && afterDiscount >= site.freeShippingFrom ? 0 : Number(site.shippingFlat || 0);
  return {
    lines, subtotal, discount, shipping, total: round(afterDiscount + shipping),
    coupon: coupon ? { code: coupon.code, type: coupon.type, value: coupon.value, seller_id: coupon.seller_id } : null,
    couponError,
  };
}

const newCode = () => 'NT-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);

function trackCoupon(code, event, orderId = null, meta = null) {
  const c = findCoupon(code);
  if (!c) return false;
  db.prepare('INSERT INTO coupon_events (coupon_id, event, order_id, meta) VALUES (?, ?, ?, ?)').run(c.id, event, orderId, meta ? JSON.stringify(meta) : null);
  return true;
}

const createOrder = db.transaction(({ items, coupon, customer, channel = 'web' }) => {
  const q = quote(items, coupon);
  if (coupon && q.couponError) throw new OrderError(q.couponError);
  const c = customer || {};
  if (!String(c.name || '').trim()) throw new OrderError('Falta el nombre');
  if (!String(c.phone || '').trim() && !String(c.email || '').trim()) throw new OrderError('Dejanos un teléfono o email de contacto');

  const code = newCode();
  const info = db.prepare(`INSERT INTO orders (code, channel, customer_name, email, phone, address, city, notes, items, subtotal, discount, shipping, total, coupon_code, seller_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    code, channel, String(c.name).trim().slice(0, 120), c.email?.trim() || null, c.phone?.trim() || null,
    c.address?.trim() || null, c.city?.trim() || null, c.notes?.trim()?.slice(0, 1000) || null,
    JSON.stringify(q.lines), q.subtotal, q.discount, q.shipping, q.total, q.coupon?.code || null, q.coupon?.seller_id || null);
  for (const l of q.lines) db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(l.qty, l.id);
  if (q.coupon) {
    db.prepare('UPDATE coupons SET uses = uses + 1 WHERE code = ?').run(q.coupon.code);
    trackCoupon(q.coupon.code, 'order', info.lastInsertRowid);
  }
  return getOrder(info.lastInsertRowid);
});

function getOrder(id) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  return o ? { ...o, items: json(o.items, []) } : null;
}

const setStatus = db.transaction((id, status) => {
  const o = getOrder(id);
  if (!o) throw new OrderError('Pedido inexistente', 404);
  if (status === o.status) return o;
  // Al cancelar se devuelve el stock; si se reactiva, se vuelve a descontar
  if (o.channel !== 'mercadolibre' && (status === 'cancelado') !== (o.status === 'cancelado')) {
    const sign = status === 'cancelado' ? 1 : -1;
    for (const l of o.items) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(sign * l.qty, l.id);
  }
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  return getOrder(id);
});

function markPaid(id, paymentId, paymentStatus = 'aprobado') {
  const o = getOrder(id);
  if (!o) return null;
  const wasPaid = o.payment_status === 'aprobado';
  db.prepare("UPDATE orders SET payment_status = ?, payment_id = ?, status = CASE WHEN status = 'nuevo' AND ? = 'aprobado' THEN 'pagado' ELSE status END, updated_at = datetime('now') WHERE id = ?")
    .run(paymentStatus, paymentId, paymentStatus, id);
  if (!wasPaid && paymentStatus === 'aprobado' && o.coupon_code) trackCoupon(o.coupon_code, 'paid', id);
  return getOrder(id);
}

module.exports = { OrderError, quote, createOrder, getOrder, setStatus, markPaid, trackCoupon, findCoupon, couponProblem };
