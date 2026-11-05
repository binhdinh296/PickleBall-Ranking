// Script cào toàn bộ dữ liệu VĐV từ https://pickna.vn/ (Tên, Điểm, Nickname, Avatar, Giới tính, CLB, Quê quán...)
// và nạp vào hệ thống CSDL PostgreSQL của dự án.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Cấu hình môi trường CSDL nếu chạy độc lập
if (!process.env.DATABASE_URL) {
  const cfgFile = path.join(__dirname, '..', 'data', 'pg-dev.json');
  if (fs.existsSync(cfgFile)) {
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    process.env.DATABASE_URL = `postgres://postgres:${encodeURIComponent(cfg.password)}@127.0.0.1:${cfg.port}/pickleball`;
  }
}

const { run, get, all, tx, DATA_DIR, ensureDir } = require('../src/db');
const { parsePoints } = require('../src/lib/format');

const BASE_URL = 'https://pickna.vn';
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads', 'athletes');
const JSON_CACHE_FILE = path.join(DATA_DIR, 'pickna-athletes.json');

// Helper sleep
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch kèm retry
async function fetchWithRetry(url, retries = 3, delay = 800) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await wait(delay * attempt);
    }
  }
}

// Chạy tác vụ song song với giới hạn concurrency
async function runPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// Bước 1: Lấy danh sách VĐV từ API ranking
async function fetchAllRankingPages() {
  console.log('📡 [1/4] Đang kết nối https://pickna.vn/ để kiểm tra số lượng VĐV...');
  const firstRes = await fetchWithRetry(`${BASE_URL}/api-ranking.php?gender=&page=1`);
  const firstData = await firstRes.json();
  const total = firstData.total || 0;
  const totalPages = firstData.totalPages || 1;
  console.log(`✓ Tìm thấy tổng cộng ${total} VĐV trên ${totalPages} trang ranking.`);

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
  const allAthletes = [];

  console.log(`⏳ Đang tải toàn bộ ${totalPages} trang danh sách (concurrency: 10)...`);
  const pagesData = await runPool(pageNumbers, 10, async (pageNum) => {
    try {
      const res = await fetchWithRetry(`${BASE_URL}/api-ranking.php?gender=&page=${pageNum}`);
      const data = await res.json();
      return data.athletes || [];
    } catch (err) {
      console.error(`⚠ Lỗi khi tải trang ${pageNum}:`, err.message);
      return [];
    }
  });

  for (const pageItems of pagesData) {
    allAthletes.push(...pageItems);
  }

  console.log(`✓ Đã thu thập thông tin cơ bản của ${allAthletes.length} VĐV.`);
  return allAthletes;
}

