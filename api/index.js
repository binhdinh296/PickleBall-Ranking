// Điểm vào serverless cho Vercel: mọi đường dẫn được vercel.json chuyển về đây và giao cho Express.
// (Chạy trên server thường vẫn dùng `npm start` → src/server.js như trước.)
const { createApp } = require('../src/server');
const { loadSettings } = require('../src/lib/settings');
const { syncPicknaAthletes } = require('../src/lib/sync-athletes');

let app = null;
let loading = null;
let loadedAt = 0;
let synced = false;
const SETTINGS_TTL = 30_000; // nhiều instance chạy song song → làm mới cấu hình CMS định kỳ

async function ready() {
  if (app && Date.now() - loadedAt < SETTINGS_TTL) return;
  if (!loading) {
    loading = (async () => {
      if (!synced) {
        synced = true;
        try {
          await syncPicknaAthletes();
        } catch (e) {
          console.error('[startup sync]', e.message);
          synced = false;
        }
      }
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
  // Điểm kiểm tra hoặc kích hoạt đồng bộ khẩn cấp
  if (req.url && (req.url.startsWith('/api/sync-pickna') || req.url.startsWith('/sync-pickna'))) {
    const force = req.url.includes('force=1');
    const result = await syncPicknaAthletes(force);
    try {
      const db = require('../src/db');
      await db.migrate();
      await require('../scripts/sync-tournaments').syncGaVangUom(db);
    } catch (e) {
      result.tournamentError = e.message;
    }
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(result));
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
