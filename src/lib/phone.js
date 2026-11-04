// Đầu số di động Việt Nam sau chuyển đổi 2018 (đổi được trong CMS > Cấu hình)
const DEFAULT_PREFIXES = {
  Viettel: ['032', '033', '034', '035', '036', '037', '038', '039', '086', '096', '097', '098'],
  VinaPhone: ['081', '082', '083', '084', '085', '088', '091', '094'],
  MobiFone: ['070', '076', '077', '078', '079', '089', '090', '093'],
  Vietnamobile: ['052', '056', '058', '092'],
  Gmobile: ['059', '099'],
  iTel: ['087'],
  Reddi: ['055'],
};

let prefixMap = buildMap(DEFAULT_PREFIXES);

function buildMap(byCarrier) {
  const map = new Map();
  for (const [carrier, list] of Object.entries(byCarrier)) {
    for (const p of list) if (/^0\d{2}$/.test(p)) map.set(p, carrier);
  }
  return map;
}

// Nạp danh sách đầu số từ cấu hình dạng "Viettel: 032, 033\nVinaPhone: 081"
function loadPrefixes(text) {
  if (!text || !text.trim()) { prefixMap = buildMap(DEFAULT_PREFIXES); return; }
  const byCarrier = {};
  for (const line of text.split(/\r?\n/)) {
    const [name, list] = line.split(':');
    if (!name || !list) continue;
    byCarrier[name.trim()] = list.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  const map = buildMap(byCarrier);
  prefixMap = map.size ? map : buildMap(DEFAULT_PREFIXES);
}

function prefixesText(byCarrier = DEFAULT_PREFIXES) {
  return Object.entries(byCarrier).map(([k, v]) => `${k}: ${v.join(', ')}`).join('\n');
}

// Chuẩn hóa: bỏ khoảng trắng, dấu chấm, gạch; +84 / 84 / 0084 -> 0
function normalize(input) {
  let v = String(input || '').trim().replace(/[\s.\-()]/g, '');
  if (v.startsWith('+84')) v = '0' + v.slice(3);
  else if (v.startsWith('0084')) v = '0' + v.slice(4);
  else if (v.startsWith('84') && v.length === 11) v = '0' + v.slice(2);
  return v;
}

// Trả về { ok, phone, carrier, error }
function validate(input) {
  const phone = normalize(input);
  if (!phone) return { ok: false, error: 'Vui lòng nhập số điện thoại.' };
  if (!/^\d+$/.test(phone)) return { ok: false, error: 'Số điện thoại chỉ gồm chữ số.' };
  if (phone.length !== 10 || phone[0] !== '0') return { ok: false, error: 'Số di động Việt Nam gồm 10 chữ số, bắt đầu bằng 0.' };
  const carrier = prefixMap.get(phone.slice(0, 3));
  if (!carrier) return { ok: false, error: `Đầu số ${phone.slice(0, 3)} không phải đầu số di động Việt Nam hợp lệ.` };
  return { ok: true, phone, carrier };
}

function mask(phone) {
  const p = String(phone || '');
  return p.length >= 7 ? `${p.slice(0, 3)}****${p.slice(-3)}` : '***';
}

function clientConfig() {
  const byCarrier = {};
  for (const [p, c] of prefixMap) (byCarrier[c] ||= []).push(p);
  return byCarrier;
}

module.exports = { DEFAULT_PREFIXES, loadPrefixes, prefixesText, normalize, validate, mask, clientConfig };
