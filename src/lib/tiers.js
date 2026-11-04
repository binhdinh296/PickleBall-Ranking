const { num } = require('./settings');

// Hạng huy hiệu theo điểm trình (ngưỡng chỉnh trong CMS > Cấu hình). Xếp từ cao xuống thấp.
const TIERS = [
  { key: 'diamond', label: 'Kim cương', setting: 'tier_diamond_min' },
  { key: 'platinum', label: 'Bạch kim', setting: 'tier_platinum_min' },
  { key: 'gold', label: 'Vàng', setting: 'tier_gold_min' },
  { key: 'silver', label: 'Bạc', setting: 'tier_silver_min' },
  { key: 'bronze', label: 'Đồng', setting: 'tier_bronze_min' },
  { key: 'iron', label: 'Sắt', setting: null },
];

function tiers() {
  return TIERS.map((t) => ({ key: t.key, label: t.label, min: t.setting ? num(t.setting) : 0 }));
}

function tierFor(points) {
  const list = tiers();
  return list.find((t) => points >= t.min) || list[list.length - 1];
}

module.exports = { tiers, tierFor, TIER_SETTINGS: TIERS.filter((t) => t.setting).map((t) => t.setting) };
