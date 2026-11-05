const db = require('../db');

function getAthletesList() {
  const errors = [];
  try {
    const list = require('./pickna-athletes.json');
    if (Array.isArray(list) && list.length > 0) return { list };
  } catch (err) {
    errors.push('require ./pickna-athletes.json: ' + err.message);
  }

  try {
    const list = require('../data/pickna-athletes.json');
    if (Array.isArray(list) && list.length > 0) return { list };
  } catch (err) {
    errors.push('require ../data/pickna-athletes.json: ' + err.message);
  }

  const fs = require('fs');
  const path = require('path');
  const candidates = [
    path.join(__dirname, 'pickna-athletes.json'),
    path.join(__dirname, '../data/pickna-athletes.json'),
    path.join(process.cwd(), 'src/lib/pickna-athletes.json'),
    path.join(process.cwd(), 'src/data/pickna-athletes.json'),
    path.resolve('src/data/pickna-athletes.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const list = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (Array.isArray(list) && list.length > 0) return { list };
      } else {
        errors.push('not found: ' + p);
      }
    } catch (err) {
      errors.push('read ' + p + ': ' + err.message);
    }
  }

  let cwdFiles = [];
  try { cwdFiles = fs.readdirSync(process.cwd()); } catch (e) { cwdFiles = [e.message]; }
  let dirFiles = [];
  try { dirFiles = fs.readdirSync(__dirname); } catch (e) { dirFiles = [e.message]; }

  return { list: [], debug: { errors, cwd: process.cwd(), __dirname, cwdFiles, dirFiles } };
}

async function syncPicknaAthletes(force = false) {
  try {
    const existing = (await db.get("SELECT COUNT(*) AS c FROM athletes"))?.c || 0;
    if (existing >= 500 && !force) {
      return { success: true, count: existing, message: 'Already synced' };
    }

    const res = getAthletesList();
    const athletesData = res.list;
    if (!athletesData || athletesData.length === 0) {
      console.error('[sync] Không tìm thấy dữ liệu pickna-athletes.json:', res.debug);
      return { success: false, error: 'Không tìm thấy file pickna-athletes.json', debug: res.debug };
    }

    console.log(`[sync] Bắt đầu nạp ${athletesData.length} VĐV từ Pickna (hiện có ${existing})...`);

    // Dọn danh sách cũ
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
    console.log(`[sync] Nạp thành công ${finalCount} VĐV.`);
    return { success: true, count: finalCount };
  } catch (err) {
    console.error('[sync] Lỗi nạp VĐV:', err);
    return { success: false, error: err.message };
  }
}

module.exports = { syncPicknaAthletes, getAthletesList };
