const config = require('../config');
const { creds } = require('../settings');
const { request } = require('./http');
const { db, getContent } = require('../db');
const orders = require('./orders');

const API = 'https://api.mercadopago.com';
const enabled = () => !!creds('mercadopago').accessToken;
const auth = () => ({ Authorization: `Bearer ${creds('mercadopago').accessToken}` });

async function createPreference(order) {
  const isPublic = config.publicUrl.startsWith('https://');
  const items = order.items.map((l) => ({ id: String(l.id), title: l.color ? `${l.name} (${l.color})` : l.name, quantity: l.qty, unit_price: l.price, currency_id: config.currency }));
  if (order.discount > 0) items.push({ id: 'descuento', title: `Descuento ${order.coupon_code}`, quantity: 1, unit_price: -order.discount, currency_id: config.currency });
  if (order.shipping > 0) items.push({ id: 'envio', title: 'Envío', quantity: 1, unit_price: order.shipping, currency_id: config.currency });
  const back = `${config.publicUrl}/pedido.html?code=${order.code}`;
  const pref = await request(`${API}/checkout/preferences`, {
    method: 'POST', headers: auth(),
    json: {
      items,
      external_reference: order.code,
      payer: { name: order.customer_name, email: order.email || undefined },
      back_urls: { success: back, pending: back, failure: back },
      ...(isPublic ? { auto_return: 'approved', notification_url: `${config.publicUrl}/webhooks/mercadopago` } : {}),
      statement_descriptor: (getContent('site', {}).name || 'TIENDA').normalize('NFD').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, 13),
    },
  });
  return pref.init_point;
}

const STATUS = { approved: 'aprobado', pending: 'pendiente', in_process: 'pendiente', rejected: 'rechazado', cancelled: 'cancelado', refunded: 'devuelto' };

async function handleNotification(paymentId) {
  if (!enabled() || !paymentId) return;
  const p = await request(`${API}/v1/payments/${encodeURIComponent(paymentId)}`, { headers: auth() });
  const o = db.prepare('SELECT id FROM orders WHERE code = ?').get(p.external_reference);
  if (o) orders.markPaid(o.id, String(p.id), STATUS[p.status] || p.status);
}

module.exports = { enabled, createPreference, handleNotification };
