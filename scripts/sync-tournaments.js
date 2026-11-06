const bracket = require('../src/lib/bracket');

const rawPairs = [
  { p1: 'Hải Linh', p2: 'Nguyễn Hậu', paid: true, note: 'Đã nạp' },
  { p1: 'Oanh Nguyễn', p2: 'Hoài Nguyễn', paid: true, note: 'Đã nạp' },
  { p1: 'Chipu', p2: 'Vân Trần', paid: true, note: 'Đã nạp' },
  { p1: 'Kim Anh', p2: 'Kim Thư', paid: true, note: 'Đã nạp' },
  { p1: 'Hoài Nguyễn', p2: 'Quỳnh Lam', paid: true, note: 'Đã nạp' },
  { p1: 'Lan Hàng Xóm', p2: 'Jang Cư Mận', paid: true, note: 'Đã nạp' },
  { p1: 'Tố Uyên', p2: 'Kiều Liên', paid: true, note: 'Đã nạp' },
  { p1: 'Hà Nguyên', p2: 'Phương Nguyên', paid: false, note: 'Chờ nạp lệ phí' },
  { p1: 'Mỹ Hạnh', p2: 'Khánh Huyền', paid: true, note: 'Đã nạp' },
  { p1: 'Thanh Huyền', p2: 'Hoa Phú', paid: true, note: 'Đã nạp' },
  { p1: 'Sakura', p2: 'Mộc Quỳnh', paid: false, note: 'Chờ nạp lệ phí' },
  { p1: 'Hồng Sương', p2: 'Lương Phương', paid: true, note: 'Đã nạp' },
  { p1: 'Linh Linh', p2: 'Kim Ngọc', paid: true, note: 'Đã nạp' },
  { p1: 'Linh Miu', p2: 'Ngọc Ánh', paid: true, note: 'Đã nạp' },
  { p1: 'Thanh Huyền', p2: 'Thơ Trần', paid: true, note: 'Đã nạp' },
  { p1: 'Thanh Hường', p2: 'Lương Hân', paid: true, note: 'Đã nạp' },
  { p1: 'Hoài Thu', p2: 'Hạnh Bún', paid: true, note: 'Đã nạp' },
  { p1: 'Lê Na', p2: 'Hà Xôi', paid: true, note: 'Đã nạp (NTT)' },
  { p1: 'Hồng Lam', p2: 'Trang Milo', paid: true, note: 'Đã nạp' },
  { p1: 'Thảo Lê', p2: 'Thảo Võ', paid: true, note: 'Đã nạp' },
  { p1: 'Minh Hường', p2: 'Nguyễn Mơ', paid: true, note: 'Đã nạp' },
  { p1: 'Hồ Mến', p2: 'Hậu Lê', paid: true, note: 'Đã nạp' },
  { p1: 'Beo Beo', p2: 'Uyên Uyển', paid: true, note: 'Đã nạp' },
  { p1: 'Cẩm Trà', p2: 'Phương Trang', paid: true, note: 'Đã nạp' },
  { p1: 'Tú Anh', p2: 'Mỹ Duyên', paid: true, note: 'Đã nạp' },
  { p1: 'Hải Yến', p2: 'Nguyễn Hương', paid: true, note: 'Đã nạp' },
  { p1: 'Thanh Lê', p2: 'Nga Nguyễn', paid: true, note: 'Đã nạp' },
  { p1: 'Thùy Linh', p2: 'Hà Phương', paid: true, note: 'Đã nạp' },
  { p1: 'Thuý Nga', p2: 'Thuý Mai', paid: true, note: 'Đã nạp' },
  { p1: 'Ngọc Ánh', p2: 'Khánh Vy', paid: true, note: 'Đã nạp' },
  { p1: 'Ngọc Ánh Trần', p2: 'Phương Nguyễn', paid: true, note: 'Đã nạp' }
];

