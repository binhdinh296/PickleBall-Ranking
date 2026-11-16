// Danh sách giao diện của hệ thống (dùng chung cho CMS và view)
const THEMES = [
  { id: 'dark', name: 'Midnight', desc: 'Navy · xanh chanh' },
  { id: 'luxe', name: 'Vàng sâm panh', desc: 'Đen huyền · vàng' },
  { id: 'wine', name: 'Vang đỏ & Hồng đào', desc: 'Rượu vang · hồng đào' },
  { id: 'violet', name: 'Tím đêm & Oải hương', desc: 'Tím than · oải hương' },
];
const IDS = THEMES.map((t) => t.id);

// Chuẩn hoá giá trị lưu trong CSDL: 'blue' (theme cũ) → 'luxe'; giá trị lạ → 'dark'
function normalizeTheme(v) {
  if (v === 'blue') return 'luxe';
  return IDS.includes(v) ? v : 'dark';
}

module.exports = { THEMES, IDS, normalizeTheme };
