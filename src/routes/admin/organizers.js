// CMS › Ban tổ chức: quản trị viên tạo đơn vị tổ chức, nhận 2 link:
// - link đăng ký cho VĐV (công khai): /<mã>/dangky
// - link quản trị giải (bí mật): /btc/<mã ngẫu nhiên> — đơn vị dùng để tạo giải rồi quản lý giải
const express = require('express');
const { all, get, run } = require('../../db');
const fmt = require('../../lib/format');
const phoneLib = require('../../lib/phone');
const organizers = require('../../lib/organizers');
const { requireRole, audit } = require('../../lib/security');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const admin = requireRole('admin');

const BASE = '/admin/ban-to-chuc';

async function loadOrg(id) {
  return get(`SELECT o.*, e.name AS event_name, e.slug AS event_slug, e.published AS event_published
    FROM organizers o LEFT JOIN events e ON e.id = o.event_id WHERE o.id = ?`, parseInt(id, 10) || 0);
}

async function readOrg(b, existingId) {
  const data = {
    name: String(b.name || '').trim().slice(0, 150),
    code: organizers.normalizeCode(b.code),
    contact_name: String(b.contact_name || '').trim().slice(0, 100) || null,
    note: String(b.note || '').trim().slice(0, 1000) || null,
    expires_at: String(b.expires_at || '').trim() || null,
  };
  const rawPhone = String(b.phone || '').trim();
  const ph = rawPhone ? phoneLib.validate(rawPhone) : { ok: true, phone: null };
  if (!data.name) return { error: 'Vui lòng nhập tên đơn vị tổ chức.', data: { ...data, phone: rawPhone } };
  const codeErr = organizers.codeProblem(data.code);
  if (codeErr) return { error: codeErr, data: { ...data, phone: rawPhone } };
  if (await get('SELECT 1 FROM organizers WHERE code = ? AND id <> ?', data.code, existingId || 0)) {
    return { error: `Mã "${data.code}" đã được dùng cho đơn vị khác.`, data: { ...data, phone: rawPhone } };
  }
  if (!ph.ok) return { error: `Số điện thoại liên hệ không hợp lệ: ${ph.error}`, data: { ...data, phone: rawPhone } };
  data.phone = ph.phone;
  if (data.expires_at && (!/^\d{4}-\d{2}-\d{2}$/.test(data.expires_at) || data.expires_at < fmt.today())) {
    return { error: 'Ngày hết hạn phải từ hôm nay trở đi (hoặc để trống nếu không giới hạn).', data };
  }
  return { data };
}

// Link chỉ hiện một lần (CSDL chỉ giữ bản băm): giữ tạm trong phiên của quản trị viên, chuyển sang trang xem (tải lại trang không tạo link mới)
function showLinks(req, res, org, manage) {
  req.session.organizerLinks = { orgId: org.id, manage };
  req.session.save(() => res.redirect(303, `${BASE}/${org.id}/link`));
}

router.get('/ban-to-chuc/:id/link', admin, wrap(async (req, res, next) => {
  const org = await loadOrg(req.params.id);
  if (!org) return next();
  const t = req.session.organizerLinks;
  delete req.session.organizerLinks;
  if (!t || t.orgId !== org.id) {
    req.flash('warning', 'Link chỉ hiện một lần ngay sau khi tạo. Bấm "Tạo lại link" nếu cần link mới.');
    return res.redirect(303, BASE);
  }
  const origin = `${req.protocol}://${req.get('host')}`;
  res.render('admin/organizer-links', {
    title: `Link cho ${org.name}`, back: BASE, org,
    registerUrl: `${origin}/${org.code}/dangky`, manageUrl: `${origin}/btc/${t.manage}`,
  });
}));

router.get('/ban-to-chuc', admin, wrap(async (req, res) => {
  const rows = await all(`SELECT o.*, e.name AS event_name, e.slug AS event_slug, e.published AS event_published, e.start_date
    FROM organizers o LEFT JOIN events e ON e.id = o.event_id ORDER BY o.created_at DESC`);
  res.render('admin/organizers', { title: 'Ban tổ chức', rows, error: null, values: {}, origin: `${req.protocol}://${req.get('host')}` });
}));

