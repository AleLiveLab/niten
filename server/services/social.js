// Publicación en redes sociales con un clic.
const crypto = require('crypto');
const config = require('../config');
const { creds } = require('../settings');
const { request } = require('./http');

const G = () => `https://graph.facebook.com/${config.social.graphVersion}`;
const isPublic = () => config.publicUrl.startsWith('https://');

const NETWORKS = {
  facebook: {
    label: 'Facebook', ready: (c) => !!(c.pageId && c.token),
    async publish({ image, caption }, c) {
      const form = new FormData();
      form.append('source', new Blob([image], { type: 'image/png' }), 'promo.png');
      form.append('caption', caption);
      form.append('access_token', c.token);
      const r = await request(`${G()}/${c.pageId}/photos`, { method: 'POST', body: form, timeout: 60000 });
      return { id: r.post_id || r.id, url: `https://facebook.com/${r.post_id || r.id}` };
    },
  },
  instagram: {
    label: 'Instagram', ready: (c) => !!(c.userId && c.token),
    note: 'Instagram descarga la imagen desde tu sitio: requiere que esté online con HTTPS.',
    async publish({ imageUrl, caption }, c) {
      if (!isPublic()) throw new Error('Instagram necesita que el sitio esté online con HTTPS (PUBLIC_URL).');
      const media = await request(`${G()}/${c.userId}/media`, { method: 'POST', json: { image_url: imageUrl, caption, access_token: c.token }, timeout: 60000 });
      // Instagram procesa la imagen de forma asíncrona
      for (let i = 0; i < 10; i++) {
        const st = await request(`${G()}/${media.id}?fields=status_code&access_token=${encodeURIComponent(c.token)}`);
        if (st.status_code === 'FINISHED') break;
        if (st.status_code === 'ERROR') throw new Error('Instagram no pudo procesar la imagen');
        await new Promise((r) => setTimeout(r, 2000));
      }
      const r = await request(`${G()}/${c.userId}/media_publish`, { method: 'POST', json: { creation_id: media.id, access_token: c.token } });
      const info = await request(`${G()}/${r.id}?fields=permalink&access_token=${encodeURIComponent(c.token)}`).catch(() => ({}));
      return { id: r.id, url: info.permalink };
    },
  },
  telegram: {
    label: 'Telegram', ready: (c) => !!(c.botToken && c.chatId),
    async publish({ image, caption }, c) {
      const form = new FormData();
      form.append('chat_id', c.chatId);
      form.append('caption', caption.slice(0, 1024));
      form.append('photo', new Blob([image], { type: 'image/png' }), 'promo.png');
      const r = await request(`https://api.telegram.org/bot${c.botToken}/sendPhoto`, { method: 'POST', body: form, timeout: 60000 });
      const chat = r.result?.chat;
      return { id: r.result?.message_id, url: chat?.username ? `https://t.me/${chat.username}/${r.result.message_id}` : null };
    },
  },
  pinterest: {
    label: 'Pinterest', ready: (c) => !!(c.token && c.boardId),
    async publish({ image, caption, title, link }, c) {
      const r = await request('https://api.pinterest.com/v5/pins', {
        method: 'POST', headers: { Authorization: `Bearer ${c.token}` }, timeout: 60000,
        json: { board_id: c.boardId, title: title.slice(0, 100), description: caption.slice(0, 500), link, media_source: { source_type: 'image_base64', content_type: 'image/png', data: image.toString('base64') } },
      });
      return { id: r.id, url: `https://pinterest.com/pin/${r.id}` };
    },
  },
  x: {
    label: 'X (Twitter)', ready: (c) => !!(c.apiKey && c.apiSecret && c.accessToken && c.accessSecret),
    async publish({ image, caption }, c) {
      const uploadUrl = 'https://api.x.com/2/media/upload';
      const form = new FormData();
      form.append('media', new Blob([image], { type: 'image/png' }), 'promo.png');
      form.append('media_category', 'tweet_image');
      const up = await request(uploadUrl, { method: 'POST', headers: { Authorization: oauth1('POST', uploadUrl, c) }, body: form, timeout: 60000 });
      const mediaId = up.data?.id || up.media_id_string;
      const tweetUrl = 'https://api.x.com/2/tweets';
      const r = await request(tweetUrl, { method: 'POST', headers: { Authorization: oauth1('POST', tweetUrl, c) }, json: { text: shorten(caption, 270), media: { media_ids: [mediaId] } } });
      return { id: r.data?.id, url: `https://x.com/i/web/status/${r.data?.id}` };
    },
  },
};

function shorten(text, max) {
  if (text.length <= max) return text;
  // conserva el link y recorta el resto
  const link = text.match(/https?:\/\/\S+/)?.[0] || '';
  return text.replace(link, '').slice(0, max - link.length - 3).trim() + '… ' + link;
}

// Firma OAuth 1.0a (usuario) para la API de X
function oauth1(method, url, c) {
  const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
  const params = {
    oauth_consumer_key: c.apiKey, oauth_nonce: crypto.randomBytes(16).toString('hex'), oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(), oauth_token: c.accessToken, oauth_version: '1.0',
  };
  const base = [method, enc(url), enc(Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join('&'))].join('&');
  params.oauth_signature = crypto.createHmac('sha1', `${enc(c.apiSecret)}&${enc(c.accessSecret)}`).update(base).digest('base64');
  return 'OAuth ' + Object.keys(params).sort().map((k) => `${enc(k)}="${enc(params[k])}"`).join(', ');
}

function status() {
  return Object.fromEntries(Object.entries(NETWORKS).map(([k, n]) => [k, { label: n.label, ready: n.ready(creds(k)), note: n.note || null }]));
}

// post: { image (Buffer), imageUrl, caption, title, link }
async function publishAll(post, networks) {
  const results = {};
  await Promise.all(networks.map(async (name) => {
    const n = NETWORKS[name];
    if (!n) return;
    const c = creds(name);
    if (!n.ready(c)) { results[name] = { ok: false, error: 'No configurado' }; return; }
    try { results[name] = { ok: true, ...(await n.publish(post, c)) }; } catch (e) { results[name] = { ok: false, error: e.message }; }
  }));
  return results;
}

module.exports = { NETWORKS, status, publishAll, oauth1 };
