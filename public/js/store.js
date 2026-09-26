import { money, esc, api, toast, applyBrand } from './common.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } },
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  data: null,
  cat: '',
  q: '',
  sort: '',
  cart: store.get('niten_cart', []),        // [{ id, qty, color }]
  coupon: store.get('niten_coupon', null),  // código
  quote: null,
};

/* ---------- Tracking de vendedores: ?ref=CODIGO ---------- */
async function trackRef() {
  const ref = new URLSearchParams(location.search).get('ref');
  if (!ref) return;
  const r = await api('/api/track', { ref, path: location.pathname + location.hash }).catch(() => null);
  if (r?.ok) {
    state.coupon = r.code;
    store.set('niten_coupon', r.code);
    store.set('niten_ref', r.code);
    toast(`🎟️ Código ${r.code} aplicado a tu carrito`);
  }
  history.replaceState(null, '', location.pathname + location.hash);
}

/* ---------- Render ---------- */
const productById = (id) => state.data.products.find((p) => p.id === id);
const catName = (id) => state.data.categories.find((c) => c.id === id)?.name || '';
const offPct = (p) => (p.compare_price > p.price ? Math.round((1 - p.price / p.compare_price) * 100) : 0);

function card(p, i = 0) {
  const off = offPct(p);
  return `<article class="card" style="--i:${i}" data-id="${p.id}">
    <div class="card-media" data-open="${esc(p.slug)}">
      ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}${off ? `<span class="badge off">-${off}%</span>` : ''}
      <img src="${esc(p.images[0] || '/img/favicon.svg')}" alt="${esc(p.name)}" loading="lazy">
    </div>
    <div class="card-body">
      <span class="card-cat">${esc(catName(p.category_id))}</span>
      <h3 data-open="${esc(p.slug)}">${esc(p.name)}</h3>
      <p>${esc(p.short)}</p>
      <div class="swatches">${p.colors.slice(0, 5).map((c) => `<i style="background:${esc(c)}"></i>`).join('')}</div>
      <div class="card-foot">
        <span class="price">${money(p.price)}${p.compare_price > p.price ? `<s>${money(p.compare_price)}</s>` : ''}</span>
        <button class="add-btn" data-add="${p.id}" aria-label="Agregar ${esc(p.name)} al carrito" ${p.stock > 0 ? '' : 'disabled title="Sin stock"'}>+</button>
      </div>
    </div>
  </article>`;
}

