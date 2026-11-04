const express = require('express');
const { all, get, run, tx } = require('../../db');
const fmt = require('../../lib/format');
const phoneLib = require('../../lib/phone');
const points = require('../../lib/points');
const { upload, saveAvatar, removeUpload, fileOf } = require('../../lib/upload');
const { verifyCsrf, requireRole, audit } = require('../../lib/security');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const editor = requireRole('editor');
const PAGE = 20;

// ---- Danh sách VĐV ----
router.get('/vdv', editor, wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const gender = ['M', 'F'].includes(req.query.gender) ? req.query.gender : '';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = ['TRUE'];
  const params = [];
  if (q) { where.push('(full_name ILIKE ? OR nickname ILIKE ? OR phone LIKE ? OR club ILIKE ?)'); const l = `%${q}%`; params.push(l, l, `%${q.replace(/\D/g, '') || q}%`, l); }
  if (gender) { where.push('gender = ?'); params.push(gender); }
  const total = (await get(`SELECT COUNT(*) AS c FROM athletes WHERE ${where.join(' AND ')}`, ...params)).c;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const rows = await all(`SELECT * FROM athletes WHERE ${where.join(' AND ')} ORDER BY points DESC, id LIMIT ? OFFSET ?`,
    ...params, PAGE, (Math.min(page, pages) - 1) * PAGE);
  res.render('admin/athletes', { title: 'Vận động viên', rows, q, gender, page: Math.min(page, pages), pages, total });
}));

function athleteForm(res, a, error) {
  res.render('admin/athlete-form', { title: a.id ? `Sửa VĐV: ${a.full_name}` : 'Thêm VĐV', a, error, lock: a.id ? points.lockPoints(a) : null });
}

router.get('/vdv/moi', editor, (req, res) => athleteForm(res, { gender: 'M', visible: true }, null));

router.get('/vdv/:id', editor, wrap(async (req, res, next) => {
  const a = await get('SELECT * FROM athletes WHERE id = ?', parseInt(req.params.id, 10) || 0);
  if (!a) return next();
  a.history = (await points.history(a.id)).reverse();
  athleteForm(res, a, null);
}));

async function readAthlete(req, existing) {
  const b = req.body;
  const data = {
    full_name: String(b.full_name || '').trim().slice(0, 80),
    nickname: String(b.nickname || '').trim().slice(0, 40) || null,
    gender: b.gender === 'F' ? 'F' : 'M',
    hometown: String(b.hometown || '').trim().slice(0, 80) || null,
    club: String(b.club || '').trim().slice(0, 80) || null,
    description: String(b.description || '').trim().slice(0, 1000) || null,
    featured: b.featured === '1',
    visible: b.visible === '1',
    phone: null,
  };
  if (!data.full_name) return { error: 'Vui lòng nhập họ tên.', data };
  if (String(b.phone || '').trim()) {
    const ph = phoneLib.validate(b.phone);
    if (!ph.ok) return { error: ph.error, data };
    const dup = await get('SELECT id FROM athletes WHERE phone = ? AND id <> ?', ph.phone, existing ? existing.id : 0);
    if (dup) return { error: 'Số điện thoại đã thuộc về VĐV khác.', data };
    data.phone = ph.phone;
  }
  const avatar = await saveAvatar({ dataUrl: b.cropped_avatar_data, file: fileOf(req, 'avatar') });
  if (avatar) data.avatar = avatar;
  return { data };
}

router.post('/vdv/moi', editor, upload.any(), verifyCsrf, wrap(async (req, res) => {
  const { error, data } = await readAthlete(req, null);
  const initial = fmt.parsePoints(req.body.points);
  if (error) return athleteForm(res.status(400), { ...data, points: initial }, error);
  if (initial === null) return athleteForm(res.status(400), data, 'Vui lòng nhập điểm trình khởi tạo.');
  const id = await tx(async () => {
    const row = await get(`INSERT INTO athletes(full_name, nickname, phone, gender, hometown, club, description, avatar, points, peak_points, featured, visible)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`, data.full_name, data.nickname, data.phone, data.gender, data.hometown, data.club,
    data.description, data.avatar || null, initial, initial, data.featured, data.visible);
    await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author) VALUES (?, ?, ?, 'init', 'Khởi tạo', ?)",
      row.id, initial, initial, req.session.user.displayName);
    return row.id;
  });
  await audit(req, 'athlete_create', `athlete:${id}`, data.full_name);
  req.flash('success', 'Đã thêm VĐV.');
  res.redirect(`/admin/vdv/${id}`);
}));

router.post('/vdv/:id', editor, upload.any(), verifyCsrf, wrap(async (req, res, next) => {
  const a = await get('SELECT * FROM athletes WHERE id = ?', parseInt(req.params.id, 10) || 0);
  if (!a) return next();
  const { error, data } = await readAthlete(req, a);
  if (error) {
    a.history = (await points.history(a.id)).reverse();
    return athleteForm(res.status(400), { ...a, ...data }, error);
  }
  await run(`UPDATE athletes SET full_name = ?, nickname = ?, phone = ?, gender = ?, hometown = ?, club = ?, description = ?,
    avatar = COALESCE(?, avatar), featured = ?, visible = ?, updated_at = now() WHERE id = ?`,
  data.full_name, data.nickname, data.phone, data.gender, data.hometown, data.club, data.description, data.avatar || null,
  data.featured, data.visible, a.id);
  if (data.avatar && a.avatar) removeUpload(a.avatar);
  await audit(req, 'athlete_update', `athlete:${a.id}`);
  req.flash('success', 'Đã lưu thông tin VĐV.');
  res.redirect(`/admin/vdv/${a.id}`);
}));

