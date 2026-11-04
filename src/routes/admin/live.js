const express = require('express');
const { all, get, run } = require('../../db');
const fmt = require('../../lib/format');
const youtube = require('../../lib/youtube');
const { encrypt, decrypt } = require('../../lib/crypto');
const { requireRole, audit, rateLimit } = require('../../lib/security');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const editor = requireRole('editor');
const admin = requireRole('admin');

function appUrl(req) {
  return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

router.get('/livestream', editor, wrap(async (req, res) => {
  const events = await all("SELECT id, name, start_date, end_date FROM events WHERE end_date >= CURRENT_DATE - 30 ORDER BY start_date DESC");
  const eventId = parseInt(req.query.giai, 10) || (events[0] && events[0].id) || 0;
  const streams = await all(`SELECT l.*, e.name AS event_name, e.slug FROM live_streams l JOIN events e ON e.id = l.event_id
    WHERE l.event_id = ? ORDER BY l.sort_order, l.court, l.id`, eventId);
  res.render('admin/live', {
    title: 'Livestream', events, eventId, streams, account: await youtube.account(), ytConfigured: youtube.configured(),
    redirectUri: youtube.configured() ? youtube.redirectUri() : null, appUrl: appUrl(req),
  });
}));

// ---- Kết nối kênh YouTube (OAuth) ----
router.get('/livestream/youtube/ket-noi', admin, (req, res) => {
  if (!youtube.configured()) { req.flash('error', 'Server chưa cấu hình YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, APP_URL.'); return res.redirect('/admin/livestream'); }
  res.redirect(youtube.authUrl(req));
});

router.get('/livestream/youtube/callback', admin, wrap(async (req, res) => {
  try {
    const ch = await youtube.handleCallback(req);
    await audit(req, 'youtube_connect', `channel:${ch.channelId}`, ch.channelTitle);
    req.flash('success', `Đã kết nối kênh "${ch.channelTitle}".`);
  } catch (err) {
    if (!err.expose) throw err;
    req.flash('error', err.message);
  }
  res.redirect('/admin/livestream');
}));

router.post('/livestream/youtube/ngat', admin, wrap(async (req, res) => {
  await youtube.disconnect();
  await audit(req, 'youtube_disconnect');
  req.flash('success', 'Đã ngắt kết nối kênh YouTube.');
  res.redirect('/admin/livestream');
}));

router.post('/livestream/dong-bo', editor, wrap(async (req, res) => {
  const n = await youtube.syncStatuses();
  req.flash('success', n ? `Đã cập nhật trạng thái ${n} buổi phát.` : 'Trạng thái đã khớp với YouTube.');
  res.redirect(`/admin/livestream?giai=${parseInt(req.body.event_id, 10) || ''}`);
}));

// ---- Buổi phát ----
async function streamForm(res, s, error) {
  const events = await all('SELECT id, name FROM events ORDER BY start_date DESC LIMIT 50');
  res.render('admin/live-form', { title: s.id ? `Sửa buổi phát: ${s.title}` : 'Tạo buổi phát', s, events, error, account: await youtube.account() });
}

router.get('/livestream/moi', editor, wrap(async (req, res) => {
  await streamForm(res, { event_id: parseInt(req.query.giai, 10) || null, privacy: 'unlisted', mode: 'api' }, null);
}));

function readStream(b) {
  return {
    event_id: parseInt(b.event_id, 10) || null,
    court: String(b.court || '').trim().slice(0, 30),
    title: String(b.title || '').trim().slice(0, 100),
    privacy: b.privacy === 'public' ? 'public' : 'unlisted',
    scheduled_start: fmt.fromLocalInput(b.scheduled_start),
    sort_order: parseInt(b.sort_order, 10) || 0,
    youtube_input: String(b.youtube_url || '').trim(),
    mode: b.mode === 'manual' ? 'manual' : 'api',
  };
}

const createLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: 'Tạo quá nhiều buổi phát, thử lại sau.', key: (req) => `u${req.session.user.id}` });

