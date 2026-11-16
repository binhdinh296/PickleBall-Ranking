// Cổng ban tổ chức (BTC): mở link được cấp → nhận OTP về SĐT của đơn vị → vào trang quản lý giải (trong /admin, giới hạn đúng 1 giải).
const express = require('express');
const { get, run } = require('../db');
const otp = require('../lib/otp');
const phoneLib = require('../lib/phone');
const organizers = require('../lib/organizers');
const { rateLimit, audit } = require('../lib/security');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow'); // link chứa mã truy cập: không cho máy tìm kiếm lưu
  next();
});

// Giới hạn theo IP: mở link, gửi mã, nhập mã
const openLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: 'Bạn mở link quá nhiều lần, vui lòng thử lại sau.' });
const sendLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Bạn đã yêu cầu quá nhiều mã OTP, vui lòng thử lại sau.' });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Bạn nhập mã quá nhiều lần, vui lòng thử lại sau.' });

const KIND_LABEL = { create: 'Link tạo giải đấu', manage: 'Link quản lý giải đấu' };

function page(res, status, data) {
  res.status(status).render('organizer/access', { title: 'Ban tổ chức', org: null, kind: null, ev: null, step: 'info', error: null, info: null, ...data });
}

// Trang giới thiệu (cũng là trang đích sau khi đăng xuất / hết hạn)
router.get('/', (req, res) => page(res, 200, {}));

// Đường dẫn gốc của link đang mở (để form gửi mã / xác minh quay về đúng link)
router.param('token', (req, res, next, token) => {
  res.locals.reqPath = organizers.TOKEN_RE.test(token) ? `/btc/${token}` : '/btc';
  next();
});

// Tìm đơn vị từ link; trả null nếu link sai/đã khoá/hết hạn (đã hiển thị trang báo)
async function resolve(req, res) {
  const found = await organizers.findByToken(req.params.token);
  if (!found) { page(res, 404, { error: 'Link không hợp lệ hoặc đã được thay bằng link mới. Vui lòng liên hệ quản trị viên để nhận link đúng.' }); return null; }
  if (!organizers.isUsable(found.org)) { page(res, 403, { error: 'Link này đã bị khoá hoặc hết hạn. Vui lòng liên hệ quản trị viên.' }); return null; }
  const ev = found.org.event_id ? await get('SELECT id, name, published FROM events WHERE id = ?', found.org.event_id) : null;
  if (found.kind === 'create' && ev) {
    page(res, 200, { org: found.org, kind: found.kind, ev, info: 'Đơn vị của bạn đã tạo giải. Để sửa thông tin, duyệt đăng ký, làm nhánh đấu… hãy dùng link quản lý giải đấu.' });
    return null;
  }
  return { ...found, ev };
}

router.get('/:token', openLimiter, wrap(async (req, res) => {
  const r = await resolve(req, res);
  if (!r) return;
  // Đang trong phiên của chính đơn vị này: vào thẳng
  const me = req.session.user;
  if (me && me.role === 'organizer' && me.organizerId === r.org.id) return res.redirect(303, '/admin');
  page(res, 200, { org: r.org, kind: r.kind, ev: r.ev, step: 'send', masked: phoneLib.mask(r.org.phone) });
}));

router.post('/:token/gui-ma', sendLimiter, wrap(async (req, res) => {
  const r = await resolve(req, res);
  if (!r) return;
  const base = { org: r.org, kind: r.kind, ev: r.ev, masked: phoneLib.mask(r.org.phone) };
  try {
    const sent = await otp.send({ phone: r.org.phone, purpose: 'organizer', ip: req.ip });
    page(res, 200, { ...base, step: 'verify', ttl: sent.ttl, devCode: sent.devCode });
  } catch (err) {
    if (!(err instanceof otp.OtpError)) throw err;
    // Đang trong thời gian chờ gửi lại: vẫn cho nhập mã vừa nhận
    page(res, 400, { ...base, step: err.retryAfter ? 'verify' : 'send', error: err.message });
  }
}));

router.post('/:token/xac-minh', verifyLimiter, wrap(async (req, res, next) => {
  const r = await resolve(req, res);
  if (!r) return;
  try {
    await otp.verify({ phone: r.org.phone, purpose: 'organizer', code: req.body.code });
  } catch (err) {
    if (!(err instanceof otp.OtpError)) throw err;
    return page(res, 400, { org: r.org, kind: r.kind, ev: r.ev, masked: phoneLib.mask(r.org.phone), step: 'verify', error: err.message });
  }
  await run('UPDATE organizers SET last_login_at = now() WHERE id = ?', r.org.id);
  // Phiên mới (chống cố định phiên); thay cho phiên đang có trên trình duyệt này
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.user = organizers.sessionUser(r.org);
    audit(req, 'organizer_login', `organizer:${r.org.id}`, KIND_LABEL[r.kind]);
    req.session.save(() => res.redirect(303, '/admin'));
  });
}));

module.exports = router;
module.exports.KIND_LABEL = KIND_LABEL;
