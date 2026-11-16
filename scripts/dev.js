// Chạy môi trường phát triển: nếu chưa có DATABASE_URL thì bật PostgreSQL nhúng trong thư mục data/pg
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Nạp .env ở đây thay vì dùng cờ --env-file: khi chạy kèm --watch-path, cờ đó khiến Node theo dõi cả thư mục dự án,
// nên mỗi lần ghi vào data/ (pg-dev.json, ảnh tải lên, dữ liệu PostgreSQL) server lại tự khởi động lại không ngừng.
// Giống --env-file: biến đã có sẵn trong shell không bị ghi đè.
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

async function startEmbeddedPostgres() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dir = path.join(DATA_DIR, 'pg');
  const cfgFile = path.join(DATA_DIR, 'pg-dev.json');
  const cfg = fs.existsSync(cfgFile)
    ? JSON.parse(fs.readFileSync(cfgFile, 'utf8'))
    : { password: crypto.randomBytes(18).toString('hex'), port: Number(process.env.DEV_DB_PORT) || 54329 };
  fs.writeFileSync(cfgFile, JSON.stringify(cfg), { mode: 0o600 });
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: cfg.password, port: cfg.port, persistent: true, onLog: () => {} });
  if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) await pg.initialise();
  let owned = true;
  try {
    await pg.start();
  } catch (err) {
    // Thư mục data/pg đang bị một PostgreSQL khác giữ (vd. tiến trình dev trước bị đóng đột ngột, hay một
    // `npm run dev` khác đang chạy): dùng lại nếu kết nối được, thay vì dừng với thông báo khó hiểu.
    owned = false;
    const probe = pg.getPgClient();
    try {
      await probe.connect();
      await probe.end();
    } catch {
      throw new Error(`Không bật được PostgreSQL nhúng ở cổng ${cfg.port}${err && err.message ? ` (${err.message})` : ''}. `
        + `Có thể một tiến trình khác đang giữ ${path.relative(process.cwd(), dir)}: xem bằng lệnh lsof -nP -iTCP:${cfg.port}`);
    }
  }
  // Tự tạo CSDL nếu chưa có. Không dùng pg.createDatabase(): khi CSDL đã tồn tại, hàm đó bỏ quên kết nối đang mở,
  // và mỗi lần tắt/khởi động lại (Ctrl+C, `node --watch`) kết nối đó in ra lỗi "terminating connection".
  const admin = pg.getPgClient();
  await admin.connect();
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'pickleball'");
    if (!rowCount) await admin.query('CREATE DATABASE pickleball');
  } finally {
    await admin.end();
  }
  process.env.DATABASE_URL = `postgres://postgres:${encodeURIComponent(cfg.password)}@127.0.0.1:${cfg.port}/pickleball`;
  console.log(owned
    ? `PostgreSQL nhúng đang chạy ở cổng ${cfg.port} (dữ liệu: ${path.relative(process.cwd(), dir)})`
    : `Dùng lại PostgreSQL đang chạy sẵn ở cổng ${cfg.port} (dữ liệu: ${path.relative(process.cwd(), dir)})`);
  const stop = async () => { await pg.stop().catch(() => {}); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

(async () => {
  if (!process.env.DATABASE_URL) await startEmbeddedPostgres();
  const db = require('../src/db');
  await db.migrate();
  await require('./seed').seed();
  await require('../src/server').start();
})().catch((err) => { console.error(err); process.exit(1); });
