const express = require('express');
const { all, get, run, tx } = require('../../db');
const fmt = require('../../lib/format');
const phoneLib = require('../../lib/phone');
const bracket = require('../../lib/bracket');
const { upload, saveImage, savePdf, removeUpload, fileOf } = require('../../lib/upload');
const { verifyCsrf, requireRole, audit } = require('../../lib/security');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const editor = requireRole('editor');
const referee = requireRole('referee');
const intOrNull = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

async function loadEvent(id) {
  const ev = await get('SELECT * FROM events WHERE id = ?', parseInt(id, 10) || 0);
  if (!ev) return null;
  ev.status = fmt.eventStatus(ev);
  ev.divisions = await all('SELECT * FROM divisions WHERE event_id = ? ORDER BY sort_order, id', ev.id);
  return ev;
}

async function loadDivision(id) {
  const d = await get('SELECT * FROM divisions WHERE id = ?', parseInt(id, 10) || 0);
  if (!d) return null;
  d.event = await loadEvent(d.event_id);
  return d;
}

// ---- Giải đấu ----
router.get('/giai-dau', editor, wrap(async (req, res) => {
  const rows = await all(`SELECT e.*, (SELECT COUNT(*) FROM divisions d WHERE d.event_id = e.id) AS divisions,
    (SELECT COUNT(*) FROM registrations r JOIN divisions d ON d.id = r.division_id WHERE d.event_id = e.id AND r.status = 'new') AS new_regs
    FROM events e ORDER BY e.start_date DESC`);
  rows.forEach((e) => { e.status = fmt.eventStatus(e); });
  res.render('admin/events', { title: 'Giải đấu', rows });
}));

function eventForm(res, ev, error) {
  res.render('admin/event-form', { title: ev.id ? `Sửa giải: ${ev.name}` : 'Tạo giải đấu', ev, error });
}

router.get('/giai-dau/moi', editor, (req, res) => eventForm(res, { registration_open: true, start_date: fmt.today(), end_date: fmt.today() }, null));

async function readEvent(req, existing) {
  const b = req.body;
  const data = {
    name: String(b.name || '').trim().slice(0, 150),
    slug: fmt.slugify(b.slug || b.name),
    venue: String(b.venue || '').trim().slice(0, 150) || null,
    address: String(b.address || '').trim().slice(0, 200) || null,
    start_date: String(b.start_date || ''),
    end_date: String(b.end_date || ''),
    zalo_link: String(b.zalo_link || '').trim().slice(0, 300) || null,
    description: String(b.description || '').trim().slice(0, 5000) || null,
    registration_open: b.registration_open === '1',
    featured: b.featured === '1',
    published: b.published === '1',
  };
  if (!data.name) return { error: 'Vui lòng nhập tên giải.', data };
  if (!data.slug) return { error: 'Đường dẫn (slug) không hợp lệ.', data };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(data.end_date) || data.end_date < data.start_date) {
    return { error: 'Ngày bắt đầu/kết thúc không hợp lệ.', data };
  }
  if (data.zalo_link && !/^https:\/\//.test(data.zalo_link)) return { error: 'Link nhóm Zalo phải bắt đầu bằng https://', data };
  if (await get('SELECT 1 FROM events WHERE slug = ? AND id <> ?', data.slug, existing ? existing.id : 0)) return { error: 'Đường dẫn (slug) đã được dùng cho giải khác.', data };
  const banner = fileOf(req, 'banner');
  if (banner) data.banner = await saveImage(banner.buffer, 'events', { width: 1600, height: 900 });
  const pdf = fileOf(req, 'regulation_pdf');
  if (pdf) data.regulation_pdf = await savePdf(pdf);
  return { data };
}

