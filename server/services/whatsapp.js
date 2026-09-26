// Bot de WhatsApp sobre la API oficial de WhatsApp Cloud (Meta).
const config = require('../config');
const { creds } = require('../settings');
const { request } = require('./http');
const { db, getContent, productFromRow, json } = require('../db');

const enabled = () => { const c = creds('whatsapp'); return !!(c.token && c.phoneNumberId); };
const money = (n) => '$' + Math.round(n).toLocaleString('es-AR');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const canSendImages = () => config.publicUrl.startsWith('https://');
const productLink = (p) => `${config.publicUrl}/#p/${p.slug}`;
const imageLink = (p) => `${config.publicUrl}/media/raster?src=${encodeURIComponent(p.images[0])}`;

const STATUS_TEXT = { nuevo: '🕐 Recibido', pagado: '💳 Pago confirmado', en_produccion: '🖨️ En producción', enviado: '🚚 Enviado', entregado: '✅ Entregado', cancelado: '❌ Cancelado' };

function session(phone, name) {
  let s = db.prepare('SELECT * FROM wa_sessions WHERE phone = ?').get(phone);
  if (!s) {
    db.prepare('INSERT INTO wa_sessions (phone, name) VALUES (?, ?)').run(phone, name || null);
    s = { phone, name, state: 'new', human: 0 };
  }
  return s;
}
const setSession = (phone, fields) => {
  const sets = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE wa_sessions SET ${sets}, updated_at = datetime('now') WHERE phone = @phone`).run({ ...fields, phone });
};

function productCard(p) {
  const text = `*${p.name}*\n${p.short}\n💰 ${money(p.price)}${p.compare_price > p.price ? ` ~${money(p.compare_price)}~` : ''}\n${p.stock > 0 ? '✅ En stock' : '⏳ A pedido'}\n🛒 ${productLink(p)}`;
  return p.images[0] && canSendImages() ? { type: 'image', link: imageLink(p), caption: text } : { type: 'text', body: text };
}

function searchProducts(q) {
  const words = norm(q).split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  const all = db.prepare('SELECT * FROM products WHERE active = 1').all().map(productFromRow);
  return all.map((p) => ({ p, score: words.filter((w) => norm(`${p.name} ${p.short}`).includes(w)).length }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.p);
}

function orderStatus(code) {
  const o = db.prepare('SELECT * FROM orders WHERE code = ? COLLATE NOCASE').get(code);
  if (!o) return `No encontré el pedido *${code}*. Revisá el código (tiene el formato NT-XXXXXX).`;
  const items = json(o.items, []).map((l) => `• ${l.qty}× ${l.name}`).join('\n');
  return `Pedido *${o.code}*\nEstado: ${STATUS_TEXT[o.status] || o.status}\nPago: ${o.payment_status}\n${items}\nTotal: ${money(o.total)}`;
}

// Devuelve la lista de respuestas para un mensaje entrante (sin enviarlas)
function reply(phone, name, rawText) {
  const bot = getContent('bot', {});
  const site = getContent('site', {});
  const vars = { nombre: name || '', horario: bot.hours, tienda: site.name };
  const s = session(phone, name);
  const t = norm(rawText);
  const T = (body) => ({ type: 'text', body });
  const menu = () => [T(`${fill(bot.greeting, vars)}\n\n${fill(bot.menu, vars)}`)];

  if (!bot.enabled) return [];
  if (['menu', 'inicio', 'volver', '0'].includes(t)) { setSession(phone, { state: 'menu', human: 0 }); return menu(); }
  if (s.human) return []; // lo está atendiendo una persona
  if (s.state === 'new' || /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hi|hello)\b/.test(t)) { setSession(phone, { state: 'menu' }); return menu(); }

  const code = rawText.match(/NT-[A-Z0-9]{6}/i);
  if (code) { setSession(phone, { state: 'menu' }); return [T(orderStatus(code[0].toUpperCase()))]; }

  if (s.state === 'order') { setSession(phone, { state: 'menu' }); return [T('Pasame el código de tu pedido (formato NT-XXXXXX) y te digo en qué estado está.')]; }
  if (s.state === 'custom') {
    setSession(phone, { state: 'menu', human: 1 });
    return [T('¡Genial! Ya le pasé tu consulta al equipo, te respondemos con el presupuesto a la brevedad 🙌')];
  }

  if (t === '1' || /catalogo|productos|que venden|lista/.test(t)) {
    const cats = db.prepare('SELECT name FROM categories ORDER BY sort').all().map((c) => c.name).join(' · ');
    const top = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY featured DESC, sort LIMIT 6').all().map(productFromRow);
    return [T(`🛍️ *Catálogo ${site.name}*\n${cats}\n\n${top.map((p) => `• ${p.name} — ${money(p.price)}`).join('\n')}\n\nVer todo: ${config.publicUrl}/#catalogo\n\nEscribí el nombre de un producto y te mando foto y detalles 📸`)];
  }
  if (t === '2' || /promo|descuento|oferta|codigo|cupon/.test(t)) {
    const coupons = db.prepare("SELECT * FROM coupons WHERE active = 1 AND seller_id IS NULL AND (ends_at IS NULL OR ends_at >= date('now')) AND (max_uses IS NULL OR uses < max_uses)").all();
    const sale = db.prepare('SELECT * FROM products WHERE active = 1 AND compare_price > price ORDER BY sort LIMIT 5').all().map(productFromRow);
    let body = '🔥 *Promociones vigentes*\n';
    if (coupons.length) body += '\n' + coupons.map((c) => `🎟️ *${c.code}*: ${c.type === 'percent' ? `${c.value}% off` : `${money(c.value)} off`}${c.min_total ? ` (desde ${money(c.min_total)})` : ''}`).join('\n');
    if (sale.length) body += '\n\n' + sale.map((p) => `• ${p.name}: ~${money(p.compare_price)}~ *${money(p.price)}*`).join('\n');
    if (!coupons.length && !sale.length) body += '\nEn este momento no hay promociones activas, ¡pero seguinos en redes que salen seguido!';
    return [T(body + `\n\nComprá en ${config.publicUrl}`)];
  }
  if (t === '3' || (/pedido|seguimiento|estado/.test(t) && !/personaliz/.test(t))) { setSession(phone, { state: 'order' }); return [T('Pasame el código de tu pedido (formato NT-XXXXXX) 📦')]; }
  if (t === '4' || /personaliz|presupuesto|a medida|encargo/.test(t)) { setSession(phone, { state: 'custom' }); return [T(fill(bot.custom, vars))]; }
  if (t === '5' || /humano|persona|asesor|vendedor|hablar con/.test(t)) { setSession(phone, { human: 1 }); return [T(fill(bot.human, vars))]; }

  for (const f of bot.faq || []) {
    const keys = String(f.keywords || '').split(',').map(norm).filter(Boolean);
    if (keys.some((k) => t.includes(k))) return [T(fill(f.answer, vars))];
  }

  const found = searchProducts(rawText);
  if (found.length) return found.map(productCard);

  return [T(fill(bot.fallback, vars))];
}

function log(phone, direction, body) {
  db.prepare('INSERT INTO wa_messages (phone, direction, body) VALUES (?, ?, ?)').run(phone, direction, body);
}

async function send(to, msg) {
  const c = creds('whatsapp');
  const payload = msg.type === 'image'
    ? { messaging_product: 'whatsapp', to, type: 'image', image: { link: msg.link, caption: msg.caption } }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: msg.body, preview_url: true } };
  await request(`https://graph.facebook.com/${config.whatsapp.graphVersion}/${c.phoneNumberId}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${c.token}` }, json: payload,
  });
  log(to, 'out', msg.type === 'image' ? `[imagen] ${msg.caption}` : msg.body);
}

// Procesa el payload del webhook de Meta
async function handleWebhook(body) {
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of v.messages || []) {
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? m.image?.caption ?? `[${m.type}]`;
        log(m.from, 'in', text);
        const replies = reply(m.from, names[m.from]?.split(' ')[0], text);
        if (!enabled()) continue;
        for (const r of replies) await send(m.from, r).catch((e) => console.warn('[WA] error enviando:', e.message));
      }
    }
  }
}

module.exports = { enabled, reply, send, handleWebhook, log };
