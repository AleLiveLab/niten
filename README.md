# NITEN 3D — Tienda de impresiones 3D

Tienda online con animaciones, carrito de compras, panel de administración, vendedores con códigos propios y seguimiento, integración con MercadoLibre y Mercado Pago, bot de WhatsApp y publicación en redes sociales con un clic.

Está hecha en **Node.js + SQLite**, sin build ni base de datos externa: corre igual en tu PC y en un VPS.

## Qué incluye

| Área | Funcionalidades |
|---|---|
| **Tienda** | Hero con una impresora 3D animada que "imprime" tus productos capa por capa, partículas, tarjetas con inclinación 3D, animaciones al hacer scroll, catálogo con filtros/búsqueda/orden, ficha de producto con colores y galería, carrito lateral con barra de envío gratis, checkout, seguimiento de pedido (`/pedido.html`), botón de WhatsApp. Adaptada a celular. |
| **Panel** (`/admin`) | Resumen de ventas, pedidos (estados, pagos, ventas manuales), productos (fotos, colores, stock, ofertas), categorías, **todo el contenido del sitio editable** (textos, portada, secciones visibles, FAQ, opiniones, colores). |
| **Cupones y vendedores** | Cupones % o monto fijo, con mínimo de compra, límite de usos y vigencia. Cada vendedor tiene su código y su link `?ref=CÓDIGO`; se registran **visitas, veces aplicado, pedidos, ventas y comisión**. Cada vendedor entra al panel y ve **solo sus números** y puede generar imágenes promocionales con su código. |
| **Redes sociales** | Estudio que genera imágenes de alto impacto (post cuadrado, historia vertical, minimal) con precio, descuento y código, arma el texto con hashtags y **publica con un clic en Facebook, Instagram, Telegram, Pinterest y X**. Historial de publicaciones. |
| **WhatsApp** | Bot con menú (catálogo, promociones, estado del pedido por código, pedidos personalizados, derivar a una persona), búsqueda de productos con foto y precio, respuestas por palabra clave editables. Ver conversaciones y responder desde el panel. **Simulador** para probarlo sin conectar nada. |
| **MercadoLibre** | Conexión OAuth, publicar productos (con categoría sugerida por ML), sincronización automática de precio y stock, importación de ventas (y por webhook). |
| **Mercado Pago** | Checkout Pro; el webhook confirma el pago automáticamente. Sin token, el pedido queda para coordinar por transferencia/WhatsApp. |

## 1. Correrlo en tu PC

Necesitás [Node.js 22.13 o superior](https://nodejs.org) (la versión LTS actual sirve). No hace falta Python ni compiladores: la base de datos usa el SQLite que ya trae Node.

```bash
npm install
cp .env.example .env        # en Windows: copy .env.example .env
npm start
```

- Tienda: http://localhost:3000
- Panel: http://localhost:3000/admin — usuario `admin@niten.local`, contraseña `admin123` (**cambiala** en `.env` o desde "Mi cuenta").
- Vendedores de ejemplo: `juan@niten.local` y `carla@niten.local`, contraseña `vendedor123`.

Viene con 10 productos de muestra con ilustraciones propias (en `public/img/samples`). Reemplazalos desde el panel subiendo tus fotos.

Comandos útiles:

```bash
npm run dev     # se reinicia solo al modificar el código
npm run reset   # borra la base de datos y vuelve a cargar los datos de ejemplo
```

Los datos quedan en `data/niten.db` y las fotos subidas en `uploads/`.

## 2. Subirlo al VPS

Con un VPS Ubuntu/Debian y un dominio apuntando a su IP:

```bash
# En el VPS
sudo apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
git clone <tu repo> /opt/niten && cd /opt/niten
cp .env.example .env
nano .env   # PUBLIC_URL=https://tudominio.com, JWT_SECRET largo, ADMIN_PASSWORD segura
docker compose up -d --build

sudo cp deploy/nginx.conf /etc/nginx/sites-available/niten   # editá tudominio.com
sudo ln -s /etc/nginx/sites-available/niten /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tudominio.com -d www.tudominio.com
```

Para pasar tus productos y contenido de la PC al VPS, copiá las carpetas `data/` y `uploads/`.

Si preferís no usar Docker: `npm ci --omit=dev` y el servicio de `deploy/niten.service`. Para copias de seguridad diarias usá `deploy/backup.sh` con cron.

## 3. Conectar los servicios

Todo se configura en **Panel → Integraciones** (o en `.env`). Cada tarjeta explica de dónde sacar las credenciales.

> MercadoLibre, Instagram, Mercado Pago (retorno automático) y los webhooks de WhatsApp necesitan que el sitio esté **online con HTTPS**, porque esos servicios descargan las fotos o avisan a tu servidor. En la PC podés preparar todo y probar el bot con el simulador.

| Servicio | Dónde | Webhook / Redirect |
|---|---|---|
| Mercado Pago | [Tus integraciones](https://www.mercadopago.com.ar/developers/panel/app) → Access token de producción | se configura solo |
| MercadoLibre | [DevCenter](https://developers.mercadolibre.com.ar/devcenter) → crear app | Redirect: `https://tudominio.com/api/admin/ml/callback` · Notificaciones (orders_v2): `https://tudominio.com/webhooks/mercadolibre` |
| WhatsApp | [Meta for Developers](https://developers.facebook.com/apps) → app Business → WhatsApp | `https://tudominio.com/webhooks/whatsapp`, verify token = `WA_VERIFY_TOKEN`, campo `messages` |
| Facebook / Instagram | Misma app de Meta: Page token con `pages_manage_posts`, `instagram_content_publish` | — |
| Telegram | @BotFather → bot admin de tu canal | — |
| Pinterest | [Pinterest Developers](https://developers.pinterest.com/apps/) | — |
| X | [developer.x.com](https://developer.x.com/) con permisos Read and Write | — |

TikTok no está incluido porque su API de publicación exige una auditoría de la app. Mientras tanto podés usar el botón **Descargar imagen** del estudio de redes y subirla a mano.

## Cómo funciona el seguimiento de vendedores

1. Creás el vendedor en **Vendedores**, con su código (ej. `JUAN10`), su % de comisión y, si querés, un acceso al panel.
2. El vendedor comparte su link `https://tudominio.com/?ref=JUAN10` o su código.
3. Cuando alguien entra por el link se registra la **visita** y el código se aplica solo en el carrito. Si alguien escribe el código en el carrito, se registra como **aplicado**.
4. Cada pedido con ese código se asigna al vendedor. La **comisión** se calcula sobre los pedidos con pago aprobado (subtotal menos descuento, sin envío). Los pedidos cancelados no cuentan.
5. Las ventas hechas en persona se cargan con **Pedidos → Venta manual** eligiendo el código del vendedor.

## Estructura

```
server/
  index.js            servidor Express
  db.js / seed.js     base SQLite y datos de ejemplo
  defaults.js         textos por defecto del sitio y del bot
  settings.js         credenciales (.env + panel)
  routes/             API pública, panel, webhooks
  services/           pedidos y cupones, estadísticas, imágenes promo,
                      Mercado Pago, MercadoLibre, WhatsApp, redes sociales
public/
  index.html, css/, js/   la tienda
  pedido.html             seguimiento de pedido
  admin/                  panel de administración
scripts/gen-samples.js    genera las ilustraciones de muestra
deploy/                   Nginx, systemd y backup
```

## MCP

El archivo `.mcp.json` registra el servidor MCP de Mailerfind (transporte HTTP) para Claude Code. Equivalente por CLI:

```bash
claude mcp add --transport http mailerfind --scope project https://mcp.mailerfind.com/mcp
```