// Bước 2: Tải thông tin chi tiết từng VĐV (CLB, Quê quán, Điểm cao nhất, Điểm Lock...)
async function enrichAthleteDetails(athletes) {
  console.log(`⏳ [2/4] Đang lấy chi tiết CLB, Quê quán, Điểm đỉnh cho ${athletes.length} VĐV (concurrency: 15)...`);
  let completed = 0;
  const total = athletes.length;

  const enriched = await runPool(athletes, 15, async (a) => {
    const athleteId = a.id;
    let club = null;
    let hometown = null;
    let peakPoints = parsePoints(a.ranking_points) || 0;
    let lockPoints = null;

    try {
      const res = await fetchWithRetry(`${BASE_URL}/athlete.php?id=${athleteId}`);
      const html = await res.text();

      // Phân tích thẻ profile-meta để lấy CLB và Quê quán
      const metaMatch = html.match(/class="profile-meta">([\s\S]*?)<\/div>/);
      const spans = metaMatch
        ? [...metaMatch[1].matchAll(/<span>(.*?)<\/span>/g)].map((m) => m[1].trim())
        : [];

      if (spans.length === 3) {
        club = spans[1] || null;
        hometown = spans[2] || null;
      } else if (spans.length === 2) {
        const val = spans[1];
        const provinces = [
          'Nghệ An', 'Hà Tĩnh', 'Thanh Hoá', 'Thanh Hóa', 'Hà Nội', 'Hồ Chí Minh', 'TP. Hồ Chí Minh',
          'Đà Nẵng', 'Quảng Bình', 'Quảng Trị', 'Thừa Thiên Huế', 'Huế', 'Bình Dương', 'Đồng Nai',
          'Hải Phòng', 'Bắc Ninh', 'Vinh', 'Cửa Lò', 'Kỳ Anh', 'Hồng Lĩnh'
        ];
        if (provinces.some((p) => val.toLowerCase().includes(p.toLowerCase()))) {
          hometown = val;
        } else {
          club = val;
        }
      }

      // Điểm cao nhất
      const peakMatch = html.match(/<span>Điểm cao nhất<\/span><strong>(.*?)<\/strong>/);
      if (peakMatch) {
        const p = parsePoints(peakMatch[1]);
        if (p) peakPoints = Math.max(peakPoints, p);
      }

      // Điểm Lock
      const lockMatch = html.match(/<span>Điểm Lock<\/span><strong>(.*?)<\/strong>/);
      if (lockMatch) {
        lockPoints = parsePoints(lockMatch[1]);
      }
    } catch (err) {
      // Bỏ qua lỗi mạng đơn lẻ, giữ thông tin cơ bản từ ranking list
    }

    completed++;
    if (completed % 100 === 0 || completed === total) {
      process.stdout.write(`  → Tiến độ: ${completed}/${total} VĐV (${Math.round((completed / total) * 100)}%)\r`);
    }

    // Xử lý avatar
    let avatarUrl = null;
    if (a.avatar && !a.avatar.includes('default') && !a.avatar.includes('img-default')) {
      avatarUrl = a.avatar.startsWith('http') ? a.avatar : `${BASE_URL}/${a.avatar.replace(/^\//, '')}`;
    }

    return {
      pickna_id: a.id,
      full_name: (a.name || '').trim(),
      nickname: (a.nickname || '').trim() || null,
      gender: a.gender === 'Nữ' ? 'F' : 'M',
      points: parsePoints(a.ranking_points) || 0,
      peak_points: peakPoints,
      lock_points: lockPoints,
      club: club ? club.trim() : null,
      hometown: hometown ? hometown.trim() : null,
      avatar: avatarUrl,
    };
  });

  console.log('\n✓ Đã trích xuất chi tiết toàn bộ hồ sơ VĐV thành công.');
  return enriched;
}

// Bước 3: Tải ảnh avatar về ổ đĩa cục bộ (data/uploads/athletes/) để lưu trữ offline
async function downloadAvatarsLocally(athletes) {
  console.log('💾 [3/4] Đang tải avatar về thư mục cục bộ (data/uploads/athletes)...');
  ensureDir(UPLOAD_DIR);
  let downloaded = 0;
  let skipped = 0;

  const withAvatars = athletes.filter((a) => a.avatar && a.avatar.startsWith('http'));

  await runPool(withAvatars, 15, async (a) => {
    try {
      const url = new URL(a.avatar);
      const filename = path.basename(url.pathname);
      const localFile = path.join(UPLOAD_DIR, filename);

      if (!fs.existsSync(localFile)) {
        const res = await fetchWithRetry(a.avatar);
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(localFile, buffer);
        downloaded++;
      } else {
        skipped++;
      }
    } catch (err) {
      // Nếu không tải được thì giữ nguyên link gốc
    }
  });

  console.log(`✓ Hoàn thành tải avatar: ${downloaded} ảnh mới, ${skipped} ảnh có sẵn.`);
}

