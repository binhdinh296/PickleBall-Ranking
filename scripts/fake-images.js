// Sinh ảnh mẫu (SVG → WebP) cho các mục chưa có ảnh: avatar VĐV, banner giải, banner nội dung, logo đối tác.
// Ảnh minh họa cách điệu, không phải ảnh người thật. Chạy: npm run fake-images
const crypto = require('crypto');
const { all, run } = require('../src/db');
const { saveImage, removeUpload } = require('../src/lib/upload');

const PALETTES = [
  ['#D4F53C', '#14B8A6'], ['#14B8A6', '#2563EB'], ['#F59E0B', '#EF4444'], ['#A78BFA', '#14B8A6'],
  ['#22D3EE', '#6366F1'], ['#F472B6', '#F59E0B'], ['#84CC16', '#0EA5E9'], ['#E6C27A', '#B45309'],
];
const FONT = "'Be Vietnam Pro', 'Helvetica Neue', Helvetica, Arial, sans-serif";

function hashNum(s) {
  return parseInt(crypto.createHash('md5').update(String(s)).digest('hex').slice(0, 8), 16);
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

// Ngắt dòng theo số ký tự tối đa
function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p.length > 1 ? p[p.length - 2][0] : '') + p[p.length - 1][0]).toUpperCase();
}

// Ảnh đại diện: hình bóng người cách điệu trên nền gradient + vạch sân
function avatarSvg(name, gender, key) {
  const h = hashNum(key || name);
  const [c1, c2] = PALETTES[h % PALETTES.length];
  const angle = h % 360;
  const hair = gender === 'F'
    ? '<path d="M210 250c0-70 40-118 90-118s90 48 90 118c0 40-8 78-20 104h-140c-12-26-20-64-20-104z" fill="#0b1120" opacity=".55"/>'
    : '<path d="M222 222c4-56 38-90 78-90s74 34 78 90c-20-22-48-32-78-32s-58 10-78 32z" fill="#0b1120" opacity=".55"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <radialGradient id="v" cx=".5" cy=".35" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <g stroke="#fff" stroke-opacity=".22" stroke-width="6" fill="none"><path d="M60 600 L180 360 H420 L540 600"/><path d="M120 480 H480"/><path d="M300 360 V600"/></g>
  <circle cx="${430 + (h % 60)}" cy="${120 + (h % 50)}" r="34" fill="#fff" fill-opacity=".85"/>
  <g fill="#0b1120" fill-opacity=".25"><circle cx="${420 + (h % 60)}" cy="${110 + (h % 50)}" r="5"/><circle cx="${440 + (h % 60)}" cy="${118 + (h % 50)}" r="5"/><circle cx="${428 + (h % 60)}" cy="${134 + (h % 50)}" r="5"/></g>
  ${hair}
  <circle cx="300" cy="250" r="84" fill="#F1E3D3"/>
  <path d="M130 600c0-118 76-196 170-196s170 78 170 196z" fill="#0b1120" fill-opacity=".78"/>
  <path d="M248 420l52 60 52-60" fill="none" stroke="${c1}" stroke-width="14" stroke-linejoin="round"/>
  <rect width="600" height="600" fill="url(#v)"/>
  <text x="300" y="565" text-anchor="middle" font-family="${FONT}" font-size="44" font-weight="800" fill="#fff" fill-opacity=".85" letter-spacing="6">${esc(initials(name))}</text>
</svg>`;
}

// Banner giải: sân phối cảnh, bóng, tên giải, thời gian & địa điểm
function eventSvg(ev) {
  const h = hashNum(ev.slug || ev.name);
  const [c1, c2] = PALETTES[h % PALETTES.length];
  const lines = wrap(ev.name.toUpperCase(), 18);
  const dates = ev.start_date ? `${ev.start_date.split('-').reverse().join('/')}${ev.end_date && ev.end_date !== ev.start_date ? ' – ' + ev.end_date.split('-').reverse().join('/') : ''}` : '';
  const titleY = 330 - (lines.length - 1) * 55;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070B14"/><stop offset=".6" stop-color="#0C1A2A"/><stop offset="1" stop-color="#062320"/></linearGradient>
    <radialGradient id="glow1" cx=".85" cy=".1" r=".6"><stop offset="0" stop-color="${c2}" stop-opacity=".55"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow2" cx=".1" cy=".95" r=".5"><stop offset="0" stop-color="${c1}" stop-opacity=".35"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <linearGradient id="kit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}" stop-opacity=".5"/><stop offset="1" stop-color="${c1}" stop-opacity=".1"/></linearGradient>
    <radialGradient id="ball" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#D4F53C"/><stop offset="1" stop-color="#7A9A10"/></radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/><rect width="1600" height="900" fill="url(#glow1)"/><rect width="1600" height="900" fill="url(#glow2)"/>
  <g transform="translate(860 240)">
    <polygon points="160,60 560,60 700,620 20,620" fill="${c2}" fill-opacity=".38"/>
    <polygon points="118,230 602,230 640,390 80,390" fill="url(#kit)"/>
    <g fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="5"><polygon points="160,60 560,60 700,620 20,620"/><line x1="118" y1="230" x2="602" y2="230"/><line x1="80" y1="390" x2="640" y2="390"/><line x1="360" y1="60" x2="360" y2="230"/><line x1="360" y1="390" x2="360" y2="620"/></g>
    <line x1="98" y1="310" x2="622" y2="310" stroke="#fff" stroke-width="8"/>
    <path d="M140 560 Q 300 -60 520 140" fill="none" stroke="#D4F53C" stroke-opacity=".8" stroke-width="5" stroke-dasharray="4 18" stroke-linecap="round"/>
    <circle cx="520" cy="140" r="44" fill="url(#ball)"/>
    <g fill="#3A4A00" fill-opacity=".5"><circle cx="506" cy="124" r="6"/><circle cx="530" cy="118" r="6"/><circle cx="540" cy="146" r="6"/><circle cx="512" cy="156" r="6"/></g>
  </g>
  <rect x="100" y="${titleY - 140}" width="230" height="52" rx="26" fill="url(#title)"/>
  <text x="215" y="${titleY - 105}" text-anchor="middle" font-family="${FONT}" font-size="24" font-weight="800" fill="#06120E" letter-spacing="3">PICKLEBALL</text>
  ${lines.map((l, i) => `<text x="100" y="${titleY + i * 110}" font-family="${FONT}" font-size="96" font-weight="800" fill="url(#title)" letter-spacing="-2">${esc(l)}</text>`).join('')}
  <text x="100" y="${titleY + lines.length * 110 + 10}" font-family="${FONT}" font-size="34" font-weight="600" fill="#fff" fill-opacity=".8">${esc([dates, ev.venue].filter(Boolean).join('  ·  '))}</text>
</svg>`;
}

