// Dữ liệu mẫu hư cấu để chạy thử (không dùng dữ liệu thật của bất kỳ VĐV nào)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { all, get, run, tx, DATA_DIR } = require('../src/db');
const { loadSettings } = require('../src/lib/settings');
const { hashPassword } = require('../src/lib/security');
const bracket = require('../src/lib/bracket');

const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Phan', 'Hồ', 'Ngô'];
const MALE = ['Minh Khoa', 'Quốc Bảo', 'Đức Anh', 'Hải Nam', 'Gia Huy', 'Thanh Tùng', 'Văn Long', 'Tuấn Kiệt', 'Hoàng Phúc', 'Đình Trọng', 'Công Danh', 'Trung Kiên', 'Bảo Lâm', 'Nhật Minh', 'Quang Vinh', 'Anh Tuấn', 'Thành Đạt', 'Hữu Phước', 'Xuân Trường', 'Tiến Dũng', 'Việt Hoàng', 'Khánh Duy'];
const FEMALE = ['Thu Hà', 'Ngọc Lan', 'Minh Thư', 'Phương Anh', 'Bảo Ngọc', 'Khánh Linh', 'Thanh Huyền', 'Mai Anh', 'Hồng Nhung', 'Diệu Linh'];
const CLUBS = ['CLB Bến Thủy', 'CLB Hồng Lĩnh', 'CLB Cửa Lò', 'CLB Sông Lam', 'CLB Phượng Hoàng'];
const TOWNS = ['Vinh', 'Cửa Lò', 'Hà Tĩnh', 'Nghi Lộc', 'Hưng Nguyên'];
const PREFIX = ['090', '091', '093', '094', '096', '097', '098', '086', '088', '089', '070', '077', '032', '035', '038', '081', '083', '085'];