// Bước 4: Nạp vào PostgreSQL
async function importToDatabase(athletes) {
  console.log('🗄  [4/4] Đang ghi dữ liệu vào PostgreSQL...');

  // Sắp xếp VĐV theo điểm giảm dần
  athletes.sort((a, b) => b.points - a.points);

  // Top 12 VĐV có avatar được gắn featured để lên slider trang chủ (Rule: Không có avatar thì không lên slider)
  let featuredCount = 0;
  for (let i = 0; i < athletes.length; i++) {
    const hasAvatar = athletes[i].avatar && athletes[i].avatar.trim().length > 0 && !athletes[i].avatar.includes('default');
    if (hasAvatar && featuredCount < 12) {
      athletes[i].featured = true;
      featuredCount++;
    } else {
      athletes[i].featured = false;
    }
  }

  // Lưu file cache JSON để phục vụ seed nhanh hoặc khôi phục
  fs.writeFileSync(JSON_CACHE_FILE, JSON.stringify(athletes, null, 2), 'utf8');
  console.log(`✓ Đã lưu file cache: ${path.relative(process.cwd(), JSON_CACHE_FILE)}`);

  await tx(async () => {
    // 1. Xóa các VĐV mẫu cũ trong bảng athletes
    console.log('  → Dọn sạch bảng athletes & point_history cũ...');
    await run('TRUNCATE point_history, athletes RESTART IDENTITY CASCADE');

    console.log(`  → Đang chèn ${athletes.length} VĐV vào CSDL...`);
    const insertQuery = `
      INSERT INTO athletes (
        full_name, nickname, gender, hometown, club, avatar, points, peak_points, featured, visible
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, true)
      RETURNING id, full_name, points
    `;

    const pointHistoryQuery = `
      INSERT INTO point_history (
        athlete_id, old_points, new_points, kind, note, created_at
      ) VALUES (?, ?, ?, 'init', 'Khởi tạo từ hệ thống Pickna ranking', now())
    `;

    for (let i = 0; i < athletes.length; i++) {
      const a = athletes[i];
      const inserted = await get(insertQuery,
        a.full_name,
        a.nickname,
        a.gender,
        a.hometown,
        a.club,
        a.avatar,
        a.points,
        a.peak_points,
        a.featured
      );

      if (inserted) {
        await run(pointHistoryQuery, inserted.id, a.points, a.points);
      }
    }
  });

  const count = (await get('SELECT COUNT(*) AS c FROM athletes')).c;
  console.log(`🎉 Thành công! CSDL hiện có ${count} VĐV từ PICKNA.`);
}

async function main() {
  const startTime = Date.now();
  const forceFresh = process.argv.includes('--fresh') || process.argv.includes('--force');
  console.log('======================================================');
  console.log('🚀 BẮT ĐẦU CLONE DATA VẬN ĐỘNG VIÊN TỪ PICKNA.VN');
  console.log('======================================================');

  try {
    let athletes;
    if (!forceFresh && fs.existsSync(JSON_CACHE_FILE)) {
      console.log(`📁 Tìm thấy dữ liệu đã cào sẵn trong ${path.relative(process.cwd(), JSON_CACHE_FILE)}`);
      athletes = JSON.parse(fs.readFileSync(JSON_CACHE_FILE, 'utf8'));
      console.log(`✓ Đọc được ${athletes.length} VĐV từ file cache. (Dùng --fresh nếu muốn cào lại từ đầu).`);
    } else {
      // 1. Lấy danh sách ranking
      const basicAthletes = await fetchAllRankingPages();
      if (!basicAthletes.length) {
        throw new Error('Không lấy được dữ liệu từ pickna.vn. Vui lòng kiểm tra lại kết nối mạng.');
      }

      // 2. Lấy chi tiết từng hồ sơ
      athletes = await enrichAthleteDetails(basicAthletes);

      // 3. Tải avatar về thư mục cục bộ
      await downloadAvatarsLocally(athletes);
    }

    // 4. Nạp vào PostgreSQL
    await importToDatabase(athletes);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log('======================================================');
    console.log(`✨ HOÀN TẤT TOÀN BỘ TRONG ${elapsed} GIÂY!`);
    console.log('Xem kết quả tại:');
    console.log('  • Bảng xếp hạng: http://localhost:3000/xep-hang');
    console.log('  • Trang chủ:     http://localhost:3000/');
    console.log('======================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi khi clone dữ liệu:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
