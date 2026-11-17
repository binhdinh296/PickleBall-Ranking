const TZ = 'Asia/Ho_Chi_Minh';

// Hiển thị điểm 3600 -> "3.600"
function pts(milli) {
  if (milli === null || milli === undefined || milli === '') return '—';
  return (Number(milli) / 1000).toFixed(3);
}

function signedPts(milli) {
  const n = Number(milli) || 0;
  return (n >= 0 ? '+' : '−') + (Math.abs(n) / 1000).toFixed(3);
}

// Nhận "3.5", "3,500", "3500" -> 3500
function parsePoints(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  const milli = n >= 100 ? Math.round(n) : Math.round(n * 1000);
  return milli > 20000 ? null : milli;
}

function money(v) {
  const n = Number(String(v).replace(/[.\s]/g, ''));
  if (!Number.isFinite(n) || String(v).trim() === '') return String(v || '');
  return n.toLocaleString('vi-VN');
}

function dateVN(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  return new Date(value).toLocaleDateString('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}

function dateTimeVN(value) {
  if (!value) return '';
  const d = new Date(value);
  const date = d.toLocaleDateString('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time}`;
}

// Giá trị cho <input type="datetime-local"> theo giờ Việt Nam
function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(new Date(value).getTime() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(`${value}:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function eventStatus(ev) {
  const t = today();
  if (t < ev.start_date) return 'upcoming';
  if (t > ev.end_date) return 'ended';
  return 'ongoing';
}

function duration(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return [h, m, r].map((n) => String(n).padStart(2, '0')).join(':');
}

const EVENT_STATUS_LABEL = { upcoming: 'Sắp diễn ra', ongoing: 'Đang diễn ra', ended: 'Đã kết thúc' };
const REG_STATUS_LABEL = { new: 'Mới đăng ký', approved: 'Đã duyệt', rejected: 'Từ chối' };
const SUB_STATUS_LABEL = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };
const MATCH_STATUS_LABEL = { scheduled: 'Chưa đấu', live: 'Đang đấu', done: 'Đã xong' };
const LIVE_STATUS_LABEL = { scheduled: 'Sắp phát', live: 'Đang phát', ended: 'Đã kết thúc' };
const GENDER_LABEL = { M: 'Nam', F: 'Nữ' };
const ROLE_LABEL = { admin: 'Quản trị viên', editor: 'Biên tập viên', referee: 'Trọng tài', organizer: 'Ban tổ chức' };
const GENDER_RULE_LABEL = { any: 'Tự do', male: 'Nam', female: 'Nữ', mixed: 'Hỗn hợp (1 nam + 1 nữ)' };

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  const last = parts[parts.length - 1] || '?';
  const first = parts.length > 1 ? parts[parts.length - 2] : '';
  return (first.charAt(0) + last.charAt(0)).toUpperCase() || '?';
}

function displayName(a) {
  return (a && (a.nickname || a.full_name)) || '';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// ---- Thang trình độ khi đăng ký giải: 1.0, 1.5 … 5.0, 5.5+ (lưu theo phần nghìn như điểm: 1000 … 5500) ----
const LEVELS = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500];
const levelLabel = (v) => (v >= 5500 ? '5.5+' : (v / 1000).toFixed(1));
// Giá trị từ ô chọn trình ("3000" hoặc "3.0") → số phần nghìn; không thuộc thang → null
function parseLevel(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = /^\d{4}$/.test(s) ? parseInt(s, 10) : parsePoints(s.replace('+', ''));
  return LEVELS.includes(n) ? n : null;
}
// Trình VĐV tự nhập ở form đăng ký: "2.65", "2,72", "3" → số phần nghìn (2650…).
// Hợp lệ: 1.0–8.0, tối đa 3 số lẻ; sai định dạng hoặc ngoài khoảng → null
const LEVEL_INPUT_MIN = 1000;
const LEVEL_INPUT_MAX = 8000;
function parseLevelInput(v) {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!/^\d(\.\d{1,3})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 1000);
  return n >= LEVEL_INPUT_MIN && n <= LEVEL_INPUT_MAX ? n : null;
}
// Mức "5.5+" là nấc cao nhất của thang: chọn làm trình tối đa nghĩa là không giới hạn trên
const levelCap = (max) => (max && max < LEVELS[LEVELS.length - 1] ? max : null);
// Số gọn cho giới hạn tổng trình: 6500 → "6.5", 6250 → "6.25", 7000 → "7.0"
const numShort = (v) => { const n = Number((v / 1000).toFixed(3)); return Number.isInteger(n) ? n.toFixed(1) : String(n); };

// Thoát ký tự HTML cho chuỗi chèn bằng <%- %> (vd. tiêu đề trang chủ lấy từ CMS)
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

module.exports = {
  pts, signedPts, parsePoints, money, dateVN, dateTimeVN, toLocalInput, fromLocalInput, today, eventStatus, duration,
  EVENT_STATUS_LABEL, REG_STATUS_LABEL, SUB_STATUS_LABEL, MATCH_STATUS_LABEL, LIVE_STATUS_LABEL, GENDER_LABEL,
  ROLE_LABEL, GENDER_RULE_LABEL, slugify, initials, displayName, pad2, esc,
  LEVELS, levelLabel, parseLevel, numShort, parseLevelInput, levelCap,
};
