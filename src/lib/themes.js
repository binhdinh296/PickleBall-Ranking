// Danh sách giao diện của hệ thống (dùng chung cho CMS và view)
const THEMES = [
  { id: 'dark', name: 'Midnight', desc: 'Nền tối · navy, xanh chanh' },
  { id: 'luxe', name: 'Vàng sâm panh', desc: 'Nền tối · đen huyền, vàng' },
  { id: 'sky', name: 'Xanh dương nhạt', desc: 'Nền tối · than chì, xanh trời' },
  { id: 'banana', name: 'Xanh chuối', desc: 'Nền tối · đen rêu, xanh chuối' },
];
const IDS = THEMES.map((t) => t.id);

// Chuẩn hoá giá trị lưu trong CSDL: 'blue' (theme cũ) → 'luxe'; giá trị lạ → 'dark'
function normalizeTheme(v) {
  if (v === 'blue') return 'luxe';
  return IDS.includes(v) ? v : 'dark';
}

module.exports = { THEMES, IDS, normalizeTheme };
