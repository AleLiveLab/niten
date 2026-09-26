// Identidad de la marca (nombre, logo, color) y variantes para probar alternativas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const config = require('../config');
const { getContent, setContent } = require('../db');

const FIELDS = ['name', 'tagline', 'logo', 'logoMode', 'accent'];
const MODES = ['logo+name', 'logo', 'name'];

function clean(b = {}) {
  const out = {
    name: String(b.name ?? '').trim().slice(0, 60),
    tagline: String(b.tagline ?? '').trim().slice(0, 160),
    logo: /^\/uploads\/brand\/[\w.-]+$/.test(b.logo || '') ? b.logo : '',
    logoMode: MODES.includes(b.logoMode) ? b.logoMode : 'logo+name',
    accent: /^#[0-9a-f]{6}$/i.test(b.accent || '') ? b.accent : '#ff5a1f',
  };
  if (!out.name) { const e = new Error('La marca necesita un nombre'); e.status = 400; throw e; }
  return out;
}

const pick = (o) => Object.fromEntries(FIELDS.map((k) => [k, o[k] ?? '']));
const current = () => ({ logoMode: 'logo+name', ...pick(getContent('site', {})) });
const variants = () => getContent('brands', []);

function apply(fields) {
  setContent('site', { ...getContent('site', {}), ...clean(fields) });
  return current();
}

function addVariant(fields) {
  const v = { id: crypto.randomBytes(4).toString('hex'), ...clean(fields), created_at: new Date().toISOString() };
  setContent('brands', [...variants(), v]);
  return v;
}

function updateVariant(id, fields) {
  const list = variants();
  const i = list.findIndex((v) => v.id === id);
  if (i < 0) { const e = new Error('Variante inexistente'); e.status = 404; throw e; }
  list[i] = { ...list[i], ...clean(fields) };
  setContent('brands', list);
  return list[i];
}

const removeVariant = (id) => setContent('brands', variants().filter((v) => v.id !== id));
const findVariant = (id) => variants().find((v) => v.id === id) || null;

// Guarda el logo como PNG (también convierte SVG, así no se sirve SVG subido por usuarios)
async function saveLogo(buffer) {
  const dir = path.join(config.uploadsDir, 'brand');
  fs.mkdirSync(dir, { recursive: true });
  const name = `logo-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.png`;
  await sharp(buffer, { density: 300 }).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).png().toFile(path.join(dir, name));
  return `/uploads/brand/${name}`;
}

module.exports = { FIELDS, MODES, current, variants, apply, addVariant, updateVariant, removeVariant, findVariant, saveLogo };
