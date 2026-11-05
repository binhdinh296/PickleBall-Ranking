// Điểm vào serverless cho Vercel: mọi đường dẫn được vercel.json chuyển về đây và giao cho Express.
// (Chạy trên server thường vẫn dùng `npm start` → src/server.js như trước.)
const { createApp } = require('../src/server');
const { loadSettings } = require('../src/lib/settings');
const db = require('../src/db');
const athletesData = require('../src/data/athletes-data');

let app = null;
let loading = null;
let loadedAt = 0;
let seedChecked = false;
let lastSyncStatus = 'not_started';
let lastSyncError = null;
const SETTINGS_TTL = 30_000; // nhiều instance chạy song song → làm mới cấu hình CMS định kỳ

async function ensureDbData(force = false) {
  if (seedChecked && !force) return;
  seedChecked = true;
  try {
    const athleteCount = (await db.get("SELECT COUNT(*) AS c FROM athletes"))?.c || 0;
    if (athleteCount < 500 || force) {
      lastSyncStatus = `starting: athleteCount=${athleteCount}, athletesData=${athletesData?.length || 0}`;
      const { seed } = require('../scripts/seed');
      await seed({ force: true, athletes: athletesData, log: (m) => console.log(`[seed] ${m}`) });
      const newCount = (await db.get("SELECT COUNT(*) AS c FROM athletes"))?.c || 0;
      lastSyncStatus = `done: newCount=${newCount}`;
    } else {
      lastSyncStatus = `skipped: athleteCount=${athleteCount}`;
    }
  } catch (err) {
    lastSyncError = err.stack || err.message;
    console.error('[runtime] ensureDbData error:', err);
    seedChecked = false;
  }
}

async function ready() {
  if (app && Date.now() - loadedAt < SETTINGS_TTL) return;
  if (!loading) {
    loading = (async () => {
      await ensureDbData();
      await loadSettings();
      if (!app) app = createApp();
      loadedAt = Date.now();
    })().finally(() => { loading = null; });
  }
  // Đã có app: không bắt người dùng chờ làm mới cấu hình (lỗi làm mới chỉ ghi log)
  if (app) { loading.catch((e) => console.error('[settings] làm mới', e.message)); return; }
  await loading;
}

module.exports = async (req, res) => {
  if (req.url === '/api/debug-sync') {
    if (req.url.includes('force=1')) await ensureDbData(true);
    let count = null;
    try { count = (await db.get("SELECT COUNT(*) AS c FROM athletes"))?.c; } catch (e) { count = e.message; }
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ lastSyncStatus, lastSyncError, athleteCount: count }));
  }
  try {
    await ready();
  } catch (err) {
    console.error('[startup]', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    // Không lộ chi tiết lỗi ra ngoài; chi tiết nằm trong Vercel → Deployments → Logs
    return res.end('<!doctype html><meta charset="utf-8"><title>Đang bảo trì</title>'
      + '<p style="font:16px system-ui;padding:32px">Hệ thống tạm thời chưa sẵn sàng. Vui lòng thử lại sau ít phút.</p>');
  }
  return app(req, res);
};
