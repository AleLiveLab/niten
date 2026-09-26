// Genera las ilustraciones de muestra de productos (SVG) en public/img/samples.
// Uso: node scripts/gen-samples.js
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'public', 'img', 'samples');
fs.mkdirSync(out, { recursive: true });

const frame = (id, [bg1, bg2], [c1, c2], body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<defs>
  <radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></radialGradient>
  <linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
  <linearGradient id="m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
  <pattern id="layers" width="8" height="6" patternUnits="userSpaceOnUse"><rect width="8" height="3" fill="#fff" opacity=".10"/><rect y="3" width="8" height="3" fill="#000" opacity=".06"/></pattern>
  <radialGradient id="shadow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <radialGradient id="shine" cx="30%" cy="25%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="800" height="800" fill="url(#bg)"/>
<g opacity=".08" stroke="#fff">${Array.from({ length: 11 }, (_, i) => `<line x1="${i * 80}" y1="560" x2="${400 + (i * 80 - 400) * 2.2}" y2="800"/>`).join('')}${[580, 610, 650, 700, 770].map(y => `<line x1="0" y1="${y}" x2="800" y2="${y}"/>`).join('')}</g>
<ellipse cx="400" cy="640" rx="240" ry="34" fill="url(#shadow)"/>
<g id="${id}">${body}</g>
</svg>`;

// Rellena una forma con el material + textura de capas + brillo
const solid = (shape) => `${shape.replace('/>', ' fill="url(#m)"/>')}${shape.replace('/>', ' fill="url(#layers)"/>')}${shape.replace('/>', ' fill="url(#shine)"/>')}`;

const items = {
  'dragon-articulado': frame('d', ['#3b1d5e', '#0d0718'], ['#ff7a3d', '#b3124a'], (() => {
    let s = '';
    const n = 16;
    for (let i = n; i >= 0; i--) {
      const t = i / n;
      const x = 150 + t * 470;
      const y = 470 + Math.sin(t * Math.PI * 2.2) * 90;
      const r = 26 + (1 - t) * 30;
      s += solid(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(r * 0.8).toFixed(1)}" ry="${r.toFixed(1)}"/>`);
      s += `<path d="M${(x - 6).toFixed(1)} ${(y - r).toFixed(1)} l6 -${(r * 0.55).toFixed(1)} l6 ${(r * 0.55).toFixed(1)}z" fill="#ffd166"/>`;
    }
    s += solid('<path d="M95 440 q20 -70 90 -60 l60 40 q-10 50 -70 60 q-60 8 -80 -40z"/>');
    s += '<path d="M130 380 l-30 -60 l55 45z M170 375 l0 -70 l30 65z" fill="#ffd166"/><circle cx="150" cy="425" r="11" fill="#fff"/><circle cx="153" cy="425" r="6" fill="#111"/>';
    s += solid('<path d="M300 420 q60 -170 170 -150 q-40 60 -40 150z"/>');
    return s;
  })()),
  'maceta-low-poly': frame('p', ['#15463c', '#04130f'], ['#9ef0c5', '#1c9c78'], (() => {
    const pts = [[250, 330], [330, 310], [400, 320], [470, 310], [550, 330], [520, 610], [460, 625], [400, 630], [340, 625], [280, 610]];
    const tri = [[0, 1, 9], [1, 8, 9], [1, 2, 8], [2, 7, 8], [2, 3, 7], [3, 6, 7], [3, 4, 6], [4, 5, 6]];
    const shades = ['#b9f6d9', '#7fe0b4', '#5fcf9f', '#3fb886', '#8ee8c0', '#2da373', '#6ad7a8', '#2a8f66'];
    let s = tri.map((t, i) => `<polygon points="${t.map(k => pts[k].join(',')).join(' ')}" fill="${shades[i]}" stroke="#0b3b2c" stroke-width="2"/>`).join('');
    s += '<polygon points="250,330 330,310 400,320 470,310 550,330" fill="url(#layers)"/><ellipse cx="400" cy="325" rx="148" ry="18" fill="#3a2a1c"/>';
    // suculenta
    const leaf = (a, l, c) => `<ellipse cx="400" cy="${320 - l / 2}" rx="${l / 4}" ry="${l / 2}" fill="${c}" transform="rotate(${a} 400 320)"/>`;
    s += [-70, -40, -12, 15, 42, 70].map((a, i) => leaf(a, 170 - Math.abs(a), i % 2 ? '#4caf50' : '#2e7d32')).join('');
    s += [-30, 0, 30].map(a => leaf(a, 90, '#81c784')).join('');
    return s;
  })()),
  'lampara-luna': frame('l', ['#1c2440', '#05070f'], ['#fff6d8', '#e5c77a'], (() => {
    let s = '<circle cx="400" cy="380" r="260" fill="#ffe8a3" opacity=".12"/><circle cx="400" cy="380" r="215" fill="#ffe8a3" opacity=".15"/>';
    s += solid('<circle cx="400" cy="380" r="180"/>');
    [[340, 320, 30], [460, 300, 20], [430, 430, 42], [320, 440, 18], [480, 380, 14], [370, 380, 10], [400, 260, 16]]
      .forEach(([x, y, r]) => { s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#d9b85e" opacity=".55"/><circle cx="${x - r * .15}" cy="${y - r * .15}" r="${r * .8}" fill="#f3dc98" opacity=".5"/>`; });
    s += '<path d="M330 560 h140 l20 60 h-180z" fill="#3b2f25"/><rect x="300" y="610" width="200" height="22" rx="6" fill="#2a211a"/><rect x="392" y="545" width="16" height="30" fill="#2a211a"/>';
    return s;
  })()),
  'jarron-espiral': frame('j', ['#4a1030', '#12030b'], ['#ff9ec7', '#8e2a8f'], (() => {
    let s = solid('<path d="M330 620 q-40 -120 -10 -220 q30 -90 20 -170 h120 q-10 80 20 170 q30 100 -10 220z"/>');
    for (let i = 0; i < 9; i++) {
      const x = 320 + i * 20;
      s += `<path d="M${x} 620 C ${x - 60} 520, ${x + 80} 380, ${x + 20} 230" stroke="#fff" stroke-opacity=".18" stroke-width="5" fill="none"/>`;
    }
    s += '<ellipse cx="400" cy="230" rx="60" ry="12" fill="#5a1440"/><path d="M400 230 q-20 -80 -60 -120 M400 230 q10 -90 50 -140 M400 230 q30 -60 90 -80" stroke="#6cbf6a" stroke-width="6" fill="none"/>';
    s += '<circle cx="340" cy="110" r="22" fill="#ffd166"/><circle cx="450" cy="90" r="26" fill="#ff6f91"/><circle cx="490" cy="150" r="18" fill="#f8f5ff"/>';
    return s;
  })()),
  'astronauta-chibi': frame('a', ['#0e2a52', '#030814'], ['#f4f7ff', '#aab6d3'], (() => {
    let s = Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 197) % 800}" cy="${(i * 113) % 520}" r="${1 + (i % 3)}" fill="#fff" opacity=".6"/>`).join('');
    s += solid('<rect x="290" y="420" width="220" height="190" rx="70"/>');
    s += solid('<rect x="225" y="440" width="80" height="130" rx="40"/>') + solid('<rect x="495" y="440" width="80" height="130" rx="40"/>');
    s += solid('<circle cx="400" cy="320" r="150"/>');
    s += '<ellipse cx="400" cy="330" rx="105" ry="85" fill="#10183a"/><ellipse cx="365" cy="300" rx="36" ry="20" fill="#6fa8ff" opacity=".7"/><ellipse cx="440" cy="355" rx="18" ry="10" fill="#6fa8ff" opacity=".4"/>';
    s += '<rect x="360" y="470" width="80" height="50" rx="10" fill="#ff6b6b"/><circle cx="380" cy="495" r="8" fill="#ffd166"/><circle cx="420" cy="495" r="8" fill="#4ade80"/>';
    return s;
  })()),
  'soporte-auriculares': frame('h', ['#2d2d2d', '#0a0a0a'], ['#ffd166', '#f08c00'], (() => {
    let s = solid('<rect x="250" y="590" width="300" height="36" rx="14"/>');
    s += solid('<path d="M380 600 h40 l-10 -380 h-20z"/>');
    s += solid('<path d="M310 220 q90 -60 180 0 v24 q-90 -50 -180 0z"/>');
    s += '<path d="M300 380 q0 -200 100 -200 q100 0 100 200" stroke="#1f1f1f" stroke-width="26" fill="none"/>';
    s += '<rect x="262" y="360" width="70" height="120" rx="30" fill="#1f1f1f"/><rect x="468" y="360" width="70" height="120" rx="30" fill="#1f1f1f"/><rect x="276" y="372" width="42" height="96" rx="20" fill="#3a3a3a"/><rect x="482" y="372" width="42" height="96" rx="20" fill="#3a3a3a"/>';
    return s;
  })()),
  'organizador-hexagonal': frame('o', ['#0f3b57', '#03101a'], ['#6ee7ff', '#1d7fd1'], (() => {
    const hex = (cx, cy, r, h) => {
      const p = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i; return [cx + r * Math.cos(a), cy + r * Math.sin(a) * .55]; });
      const top = p.map(q => q.map(v => v.toFixed(1)).join(',')).join(' ');
      const bot = p.map(([x, y]) => [x, y + h]);
      let g = `<polygon points="${[p[0], p[1], p[2], p[3], bot[3], bot[2], bot[1], bot[0]].map(q => q.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="url(#m2)"/>`;
      g += `<polygon points="${[p[0], p[1], p[2], p[3], bot[3], bot[2], bot[1], bot[0]].map(q => q.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="url(#layers)"/>`;
      g += `<polygon points="${top}" fill="#0b2a44" stroke="#9af0ff" stroke-width="4"/>`;
      return g;
    };
    let s = '';
    s += '<path d="M330 380 l-20 -190" stroke="#ff6b6b" stroke-width="14" stroke-linecap="round"/><path d="M360 380 l10 -170" stroke="#ffd166" stroke-width="14" stroke-linecap="round"/><path d="M470 360 l30 -150" stroke="#4ade80" stroke-width="10"/><rect x="495" y="190" width="14" height="30" fill="#e5e7eb"/>';
    s += hex(330, 420, 80, 160) + hex(470, 400, 80, 180) + hex(400, 470, 80, 130);
    return s;
  })()),
  'llaveros-personalizados': frame('k', ['#3d2a00', '#110b00'], ['#ffe066', '#ff922b'], (() => {
    let s = '<circle cx="400" cy="170" r="46" fill="none" stroke="#cfd4da" stroke-width="12"/>';
    const tags = [['#ff6b6b', '#c92a2a', 'A', -18, 260], ['#ffe066', '#f08c00', 'N', 0, 400], ['#74c0fc', '#1c7ed6', 'M', 18, 540]];
    tags.forEach(([a, b, letter, rot, x]) => {
      s += `<line x1="400" y1="210" x2="${x}" y2="330" stroke="#cfd4da" stroke-width="6"/>`;
      s += `<g transform="rotate(${rot} ${x} 330)"><linearGradient id="t${letter}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
      <rect x="${x - 70}" y="330" width="140" height="190" rx="36" fill="url(#t${letter})"/><rect x="${x - 70}" y="330" width="140" height="190" rx="36" fill="url(#layers)"/>
      <circle cx="${x}" cy="360" r="12" fill="#1a1a1a" opacity=".5"/>
      <text x="${x}" y="480" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="100" fill="#fff" opacity=".92">${letter}</text></g>`;
    });
    return s;
  })()),
  'set-ajedrez': frame('c', ['#2b2f3a', '#0b0c10'], ['#f8f9fa', '#adb5bd'], (() => {
    let s = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) {
      const y = 560 + r * 26, w = 60 + r * 6, x0 = 400 - 4 * w;
      s += `<rect x="${x0 + c * w}" y="${y}" width="${w}" height="26" fill="${(r + c) % 2 ? '#3a3f4b' : '#d9dde3'}"/>`;
    }
    const piece = (x, fill, top) => `<g fill="${fill}" stroke="#8d96a3" stroke-width="3"><rect x="${x - 50}" y="530" width="100" height="30" rx="8"/><path d="M${x - 36} 530 q10 -120 36 -160 q26 40 36 160z"/>${top}</g>`;
    s += piece(250, '#f1f3f5', '<circle cx="250" cy="355" r="30"/>');
    s += piece(400, '#343a40', '<rect x="370" y="250" width="60" height="30" rx="6"/><rect x="394" y="200" width="12" height="60"/><rect x="380" y="214" width="40" height="12"/><circle cx="400" cy="330" r="42"/>');
    s += piece(550, '#f1f3f5', '<path d="M520 370 q0 -90 50 -110 q30 30 -10 70 l20 40z"/>');
    return s;
  })()),
  'soporte-celular': frame('s', ['#123524', '#030a06'], ['#a3e635', '#3f8f1f'], (() => {
    let s = solid('<path d="M250 600 h300 v30 h-300z"/>');
    s += solid('<path d="M330 600 l120 -330 h40 l-110 330z"/>');
    s += solid('<path d="M300 600 v-60 h60 v60z"/>');
    s += '<g transform="rotate(20 440 380)"><rect x="370" y="170" width="170" height="330" rx="26" fill="#111"/><rect x="382" y="190" width="146" height="290" rx="16" fill="url(#bg)"/><rect x="382" y="190" width="146" height="290" rx="16" fill="#38bdf8" opacity=".35"/><circle cx="455" cy="330" r="34" fill="#a3e635" opacity=".85"/></g>';
    return s;
  })()),
};

for (const [name, svg] of Object.entries(items)) fs.writeFileSync(path.join(out, `${name}.svg`), svg);
console.log(`Generadas ${Object.keys(items).length} imágenes en ${out}`);