router.post('/giai-dau/moi', editor, upload.any(), verifyCsrf, wrap(async (req, res) => {
  const { error, data } = await readEvent(req, null);
  if (error) return eventForm(res.status(400), data, error);
  const row = await get(`INSERT INTO events(slug, name, venue, address, start_date, end_date, banner, regulation_pdf, zalo_link, description,
    registration_open, featured, published) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
  data.slug, data.name, data.venue, data.address, data.start_date, data.end_date, data.banner || null, data.regulation_pdf || null,
  data.zalo_link, data.description, data.registration_open, data.featured, data.published);
  await audit(req, 'event_create', `event:${row.id}`, data.name);
  req.flash('success', 'Đã tạo giải. Tiếp theo: thêm nội dung thi đấu.');
  res.redirect(`/admin/giai-dau/${row.id}`);
}));

router.get('/giai-dau/:id', editor, wrap(async (req, res, next) => {
  const ev = await loadEvent(req.params.id);
  if (!ev) return next();
  for (const d of ev.divisions) {
    const c = await get(`SELECT COUNT(*) FILTER (WHERE status = 'new') AS new, COUNT(*) FILTER (WHERE status = 'approved') AS approved,
      (SELECT COUNT(*) FROM matches m WHERE m.division_id = ?) AS matches FROM registrations WHERE division_id = ?`, d.id, d.id);
    Object.assign(d, { newRegs: c.new, approvedRegs: c.approved, matchCount: c.matches });
  }
  res.render('admin/event', { title: ev.name, ev });
}));

router.get('/giai-dau/:id/sua', editor, wrap(async (req, res, next) => {
  const ev = await loadEvent(req.params.id);
  if (!ev) return next();
  eventForm(res, ev, null);
}));

router.post('/giai-dau/:id/sua', editor, upload.any(), verifyCsrf, wrap(async (req, res, next) => {
  const ev = await loadEvent(req.params.id);
  if (!ev) return next();
  const { error, data } = await readEvent(req, ev);
  if (error) return eventForm(res.status(400), { ...ev, ...data }, error);
  await run(`UPDATE events SET slug = ?, name = ?, venue = ?, address = ?, start_date = ?, end_date = ?, banner = COALESCE(?, banner),
    regulation_pdf = COALESCE(?, regulation_pdf), zalo_link = ?, description = ?, registration_open = ?, featured = ?, published = ? WHERE id = ?`,
  data.slug, data.name, data.venue, data.address, data.start_date, data.end_date, data.banner || null, data.regulation_pdf || null,
  data.zalo_link, data.description, data.registration_open, data.featured, data.published, ev.id);
  if (data.banner && ev.banner) removeUpload(ev.banner);
  if (data.regulation_pdf && ev.regulation_pdf) removeUpload(ev.regulation_pdf);
  await audit(req, 'event_update', `event:${ev.id}`);
  req.flash('success', 'Đã lưu giải đấu.');
  res.redirect(`/admin/giai-dau/${ev.id}`);
}));

router.post('/giai-dau/:id/xoa', requireRole('admin'), wrap(async (req, res) => {
  const ev = await get('DELETE FROM events WHERE id = ? RETURNING *', parseInt(req.params.id, 10) || 0);
  if (ev) { removeUpload(ev.banner); removeUpload(ev.regulation_pdf); await audit(req, 'event_delete', `event:${ev.id}`, ev.name); }
  req.flash('success', 'Đã xóa giải.');
  res.redirect('/admin/giai-dau');
}));

// ---- Nội dung thi đấu ----
function divisionForm(res, ev, d, error) {
  res.render('admin/division-form', { title: d.id ? `Sửa nội dung: ${d.name}` : 'Thêm nội dung thi đấu', ev, d, error });
}

function readPrizes(b) {
  const labels = [].concat(b.prize_label || []);
  const amounts = [].concat(b.prize_amount || []);
  return labels.map((l, i) => ({ label: String(l).trim().slice(0, 60), amount: String(amounts[i] || '').trim().slice(0, 40) }))
    .filter((p) => p.label);
}

async function readDivision(req) {
  const b = req.body;
  const data = {
    name: String(b.name || '').trim().slice(0, 100),
    subtitle: String(b.subtitle || '').trim().slice(0, 100) || null,
    team_type: b.team_type === 'team' ? 'team' : 'pair',
    format: b.format === 'roundrobin' ? 'roundrobin' : 'knockout',
    max_teams: intOrNull(b.max_teams),
    max_total_points: fmt.parsePoints(b.max_total_points),
    max_player_points: fmt.parsePoints(b.max_player_points),
    gender_rule: ['any', 'male', 'female', 'mixed'].includes(b.gender_rule) ? b.gender_rule : 'any',
    prizes: JSON.stringify(readPrizes(b)),
    relay_legs: Math.max(0, Math.min(15, intOrNull(b.relay_legs) || 0)),
    relay_step: Math.max(1, Math.min(50, intOrNull(b.relay_step) || 11)),
    sort_order: intOrNull(b.sort_order) || 0,
  };
  if (!data.name) return { error: 'Vui lòng nhập tên nội dung.', data };
  const banner = fileOf(req, 'banner');
  if (banner) data.banner = await saveImage(banner.buffer, 'divisions', { width: 800, height: 400 });
  return { data };
}

router.get('/giai-dau/:id/noi-dung/moi', editor, wrap(async (req, res, next) => {
  const ev = await loadEvent(req.params.id);
  if (!ev) return next();
  divisionForm(res, ev, { prizes: [{ label: 'Vô địch', amount: '' }, { label: 'Á quân', amount: '' }, { label: '02 Giải ba', amount: '' }], relay_step: 11 }, null);
}));

router.post('/giai-dau/:id/noi-dung/moi', editor, upload.any(), verifyCsrf, wrap(async (req, res, next) => {
  const ev = await loadEvent(req.params.id);
  if (!ev) return next();
  const { error, data } = await readDivision(req);
  if (error) return divisionForm(res.status(400), ev, { ...data, prizes: JSON.parse(data.prizes) }, error);
  await run(`INSERT INTO divisions(event_id, name, subtitle, banner, team_type, format, max_teams, max_total_points, max_player_points,
    gender_rule, prizes, relay_legs, relay_step, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ev.id, data.name, data.subtitle, data.banner || null, data.team_type, data.format, data.max_teams, data.max_total_points,
  data.max_player_points, data.gender_rule, data.prizes, data.relay_legs, data.relay_step, data.sort_order);
  req.flash('success', 'Đã thêm nội dung thi đấu.');
  res.redirect(`/admin/giai-dau/${ev.id}`);
}));

router.get('/noi-dung/:id/sua', editor, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  divisionForm(res, d.event, d, null);
}));

