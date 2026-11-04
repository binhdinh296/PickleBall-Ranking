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
const ROLE_LABEL = { admin: 'Quản trị viên', editor: 'Biên tập viên', referee: 'Trọng tài' };
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

// Thoát ký tự HTML cho chuỗi chèn bằng <%- %> (vd. tiêu đề trang chủ lấy từ CMS)
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

module.exports = {
  pts, signedPts, parsePoints, money, dateVN, dateTimeVN, toLocalInput, fromLocalInput, today, eventStatus, duration,
  EVENT_STATUS_LABEL, REG_STATUS_LABEL, SUB_STATUS_LABEL, MATCH_STATUS_LABEL, LIVE_STATUS_LABEL, GENDER_LABEL,
  ROLE_LABEL, GENDER_RULE_LABEL, slugify, initials, displayName, pad2, esc,
};
