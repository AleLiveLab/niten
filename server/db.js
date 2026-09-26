const fs = require('fs');
const path = require('path');
// SQLite integrado en Node (node:sqlite): no requiere compilar nada al instalar
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

const db = new DatabaseSync(path.join(config.dataDir, 'niten.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// db.transaction(fn) devuelve una función que ejecuta fn dentro de una transacción
// (con savepoints, así se pueden anidar)
let depth = 0;
db.transaction = (fn) => (...args) => {
  const sp = `sp${depth++}`;
  db.exec(`SAVEPOINT ${sp}`);
  try {
    const result = fn(...args);
    db.exec(`RELEASE ${sp}`);
    return result;
  } catch (e) {
    db.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw e;
  } finally { depth--; }
};

db.exec(`
CREATE TABLE IF NOT EXISTS sellers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  commission_pct REAL NOT NULL DEFAULT 10,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','seller')),
  seller_id INTEGER REFERENCES sellers(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL,
  compare_price REAL,
  stock INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  images TEXT NOT NULL DEFAULT '[]',
  colors TEXT NOT NULL DEFAULT '[]',
  material TEXT NOT NULL DEFAULT 'PLA',
  print_hours REAL,
  badge TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  ml_item_id TEXT,
  ml_permalink TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL CHECK (type IN ('percent','fixed')),
  value REAL NOT NULL,
  seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
  min_total REAL NOT NULL DEFAULT 0,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS coupon_events (
  id INTEGER PRIMARY KEY,
  coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('visit','applied','order','paid')),
  order_id INTEGER,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coupon_events ON coupon_events(coupon_id, event);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL DEFAULT 'web',
  customer_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  notes TEXT,
  items TEXT NOT NULL,
  subtotal REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  shipping REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  coupon_code TEXT,
  seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'nuevo',
  payment_status TEXT NOT NULL DEFAULT 'pendiente',
  payment_id TEXT,
  external_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  image TEXT NOT NULL,
  caption TEXT NOT NULL,
  results TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wa_sessions (
  phone TEXT PRIMARY KEY,
  name TEXT,
  state TEXT NOT NULL DEFAULT 'menu',
  human INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wa_messages (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const json = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

function getContent(key, fallback = null) {
  const row = db.prepare('SELECT value FROM content WHERE key = ?').get(key);
  return row ? json(row.value, fallback) : fallback;
}
function setContent(key, value) {
  db.prepare(`INSERT INTO content (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(key, JSON.stringify(value));
}

function productFromRow(r) {
  if (!r) return null;
  return { ...r, images: json(r.images, []), colors: json(r.colors, []), featured: !!r.featured, active: !!r.active };
}

module.exports = { db, json, getContent, setContent, productFromRow };
