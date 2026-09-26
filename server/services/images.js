// Utilidades de imágenes: rasterizar (SVG -> JPG/PNG) y generar piezas para redes sociales.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const { getContent } = require('../db');

// Resuelve rutas públicas (/img/..., /uploads/...) a archivos locales, sin permitir salir de esas carpetas
function localPath(src) {
  const clean = decodeURIComponent(String(src || '').split('?')[0]);
  const roots = [['/uploads/', config.uploadsDir], ['/', config.publicDir]];
  for (const [prefix, root] of roots) {
    if (!clean.startsWith(prefix)) continue;
    const file = path.resolve(root, '.' + clean.slice(prefix.length - 1));
    if (file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

async function raster(src, { size = 1200, format = 'jpeg' } = {}) {
  const file = localPath(src);
  if (!file) return null;
  const img = sharp(file, { density: 300 }).resize(size, size, { fit: 'contain', background: '#ffffff' });
  return format === 'png' ? img.png().toBuffer() : img.flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer();
}

const esc = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const money = (n) => '$' + Math.round(n).toLocaleString('es-AR');
const FONT = "font-family=\"Montserrat, 'Arial Black', Arial, 'DejaVu Sans', sans-serif\"";

// Divide un texto en líneas de hasta `max` caracteres
function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

async function productImageData(product, size) {
  const file = localPath(product.images?.[0]);
  if (!file) return null;
  const buf = await sharp(file, { density: 300 }).resize(size, size, { fit: 'cover' }).png().toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

const TEMPLATES = {
  impacto: { w: 1080, h: 1080, label: 'Impacto (cuadrado, fondo oscuro)' },
  story: { w: 1080, h: 1920, label: 'Historia / Reel (vertical)' },
  minimal: { w: 1080, h: 1080, label: 'Minimal (cuadrado, claro)' },
};

// opts: { template, headline, discountText, couponCode, price, comparePrice, footer }
async function promoImage(product, opts = {}) {
  const site = getContent('site', {});
  const accent = site.accent || '#ff5a1f';
  const t = TEMPLATES[opts.template] ? opts.template : 'impacto';
  const { w, h } = TEMPLATES[t];
  const price = opts.price ?? product.price;
  const compare = opts.comparePrice ?? product.compare_price;
  const headline = (opts.headline || product.name).toUpperCase();
  const discount = opts.discountText || (compare && compare > price ? `-${Math.round((1 - price / compare) * 100)}%` : '');
  const footer = opts.footer || new URL(require('../config').publicUrl).host;
  const brand = esc(site.name || 'NITEN 3D');

  let svg;
  if (t === 'minimal') {
    const img = await productImageData(product, 560);
    const lines = wrap(headline, 11).slice(0, 3);
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="100%" height="100%" fill="#f6f1ea"/>
      <circle cx="330" cy="560" r="330" fill="${accent}" opacity=".12"/>
      ${img ? `<clipPath id="c"><rect x="60" y="260" width="560" height="560" rx="48"/></clipPath><image href="${img}" x="60" y="260" width="560" height="560" clip-path="url(#c)"/>` : ''}
      <text x="60" y="130" ${FONT} font-size="44" font-weight="800" fill="#1b1b1b" letter-spacing="6">${brand}</text>
      <rect x="60" y="160" width="120" height="8" fill="${accent}"/>
      ${lines.map((l, i) => `<text x="660" y="${340 + i * 64}" ${FONT} font-size="54" font-weight="900" fill="#1b1b1b">${esc(l)}</text>`).join('')}
      ${compare && compare > price ? `<text x="660" y="${340 + lines.length * 64 + 40}" ${FONT} font-size="44" fill="#8a8a8a" text-decoration="line-through">${money(compare)}</text>` : ''}
      <text x="660" y="${340 + lines.length * 64 + 120}" ${FONT} font-size="76" font-weight="900" fill="${accent}">${money(price)}</text>
      ${opts.couponCode ? `<rect x="660" y="${340 + lines.length * 64 + 170}" width="360" height="90" rx="18" fill="#1b1b1b"/><text x="840" y="${340 + lines.length * 64 + 228}" text-anchor="middle" ${FONT} font-size="32" font-weight="800" fill="#fff">CÓDIGO ${esc(opts.couponCode)}</text>` : ''}
      <text x="${w - 60}" y="${h - 60}" text-anchor="end" ${FONT} font-size="32" fill="#1b1b1b" opacity=".6">${esc(footer)}</text>
    </svg>`;
  } else {
    const vertical = t === 'story';
    const imgSize = vertical ? 900 : 600;
    const img = await productImageData(product, imgSize);
    const imgY = vertical ? 330 : 150;
    const cx = w / 2;
    const cy = imgY + imgSize / 2;
    const nameY = vertical ? 1380 : 840;
    const lines = wrap(headline, vertical ? 16 : 22).slice(0, vertical ? 2 : 1);
    const fs1 = vertical ? 92 : 64;
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <defs>
        <radialGradient id="g" cx="50%" cy="${(cy / h * 100).toFixed(0)}%" r="70%"><stop offset="0" stop-color="${accent}" stop-opacity=".55"/><stop offset=".55" stop-color="#140b24" stop-opacity="1"/><stop offset="1" stop-color="#05030a"/></radialGradient>
        <linearGradient id="bar" x1="0" x2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="#ffcc33"/></linearGradient>
        <clipPath id="c"><circle cx="${cx}" cy="${cy}" r="${imgSize / 2 - 10}"/></clipPath>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="30" stdDeviation="30" flood-color="#000" flood-opacity=".6"/></filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      ${[1.18, 1.36, 1.56].map((k, i) => `<circle cx="${cx}" cy="${cy}" r="${imgSize / 2 * k}" fill="none" stroke="#fff" stroke-opacity="${0.18 - i * 0.05}" stroke-width="3" stroke-dasharray="${i === 1 ? '14 18' : 'none'}"/>`).join('')}
      ${Array.from({ length: 26 }, (_, i) => `<circle cx="${(i * 389) % w}" cy="${(i * 211) % h}" r="${2 + (i % 4)}" fill="#fff" opacity="${0.15 + (i % 5) / 12}"/>`).join('')}
      ${img ? `<g filter="url(#sh)"><circle cx="${cx}" cy="${cy}" r="${imgSize / 2 - 4}" fill="#fff"/><image href="${img}" x="${cx - imgSize / 2}" y="${imgY}" width="${imgSize}" height="${imgSize}" clip-path="url(#c)"/></g>` : ''}
      <text x="60" y="${vertical ? 140 : 90}" ${FONT} font-size="${vertical ? 52 : 40}" font-weight="900" fill="#fff" letter-spacing="8">${brand}</text>
      <rect x="60" y="${vertical ? 165 : 108}" width="${vertical ? 160 : 110}" height="8" rx="4" fill="url(#bar)"/>
      ${discount ? `<g transform="translate(${w - (vertical ? 200 : 170)} ${vertical ? 200 : 150}) rotate(-12)">
        <polygon points="${Array.from({ length: 24 }, (_, i) => { const r = i % 2 ? (vertical ? 120 : 100) : (vertical ? 150 : 128); const a = Math.PI / 12 * i; return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`; }).join(' ')}" fill="url(#bar)"/>
        <text y="${vertical ? 22 : 18}" text-anchor="middle" ${FONT} font-size="${vertical ? 64 : 54}" font-weight="900" fill="#140b24">${esc(discount)}</text></g>` : ''}
      ${lines.map((l, i) => `<text x="${cx}" y="${nameY + i * (fs1 + 6)}" text-anchor="middle" ${FONT} font-size="${fs1}" font-weight="900" fill="#fff">${esc(l)}</text>`).join('')}
      <g transform="translate(${cx} ${nameY + lines.length * (fs1 + 6) + (vertical ? 70 : 40)})">
        ${compare && compare > price ? `<text x="-30" y="0" text-anchor="end" ${FONT} font-size="${vertical ? 56 : 44}" fill="#fff" opacity=".6" text-decoration="line-through">${money(compare)}</text>` : ''}
        <rect x="${compare && compare > price ? -10 : -190}" y="${vertical ? -76 : -62}" width="380" height="${vertical ? 104 : 86}" rx="${vertical ? 52 : 43}" fill="url(#bar)"/>
        <text x="${compare && compare > price ? 180 : 0}" y="${vertical ? 0 : 0}" text-anchor="middle" ${FONT} font-size="${vertical ? 70 : 58}" font-weight="900" fill="#140b24">${money(price)}</text>
      </g>
      ${opts.couponCode ? `<g transform="translate(${cx} ${vertical ? 1775 : 1035})"><rect x="-260" y="-48" width="520" height="70" rx="12" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="10 8"/><text y="0" text-anchor="middle" ${FONT} font-size="34" font-weight="800" fill="#fff">USÁ EL CÓDIGO ${esc(opts.couponCode)}</text></g>` : ''}
      <text x="${cx}" y="${h - (vertical ? 70 : 12)}" text-anchor="middle" ${FONT} font-size="${vertical ? 34 : 0}" fill="#fff" opacity=".75">${vertical ? esc(footer) + ' · link en la bio' : ''}</text>
    </svg>`;
  }
  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = { localPath, raster, promoImage, TEMPLATES };