router.post('/noi-dung/:id/sua', editor, upload.any(), verifyCsrf, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const { error, data } = await readDivision(req);
  if (error) return divisionForm(res.status(400), d.event, { ...d, ...data, prizes: JSON.parse(data.prizes) }, error);
  await run(`UPDATE divisions SET name = ?, subtitle = ?, banner = COALESCE(?, banner), team_type = ?, format = ?, max_teams = ?,
    max_total_points = ?, max_player_points = ?, gender_rule = ?, prizes = ?, relay_legs = ?, relay_step = ?, sort_order = ? WHERE id = ?`,
  data.name, data.subtitle, data.banner || null, data.team_type, data.format, data.max_teams, data.max_total_points, data.max_player_points,
  data.gender_rule, data.prizes, data.relay_legs, data.relay_step, data.sort_order, d.id);
  if (data.banner && d.banner) removeUpload(d.banner);
  req.flash('success', 'Đã lưu nội dung thi đấu.');
  res.redirect(`/admin/giai-dau/${d.event_id}`);
}));

router.post('/noi-dung/:id/xoa', editor, wrap(async (req, res) => {
  const d = await get('DELETE FROM divisions WHERE id = ? RETURNING *', parseInt(req.params.id, 10) || 0);
  if (d) { removeUpload(d.banner); await audit(req, 'division_delete', `division:${d.id}`, d.name); }
  req.flash('success', 'Đã xóa nội dung.');
  res.redirect(d ? `/admin/giai-dau/${d.event_id}` : '/admin/giai-dau');
}));

// ---- Đăng ký ----
router.get('/noi-dung/:id/dang-ky', editor, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const status = ['new', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : '';
  const regs = await all(`SELECT * FROM registrations WHERE division_id = ? ${status ? 'AND status = ?' : ''} ORDER BY id`, d.id, ...(status ? [status] : []));
  res.render('admin/registrations', { title: `Đăng ký: ${d.name}`, d, regs, status, error: null, values: {} });
}));

router.get('/noi-dung/:id/dang-ky.csv', editor, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const regs = await all('SELECT * FROM registrations WHERE division_id = ? ORDER BY id', d.id);
  const esc = (v) => { const s = String(v ?? ''); return /^[=+\-@]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : `"${s.replace(/"/g, '""')}"`; };
  const lines = [['STT', 'VĐV 1', 'SĐT 1', 'Trình 1', 'VĐV 2', 'SĐT 2', 'Trình 2', 'Tổng trình', 'Trạng thái', 'Thời gian'].map(esc).join(',')];
  regs.forEach((r, i) => lines.push([i + 1, r.name1, r.phone1, fmt.pts(r.points1), r.name2, r.phone2, fmt.pts(r.points2),
    fmt.pts(r.points1 + r.points2), fmt.REG_STATUS_LABEL[r.status], fmt.dateTimeVN(r.created_at)].map(esc).join(',')));
  await audit(req, 'registrations_export', `division:${d.id}`);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="dang-ky-${fmt.slugify(d.name)}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
}));