function renderContent() {
  const d = state.data;
  const site = d.site;
  applyBrand(site);
  document.title = `${site.name} · ${site.tagline}`;
  $('#brandPreview').hidden = !site.preview;
  $('#copyName').textContent = site.name;
  $('#year').textContent = new Date().getFullYear();
  $('#footerTagline').textContent = site.tagline;

  const ann = $('#announce');
  if (site.announcement) { $('.announce-track', ann).innerHTML = Array(3).fill(`<span>${esc(site.announcement)}</span>`).join(''); } else ann.hidden = true;

  // Hero
  const h = d.hero;
  $('#hero').hidden = h.visible === false;
  $('#heroEyebrow').textContent = h.eyebrow;
  $('#heroTitle').innerHTML = String(h.title).split('\n').map((l) => `<span class="line"><span>${esc(l)}</span></span>`).join('');
  $('#heroSubtitle').textContent = h.subtitle;
  Object.assign($('#heroCta'), { textContent: h.ctaText, href: h.ctaLink || '#catalogo' });
  Object.assign($('#heroCta2'), { textContent: h.secondaryText, href: h.secondaryLink || '#personalizado' });
  $('#heroCta2').hidden = !h.secondaryText;

  // Stats
  $('#stats').hidden = d.stats.visible === false;
  $('#stats').innerHTML = (d.stats.items || []).map((s, i) => `<div class="stat reveal" style="--d:${i * 0.08}s"><strong data-count="${esc(s.value)}">${esc(s.value)}</strong><span>${esc(s.label)}</span></div>`).join('');

  // Marquee con categorías
  const words = [...d.categories.map((c) => c.name), 'Impresión 3D', 'Hecho a mano', 'Diseños únicos'];
  $('#marquee').innerHTML = Array(2).fill(words.map((w) => `<span>${esc(w)}</span>`).join('')).join('');

  // Destacados
  const featured = d.products.filter((p) => p.featured);
  $('#destacados').hidden = d.featured.visible === false || !featured.length;
  $('#featuredTitle').textContent = d.featured.title;
  $('#featuredSubtitle').textContent = d.featured.subtitle;
  $('#featured').innerHTML = featured.map((p, i) => card(p, i).replace('class="card"', `class="card reveal" style="--d:${i * 0.08}s"`)).join('');

  // Catálogo
  $('#catalogo').hidden = d.catalog.visible === false;
  $('#catalogTitle').textContent = d.catalog.title;
  $('#catalogSubtitle').textContent = d.catalog.subtitle;
  $('#chips').innerHTML = [{ slug: '', name: 'Todo' }, ...d.categories.filter((c) => d.products.some((p) => p.category_id === c.id))]
    .map((c) => `<button class="chip ${c.slug === state.cat ? 'active' : ''}" data-cat="${esc(c.slug)}">${esc(c.name)}</button>`).join('');

  // Proceso
  $('#proceso').hidden = d.process.visible === false;
  $('#processTitle').textContent = d.process.title;
  $('#steps').innerHTML = (d.process.steps || []).map((s, i) => `<li class="step reveal" style="--d:${i * 0.15}s"><div class="ic">${esc(s.icon)}</div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('');

  // Personalizados
  $('#personalizado').hidden = d.custom.visible === false;
  $('#customTitle').textContent = d.custom.title;
  $('#customText').textContent = d.custom.text;
  Object.assign($('#customCta'), { textContent: d.custom.ctaText, href: waLink('Hola! Quiero pedir un presupuesto para una impresión personalizada.') });

  // Testimonios
  $('#opiniones').hidden = d.testimonials.visible === false;
  $('#testimonialsTitle').textContent = d.testimonials.title;
  $('#testimonials').innerHTML = (d.testimonials.items || []).map((t, i) => `<blockquote class="testimonial reveal" style="--d:${i * 0.1}s"><div class="stars">${'★'.repeat(t.rating || 5)}</div><p>“${esc(t.text)}”</p><cite>${esc(t.name)}</cite></blockquote>`).join('');

  // FAQ
  $('#faq').hidden = d.faq.visible === false;
  $('#faqTitle').textContent = d.faq.title;
  $('#faqList').innerHTML = (d.faq.items || []).map((f) => `<details class="reveal"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');

  // Links
  const links = [['Instagram', site.instagram], ['Facebook', site.facebook], ['TikTok', site.tiktok], ['MercadoLibre', site.mercadolibre], ['WhatsApp', site.whatsapp && waLink('')], ['Email', site.email && `mailto:${site.email}`]].filter(([, u]) => u);
  $('#footerLinks').innerHTML = links.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join('');
  if (site.mercadolibre) Object.assign($('#mlLink'), { href: site.mercadolibre, hidden: false });
  if (site.whatsapp) Object.assign($('#waFloat'), { href: waLink('Hola! Vengo de la web 👋'), hidden: false });
  $('[data-mp]').hidden = !d.payments.mercadopago;
  if (!d.payments.mercadopago) $('input[value="transferencia"]').checked = true;
}

const waLink = (text) => `https://wa.me/${state.data.site.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

function renderGrid() {
  const q = state.q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cat = state.data.categories.find((c) => c.slug === state.cat);
  let list = state.data.products.filter((p) => (!cat || p.category_id === cat.id) && (!q || `${p.name} ${p.short}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)));
  if (state.sort === 'price-asc') list = list.slice().sort((a, b) => a.price - b.price);
  if (state.sort === 'price-desc') list = list.slice().sort((a, b) => b.price - a.price);
  if (state.sort === 'new') list = list.slice().sort((a, b) => b.id - a.id);
  $('#grid').innerHTML = list.map((p, i) => card(p, i)).join('');
  $('#empty').hidden = list.length > 0;
  $$('#chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === state.cat));
}

/* ---------- Animaciones ---------- */
function observeReveals() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      const n = e.target.querySelector('[data-count]');
      if (n) countUp(n);
      io.unobserve(e.target);
    }
  }, { threshold: 0.15 });
  $$('.reveal:not(.in), .steps').forEach((el) => io.observe(el));
}

