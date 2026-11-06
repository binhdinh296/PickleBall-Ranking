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

  // Tự động nạp dữ liệu VĐV nếu CSDL còn trống hoặc chưa có đủ dữ liệu Pickna
  if (process.env.SEED_DEMO !== '0') {
    let shouldForce = process.env.FORCE_SEED === '1' || process.env.SEED_DEMO === 'force';
    if (!shouldForce) {
      try {
        const athleteCount = (await db.get("SELECT COUNT(*) AS c FROM athletes"))?.c || 0;
        const otpCount = (await db.get("SELECT COUNT(*) AS c FROM otp_requests"))?.c || 0;
        if (athleteCount < 500 || otpCount === 0) {
          console.log(`⚡ Phát hiện CSDL Neon chưa có đủ VĐV Pickna (hiện có ${athleteCount}/971). Tự động nạp dữ liệu chuẩn...`);
          shouldForce = true;
        }
      } catch (err) {
        // Chưa có bảng athletes hoặc lỗi đọc, seed sẽ tự xử lý
      }
    }

    await require('./seed').seed({ force: shouldForce, log: (m) => console.log(`✔ ${m}`) });
  }

  // CSDL đã seed từ trước: đổi dữ liệu mẫu cũ (tên PICKLERANK, nhà tài trợ mang tên thương hiệu thật, giải demo ngoài vùng)
  // sang bản PickNgheTinh. Chỉ thay giá trị còn đúng y bản mẫu cũ, không đụng nội dung đã chỉnh trong CMS.
  try {
    await require('./demo-data-sync').syncDemoData(db, (m) => console.log(`✔ ${m}`));
  } catch (err) {
    console.warn('⚠ Không thể đồng bộ dữ liệu mẫu:', err.message);
  }

  // Đảm bảo các giải đấu và đối tác có banner static chuẩn trên Vercel (kể cả khi CSDL Neon cũ chưa seed lại)
  try {
    await db.run("UPDATE events SET banner = '/static/img/events/mua-thu-open-2026.svg' WHERE slug = 'mua-thu-open-2026' AND (banner IS NULL OR banner LIKE '/uploads/%')");
    await db.run("UPDATE events SET banner = '/static/img/events/dong-xuan-cup-2026.svg' WHERE slug = 'dong-xuan-cup-2026' AND (banner IS NULL OR banner LIKE '/uploads/%')");
    await db.run("UPDATE events SET banner = '/static/img/events/super-cup-tiep-suc-2026.svg' WHERE slug = 'super-cup-tiep-suc-2026' AND (banner IS NULL OR banner LIKE '/uploads/%')");
    await db.run("UPDATE events SET banner = '/static/img/events/giai-vo-dich-quoc-gia-2026.svg' WHERE slug = 'giai-vo-dich-quoc-gia-2026' AND (banner IS NULL OR banner LIKE '/uploads/%')");

    await db.run("UPDATE divisions SET banner = '/static/img/divisions/doi-nam-6-5.svg' WHERE name = 'Đôi nam 6.5' AND (banner IS NULL OR banner LIKE '/uploads/%')");
    await db.run("UPDATE divisions SET banner = '/static/img/divisions/doi-nam-nu-5-8.svg' WHERE name = 'Đôi nam nữ 5.8' AND (banner IS NULL OR banner LIKE '/uploads/%')");
    await db.run("UPDATE divisions SET banner = '/static/img/divisions/doi-nam-newbie.svg' WHERE name LIKE 'Đôi nam Newbie%' AND (banner IS NULL OR banner LIKE '/uploads/%')");
    await db.run("UPDATE divisions SET banner = '/static/img/divisions/doi-nam-nu-hon-hop-5-5.svg' WHERE name LIKE 'Đôi nam nữ hỗn hợp%' AND (banner IS NULL OR banner LIKE '/uploads/%')");
    await db.run("UPDATE divisions SET banner = '/static/img/divisions/doi-nu-3-0.svg' WHERE name LIKE 'Đôi nữ 3.0%' AND (banner IS NULL OR banner LIKE '/uploads/%')");
    await db.run("UPDATE divisions SET banner = '/static/img/divisions/dong-doi-tiep-suc-master.svg' WHERE name LIKE 'Đồng đội tiếp sức%' AND (banner IS NULL OR banner LIKE '/uploads/%')");

    // Logo mẫu của nhà tài trợ hư cấu trong dữ liệu demo
    const demoLogos = [['Dinkra%', 'dinkra'], ['Lam Giang%', 'lam-giang'], ['Pickvia%', 'pickvia'], ['%Hydrava%', 'hydrava'], ['Lumira%', 'lumira'], ['Zenmo%', 'zenmo'], ['Quỹ Pickleball Cộng Đồng%', 'quy-nghe-tinh']];
    for (const [pattern, file] of demoLogos) {
      await db.run(`UPDATE partners SET logo = '/static/img/partners/${file}.svg' WHERE name LIKE ? AND (logo IS NULL OR logo LIKE '/uploads/%')`, pattern);
    }
    console.log('✔ Đồng bộ đường dẫn banner & logo static cho Vercel.');
  } catch (err) {
    console.warn('⚠ Không thể cập nhật banner static:', err.message);
  }

  // Đồng bộ giải đấu chuẩn bị tổ chức: Minigame Gà Vàng Ươm Lần 2 (kèm 31 đôi đăng ký và nhánh đấu)
  try {
    await require('./sync-tournaments').syncGaVangUom(db);
    console.log('✔ Đồng bộ giải Minigame Gà Vàng Ươm Lần 2.');
  } catch (err) {
    console.warn('⚠ Không thể đồng bộ giải Gà Vàng Ươm Lần 2:', err.message);
  }

  await db.close();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
