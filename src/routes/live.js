const express = require('express');
const { all, get } = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Tất cả buổi đang phát / sắp phát của các giải công khai
router.get('/truc-tiep', wrap(async (req, res) => {
  const streams = await all(`SELECT l.*, e.slug, e.name AS event_name FROM live_streams l JOIN events e ON e.id = l.event_id
    WHERE e.published AND (l.status IN ('live', 'scheduled') OR (l.status = 'ended' AND l.actual_end > now() - interval '7 days'))
    ORDER BY CASE l.status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, l.scheduled_start NULLS LAST, l.id`);
  res.render('public/live-index', { title: 'Trực tiếp', streams });
}));

async function scoreFor(streamId) {
  const s = await get(`SELECT l.*, e.name AS event_name, e.published FROM live_streams l JOIN events e ON e.id = l.event_id WHERE l.id = ?`, streamId);
  if (!s || !s.published) return null;
  const m = await get(`SELECT m.id, m.code, m.round_name, m.score_a, m.score_b, m.status, m.legs, m.current_leg, m.players_a, m.players_b,
      d.name AS division, d.relay_step, ta.name AS team_a, tb.name AS team_b
    FROM matches m JOIN divisions d ON d.id = m.division_id LEFT JOIN teams ta ON ta.id = m.team_a_id LEFT JOIN teams tb ON tb.id = m.team_b_id
    WHERE d.event_id = ? AND m.status = 'live' AND (m.live_stream_id = ? OR (m.live_stream_id IS NULL AND m.court = ?))
    ORDER BY m.updated_at DESC LIMIT 1`, s.event_id, s.id, s.court);
  return {
    stream: { id: s.id, court: s.court, title: s.title, status: s.status, event: s.event_name },
    match: m ? {
      id: m.id, code: m.code, round: m.round_name, division: m.division, status: m.status,
      teamA: m.players_a || m.team_a || '—', teamB: m.players_b || m.team_b || '—',
      scoreA: m.score_a ?? 0, scoreB: m.score_b ?? 0,
      leg: m.legs && m.current_leg ? { index: m.current_leg, pair: m.legs[m.current_leg - 1] || '', target: (m.relay_step || 11) * m.current_leg } : null,
    } : null,
  };
}

// JSON tỉ số cho trang trực tiếp và lớp overlay OBS
router.get('/api/live/:id/score', wrap(async (req, res) => {
  const data = await scoreFor(parseInt(req.params.id, 10) || 0);
  res.set('Cache-Control', 'no-store');
  if (!data) return res.status(404).json({ ok: false });
  res.json({ ok: true, ...data });
}));

// Phiên bản dữ liệu nhánh đấu, để trang tự tải lại khi có thay đổi
router.get('/api/divisions/:id/version', wrap(async (req, res) => {
  const row = await get(`SELECT COALESCE(EXTRACT(EPOCH FROM MAX(m.updated_at)) * 1000, 0)::bigint AS v
    FROM matches m JOIN divisions d ON d.id = m.division_id JOIN events e ON e.id = d.event_id WHERE d.id = ? AND e.published`, parseInt(req.params.id, 10) || 0);
  res.set('Cache-Control', 'no-store');
  res.json({ v: row ? Number(row.v) : 0 });
}));

// Lớp tỉ số nền trong suốt cho OBS (Browser Source)
router.get('/overlay/san/:id', wrap(async (req, res, next) => {
  const data = await scoreFor(parseInt(req.params.id, 10) || 0);
  if (!data) return next();
  res.render('public/overlay', { layout: false, data, style: req.query.kieu === 'doc' ? 'stack' : 'bar' });
}));

module.exports = router;
