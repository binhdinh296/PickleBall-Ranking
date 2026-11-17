// Đơn vị tổ chức (BTC): truy cập CMS bằng link riêng (mã ngẫu nhiên 256 bit), chỉ trong phạm vi đúng 1 giải của mình.
const crypto = require('crypto');
const { get, run } = require('../db');
const { hmac } = require('./crypto');

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 byte ngẫu nhiên, base64url

const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token) => hmac(`organizer-link|${token}`);

// Tìm đơn vị theo mã trong link quản lý
async function findByToken(token) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  return get('SELECT * FROM organizers WHERE manage_token_hash = ?', hashToken(token));
}

// ---- Mã ngắn cho link đăng ký công khai /<mã>/dangky ----
const CODE_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
// Không trùng các đường dẫn gốc của website
const RESERVED_CODES = new Set(['admin', 'btc', 'dev', 'static', 'uploads', 'api', 'cron', 'overlay', 'giai-dau', 'xep-hang', 'vdv',
  'cham-trinh', 'truc-tiep', 'doi-tac', 'chinh-sach-quyen-rieng-tu', 'favicon.ico', 'robots.txt', 'sitemap.xml']);

function normalizeCode(v) {
  return String(v || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function codeProblem(code) {
  if (!code) return 'Vui lòng nhập mã giải cho link đăng ký (vd. hmopen).';
  if (!CODE_RE.test(code)) return 'Mã giải chỉ gồm chữ thường không dấu, số và dấu gạch ngang, tối đa 40 ký tự.';
  if (RESERVED_CODES.has(code)) return `Mã "${code}" trùng với một trang có sẵn của website, hãy chọn mã khác.`;
  return null;
}

const isUsable = (org) => !!org && org.active && (!org.expires_at || new Date(org.expires_at) > new Date());

// Thông tin đặt vào session (cùng chỗ với tài khoản CMS để dùng lại các trang quản lý giải)
function sessionUser(org) {
  return { id: null, organizerId: org.id, eventId: org.event_id, username: `btc-${org.id}`, displayName: org.name, role: 'organizer' };
}

// Tạo (hoặc tạo lại) link quản lý: link cũ hết hiệu lực ngay
async function issueToken(orgId) {
  const manage = newToken();
  await run('UPDATE organizers SET manage_token_hash = ? WHERE id = ?', hashToken(manage), orgId);
  return manage;
}

// Đăng xuất mọi phiên BTC của đơn vị (khi khóa, tạo lại link, xoá)
function endSessions(orgId) {
  return run("DELETE FROM sessions WHERE data->'user'->>'role' = 'organizer' AND data->'user'->>'organizerId' = ?", String(orgId));
}

// ---- Phân quyền: BTC chỉ được vào các trang quản lý giải của chính mình (mặc định từ chối) ----
// Đường dẫn tính trong router /admin. So khớp chặt (phân biệt hoa thường, không dấu "/" cuối) — sai lệch nào cũng bị từ chối.
const RULES = [
  { re: /^\/$/, kind: 'home' },
  { re: /^\/giai-dau$/, kind: 'home' },
  { re: /^\/giai-dau\/moi$/, kind: 'create' },
  { re: /^\/giai-dau\/(\d+)(?:\/sua|\/noi-dung\/moi)?$/, kind: 'event' },
  { re: /^\/noi-dung\/(\d+)\/(?:sua|xoa|dang-ky|dang-ky\.csv|dang-ky\/hang-loat|dang-ky\/nhap-nhanh|dang-ky\/nhap-file|dang-ky\/mau\.xlsx|nhanh-dau|doi\/dong-bo|doi|tao-nhanh|tran|xoa-nhanh|vinh-danh|vinh-danh\/goi-y)$/, kind: 'division' },
  { re: /^\/dang-ky\/(\d+)\/(?:trang-thai|xoa)$/, kind: 'registration' },
  { re: /^\/doi\/(\d+)\/xoa$/, kind: 'team' },
  { re: /^\/tran\/(\d+)(?:\/xoa)?$/, kind: 'match' },
  { re: /^\/api\/athletes$/, kind: 'any' }, // tìm VĐV khi nhập vinh danh (thông tin vốn công khai ở bảng xếp hạng)
];

const OWNER_SQL = {
  event: 'SELECT id AS event_id FROM events WHERE id = ?',
  division: 'SELECT event_id FROM divisions WHERE id = ?',
  registration: 'SELECT d.event_id FROM registrations r JOIN divisions d ON d.id = r.division_id WHERE r.id = ?',
  team: 'SELECT d.event_id FROM teams t JOIN divisions d ON d.id = t.division_id WHERE t.id = ?',
  match: 'SELECT d.event_id FROM matches m JOIN divisions d ON d.id = m.division_id WHERE m.id = ?',
};

async function gate(req, res, next) {
  const me = req.session.user;
  const home = me.eventId ? `/admin/giai-dau/${me.eventId}` : '/admin/giai-dau/moi';
  const deny = () => res.status(403).render('admin/forbidden', { title: 'Không có quyền' });
  const rule = RULES.find((r) => r.re.test(req.path));
  if (!rule) return deny();
  if (rule.kind === 'home') return res.redirect(303, home);
  if (rule.kind === 'create') return me.eventId ? res.redirect(303, home) : next();
  if (rule.kind === 'any') return me.eventId ? next() : deny();
  if (!me.eventId) return deny();
  const id = parseInt(req.path.match(rule.re)[1], 10);
  const row = await get(OWNER_SQL[rule.kind], id);
  if (!row) return next(); // không tồn tại → để route trả 404 như bình thường
  if (row.event_id !== me.eventId) return deny();
  return next();
}

module.exports = {
  RULES, TOKEN_RE, CODE_RE, RESERVED_CODES, newToken, hashToken, findByToken, normalizeCode, codeProblem,
  isUsable, sessionUser, issueToken, endSessions, gate,
};