// Banner nội dung thi đấu: chữ kiểu huy hiệu bóng bẩy
function divisionSvg(d) {
  const h = hashNum(d.name + d.id);
  const [c1, c2] = PALETTES[h % PALETTES.length];
  const lines = wrap(d.name.toUpperCase(), 12);
  // Cỡ chữ theo dòng dài nhất để không tràn mép (chữ đậm nghiêng ≈ 0.68 em/ký tự)
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.min(lines.length > 1 ? 80 : 96, Math.floor(660 / (longest * 0.68)));
  const y0 = 215 - (lines.length - 1) * (size * 0.55);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1630"/><stop offset="1" stop-color="#06251F"/></linearGradient>
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <radialGradient id="g" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="${c2}" stop-opacity=".45"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="800" height="400" rx="36" fill="url(#bg)"/><rect width="800" height="400" rx="36" fill="url(#g)"/>
  <rect x="14" y="14" width="772" height="372" rx="26" fill="none" stroke="${c1}" stroke-opacity=".55" stroke-width="3"/>
  <g fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="4"><path d="M120 400 L250 120 H550 L680 400"/><path d="M200 300 H600"/></g>
  <circle cx="690" cy="96" r="34" fill="#D4F53C"/><g fill="#3A4A00" fill-opacity=".45"><circle cx="680" cy="86" r="5"/><circle cx="700" cy="92" r="5"/><circle cx="688" cy="108" r="5"/></g>
  ${lines.map((l, i) => `<text x="400" y="${y0 + i * size * 1.05}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="900" font-style="italic" fill="url(#t)" stroke="#06120E" stroke-width="3" paint-order="stroke" letter-spacing="1">${esc(l)}</text>`).join('')}
  ${d.subtitle ? `<text x="400" y="352" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="700" fill="#fff" fill-opacity=".75">${esc(d.subtitle)}</text>` : ''}
</svg>`;
}

// Logo đối tác: biểu tượng + chữ
function partnerSvg(p) {
  const h = hashNum(p.name);
  const [c1, c2] = PALETTES[h % PALETTES.length];
  const shapes = [
    `<circle cx="80" cy="120" r="52" fill="url(#g)"/>`,
    `<rect x="30" y="70" width="100" height="100" rx="26" fill="url(#g)"/>`,
    `<polygon points="80,62 138,170 22,170" fill="url(#g)"/>`,
  ];
  const lines = wrap(p.name.toUpperCase(), 13);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect x="4" y="4" width="472" height="232" rx="28" fill="#FFFFFF"/>
  ${shapes[h % shapes.length]}
  ${lines.map((l, i) => `<text x="160" y="${(lines.length > 1 ? 112 : 136) + i * 46}" font-family="${FONT}" font-size="38" font-weight="800" fill="#1F2937" letter-spacing="1">${esc(l)}</text>`).join('')}
  <text x="160" y="${lines.length > 1 ? 196 : 172}" font-family="${FONT}" font-size="18" font-weight="600" fill="#6B7280" letter-spacing="4">SPORTS PARTNER</text>
</svg>`;
}

