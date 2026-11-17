const fs = require('fs');
const path = require('path');
const { all, get, run, tx } = require('../src/db');
const bracket = require('../src/lib/bracket');

// Tự động nạp cấu hình CSDL nếu chưa có biến môi trường
if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
  } catch (e) {}
}
if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  const cfgFile = path.join(__dirname, '..', 'data', 'pg-dev.json');
  if (fs.existsSync(cfgFile)) {
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    process.env.DATABASE_URL = `postgres://postgres:${cfg.password}@127.0.0.1:${cfg.port}/pickleball`;
  }
}

async function fakeCompletedTournaments() {
  console.log('--- Bắt đầu tạo 2 giải đấu đã kết thúc ---');

  const athletes = await all('SELECT * FROM athletes WHERE visible = true ORDER BY id');
  if (athletes.length < 24) {
    throw new Error('Cơ sở dữ liệu cần ít nhất 24 VĐV để tạo giải');
  }

  const men = athletes.filter((a) => a.gender === 'M');
  const women = athletes.filter((a) => a.gender === 'F');

  const prizes = (a, b, c) => JSON.stringify([
    { label: 'Vô địch', amount: a },
    { label: 'Á quân', amount: b },
    { label: '02 Giải ba', amount: c },
  ]);

  const reg = async (divisionId, a, b) => {
    return run(
      `INSERT INTO registrations(division_id, athlete1_id, name1, phone1, points1,
       athlete2_id, name2, phone2, points2, status) VALUES (?,?,?,?,?,?,?,?,?, 'approved')`,
      divisionId,
      a.id, a.nickname || a.full_name, a.phone, a.points,
      b.id, b.nickname || b.full_name, b.phone, b.points
    );
  };

  // =========================================================================
  // GIẢI 1: OPTION 1 - LOẠI TRỰC TIẾP THUA ĐI PLAYOFF (ĐÃ KẾT THÚC)
  // =========================================================================
  console.log('1. Đang tạo Giải 1: Option 1 - Loại trực tiếp thua đi Playoff...');

  // Dọn dẹp nếu slug đã tồn tại
  const oldEv1 = await get("SELECT id FROM events WHERE slug = 'cup-mo-rong-2026' OR slug = 'cup-sao-vang-mo-rong-2026'");
  if (oldEv1) {
    await run('DELETE FROM events WHERE id = ?', oldEv1.id);
  }

  const ev1 = await get(
    `INSERT INTO events(slug, name, venue, address, start_date, end_date,
       registration_open, featured, published, description, banner)
     VALUES ('cup-mo-rong-2026', 'Giải Pickleball Cúp Mở Rộng 2026',
       'Cụm sân Pickleball Trung Tâm', 'Số 12 đường Phan Bội Châu, TP Hà Tĩnh',
       '2026-10-10', '2026-10-12', false, true, true,
       'Giải đấu quy mô 8 đôi tranh tài theo thể thức Loại trực tiếp thua đi Playoff. Các đôi thua trận đầu tiếp tục có cơ hội cạnh tranh vào Chung kết qua nhánh vớt Playoff.',
       '/static/img/events/mua-thu-open-2026.svg') RETURNING id`
  );

  const d1 = await get(
    `INSERT INTO divisions(event_id, name, subtitle, format, team_type, max_teams,
       max_total_points, gender_rule, prizes, sort_order, banner)
     VALUES (?, 'Đôi nam Open 6.5', '8 đôi · Loại trực tiếp thua đi Playoff',
       'knockout', 'pair', 8, 6500, 'male', ?, 1,
       '/static/img/divisions/doi-nam-6-5.svg') RETURNING id`,
    ev1.id, prizes('20.000.000đ + Cúp', '10.000.000đ + HCB', '4.000.000đ + HCĐ')
  );

  // Đăng ký 8 đôi nam
  for (let i = 0; i < 8; i++) {
    const a1 = men[i * 2];
    const a2 = men[i * 2 + 1];
    await reg(d1.id, a1, a2);
  }

  // Đồng bộ đội & sinh nhánh Playoff
  await bracket.syncTeamsFromRegistrations(d1.id);
  await bracket.generateKnockout(d1.id, { randomize: false, playoff: true });

  // Nhánh 8 đội gồm:
  // Order 1: Vòng 1 (T1, T2, T3, T4)
  // Order 2: Playoff (PO1, PO2)
  // Order 3: Vòng 2 (V2-1, V2-2)
  // Order 4: Bán kết (BK1, BK2)
  // Order 5: Chung kết (CK)

  // Vòng 1: Cập nhật tỉ số
  const r1 = (await bracket.loadMatches(d1.id)).filter((m) => m.round_order === 1);
  const r1Scores = [
    [11, 7], // T1: A thắng, B thua -> PO1
    [11, 9], // T2: C thắng, D thua -> PO1
    [11, 8], // T3: E thắng, F thua -> PO2
    [11, 6], // T4: G thắng, H thua -> PO2
  ];
  for (let i = 0; i < r1.length; i++) {
    await bracket.updateMatch(r1[i].id, {
      score_a: r1Scores[i][0],
      score_b: r1Scores[i][1],
      status: 'done',
      court: `Sân ${(i % 2) + 1}`,
      start_time: '08:30',
    });
  }

  // Playoff (Order 2) & Vòng 2 (Order 3)
  const poMatches = (await bracket.loadMatches(d1.id)).filter((m) => m.round_order === 2);
  const poScores = [
    [11, 8], // PO1: B thắng D
    [11, 9], // PO2: F thắng H
  ];
  for (let i = 0; i < poMatches.length; i++) {
    await bracket.updateMatch(poMatches[i].id, {
      score_a: poScores[i][0],
      score_b: poScores[i][1],
      status: 'done',
      court: 'Sân 1',
      start_time: '10:00',
    });
  }

  const v2Matches = (await bracket.loadMatches(d1.id)).filter((m) => m.round_order === 3);
  const v2Scores = [
    [11, 7], // V2-1: A thắng C
    [11, 8], // V2-2: E thắng G
  ];
  for (let i = 0; i < v2Matches.length; i++) {
    await bracket.updateMatch(v2Matches[i].id, {
      score_a: v2Scores[i][0],
      score_b: v2Scores[i][1],
      status: 'done',
      court: 'Sân 2',
      start_time: '10:00',
    });
  }

  // Bán kết (Order 4)
  const bkMatches = (await bracket.loadMatches(d1.id)).filter((m) => m.round_order === 4);
  const bkScores = [
    [11, 8], // BK1: V2-1 (A) vs PO2 (F) -> A thắng
    [11, 9], // BK2: V2-2 (E) vs PO1 (B) -> E thắng
  ];
  for (let i = 0; i < bkMatches.length; i++) {
    await bracket.updateMatch(bkMatches[i].id, {
      score_a: bkScores[i][0],
      score_b: bkScores[i][1],
      status: 'done',
      court: 'Sân 1',
      start_time: '14:30',
    });
  }

  // Chung kết (Order 5)
  const ckMatches = (await bracket.loadMatches(d1.id)).filter((m) => m.round_order === 5);
  if (ckMatches.length > 0) {
    await bracket.updateMatch(ckMatches[0].id, {
      score_a: 11,
      score_b: 9, // A thắng E
      status: 'done',
      court: 'Sân Trung Tâm',
      start_time: '16:30',
    });
  }

  // Bảng vinh danh Giải 1
  const honors1 = await bracket.suggestHonors(d1.id);
  for (let i = 0; i < honors1.length; i++) {
    const h = honors1[i];
    await run(
      'INSERT INTO honors(division_id, place, name1, athlete1_id, name2, athlete2_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      d1.id, h.place, h.team.name, h.team.athlete1_id, h.team.name, h.team.athlete2_id, i + 1
    );
  }

  console.log('✓ Giải 1 (Option 1: Playoff) hoàn thành!');

  // =========================================================================
  // GIẢI 2: OPTION 2 - CHIA BẢNG VÒNG TRÒN + LOẠI TRỰC TIẾP (ĐÃ KẾT THÚC)
  // =========================================================================
  console.log('2. Đang tạo Giải 2: Option 2 - Chia 4 bảng vòng tròn qua loại trực tiếp...');

  const oldEv2 = await get("SELECT id FROM events WHERE slug = 'song-lam-cup-2026'");
  if (oldEv2) {
    await run('DELETE FROM events WHERE id = ?', oldEv2.id);
  }

  const ev2 = await get(
    `INSERT INTO events(slug, name, venue, address, start_date, end_date,
       registration_open, featured, published, description, banner)
     VALUES ('song-lam-cup-2026', 'Giải Vô Địch Pickleball Sông Lam Cup 2026',
       'Cụm sân Thể thao Trung tâm Sông Lam', 'Đường Trường Thi, TP Vinh, Nghệ An',
       '2026-10-20', '2026-10-22', false, true, true,
       'Giải đấu quy tụ 12 đôi nam nữ hàng đầu khu vực tranh cúp vô địch Sông Lam. Thể thức thi đấu: Chia 4 bảng vòng tròn tính điểm, chọn Nhất và Nhì mỗi bảng vào vòng Loại trực tiếp (Tứ kết - Bán kết - Chung kết).',
       '/static/img/events/dong-xuan-cup-2026.svg') RETURNING id`
  );

  const d2 = await get(
    `INSERT INTO divisions(event_id, name, subtitle, format, team_type, max_teams,
       max_total_points, gender_rule, prizes, sort_order, banner)
     VALUES (?, 'Đôi nam nữ hỗn hợp 5.8', '12 đôi · Chia 4 bảng vòng tròn ➔ Tứ kết',
       'knockout', 'pair', 12, 5800, 'mixed', ?, 1,
       '/static/img/divisions/doi-nam-nu-5-8.svg') RETURNING id`,
    ev2.id, prizes('18.000.000đ + Cúp Vàng', '9.000.000đ + HCB', '3.500.000đ + HCĐ')
  );

  // Đăng ký 12 đôi nam nữ (1 nam + 1 nữ)
  for (let i = 0; i < 12; i++) {
    const maleAthlete = men[(i + 4) % men.length];
    const femaleAthlete = women[i % women.length];
    await reg(d2.id, maleAthlete, femaleAthlete);
  }

  // Đồng bộ đội & sinh nhánh: 4 Bảng, mỗi bảng 3 đội, lấy Nhất & Nhì vào Tứ kết
  await bracket.syncTeamsFromRegistrations(d2.id);
  await bracket.generateGroupsKnockout(d2.id, {
    numGroups: 4,
    advancePerGroup: 2,
    randomize: false,
  });

  // Hoàn thành tất cả các trận vòng bảng
  const groupMatches = (await bracket.loadMatches(d2.id)).filter((m) => m.zone && m.zone.startsWith('Bảng '));
  console.log(`Số trận vòng bảng cần hoàn thành: ${groupMatches.length}`);

  // Thiết lập tỉ số các trận vòng bảng sao cho có đội 2 thắng (Nhất bảng), 1 thắng 1 thua (Nhì bảng), 0 thắng (Hạng 3)
  // Mỗi bảng có 3 trận:
  // Trận 1: 11 - 6
  // Trận 2: 11 - 7
  // Trận 3: 11 - 8
  const baseScores = [
    [11, 6],
    [11, 7],
    [11, 8],
  ];
  for (let i = 0; i < groupMatches.length; i++) {
    const sc = baseScores[i % baseScores.length];
    await bracket.updateMatch(groupMatches[i].id, {
      score_a: sc[0],
      score_b: sc[1],
      status: 'done',
      court: `Sân ${(i % 3) + 1}`,
      start_time: '08:00',
    });
  }

  // Đảm bảo syncGroupWinners đã được gọi để đẩy Nhất / Nhì 4 bảng vào 4 trận Tứ kết
  await bracket.syncGroupWinners(d2.id);

  // Tứ kết (4 trận)
  const tkMatches = (await bracket.loadMatches(d2.id)).filter((m) => !m.zone && m.round_name === 'Tứ kết');
  console.log(`Số trận Tứ kết: ${tkMatches.length}`);
  const tkScores = [
    [11, 7],
    [11, 8],
    [11, 9],
    [11, 6],
  ];
  for (let i = 0; i < tkMatches.length; i++) {
    await bracket.updateMatch(tkMatches[i].id, {
      score_a: tkScores[i][0],
      score_b: tkScores[i][1],
      status: 'done',
      court: `Sân ${(i % 2) + 1}`,
      start_time: '13:30',
    });
  }

  // Bán kết (2 trận)
  const bkMatches2 = (await bracket.loadMatches(d2.id)).filter((m) => !m.zone && m.round_name === 'Bán kết');
  console.log(`Số trận Bán kết: ${bkMatches2.length}`);
  const bkScores2 = [
    [11, 8],
    [11, 7],
  ];
  for (let i = 0; i < bkMatches2.length; i++) {
    await bracket.updateMatch(bkMatches2[i].id, {
      score_a: bkScores2[i][0],
      score_b: bkScores2[i][1],
      status: 'done',
      court: 'Sân 1',
      start_time: '15:30',
    });
  }

  // Chung kết (1 trận)
  const ckMatches2 = (await bracket.loadMatches(d2.id)).filter((m) => !m.zone && m.round_name === 'Chung kết');
  console.log(`Số trận Chung kết: ${ckMatches2.length}`);
  if (ckMatches2.length > 0) {
    await bracket.updateMatch(ckMatches2[0].id, {
      score_a: 11,
      score_b: 8,
      status: 'done',
      court: 'Sân Trung Tâm',
      start_time: '17:00',
    });
  }

  // Bảng vinh danh Giải 2
  const honors2 = await bracket.suggestHonors(d2.id);
  for (let i = 0; i < honors2.length; i++) {
    const h = honors2[i];
    await run(
      'INSERT INTO honors(division_id, place, name1, athlete1_id, name2, athlete2_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      d2.id, h.place, h.team.name, h.team.athlete1_id, h.team.name, h.team.athlete2_id, i + 1
    );
  }

  console.log('✓ Giải 2 (Option 2: Chia bảng + Loại trực tiếp) hoàn thành!');
  console.log('--- ĐÃ TẠO THÀNH CÔNG 2 GIẢI ĐẤU ĐÃ KẾT THÚC ---');
}

fakeCompletedTournaments()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Lỗi tạo giải:', err);
    process.exit(1);
  });
