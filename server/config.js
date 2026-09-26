require('dotenv').config({ quiet: true });
const path = require('path');

const env = (k, d = '') => (process.env[k] ?? d).trim();

module.exports = {
  port: Number(env('PORT', '3000')),
  publicUrl: env('PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, ''),
  jwtSecret: env('JWT_SECRET', 'cambia-este-secreto'),
  dataDir: path.resolve(env('DATA_DIR', path.join(__dirname, '..', 'data'))),
  uploadsDir: path.resolve(env('UPLOADS_DIR', path.join(__dirname, '..', 'uploads'))),
  publicDir: path.join(__dirname, '..', 'public'),
  admin: { email: env('ADMIN_EMAIL', 'admin@niten.local'), password: env('ADMIN_PASSWORD', 'admin123') },
  currency: env('CURRENCY', 'ARS'),
  mercadopago: { accessToken: env('MP_ACCESS_TOKEN') },
  mercadolibre: {
    clientId: env('ML_CLIENT_ID'),
    clientSecret: env('ML_CLIENT_SECRET'),
    siteId: env('ML_SITE_ID', 'MLA'),
    authHost: env('ML_AUTH_HOST', 'https://auth.mercadolibre.com.ar'),
  },
  whatsapp: {
    token: env('WA_TOKEN'),
    phoneNumberId: env('WA_PHONE_NUMBER_ID'),
    verifyToken: env('WA_VERIFY_TOKEN', 'niten-verify'),
    graphVersion: env('META_GRAPH_VERSION', 'v21.0'),
  },
  social: {
    graphVersion: env('META_GRAPH_VERSION', 'v21.0'),
    facebook: { pageId: env('FB_PAGE_ID'), token: env('FB_PAGE_TOKEN') },
    instagram: { userId: env('IG_USER_ID'), token: env('IG_TOKEN') || env('FB_PAGE_TOKEN') },
    telegram: { botToken: env('TELEGRAM_BOT_TOKEN'), chatId: env('TELEGRAM_CHAT_ID') },
    pinterest: { token: env('PINTEREST_TOKEN'), boardId: env('PINTEREST_BOARD_ID') },
    x: {
      apiKey: env('X_API_KEY'), apiSecret: env('X_API_SECRET'),
      accessToken: env('X_ACCESS_TOKEN'), accessSecret: env('X_ACCESS_SECRET'),
    },
  },
};
