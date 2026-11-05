// Dữ liệu mẫu phong phú để chạy thử và kiểm thử hệ thống
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { all, get, run, tx, DATA_DIR, ensureDir } = require('../src/db');
const { loadSettings } = require('../src/lib/settings');
const { hashPassword } = require('../src/lib/security');
const bracket = require('../src/lib/bracket');

const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Võ', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh'];
const OTHER_MALE = [
  'Văn Long', 'Tuấn Kiệt', 'Hoàng Phúc', 'Đình Trọng', 'Công Danh', 'Trung Kiên', 'Bảo Lâm', 'Nhật Minh',
  'Quang Vinh', 'Anh Tuấn', 'Thành Đạt', 'Hữu Phước', 'Xuân Trường', 'Tiến Dũng', 'Việt Hoàng', 'Khánh Duy',
  'Huy Hoàng', 'Trọng Hiếu', 'Minh Trí', 'Hải Đăng', 'Quang Hải', 'Văn Đức', 'Hồng Quân', 'Thế Anh',
  'Đức Trọng', 'Bảo Nam', 'Chí Cường', 'Văn Hậu', 'Minh Nhật', 'Tấn Tài',
];
const OTHER_FEMALE = [
  'Thanh Huyền', 'Mai Anh', 'Hồng Nhung', 'Diệu Linh', 'Tuyết Mai', 'Quỳnh Nga', 'Thu Thảo',
  'Hương Giang', 'Bích Phương', 'Yến Nhi', 'Mỹ Linh', 'Trang Nhung', 'Hải Yến', 'Thảo My',
];
// Dữ liệu mẫu chỉ dùng CLB và địa phương thuộc Nghệ An, Hà Tĩnh (tên CLB là hư cấu)
const CLUBS = [
  'CLB Sông Lam (Vinh)', 'CLB Bến Thủy (Vinh)', 'CLB Cửa Lò Pickleball', 'CLB Cửa Hội Dinker (Cửa Lò)',
  'CLB Hoàng Mai Smash (Nghệ An)', 'CLB Diễn Châu Pickleball', 'CLB Đô Lương Pickle', 'CLB Thái Hòa Dinker (Nghệ An)',
  'CLB Hồng Lĩnh Pickleball (Hà Tĩnh)', 'CLB Thạch Hà Dinker (Hà Tĩnh)', 'CLB Thiên Cầm Sunshine (Hà Tĩnh)', 'CLB Kỳ Anh Smash (Hà Tĩnh)',
];
const TOWNS = [
  'Vinh', 'Cửa Lò', 'Hoàng Mai', 'Thái Hòa', 'Diễn Châu', 'Đô Lương', 'Quỳnh Lưu', 'Nghi Lộc',
  'Hà Tĩnh', 'Hồng Lĩnh', 'Kỳ Anh', 'Cẩm Xuyên', 'Nghi Xuân', 'Thạch Hà',
];
const PREFIX = ['090', '091', '093', '094', '096', '097', '098', '086', '088', '089', '070', '077', '032', '035', '038', '081', '083', '085'];
const NICKS = ['Smash', 'Dink', 'Volley', 'Lob', 'Spin', 'Erne', 'Bert', 'ATP', 'Ace', 'Fire', 'Speed'];

