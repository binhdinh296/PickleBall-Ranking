// Đơn vị tổ chức (BTC): truy cập CMS bằng link riêng + OTP, chỉ trong phạm vi đúng 1 giải của mình.
const crypto = require('crypto');
const { get, run } = require('../db');
const { hmac } = require('./crypto');

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 byte ngẫu nhiên, base64url

const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token) => hmac(`organizer-link|${token}`);

// Tìm đơn vị theo mã trong link. kind: 'create' (link tạo giải) | 'manage' (link quản lý)
async function findByToken(token) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  const h = hashToken(token);
  const org = await get('SELECT * FROM organizers WHERE create_token_hash = ? OR manage_token_hash = ?', h, h);
  if (!org) return null;
  return { org, kind: org.create_token_hash === h ? 'create' : 'manage' };
}

const isUsable = (org) => !!org && org.active && (!org.expires_at || new Date(org.expires_at) > new Date());

// Thông tin đặt vào session (cùng chỗ với tài khoản CMS để dùng lại các trang quản lý giải)
function sessionUser(org) {
  return { id: null, organizerId: org.id, eventId: org.event_id, username: `btc-${org.id}`, displayName: org.name, role: 'organizer' };
}

// Tạo (hoặc tạo lại) cặp link: link cũ hết hiệu lực ngay
async function issueTokens(orgId) {
  const create = newToken();
  const manage = newToken();
  await run('UPDATE organizers SET create_token_hash = ?, manage_token_hash = ? WHERE id = ?', hashToken(create), hashToken(manage), orgId);
  return { create, manage };
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
  { re: /^\/noi-dung\/(\d+)\/(?:sua|xoa|dang-ky|dang-ky\.csv|nhanh-dau|doi\/dong-bo|doi|tao-nhanh|tran|xoa-nhanh|vinh-danh|vinh-danh\/goi-y)$/, kind: 'division' },
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

module.exports = { RULES, TOKEN_RE, newToken, hashToken, findByToken, isUsable, sessionUser, issueTokens, endSessions, gate };
