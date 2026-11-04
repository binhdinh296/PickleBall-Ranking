const express = require('express');
const { all, get, run } = require('../../db');
const phoneLib = require('../../lib/phone');
const otp = require('../../lib/otp');
const { DEFAULTS, getSettings, saveSettings, isHex } = require('../../lib/settings');
const { upload, saveImage, removeUpload, fileOf } = require('../../lib/upload');
const { verifyCsrf, requireRole, audit, hashPassword, passwordProblem } = require('../../lib/security');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const editor = requireRole('editor');
const admin = requireRole('admin');

// ---- Đối tác ----
router.get('/doi-tac', editor, wrap(async (req, res) => {
  const rows = await all('SELECT * FROM partners ORDER BY sort_order, id');
  res.render('admin/partners', { title: 'Đối tác', rows });
}));

router.post('/doi-tac', editor, upload.any(), verifyCsrf, wrap(async (req, res) => {
  const id = parseInt(req.body.id, 10) || null;
  const name = String(req.body.name || '').trim().slice(0, 100);
  const url = String(req.body.url || '').trim().slice(0, 300);
  if (!name) { req.flash('error', 'Nhập tên đối tác.'); return res.redirect('/admin/doi-tac'); }
  if (url && !/^https?:\/\//.test(url)) { req.flash('error', 'Link phải bắt đầu bằng http:// hoặc https://'); return res.redirect('/admin/doi-tac'); }
  const file = fileOf(req, 'logo');
  const logo = file ? await saveImage(file.buffer, 'partners', { width: 480, height: 240 }) : null;
  const sort = parseInt(req.body.sort_order, 10) || 0;
  const visible = req.body.visible === '1';
  if (id) {
    const old = await get('SELECT logo FROM partners WHERE id = ?', id);
    await run('UPDATE partners SET name = ?, url = ?, logo = COALESCE(?, logo), sort_order = ?, visible = ? WHERE id = ?', name, url || null, logo, sort, visible, id);
    if (logo && old && old.logo) removeUpload(old.logo);
  } else {
    await run('INSERT INTO partners(name, url, logo, sort_order, visible) VALUES (?,?,?,?,?)', name, url || null, logo, sort, visible);
  }
  req.flash('success', 'Đã lưu đối tác.');
  res.redirect('/admin/doi-tac');
}));

router.post('/doi-tac/:id/xoa', editor, wrap(async (req, res) => {
  const p = await get('DELETE FROM partners WHERE id = ? RETURNING logo', parseInt(req.params.id, 10) || 0);
  if (p) removeUpload(p.logo);
  req.flash('success', 'Đã xóa đối tác.');
  res.redirect('/admin/doi-tac');
}));

// ---- Cấu hình ----
router.get('/cau-hinh', admin, (req, res) => {
  res.render('admin/settings', { title: 'Cấu hình', s: getSettings(), error: null, providers: otp.providerNames, defaultPrefixes: phoneLib.prefixesText() });
});

router.post('/cau-hinh', admin, wrap(async (req, res) => {
  const values = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (key === 'otp_enabled') values[key] = req.body.otp_enabled === '1' ? '1' : '0';
    else if (key in req.body) values[key] = String(req.body[key]).slice(0, 3000);
  }
  const fail = (error) => res.status(400).render('admin/settings', { title: 'Cấu hình', s: { ...getSettings(), ...values }, error, providers: otp.providerNames, defaultPrefixes: phoneLib.prefixesText() });
  for (const k of ['color_ball', 'color_court', 'color_gold']) if (!isHex(values[k])) return fail('Màu phải ở dạng #RRGGBB.');
  if (!['dark', 'light'].includes(values.default_theme)) values.default_theme = 'dark';
  if (!otp.providerNames.includes(values.otp_provider)) return fail('Nhà cung cấp OTP không hợp lệ.');
  for (const k of ['facebook_url', 'youtube_url', 'zalo_group_url', 'privacy_url']) {
    if (values[k] && !/^https?:\/\//.test(values[k])) return fail('Các link mạng xã hội/chính sách phải bắt đầu bằng http:// hoặc https://');
  }
  for (const k of ['min_points_male', 'min_points_female', 'newbie_exit_male', 'newbie_exit_female', 'lock_margin', 'featured_count',
    'otp_ttl_seconds', 'otp_cooldown_seconds', 'otp_daily_limit', 'otp_max_attempts']) {
    if (!/^\d{1,6}$/.test(String(values[k] || '').trim())) return fail('Các ngưỡng số phải là số nguyên dương.');
  }
  await saveSettings(values);
  await audit(req, 'settings_update');
  req.flash('success', 'Đã lưu cấu hình.');
  res.redirect('/admin/cau-hinh');
}));

// ---- Tài khoản CMS ----
router.get('/nguoi-dung', admin, wrap(async (req, res) => {
  const rows = await all('SELECT id, username, display_name, role, active, last_login_at, created_at FROM users ORDER BY id');
  res.render('admin/users', { title: 'Tài khoản CMS', rows, error: null, values: {} });
}));

router.post('/nguoi-dung', admin, wrap(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase().slice(0, 40);
  const displayName = String(req.body.display_name || '').trim().slice(0, 80);
  const role = ['admin', 'editor', 'referee'].includes(req.body.role) ? req.body.role : 'editor';
  const fail = async (error) => res.status(400).render('admin/users', {
    title: 'Tài khoản CMS', rows: await all('SELECT id, username, display_name, role, active, last_login_at, created_at FROM users ORDER BY id'),
    error, values: { username, display_name: displayName, role },
  });
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return fail('Tên đăng nhập 3–40 ký tự: chữ thường, số, dấu chấm, gạch.');
  if (!displayName) return fail('Nhập tên hiển thị.');
  const problem = passwordProblem(req.body.password);
  if (problem) return fail(problem);
  if (await get('SELECT 1 FROM users WHERE username = ?', username)) return fail('Tên đăng nhập đã tồn tại.');
  await run('INSERT INTO users(username, display_name, password_hash, role) VALUES (?,?,?,?)', username, displayName, hashPassword(req.body.password), role);
  await audit(req, 'user_create', `user:${username}`, role);
  req.flash('success', `Đã tạo tài khoản ${username}.`);
  res.redirect('/admin/nguoi-dung');
}));

