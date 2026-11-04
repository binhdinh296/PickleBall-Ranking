// Chạy môi trường phát triển: nếu chưa có DATABASE_URL thì bật PostgreSQL nhúng trong thư mục data/pg
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
  await pg.start();
  await pg.createDatabase('pickleball').catch(() => {});
  process.env.DATABASE_URL = `postgres://postgres:${encodeURIComponent(cfg.password)}@127.0.0.1:${cfg.port}/pickleball`;
  console.log(`PostgreSQL nhúng đang chạy ở cổng ${cfg.port} (dữ liệu: ${path.relative(process.cwd(), dir)})`);
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