router.post('/noi-dung/:id/dang-ky', editor, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const b = req.body;
  const p1 = phoneLib.validate(b.phone1);
  const p2 = phoneLib.validate(b.phone2);
  const pts1 = fmt.parsePoints(b.points1);
  const pts2 = fmt.parsePoints(b.points2);
  const name1 = String(b.name1 || '').trim().slice(0, 80);
  const name2 = String(b.name2 || '').trim().slice(0, 80);
  let error = null;
  if (!name1 || !name2) error = 'Nhập họ tên 2 VĐV.';
  else if (!p1.ok || !p2.ok) error = `SĐT không hợp lệ: ${(p1.ok ? p2 : p1).error}`;
  else if (pts1 === null || pts2 === null) error = 'Trình độ không hợp lệ.';
  if (error) {
    const regs = await all('SELECT * FROM registrations WHERE division_id = ? ORDER BY id', d.id);
    return res.status(400).render('admin/registrations', { title: `Đăng ký: ${d.name}`, d, regs, status: '', error, values: b });
  }
  const a1 = await get('SELECT id, points FROM athletes WHERE phone = ?', p1.phone);
  const a2 = await get('SELECT id, points FROM athletes WHERE phone = ?', p2.phone);
  await run(`INSERT INTO registrations(division_id, athlete1_id, name1, phone1, points1, athlete2_id, name2, phone2, points2, status, admin_note)
    VALUES (?,?,?,?,?,?,?,?,?,'approved','Thêm thủ công')`, d.id, a1 ? a1.id : null, name1, p1.phone, a1 ? a1.points : pts1,
  a2 ? a2.id : null, name2, p2.phone, a2 ? a2.points : pts2);
  await audit(req, 'registration_manual', `division:${d.id}`, `${name1} / ${name2}`);
  req.flash('success', 'Đã thêm đăng ký (đã duyệt).');
  res.redirect(`/admin/noi-dung/${d.id}/dang-ky`);
}));

router.post('/dang-ky/:id/trang-thai', editor, wrap(async (req, res) => {
  const status = ['new', 'approved', 'rejected'].includes(req.body.status) ? req.body.status : null;
  const r = await get('SELECT * FROM registrations WHERE id = ?', parseInt(req.params.id, 10) || 0);
  if (!r || !status) { req.flash('error', 'Yêu cầu không hợp lệ.'); return res.redirect('/admin/giai-dau'); }
  await run('UPDATE registrations SET status = ?, admin_note = COALESCE(?, admin_note) WHERE id = ?', status, String(req.body.note || '').trim() || null, r.id);
  await audit(req, 'registration_status', `registration:${r.id}`, status);
  req.flash('success', `Đã chuyển sang "${fmt.REG_STATUS_LABEL[status]}".`);
  res.redirect(`/admin/noi-dung/${r.division_id}/dang-ky`);
}));

router.post('/dang-ky/:id/xoa', editor, wrap(async (req, res) => {
  const r = await get('DELETE FROM registrations WHERE id = ? RETURNING division_id', parseInt(req.params.id, 10) || 0);
  await audit(req, 'registration_delete', `registration:${req.params.id}`);
  req.flash('success', 'Đã xóa đăng ký.');
  res.redirect(r ? `/admin/noi-dung/${r.division_id}/dang-ky` : '/admin/giai-dau');
}));

// ---- Nhánh đấu ----
router.get('/noi-dung/:id/nhanh-dau', editor, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const teams = await bracket.loadTeams(d.id);
  const matches = await bracket.loadMatches(d.id);
  const streams = await all('SELECT id, court, title FROM live_streams WHERE event_id = ? ORDER BY sort_order, court', d.event_id);
  const pendingRegs = (await get(`SELECT COUNT(*) AS c FROM registrations r WHERE r.division_id = ? AND r.status = 'approved'
    AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.registration_id = r.id)`, d.id)).c;
  res.render('admin/bracket', {
    title: `Nhánh đấu: ${d.name}`, d, teams, matches, rounds: bracket.groupRounds(matches), pendingRegs, streams,
    teamMap: Object.fromEntries(teams.map((t) => [t.id, t])),
    table: d.format === 'roundrobin' ? bracket.standings(teams, matches) : null,
  });
}));

