const express = require('express');
const { all, get, run } = require('../../db');
const { verifyPassword, hashPassword, passwordProblem, requireLogin, rateLimit, audit } = require('../../lib/security');
const fmt = require('../../lib/format');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use((req, res, next) => {
  res.locals.admin = true;
  res.set('Cache-Control', 'no-store');
  next();
});

// ---- Đăng nhập ----
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/admin');
  res.render('admin/login', { title: 'Đăng nhập CMS', error: null, username: '', next: String(req.query.next || '') });
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút.' });

function safeNext(n) {
  return typeof n === 'string' && n.startsWith('/admin') && !n.startsWith('//') ? n : '/admin';
}

router.post('/login', loginLimiter, wrap(async (req, res, nextFn) => {
  const username = String(req.body.username || '').trim().toLowerCase().slice(0, 60);
  const password = String(req.body.password || '');
  const next = safeNext(req.body.next);
  const fail = (error) => res.status(401).render('admin/login', { title: 'Đăng nhập CMS', error, username, next });
  const u = await get('SELECT * FROM users WHERE username = ?', username);
  if (u && u.locked_until && new Date(u.locked_until) > new Date()) {
    return fail('Tài khoản đang tạm khóa do đăng nhập sai nhiều lần. Thử lại sau 15 phút.');
  }
  if (!u || !u.active || !verifyPassword(password, u.password_hash)) {
    if (u) {
      await run(`UPDATE users SET
        locked_until = CASE WHEN failed_logins + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
        failed_logins = CASE WHEN failed_logins + 1 >= 5 THEN 0 ELSE failed_logins + 1 END WHERE id = ?`, u.id);
    }
    return fail('Tên đăng nhập hoặc mật khẩu không đúng.');
  }
  await run('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = ?', u.id);
  const csrfToken = req.session.csrf;
  req.session.regenerate((err) => {
    if (err) return nextFn(err);
    req.session.csrf = csrfToken;
    req.session.user = { id: u.id, username: u.username, displayName: u.display_name, role: u.role };
    audit(req, 'login', `user:${u.id}`);
    req.session.save(() => res.redirect(303, next));
  });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect(303, '/admin/login'));
});

router.use(requireLogin);

// Nạp lại quyền từ CSDL để tài khoản bị khóa/đổi vai trò có hiệu lực ngay
router.use(wrap(async (req, res, next) => {
  const u = await get('SELECT id, username, display_name, role, active FROM users WHERE id = ?', req.session.user.id);
  if (!u || !u.active) return req.session.destroy(() => res.redirect(303, '/admin/login'));
  req.session.user = { id: u.id, username: u.username, displayName: u.display_name, role: u.role };
  res.locals.user = req.session.user;
  res.locals.pendingSubmissions = (await get("SELECT COUNT(*) AS c FROM submissions WHERE status = 'pending'")).c;
  res.locals.newRegistrations = (await get("SELECT COUNT(*) AS c FROM registrations WHERE status = 'new'")).c;
  next();
}));

router.all('/', wrap(async (req, res) => {
  if (req.method === 'POST') return res.redirect(303, '/admin');
  if (req.session.user.role === 'referee') return res.redirect(303, '/admin/trong-tai');
  const stats = {
    athletes: (await get('SELECT COUNT(*) AS c FROM athletes')).c,
    pending: res.locals.pendingSubmissions,
    newRegs: res.locals.newRegistrations,
    liveNow: (await get("SELECT COUNT(*) AS c FROM live_streams WHERE status = 'live'")).c,
  };
  const upcoming = await all("SELECT * FROM events WHERE end_date >= CURRENT_DATE ORDER BY start_date LIMIT 5");
  const todayStreams = await all(`SELECT l.*, e.name AS event_name FROM live_streams l JOIN events e ON e.id = l.event_id
    WHERE l.status <> 'ended' ORDER BY l.scheduled_start NULLS LAST LIMIT 6`);
  const recentSubs = await all("SELECT * FROM submissions WHERE status = 'pending' ORDER BY created_at DESC LIMIT 5");
  res.render('admin/dashboard', { title: 'Tổng quan', stats, upcoming, todayStreams, recentSubs });
}));

router.get('/tai-khoan', (req, res) => res.render('admin/account', { title: 'Tài khoản của tôi', error: null }));

router.post('/tai-khoan', wrap(async (req, res) => {
  const u = await get('SELECT * FROM users WHERE id = ?', req.session.user.id);
  const fail = (error) => res.status(400).render('admin/account', { title: 'Tài khoản của tôi', error });
  if (!verifyPassword(String(req.body.current || ''), u.password_hash)) return fail('Mật khẩu hiện tại không đúng.');
  const problem = passwordProblem(req.body.password);
  if (problem) return fail(problem);
  if (req.body.password !== req.body.password2) return fail('Mật khẩu nhập lại không khớp.');
  await run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(req.body.password), u.id);
  await run("DELETE FROM sessions WHERE data->'user'->>'id' = ? AND sid <> ?", String(u.id), req.sessionID);
  await audit(req, 'change_password', `user:${u.id}`);
  req.flash('success', 'Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.');
  res.redirect('/admin/tai-khoan');
}));

router.use('/', require('./athletes'));
router.use('/', require('./events'));
router.use('/', require('./live'));
router.use('/', require('./system'));

module.exports = router;
module.exports.fmt = fmt;
