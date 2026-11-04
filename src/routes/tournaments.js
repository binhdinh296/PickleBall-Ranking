const express = require('express');
const { all, get, run, tx } = require('../db');
const fmt = require('../lib/format');
const phoneLib = require('../lib/phone');
const otp = require('../lib/otp');
const bracket = require('../lib/bracket');
const { rateLimit } = require('../lib/security');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', wrap(async (req, res) => {
  const events = await all('SELECT * FROM events WHERE published ORDER BY start_date DESC');
  const groups = { ongoing: [], upcoming: [], ended: [] };
  for (const e of events) {
    e.status = fmt.eventStatus(e);
    e.divisionCount = (await get('SELECT COUNT(*) AS c FROM divisions WHERE event_id = ?', e.id)).c;
    e.liveCount = (await get("SELECT COUNT(*) AS c FROM live_streams WHERE event_id = ? AND status = 'live'", e.id)).c;
    groups[e.status].push(e);
  }
  groups.upcoming.reverse();
  const tab = ['ongoing', 'upcoming', 'ended'].includes(req.query.tab) ? req.query.tab
    : groups.ongoing.length ? 'ongoing' : groups.upcoming.length ? 'upcoming' : 'ended';
  res.render('public/tournaments', { title: 'Giải đấu', groups, tab });
}));

async function loadEvent(req, res, next) {
  const ev = await get('SELECT * FROM events WHERE slug = ? AND published', String(req.params.slug || ''));
  if (!ev) return next('route');
  ev.status = fmt.eventStatus(ev);
  ev.divisions = await all('SELECT * FROM divisions WHERE event_id = ? ORDER BY sort_order, id', ev.id);
  ev.streams = await all('SELECT * FROM live_streams WHERE event_id = ? ORDER BY sort_order, court, id', ev.id);
  req.event = ev;
  res.locals.event = ev;
  next();
}

function pickDivision(ev, q) {
  const id = parseInt(q, 10);
  return ev.divisions.find((d) => d.id === id) || ev.divisions[0] || null;
}

router.get('/:slug', wrap(loadEvent), wrap(async (req, res) => {
  const ev = req.event;
  const honors = await all(`SELECT h.* FROM honors h JOIN divisions d ON d.id = h.division_id WHERE d.event_id = ?
    ORDER BY d.sort_order, d.id, h.place, h.sort_order`, ev.id);
  const honorDivisions = ev.divisions.filter((d) => honors.some((h) => h.division_id === d.id))
    .map((d) => ({ ...d, honors: honors.filter((h) => h.division_id === d.id) }));
  res.render('public/event', { title: ev.name, ev, honorDivisions });
}));

// ---- Đăng ký thi đấu ----
function registerView(res, ev, extra) {
  res.render('public/register', {
    title: `Đăng ký – ${ev.name}`, ev, values: {}, error: null, done: false,
    otpEnabled: otp.isEnabled('registration'), ...extra,
  });
}

router.get('/:slug/dang-ky', wrap(loadEvent), (req, res) => registerView(res, req.event, { values: { division_id: req.query.d } }));

const regLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Bạn đã gửi quá nhiều lần, vui lòng thử lại sau 15 phút.' });

