// Carga datos de muestra. `npm run seed` agrega lo que falte; `npm run reset` borra todo y recarga.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('./config');

if (process.argv.includes('--reset')) {
  const file = path.join(config.dataDir, 'niten.db');
  for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
  console.log('Base de datos eliminada.');
}

const { db, getContent, setContent } = require('./db');
const defaults = require('./defaults');

function seed() {
  for (const [key, value] of Object.entries(defaults)) {
    if (getContent(key) === null) setContent(key, value);
  }

  // El saludo original tenía el nombre escrito a mano: pasa a usar {tienda}
  const bot = getContent('bot');
  if (bot?.greeting === '¡Hola {nombre}! 👋 Soy el asistente de *NITEN 3D*.') setContent('bot', { ...bot, greeting: defaults.bot.greeting });

  if (!db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) {
    db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'admin')")
      .run(config.admin.email.toLowerCase(), 'Administrador', bcrypt.hashSync(config.admin.password, 10));
    console.log(`Admin creado: ${config.admin.email} / ${config.admin.password}`);
  }

  if (db.prepare('SELECT COUNT(*) n FROM products').get().n > 0) return;

  const cats = [['Figuras', 'figuras'], ['Decoración', 'decoracion'], ['Iluminación', 'iluminacion'], ['Escritorio', 'escritorio'], ['Personalizados', 'personalizados'], ['Juegos', 'juegos']];
  const catId = {};
  cats.forEach(([name, slug], i) => { catId[slug] = db.prepare('INSERT INTO categories (name, slug, sort) VALUES (?, ?, ?)').run(name, slug, i).lastInsertRowid; });

  const img = (n) => [`/img/samples/${n}.svg`];
  const products = [
    ['dragon-articulado', 'Dragón Articulado', 'figuras', 18900, 23500, 12, 'Impreso en una sola pieza, se mueve como un dragón de verdad.', 'Nuestro best seller. Un dragón de 35 cm impreso en una sola pieza con articulaciones "print-in-place": no lleva pegamento ni ensamblado. Cada segmento se mueve libremente, ideal como juguete antiestrés, regalo o decoración.', ['#ff5a1f', '#8b5cf6', '#22c55e', '#e5e7eb'], 'PLA silk', 9, 'Best seller', 1],
    ['lampara-luna', 'Lámpara Luna', 'iluminacion', 32500, null, 6, 'Luna litofánica con luz cálida LED y base de madera.', 'Réplica de la luna impresa a partir de datos topográficos reales de la NASA. Al encenderla se revelan cráteres y relieves. Incluye luz LED cálida USB y base de madera. Diámetro: 15 cm.', ['#fff6d8'], 'PLA blanco', 14, 'Nuevo', 1],
    ['astronauta-chibi', 'Astronauta Chibi', 'figuras', 12900, null, 20, 'Figura coleccionable de 12 cm pintada a mano.', 'Un pequeño explorador espacial para tu escritorio o biblioteca. Impreso en alta resolución y pintado a mano con detalles en visor y panel de control.', ['#f4f7ff', '#fca5a5'], 'Resina', 5, null, 1],
    ['jarron-espiral', 'Jarrón Espiral', 'decoracion', 15800, 17900, 9, 'Jarrón modo vaso con textura en espiral y brillo seda.', 'Impreso en "modo vaso": una sola pared continua que genera un efecto de espiral hipnótico. Ideal para flores secas o como pieza decorativa. Altura: 25 cm.', ['#ff9ec7', '#8e2a8f', '#ffd166'], 'PLA silk', 7, '-12%', 1],
    ['maceta-low-poly', 'Maceta Low Poly', 'decoracion', 8900, null, 30, 'Maceta geométrica con plato de drenaje incluido.', 'Diseño facetado low-poly perfecto para suculentas y cactus. Incluye plato de drenaje encastrable. Disponible en 3 tamaños.', ['#9ef0c5', '#e5e7eb', '#111827'], 'PETG', 4, null, 0],
    ['soporte-auriculares', 'Soporte de Auriculares', 'escritorio', 11500, null, 15, 'Stand minimalista, estable y con base antideslizante.', 'Ordená tu setup con este soporte que sostiene cualquier auricular over-ear. Base con peso y goma antideslizante. Altura: 27 cm.', ['#ffd166', '#111827', '#e5e7eb'], 'PETG', 6, null, 0],
    ['organizador-hexagonal', 'Organizador Hexagonal', 'escritorio', 9800, null, 18, 'Módulos hexagonales encastrables para tu escritorio.', 'Set de 3 módulos que se encastran entre sí en la combinación que quieras. Para lápices, pinceles, herramientas o maquillaje.', ['#6ee7ff', '#f472b6', '#e5e7eb'], 'PLA', 5, null, 0],
    ['llaveros-personalizados', 'Llaveros Personalizados x10', 'personalizados', 14500, null, 50, 'Pack de 10 llaveros con tu nombre, inicial o logo.', 'Ideales para souvenirs, emprendimientos y regalos empresariales. Enviamos por WhatsApp un boceto para que lo apruebes antes de imprimir.', ['#ff6b6b', '#ffe066', '#74c0fc'], 'PLA bicolor', 3, 'Personalizable', 1],
    ['set-ajedrez', 'Set de Ajedrez Moderno', 'juegos', 38900, 44900, 4, '32 piezas de diseño contemporáneo + tablero.', 'Juego de ajedrez completo con piezas de diseño geométrico moderno y tablero impreso en dos colores. Un regalo que no pasa desapercibido.', ['#f8f9fa', '#343a40'], 'PLA mate', 30, 'Premium', 0],
    ['soporte-celular', 'Soporte para Celular', 'escritorio', 6900, null, 40, 'Soporte regulable compatible con todos los celulares.', 'Ángulo ideal para videollamadas, recetas o series. Compatible con celulares con o sin funda. Lleva el cable de carga por detrás.', ['#a3e635', '#111827', '#e5e7eb'], 'PLA', 2, null, 0],
  ];
  const ins = db.prepare(`INSERT INTO products (slug, name, category_id, price, compare_price, stock, short, description, colors, material, print_hours, badge, featured, images, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  products.forEach(([slug, name, cat, price, cmp, stock, short, desc, colors, mat, hours, badge, featured], i) =>
    ins.run(slug, name, catId[cat], price, cmp, stock, short, desc, JSON.stringify(colors), mat, hours, badge, featured, JSON.stringify(img(slug)), i));

  // Vendedores de ejemplo, cada uno con su usuario y código propio
  const sellers = [['Juan Pérez', 'juan@niten.local', '5491122223333', 10, 'JUAN10', 10], ['Carla Gómez', 'carla@niten.local', '5491144445555', 12, 'CARLA15', 15]];
  for (const [name, email, phone, commission, code, pct] of sellers) {
    const sid = db.prepare('INSERT INTO sellers (name, email, phone, commission_pct) VALUES (?, ?, ?, ?)').run(name, email, phone, commission).lastInsertRowid;
    db.prepare("INSERT INTO users (email, name, password_hash, role, seller_id) VALUES (?, ?, ?, 'seller', ?)").run(email, name, bcrypt.hashSync('vendedor123', 10), sid);
    db.prepare("INSERT INTO coupons (code, type, value, seller_id, description) VALUES (?, 'percent', ?, ?, ?)").run(code, pct, sid, `Código de ${name}`);
  }
  db.prepare("INSERT INTO coupons (code, type, value, description) VALUES ('BIENVENIDA10', 'percent', 10, 'Cupón de bienvenida')").run();
  db.prepare("INSERT INTO coupons (code, type, value, min_total, description) VALUES ('ENVIO5000', 'fixed', 5000, 40000, '$5.000 off en compras desde $40.000')").run();
  console.log('Datos de muestra cargados (vendedores: juan@niten.local / carla@niten.local, clave vendedor123).');
}

if (require.main === module) seed();
module.exports = seed;
