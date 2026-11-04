const express = require('express');
const { all, get, run } = require('../db');
const fmt = require('../lib/format');
const phoneLib = require('../lib/phone');
const otp = require('../lib/otp');
const { num, getSettings } = require('../lib/settings');
const points = require('../lib/points');
const { tierFor } = require('../lib/tiers');
const { upload, saveAvatar } = require('../lib/upload');
const { verifyCsrf, rateLimit } = require('../lib/security');

const router = express.Router();
const PAGE_SIZE = 10;
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function featuredEvents(limit) {
  const events = await all('SELECT * FROM events WHERE published ORDER BY featured DESC, start_date DESC LIMIT ?', limit);
  for (const e of events) {
    e.status = fmt.eventStatus(e);
    e.divisionCount = (await get('SELECT COUNT(*) AS c FROM divisions WHERE event_id = ?', e.id)).c;
    e.liveCount = (await get("SELECT COUNT(*) AS c FROM live_streams WHERE event_id = ? AND status = 'live'", e.id)).c;
    e.regCount = (await get('SELECT COUNT(*) AS c FROM registrations r JOIN divisions d ON d.id = r.division_id WHERE d.event_id = ?', e.id)).c;
    const divs = await all('SELECT prizes FROM divisions WHERE event_id = ?', e.id);
    let totalCash = 0;
    for (const d of divs) {
      const list = Array.isArray(d.prizes) ? d.prizes : [];
      for (const p of list) {
        const num = parseInt(String(p.amount || '').replace(/\D/g, ''), 10);
        if (num) totalCash += num;
      }
    }
    e.totalPrize = totalCash ? fmt.money(totalCash) + ' đ' : null;
  }
  return events;
}

router.get('/', wrap(async (req, res) => {
  const athletes = await all('SELECT * FROM athletes WHERE visible ORDER BY featured DESC, points DESC, id LIMIT ?', num('featured_count') || 8);
  athletes.sort((a, b) => b.points - a.points);
  const liveStream = await get(`SELECT l.*, e.slug, e.name AS event_name FROM live_streams l JOIN events e ON e.id = l.event_id
    WHERE e.published AND l.status = 'live' ORDER BY l.actual_start DESC NULLS LAST, l.id LIMIT 1`);
  let liveMatch = null;
  if (liveStream) {
    liveMatch = await get(`SELECT m.*, d.name AS division, ta.name AS team_a, tb.name AS team_b FROM matches m
      JOIN divisions d ON d.id = m.division_id LEFT JOIN teams ta ON ta.id = m.team_a_id LEFT JOIN teams tb ON tb.id = m.team_b_id
      WHERE d.event_id = ? AND m.status = 'live' AND (m.live_stream_id = ? OR m.court = ?) ORDER BY m.updated_at DESC LIMIT 1`,
    liveStream.event_id, liveStream.id, liveStream.court);
  }
  // Chỉ số cho carousel VĐV nổi bật: hạng toàn bảng, Lock, số lần lên bục, thay đổi điểm gần nhất
  for (const a of athletes) {
    a.rank = await points.rankOf(a);
    a.lock = points.lockPoints(a);
    a.podiums = (await get(`SELECT COUNT(*) AS c FROM honors h JOIN divisions d ON d.id = h.division_id JOIN events e ON e.id = d.event_id
      WHERE e.published AND (h.athlete1_id = ? OR h.athlete2_id = ?)`, a.id, a.id)).c;
    const last = await get("SELECT old_points, new_points FROM point_history WHERE athlete_id = ? AND kind <> 'init' ORDER BY created_at DESC, id DESC LIMIT 1", a.id);
    a.lastDelta = last ? last.new_points - last.old_points : 0;
    a.tier = tierFor(a.points);
  }



  res.render('public/home', {
    title: null, athletes, events: await featuredEvents(3), liveStream, liveMatch, pageScript: 'home',
    court: require('../lib/rally').build(),
  });
}));