router.post('/noi-dung/:id/doi/dong-bo', editor, wrap(async (req, res) => {
  const n = await bracket.syncTeamsFromRegistrations(parseInt(req.params.id, 10) || 0);
  req.flash('success', n ? `Đã tạo ${n} đội từ đăng ký đã duyệt.` : 'Không có đăng ký mới để tạo đội.');
  res.redirect(`/admin/noi-dung/${req.params.id}/nhanh-dau`);
}));

router.post('/noi-dung/:id/doi', editor, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const name = String(req.body.name || '').trim().slice(0, 120);
  if (!name) { req.flash('error', 'Nhập tên đội.'); return res.redirect(`/admin/noi-dung/${d.id}/nhanh-dau`); }
  await run('INSERT INTO teams(division_id, name, members, seed) VALUES (?,?,?,?)', d.id, name,
    String(req.body.members || '').trim().slice(0, 2000) || null, intOrNull(req.body.seed));
  req.flash('success', 'Đã thêm đội.');
  res.redirect(`/admin/noi-dung/${d.id}/nhanh-dau`);
}));

router.post('/doi/:id/xoa', editor, wrap(async (req, res) => {
  const t = await get('DELETE FROM teams WHERE id = ? RETURNING division_id', parseInt(req.params.id, 10) || 0);
  req.flash('success', 'Đã xóa đội.');
  res.redirect(t ? `/admin/noi-dung/${t.division_id}/nhanh-dau` : '/admin/giai-dau');
}));

router.post('/noi-dung/:id/tao-nhanh', editor, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const randomize = req.body.randomize === '1';
  const n = d.format === 'roundrobin'
    ? await bracket.generateRoundRobin(d.id, { randomize, relayLegs: d.relay_legs })
    : await bracket.generateKnockout(d.id, { randomize });
  await audit(req, 'bracket_generate', `division:${d.id}`, `${d.format} ${n} trận`);
  req.flash('success', `Đã tạo ${n} trận.`);
  res.redirect(`/admin/noi-dung/${d.id}/nhanh-dau`);
}));

router.post('/noi-dung/:id/tran', editor, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const round = Math.max(1, intOrNull(req.body.round_order) || 1);
  const pos = ((await get('SELECT MAX(position) AS p FROM matches WHERE division_id = ? AND round_order = ?', d.id, round)).p || 0) + 1;
  await run('INSERT INTO matches(division_id, round_order, round_name, position, code, team_a_id, team_b_id) VALUES (?,?,?,?,?,?,?)',
    d.id, round, String(req.body.round_name || `Vòng ${round}`).trim().slice(0, 40), pos,
    String(req.body.code || '').trim().slice(0, 20) || null, intOrNull(req.body.team_a_id), intOrNull(req.body.team_b_id));
  req.flash('success', 'Đã thêm trận.');
  res.redirect(`/admin/noi-dung/${d.id}/nhanh-dau`);
}));

router.post('/noi-dung/:id/xoa-nhanh', editor, wrap(async (req, res) => {
  await run('DELETE FROM matches WHERE division_id = ?', parseInt(req.params.id, 10) || 0);
  await audit(req, 'bracket_clear', `division:${req.params.id}`);
  req.flash('success', 'Đã xóa toàn bộ trận.');
  res.redirect(`/admin/noi-dung/${req.params.id}/nhanh-dau`);
}));

// ---- Trọng tài: danh sách trận + nhập tỉ số tại sân ----
router.all('/trong-tai', referee, wrap(async (req, res) => {
  if (req.method === 'POST') return res.redirect(303, '/admin/trong-tai');
  const matches = await all(`SELECT m.*, d.name AS division, e.name AS event_name, ta.name AS team_a, tb.name AS team_b
    FROM matches m JOIN divisions d ON d.id = m.division_id JOIN events e ON e.id = d.event_id
    LEFT JOIN teams ta ON ta.id = m.team_a_id LEFT JOIN teams tb ON tb.id = m.team_b_id
    WHERE e.end_date >= CURRENT_DATE - 1 AND m.status <> 'done' AND m.team_a_id IS NOT NULL AND m.team_b_id IS NOT NULL
    ORDER BY CASE m.status WHEN 'live' THEN 0 ELSE 1 END, e.start_date, d.sort_order, m.round_order, m.position LIMIT 100`);
  res.render('admin/referee', { title: 'Trọng tài', matches });
}));

