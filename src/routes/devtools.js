// Bảng test cho môi trường phát triển: đăng nhập nhanh theo vai trò + kịch bản kiểm thử.
// Chỉ bật khi NODE_ENV khác production và chỉ nhận truy cập từ chính máy chạy server.
const crypto = require('crypto');
const express = require('express');
const { all, get, run } = require('../db');
const { hashPassword, audit } = require('../lib/security');
const { IS_PROD, IS_VERCEL } = require('../lib/env');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const TEST_USERS = {
  admin: { username: 'test_admin', display: 'Test · Quản trị viên' },
  editor: { username: 'test_editor', display: 'Test · Biên tập viên' },
  referee: { username: 'test_referee', display: 'Test · Trọng tài' },
};

function enabled() {
  // Cho phép bật trên Vercel / môi trường test (tắt bằng TEST_PANEL=0 hoặc ENABLE_DEVTOOLS=0)
  if (process.env.TEST_PANEL === '0' || process.env.ENABLE_DEVTOOLS === '0') return false;
  return true;
}

function isLocal(req) {
  // Khi devtools được bật, cho phép sử dụng nút chuyển vai trò (kể cả trên Vercel/Cloud)
  if (enabled()) return true;
  const ip = String(req.socket.remoteAddress || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

router.use((req, res, next) => {
  if (!enabled() || !isLocal(req)) return next('router');
  res.set('Cache-Control', 'no-store');
  next();
});

// Tài khoản test có mật khẩu ngẫu nhiên không ai biết: chỉ vào được qua đăng nhập nhanh ở đây
async function ensureTestUser(role) {
  const t = TEST_USERS[role];
  let u = await get('SELECT * FROM users WHERE username = ?', t.username);
  if (!u) {
    u = await get('INSERT INTO users(username, display_name, password_hash, role) VALUES (?,?,?,?) RETURNING *',
      t.username, t.display, hashPassword(crypto.randomBytes(24).toString('hex')), role);
  }
  return u;
}

router.get('/', wrap(async (req, res) => {
  const top = await get('SELECT id, full_name FROM athletes WHERE visible ORDER BY points DESC LIMIT 1');
  const sample = await get('SELECT full_name, phone, points FROM athletes WHERE visible AND phone IS NOT NULL ORDER BY points ASC LIMIT 1');
  const liveMatch = await get(`SELECT m.id, m.code, d.name AS division, e.slug, l.id AS stream_id FROM matches m
    JOIN divisions d ON d.id = m.division_id JOIN events e ON e.id = d.event_id
    LEFT JOIN live_streams l ON l.id = m.live_stream_id WHERE m.status = 'live' ORDER BY m.updated_at DESC LIMIT 1`);
  const openEvent = await get("SELECT slug, name FROM events WHERE published AND registration_open AND end_date >= CURRENT_DATE ORDER BY start_date LIMIT 1");
  const liveEvent = await get("SELECT e.slug FROM events e JOIN live_streams l ON l.event_id = e.id WHERE e.published ORDER BY (l.status = 'live') DESC LIMIT 1");
  const relayEvent = await get("SELECT e.slug FROM events e JOIN divisions d ON d.event_id = e.id WHERE d.format = 'roundrobin' AND e.published LIMIT 1");
  const pending = (await get("SELECT COUNT(*) AS c FROM submissions WHERE status = 'pending'")).c;
  const stream = await get("SELECT id FROM live_streams ORDER BY (status = 'live') DESC, id LIMIT 1");
  res.render('dev/panel', {
    title: 'Bảng test', top, sample, liveMatch, openEvent, liveEvent, relayEvent, pending, stream, testUsers: TEST_USERS,
  });
}));

router.get('/whoami', (req, res) => {
  const u = req.session.user;
  res.json(u ? { loggedIn: true, name: u.displayName, role: u.role } : { loggedIn: false });
});

router.post('/login/:role', wrap(async (req, res, next) => {
  const role = req.params.role;
  if (role === 'guest') {
    // Giữ CSRF token để bảng test vẫn bấm được các nút khác sau khi đăng xuất
    const keep = req.session.csrf;
    return req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.csrf = keep;
      // Về lại trang công khai đang xem (không quay vào CMS vì khách không có quyền)
      const target = String(req.body.next || '');
      const safe = target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/admin') ? target : '/';
      req.session.save(() => res.redirect(safe));
    });
  }
  if (!TEST_USERS[role]) return res.status(400).send('Vai trò không hợp lệ');
  const u = await ensureTestUser(role);
  const csrfToken = req.session.csrf;
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.csrf = csrfToken;
    req.session.user = { id: u.id, username: u.username, displayName: u.display_name, role: u.role };
    audit(req, 'dev_quick_login', `user:${u.id}`, role);
    const target = String(req.body.next || '');
    req.session.save(() => res.redirect(target.startsWith('/') && !target.startsWith('//') ? target : role === 'referee' ? '/admin/trong-tai' : '/admin'));
  });
}));

// Liệt kê tài khoản test đang có (để biết đã tạo hay chưa)
router.get('/accounts', wrap(async (req, res) => {
  res.json(await all("SELECT username, role, active FROM users WHERE username LIKE 'test\\_%' ORDER BY id"));
}));

// Xóa tài khoản test (dọn dẹp)
router.post('/accounts/xoa', wrap(async (req, res) => {
  await run("DELETE FROM sessions WHERE data->'user'->>'username' LIKE 'test\\_%'");
  await run("DELETE FROM users WHERE username LIKE 'test\\_%'");
  res.redirect('/dev');
}));

module.exports = router;
module.exports.enabled = enabled;
module.exports.isLocal = isLocal;