router.get('/xep-hang', wrap(async (req, res) => {
  const gender = ['M', 'F'].includes(req.query.gender) ? req.query.gender : '';
  const q = String(req.query.q || '').trim().slice(0, 80);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = ['a.visible'];
  const params = [];
  if (gender) { where.push('a.gender = ?'); params.push(gender); }
  if (q) {
    const like = `%${q}%`;
    const g = { nam: 'M', 'nữ': 'F', nu: 'F' }[q.toLowerCase()] || '-';
    where.push('(a.full_name ILIKE ? OR a.nickname ILIKE ? OR a.club ILIKE ? OR a.hometown ILIKE ? OR a.gender = ?)');
    params.push(like, like, like, like, g);
  }
  const whereSql = where.join(' AND ');
  const total = (await get(`SELECT COUNT(*) AS c FROM athletes a WHERE ${whereSql}`, ...params)).c;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(page, pages);
  // Hạng tính trên toàn bảng (theo giới tính nếu đang lọc), không phụ thuộc từ khóa tìm kiếm
  const rows = await all(`SELECT a.*, (SELECT COUNT(*) FROM athletes b WHERE b.visible ${gender ? 'AND b.gender = a.gender' : ''} AND b.points > a.points) + 1 AS rank
    FROM athletes a WHERE ${whereSql} ORDER BY a.points DESC, a.id LIMIT ? OFFSET ?`, ...params, PAGE_SIZE, (cur - 1) * PAGE_SIZE);
  for (const a of rows) a.tier = tierFor(a.points);
  const top = await get(`SELECT * FROM athletes WHERE visible ${gender ? 'AND gender = ?' : ''} ORDER BY points DESC, id LIMIT 1`, ...(gender ? [gender] : []));
  if (top) top.tier = tierFor(top.points);
  res.render('public/ranking', { title: 'Bảng xếp hạng', rows, top, gender, q, page: cur, pages, total });
}));

router.get('/vdv/:id', wrap(async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return next();
  const a = await get('SELECT * FROM athletes WHERE id = ? AND visible', id);
  if (!a) return next();
  const hist = await points.history(a.id);
  const achievements = await all(`SELECT h.place, d.name AS division, e.name AS event, e.slug, e.end_date
    FROM honors h JOIN divisions d ON d.id = h.division_id JOIN events e ON e.id = d.event_id
    WHERE (h.athlete1_id = ? OR h.athlete2_id = ?) AND e.published ORDER BY e.end_date DESC, h.place`, a.id, a.id);
  const matches = await all(`SELECT m.*, d.name AS division, e.name AS event, e.slug,
      ta.name AS team_a, tb.name AS team_b, l.youtube_video_id,
      CASE WHEN ta.athlete1_id = ? OR ta.athlete2_id = ? THEN 'a' ELSE 'b' END AS side
    FROM matches m JOIN divisions d ON d.id = m.division_id JOIN events e ON e.id = d.event_id
    LEFT JOIN teams ta ON ta.id = m.team_a_id LEFT JOIN teams tb ON tb.id = m.team_b_id
    LEFT JOIN live_streams l ON l.id = m.live_stream_id
    WHERE m.status = 'done' AND m.team_a_id IS NOT NULL AND m.team_b_id IS NOT NULL AND e.published
      AND (ta.athlete1_id = ? OR ta.athlete2_id = ? OR tb.athlete1_id = ? OR tb.athlete2_id = ?)
    ORDER BY e.start_date DESC, m.round_order DESC LIMIT 50`, a.id, a.id, a.id, a.id, a.id, a.id);
  res.render('public/athlete', {
    title: a.full_name, a, hist: hist.slice().reverse(), chart: points.chartData(a, hist),
    lock: points.lockPoints(a), rank: await points.rankOf(a), achievements, matches,
    tier: tierFor(a.points),
  });
}));

function submissionView(res, extra) {
  res.render('public/submission', {
    title: 'Tự chấm trình', values: {}, error: null, done: false, otpEnabled: otp.isEnabled('submission'),
    floors: { M: points.genderFloor('M'), F: points.genderFloor('F') }, ...extra,
  });
}

router.get('/cham-trinh', (req, res) => submissionView(res, {}));

const submitLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, message: 'Bạn đã gửi quá nhiều lần, vui lòng thử lại sau 15 phút.' });