router.post('/ban-to-chuc', admin, wrap(async (req, res) => {
  const { error, data } = await readOrg(req.body);
  if (error) {
    const rows = await all(`SELECT o.*, e.name AS event_name, e.slug AS event_slug, e.published AS event_published, e.start_date
      FROM organizers o LEFT JOIN events e ON e.id = o.event_id ORDER BY o.created_at DESC`);
    return res.status(400).render('admin/organizers', { title: 'Ban tổ chức', rows, error, values: data, origin: `${req.protocol}://${req.get('host')}` });
  }
  const org = await get(`INSERT INTO organizers(name, code, contact_name, phone, note, expires_at, created_by)
    VALUES (?,?,?,?,?,?,?) RETURNING *`, data.name, data.code, data.contact_name, data.phone, data.note,
  data.expires_at ? `${data.expires_at} 23:59:59+07` : null, req.session.user.id);
  const manage = await organizers.issueToken(org.id);
  await audit(req, 'organizer_create', `organizer:${org.id}`, data.name);
  showLinks(req, res, org, manage);
}));

router.post('/ban-to-chuc/:id/sua', admin, wrap(async (req, res, next) => {
  const org = await loadOrg(req.params.id);
  if (!org) return next();
  const { error, data } = await readOrg(req.body, org.id);
  if (error) { req.flash('error', error); return res.redirect(303, BASE); }
  await run('UPDATE organizers SET name = ?, code = ?, contact_name = ?, phone = ?, note = ?, expires_at = ? WHERE id = ?',
    data.name, data.code, data.contact_name, data.phone, data.note, data.expires_at ? `${data.expires_at} 23:59:59+07` : null, org.id);
  await audit(req, 'organizer_update', `organizer:${org.id}`);
  req.flash('success', `Đã lưu đơn vị "${data.name}".`);
  res.redirect(303, BASE);
}));

// Tạo lại link quản trị: link cũ hết hiệu lực ngay, đơn vị bị đăng xuất (link đăng ký VĐV giữ nguyên)
router.post('/ban-to-chuc/:id/tao-lai-link', admin, wrap(async (req, res, next) => {
  const org = await loadOrg(req.params.id);
  if (!org) return next();
  const manage = await organizers.issueToken(org.id);
  await organizers.endSessions(org.id);
  await audit(req, 'organizer_relink', `organizer:${org.id}`);
  showLinks(req, res, org, manage);
}));

router.post('/ban-to-chuc/:id/khoa', admin, wrap(async (req, res, next) => {
  const org = await loadOrg(req.params.id);
  if (!org) return next();
  const active = req.body.active === '1';
  await run('UPDATE organizers SET active = ? WHERE id = ?', active, org.id);
  if (!active) await organizers.endSessions(org.id);
  await audit(req, active ? 'organizer_unlock' : 'organizer_lock', `organizer:${org.id}`);
  req.flash('success', active ? `Đã mở lại link cho "${org.name}".` : `Đã khoá link của "${org.name}" và đăng xuất đơn vị.`);
  res.redirect(303, BASE);
}));

// Duyệt: đưa giải của đơn vị lên website
router.post('/ban-to-chuc/:id/duyet', admin, wrap(async (req, res, next) => {
  const org = await loadOrg(req.params.id);
  if (!org) return next();
  if (!org.event_id) { req.flash('error', 'Đơn vị chưa tạo giải.'); return res.redirect(303, BASE); }
  const publish = req.body.published === '1';
  await run('UPDATE events SET published = ? WHERE id = ?', publish, org.event_id);
  await audit(req, publish ? 'organizer_event_publish' : 'organizer_event_unpublish', `event:${org.event_id}`, org.name);
  req.flash('success', publish ? `Đã duyệt và công khai giải "${org.event_name}".` : `Đã ẩn giải "${org.event_name}" khỏi website.`);
  res.redirect(303, BASE);
}));

// Xoá đơn vị: giải đã tạo vẫn giữ lại (quản lý tiếp trong mục Giải đấu)
router.post('/ban-to-chuc/:id/xoa', admin, wrap(async (req, res, next) => {
  const org = await loadOrg(req.params.id);
  if (!org) return next();
  await organizers.endSessions(org.id);
  await run('DELETE FROM organizers WHERE id = ?', org.id);
  await audit(req, 'organizer_delete', `organizer:${org.id}`, org.name);
  req.flash('success', `Đã xoá đơn vị "${org.name}". Giải đã tạo (nếu có) vẫn còn trong mục Giải đấu.`);
  res.redirect(303, BASE);
}));

module.exports = router;
