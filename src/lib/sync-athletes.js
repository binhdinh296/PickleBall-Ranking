const db = require('../db');
const athletesData = require('../data/athletes-data');

async function syncPicknaAthletes(force = false) {
  try {
    const existing = (await db.get("SELECT COUNT(*) AS c FROM athletes"))?.c || 0;
    if (existing >= 500 && !force) {
      return { success: true, count: existing, message: 'Already synced' };
    }

    console.log(`[sync] Bắt đầu đồng bộ 971 VĐV từ Pickna (hiện có ${existing})...`);

    // Xóa danh sách VĐV cũ và lịch sử điểm
    await db.run("DELETE FROM point_history");
    await db.run("DELETE FROM athletes");

    let featuredCount = 0;
    const CHUNK_SIZE = 50;
    const usedPhones = new Set();
    const makePhone = () => {
      let p;
      do {
        p = '09' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
      } while (usedPhones.has(p));
      usedPhones.add(p);
      return p;
    };

    for (let i = 0; i < athletesData.length; i += CHUNK_SIZE) {
      const chunk = athletesData.slice(i, i + CHUNK_SIZE);
      const values = [];
      const placeholders = [];
      for (const p of chunk) {
        const hasAvatar = Boolean(p.avatar && p.avatar.trim().length > 0 && !p.avatar.includes('default'));
        const isFeatured = Boolean(hasAvatar && featuredCount < 12);
        if (isFeatured) featuredCount++;
        values.push(
          p.full_name || '',
          p.nickname || null,
          makePhone(),
          p.gender || 'M',
          p.hometown || null,
          p.club || null,
          Number(p.points) || 0,
          Number(p.peak_points) || Number(p.points) || 0,
          isFeatured,
          p.avatar || null
        );
        placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      }
      await db.all(
        `INSERT INTO athletes(full_name, nickname, phone, gender, hometown, club, points, peak_points, featured, avatar)
         VALUES ${placeholders.join(', ')}`,
        ...values
      );
    }

    const finalCount = (await db.get("SELECT COUNT(*) AS c FROM athletes"))?.c || 0;
    console.log(`[sync] Đồng bộ thành công ${finalCount} VĐV.`);
    return { success: true, count: finalCount };
  } catch (err) {
    console.error('[sync] Lỗi đồng bộ:', err);
    return { success: false, error: err.message };
  }
}

module.exports = { syncPicknaAthletes };
