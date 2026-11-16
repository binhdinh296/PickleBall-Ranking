// Link đăng ký ngắn gửi cho vận động viên: <tên miền>/<mã giải>/dangky (vd. /hmopen/dangky).
// Trang gọn chỉ có form đăng ký; dùng chung toàn bộ cách kiểm tra/lưu với trang /giai-dau/<slug>/dang-ky.
const express = require('express');
const { all, get } = require('../db');
const fmt = require('../lib/format');
const organizers = require('../lib/organizers');
const { registerView, submitRegistration, regLimiter } = require('./tournaments');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Tìm giải theo mã đơn vị. Mã không tồn tại → 404 như trang thường.
// Giải chưa tạo / chưa được duyệt công khai → trang báo chưa mở đăng ký.
async function loadByCode(req, res, next) {
  const code = String(req.params.code || '');
  if (!organizers.CODE_RE.test(code)) return next('route');
  const org = await get('SELECT id, name, code, event_id FROM organizers WHERE code = ?', code);
  if (!org) return next('route');
  const ev = org.event_id ? await get('SELECT * FROM events WHERE id = ? AND published', org.event_id) : null;
  if (!ev) {
    return res.status(200).render('public/register-pending', { title: 'Đăng ký thi đấu', org, bare: true });
  }
  ev.status = fmt.eventStatus(ev);
  ev.divisions = await all('SELECT * FROM divisions WHERE event_id = ? ORDER BY sort_order, id', ev.id);
  ev.byOrganizer = true;
  req.event = ev;
  res.locals.event = ev;
  req.formAction = `/${code}/dangky`;
  next();
}

router.get('/:code/dangky', wrap(loadByCode), (req, res) => {
  registerView(res, req.event, { values: { division_id: req.query.d } }, { lite: true, formAction: req.formAction });
});

router.post('/:code/dangky', regLimiter, wrap(loadByCode), wrap((req, res) => (
  submitRegistration(req, res, req.event, { lite: true, formAction: req.formAction }))));

module.exports = router;
