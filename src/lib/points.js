const { get, run, all, tx } = require('../db');
const { num } = require('./settings');

function genderFloor(gender) {
  return gender === 'F' ? num('min_points_female') : num('min_points_male');
}

function newbieExit(gender) {
  return gender === 'F' ? num('newbie_exit_female') : num('newbie_exit_male');
}

// Điểm Lock = mức cao nhất trong: sàn theo giới tính, mốc thoát newbie (nếu đã đạt), điểm cao nhất − biên
function lockPoints(athlete) {
  const floor = genderFloor(athlete.gender);
  const exit = newbieExit(athlete.gender);
  const candidates = [floor, athlete.peak_points - num('lock_margin')];
  if (athlete.peak_points >= exit) candidates.push(exit);
  return Math.max(...candidates);
}

// Ghi nhận thay đổi điểm, cập nhật điểm cao nhất; không cho xuống dưới Lock trừ khi bỏ qua
async function changePoints(athleteId, newPoints, { kind = 'adjust', note = null, eventId = null, author = null, ignoreLock = false } = {}) {
  return tx(async () => {
    const a = await get('SELECT * FROM athletes WHERE id = ? FOR UPDATE', athleteId);
    if (!a) throw Object.assign(new Error('Không tìm thấy VĐV'), { expose: true });
    const lock = lockPoints(a);
    const target = ignoreLock ? newPoints : Math.max(newPoints, lock);
    if (target === a.points) return { athlete: a, changed: false, clamped: target !== newPoints };
    const peak = Math.max(a.peak_points, target);
    await run('UPDATE athletes SET points = ?, peak_points = ?, updated_at = now() WHERE id = ?', target, peak, a.id);
    await run('INSERT INTO point_history(athlete_id, old_points, new_points, kind, note, event_id, author) VALUES (?,?,?,?,?,?,?)',
      a.id, a.points, target, kind, note, eventId, author);
    return { athlete: { ...a, points: target, peak_points: peak }, changed: true, clamped: target !== newPoints };
  });
}

async function rankOf(athlete) {
  const row = await get('SELECT COUNT(*) AS c FROM athletes WHERE visible AND points > ?', athlete.points);
  return row.c + 1;
}

async function history(athleteId) {
  return all(`SELECT h.*, e.name AS event_name, e.slug AS event_slug FROM point_history h
    LEFT JOIN events e ON e.id = h.event_id WHERE h.athlete_id = ? ORDER BY h.created_at ASC, h.id ASC`, athleteId);
}

// Dữ liệu biểu đồ: bắt đầu từ sàn, đi qua từng mốc lịch sử; trả sẵn đường SVG
function chartData(athlete, hist) {
  const floor = genderFloor(athlete.gender);
  const lock = lockPoints(athlete);
  const series = [floor, ...hist.map((h) => h.new_points)];
  if (series.length === 1) series.push(athlete.points);
  const W = 600, H = 220, padX = 8, padY = 18;
  const lo = Math.min(floor, ...series) - 50;
  const hi = Math.max(lock, ...series) + 50;
  const x = (i) => padX + (i / (series.length - 1)) * (W - padX * 2);
  const y = (v) => padY + (1 - (v - lo) / (hi - lo)) * (H - padY * 2);
  const pts = series.map((v, i) => [x(i), y(v)]);
  // Đường cong mượt (Catmull-Rom → Bezier)
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
  return { W, H, floor, lock, path: d, area, points: pts, lockY: y(lock), floorY: y(floor), last: pts[pts.length - 1] };
}

module.exports = { genderFloor, newbieExit, lockPoints, changePoints, rankOf, history, chartData };
