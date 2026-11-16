// Cổng ban tổ chức (BTC): mở link được cấp → vào trang quản lý giải (trong /admin, giới hạn đúng 1 giải).
const express = require('express');
const { get, run } = require('../db');
const organizers = require('../lib/organizers');
const { rateLimit, audit } = require('../lib/security');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow'); // link chứa mã truy cập: không cho máy tìm kiếm lưu
  next();
});

// Giới hạn số lần mở link theo IP
const openLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: 'Bạn mở link quá nhiều lần, vui lòng thử lại sau.' });

function page(res, status, data) {
  res.status(status).render('organizer/access', { title: 'Ban tổ chức', org: null, kind: null, ev: null, step: 'info', error: null, info: null, ...data });
}

// Trang giới thiệu (cũng là trang đích sau khi đăng xuất / hết hạn)
router.get('/', (req, res) => page(res, 200, {}));

// Tìm đơn vị từ link; trả null nếu link sai/đã khoá/hết hạn (đã hiển thị trang báo)
async function resolve(req, res) {
  const org = await organizers.findByToken(req.params.token);
  if (!org) { page(res, 404, { error: 'Link không hợp lệ hoặc đã được thay bằng link mới. Vui lòng liên hệ quản trị viên để nhận link đúng.' }); return null; }
  if (!organizers.isUsable(org)) { page(res, 403, { error: 'Link này đã bị khoá hoặc hết hạn. Vui lòng liên hệ quản trị viên.' }); return null; }
  return { org };
}

// Mở link là vào thẳng: chưa có giải → form tạo giải, đã có → trang quản lý giải (không cần OTP). Bù lại: link dài ngẫu nhiên, có hạn dùng, khoá/tạo lại được, ghi nhật ký.
router.get('/:token', openLimiter, wrap(async (req, res, next) => {
  const r = await resolve(req, res);
  if (!r) return;
  // Đang trong phiên của chính đơn vị này: vào thẳng
  const me = req.session.user;
  if (me && me.role === 'organizer' && me.organizerId === r.org.id) return res.redirect(303, '/admin');
  await run('UPDATE organizers SET last_login_at = now() WHERE id = ?', r.org.id);
  // Phiên mới (chống cố định phiên); thay cho phiên đang có trên trình duyệt này
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.user = organizers.sessionUser(r.org);
    audit(req, 'organizer_login', `organizer:${r.org.id}`);
    req.session.save(() => res.redirect(303, '/admin'));
  });
}));

module.exports = router;