router.post('/livestream/moi', editor, createLimiter, wrap(async (req, res) => {
  const s = readStream(req.body);
  const ev = s.event_id && await get('SELECT * FROM events WHERE id = ?', s.event_id);
  if (!ev) return streamForm(res.status(400), s, 'Vui lòng chọn giải đấu.');
  if (!s.court) return streamForm(res.status(400), s, 'Vui lòng nhập tên sân, ví dụ "Sân 1".');
  if (!s.title) s.title = `${ev.name} – ${s.court}`;

  if (s.mode === 'manual') {
    const vid = youtube.parseVideoId(s.youtube_input);
    if (s.youtube_input && !vid) return streamForm(res.status(400), s, 'Link YouTube không hợp lệ.');
    const row = await get(`INSERT INTO live_streams(event_id, court, title, youtube_video_id, privacy, scheduled_start, sort_order, via_api)
      VALUES (?,?,?,?,?,?,?, false) RETURNING id`, s.event_id, s.court, s.title, vid, s.privacy, s.scheduled_start, s.sort_order);
    await audit(req, 'stream_create_manual', `stream:${row.id}`, s.title);
    req.flash('success', 'Đã tạo buổi phát.');
    return res.redirect(`/admin/livestream/${row.id}`);
  }

  if (!(await youtube.account()).connected) return streamForm(res.status(400), s, 'Chưa kết nối kênh YouTube. Kết nối kênh hoặc chọn "Dán link YouTube có sẵn".');
  try {
    const yt = await youtube.createBroadcast({
      title: s.title, scheduledStart: s.scheduled_start, privacy: s.privacy,
      description: `${ev.name} · ${s.court}\nTỉ số và nhánh đấu: ${appUrl(req)}/giai-dau/${ev.slug}`,
    });
    const row = await get(`INSERT INTO live_streams(event_id, court, title, youtube_video_id, privacy, scheduled_start, sort_order, via_api,
      youtube_stream_id, ingestion_url, stream_key_enc) VALUES (?,?,?,?,?,?,?, true, ?,?,?) RETURNING id`,
    s.event_id, s.court, s.title, yt.videoId, s.privacy, s.scheduled_start, s.sort_order, yt.streamId, yt.ingestionUrl, encrypt(yt.streamKey));
    await audit(req, 'stream_create_api', `stream:${row.id}`, `${s.title} (${yt.videoId})`);
    req.flash('success', 'Đã tạo buổi phát trên YouTube. Dùng thông tin RTMP bên dưới để cấu hình OBS.');
    res.redirect(`/admin/livestream/${row.id}`);
  } catch (err) {
    if (!err.expose) throw err;
    return streamForm(res.status(400), s, err.message);
  }
}));

router.get('/livestream/:id', editor, wrap(async (req, res, next) => {
  const s = await get(`SELECT l.*, e.name AS event_name, e.slug FROM live_streams l JOIN events e ON e.id = l.event_id WHERE l.id = ?`, parseInt(req.params.id, 10) || 0);
  if (!s) return next();
  s.hasKey = !!s.stream_key_enc;
  delete s.stream_key_enc;
  await streamForm(res, { ...s, mode: s.via_api ? 'api' : 'manual', overlayUrl: `${appUrl(req)}/overlay/san/${s.id}` }, null);
}));

