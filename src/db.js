const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');
const { Pool, types } = require('pg');

// Giữ kiểu date dạng 'YYYY-MM-DD', bigint (COUNT) thành số
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => parseInt(v, 10));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

let pool = null;
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('Thiếu biến môi trường DATABASE_URL');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX) || 10 });
  }
  return pool;
}

const txStore = new AsyncLocalStorage();

// Viết câu SQL bằng dấu ? cho gọn, tự đổi sang $1, $2…
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function query(sql, params = []) {
  const client = txStore.getStore() || getPool();
  return client.query(toPg(sql), params);
}

const all = async (sql, ...params) => (await query(sql, params)).rows;
const get = async (sql, ...params) => (await query(sql, params)).rows[0];
const run = async (sql, ...params) => query(sql, params);

// Giao dịch: mọi truy vấn bên trong fn (kể cả lồng nhau) dùng chung một kết nối
async function tx(fn) {
  if (txStore.getStore()) return fn();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await txStore.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function migrate() {
  await run(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, 'migrations');
  const done = new Set((await all('SELECT name FROM schema_migrations')).map((r) => r.name));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await tx(async () => {
      await txStore.getStore().query(sql);
      await run('INSERT INTO schema_migrations(name) VALUES (?)', file);
    });
    console.log(`Đã chạy migration ${file}`);
  }
}

async function close() {
  if (pool) await pool.end();
  pool = null;
}

module.exports = { all, get, run, tx, query, migrate, close, DATA_DIR };
