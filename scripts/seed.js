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
const CLUBS = [
  'CLB Sông Lam (Vinh)', 'CLB Bến Thủy (Nghệ An)', 'CLB Cửa Lò Pickleball', 'CLB Ba Đình (Hà Nội)',
  'CLB Sài Gòn Dinker', 'CLB Phượng Hoàng (Đà Nẵng)', 'CLB Thủ Đức Pickleball', 'CLB Bình Dương Smash',
  'CLB Hải Phòng Pickle', 'CLB Tây Hồ Dinker', 'CLB Vũng Tàu Sunshine', 'CLB Cần Thơ Riverside',
];
const TOWNS = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Vinh', 'Cửa Lò', 'Hà Tĩnh', 'Hải Phòng', 'Bình Dương', 'Cần Thơ', 'Vũng Tàu', 'Nha Trang', 'Quảng Ninh'];
const PREFIX = ['090', '091', '093', '094', '096', '097', '098', '086', '088', '089', '070', '077', '032', '035', '038', '081', '083', '085'];
const NICKS = ['Smash', 'Dink', 'Volley', 'Lob', 'Spin', 'Erne', 'Bert', 'ATP', 'Ace', 'Fire', 'Speed'];

// 12 VĐV nổi bật đại diện đầy đủ 6 mức rank (mỗi mức 1 Nam, 1 Nữ)
// Diamond >= 3400 | Platinum 3300-3395 | Gold 3200-3295 | Silver 3100-3195 | Bronze 3000-3095 | Iron < 3000
const FEATURED_SPEC = [
  { given: 'Minh Khoa', gender: 'M', points: 3650, peak: 3700, nick: 'Khoa ATP', club: 'CLB Sài Gòn Dinker', town: 'TP. Hồ Chí Minh' }, // Kim cương
  { given: 'Ngọc Lan', gender: 'F', points: 3450, peak: 3500, nick: 'Lan Volley', club: 'CLB Ba Đình (Hà Nội)', town: 'Hà Nội' }, // Kim cương
  { given: 'Quốc Bảo', gender: 'M', points: 3380, peak: 3420, nick: 'Bảo Bert', club: 'CLB Sông Lam (Vinh)', town: 'Vinh' }, // Bạch kim
  { given: 'Thu Hà', gender: 'F', points: 3320, peak: 3360, nick: 'Hà Smash', club: 'CLB Phượng Hoàng (Đà Nẵng)', town: 'Đà Nẵng' }, // Bạch kim
  { given: 'Đức Anh', gender: 'M', points: 3270, peak: 3300, nick: 'Đức Erne', club: 'CLB Bến Thủy (Nghệ An)', town: 'Nghệ An' }, // Vàng
  { given: 'Phương Anh', gender: 'F', points: 3215, peak: 3250, nick: 'Phương Spin', club: 'CLB Tây Hồ Dinker', town: 'Hà Nội' }, // Vàng
  { given: 'Hải Nam', gender: 'M', points: 3180, peak: 3200, nick: 'Nam Ace', club: 'CLB Thủ Đức Pickleball', town: 'TP. Hồ Chí Minh' }, // Bạc
  { given: 'Minh Thư', gender: 'F', points: 3120, peak: 3160, nick: 'Thư Dink', club: 'CLB Cửa Lò Pickleball', town: 'Cửa Lò' }, // Bạc
  { given: 'Gia Huy', gender: 'M', points: 3080, peak: 3100, nick: 'Huy Fire', club: 'CLB Bình Dương Smash', town: 'Bình Dương' }, // Đồng
  { given: 'Bảo Ngọc', gender: 'F', points: 3025, peak: 3050, nick: 'Ngọc Lob', club: 'CLB Hải Phòng Pickle', town: 'Hải Phòng' }, // Đồng
  { given: 'Thanh Tùng', gender: 'M', points: 2850, peak: 2900, nick: 'Tùng Speed', club: 'CLB Vũng Tàu Sunshine', town: 'Vũng Tàu' }, // Sắt
  { given: 'Khánh Linh', gender: 'F', points: 2680, peak: 2720, nick: 'Linh Newbie', club: 'CLB Cần Thơ Riverside', town: 'Cần Thơ' }, // Sắt
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

  // ---- Tài khoản quản trị ban đầu ----
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) { password = `${crypto.randomBytes(9).toString('base64url')}9a`; generated = true; }
  if (!(await get('SELECT 1 FROM users WHERE username = ?', username))) {
    await run("INSERT INTO users(username, display_name, password_hash, role) VALUES (?, 'Quản trị viên', ?, 'admin')", username, hashPassword(password));
    if (generated) {
      const file = path.join(ensureDir(DATA_DIR), 'initial-admin.txt');
      try {
        fs.writeFileSync(file, `Tài khoản CMS ban đầu (đổi mật khẩu sau lần đăng nhập đầu tiên, rồi xóa file này)\nTên đăng nhập: ${username}\nMật khẩu: ${password}\n`, { mode: 0o600 });
        log(`Đã tạo tài khoản quản trị "${username}". Mật khẩu ghi trong ${path.relative(process.cwd(), file)}`);
      } catch {}
    } else {
      log(`Đã tạo tài khoản quản trị "${username}" với mật khẩu từ ADMIN_PASSWORD.`);
    }
  }

  const athleteCount = (await get('SELECT COUNT(*) AS c FROM athletes')).c;
  if (force) {
    log('Đang dọn sạch dữ liệu cũ để nạp lại dữ liệu mẫu...');
    await run('TRUNCATE matches, honors, teams, registrations, live_streams, divisions, events, submissions, point_history, athletes, partners CASCADE');
  } else if (athleteCount > 0) {
    log(`CSDL đã có sẵn ${athleteCount} VĐV, bỏ qua dữ liệu mẫu. (Dùng npm run seed -- --force nếu muốn nạp lại từ đầu).`);
    return;
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

    // 1. Tạo 12 VĐV NỔI BẬT đại diện đủ 6 mức rank
    for (const spec of FEATURED_SPEC) {
      const full = `${pick(FAMILY)} ${spec.given}`;
      const a = await get(`INSERT INTO athletes(full_name, nickname, phone, gender, hometown, club, points, peak_points, featured)
        VALUES (?,?,?,?,?,?,?,?,true) RETURNING *`, full, spec.nick, makePhone(), spec.gender, spec.town, spec.club, spec.points, spec.peak);

      await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'init', 'Khởi tạo xếp hạng ban đầu', 'Ban tổ chức', now() - interval '90 days')",
        a.id, Math.max(1800, spec.points - 200), Math.max(1800, spec.points - 200));
      await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'tournament', 'Huy chương giải Mùa Hè 2026', 'Ban tổ chức', now() - interval '40 days')",
        a.id, spec.points - 100, spec.points - 20);
      await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'adjust', 'Cập nhật điểm sau giải đấu gần nhất', 'Ban tổ chức', now() - interval '7 days')",
        a.id, spec.points - 20, spec.points);
      athletes.push(a);
    }

    // 2. Tạo 44 VĐV còn lại phân bố tự nhiên (30 nam, 14 nữ)
    const makeOther = async (given, gender, base) => {
      const full = `${pick(FAMILY)} ${given}`;
      const points = Math.round((base + r() * 0.3) * 1000 / 5) * 5;
      const nick = r() > 0.4 ? given.split(' ').pop() + ' ' + pick(NICKS) : null;
      const peak = points + (r() > 0.5 ? Math.round(r() * 60 / 5) * 5 : 0);
      const a = await get(`INSERT INTO athletes(full_name, nickname, phone, gender, hometown, club, points, peak_points, featured)
        VALUES (?,?,?,?,?,?,?,?,false) RETURNING *`, full, nick, makePhone(), gender, pick(TOWNS), pick(CLUBS), points, peak);

      await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'init', 'Khởi tạo điểm trình', 'Ban tổ chức', now() - interval '80 days')",
        a.id, Math.max(1800, points - 150), Math.max(1800, points - 150));
      await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'adjust', 'Đánh giá xếp hạng', 'Ban tổ chức', now() - interval '15 days')",
        a.id, points - 30, points);
      athletes.push(a);
    };

    for (let i = 0; i < OTHER_MALE.length; i++) await makeOther(OTHER_MALE[i], 'M', 3.4 - i * 0.04);
    for (let i = 0; i < OTHER_FEMALE.length; i++) await makeOther(OTHER_FEMALE[i], 'F', 3.1 - i * 0.05);

    const men = athletes.filter((a) => a.gender === 'M');
    const women = athletes.filter((a) => a.gender === 'F');

    // ---- Đơn chấm trình chờ duyệt ----
    await run(`INSERT INTO submissions(full_name, nickname, phone, phone_verified, gender, points, hometown, club, description, status)
      VALUES ('Lý Gia Bảo', 'Bảo Lý', '0912345670', true, 'M', 2750, 'Vinh', 'CLB Sông Lam', 'Chơi được 1 năm, từng vào bán kết giải phong trào.', 'pending'),
             ('Trịnh Mai Phương', 'Phương Dink', '0987654320', true, 'F', 2400, 'Hà Nội', 'CLB Ba Đình', 'Tập luyện thường xuyên 6 tháng, cần chấm điểm vào bảng.', 'pending'),
             ('Vũ Hoàng Long', 'Long Smash', '0933112233', true, 'M', 3200, 'TP. Hồ Chí Minh', 'CLB Sài Gòn Dinker', 'Từng đạt Á quân giải quận 7.', 'approved'),
             ('Đặng Thị Thảo', NULL, '0977889900', true, 'F', 2150, 'Đà Nẵng', 'CLB Phượng Hoàng', 'Vừa hoàn thành khóa học cơ bản.', 'rejected')`);

    const prizes = (a, b, c) => JSON.stringify([{ label: 'Vô địch', amount: a }, { label: 'Á quân', amount: b }, { label: '02 Giải ba', amount: c }]);
    const reg = async (divisionId, a, b, status = 'approved') => run(`INSERT INTO registrations(division_id, athlete1_id, name1, phone1, points1,
      athlete2_id, name2, phone2, points2, phone_verified, status) VALUES (?,?,?,?,?,?,?,?,?, true, ?)`,
    divisionId, a.id, a.nickname || a.full_name, a.phone, a.points, b.id, b.nickname || b.full_name, b.phone, b.points, status);

    // ---- Giải 1: Đang diễn ra: có livestream, nhánh loại trực tiếp ----
    const ev1 = await get(`INSERT INTO events(slug, name, venue, address, start_date, end_date, registration_open, featured, published, description)
      VALUES ('mua-thu-open-2026', 'Mùa Thu Open 2026', 'Cụm sân Pickleball Bến Thủy', 'Đường Nguyễn Du, TP. Vinh', ?, ?, false, true, true,
      'Giải phong trào mở rộng mùa thu quy tụ các tay vợt hàng đầu miền Trung và cả nước.') RETURNING id`, addDays(0), addDays(2));
    const d1 = await get(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_total_points, gender_rule, prizes, sort_order)
      VALUES (?, 'Đôi nam 6.5', 'Tối đa 16 đôi · Tổng trình ≤ 6.500', 'knockout', 16, 6500, 'male', ?, 1) RETURNING id`, ev1.id, prizes('15000000', '7000000', '3000000'));
    const d2 = await get(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_total_points, gender_rule, prizes, sort_order)
      VALUES (?, 'Đôi nam nữ 5.8', 'Tối đa 16 đôi · Tổng trình ≤ 5.800', 'knockout', 16, 5800, 'mixed', ?, 2) RETURNING id`, ev1.id, prizes('10000000', '5000000', '2000000'));
    for (let i = 0; i < 16; i += 2) await reg(d1.id, men[i], men[i + 1]);
    for (let i = 0; i < 8; i++) await reg(d2.id, men[i + 16], women[i]);
    const s1 = await get(`INSERT INTO live_streams(event_id, court, title, status, scheduled_start, actual_start, sort_order)
      VALUES (?, 'Sân trung tâm (Court 1)', 'Mùa Thu Open 2026 – Trận Bán Kết 1', 'live', now() - interval '2 hours', now() - interval '2 hours', 1) RETURNING id`, ev1.id);
    await run(`INSERT INTO live_streams(event_id, court, title, status, scheduled_start, sort_order)
      VALUES (?, 'Sân 2 (Court 2)', 'Mùa Thu Open 2026 – Vòng Tứ Kết Đôi Nam Nữ', 'scheduled', now() + interval '1 hour', 2)`, ev1.id);

    // ---- Giải 2: Sắp diễn ra: mở đăng ký ----
    const ev2 = await get(`INSERT INTO events(slug, name, venue, address, start_date, end_date, registration_open, featured, published, description)
      VALUES ('dong-xuan-cup-2026', 'Đông Xuân Cup 2026', 'Sân Pickleball Hồng Lĩnh', 'Phường Hưng Dũng, TP. Vinh', ?, ?, true, true, true,
      'Giải đấu thường niên chào xuân 2026 với cơ cấu giải thưởng lớn và nhiều hạng mục thi đấu hấp dẫn.') RETURNING id`, addDays(12), addDays(14));
    const d3 = await get(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_total_points, prizes, sort_order)
      VALUES (?, 'Đôi nam Newbie (Tổng ≤ 5.000)', 'Dành cho các tay vợt mới thi đấu', 'knockout', 32, 5000, ?, 1) RETURNING id`, ev2.id, prizes('12000000', '6000000', '2500000'));
    await run(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_total_points, gender_rule, prizes, sort_order)
      VALUES (?, 'Đôi nam nữ hỗn hợp 5.5', 'Tối đa 24 đôi', 'knockout', 24, 5500, 'mixed', ?, 2)`, ev2.id, prizes('10000000', '5000000', '2000000'));
    await run(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_player_points, gender_rule, prizes, sort_order)
      VALUES (?, 'Đôi nữ 3.0', 'Mỗi VĐV ≤ 3.000', 'knockout', 16, 3000, 'female', ?, 3)`, ev2.id, prizes('8000000', '4000000', '1500000'));
    for (let i = 24; i < 30; i += 2) await reg(d3.id, men[i], men[i + 1], 'approved');
    await reg(d3.id, men[30], men[31], 'new');

    // ---- Giải 3: Đã kết thúc: vòng tròn đồng đội tiếp sức ----
    const ev3 = await get(`INSERT INTO events(slug, name, venue, address, start_date, end_date, registration_open, published, description)
      VALUES ('super-cup-tiep-suc-2026', 'Super Cup Đồng Đội Tiếp Sức 2026', 'Cụm sân Cửa Lò Pickleball Arena', 'Bình Minh, TX. Cửa Lò', ?, ?, false, true,
      'Giải đồng đội tiếp sức thể thức mới chạm 55 điểm qua 5 chặng kịch tính.') RETURNING id`, addDays(-25), addDays(-23));
    const d4 = await get(`INSERT INTO divisions(event_id, name, subtitle, team_type, format, relay_legs, relay_step, prizes, sort_order)
      VALUES (?, 'Đồng đội tiếp sức Master', '4 đội · 5 chặng · chạm 55 điểm', 'team', 'roundrobin', 5, 11, ?, 1) RETURNING id`, ev3.id, prizes('Cúp vô địch + 20000000', '10000000', '5000000'));
    const teamNames = ['Sông Lam Pickle Warriors', 'Hà Nội Dinker Stars', 'Sài Gòn Smashers', 'Đà Nẵng Phượng Hoàng'];
    for (let t = 0; t < 4; t++) {
      const members = men.slice(t * 4, t * 4 + 4).map((a) => a.full_name).join('\n');
      await run('INSERT INTO teams(division_id, name, members, seed) VALUES (?,?,?,?)', d4.id, teamNames[t], members, t + 1);
    }
    const s3 = await get(`INSERT INTO live_streams(event_id, court, title, status, scheduled_start, actual_start, actual_end, sort_order)
      VALUES (?, 'Sân trung tâm', 'Chung kết Super Cup Đồng Đội Tiếp Sức 2026', 'ended', now() - interval '24 days', now() - interval '24 days', now() - interval '24 days' + interval '4 hours', 1) RETURNING id`, ev3.id);

    return { d1: d1.id, d2: d2.id, d4: d4.id, s1: s1.id, s3: s3.id };
  }).then(async (ids) => {
    // ---- Nhánh đấu & kết quả trận đấu ----
    await bracket.syncTeamsFromRegistrations(ids.d1);
    await bracket.syncTeamsFromRegistrations(ids.d2);
    await bracket.generateKnockout(ids.d1, { randomize: false });
    await bracket.generateKnockout(ids.d2, { randomize: false });
    const score = (w) => (w ? [11, Math.floor(r() * 8) + 2] : [Math.floor(r() * 8) + 2, 11]);

    const k1 = await bracket.loadMatches(ids.d1);
    let offset = 0;
    for (const m of k1.filter((x) => x.round_order === 1)) {
      const [a, b] = score(r() > 0.4);
      offset += 900;
      await bracket.updateMatch(m.id, { score_a: a, score_b: b, status: 'done', court: 'Sân 1', live_stream_id: ids.s1, video_offset: offset });
    }
    const semis = (await bracket.loadMatches(ids.d1)).filter((x) => x.round_order === 2);
    if (semis.length >= 2) {
      await bracket.updateMatch(semis[0].id, { score_a: 11, score_b: 8, status: 'done', court: 'Sân 1', live_stream_id: ids.s1, video_offset: offset + 900 });
      await bracket.updateMatch(semis[1].id, { score_a: 8, score_b: 6, status: 'live', court: 'Sân 1', live_stream_id: ids.s1, video_offset: offset + 1800 });
    }

    const k2 = await bracket.loadMatches(ids.d2);
    for (const m of k2.filter((x) => x.round_order === 1 && x.status !== 'done')) {
      const [a, b] = score(r() > 0.5);
      await bracket.updateMatch(m.id, { score_a: a, score_b: b, status: 'done', court: 'Sân 2' });
    }

    // Vòng tròn tiếp sức Super Cup
    await bracket.generateRoundRobin(ids.d4, { randomize: false, relayLegs: 5 });
    const rr = await bracket.loadMatches(ids.d4);
    const results = [[55, 43], [55, 48], [52, 55], [54, 55], [55, 40], [45, 55]];
    let vo = 0;
    for (let i = 0; i < rr.length; i++) {
      vo += 2400;
      await bracket.updateMatch(rr[i].id, {
        score_a: results[i % results.length][0], score_b: results[i % results.length][1], status: 'done',
        legs: ['BB', 'BB', 'AB', 'AA', 'AB'], current_leg: 5, live_stream_id: ids.s3, video_offset: vo,
      });
    }

    // Bảng vinh danh
    const table = bracket.standings(await bracket.loadTeams(ids.d4), await bracket.loadMatches(ids.d4));
    const tmap = new Map((await bracket.loadTeams(ids.d4)).map((t) => [t.id, t]));
    const places = [1, 2, 3, 3];
    for (let i = 0; i < Math.min(4, table.rows.length); i++) {
      await run('INSERT INTO honors(division_id, place, name1, sort_order) VALUES (?,?,?,?)', ids.d4, places[i], tmap.get(table.rows[i].id).name, i);
    }
  });

  // Đối tác tài trợ
  const sponsors = [
    { name: 'Joola Pickleball Vietnam', url: 'https://joola.com', sort: 1 },
    { name: 'Selkirk Sport', url: 'https://selkirk.com', sort: 2 },
    { name: 'Franklin Pickleball', url: 'https://franklinsports.com', sort: 3 },
    { name: 'CRBN Pickleball', url: 'https://crbnpickleball.com', sort: 4 },
    { name: 'Nước uống điện giải Revive', url: 'https://suntorypepsico.vn', sort: 5 },
    { name: 'Ngân hàng Vietcombank', url: 'https://vietcombank.com.vn', sort: 6 },
  ];
  for (const s of sponsors) {
    await run('INSERT INTO partners(name, url, sort_order, visible) VALUES (?, ?, ?, true)', s.name, s.url, s.sort);
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
  log(`✔ Đã nạp dữ liệu mẫu: ${athleteCountFinal} VĐV (12 VĐV nổi bật đủ 6 mức rank), ${eventCountFinal} giải đấu, ${matchCountFinal} trận đấu.`);
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
