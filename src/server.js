const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const { all, get } = require('./db');
const fmt = require('./lib/format');
const phone = require('./lib/phone');
const { getSettings, loadSettings, themeColors } = require('./lib/settings');
const { PgStore, purgeExpired, csrf, securityHeaders } = require('./lib/security');
const { UPLOAD_DIR } = require('./lib/upload');
const youtube = require('./lib/youtube');
const devtools = require('./routes/devtools');

const isProd = process.env.NODE_ENV === 'production';

function createApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  app.disable('x-powered-by');

  app.use(securityHeaders);
  app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: isProd ? '7d' : 0 }));
  // Trình duyệt luôn tự gọi /favicon.ico: chuyển sang icon SVG (tránh lỗi 404 trong console)
  app.get('/favicon.ico', (req, res) => res.redirect(301, '/static/favicon.svg'));
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', dotfiles: 'deny', index: false }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(express.json({ limit: '50kb' }));

  if (!process.env.SESSION_SECRET && isProd) throw new Error('Thiếu SESSION_SECRET');
  app.use(session({
    store: new PgStore(),
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    name: 'sid',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 8 * 3600 * 1000 },
  }));

  // Biến dùng chung cho mọi view (đặt trước CSRF để trang báo lỗi luôn hiển thị được)
  app.use(async (req, res, next) => {
    try {
      res.locals.fmt = fmt;
      res.locals.site = getSettings();
      res.locals.colors = themeColors();
      res.locals.path = req.path;
      res.locals.user = req.session.user || null;
      // Bộ chọn "Xem với vai trò" trên menu: chỉ môi trường dev và chỉ khi mở từ chính máy chạy server
      res.locals.roleSwitcher = devtools.enabled() && devtools.isLocal(req);
      res.locals.flash = req.session.flash || null;
      res.locals.phonePrefixes = phone.clientConfig();
      delete req.session.flash;
      req.flash = (type, message) => { req.session.flash = { type, message }; };
      if (!req.path.startsWith('/admin') && !req.path.startsWith('/api/') && !req.path.startsWith('/overlay/')) {
        res.locals.partners = await all('SELECT * FROM partners WHERE visible ORDER BY sort_order, id');
        const live = await get(`SELECT COUNT(*) AS c FROM live_streams l JOIN events e ON e.id = l.event_id
          WHERE l.status = 'live' AND e.published`);
        res.locals.liveCount = live.c;
      }
      next();
    } catch (err) { next(err); }
  });

  app.use(csrf);

  app.use('/', require('./routes/public'));
  app.use('/', require('./routes/live'));
  app.use('/giai-dau', require('./routes/tournaments'));
  app.use('/admin', require('./routes/admin'));
  app.use('/dev', devtools);

  app.use((req, res) => res.status(404).render('error', { title: 'Không tìm thấy trang', message: 'Trang bạn tìm không tồn tại hoặc đã bị gỡ.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const exposed = err.expose || err.name === 'MulterError';
    if (!exposed) console.error(err);
    const message = exposed ? err.message : 'Đã có lỗi xảy ra, vui lòng thử lại.';
    const status = err.status || (exposed ? 400 : 500);
    if (req.path.startsWith('/api/') || req.get('x-csrf-token') !== undefined) return res.status(status).json({ ok: false, error: message });
    res.status(status).render('error', { title: 'Có lỗi xảy ra', message });
  });
  return app;
}

async function start() {
  await loadSettings();
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Server chạy tại http://localhost:${port}  (CMS: /admin)`);
    if (devtools.enabled()) console.log(`Bảng test: http://localhost:${port}/dev  (chỉ mở được từ máy này)`);
  });
  setInterval(purgeExpired, 3600 * 1000).unref();
  // Đồng bộ trạng thái buổi live tạo qua YouTube API mỗi phút
  setInterval(() => youtube.syncStatuses().catch((e) => console.error('[youtube] sync', e.message)), 60 * 1000).unref();
}

if (require.main === module) {
  start().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { createApp, start };