function rnd(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

function addDays(n) {
  const d = new Date(Date.now() + n * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

async function seed({ log = console.log } = {}) {
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
      const file = path.join(DATA_DIR, 'initial-admin.txt');
      fs.writeFileSync(file, `Tài khoản CMS ban đầu (đổi mật khẩu sau lần đăng nhập đầu tiên, rồi xóa file này)\nTên đăng nhập: ${username}\nMật khẩu: ${password}\n`, { mode: 0o600 });
      log(`Đã tạo tài khoản quản trị "${username}". Mật khẩu ghi trong ${path.relative(process.cwd(), file)}`);
    } else {
      log(`Đã tạo tài khoản quản trị "${username}" với mật khẩu từ ADMIN_PASSWORD.`);
    }
  }

  if ((await get('SELECT COUNT(*) AS c FROM athletes')).c > 0) { log('CSDL đã có dữ liệu, bỏ qua dữ liệu mẫu.'); return; }

  await tx(async () => {
    // ---- VĐV ----
    const athletes = [];
    const used = new Set();
    const make = async (given, gender, base) => {
      let phone;
      do { phone = pick(PREFIX) + String(Math.floor(r() * 1e7)).padStart(7, '0'); } while (used.has(phone));
      used.add(phone);
      const full = `${pick(FAMILY)} ${given}`;
      const points = Math.round((base + r() * 0.35) * 1000 / 5) * 5;
      const nick = r() > 0.5 ? given.split(' ')[1] + ' ' + pick(['Smash', 'Dink', 'Volley', 'Lob', 'Spin', 'Erne']) : null;
      const a = await get(`INSERT INTO athletes(full_name, nickname, phone, gender, hometown, club, points, peak_points, featured)
        VALUES (?,?,?,?,?,?,?,?,?) RETURNING *`, full, nick, phone, gender, pick(TOWNS), pick(CLUBS), points, points + (r() > 0.7 ? 50 : 0), false);
      await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'init', 'Khởi tạo', 'Ban tổ chức', now() - interval '60 days')",
        a.id, points - 200, points - 200);
      await run("INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, author, created_at) VALUES (?, ?, ?, 'adjust', 'Đánh giá sau giải', 'Ban tổ chức', now() - interval '20 days')",
        a.id, points - 200, points);
      athletes.push(a);
    };
    for (let i = 0; i < MALE.length; i++) await make(MALE[i], 'M', 3.25 - i * 0.035);
    for (let i = 0; i < FEMALE.length; i++) await make(FEMALE[i], 'F', 2.95 - i * 0.04);
    const men = athletes.filter((a) => a.gender === 'M');
    const women = athletes.filter((a) => a.gender === 'F');

    // ---- Đơn chấm trình chờ duyệt ----
    await run(`INSERT INTO submissions(full_name, nickname, phone, phone_verified, gender, points, hometown, club, description)
      VALUES ('Lý Gia Bảo', 'Bảo Lý', '0912345670', true, 'M', 2750, 'Vinh', 'CLB Sông Lam', 'Chơi được 1 năm, từng vào bán kết giải phong trào.'),
             ('Trịnh Mai Phương', NULL, '0987654320', true, 'F', 2400, 'Cửa Lò', 'CLB Cửa Lò', NULL)`);

    const prizes = (a, b, c) => JSON.stringify([{ label: 'Vô địch', amount: a }, { label: 'Á quân', amount: b }, { label: '02 Giải ba', amount: c }]);
    const reg = async (divisionId, a, b, status = 'approved') => run(`INSERT INTO registrations(division_id, athlete1_id, name1, phone1, points1,
      athlete2_id, name2, phone2, points2, phone_verified, status) VALUES (?,?,?,?,?,?,?,?,?, true, ?)`,
    divisionId, a.id, a.nickname || a.full_name, a.phone, a.points, b.id, b.nickname || b.full_name, b.phone, b.points, status);

    // ---- Giải đang diễn ra: có livestream, nhánh loại trực tiếp ----
    const ev1 = await get(`INSERT INTO events(slug, name, venue, address, start_date, end_date, registration_open, featured, published, description)
      VALUES ('mua-thu-open-2026', 'Mùa Thu Open 2026', 'Cụm sân Pickleball Bến Thủy', 'Đường Nguyễn Du, TP. Vinh', ?, ?, false, true, true,
      'Giải phong trào mở rộng mùa thu. Dữ liệu mẫu để chạy thử hệ thống.') RETURNING id`, addDays(0), addDays(1));
    const d1 = await get(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_total_points, gender_rule, prizes, sort_order)
      VALUES (?, 'Đôi nam 6.0', 'Tối đa 16 đôi', 'knockout', 16, 6000, 'male', ?, 1) RETURNING id`, ev1.id, prizes('10000000', '5000000', '2000000'));
    const d2 = await get(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_total_points, gender_rule, prizes, sort_order)
      VALUES (?, 'Hỗn hợp 5.6', 'Tối đa 12 đôi', 'knockout', 12, 5600, 'mixed', ?, 2) RETURNING id`, ev1.id, prizes('8000000', '4000000', '1500000'));
    for (let i = 0; i < 16; i += 2) await reg(d1.id, men[i], men[i + 1]);
    for (let i = 0; i < 6; i++) await reg(d2.id, men[i + 8], women[i]);
    const s1 = await get(`INSERT INTO live_streams(event_id, court, title, status, scheduled_start, actual_start, sort_order)
      VALUES (?, 'Sân 1', 'Mùa Thu Open 2026 – Sân 1', 'live', now() - interval '2 hours', now() - interval '2 hours', 1) RETURNING id`, ev1.id);
    await run(`INSERT INTO live_streams(event_id, court, title, status, scheduled_start, sort_order)
      VALUES (?, 'Sân 2', 'Mùa Thu Open 2026 – Sân 2', 'scheduled', now() + interval '1 hour', 2)`, ev1.id);

    // ---- Giải sắp diễn ra: mở đăng ký ----
    const ev2 = await get(`INSERT INTO events(slug, name, venue, address, start_date, end_date, registration_open, featured, published)
      VALUES ('dong-xuan-cup-2026', 'Đông Xuân Cup 2026', 'Sân Pickleball Hồng Lĩnh', 'Phường Hưng Dũng, TP. Vinh', ?, ?, true, true, true) RETURNING id`, addDays(10), addDays(11));
    const d3 = await get(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_total_points, prizes, sort_order)
      VALUES (?, 'Đôi nam newbie', 'Tối đa 40 đôi · tổng ≤ 5.000', 'knockout', 40, 5000, ?, 1) RETURNING id`, ev2.id, prizes('10000000', '5000000', '2000000'));
    await run(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_total_points, gender_rule, prizes, sort_order)
      VALUES (?, 'Hỗn hợp 5.3', 'Tối đa 32 đôi', 'knockout', 32, 5300, 'mixed', ?, 2)`, ev2.id, prizes('10000000', '5000000', '2000000'));
    await run(`INSERT INTO divisions(event_id, name, subtitle, format, max_teams, max_player_points, gender_rule, prizes, sort_order)
      VALUES (?, 'Đôi nữ 2.9', 'Mỗi VĐV ≤ 2.900', 'knockout', 24, 2900, 'female', ?, 3)`, ev2.id, prizes('6000000', '3000000', '1000000'));
    await reg(d3.id, men[18], men[19], 'new');
    await reg(d3.id, men[20], men[21], 'approved');

    // ---- Giải đã kết thúc: vòng tròn đồng đội tiếp sức ----
    const ev3 = await get(`INSERT INTO events(slug, name, venue, start_date, end_date, registration_open, published)
      VALUES ('super-cup-tiep-suc-2026', 'Super Cup Đồng Đội Tiếp Sức 2026', 'Cụm sân Cửa Lò', ?, ?, false, true) RETURNING id`, addDays(-20), addDays(-19));
    const d4 = await get(`INSERT INTO divisions(event_id, name, subtitle, team_type, format, relay_legs, relay_step, prizes, sort_order)
      VALUES (?, 'Đồng đội tiếp sức', '4 đội · 5 chặng · chạm 55', 'team', 'roundrobin', 5, 11, ?, 1) RETURNING id`, ev3.id, prizes('Cúp + 12000000', '6000000', '3000000'));
    const teamNames = ['Gold Team', 'Thập Cẩm Team', 'Lửng Mật Team', 'Shock Team'];
    for (let t = 0; t < 4; t++) {
      const members = men.slice(t * 4, t * 4 + 4).map((a) => a.full_name).join('\n');
      await run('INSERT INTO teams(division_id, name, members, seed) VALUES (?,?,?,?)', d4.id, teamNames[t], members, t + 1);
    }
    const s3 = await get(`INSERT INTO live_streams(event_id, court, title, status, scheduled_start, actual_start, actual_end, sort_order)
      VALUES (?, 'Sân trung tâm', 'Super Cup Tiếp Sức – Sân trung tâm', 'ended', now() - interval '20 days', now() - interval '20 days', now() - interval '20 days' + interval '5 hours', 1) RETURNING id`, ev3.id);

    return { d1: d1.id, d2: d2.id, d4: d4.id, s1: s1.id, s3: s3.id };
  }).then(async (ids) => {
    // ---- Nhánh đấu & kết quả (ngoài giao dịch chính vì dùng thư viện riêng) ----
    await bracket.syncTeamsFromRegistrations(ids.d1);
    await bracket.syncTeamsFromRegistrations(ids.d2);
    await bracket.generateKnockout(ids.d1, { randomize: false });
    await bracket.generateKnockout(ids.d2, { randomize: false });
    const score = (w) => (w ? [11, Math.floor(r() * 9) + 1] : [Math.floor(r() * 9) + 1, 11]);
    const k1 = await bracket.loadMatches(ids.d1);
    let offset = 0;
    for (const m of k1.filter((x) => x.round_order === 1)) {
      const [a, b] = score(r() > 0.4);
      offset += 900;
      await bracket.updateMatch(m.id, { score_a: a, score_b: b, status: 'done', court: 'Sân 1', live_stream_id: ids.s1, video_offset: offset });
    }
    const semis = (await bracket.loadMatches(ids.d1)).filter((x) => x.round_order === 2);
    await bracket.updateMatch(semis[0].id, { score_a: 11, score_b: 8, status: 'done', court: 'Sân 1', live_stream_id: ids.s1, video_offset: offset + 900 });
    await bracket.updateMatch(semis[1].id, { score_a: 7, score_b: 5, status: 'live', court: 'Sân 1', live_stream_id: ids.s1, video_offset: offset + 1800 });
    const k2 = await bracket.loadMatches(ids.d2);
    for (const m of k2.filter((x) => x.round_order === 1 && x.status !== 'done')) {
      const [a, b] = score(r() > 0.5);
      await bracket.updateMatch(m.id, { score_a: a, score_b: b, status: 'done', court: 'Sân 2' });
    }

    await bracket.generateRoundRobin(ids.d4, { randomize: false, relayLegs: 5 });
    const rr = await bracket.loadMatches(ids.d4);
    const results = [[55, 41], [55, 43], [51, 55], [53, 55], [55, 38], [41, 55]];
    let vo = 0;
    for (let i = 0; i < rr.length; i++) {
      vo += 2400;
      await bracket.updateMatch(rr[i].id, { score_a: results[i % results.length][0], score_b: results[i % results.length][1], status: 'done',
        legs: ['BB', 'BB', 'AB', 'AA', 'AB'], current_leg: 5, live_stream_id: ids.s3, video_offset: vo });
    }
    const table = bracket.standings(await bracket.loadTeams(ids.d4), await bracket.loadMatches(ids.d4));
    const tmap = new Map((await bracket.loadTeams(ids.d4)).map((t) => [t.id, t]));
    const places = [1, 2, 3, 3];
    for (let i = 0; i < Math.min(4, table.rows.length); i++) {
      await run('INSERT INTO honors(division_id, place, name1, sort_order) VALUES (?,?,?,?)', ids.d4, places[i], tmap.get(table.rows[i].id).name, i);
    }
  });

  await run("INSERT INTO partners(name, sort_order) VALUES ('Đối tác mẫu A', 1), ('Đối tác mẫu B', 2), ('Đối tác mẫu C', 3)");
  await run(`UPDATE athletes SET featured = true WHERE id IN (SELECT id FROM athletes ORDER BY points DESC LIMIT 3)`);
  await require('./fake-images').fillMissingImages({ log });
  log(`Đã nạp dữ liệu mẫu: ${(await get('SELECT COUNT(*) AS c FROM athletes')).c} VĐV, ${(await get('SELECT COUNT(*) AS c FROM events')).c} giải, ${(await get('SELECT COUNT(*) AS c FROM matches')).c} trận.`);
}

module.exports = { seed };

if (require.main === module) {
  const db = require('../src/db');
  db.migrate().then(() => seed()).then(() => db.close()).catch((e) => { console.error(e); process.exit(1); });
}
