// Đồng bộ dữ liệu mẫu cũ trên CSDL đã seed từ trước (vd. Neon trên Vercel) sang bản mới:
// thương hiệu PickNgheTinh, mô tả trang chủ, nhà tài trợ hư cấu, giải demo đặt tại Nghệ An / Hà Tĩnh.
// Chỉ thay những giá trị CÒN ĐÚNG Y bản mẫu cũ → dữ liệu đã chỉnh trong CMS được giữ nguyên.
// Chạy lại nhiều lần vẫn an toàn (idempotent).

const OLD_SITE_NAMES = ['PICKLERANK', 'PickleRank', 'Pickle Rank', 'PICKLE RANK'];
const NEW_SITE_NAME = 'PickNgheTinh';
const OLD_HERO_TEXTS = [
  'Bảng xếp hạng điểm trình chính xác, cập nhật tự động sau từng trận đấu và livestream trực tiếp.',
  'Giải đấu chuyên nghiệp, bảng xếp hạng minh bạch và livestream từng trận cho cộng đồng Pickleball, tất cả ở một nơi.',
];
const NEW_HERO_TEXT = 'Nơi kết nối cộng đồng Pickleball Nghệ An, Hà Tĩnh, tổ chức giải đấu chuyên nghiệp và xây dựng hệ thống ranking minh bạch.';

// [tên cũ (mang tên thương hiệu thật), tên mới hư cấu, file logo mẫu mới]
const PARTNERS = [
  ['Joola Pickleball Vietnam', 'Dinkra Paddle', 'dinkra'],
  ['Selkirk Sport', 'Lam Giang Sportswear', 'lam-giang'],
  ['Franklin Pickleball', 'Pickvia Pickleball Gear', 'pickvia'],
  ['CRBN Pickleball', 'Nước điện giải Hydrava', 'hydrava'],
  ['Nước uống điện giải Revive', 'Lumira Resort Cửa Lò', 'lumira'],
  ['Ngân hàng Vietcombank', 'Zenmo Fitness', 'zenmo'],
  ['Quỹ Phát Triển Thể Thao Phong Trào', 'Quỹ Pickleball Cộng Đồng Nghệ Tĩnh', 'quy-nghe-tinh'],
];

// [slug, cột, giá trị cũ, giá trị mới]
const EVENTS = [
  ['mua-thu-open-2026', 'address', 'Đường Nguyễn Du, TP. Vinh', 'Đường Nguyễn Du, Bến Thủy, Vinh, Nghệ An'],
  ['mua-thu-open-2026', 'description', 'Giải phong trào mở rộng mùa thu quy tụ các tay vợt hàng đầu miền Trung và cả nước.', 'Giải phong trào mở rộng mùa thu quy tụ các tay vợt hàng đầu Nghệ An và Hà Tĩnh.'],
  ['dong-xuan-cup-2026', 'address', 'Phường Hưng Dũng, TP. Vinh', 'Đường Trần Phú, Hồng Lĩnh, Hà Tĩnh'],
  ['super-cup-tiep-suc-2026', 'address', 'Bình Minh, TX. Cửa Lò', 'Đường Bình Minh, Cửa Lò, Nghệ An'],
  ['giai-vo-dich-quoc-gia-2026', 'name', 'Giải Vô Địch Pickleball Quốc Gia 2026', 'Giải Vô Địch Pickleball Nghệ Tĩnh 2026'],
  ['giai-vo-dich-quoc-gia-2026', 'venue', 'Cung Điền Kinh Mỹ Đình, Hà Nội', 'Nhà thi đấu đa năng Hà Tĩnh'],
  ['giai-vo-dich-quoc-gia-2026', 'address', 'Đường Trần Hữu Dực, Cầu Giấy, Hà Nội', 'Đường Hà Huy Tập, Hà Tĩnh'],
  ['giai-vo-dich-quoc-gia-2026', 'description', 'Giải vô địch quốc gia quy tụ các tay vợt hàng đầu tranh cúp vô địch và tuyển chọn đội tuyển.', 'Giải vô địch hai tỉnh Nghệ An – Hà Tĩnh quy tụ các tay vợt hàng đầu tranh cúp vô địch Nghệ Tĩnh.'],
];
const EVENT_COLUMNS = new Set(['name', 'venue', 'address', 'description']);

// Tên đội demo của giải Super Cup
const TEAMS = [
  ['Hà Nội Dinker Stars', 'Hồng Lĩnh Dinker Stars'],
  ['Sài Gòn Smashers', 'Cửa Lò Smashers'],
  ['Đà Nẵng Phượng Hoàng', 'Thiên Cầm Sunshine'],
];

async function syncDemoData(db, log = console.log) {
  let changed = 0;
  const count = (r) => { const n = (r && (r.rowCount ?? r.changes)) || 0; changed += n; return n; };

  // Thương hiệu + mô tả trang chủ (bảng settings ghi đè giá trị mặc định trong code)
  count(await db.query(`UPDATE settings SET value = ? WHERE key = 'site_name' AND value = ANY(?)`, [NEW_SITE_NAME, OLD_SITE_NAMES]));
  count(await db.query(`UPDATE settings SET value = ? WHERE key = 'hero_text' AND value = ANY(?)`, [NEW_HERO_TEXT, OLD_HERO_TEXTS]));
  count(await db.query(`UPDATE settings SET value = 'contact@picknghetinh.vn' WHERE key = 'contact_email' AND value = 'contact@picklerank.vn'`));

  // Nhà tài trợ: bỏ tên/link/logo thương hiệu thật của dữ liệu mẫu cũ
  for (const [oldName, newName, file] of PARTNERS) {
    count(await db.query(
      `UPDATE partners SET name = ?, url = '', logo = ? WHERE name = ? AND (logo IS NULL OR logo LIKE '/uploads/%' OR logo LIKE '/static/img/partners/%')`,
      [newName, `/static/img/partners/${file}.svg`, oldName],
    ));
  }

  // Giải demo
  for (const [slug, col, oldVal, newVal] of EVENTS) {
    if (!EVENT_COLUMNS.has(col)) continue;
    count(await db.query(`UPDATE events SET ${col} = ? WHERE slug = ? AND ${col} = ?`, [newVal, slug, oldVal]));
  }
  for (const [oldName, newName] of TEAMS) {
    count(await db.query(
      `UPDATE teams SET name = ? WHERE name = ? AND division_id IN (SELECT d.id FROM divisions d JOIN events e ON e.id = d.event_id WHERE e.slug = 'super-cup-tiep-suc-2026')`,
      [newName, oldName],
    ));
  }

  log(changed ? `Đồng bộ dữ liệu mẫu PickNgheTinh: cập nhật ${changed} dòng.` : 'Dữ liệu mẫu PickNgheTinh đã mới, không cần cập nhật.');
  return changed;
}

module.exports = { syncDemoData };