router.post('/vdv/:id/diem', editor, wrap(async (req, res, next) => {
  const a = await get('SELECT * FROM athletes WHERE id = ?', parseInt(req.params.id, 10) || 0);
  if (!a) return next();
  let target;
  if (req.body.mode === 'delta') {
    const sign = String(req.body.delta || '').trim().startsWith('-') ? -1 : 1;
    const d = fmt.parsePoints(String(req.body.delta || '').replace(/^[+-]/, ''));
    if (d === null) { req.flash('error', 'Mức cộng/trừ không hợp lệ.'); return res.redirect(`/admin/vdv/${a.id}`); }
    target = a.points + sign * d;
  } else {
    target = fmt.parsePoints(req.body.points);
  }
  if (target === null || target < 0) { req.flash('error', 'Điểm mới không hợp lệ.'); return res.redirect(`/admin/vdv/${a.id}`); }
  const ignoreLock = req.body.ignore_lock === '1' && req.session.user.role === 'admin';
  const kind = req.body.kind === 'tournament' ? 'tournament' : 'adjust';
  const eventId = parseInt(req.body.event_id, 10) || null;
  const r = await points.changePoints(a.id, target, { kind, note: String(req.body.note || '').trim().slice(0, 300) || null, eventId, author: req.session.user.displayName, ignoreLock });
  await audit(req, 'points_change', `athlete:${a.id}`, `${fmt.pts(a.points)} -> ${fmt.pts(r.athlete.points)}${ignoreLock ? ' (bỏ qua Lock)' : ''}`);
  req.flash(r.clamped ? 'warning' : 'success', r.clamped ? `Điểm không được thấp hơn Lock, đã đặt ở ${fmt.pts(r.athlete.points)}.` : r.changed ? 'Đã cập nhật điểm.' : 'Điểm không thay đổi.');
  res.redirect(`/admin/vdv/${a.id}`);
}));

router.post('/vdv/:id/xoa', requireRole('admin'), wrap(async (req, res) => {
  const a = await get('DELETE FROM athletes WHERE id = ? RETURNING *', parseInt(req.params.id, 10) || 0);
  if (a) { removeUpload(a.avatar); await audit(req, 'athlete_delete', `athlete:${a.id}`, a.full_name); }
  req.flash('success', 'Đã xóa VĐV.');
  res.redirect('/admin/vdv');
}));

// ---- Đơn chấm trình ----
router.get('/don-cham-trinh', editor, wrap(async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const rows = await all('SELECT * FROM submissions WHERE status = ? ORDER BY created_at DESC LIMIT 200', status);
  const counts = Object.fromEntries((await all('SELECT status, COUNT(*) AS c FROM submissions GROUP BY status')).map((r) => [r.status, r.c]));
  res.render('admin/submissions', { title: 'Đơn chấm trình', rows, status, counts });
}));

router.post('/don-cham-trinh/:id/duyet', editor, wrap(async (req, res) => {
  const result = await tx(async () => {
    const s = await get("SELECT * FROM submissions WHERE id = ? AND status = 'pending' FOR UPDATE", parseInt(req.params.id, 10) || 0);
    if (!s) return { error: 'Đơn không tồn tại hoặc đã được xử lý.' };
    if (await get('SELECT 1 FROM athletes WHERE phone = ?', s.phone)) return { error: 'SĐT của đơn đã có VĐV trong hệ thống.' };
    const pts = fmt.parsePoints(req.body.points) ?? s.points;
    const a = await get(`INSERT INTO athletes(full_name, nickname, phone, gender, hometown, club, description, avatar, points, peak_points)
      VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`, s.full_name, s.nickname, s.phone, s.gender, s.hometown, s.club, s.description, s.avatar, pts, pts);
    await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author) VALUES (?, ?, ?, 'init', 'Duyệt đơn tự chấm trình', ?)",
      a.id, pts, pts, req.session.user.displayName);
    await run("UPDATE submissions SET status = 'approved', athlete_id = ?, points = ?, reviewed_by = ?, reviewed_at = now(), admin_note = ? WHERE id = ?",
      a.id, pts, req.session.user.displayName, String(req.body.note || '').trim() || null, s.id);
    return { athleteId: a.id, name: s.full_name };
  });
  if (result.error) { req.flash('error', result.error); return res.redirect('/admin/don-cham-trinh'); }
  await audit(req, 'submission_approve', `athlete:${result.athleteId}`, result.name);
  req.flash('success', `Đã duyệt và tạo VĐV ${result.name}.`);
  res.redirect('/admin/don-cham-trinh');
}));

router.post('/don-cham-trinh/:id/tu-choi', editor, wrap(async (req, res) => {
  const note = String(req.body.note || '').trim().slice(0, 300);
  const s = await get(`UPDATE submissions SET status = 'rejected', reviewed_by = ?, reviewed_at = now(), admin_note = ?
    WHERE id = ? AND status = 'pending' RETURNING id, full_name`, req.session.user.displayName, note || null, parseInt(req.params.id, 10) || 0);
  if (s) await audit(req, 'submission_reject', `submission:${s.id}`, note);
  req.flash(s ? 'success' : 'error', s ? 'Đã từ chối đơn.' : 'Đơn không tồn tại hoặc đã được xử lý.');
  res.redirect('/admin/don-cham-trinh');
}));

module.exports = router;