router.post('/cham-trinh', submitLimiter, upload.any(), verifyCsrf, wrap(async (req, res) => {
  const b = req.body;
  const values = {
    full_name: String(b.full_name || '').trim().slice(0, 80),
    nickname: String(b.nickname || '').trim().slice(0, 40),
    phone: String(b.phone || '').trim().slice(0, 20),
    gender: b.gender === 'F' ? 'F' : 'M',
    points: String(b.ranking_points || '').trim().slice(0, 10),
    hometown: String(b.hometown || '').trim().slice(0, 80),
    club: String(b.club || '').trim().slice(0, 80),
    description: String(b.description || '').trim().slice(0, 1000),
  };
  const fail = (error) => { res.status(400); submissionView(res, { values, error }); };

  const ph = phoneLib.validate(values.phone);
  const pointsVal = fmt.parsePoints(values.points);
  const floor = points.genderFloor(values.gender);
  if (!values.full_name || !values.hometown || !values.club) return fail('Vui lòng nhập đầy đủ họ tên, quê quán và câu lạc bộ.');
  if (!ph.ok) return fail(ph.error);
  if (pointsVal === null || pointsVal < floor) return fail(`Điểm trình tối thiểu cho VĐV ${fmt.GENDER_LABEL[values.gender]} là ${fmt.pts(floor)}.`);
  if (b.consent !== '1') return fail('Bạn cần đồng ý với chính sách xử lý dữ liệu cá nhân.');
  if (await get('SELECT 1 FROM athletes WHERE phone = ?', ph.phone)) return fail('Số điện thoại này đã có trong hệ thống VĐV. Liên hệ ban tổ chức nếu cần điều chỉnh.');
  if (await get("SELECT 1 FROM submissions WHERE phone = ? AND status = 'pending'", ph.phone)) return fail('Số điện thoại này đã có đơn đang chờ duyệt.');
  if (!b.cropped_avatar_data) return fail('Bạn cần chọn ảnh và bấm "Áp dụng" trước khi gửi đơn.');

  const otpOn = otp.isEnabled('submission');
  if (otpOn) {
    try {
      await otp.verify({ phone: ph.phone, purpose: 'submission', code: b.otp_code });
    } catch (err) {
      if (err instanceof otp.OtpError) return fail(err.message);
      throw err;
    }
  }
  let avatar;
  try {
    avatar = await saveAvatar({ dataUrl: b.cropped_avatar_data });
  } catch (err) {
    if (err.expose) return fail(err.message);
    throw err;
  }
  await run(`INSERT INTO submissions(full_name, nickname, phone, phone_verified, gender, points, hometown, club, description, avatar)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, values.full_name, values.nickname || null, ph.phone, otpOn, values.gender, pointsVal,
  values.hometown, values.club, values.description || null, avatar);
  submissionView(res, { done: true });
}));

router.get('/doi-tac', (req, res) => res.render('public/partners', { title: 'Đối tác đồng hành' }));

router.get('/chinh-sach-quyen-rieng-tu', (req, res) => {
  const url = getSettings().privacy_url;
  if (url && /^https?:\/\//.test(url)) return res.redirect(url);
  res.render('public/privacy', { title: 'Chính sách quyền riêng tư' });
});

// ---- API ----
// Tra cứu VĐV theo SĐT khi đăng ký giải: chỉ trả tên hiển thị + điểm, có giới hạn tần suất
const lookupLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: 'Tra cứu quá nhiều lần, vui lòng thử lại sau.' });
router.get('/api/athlete-lookup', lookupLimiter, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const ph = phoneLib.validate(req.query.phone);
  if (!ph.ok) return res.json({ found: false, valid: false, error: ph.error });
  const a = await get('SELECT full_name, nickname, points, gender FROM athletes WHERE phone = ? AND visible', ph.phone);
  if (!a) return res.json({ found: false, valid: true, carrier: ph.carrier });
  res.json({ found: true, valid: true, carrier: ph.carrier, name: fmt.displayName(a), points: fmt.pts(a.points), gender: a.gender });
}));

const otpIpLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Bạn đã yêu cầu quá nhiều mã OTP, vui lòng thử lại sau.' });
router.post('/api/otp/send', otpIpLimiter, wrap(async (req, res) => {
  const purpose = ['submission', 'registration'].includes(req.body.purpose) ? req.body.purpose : null;
  if (!purpose) return res.status(400).json({ ok: false, error: 'Yêu cầu không hợp lệ.' });
  if (!otp.isEnabled(purpose)) return res.json({ ok: true, disabled: true });
  try {
    const r = await otp.send({ phone: req.body.phone, purpose, ip: req.ip });
    res.json({ ok: true, phone: phoneLib.mask(r.phone), cooldown: r.cooldown, ttl: r.ttl, devCode: r.devCode });
  } catch (err) {
    if (err instanceof otp.OtpError) return res.status(400).json({ ok: false, error: err.message, retryAfter: err.retryAfter });
    throw err;
  }
}));

module.exports = router;