// force: tạo lại cả ảnh đã có; only: giới hạn nhóm (avatars, events, divisions, partners)
async function fillMissingImages({ log = console.log, force = false, only = null } = {}) {
  const missing = (col, group) => (only && !only.includes(group) ? 'FALSE' : force ? 'TRUE' : `${col} IS NULL`);
  let n = 0;
  for (const a of await all(`SELECT id, full_name, gender, avatar AS old FROM athletes WHERE ${missing('avatar', 'avatars')}`)) {
    const url = await saveImage(Buffer.from(avatarSvg(a.full_name, a.gender, `a${a.id}`)), 'avatars', { width: 300, height: 300, fit: 'cover' });
    await run('UPDATE athletes SET avatar = ? WHERE id = ?', url, a.id); n++; removeUpload(a.old);
  }
  for (const s of await all(`SELECT id, full_name, gender, avatar AS old FROM submissions WHERE ${missing('avatar', 'avatars')}`)) {
    const url = await saveImage(Buffer.from(avatarSvg(s.full_name, s.gender, `s${s.id}`)), 'avatars', { width: 300, height: 300, fit: 'cover' });
    await run('UPDATE submissions SET avatar = ? WHERE id = ?', url, s.id); n++; removeUpload(s.old);
  }
  for (const e of await all(`SELECT id, slug, name, venue, start_date, end_date, banner AS old FROM events WHERE ${missing('banner', 'events')}`)) {
    const url = await saveImage(Buffer.from(eventSvg(e)), 'events', { width: 1600, height: 900 });
    await run('UPDATE events SET banner = ? WHERE id = ?', url, e.id); n++; removeUpload(e.old);
  }
  for (const d of await all(`SELECT id, name, subtitle, banner AS old FROM divisions WHERE ${missing('banner', 'divisions')}`)) {
    const url = await saveImage(Buffer.from(divisionSvg(d)), 'divisions', { width: 800, height: 400 });
    await run('UPDATE divisions SET banner = ? WHERE id = ?', url, d.id); n++; removeUpload(d.old);
  }
  for (const p of await all(`SELECT id, name, logo AS old FROM partners WHERE ${missing('logo', 'partners')}`)) {
    const url = await saveImage(Buffer.from(partnerSvg(p)), 'partners', { width: 480, height: 240 });
    await run('UPDATE partners SET logo = ? WHERE id = ?', url, p.id); n++; removeUpload(p.old);
  }
  log(`Đã tạo ${n} ảnh mẫu.`);
  return n;
}

module.exports = { fillMissingImages, avatarSvg, eventSvg, divisionSvg, partnerSvg };

if (require.main === module) {
  (async () => {
    // Chạy độc lập ở môi trường dev: dùng PostgreSQL nhúng nếu chưa có DATABASE_URL
    if (!process.env.DATABASE_URL) {
      const fs = require('fs');
      const path = require('path');
      const cfgFile = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'pg-dev.json');
      if (!fs.existsSync(cfgFile)) throw new Error('Chưa có DATABASE_URL và chưa chạy `npm run dev` lần nào.');
      const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
      process.env.DATABASE_URL = `postgres://postgres:${encodeURIComponent(cfg.password)}@127.0.0.1:${cfg.port}/pickleball`;
    }
    const db = require('../src/db');
    const onlyArg = process.argv.find((a) => a.startsWith('--only='));
    await fillMissingImages({ force: process.argv.includes('--force'), only: onlyArg ? onlyArg.slice(7).split(',') : null });
    await db.close();
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