async function loadMatch(id) {
  const m = await get(`SELECT m.*, d.name AS division, d.format, d.relay_step, d.event_id, ta.name AS team_a, tb.name AS team_b
    FROM matches m JOIN divisions d ON d.id = m.division_id LEFT JOIN teams ta ON ta.id = m.team_a_id LEFT JOIN teams tb ON tb.id = m.team_b_id
    WHERE m.id = ?`, parseInt(id, 10) || 0);
  return m;
}

router.get('/tran/:id', referee, wrap(async (req, res, next) => {
  const m = await loadMatch(req.params.id);
  if (!m) return next();
  const teams = await bracket.loadTeams(m.division_id);
  const streams = await all('SELECT id, court, title, status, actual_start FROM live_streams WHERE event_id = ? ORDER BY sort_order, court', m.event_id);
  res.render('admin/match', { title: `Trận ${m.code || ''} · ${m.division}`, m, teams, streams });
}));

function readMatch(b, isEditor) {
  const data = {};
  const score = (v) => (v === '' || v === undefined ? null : Math.max(0, Math.min(999, parseInt(v, 10) || 0)));
  if ('score_a' in b) data.score_a = score(b.score_a);
  if ('score_b' in b) data.score_b = score(b.score_b);
  if (['scheduled', 'live', 'done'].includes(b.status)) data.status = b.status;
  if ('court' in b) data.court = String(b.court || '').trim().slice(0, 30) || null;
  if ('current_leg' in b) data.current_leg = intOrNull(b.current_leg);
  if ('players_a' in b) data.players_a = String(b.players_a || '').trim().slice(0, 120) || null;
  if ('players_b' in b) data.players_b = String(b.players_b || '').trim().slice(0, 120) || null;
  if ('live_stream_id' in b) data.live_stream_id = intOrNull(b.live_stream_id);
  if ('video_offset' in b) {
    const parts = String(b.video_offset || '').trim().split(':').map((x) => parseInt(x, 10));
    data.video_offset = parts.length && parts.every(Number.isFinite) ? parts.reduce((s, x) => s * 60 + x, 0) : null;
  }
  if (b.legs !== undefined) data.legs = [].concat(b.legs).map((x) => String(x).trim().toUpperCase().slice(0, 4));
  if (isEditor) {
    if ('team_a_id' in b) data.team_a_id = intOrNull(b.team_a_id);
    if ('team_b_id' in b) data.team_b_id = intOrNull(b.team_b_id);
    if ('code' in b) data.code = String(b.code || '').trim().slice(0, 20) || null;
    if ('round_name' in b) data.round_name = String(b.round_name || '').trim().slice(0, 40) || 'Vòng';
  }
  return data;
}

router.post('/tran/:id', referee, wrap(async (req, res, next) => {
  const m = await loadMatch(req.params.id);
  if (!m) return next();
  const isEditor = ['admin', 'editor'].includes(req.session.user.role);
  const data = readMatch(req.body, isEditor);
  // Bấm "Bắt đầu" lần đầu khi sân đang phát: tự ghi mốc giây trong video để xem lại
  if (data.status === 'live' && m.status !== 'live' && m.video_offset === null && !('video_offset' in req.body)) {
    const s = await get("SELECT * FROM live_streams WHERE id = ? AND status = 'live' AND actual_start IS NOT NULL",
      data.live_stream_id ?? m.live_stream_id ?? 0);
    if (s) data.video_offset = Math.max(0, Math.round((Date.now() - new Date(s.actual_start).getTime()) / 1000));
  }
  await bracket.updateMatch(m.id, data);
  if (data.status && data.status !== m.status) await audit(req, 'match_status', `match:${m.id}`, data.status);
  if (req.get('x-csrf-token') !== undefined) {
    const fresh = await loadMatch(m.id);
    return res.json({ ok: true, score_a: fresh.score_a, score_b: fresh.score_b, status: fresh.status, current_leg: fresh.current_leg });
  }
  req.flash('success', 'Đã lưu trận.');
  res.redirect(req.body.back === 'bracket' && isEditor ? `/admin/noi-dung/${m.division_id}/nhanh-dau` : `/admin/tran/${m.id}`);
}));

