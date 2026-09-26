const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config');
const seed = require('./seed');

seed();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  next();
});

app.use(require('./routes/webhooks'));
app.use(require('./routes/public'));
app.use(require('./routes/admin'));

app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d' }));
app.use(express.static(config.publicDir, { extensions: ['html'] }));

app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));
app.use((err, req, res, next) => {
  // Errores de APIs externas (MercadoLibre, Meta, etc.) se informan como 502 con su mensaje
  if (err.data !== undefined) return res.status(502).json({ error: err.message });
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Error interno' : err.message });
});

app.listen(config.port, () => {
  console.log(`\n  NITEN 3D corriendo en http://localhost:${config.port}`);
  console.log(`  Panel de administración: http://localhost:${config.port}/admin\n`);
  if (config.jwtSecret === 'cambia-este-secreto') console.warn('  ⚠ Configurá JWT_SECRET en el archivo .env antes de publicar el sitio.');
  if (config.admin.password === 'admin123') console.warn('  ⚠ Cambiá la contraseña del administrador (ADMIN_PASSWORD o desde "Mi cuenta").');
});
