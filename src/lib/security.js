const crypto = require('crypto');
const session = require('express-session');
const { get, run } = require('../db');
const { IS_PROD } = require('./env');

// ---- Mật khẩu (scrypt) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function passwordProblem(pw) {
  if (String(pw || '').length < 10) return 'Mật khẩu cần ít nhất 10 ký tự.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Mật khẩu cần có cả chữ và số.';
  return null;
}

// ---- Session lưu trong PostgreSQL ----
class PgStore extends session.Store {
  get(sid, cb) {
    get('SELECT data FROM sessions WHERE sid = ? AND expires > now()', sid)
      .then((row) => cb(null, row ? row.data : null), cb);
  }
  set(sid, sess, cb) {
    const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires) : new Date(Date.now() + 86400000);
    run(`INSERT INTO sessions(sid, data, expires) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`, sid, JSON.stringify(sess), expires)
      .then(() => cb && cb(null), (e) => cb && cb(e));
  }
  destroy(sid, cb) {
    run('DELETE FROM sessions WHERE sid = ?', sid).then(() => cb && cb(null), (e) => cb && cb(e));
  }
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}

function purgeExpired() {
  return run('DELETE FROM sessions WHERE expires < now()').catch(() => {});
}

// ---- CSRF: token gắn theo session ----
function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Form multipart: kiểm tra sau khi multer đọc body (verifyCsrf)
  if (req.is('multipart/form-data')) return next();
  return verifyCsrf(req, res, next);
}

function verifyCsrf(req, res, next) {
  const token = (req.body && req.body.csrf_token) || req.get('x-csrf-token');
  const a = Buffer.from(String(token || ''));
  const b = Buffer.from(String(req.session.csrf || ''));
  if (!token || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    if (req.accepts(['html', 'json']) === 'json' || req.xhr || req.get('x-csrf-token') !== undefined) {
      return res.status(403).json({ ok: false, error: 'Phiên làm việc đã hết hạn, vui lòng tải lại trang.' });
    }
    return res.status(403).render('error', { title: 'Phiên làm việc hết hạn', message: 'Vui lòng tải lại trang và thử lại.' });
  }
  next();
}

// ---- Giới hạn tần suất theo khóa (mặc định theo IP) ----
function rateLimit({ windowMs, max, message = 'Bạn thao tác quá nhanh, vui lòng thử lại sau.', key = (req) => req.ip }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.reset < now) entry = { count: 0, reset: now + windowMs };
    entry.count++;
    hits.set(k, entry);
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      if (req.path.startsWith('/api/') || req.get('x-csrf-token') !== undefined) return res.status(429).json({ ok: false, error: message });
      return res.status(429).render('error', { title: 'Quá nhiều yêu cầu', message });
    }
    next();
  };
}

// Ở dev, bảng test (/dev) cần nhúng chính các trang của site vào khung
const DEV_FRAMING = !IS_PROD && process.env.TEST_PANEL !== '0';

function securityHeaders(req, res, next) {
  const overlay = req.path.startsWith('/overlay/');
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data: blob: https://i.ytimg.com https://*.public.blob.vercel-storage.com",
      "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self' https://cdnjs.cloudflare.com",
      `frame-src ${DEV_FRAMING ? "'self' " : ''}https://www.youtube-nocookie.com https://www.youtube.com`,
      "connect-src 'self'",
      "form-action 'self' https://accounts.google.com",
      // Trang overlay được OBS nhúng làm Browser Source
      overlay ? "frame-ancestors *" : DEV_FRAMING ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    ].join('; '),
  });
  if (!overlay) res.set('X-Frame-Options', DEV_FRAMING ? 'SAMEORIGIN' : 'DENY');
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
}

// ---- Phân quyền CMS ----
const ROLE_RANK = { referee: 1, editor: 2, admin: 3 };

function requireLogin(req, res, next) {
  if (req.session.user) return next();
  if (req.get('x-csrf-token') !== undefined) return res.status(401).json({ ok: false, error: 'Bạn cần đăng nhập lại.' });
  return res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
}

function requireRole(role) {
  return (req, res, next) => {
    const u = req.session.user;
    if (u && ROLE_RANK[u.role] >= ROLE_RANK[role]) return next();
    return res.status(403).render('admin/forbidden', { title: 'Không có quyền' });
  };
}

async function audit(req, action, target, detail) {
  const u = req.session && req.session.user;
  await run('INSERT INTO audit_logs(user_id, username, action, target, detail, ip) VALUES (?,?,?,?,?,?)',
    u ? u.id : null, u ? u.username : null, action, target || null, detail ? String(detail).slice(0, 1000) : null, req.ip).catch(() => {});
}

module.exports = {
  hashPassword, verifyPassword, passwordProblem, PgStore, purgeExpired,
  csrf, verifyCsrf, rateLimit, securityHeaders, requireLogin, requireRole, audit, ROLE_RANK,
};