// 12 VĐV nổi bật đại diện đầy đủ 6 mức rank (mỗi mức 1 Nam, 1 Nữ) kèm ảnh chân dung Unsplash
const FEATURED_SPEC = [
  { given: 'Minh Khoa', gender: 'M', points: 3650, peak: 3700, nick: 'Khoa ATP', club: 'CLB Sông Lam (Vinh)', town: 'Vinh',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&h=500&fit=crop&crop=faces&auto=format' }, // Kim cương
  { given: 'Ngọc Lan', gender: 'F', points: 3450, peak: 3500, nick: 'Lan Volley', club: 'CLB Hồng Lĩnh Pickleball (Hà Tĩnh)', town: 'Hồng Lĩnh',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&h=500&fit=crop&crop=faces&auto=format' }, // Kim cương
  { given: 'Quốc Bảo', gender: 'M', points: 3380, peak: 3420, nick: 'Bảo Bert', club: 'CLB Bến Thủy (Vinh)', town: 'Vinh',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&h=500&fit=crop&crop=faces&auto=format' }, // Bạch kim
  { given: 'Thu Hà', gender: 'F', points: 3320, peak: 3360, nick: 'Hà Smash', club: 'CLB Thạch Hà Dinker (Hà Tĩnh)', town: 'Hà Tĩnh',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&h=500&fit=crop&crop=faces&auto=format' }, // Bạch kim
  { given: 'Đức Anh', gender: 'M', points: 3270, peak: 3300, nick: 'Đức Erne', club: 'CLB Cửa Hội Dinker (Cửa Lò)', town: 'Cửa Lò',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&h=500&fit=crop&crop=faces&auto=format' }, // Vàng
  { given: 'Phương Anh', gender: 'F', points: 3215, peak: 3250, nick: 'Phương Spin', club: 'CLB Diễn Châu Pickleball', town: 'Diễn Châu',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&h=500&fit=crop&crop=faces&auto=format' }, // Vàng
  { given: 'Hải Nam', gender: 'M', points: 3180, peak: 3200, nick: 'Nam Ace', club: 'CLB Kỳ Anh Smash (Hà Tĩnh)', town: 'Kỳ Anh',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=500&h=500&fit=crop&crop=faces&auto=format' }, // Bạc
  { given: 'Minh Thư', gender: 'F', points: 3120, peak: 3160, nick: 'Thư Dink', club: 'CLB Cửa Lò Pickleball', town: 'Cửa Lò',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&h=500&fit=crop&crop=faces&auto=format' }, // Bạc
  { given: 'Gia Huy', gender: 'M', points: 3080, peak: 3100, nick: 'Huy Fire', club: 'CLB Hoàng Mai Smash (Nghệ An)', town: 'Hoàng Mai',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=500&h=500&fit=crop&crop=faces&auto=format' }, // Đồng
  { given: 'Bảo Ngọc', gender: 'F', points: 3025, peak: 3050, nick: 'Ngọc Lob', club: 'CLB Thiên Cầm Sunshine (Hà Tĩnh)', town: 'Cẩm Xuyên',
    avatar: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=500&h=500&fit=crop&crop=faces&auto=format' }, // Đồng
  { given: 'Thanh Tùng', gender: 'M', points: 2850, peak: 2900, nick: 'Tùng Speed', club: 'CLB Đô Lương Pickle', town: 'Đô Lương',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=500&h=500&fit=crop&crop=faces&auto=format' }, // Sắt
  { given: 'Khánh Linh', gender: 'F', points: 2680, peak: 2720, nick: 'Linh Newbie', club: 'CLB Thái Hòa Dinker (Nghệ An)', town: 'Thái Hòa',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=500&h=500&fit=crop&crop=faces&auto=format' }, // Sắt
];

function rnd(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

function addDays(n) {
  const d = new Date(Date.now() + n * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

async function seed({ log = console.log, force = false } = {}) {
  await loadSettings();
  const r = rnd(20261104);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];

  const athleteCount = (await get('SELECT COUNT(*) AS c FROM athletes')).c;
  if (force) {
    log('Đang dọn sạch dữ liệu cũ để nạp lại toàn bộ dữ liệu mẫu full tính năng...');
    await run('TRUNCATE matches, honors, teams, registrations, live_streams, divisions, events, submissions, point_history, athletes, partners, otp_requests, audit_logs CASCADE');
  } else if (athleteCount > 0) {
    log(`CSDL đã có sẵn ${athleteCount} VĐV, bỏ qua dữ liệu mẫu. (Dùng npm run seed -- --force nếu muốn nạp lại từ đầu).`);
    return;
  }

  // ---- 1. Cấu hình hệ thống (Settings) ----
  const defaultSettings = [
    ['site_name', 'PickNgheTinh'],
    ['site_tagline', 'Hệ thống ranking & giải đấu Pickleball'],
    ['hero_title', 'HỆ THỐNG RANKING & GIẢI ĐẤU PICKLEBALL'],
    ['hero_text', 'Nơi kết nối cộng đồng Pickleball Nghệ An, Hà Tĩnh, tổ chức giải đấu chuyên nghiệp và xây dựng hệ thống ranking minh bạch.'],
    ['contact_email', 'contact@picknghetinh.vn'],
    ['contact_phone', '0901 234 567'],
    ['ball_color', '#D4F53C'],
    ['court_color', '#14B8A6'],
    ['gold_color', '#E6C27A'],
    ['featured_count', '12'],
    ['otp_provider', 'mock'],
    ['require_otp_submission', '1'],
    ['require_otp_registration', '1']
  ];
  for (const [k, v] of defaultSettings) {
    await run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', k, v);
  }

  // ---- 2. Tài khoản quản trị & nhân sự CMS ----
  const initialUsers = [
    { username: 'admin', display: 'Quản trị viên', role: 'admin', active: true },
    { username: 'test_admin', display: 'Test · Quản trị viên', role: 'admin', active: true },
    { username: 'test_editor', display: 'Test · Biên tập viên', role: 'editor', active: true },
    { username: 'test_referee', display: 'Test · Trọng tài', role: 'referee', active: true },
    { username: 'nguyenlong', display: 'Nguyễn Văn Long', role: 'editor', active: true, loginAgo: '2 hours' },
    { username: 'trandinh', display: 'Trần Đình Trọng', role: 'referee', active: true, loginAgo: '35 minutes' },
    { username: 'maiphuong', display: 'Lê Mai Phương', role: 'editor', active: true, loginAgo: '1 day' },
    { username: 'kiemtoan_old', display: 'Nguyễn Khắc Tuấn', role: 'referee', active: false, loginAgo: '45 days' },
  ];

  for (const u of initialUsers) {
    const pwd = process.env.ADMIN_PASSWORD || `${crypto.randomBytes(9).toString('base64url')}9a`;
    const lastLogin = u.loginAgo ? `now() - interval '${u.loginAgo}'` : 'NULL';
    await run(`INSERT INTO users(username, display_name, password_hash, role, active, last_login_at)
      VALUES (?, ?, ?, ?, ?, ${lastLogin})
      ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, active = EXCLUDED.active`,
      u.username, u.display, hashPassword(pwd), u.role, u.active);
  }

  await tx(async () => {
    const athletes = [];
    const used = new Set();
    const makePhone = () => {
      let phone;
      do { phone = pick(PREFIX) + String(Math.floor(r() * 1e7)).padStart(7, '0'); } while (used.has(phone));
      used.add(phone);
      return phone;
    };

    const picknaFile = path.join(__dirname, '../src/data/pickna-athletes.json');
    if (fs.existsSync(picknaFile)) {
      log('Nạp 971 VĐV thực tế từ file Pickna (src/data/pickna-athletes.json)...');
      const picknaList = JSON.parse(fs.readFileSync(picknaFile, 'utf8'));
      for (let i = 0; i < picknaList.length; i++) {
        const p = picknaList[i];
        const isFeatured = i < 12;
        const a = await get(`INSERT INTO athletes(full_name, nickname, phone, gender, hometown, club, points, peak_points, featured, avatar)
          VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING *`,
          p.full_name, p.nickname, makePhone(), p.gender, p.hometown, p.club, p.points, p.peak_points, isFeatured, p.avatar);

        await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'init', 'Khởi tạo từ hệ thống Pickna ranking', 'Ban tổ chức', now() - interval '60 days')",
          a.id, Math.max(1800, p.points - 50), Math.max(1800, p.points - 50));
        await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'adjust', 'Cập nhật xếp hạng', 'Ban tổ chức', now() - interval '5 days')",
          a.id, p.points - 10, p.points);

        athletes.push(a);
      }
    } else {
      // 3. Tạo 12 VĐV NỔI BẬT đại diện đủ 6 mức rank kèm ảnh chân dung thực tế
      for (const spec of FEATURED_SPEC) {
        const full = `${pick(FAMILY)} ${spec.given}`;
        const a = await get(`INSERT INTO athletes(full_name, nickname, phone, gender, hometown, club, points, peak_points, featured, avatar)
          VALUES (?,?,?,?,?,?,?,?,true,?) RETURNING *`, full, spec.nick, makePhone(), spec.gender, spec.town, spec.club, spec.points, spec.peak, spec.avatar);

        await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'init', 'Khởi tạo xếp hạng ban đầu', 'Ban tổ chức', now() - interval '90 days')",
          a.id, Math.max(1800, spec.points - 200), Math.max(1800, spec.points - 200));
        await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'tournament', 'Huy chương giải Mùa Hè 2026', 'Ban tổ chức', now() - interval '40 days')",
          a.id, spec.points - 100, spec.points - 20);
        await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'adjust', 'Cập nhật điểm sau giải đấu gần nhất', 'Ban tổ chức', now() - interval '7 days')",
          a.id, spec.points - 20, spec.points);
        athletes.push(a);
      }

      // 4. Tạo 44 VĐV còn lại phân bố tự nhiên (30 nam, 14 nữ)
      // VĐV nam đầu tiên là Vũ Văn Long có điểm cao nhất (3.680) đạt Rank 1, bật cờ nổi bật featured
      const makeOther = async (given, gender, base, isFeatured = false) => {
        const full = `${pick(FAMILY)} ${given}`;
        const points = Math.round((base + r() * 0.3) * 1000 / 5) * 5;
        const nick = r() > 0.4 ? given.split(' ').pop() + ' ' + pick(NICKS) : null;
        const peak = points + (r() > 0.5 ? Math.round(r() * 60 / 5) * 5 : 0);
        const a = await get(`INSERT INTO athletes(full_name, nickname, phone, gender, hometown, club, points, peak_points, featured)
          VALUES (?,?,?,?,?,?,?,?,?) RETURNING *`, full, nick, makePhone(), gender, pick(TOWNS), pick(CLUBS), points, peak, isFeatured);

        await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'init', 'Khởi tạo điểm trình', 'Ban tổ chức', now() - interval '80 days')",
          a.id, Math.max(1800, points - 150), Math.max(1800, points - 150));
        await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'adjust', 'Đánh giá xếp hạng', 'Ban tổ chức', now() - interval '15 days')",
          a.id, points - 30, points);
        athletes.push(a);
      };

      for (let i = 0; i < OTHER_MALE.length; i++) await makeOther(OTHER_MALE[i], 'M', 3.4 - i * 0.04, i === 0);
      for (let i = 0; i < OTHER_FEMALE.length; i++) await makeOther(OTHER_FEMALE[i], 'F', 3.1 - i * 0.05, false);
    }

    const men = athletes.filter((a) => a.gender === 'M');
    const women = athletes.filter((a) => a.gender === 'F');

    // 5. Đơn chấm trình: đầy đủ cả 3 trạng thái (Pending, Approved, Rejected)
    const subs = [
      { name: 'Lý Gia Bảo', nick: 'Bảo Lý', phone: '0912345670', gender: 'M', pts: 2750, town: 'Vinh', club: 'CLB Sông Lam (Vinh)', desc: 'Chơi được 1 năm, từng vào bán kết giải phong trào địa phương.', status: 'pending', createdAgo: '1 day' },
      { name: 'Trịnh Mai Phương', nick: 'Phương Dink', phone: '0987654320', gender: 'F', pts: 2400, town: 'Nghi Xuân', club: 'CLB Hồng Lĩnh Pickleball (Hà Tĩnh)', desc: 'Tập luyện thường xuyên 6 tháng, cần chấm điểm vào bảng xếp hạng.', status: 'pending', createdAgo: '2 days' },
      { name: 'Đỗ Hoàng Quân', nick: 'Quân Lob', phone: '0903445566', gender: 'M', pts: 3100, town: 'Hà Tĩnh', club: 'CLB Thạch Hà Dinker (Hà Tĩnh)', desc: 'Vô địch giải phong trào Thạch Hà, lối đánh volley nhanh tay.', status: 'pending', createdAgo: '3 hours' },
      { name: 'Nguyễn Hải Yến', nick: 'Yến Volley', phone: '0977112233', gender: 'F', pts: 2850, town: 'Diễn Châu', club: 'CLB Diễn Châu Pickleball', desc: 'Chơi 1.5 năm, tham gia giải CLB đạt hạng nhì đôi nữ.', status: 'pending', createdAgo: '12 hours' },

      { name: 'Vũ Hoàng Long', nick: 'Long Smash', phone: '0933112233', gender: 'M', pts: 3200, town: 'Kỳ Anh', club: 'CLB Kỳ Anh Smash (Hà Tĩnh)', desc: 'Từng đạt Á quân giải mở rộng Kỳ Anh.', status: 'approved', reviewer: 'admin', note: 'Đã xác minh video và thành tích giải mở rộng Kỳ Anh.', createdAgo: '5 days' },
      { name: 'Phạm Thảo My', nick: 'My Ace', phone: '0966889900', gender: 'F', pts: 2900, town: 'Cửa Lò', club: 'CLB Cửa Hội Dinker (Cửa Lò)', desc: 'Tập luyện 2 năm, cú giao bóng spin tốt.', status: 'approved', reviewer: 'nguyenlong', note: 'Trình độ cơ bản vững, đạt chuẩn trình 2.900.', createdAgo: '7 days' },
      { name: 'Bùi Tiến Dũng', nick: 'Dũng Erne', phone: '0988223344', gender: 'M', pts: 3350, town: 'Vinh', club: 'CLB Bến Thủy (Vinh)', desc: 'Thi đấu giải mở rộng Nghệ An 2025.', status: 'approved', reviewer: 'admin', note: 'Xác thực trình độ qua video trận bán kết.', createdAgo: '10 days' },

      { name: 'Đặng Thị Thảo', nick: null, phone: '0977889900', gender: 'F', pts: 2150, town: 'Đô Lương', club: 'CLB Đô Lương Pickle', desc: 'Vừa hoàn thành khóa học cơ bản 1 tháng.', status: 'rejected', reviewer: 'admin', note: 'Chưa đủ điều kiện đánh giá, cần gửi video thi đấu thực tế.', createdAgo: '4 days' },
      { name: 'Trần Minh Trí', nick: 'Trí Speed', phone: '0911556677', gender: 'M', pts: 3450, town: 'Hoàng Mai', club: 'CLB Hoàng Mai Smash (Nghệ An)', desc: 'Đề xuất xếp hạng trình độ kim cương.', status: 'rejected', reviewer: 'nguyenlong', note: 'Điểm đề xuất vượt quá trình độ quan sát thực tế (đề xuất 3.450 -> nên chấm 2.800).', createdAgo: '8 days' },
      { name: 'Hoàng Quốc Khánh', nick: null, phone: '0933778899', gender: 'M', pts: 2600, town: 'Cẩm Xuyên', club: 'CLB Thiên Cầm Sunshine (Hà Tĩnh)', desc: 'Chơi tự do tại sân nhà.', status: 'rejected', reviewer: 'admin', note: 'Số điện thoại không chính chủ và thông tin chưa rõ ràng.', createdAgo: '15 days' },
    ];

    for (const s of subs) {
      await run(`INSERT INTO submissions(full_name, nickname, phone, phone_verified, gender, points, hometown, club, description, status, reviewed_by, reviewed_at, admin_note, created_at)
        VALUES (?, ?, ?, true, ?, ?, ?, ?, ?, ?, ?, ${s.reviewer ? 'now() - interval \'1 day\'' : 'NULL'}, ?, now() - interval '${s.createdAgo}')`,
        s.name, s.nick, s.phone, s.gender, s.pts, s.town, s.club, s.desc, s.status, s.reviewer || null, s.note || null);
    }

    const prizes = (a, b, c) => JSON.stringify([{ label: 'Vô địch', amount: a }, { label: 'Á quân', amount: b }, { label: '02 Giải ba', amount: c }]);
    const reg = async (divisionId, a, b, status = 'approved', note = null) => run(`INSERT INTO registrations(division_id, athlete1_id, name1, phone1, points1,
      athlete2_id, name2, phone2, points2, phone_verified, status, admin_note) VALUES (?,?,?,?,?,?,?,?,?, true, ?, ?)`,
    divisionId, a.id, a.nickname || a.full_name, a.phone, a.points, b.id, b.nickname || b.full_name, b.phone, b.points, status, note);

    // 6. Giải 1: ĐANG DIỄN RA (Có livestream, nhánh knockout kịch tính)
    const ev1 = await get(`INSERT INTO events(slug, name, venue, address, start_date, end_date, registration_open, featured, published, description, banner)
      VALUES ('mua-thu-open-2026', 'Mùa Thu Open 2026', 'Cụm sân Pickleball Bến Thủy', 'Đường Nguyễn Du, Bến Thủy, Vinh, Nghệ An', ?, ?, false, true, true,
      'Giải phong trào mở rộng mùa thu quy tụ các tay vợt hàng đầu Nghệ An và Hà Tĩnh.', '/static/img/events/mua-thu-open-2026.svg') RETURNING id`, addDays(0), addDays(2));
    const d1 = await get(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_total_points, gender_rule, prizes, sort_order, banner)
      VALUES (?, 'Đôi nam 6.5', 'Tối đa 16 đôi · Tổng trình ≤ 6.500', 'knockout', 16, 6500, 'male', ?, 1, '/static/img/divisions/doi-nam-6-5.svg') RETURNING id`, ev1.id, prizes('15000000', '7000000', '3000000'));
    const d2 = await get(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_total_points, gender_rule, prizes, sort_order, banner)
      VALUES (?, 'Đôi nam nữ 5.8', 'Tối đa 16 đôi · Tổng trình ≤ 5.800', 'knockout', 16, 5800, 'mixed', ?, 2, '/static/img/divisions/doi-nam-nu-5-8.svg') RETURNING id`, ev1.id, prizes('10000000', '5000000', '2000000'));

    for (let i = 0; i < 16; i += 2) await reg(d1.id, men[i], men[i + 1]);
    for (let i = 0; i < 8; i++) await reg(d2.id, men[i + 16], women[i]);

    // Livestream có sẵn video YouTube thực tế để test trình phát và overlay
    const s1 = await get(`INSERT INTO live_streams(event_id, court, title, status, youtube_video_id, scheduled_start, actual_start, sort_order)
      VALUES (?, 'Sân trung tâm (Court 1)', 'Mùa Thu Open 2026 – Trận Bán Kết 1', 'live', 'dQw4w9WgXcQ', now() - interval '2 hours', now() - interval '2 hours', 1) RETURNING id`, ev1.id);
    const s2 = await get(`INSERT INTO live_streams(event_id, court, title, status, youtube_video_id, scheduled_start, actual_start, sort_order)
      VALUES (?, 'Sân 2 (Court 2)', 'Mùa Thu Open 2026 – Vòng Tứ Kết Đôi Nam Nữ', 'live', 'dQw4w9WgXcQ', now() - interval '1 hour', now() - interval '1 hour', 2) RETURNING id`, ev1.id);

    // 7. Giải 2: SẮP DIỄN RA (Đang mở đăng ký thi đấu, có các đơn mới & từ chối)
    const ev2 = await get(`INSERT INTO events(slug, name, venue, address, start_date, end_date, registration_open, featured, published, description, banner)
      VALUES ('dong-xuan-cup-2026', 'Đông Xuân Cup 2026', 'Sân Pickleball Hồng Lĩnh', 'Đường Trần Phú, Hồng Lĩnh, Hà Tĩnh', ?, ?, true, true, true,
      'Giải đấu thường niên chào xuân 2026 với cơ cấu giải thưởng lớn và nhiều hạng mục thi đấu hấp dẫn.', '/static/img/events/dong-xuan-cup-2026.svg') RETURNING id`, addDays(12), addDays(14));
    const d3 = await get(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_total_points, gender_rule, prizes, sort_order, banner)
      VALUES (?, 'Đôi nam Newbie (Tổng ≤ 5.000)', 'Dành cho các tay vợt mới thi đấu', 'knockout', 32, 5000, 'male', ?, 1, '/static/img/divisions/doi-nam-newbie.svg') RETURNING id`, ev2.id, prizes('12000000', '6000000', '2500000'));
    const d3_2 = await get(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_total_points, gender_rule, prizes, sort_order, banner)
      VALUES (?, 'Đôi nam nữ hỗn hợp 5.5', 'Tối đa 24 đôi', 'knockout', 24, 5500, 'mixed', ?, 2, '/static/img/divisions/doi-nam-nu-hon-hop-5-5.svg') RETURNING id`, ev2.id, prizes('10000000', '5000000', '2000000'));
    const d3_3 = await get(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_player_points, gender_rule, prizes, sort_order, banner)
      VALUES (?, 'Đôi nữ 3.0', 'Mỗi VĐV ≤ 3.000', 'knockout', 16, 3000, 'female', ?, 3, '/static/img/divisions/doi-nu-3-0.svg') RETURNING id`, ev2.id, prizes('8000000', '4000000', '1500000'));

    // Đăng ký giải 2: phủ kín cả 3 bảng đấu
    for (let i = 24; i < 30; i += 2) await reg(d3.id, men[i], men[i + 1], 'approved');
    await reg(d3.id, men[30], men[31], 'new');
    await reg(d3.id, men[0], men[1], 'rejected', 'Tổng điểm 7.030 vượt quá giới hạn 5.000 của bảng Newbie.');

    for (let i = 8; i < 12; i++) await reg(d3_2.id, men[i + 12], women[i], 'approved');
    await reg(d3_2.id, men[14], women[12], 'new');
    await reg(d3_2.id, men[15], women[13], 'new');

    for (let i = 0; i < 6; i += 2) await reg(d3_3.id, women[i], women[i + 1], 'approved');
    await reg(d3_3.id, women[6], women[7], 'new');

    // 8. Giải 3: ĐÃ KẾT THÚC (Vòng tròn đồng đội tiếp sức chạm 55 điểm)
    const ev3 = await get(`INSERT INTO events(slug, name, venue, address, start_date, end_date, registration_open, published, description, banner)
      VALUES ('super-cup-tiep-suc-2026', 'Super Cup Đồng Đội Tiếp Sức 2026', 'Cụm sân Cửa Lò Pickleball Arena', 'Đường Bình Minh, Cửa Lò, Nghệ An', ?, ?, false, true,
      'Giải đồng đội tiếp sức thể thức mới chạm 55 điểm qua 5 chặng kịch tính.', '/static/img/events/super-cup-tiep-suc-2026.svg') RETURNING id`, addDays(-25), addDays(-23));
    const d4 = await get(`INSERT INTO divisions(event_id, name, subtitle, team_type, format, relay_legs, relay_step, prizes, sort_order, banner)
      VALUES (?, 'Đồng đội tiếp sức Master', '4 đội · 5 chặng · chạm 55 điểm', 'team', 'roundrobin', 5, 11, ?, 1, '/static/img/divisions/dong-doi-tiep-suc-master.svg') RETURNING id`, ev3.id, prizes('Cúp vô địch + 20000000', '10000000', '5000000'));
    const teamNames = ['Sông Lam Pickle Warriors', 'Hồng Lĩnh Dinker Stars', 'Cửa Lò Smashers', 'Thiên Cầm Sunshine'];
    for (let t = 0; t < 4; t++) {
      const members = men.slice(t * 4, t * 4 + 4).map((a) => a.full_name).join('\n');
      await run('INSERT INTO teams(division_id, name, members, seed) VALUES (?,?,?,?)', d4.id, teamNames[t], members, t + 1);
    }
    const s3 = await get(`INSERT INTO live_streams(event_id, court, title, status, youtube_video_id, scheduled_start, actual_start, actual_end, sort_order)
      VALUES (?, 'Sân trung tâm', 'Chung kết Super Cup Đồng Đội Tiếp Sức 2026', 'ended', 'dQw4w9WgXcQ', now() - interval '24 days', now() - interval '24 days', now() - interval '24 days' + interval '4 hours', 1) RETURNING id`, ev3.id);

    // 9. Giải 4: BẢN NHÁP (Chưa công khai - để test tính năng bản nháp trong CMS)
    await run(`INSERT INTO events(slug, name, venue, address, start_date, end_date, registration_open, featured, published, description, banner)
      VALUES ('giai-vo-dich-quoc-gia-2026', 'Giải Vô Địch Pickleball Nghệ Tĩnh 2026', 'Nhà thi đấu đa năng Hà Tĩnh', 'Đường Hà Huy Tập, Hà Tĩnh',
      ?, ?, false, false, false, 'Giải vô địch hai tỉnh Nghệ An – Hà Tĩnh quy tụ các tay vợt hàng đầu tranh cúp vô địch Nghệ Tĩnh.', '/static/img/events/giai-vo-dich-quoc-gia-2026.svg')`, addDays(45), addDays(48));

    return { d1: d1.id, d2: d2.id, d4: d4.id, s1: s1.id, s2: s2.id, s3: s3.id, men, women };
  }).then(async (ids) => {
    const { d1, d2, d4, s1, s2, s3, men, women } = ids;

    // ---- Nhánh đấu & kết quả trận đấu ----
    await bracket.syncTeamsFromRegistrations(d1);
    await bracket.syncTeamsFromRegistrations(d2);
    await bracket.generateKnockout(d1, { randomize: false });
    await bracket.generateKnockout(d2, { randomize: false });
    const score = (w) => (w ? [11, Math.floor(r() * 8) + 2] : [Math.floor(r() * 8) + 2, 11]);

    const k1 = await bracket.loadMatches(d1);
    let offset = 0;
    for (const m of k1.filter((x) => x.round_order === 1)) {
      const [a, b] = score(r() > 0.4);
      offset += 900;
      await bracket.updateMatch(m.id, { score_a: a, score_b: b, status: 'done', court: 'Sân 1', live_stream_id: s1, video_offset: offset });
    }
    const semis = (await bracket.loadMatches(d1)).filter((x) => x.round_order === 2);
    if (semis.length >= 2) {
      await bracket.updateMatch(semis[0].id, { score_a: 11, score_b: 8, status: 'done', court: 'Sân 1', live_stream_id: s1, video_offset: offset + 900 });
      await bracket.updateMatch(semis[1].id, { score_a: 8, score_b: 6, status: 'live', court: 'Sân 1', live_stream_id: s1, video_offset: offset + 1800 });
    }

    const k2 = await bracket.loadMatches(d2);
    for (const m of k2.filter((x) => x.round_order === 1 && x.status !== 'done')) {
      const [a, b] = score(r() > 0.5);
      await bracket.updateMatch(m.id, { score_a: a, score_b: b, status: 'done', court: 'Sân 2', live_stream_id: s2, video_offset: 600 });
    }

    // Vòng tròn tiếp sức Super Cup
    await bracket.generateRoundRobin(d4, { randomize: false, relayLegs: 5 });
    const rr = await bracket.loadMatches(d4);
    const results = [[55, 43], [55, 48], [52, 55], [54, 55], [55, 40], [45, 55]];
    let vo = 0;
    for (let i = 0; i < rr.length; i++) {
      vo += 2400;
      await bracket.updateMatch(rr[i].id, {
        score_a: results[i % results.length][0], score_b: results[i % results.length][1], status: 'done',
        legs: ['BB', 'BB', 'AB', 'AA', 'AB'], current_leg: 5, live_stream_id: s3, video_offset: vo,
      });
    }

    // 10. Bảng vinh danh gắn trực tiếp hồ sơ VĐV (Honors & Achievements)
    // Division 1: Đôi nam 6.5
    await run('INSERT INTO honors(division_id, place, name1, athlete1_id, name2, athlete2_id, sort_order) VALUES (?, 1, ?, ?, ?, ?, 1)',
      d1, men[0].nickname || men[0].full_name, men[0].id, men[1].nickname || men[1].full_name, men[1].id);
    await run('INSERT INTO honors(division_id, place, name1, athlete1_id, name2, athlete2_id, sort_order) VALUES (?, 2, ?, ?, ?, ?, 2)',
      d1, men[4].nickname || men[4].full_name, men[4].id, men[6].nickname || men[6].full_name, men[6].id);
    await run('INSERT INTO honors(division_id, place, name1, athlete1_id, name2, athlete2_id, sort_order) VALUES (?, 3, ?, ?, ?, ?, 3)',
      d1, men[8].nickname || men[8].full_name, men[8].id, men[10].nickname || men[10].full_name, men[10].id);

    // Division 2: Đôi nam nữ 5.8
    await run('INSERT INTO honors(division_id, place, name1, athlete1_id, name2, athlete2_id, sort_order) VALUES (?, 1, ?, ?, ?, ?, 1)',
      d2, men[2].nickname || men[2].full_name, men[2].id, women[0].nickname || women[0].full_name, women[0].id);
    await run('INSERT INTO honors(division_id, place, name1, athlete1_id, name2, athlete2_id, sort_order) VALUES (?, 2, ?, ?, ?, ?, 2)',
      d2, men[4].nickname || men[4].full_name, men[4].id, women[1].nickname || women[1].full_name, women[1].id);
    await run('INSERT INTO honors(division_id, place, name1, athlete1_id, name2, athlete2_id, sort_order) VALUES (?, 3, ?, ?, ?, ?, 3)',
      d2, men[6].nickname || men[6].full_name, men[6].id, women[2].nickname || women[2].full_name, women[2].id);

    // Division 4: Super Cup Tiếp Sức
    const table = bracket.standings(await bracket.loadTeams(d4), await bracket.loadMatches(d4));
    const tmap = new Map((await bracket.loadTeams(d4)).map((t) => [t.id, t]));
    const places = [1, 2, 3, 3];
    for (let i = 0; i < Math.min(4, table.rows.length); i++) {
      const team = tmap.get(table.rows[i].id);
      await run('INSERT INTO honors(division_id, place, name1, athlete1_id, athlete2_id, sort_order) VALUES (?,?,?,?,?,?)',
        d4, places[i], team.name, men[i * 2]?.id || null, men[i * 2 + 1]?.id || null, i);
    }
  });

  // 11. Đối tác tài trợ (Partners & Sponsors) - có cả đối tác đang hiển thị và đối tác ẩn để test bộ lọc
  const sponsors = [
    // Nhà tài trợ HƯ CẤU (không dùng tên/logo thương hiệu thật khi chưa được phép), không gắn link ra ngoài
    { name: 'Dinkra Paddle', url: '', sort: 1, visible: true, logo: '/static/img/partners/dinkra.svg' },
    { name: 'Lam Giang Sportswear', url: '', sort: 2, visible: true, logo: '/static/img/partners/lam-giang.svg' },
    { name: 'Pickvia Pickleball Gear', url: '', sort: 3, visible: true, logo: '/static/img/partners/pickvia.svg' },
    { name: 'Nước điện giải Hydrava', url: '', sort: 4, visible: true, logo: '/static/img/partners/hydrava.svg' },
    { name: 'Lumira Resort Cửa Lò', url: '', sort: 5, visible: true, logo: '/static/img/partners/lumira.svg' },
    { name: 'Zenmo Fitness', url: '', sort: 6, visible: true, logo: '/static/img/partners/zenmo.svg' },
    { name: 'Quỹ Pickleball Cộng Đồng Nghệ Tĩnh', url: '', sort: 7, visible: false, logo: '/static/img/partners/quy-nghe-tinh.svg' },
  ];
  for (const s of sponsors) {
    await run('INSERT INTO partners(name, url, sort_order, visible, logo) VALUES (?, ?, ?, ?, ?)', s.name, s.url, s.sort, s.visible, s.logo);
  }

  // 12. Nhật ký OTP (OTP Logs) - Giúp trang /admin/nhat-ky-otp hiển thị đầy đủ KPI 14 ngày và bảng danh sách
  const otpSamples = [
    { phone: '0912345670', purpose: 'submission', provider: 'SpeedSMS', status: 'delivered', attempts: 0, verified: true, ago: '2 hours' },
    { phone: '0987654320', purpose: 'registration', provider: 'SpeedSMS', status: 'delivered', attempts: 1, verified: true, ago: '5 hours' },
    { phone: '0903112233', purpose: 'submission', provider: 'eSMS', status: 'delivered', attempts: 0, verified: true, ago: '1 day' },
    { phone: '0933445566', purpose: 'registration', provider: 'SpeedSMS', status: 'delivered', attempts: 0, verified: true, ago: '1 day' },
    { phone: '0966778899', purpose: 'admin_login', provider: 'Mock', status: 'success', attempts: 0, verified: true, ago: '2 days' },
    { phone: '0988001122', purpose: 'submission', provider: 'SpeedSMS', status: 'delivered', attempts: 2, verified: true, ago: '2 days' },
    { phone: '0911223344', purpose: 'registration', provider: 'SpeedSMS', status: 'delivered', attempts: 0, verified: true, ago: '3 days' },
    { phone: '0944556677', purpose: 'submission', provider: 'eSMS', status: 'sent', attempts: 3, verified: false, ago: '3 days' },
    { phone: '0977889900', purpose: 'submission', provider: 'SpeedSMS', status: 'delivered', attempts: 0, verified: true, ago: '4 days' },
    { phone: '0933887766', purpose: 'registration', provider: 'SpeedSMS', status: 'delivered', attempts: 0, verified: true, ago: '5 days' },
    { phone: '0909123456', purpose: 'submission', provider: 'Twilio', status: 'delivered', attempts: 0, verified: true, ago: '6 days' },
    { phone: '0987111222', purpose: 'registration', provider: 'SpeedSMS', status: 'delivered', attempts: 1, verified: true, ago: '7 days' },
    { phone: '0918333444', purpose: 'submission', provider: 'SpeedSMS', status: 'delivered', attempts: 0, verified: true, ago: '8 days' },
    { phone: '0968555666', purpose: 'registration', provider: 'eSMS', status: 'delivered', attempts: 0, verified: true, ago: '9 days' },
    { phone: '0942777888', purpose: 'submission', provider: 'SpeedSMS', status: 'expired', attempts: 0, verified: false, ago: '10 days' },
    { phone: '0908999000', purpose: 'registration', provider: 'SpeedSMS', status: 'delivered', attempts: 0, verified: true, ago: '11 days' },
  ];
  for (const o of otpSamples) {
    const verifiedAt = o.verified ? `now() - interval '${o.ago}' + interval '45 seconds'` : 'NULL';
    await run(`INSERT INTO otp_requests(phone, purpose, code_hash, provider, provider_status, attempts, verified_at, expires_at, ip, created_at)
      VALUES (?, ?, 'hash_sample', ?, ?, ?, ${verifiedAt}, now() - interval '${o.ago}' + interval '5 minutes', '113.161.42.10', now() - interval '${o.ago}')`,
      o.phone, o.purpose, o.provider, o.status, o.attempts);
  }

  // 13. Nhật ký thao tác (Audit Logs) - Giúp trang /admin/nhat-ky hiển thị lịch sử quản trị chi tiết
  const auditSamples = [
    { user: 'admin', action: 'update_settings', target: 'settings', detail: 'Cập nhật cấu hình màu sắc giao diện và số VĐV nổi bật', ago: '1 hour' },
    { user: 'trandinh', action: 'update_match_score', target: 'match:99', detail: 'Cập nhật tỉ số Bán kết 2: 8 - 6', ago: '2 hours' },
    { user: 'nguyenlong', action: 'approve_submission', target: 'submission:46', detail: 'Duyệt đơn chấm trình VĐV Vũ Hoàng Long (3.200 điểm)', ago: '5 hours' },
    { user: 'admin', action: 'create_stream', target: 'stream:1', detail: 'Tạo buổi phát Court 1 giải Mùa Thu Open 2026', ago: '6 hours' },
    { user: 'admin', action: 'publish_event', target: 'event:mua-thu-open-2026', detail: 'Công khai giải đấu Mùa Thu Open 2026', ago: '1 day' },
    { user: 'nguyenlong', action: 'approve_registration', target: 'registration:12', detail: 'Duyệt đăng ký bảng Đôi nam nữ 5.8', ago: '1 day' },
    { user: 'admin', action: 'adjust_points', target: 'athlete:1', detail: 'Cập nhật điểm VĐV Minh Khoa từ 3.630 lên 3.650 điểm', ago: '2 days' },
    { user: 'admin', action: 'reject_submission', target: 'submission:47', detail: 'Từ chối đơn chấm trình do thiếu video đối kháng thực tế', ago: '2 days' },
    { user: 'maiphuong', action: 'create_partner', target: 'partner:Pickvia', detail: 'Thêm nhà tài trợ Pickvia Pickleball Gear vào danh sách đối tác', ago: '3 days' },
    { user: 'admin', action: 'create_event', target: 'event:dong-xuan-cup-2026', detail: 'Tạo giải đấu Đông Xuân Cup 2026 và mở đăng ký trực tuyến', ago: '4 days' },
    { user: 'trandinh', action: 'login', target: 'user:trandinh', detail: 'Đăng nhập vào hệ thống điều hành trọng tài', ago: '5 days' },
    { user: 'admin', action: 'create_athlete', target: 'athlete:Nguyễn Minh Khoa', detail: 'Tạo mới hồ sơ VĐV kim cương Nguyễn Minh Khoa', ago: '7 days' },
  ];
  for (const a of auditSamples) {
    await run(`INSERT INTO audit_logs(username, action, target, detail, ip, created_at)
      VALUES (?, ?, ?, ?, '14.169.35.88', now() - interval '${a.ago}')`,
      a.user, a.action, a.target, a.detail);
  }

  // Sinh ảnh mẫu cho các mục chưa có ảnh
  const { useBlob } = require('../src/lib/upload');
  if (useBlob() || !process.env.VERCEL) {
    await require('./fake-images').fillMissingImages({ log });
  } else {
    log('Bỏ qua ảnh mẫu: chưa cấu hình Vercel Blob (BLOB_READ_WRITE_TOKEN).');
  }

  const athleteCountFinal = (await get('SELECT COUNT(*) AS c FROM athletes')).c;
  const eventCountFinal = (await get('SELECT COUNT(*) AS c FROM events')).c;
  const matchCountFinal = (await get('SELECT COUNT(*) AS c FROM matches')).c;
  const subCountFinal = (await get('SELECT COUNT(*) AS c FROM submissions')).c;
  const otpCountFinal = (await get('SELECT COUNT(*) AS c FROM otp_requests')).c;
  const auditCountFinal = (await get('SELECT COUNT(*) AS c FROM audit_logs')).c;

  log(`✔ ĐÃ NẠP TOÀN BỘ DỮ LIỆU FULL TÍNH NĂNG THÀNH CÔNG:`);
  log(`  • ${athleteCountFinal} VĐV (12 VĐV nổi bật đủ 6 mức rank kèm ảnh Unsplash sắc nét)`);
  log(`  • ${eventCountFinal} Giải đấu (Đang live, Sắp diễn ra, Đã kết thúc, Bản nháp)`);
  log(`  • ${matchCountFinal} Trận đấu (Nhánh Knockout, Vòng tròn tiếp sức, Trận live kèm video YouTube)`);
  log(`  • ${subCountFinal} Đơn chấm trình (đầy đủ các tab: Chờ duyệt, Đã duyệt, Đã từ chối)`);
  log(`  • Bảng vinh danh & Thành tích thi đấu đã liên kết hồ sơ VĐV`);
  log(`  • ${otpCountFinal} Bản ghi nhật ký OTP (kèm KPI thống kê 14 ngày)`);
  log(`  • ${auditCountFinal} Bản ghi nhật ký quản trị CMS`);
}

module.exports = { seed };

if (require.main === module) {
  const cfgFile = path.join(__dirname, '..', 'data', 'pg-dev.json');
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL && fs.existsSync(cfgFile)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
      process.env.DATABASE_URL = `postgres://postgres:${encodeURIComponent(cfg.password)}@127.0.0.1:${cfg.port}/pickleball`;
    } catch {}
  }
  const db = require('../src/db');
  const force = process.argv.includes('--force') || process.argv.includes('--clean');
  db.migrate()
    .then(() => seed({ force }))
    .then(() => db.close())
    .catch((e) => { console.error(e); process.exit(1); });
}
