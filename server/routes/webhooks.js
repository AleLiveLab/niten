const crypto = require('crypto');
const express = require('express');
const { creds } = require('../settings');
const wa = require('../services/whatsapp');
const mp = require('../services/mercadopago');
const ml = require('../services/mercadolibre');

const router = express.Router();

// WhatsApp Cloud API: verificación del webhook
router.get('/webhooks/whatsapp', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === creds('whatsapp').verifyToken) return res.send(req.query['hub.challenge']);
  res.sendStatus(403);
});

router.post('/webhooks/whatsapp', (req, res) => {
  // Si hay App Secret configurado, validamos la firma de Meta
  const secret = process.env.META_APP_SECRET;
  if (secret) {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
    const got = req.get('x-hub-signature-256') || '';
    if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return res.sendStatus(401);
  }
  res.sendStatus(200); // Meta exige responder rápido
  wa.handleWebhook(req.body).catch((e) => console.error('[WA] webhook:', e.message));
});

router.post('/webhooks/mercadopago', (req, res) => {
  res.sendStatus(200);
  const type = req.body?.type || req.query.type || req.query.topic;
  const id = req.body?.data?.id || req.query['data.id'] || req.query.id;
  // Siempre consultamos el pago a la API de MP: no confiamos en el contenido de la notificación
  if (type === 'payment' && id) mp.handleNotification(id).catch((e) => console.error('[MP] webhook:', e.message));
});

router.post('/webhooks/mercadolibre', (req, res) => {
  res.sendStatus(200);
  ml.handleNotification(req.body).catch((e) => console.error('[ML] webhook:', e.message));
});

module.exports = router;