function countUp(el) {
  const raw = el.dataset.count;
  const m = raw.match(/[\d.,]+/);
  if (!m || reduceMotion) return;
  const target = Number(m[0].replace(/\./g, '').replace(',', '.'));
  const decimals = (m[0].split(',')[1] || (m[0].includes('.') && !/\.\d{3}/.test(m[0]) ? m[0].split('.')[1] : '') || '').length;
  const t0 = performance.now();
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / 1400);
    const v = target * (1 - (1 - k) ** 3);
    el.textContent = raw.replace(m[0], v.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
    if (k < 1) requestAnimationFrame(tick); else el.textContent = raw;
  };
  requestAnimationFrame(tick);
}

// Inclinación 3D + brillo que sigue al mouse
function tilt() {
  if (reduceMotion || matchMedia('(hover: none)').matches) return;
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest?.('.card');
    $$('.card.tilting').forEach((x) => { if (x !== c) { x.classList.remove('tilting'); x.style.removeProperty('--rx'); x.style.removeProperty('--ry'); } });
    if (!c) return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    c.classList.add('tilting');
    c.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
    c.style.setProperty('--ry', `${(x - 0.5) * 12}deg`);
    c.style.setProperty('--mx', `${x * 100}%`);
    c.style.setProperty('--my', `${y * 100}%`);
  });
}

// Impresora del hero: "imprime" los productos capa por capa
function printer() {
  const el = $('#printer');
  const imgs = (state.data.hero.showcase || []).map((slug) => state.data.products.find((p) => p.slug === slug)).filter(Boolean);
  const list = imgs.length ? imgs : state.data.products.slice(0, 5);
  if (!list.length) { el.hidden = true; return; }
  const obj = $('.print-obj', el), ghost = $('.print-ghost', el), gantry = $('.gantry', el), stage = $('.print-stage', el);
  let idx = 0;
  const run = () => {
    const p = list[idx++ % list.length];
    obj.src = ghost.src = p.images[0];
    $('#printName').textContent = `Imprimiendo: ${p.name}`;
    el.classList.remove('done');
    const dur = reduceMotion ? 1 : 5200;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const layer = Math.floor(k * 90) / 90; // avanza de a capas
      const clip = (1 - layer) * 100;
      el.style.setProperty('--clip', `${clip}%`);
      const stageBox = stage.getBoundingClientRect(), frameBox = el.firstElementChild.getBoundingClientRect();
      const y = stageBox.top - frameBox.top + stageBox.height * (clip / 100) - 26;
      gantry.style.top = `${y}px`;
      el.style.setProperty('--nx', `${50 + Math.sin(t / 90) * 38}%`);
      $('#printPct').textContent = `${Math.round(layer * 100)}%`;
      if (k < 1) requestAnimationFrame(step);
      else { el.classList.add('done'); $('#printName').textContent = `¡Listo! ${p.name}`; setTimeout(run, 2200); }
    };
    requestAnimationFrame(step);
  };
  run();
}

// Partículas tipo "filamento" en el fondo del hero
function particles() {
  const c = $('#particles');
  if (reduceMotion) return;
  const ctx = c.getContext('2d');
  let w, h, pts;
  const resize = () => {
    w = c.width = c.offsetWidth * devicePixelRatio; h = c.height = c.offsetHeight * devicePixelRatio;
    pts = Array.from({ length: Math.min(70, Math.round(w / 25)) }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, r: Math.random() * 2 + 0.5 }));
  };
  resize();
  addEventListener('resize', resize);
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(c);
  const draw = () => {
    requestAnimationFrame(draw);
    if (!visible) return;
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h;
      ctx.fillStyle = 'rgba(255,195,77,.5)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * devicePixelRatio, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,120,60,.08)';
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 120 * devicePixelRatio) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
  };
  draw();
}

