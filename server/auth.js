const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { db } = require('./db');

const COOKIE = 'niten_session';

function login(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase().trim());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) return null;
  const token = jwt.sign({ id: user.id, role: user.role, seller_id: user.seller_id }, config.jwtSecret, { expiresIn: '7d' });
  return { token, user: publicUser(user) };
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, seller_id: u.seller_id });

function readUser(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    return user ? publicUser(user) : null;
  } catch { return null; }
}

// requireRole('admin') o requireRole('admin', 'seller')
const requireRole = (...roles) => (req, res, next) => {
  const user = readUser(req);
  if (!user) return res.status(401).json({ error: 'No autenticado' });
  if (!roles.includes(user.role)) return res.status(403).json({ error: 'Sin permisos' });
  req.user = user;
  next();
};

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.publicUrl.startsWith('https://'),
  maxAge: 7 * 24 * 3600 * 1000,
});

module.exports = { COOKIE, login, readUser, requireRole, cookieOptions };