router.post('/livestream/:id', editor, wrap(async (req, res, next) => {
  const cur = await get('SELECT * FROM live_streams WHERE id = ?', parseInt(req.params.id, 10) || 0);
  if (!cur) return next();
  const s = readStream(req.body);
  if (!s.court || !s.title) { req.flash('error', 'Tên sân và tiêu đề không được để trống.'); return res.redirect(`/admin/livestream/${cur.id}`); }
  let vid = cur.youtube_video_id;
  if (!cur.via_api) {
    vid = s.youtube_input ? youtube.parseVideoId(s.youtube_input) : null;
    if (s.youtube_input && !vid) { req.flash('error', 'Link YouTube không hợp lệ.'); return res.redirect(`/admin/livestream/${cur.id}`); }
  }
  const status = ['scheduled', 'live', 'ended'].includes(req.body.status) && !cur.via_api ? req.body.status : cur.status;
  await run(`UPDATE live_streams SET court = ?, title = ?, youtube_video_id = ?, scheduled_start = ?, sort_order = ?, status = ?,
    actual_start = CASE WHEN ? = 'live' AND actual_start IS NULL THEN now() ELSE actual_start END,
    actual_end = CASE WHEN ? = 'ended' AND actual_end IS NULL THEN now() ELSE actual_end END WHERE id = ?`,
  s.court, s.title, vid, s.scheduled_start, s.sort_order, status, status, status, cur.id);
  await audit(req, 'stream_update', `stream:${cur.id}`, status);
  req.flash('success', 'Đã lưu buổi phát.');
  res.redirect(`/admin/livestream/${cur.id}`);
}));

// Xem stream key: chỉ quản trị viên, mỗi lần xem được ghi nhật ký
router.post('/livestream/:id/stream-key', admin, wrap(async (req, res) => {
  const s = await get('SELECT id, ingestion_url, stream_key_enc FROM live_streams WHERE id = ?', parseInt(req.params.id, 10) || 0);
  if (!s || !s.stream_key_enc) return res.status(404).json({ ok: false, error: 'Buổi phát không có stream key (đã kết thúc hoặc tạo thủ công).' });
  await audit(req, 'stream_key_view', `stream:${s.id}`);
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, server: s.ingestion_url, key: decrypt(s.stream_key_enc) });
}));

router.post('/livestream/:id/ket-thuc', editor, wrap(async (req, res) => {
  const s = await get('SELECT * FROM live_streams WHERE id = ?', parseInt(req.params.id, 10) || 0);
  if (!s) { req.flash('error', 'Không tìm thấy buổi phát.'); return res.redirect('/admin/livestream'); }
  // Hỏi trạng thái THẬT trên YouTube (CSDL có thể chậm tới 1 phút so với YouTube):
  // tránh trường hợp website ghi "đã kết thúc" + xóa stream key trong khi YouTube vẫn đang phát
  let neverAired = false;
  try {
    if (s.via_api && s.youtube_video_id) {
      const st = await youtube.broadcastStatus(s.youtube_video_id);
      if (st && ['live', 'liveStarting'].includes(st.lifeCycle)) await youtube.endBroadcast(s.youtube_video_id);
      else if (st && ['created', 'ready', 'testStarting', 'testing'].includes(st.lifeCycle)) neverAired = true;
    }
  } catch (err) {
    if (!err.expose) throw err;
    req.flash('error', err.message);
    return res.redirect(`/admin/livestream/${s.id}`);
  }
  await run("UPDATE live_streams SET status = 'ended', actual_end = COALESCE(actual_end, now()), stream_key_enc = NULL WHERE id = ?", s.id);
  await audit(req, 'stream_end', `stream:${s.id}`);
  req.flash('success', neverAired
    ? 'Đã kết thúc trên website. Buổi phát chưa từng lên sóng nên YouTube không có video; có thể xóa buổi phát này trong YouTube Studio.'
    : 'Đã kết thúc buổi phát. YouTube sẽ lưu video trên kênh, website dùng video này cho mục "Xem lại".');
  res.redirect(`/admin/livestream/${s.id}`);
}));

router.post('/livestream/:id/xoa', editor, wrap(async (req, res) => {
  const s = await get('DELETE FROM live_streams WHERE id = ? RETURNING event_id, title', parseInt(req.params.id, 10) || 0);
  if (s) await audit(req, 'stream_delete', `stream:${req.params.id}`, s.title);
  req.flash('success', 'Đã xóa buổi phát khỏi website (video trên YouTube vẫn giữ nguyên).');
  res.redirect(`/admin/livestream${s ? `?giai=${s.event_id}` : ''}`);
}));

module.exports = router;