router.post('/nguoi-dung/:id', admin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const target = await get('SELECT * FROM users WHERE id = ?', id);
  if (!target) { req.flash('error', 'Không tìm thấy tài khoản.'); return res.redirect('/admin/nguoi-dung'); }
  const action = req.body.action;
  if (id === req.session.user.id && action !== 'reset') { req.flash('error', 'Không thể tự khóa hoặc đổi vai trò của chính mình.'); return res.redirect('/admin/nguoi-dung'); }
  if (action === 'toggle') {
    await run('UPDATE users SET active = NOT active WHERE id = ?', id);
    if (target.active) await run("DELETE FROM sessions WHERE data->'user'->>'id' = ?", String(id));
  } else if (action === 'role' && ['admin', 'editor', 'referee'].includes(req.body.role)) {
    await run('UPDATE users SET role = ? WHERE id = ?', req.body.role, id);
  } else if (action === 'reset') {
    const problem = passwordProblem(req.body.password);
    if (problem) { req.flash('error', problem); return res.redirect('/admin/nguoi-dung'); }
    await run('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?', hashPassword(req.body.password), id);
    await run("DELETE FROM sessions WHERE data->'user'->>'id' = ? AND sid <> ?", String(id), req.sessionID);
  }
  await audit(req, `user_${action}`, `user:${id}`);
  req.flash('success', 'Đã cập nhật tài khoản.');
  res.redirect('/admin/nguoi-dung');
}));

// ---- Nhật ký ----
router.get('/nhat-ky', admin, wrap(async (req, res) => {
  const rows = await all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 300');
  res.render('admin/audit', { title: 'Nhật ký thao tác', rows });
}));

router.get('/nhat-ky-otp', admin, wrap(async (req, res) => {
  const rows = await all('SELECT id, phone, purpose, provider, provider_status, attempts, verified_at, used_at, created_at FROM otp_requests ORDER BY created_at DESC LIMIT 300');
  rows.forEach((r) => { r.phone = phoneLib.mask(r.phone); });
  const daily = await all(`SELECT to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM') AS day, COUNT(*) AS sent,
    COUNT(verified_at) AS verified FROM otp_requests WHERE created_at > now() - interval '14 days' GROUP BY 1 ORDER BY MIN(created_at) DESC`);
  res.render('admin/otp-log', { title: 'Nhật ký OTP', rows, daily });
}));

module.exports = router;
