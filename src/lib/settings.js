const { all, run } = require('../db');
const phone = require('./phone');

// Các khóa cấu hình chỉnh được trong CMS > Cấu hình
const DEFAULTS = {
  site_name: 'PICKLERANK',
  site_tagline: 'HỆ THỐNG GIẢI ĐẤU',
  hero_eyebrow: 'Mùa giải 2026',
  hero_title: 'Mỗi cú dink, mỗi điểm số đều được ghi nhận.',
  hero_text: 'Giải đấu chuyên nghiệp, bảng xếp hạng minh bạch và livestream từng trận cho cộng đồng Pickleball, tất cả ở một nơi.',
  footer_text: 'Hệ thống giải đấu, ranking và livestream Pickleball.',
  hotline: '',
  zalo: '',
  email: '',
  address: '',
  facebook_url: '',
  youtube_url: '',
  zalo_group_url: '',
  color_ball: '#D4F53C',
  color_court: '#14B8A6',
  color_gold: '#E6C27A',
  default_theme: 'dark',
  min_points_male: '2500',
  min_points_female: '2000',
  newbie_exit_male: '3000',
  newbie_exit_female: '2500',
  lock_margin: '100',
  featured_count: '12',
  phone_prefixes: phone.prefixesText(),
  otp_enabled: '1',
  otp_provider: 'mock',
  otp_brandname: '',
  otp_ttl_seconds: '300',
  otp_cooldown_seconds: '60',
  otp_daily_limit: '5',
  otp_max_attempts: '5',
  privacy_url: '',
};

// Khóa không lưu trong bảng settings công khai (chỉ server dùng)
const PRIVATE_KEYS = ['yt_refresh_token_enc'];

let cache = null;

async function loadSettings() {
  const s = { ...DEFAULTS };
  for (const row of await all('SELECT key, value FROM settings')) {
    if (!PRIVATE_KEYS.includes(row.key) && !row.key.startsWith('yt_')) s[row.key] = row.value;
  }
  phone.loadPrefixes(s.phone_prefixes);
  cache = s;
  return s;
}

function getSettings() {
  return cache || { ...DEFAULTS };
}

async function setSetting(key, value) {
  await run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value === null ? null : String(value));
}

async function saveSettings(values) {
  for (const key of Object.keys(DEFAULTS)) {
    if (key in values) await setSetting(key, String(values[key] ?? '').trim());
  }
  await loadSettings();
}

function num(key) {
  return Number(getSettings()[key]) || 0;
}

function isHex(v) {
  return /^#[0-9a-fA-F]{6}$/.test(String(v || ''));
}

function themeColors() {
  const s = getSettings();
  return {
    ball: isHex(s.color_ball) ? s.color_ball : DEFAULTS.color_ball,
    court: isHex(s.color_court) ? s.color_court : DEFAULTS.color_court,
    gold: isHex(s.color_gold) ? s.color_gold : DEFAULTS.color_gold,
  };
}

module.exports = { DEFAULTS, PRIVATE_KEYS, loadSettings, getSettings, setSetting, saveSettings, num, themeColors, isHex };
