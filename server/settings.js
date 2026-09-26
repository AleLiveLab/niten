// Credenciales de integraciones: se toman del .env y pueden sobreescribirse desde el panel
// (Integraciones), que las guarda en la base de datos.
const config = require('./config');
const { getContent, setContent } = require('./db');

// Campos editables desde el panel. `secret` = se muestra enmascarado.
const FIELDS = {
  mercadopago: { accessToken: { label: 'Access token', secret: true } },
  mercadolibre: { clientId: { label: 'App ID' }, clientSecret: { label: 'Client secret', secret: true }, siteId: { label: 'Sitio (MLA, MLM, MLC, MLU...)' }, authHost: { label: 'Host de autorización' } },
  whatsapp: { token: { label: 'Token permanente', secret: true }, phoneNumberId: { label: 'Phone number ID' }, verifyToken: { label: 'Verify token del webhook' } },
  facebook: { pageId: { label: 'Page ID' }, token: { label: 'Page access token', secret: true } },
  instagram: { userId: { label: 'Instagram business account ID' }, token: { label: 'Access token (vacío = usa el de Facebook)', secret: true } },
  telegram: { botToken: { label: 'Bot token', secret: true }, chatId: { label: 'Chat/canal (@micanal o ID)' } },
  pinterest: { token: { label: 'Access token', secret: true }, boardId: { label: 'Board ID' } },
  x: { apiKey: { label: 'API key' }, apiSecret: { label: 'API secret', secret: true }, accessToken: { label: 'Access token' }, accessSecret: { label: 'Access token secret', secret: true } },
};

function envDefaults() {
  const s = config.social;
  return {
    mercadopago: { ...config.mercadopago },
    mercadolibre: { ...config.mercadolibre },
    whatsapp: { ...config.whatsapp },
    facebook: { ...s.facebook }, instagram: { ...s.instagram }, telegram: { ...s.telegram }, pinterest: { ...s.pinterest }, x: { ...s.x },
  };
}

function creds(name) {
  const base = envDefaults()[name] || {};
  const saved = getContent('integrations', {})[name] || {};
  const out = { ...base };
  for (const [k, v] of Object.entries(saved)) if (v !== '' && v != null) out[k] = v;
  if (name === 'instagram' && !out.token) out.token = creds('facebook').token;
  return out;
}

const mask = (v) => (v ? `••••${String(v).slice(-4)}` : '');

function describe() {
  const out = {};
  for (const [name, fields] of Object.entries(FIELDS)) {
    const c = creds(name);
    out[name] = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, { ...f, value: f.secret ? mask(c[k]) : (c[k] || ''), set: !!c[k] }]));
  }
  return out;
}

function update(name, values) {
  if (!FIELDS[name]) throw new Error('Integración desconocida');
  const all = getContent('integrations', {});
  const cur = all[name] || {};
  for (const [k, f] of Object.entries(FIELDS[name])) {
    if (!(k in values)) continue;
    const v = String(values[k] ?? '').trim();
    if (f.secret && v.startsWith('••••')) continue; // sin cambios
    cur[k] = v;
  }
  all[name] = cur;
  setContent('integrations', all);
}

module.exports = { creds, describe, update, FIELDS };