router.post('/tran/:id/xoa', editor, wrap(async (req, res) => {
  const m = await get('DELETE FROM matches WHERE id = ? RETURNING division_id', parseInt(req.params.id, 10) || 0);
  req.flash('success', 'Đã xóa trận.');
  res.redirect(m ? `/admin/noi-dung/${m.division_id}/nhanh-dau` : '/admin/giai-dau');
}));

// ---- Vinh danh ----
router.get('/noi-dung/:id/vinh-danh', editor, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const honors = await all('SELECT * FROM honors WHERE division_id = ? ORDER BY place, sort_order', d.id);
  const slots = [1, 2, 3, 3].map((place, i) => honors.filter((h) => h.place === place)[place === 3 ? i - 2 : 0] || { place });
  res.render('admin/honors', { title: `Vinh danh: ${d.name}`, d, slots, suggestion: null });
}));

router.post('/noi-dung/:id/vinh-danh/goi-y', editor, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const sug = await bracket.suggestHonors(d.id);
  if (!sug.length) { req.flash('warning', 'Nhánh đấu chưa có kết quả chung kết/bán kết để gợi ý.'); return res.redirect(`/admin/noi-dung/${d.id}/vinh-danh`); }
  const athletes = async (t) => ({
    a1: t.athlete1_id ? await get('SELECT id, full_name, nickname FROM athletes WHERE id = ?', t.athlete1_id) : null,
    a2: t.athlete2_id ? await get('SELECT id, full_name, nickname FROM athletes WHERE id = ?', t.athlete2_id) : null,
  });
  const slots = [];
  for (const s of sug) {
    const { a1, a2 } = await athletes(s.team);
    const [n1, n2] = s.team.name.split(' / ');
    slots.push({ place: s.place, name1: a1 ? fmt.displayName(a1) : n1, athlete1_id: a1 ? a1.id : null, name2: a2 ? fmt.displayName(a2) : (n2 || ''), athlete2_id: a2 ? a2.id : null });
  }
  while (slots.length < 4) slots.push({ place: slots.length < 2 ? slots.length + 1 : 3 });
  res.render('admin/honors', { title: `Vinh danh: ${d.name}`, d, slots, suggestion: true });
}));

router.post('/noi-dung/:id/vinh-danh', editor, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const b = req.body;
  const places = [].concat(b.place || []);
  await tx(async () => {
    await run('DELETE FROM honors WHERE division_id = ?', d.id);
    for (let i = 0; i < places.length; i++) {
      const name1 = String([].concat(b.name1 || [])[i] || '').trim().slice(0, 80);
      if (!name1) continue;
      const a1 = intOrNull([].concat(b.athlete1_id || [])[i]);
      const a2 = intOrNull([].concat(b.athlete2_id || [])[i]);
      const valid = async (id) => (id && (await get('SELECT 1 FROM athletes WHERE id = ?', id)) ? id : null);
      await run('INSERT INTO honors(division_id, place, name1, athlete1_id, name2, athlete2_id, sort_order) VALUES (?,?,?,?,?,?,?)',
        d.id, [1, 2, 3].includes(parseInt(places[i], 10)) ? parseInt(places[i], 10) : 3, name1, await valid(a1),
        String([].concat(b.name2 || [])[i] || '').trim().slice(0, 80) || null, await valid(a2), i);
    }
  });
  await audit(req, 'honors_save', `division:${d.id}`);
  req.flash('success', 'Đã lưu bảng vinh danh.');
  res.redirect(`/admin/noi-dung/${d.id}/vinh-danh`);
}));

// Tìm VĐV để gắn vào vinh danh (CMS)
router.get('/api/athletes', editor, wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  if (q.length < 2) return res.json([]);
  const rows = await all('SELECT id, full_name, nickname, points FROM athletes WHERE full_name ILIKE ? OR nickname ILIKE ? ORDER BY points DESC LIMIT 8', `%${q}%`, `%${q}%`);
  res.json(rows.map((r) => ({ id: r.id, label: `${r.full_name}${r.nickname ? ` (${r.nickname})` : ''} · ${fmt.pts(r.points)}` })));
}));

module.exports = router;
