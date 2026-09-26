const { db } = require('../db');

const VALID = "status != 'cancelado'";

function couponStats(where = '1=1', params = []) {
  return db.prepare(`
    SELECT c.*, s.name AS seller_name,
      (SELECT COUNT(*) FROM coupon_events e WHERE e.coupon_id = c.id AND e.event = 'visit') AS visits,
      (SELECT COUNT(*) FROM coupon_events e WHERE e.coupon_id = c.id AND e.event = 'applied') AS applied,
      (SELECT COUNT(*) FROM orders o WHERE o.coupon_code = c.code COLLATE NOCASE AND o.${VALID}) AS orders,
      (SELECT COUNT(*) FROM orders o WHERE o.coupon_code = c.code COLLATE NOCASE AND o.payment_status = 'aprobado' AND o.${VALID}) AS paid_orders,
      (SELECT COALESCE(SUM(o.subtotal - o.discount), 0) FROM orders o WHERE o.coupon_code = c.code COLLATE NOCASE AND o.${VALID}) AS revenue,
      (SELECT COALESCE(SUM(o.discount), 0) FROM orders o WHERE o.coupon_code = c.code COLLATE NOCASE AND o.${VALID}) AS discount_given
    FROM coupons c LEFT JOIN sellers s ON s.id = c.seller_id
    WHERE ${where} ORDER BY c.created_at DESC`).all(...params);
}

function sellerStats(sellerId) {
  const seller = db.prepare('SELECT * FROM sellers WHERE id = ?').get(sellerId);
  if (!seller) return null;
  const agg = db.prepare(`SELECT COUNT(*) orders,
      COALESCE(SUM(subtotal - discount), 0) revenue,
      COALESCE(SUM(CASE WHEN payment_status = 'aprobado' THEN subtotal - discount END), 0) paid_revenue,
      COALESCE(SUM(CASE WHEN payment_status = 'aprobado' THEN 1 END), 0) paid_orders
    FROM orders WHERE seller_id = ? AND ${VALID}`).get(sellerId);
  const coupons = couponStats('c.seller_id = ?', [sellerId]);
  const visits = coupons.reduce((s, c) => s + c.visits, 0);
  const monthly = db.prepare(`SELECT strftime('%Y-%m', created_at) month, COUNT(*) orders, SUM(subtotal - discount) revenue
    FROM orders WHERE seller_id = ? AND ${VALID} GROUP BY month ORDER BY month DESC LIMIT 12`).all(sellerId);
  return {
    seller, ...agg, visits,
    conversion: visits ? agg.orders / visits : null,
    commission: Math.round(agg.paid_revenue * seller.commission_pct) / 100,
    coupons, monthly,
  };
}

function dashboard() {
  const totals = db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(total), 0) revenue,
      COALESCE(SUM(CASE WHEN payment_status = 'aprobado' THEN total END), 0) paid,
      COALESCE(AVG(total), 0) avg_ticket
    FROM orders WHERE ${VALID}`).get();
  const month = db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(total), 0) revenue FROM orders WHERE ${VALID} AND created_at >= date('now', 'start of month')`).get();
  const byDay = db.prepare(`SELECT date(created_at) day, COUNT(*) orders, SUM(total) revenue FROM orders
    WHERE ${VALID} AND created_at >= date('now', '-29 days') GROUP BY day ORDER BY day`).all();
  const byChannel = db.prepare(`SELECT channel, COUNT(*) orders, SUM(total) revenue FROM orders WHERE ${VALID} GROUP BY channel`).all();
  const byStatus = db.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all();
  const sellers = db.prepare('SELECT id FROM sellers ORDER BY name').all().map((s) => sellerStats(s.id))
    .map(({ seller, orders, revenue, paid_revenue, commission, visits, conversion }) => ({ id: seller.id, name: seller.name, active: seller.active, orders, revenue, paid_revenue, commission, visits, conversion }))
    .sort((a, b) => b.revenue - a.revenue);
  const lowStock = db.prepare('SELECT id, name, stock FROM products WHERE active = 1 AND stock <= 3 ORDER BY stock').all();
  const topProducts = db.prepare(`SELECT json_extract(j.value, '$.name') name, SUM(json_extract(j.value, '$.qty')) qty, SUM(json_extract(j.value, '$.total')) revenue
    FROM orders o, json_each(o.items) j WHERE o.${VALID} GROUP BY name ORDER BY qty DESC LIMIT 5`).all();
  const recent = db.prepare('SELECT id, code, customer_name, total, status, payment_status, channel, created_at FROM orders ORDER BY id DESC LIMIT 8').all();
  return { totals, month, byDay, byChannel, byStatus, sellers, lowStock, topProducts, recent };
}

module.exports = { couponStats, sellerStats, dashboard };
