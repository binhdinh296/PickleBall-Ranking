// Đồng bộ toàn bộ dữ liệu từ CSDL local sang CSDL remote (Neon Postgres trên Vercel)
// Cách dùng: node scripts/sync-db.js "<DATABASE_URL_NEON>"
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const targetUrl = process.argv[2] || process.env.TARGET_DATABASE_URL;

if (!targetUrl || targetUrl.includes('127.0.0.1') || targetUrl.includes('54329')) {
  console.log(`
✖ Thiếu đường dẫn kết nối CSDL Neon (Vercel).
Cách chạy:
  node scripts/sync-db.js "postgres://neondb_owner:***@ep-***.neon.tech/neondb?sslmode=require"

(Bạn lấy link DATABASE_URL này tại: Vercel ➜ Storage ➜ Neon Postgres ➜ tab .env.local hoặc Settings ➜ Environment Variables)
`);
  process.exit(1);
}

const cfgFile = path.join(__dirname, '..', 'data', 'pg-dev.json');
if (!fs.existsSync(cfgFile)) {
  console.error('✖ Không tìm thấy cấu hình CSDL local (data/pg-dev.json). Hãy chắc chắn server local đã từng chạy.');
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
const localUrl = `postgres://postgres:${encodeURIComponent(cfg.password)}@127.0.0.1:${cfg.port}/pickleball`;

const localPool = new Pool({ connectionString: localUrl });
const targetPool = new Pool({ connectionString: targetUrl, ssl: { rejectUnauthorized: false } });

// Danh sách các bảng theo thứ tự quan hệ khóa ngoại
const TABLES = [
  'users',
  'settings',
  'athletes',
  'events',
  'divisions',
  'registrations',
  'teams',
  'live_streams',
  'matches',
  'honors',
  'submissions',
  'partners',
  'point_history',
  'otp_requests',
  'audit_logs',
];

async function sync() {
  console.log('🔄 Đang kết nối CSDL local và CSDL remote (Vercel)...');

  // Chạy migration trên remote trước để đảm bảo cấu trúc bảng đầy đủ
  process.env.DATABASE_URL = targetUrl;
  const db = require('../src/db');
  await db.migrate();
  console.log('✔ Cấu trúc bảng (Migration) trên remote đã sẵn sàng.');

  // Xóa dữ liệu cũ trên remote theo thứ tự cascade
  console.log('🧹 Đang dọn dẹp các bảng trên remote...');
  const truncList = TABLES.filter((t) => t !== 'settings').join(', ');
  await targetPool.query(`TRUNCATE TABLE ${truncList} CASCADE`);

  console.log('📥 Đang sao chép dữ liệu từ local sang remote...\n');

  for (const table of TABLES) {
    const { rows } = await localPool.query(`SELECT * FROM ${table} ORDER BY 1`);
    if (rows.length === 0) {
      console.log(`  • ${table.padEnd(16)}: 0 bản ghi`);
      continue;
    }

    if (table === 'settings') {
      for (const r of rows) {
        await targetPool.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
          [r.key, r.value]
        );
      }
    } else {
      const cols = Object.keys(rows[0]);
      const colNames = cols.map((c) => `"${c}"`).join(', ');

      for (const row of rows) {
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const values = cols.map((c) => row[c]);
        await targetPool.query(`INSERT INTO ${table} (${colNames}) VALUES (${placeholders})`, values);
      }

      // Đặt lại giá trị auto-increment cho sequence
      try {
        await targetPool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1)) FROM ${table}`);
      } catch {}
    }

    console.log(`  ✔ ${table.padEnd(16)}: đã chép ${rows.length} bản ghi`);
  }

  console.log('\n🎉 ĐỒNG BỘ THÀNH CÔNG! CSDL Vercel hiện đã 100% giống CSDL local.');
}

sync()
  .catch((err) => {
    console.error('\n✖ Lỗi đồng bộ:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await localPool.end().catch(() => {});
    await targetPool.end().catch(() => {});
    process.exit(0);
  });