function flyToCart(fromImg) {
  if (!fromImg || reduceMotion) return;
  const r = fromImg.getBoundingClientRect(), t = $('#cartBtn').getBoundingClientRect();
  const f = fromImg.cloneNode();
  f.className = 'fly';
  Object.assign(f.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  document.body.appendChild(f);
  requestAnimationFrame(() => Object.assign(f.style, { left: `${t.left + 8}px`, top: `${t.top + 8}px`, width: '28px', height: '28px', opacity: '.3', borderRadius: '50%' }));
  setTimeout(() => f.remove(), 850);
}

/* ---------- Producto ---------- */
let pv = null;
function openProduct(slug, push = true) {
  const p = state.data.products.find((x) => x.slug === slug);
  if (!p) return;
  pv = { p, color: p.colors[0] || null, img: 0 };
  $('#pvCat').textContent = catName(p.category_id);
  $('#pvName').textContent = p.name;
  $('#pvPrice').textContent = money(p.price);
  $('#pvCompare').textContent = p.compare_price > p.price ? money(p.compare_price) : '';
  $('#pvDesc').textContent = p.description || p.short;
  $('#pvSpecs').innerHTML = `<dt>Material</dt><dd>${esc(p.material)}</dd>${p.badge ? `<dt>Destacado</dt><dd>${esc(p.badge)}</dd>` : ''}`;
  $('#pvColors').innerHTML = p.colors.map((c, i) => `<button style="background:${esc(c)}" data-color="${esc(c)}" class="${i ? '' : 'active'}" aria-label="Color ${esc(c)}"></button>`).join('');
  $('.pv-colors').hidden = !p.colors.length;
  $('#pvQty').value = 1;
  $('#pvQty').max = Math.max(1, p.stock);
  $('#pvStock').innerHTML = p.stock > 5 ? '<span style="color:var(--ok)">● En stock</span>' : p.stock > 0 ? `<span style="color:var(--accent-2)">● ¡Últimas ${p.stock} unidades!</span>` : '<span style="color:var(--muted)">● Sin stock — consultanos por WhatsApp</span>';
  $('#pvAdd').disabled = p.stock <= 0;
  const url = `${location.origin}/#p/${p.slug}`;
  $('#pvShareWa').href = `https://wa.me/?text=${encodeURIComponent(`Mirá esto: ${p.name} ${url}`)}`;
  $('#pvShareFb').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  Object.assign($('#pvMl'), { hidden: !p.ml_permalink, href: p.ml_permalink || '#' });
  showImg(0);
  $('#productModal').hidden = false;
  document.body.style.overflow = 'hidden';
  if (push && location.hash !== `#p/${p.slug}`) history.pushState(null, '', `#p/${p.slug}`);
}
function showImg(i) {
  pv.img = i;
  $('#pvImg').src = pv.p.images[i] || '/img/favicon.svg';
  $('#pvImg').alt = pv.p.name;
  $('#pvThumbs').innerHTML = pv.p.images.length > 1 ? pv.p.images.map((src, j) => `<button class="${j === i ? 'active' : ''}" data-img="${j}"><img src="${esc(src)}" alt=""></button>`).join('') : '';
}
function closeModals() {
  $$('.modal').forEach((m) => { m.hidden = true; });
  document.body.style.overflow = '';
  if (location.hash.startsWith('#p/')) history.pushState(null, '', location.pathname);
}

/* ---------- Carrito ---------- */
function saveCart() { store.set('niten_cart', state.cart); store.set('niten_coupon', state.coupon); }

function addToCart(id, qty = 1, color = null, imgEl = null) {
  const p = productById(id);
  if (!p) return;
  color = color || p.colors[0] || null;
  const line = state.cart.find((l) => l.id === id && l.color === color);
  const current = state.cart.filter((l) => l.id === id).reduce((s, l) => s + l.qty, 0);
  if (current + qty > p.stock) { toast(`Solo quedan ${p.stock} unidades`); return; }
  if (line) line.qty += qty; else state.cart.push({ id, qty, color });
  saveCart();
  flyToCart(imgEl);
  const cc = $('#cartCount');
  cc.classList.remove('bump'); void cc.offsetWidth; cc.classList.add('bump');
  toast(`✔ ${p.name} agregado`);
  refreshCart();
}

let quoteSeq = 0;
async function refreshCart() {
  state.cart = state.cart.filter((l) => productById(l.id));
  $('#cartCount').textContent = state.cart.reduce((s, l) => s + l.qty, 0);
  $('#cart').classList.toggle('is-empty', state.cart.length === 0);
  if (!state.cart.length) { state.quote = null; return; }
  const seq = ++quoteSeq;
  let q;
  try { q = await api('/api/cart/quote', { items: state.cart, coupon: state.coupon }); } catch (e) { $('#couponMsg').textContent = e.message; return; }
  if (seq !== quoteSeq) return;
  state.quote = q;
  if (q.couponError) {
    $('#couponMsg').className = 'coupon-msg err';
    $('#couponMsg').textContent = `${state.coupon}: ${q.couponError}`;
  } else if (q.coupon) {
    $('#couponMsg').className = 'coupon-msg ok';
    $('#couponMsg').innerHTML = `<span class="coupon-tag">🎟️ ${esc(q.coupon.code)} <button data-remove-coupon aria-label="Quitar código">×</button></span>`;
  } else $('#couponMsg').textContent = '';
  $('#cartLines').innerHTML = q.lines.map((l) => `<li class="cart-line">
    <img src="${esc(l.image || '/img/favicon.svg')}" alt="">
    <div><h4>${esc(l.name)}</h4>${l.color ? `<small><i style="background:${esc(l.color)}"></i> Color</small>` : ''}
      <div class="qty"><button data-line="${l.id}|${esc(l.color || '')}" data-d="-1" aria-label="Menos">−</button><span>${l.qty}</span><button data-line="${l.id}|${esc(l.color || '')}" data-d="1" aria-label="Más">+</button></div></div>
    <div class="right"><strong>${money(l.total)}</strong><button class="remove" data-line="${l.id}|${esc(l.color || '')}" data-d="-999">Quitar</button></div>
  </li>`).join('');
  const totals = `<dt>Subtotal</dt><dd>${money(q.subtotal)}</dd>
    ${q.discount ? `<dt class="discount">Descuento</dt><dd class="discount">−${money(q.discount)}</dd>` : ''}
    <dt>Envío</dt><dd>${q.shipping ? money(q.shipping) : '¡Gratis!'}</dd>
    <dt class="grand">Total</dt><dd class="grand">${money(q.total)}</dd>`;
  $('#totals').innerHTML = totals;
  $('#coTotals').innerHTML = totals;
  const free = state.data.site.freeShippingFrom;
  const base = q.subtotal - q.discount;
  $('#freeShip').hidden = !free;
  if (free) {
    $('#freeShip .bar span').style.width = `${Math.min(100, (base / free) * 100)}%`;
    $('#freeShip p').innerHTML = base >= free ? '🎉 ¡Tenés <strong>envío gratis</strong>!' : `Te faltan <strong>${money(free - base)}</strong> para el envío gratis`;
  }
}

function openCart() { $('#cart').classList.add('open'); $('#cart').setAttribute('aria-hidden', 'false'); }
function closeCart() { $('#cart').classList.remove('open'); $('#cart').setAttribute('aria-hidden', 'true'); }

/* ---------- Checkout ---------- */
async function submitCheckout(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = $('#coSubmit');
  btn.disabled = true; btn.textContent = 'Procesando…';
  $('#coError').textContent = '';
  try {
    const customer = Object.fromEntries(['name', 'phone', 'email', 'city', 'address', 'notes'].map((k) => [k, f.get(k)]));
    store.set('niten_customer', customer);
    const r = await api('/api/orders', { items: state.cart, coupon: state.quote?.coupon ? state.coupon : null, customer, payment: f.get('payment') });
    state.cart = []; state.coupon = null; saveCart(); refreshCart();
    if (r.payUrl) { location.href = r.payUrl; return; }
    e.target.hidden = true;
    $('#coDone').hidden = false;
    $('#coCode').textContent = r.code;
    Object.assign($('#coWa'), { href: r.whatsappUrl || '#', hidden: !r.whatsappUrl });
    $('#coTrack').href = `/pedido.html?code=${r.code}`;
  } catch (err) {
    $('#coError').textContent = err.message;
  } finally { btn.disabled = false; btn.textContent = 'Confirmar pedido'; }
}

/* ---------- Eventos ---------- */
function bind() {
  addEventListener('scroll', () => $('#header').classList.toggle('scrolled', scrollY > 10), { passive: true });
  $('#menuBtn').onclick = () => document.body.classList.toggle('menu-open');
  $$('#nav a').forEach((a) => a.addEventListener('click', () => document.body.classList.remove('menu-open')));

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open],[data-add],[data-cat],[data-close],[data-close-cart],[data-line],[data-color],[data-img],[data-q],[data-remove-coupon]');
    if (!t) return;
    if (t.dataset.open) openProduct(t.dataset.open);
    else if (t.dataset.add) addToCart(Number(t.dataset.add), 1, null, t.closest('.card')?.querySelector('img'));
    else if (t.dataset.cat !== undefined) { state.cat = t.dataset.cat; renderGrid(); }
    else if ('close' in t.dataset) closeModals();
    else if ('closeCart' in t.dataset) closeCart();
    else if (t.dataset.line) {
      const [id, color] = t.dataset.line.split('|');
      const l = state.cart.find((x) => x.id === Number(id) && (x.color || '') === color);
      if (!l) return;
      const p = productById(l.id);
      l.qty = Math.min(p.stock, l.qty + Number(t.dataset.d));
      if (l.qty <= 0) state.cart.splice(state.cart.indexOf(l), 1);
      saveCart(); refreshCart();
    } else if (t.dataset.color) { pv.color = t.dataset.color; $$('#pvColors button').forEach((b) => b.classList.toggle('active', b === t)); }
    else if (t.dataset.img) showImg(Number(t.dataset.img));
    else if (t.dataset.q) { const i = $('#pvQty'); i.value = Math.max(1, Math.min(Number(i.max), Number(i.value) + Number(t.dataset.q))); }
    else if ('removeCoupon' in t.dataset) { state.coupon = null; saveCart(); refreshCart(); }
  });

  $('#pvAdd').onclick = () => { addToCart(pv.p.id, Math.max(1, Number($('#pvQty').value) || 1), pv.color, $('#pvImg')); };
  $('#pvCopy').onclick = async () => { await navigator.clipboard?.writeText(`${location.origin}/#p/${pv.p.slug}`); toast('Link copiado'); };
  $('#cartBtn').onclick = openCart;
  $('#search').oninput = (e) => { state.q = e.target.value; renderGrid(); };
  $('#sort').onchange = (e) => { state.sort = e.target.value; renderGrid(); };
  $('#couponForm').onsubmit = async (e) => {
    e.preventDefault();
    const code = $('#couponInput').value.trim();
    if (!code) return;
    try {
      await api('/api/coupons/check', { code, items: state.cart });
      state.coupon = code.toUpperCase(); saveCart(); $('#couponInput').value = '';
      toast('🎉 Código aplicado');
      refreshCart();
    } catch (err) { $('#couponMsg').className = 'coupon-msg err'; $('#couponMsg').textContent = err.message; }
  };
  $('#checkoutBtn').onclick = () => {
    closeCart();
    const saved = store.get('niten_customer', {});
    const form = $('#checkoutForm');
    for (const [k, v] of Object.entries(saved)) if (form.elements[k] && !form.elements[k].value) form.elements[k].value = v || '';
    form.hidden = false; $('#coDone').hidden = true;
    $('#checkoutModal').hidden = false;
    document.body.style.overflow = 'hidden';
  };
  $('#checkoutForm').onsubmit = submitCheckout;
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModals(); closeCart(); } });
  addEventListener('popstate', route);
}

function route() {
  const m = location.hash.match(/^#p\/(.+)$/);
  if (m) openProduct(decodeURIComponent(m[1]), false);
  else if (!$('#productModal').hidden) { $('#productModal').hidden = true; document.body.style.overflow = ''; }
}

async function init() {
  bind();
  await trackRef();
  const marca = new URLSearchParams(location.search).get('marca');
  state.data = await fetch(`/api/site${marca ? `?marca=${encodeURIComponent(marca)}` : ''}`).then((r) => r.json());
  renderContent();
  renderGrid();
  refreshCart();
  observeReveals();
  tilt();
  particles();
  printer();
  route();
}

init().catch((e) => { console.error(e); toast('No se pudo cargar la tienda'); });