async function syncGaVangUom(db) {
  const slug = 'ga-vang-uom-lan-2';
  let ev = await db.get('SELECT id FROM events WHERE slug = ?', slug);

  if (!ev) {
    ev = await db.get(`INSERT INTO events(
      slug, name, venue, address, start_date, end_date, registration_open, featured, published, description, banner
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      slug,
      'Minigame Giải Pickleball Gà Vàng Ươm Lần 2',
      'Cụm 8 sân XF40',
      '82 Nguyễn Cảnh Hoan, Phường Vinh Hưng, Nghệ An',
      '2026-11-08',
      '2026-11-08',
      false,
      true,
      true,
      'Minigame Giải Pickleball Gà Vàng Ươm Lần 2 tổ chức tại Cụm 8 sân XF40 - 82 Nguyễn Cảnh Hoan, Phường Vinh Hưng, Nghệ An. Thông điệp: "Phải đẹp nhưng không hề yếu!" - "Bản lĩnh - Sức mạnh - Kỹ thuật lên ngôi". Đơn vị đồng hành: Picklecode, Nhà Hàng Sân Vàng, Zocker, XF40.',
      '/static/img/events/giai-pickleball-ga-vang-uom-lan-2.webp'
    );
  } else {
    await db.run(`UPDATE events SET
      name = ?, venue = ?, address = ?, start_date = ?, end_date = ?,
      registration_open = ?, featured = ?, published = ?, description = ?, banner = ?
      WHERE id = ?`,
      'Minigame Giải Pickleball Gà Vàng Ươm Lần 2',
      'Cụm 8 sân XF40',
      '82 Nguyễn Cảnh Hoan, Phường Vinh Hưng, Nghệ An',
      '2026-11-08',
      '2026-11-08',
      false,
      true,
      true,
      'Minigame Giải Pickleball Gà Vàng Ươm Lần 2 tổ chức tại Cụm 8 sân XF40 - 82 Nguyễn Cảnh Hoan, Phường Vinh Hưng, Nghệ An. Thông điệp: "Phải đẹp nhưng không hề yếu!" - "Bản lĩnh - Sức mạnh - Kỹ thuật lên ngôi". Đơn vị đồng hành: Picklecode, Nhà Hàng Sân Vàng, Zocker, XF40.',
      '/static/img/events/giai-pickleball-ga-vang-uom-lan-2.webp',
      ev.id
    );
  }

  const prizes = JSON.stringify([
    { label: 'Vô địch', amount: 'Cúp + Quà tài trợ' },
    { label: 'Á quân', amount: 'Huy chương Bạc + Quà tài trợ' },
    { label: '02 Giải ba', amount: 'Huy chương Đồng + Quà tài trợ' }
  ]);

  let div = await db.get('SELECT id FROM divisions WHERE event_id = ?', ev.id);
  if (!div) {
    div = await db.get(`INSERT INTO divisions(
      event_id, name, subtitle, format, team_type, max_teams, max_total_points, max_player_points, gender_rule, prizes, sort_order, banner
    ) VALUES (?, ?, ?, 'knockout', 'pair', 32, NULL, NULL, 'female', ?, 1, ?) RETURNING id`,
      ev.id,
      'Đôi nữ Gà Vàng Ươm',
      'Quy mô 32 đôi · Chưa tính điểm trình',
      prizes,
      '/static/img/events/giai-pickleball-ga-vang-uom-lan-2.webp'
    );
  } else {
    await db.run(`UPDATE divisions SET
      name = ?, subtitle = ?, format = 'knockout', team_type = 'pair', max_teams = 32,
      max_total_points = NULL, max_player_points = NULL, gender_rule = 'female', prizes = ?, banner = ?
      WHERE id = ?`,
      'Đôi nữ Gà Vàng Ươm',
      'Quy mô 32 đôi · Chưa tính điểm trình',
      prizes,
      '/static/img/events/giai-pickleball-ga-vang-uom-lan-2.webp',
      div.id
    );
  }

  const regCount = (await db.get('SELECT COUNT(*) AS c FROM registrations WHERE division_id = ?', div.id))?.c || 0;
  if (regCount < 30) {
    await db.run('DELETE FROM matches WHERE division_id = ?', div.id);
    await db.run('DELETE FROM teams WHERE division_id = ?', div.id);
    await db.run('DELETE FROM registrations WHERE division_id = ?', div.id);

    let phoneCounter = 981000100;
    for (const r of rawPairs) {
      const phone1 = '0' + (phoneCounter++);
      const phone2 = '0' + (phoneCounter++);
      const status = r.paid ? 'approved' : 'new';
      await db.run(`INSERT INTO registrations(
        division_id, athlete1_id, name1, phone1, points1,
        athlete2_id, name2, phone2, points2,
        phone_verified, status, admin_note
      ) VALUES (?, NULL, ?, ?, NULL, NULL, ?, ?, NULL, true, ?, ?)`,
        div.id, r.p1, phone1, r.p2, phone2, status, r.note
      );
    }
    await bracket.syncTeamsFromRegistrations(div.id);
    await bracket.generateKnockout(div.id, { randomize: false });
  } else {
    // Đảm bảo points1, points2 đều NULL
    await db.run('UPDATE registrations SET points1 = NULL, points2 = NULL, athlete1_id = NULL, athlete2_id = NULL WHERE division_id = ?', div.id);
  }
}

module.exports = { syncGaVangUom };
