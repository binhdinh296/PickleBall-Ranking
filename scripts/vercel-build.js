// Chạy trong bước build của Vercel (xem vercel.json → buildCommand):
// 1. Cập nhật cấu trúc CSDL (migration)
// 2. Tạo tài khoản quản trị đầu tiên từ ADMIN_USERNAME / ADMIN_PASSWORD (nếu CSDL chưa có admin)
// 3. Tự động nạp dữ liệu mẫu hư cấu khi CSDL còn trống (trừ khi đặt rõ SEED_DEMO=0)
// Không ghi file ra đĩa, không in mật khẩu ra log.
const db = require('../src/db');
const { hashPassword, passwordProblem } = require('../src/lib/security');

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

(async () => {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    fail('Thiếu DATABASE_URL. Vào Vercel → Project → Settings → Environment Variables (hoặc gắn Neon/Supabase từ tab Storage) rồi deploy lại.');
  }
  for (const key of ['SESSION_SECRET', 'APP_SECRET']) {
    if (String(process.env[key] || '').length < 32) fail(`${key} phải có ít nhất 32 ký tự (tạo bằng: openssl rand -hex 32).`);
  }

  await db.migrate();
  console.log('✔ Migration xong.');

  const hasAdmin = await db.get("SELECT 1 FROM users WHERE role = 'admin' AND active");
  if (!hasAdmin) {
    const username = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    const problem = passwordProblem(password);
    if (problem) {
      console.warn(`⚠ Chưa có tài khoản quản trị. Đặt ADMIN_PASSWORD (${problem.toLowerCase()}) rồi deploy lại.`);
    } else if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      console.warn('⚠ ADMIN_USERNAME không hợp lệ (3–40 ký tự: chữ thường, số, dấu chấm, gạch).');
    } else {
      await db.run("INSERT INTO users(username, display_name, password_hash, role) VALUES (?, 'Quản trị viên', ?, 'admin') ON CONFLICT (username) DO NOTHING",
        username, hashPassword(password));
      console.log(`✔ Đã tạo tài khoản quản trị "${username}". Hãy đổi mật khẩu sau lần đăng nhập đầu và xóa ADMIN_PASSWORD khỏi Vercel.`);
    }
  }

  // Tự động nạp dữ liệu mẫu nếu CSDL chưa có VĐV nào (trừ khi cố ý đặt SEED_DEMO=0)
  if (process.env.SEED_DEMO !== '0') {
    await require('./seed').seed({ log: (m) => console.log(`✔ ${m}`) });
  }
  await db.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