router.post('/:slug/dang-ky', regLimiter, wrap(loadEvent), wrap(async (req, res) => {
  const ev = req.event;
  const b = req.body;
  const values = {
    division_id: b.division_id,
    name1: String(b.full_name1 || '').trim().slice(0, 80), phone1: String(b.phone1 || '').trim().slice(0, 20), trinh1: String(b.trinh1 || '').trim().slice(0, 10),
    name2: String(b.full_name2 || '').trim().slice(0, 80), phone2: String(b.phone2 || '').trim().slice(0, 20), trinh2: String(b.trinh2 || '').trim().slice(0, 10),
  };
  const fail = (error) => { res.status(400); registerView(res, ev, { values, error }); };
  if (!ev.registration_open || ev.status === 'ended') return fail('Giải đã đóng đăng ký.');
  const d = ev.divisions.find((x) => x.id === parseInt(values.division_id, 10));
  if (!d) return fail('Vui lòng chọn nội dung thi đấu.');
  if (!values.name1 || !values.name2) return fail('Vui lòng nhập họ tên cả 2 vận động viên.');
  const p1 = phoneLib.validate(values.phone1);
  const p2 = phoneLib.validate(values.phone2);
  if (!p1.ok) return fail(`VĐV 1: ${p1.error}`);
  if (!p2.ok) return fail(`VĐV 2: ${p2.error}`);
  if (p1.phone === p2.phone) return fail('Hai vận động viên không được dùng chung số điện thoại.');
  if (b.consent !== '1') return fail('Bạn cần đồng ý với chính sách xử lý dữ liệu cá nhân.');

  // Có hồ sơ trong hệ thống thì dùng điểm hệ thống, không dùng điểm tự khai
  const a1 = await get('SELECT * FROM athletes WHERE phone = ?', p1.phone);
  const a2 = await get('SELECT * FROM athletes WHERE phone = ?', p2.phone);
  const pts1 = a1 ? a1.points : fmt.parsePoints(values.trinh1);
  const pts2 = a2 ? a2.points : fmt.parsePoints(values.trinh2);
  if (pts1 === null || pts2 === null) return fail('Vui lòng nhập trình độ hợp lệ, ví dụ 3.500.');
  if (d.max_player_points && (pts1 > d.max_player_points || pts2 > d.max_player_points)) {
    return fail(`Trình mỗi VĐV không vượt quá ${fmt.pts(d.max_player_points)}.`);
  }
  if (d.max_total_points && pts1 + pts2 > d.max_total_points) return fail(`Tổng trình 2 VĐV (${fmt.pts(pts1 + pts2)}) vượt mức ${fmt.pts(d.max_total_points)}.`);
  if (d.gender_rule !== 'any' && a1 && a2) {
    const gs = [a1.gender, a2.gender].sort().join('');
    const ok = { male: gs === 'MM', female: gs === 'FF', mixed: gs === 'FM' }[d.gender_rule];
    if (!ok) return fail(`Nội dung này yêu cầu: ${fmt.GENDER_RULE_LABEL[d.gender_rule]}.`);
  }
  if (otp.isEnabled('registration')) {
    try {
      await otp.verify({ phone: p1.phone, purpose: 'registration', code: b.otp_code });
    } catch (err) {
      if (err instanceof otp.OtpError) return fail(err.message);
      throw err;
    }
  }
  const err = await tx(async () => {
    await run('SELECT pg_advisory_xact_lock(?)', d.id);
    const dup = await get(`SELECT 1 FROM registrations WHERE division_id = ? AND status <> 'rejected'
      AND (phone1 IN (?, ?) OR phone2 IN (?, ?))`, d.id, p1.phone, p2.phone, p1.phone, p2.phone);
    if (dup) return 'Một trong hai số điện thoại đã đăng ký nội dung này.';
    if (d.max_teams) {
      const count = (await get("SELECT COUNT(*) AS c FROM registrations WHERE division_id = ? AND status <> 'rejected'", d.id)).c;
      if (count >= d.max_teams) return `Nội dung ${d.name} đã đủ ${d.max_teams} đôi.`;
    }
    await run(`INSERT INTO registrations(division_id, athlete1_id, name1, phone1, points1, athlete2_id, name2, phone2, points2, phone_verified)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, d.id, a1 ? a1.id : null, values.name1, p1.phone, pts1, a2 ? a2.id : null, values.name2, p2.phone, pts2,
    otp.isEnabled('registration'));
    return null;
  });
  if (err) return fail(err);
  registerView(res, ev, { done: true, doneDivision: d });
}));

router.get('/:slug/danh-sach', wrap(loadEvent), wrap(async (req, res) => {
  const ev = req.event;
  const d = pickDivision(ev, req.query.d);
  const regs = d ? await all(`SELECT r.id, r.name1, r.name2, r.athlete1_id, r.athlete2_id, r.points1, r.points2, r.status, r.created_at
    FROM registrations r WHERE r.division_id = ? AND r.status <> 'rejected' ORDER BY r.id`, d.id) : [];
  res.render('public/registrations', { title: `Danh sách đăng ký – ${ev.name}`, ev, d, regs });
}));

router.get('/:slug/nhanh-dau', wrap(loadEvent), wrap(async (req, res) => {
  const ev = req.event;
  const d = pickDivision(ev, req.query.d);
  let data = null;
  if (d) {
    const teams = await bracket.loadTeams(d.id);
    const matches = await bracket.loadMatches(d.id);
    const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]));
    const streams = Object.fromEntries(ev.streams.map((s) => [s.id, s]));
    data = {
      teams, teamMap, matches, streams,
      rounds: bracket.groupRounds(matches),
      table: d.format === 'roundrobin' ? bracket.standings(teams, matches) : null,
      stats: { total: matches.length, live: matches.filter((m) => m.status === 'live').length, done: matches.filter((m) => m.status === 'done').length },
      version: matches.reduce((v, m) => Math.max(v, new Date(m.updated_at).getTime()), 0),
    };
  }
  res.render('public/bracket', { title: `Nhánh đấu – ${ev.name}`, ev, d, data });
}));

router.get('/:slug/truc-tiep', wrap(loadEvent), wrap(async (req, res) => {
  const ev = req.event;
  const sid = parseInt(req.query.san, 10);
  const stream = ev.streams.find((s) => s.id === sid) || ev.streams.find((s) => s.status === 'live') || ev.streams[0] || null;
  let current = null; let upcoming = []; let replays = [];
  if (stream) {
    const base = `SELECT m.*, d.name AS division, ta.name AS team_a, tb.name AS team_b FROM matches m
      JOIN divisions d ON d.id = m.division_id LEFT JOIN teams ta ON ta.id = m.team_a_id LEFT JOIN teams tb ON tb.id = m.team_b_id
      WHERE d.event_id = ? AND (m.live_stream_id = ? OR (m.live_stream_id IS NULL AND m.court = ?))`;
    current = await get(`${base} AND m.status = 'live' ORDER BY m.updated_at DESC LIMIT 1`, ev.id, stream.id, stream.court);
    upcoming = await all(`${base} AND m.status = 'scheduled' AND m.team_a_id IS NOT NULL AND m.team_b_id IS NOT NULL
      ORDER BY m.round_order, m.position LIMIT 4`, ev.id, stream.id, stream.court);
    replays = await all(`${base} AND m.status = 'done' AND m.live_stream_id = ? AND m.video_offset IS NOT NULL
      ORDER BY m.video_offset`, ev.id, stream.id, stream.court, stream.id);
  }
  // Mọi buổi đã kết thúc của giải, để xem lại
  const archives = ev.streams.filter((s) => s.status === 'ended' && s.youtube_video_id);
  res.render('public/live', { title: `Trực tiếp – ${ev.name}`, ev, stream, current, upcoming, replays, archives });
}));

module.exports = router;
