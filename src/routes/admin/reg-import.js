// Thêm đăng ký hàng loạt cho 1 nội dung thi đấu, theo loại nội dung Đơn (1 VĐV) / Đôi (2 VĐV):
// • Bảng nhập nhanh nhiều dòng (gõ tay hoặc dán từ Excel) → kiểm tra → lưu
// • File Excel mẫu đúng loại nội dung (mỗi dòng 1 VĐV hoặc 1 đôi)
// • Tải file đã điền lên → kiểm tra đúng mẫu Đơn/Đôi → đổ vào bảng nhập nhanh để xem lại, sửa lỗi rồi mới lưu
const express = require('express');
const multer = require('multer');
const { all, get, run, tx } = require('../../db');
const fmt = require('../../lib/format');
const phoneLib = require('../../lib/phone');
const xlsx = require('../../lib/xlsx');
const { verifyCsrf, requireRole, audit } = require('../../lib/security');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const editor = requireRole('editor');

const MAX_ROWS = 300; // số đăng ký tối đa mỗi lần lưu
const TEMPLATE_ROWS = 300; // số dòng kẻ sẵn trong file mẫu
const FIRST_ROW = 5; // dòng dữ liệu đầu tiên của file mẫu
const FIELDS = ['name1', 'phone1', 'points1', 'name2', 'phone2', 'points2', 'note'];
const userError = (message) => Object.assign(new Error(message), { expose: true });
const xlsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter(req, file, cb) {
    const ok = /\.xlsx$/i.test(file.originalname || '');
    cb(ok ? null : userError('Chỉ nhận file Excel .xlsx (hãy dùng nút "Tải mẫu Excel").'), ok);
  },
});

async function loadDivision(id) {
  const d = await get('SELECT * FROM divisions WHERE id = ?', parseInt(id, 10) || 0);
  if (!d) return null;
  d.event = await get('SELECT * FROM events WHERE id = ?', d.event_id);
  return d;
}
const kindOf = (d) => (fmt.isSingle(d) ? 'don' : 'doi');
const KIND_LABEL = { don: 'Đơn', doi: 'Đôi' };

// Hiển thị lại trang đăng ký (giống GET /noi-dung/:id/dang-ky) kèm bảng nhập nhanh đã điền sẵn
async function renderPage(res, d, grid, code = 200) {
  const regs = await all('SELECT * FROM registrations WHERE division_id = ? ORDER BY id', d.id);
  res.status(code).render('admin/registrations', { title: `Đăng ký: ${d.name}`, d, regs, status: '', error: null, values: {}, grid });
}

// ---------- File mẫu ----------
const S = xlsx.STYLE;
const head = (v) => ({ v, s: S.head });
const HEADERS = {
  don: ['STT', 'Họ tên VĐV', 'SĐT', 'Trình', 'Ghi chú'],
  doi: ['STT', 'Họ tên VĐV 1', 'SĐT VĐV 1', 'Trình VĐV 1', 'Họ tên VĐV 2', 'SĐT VĐV 2', 'Trình VĐV 2', 'Ghi chú'],
};
const TITLE = { don: 'DANH SÁCH ĐĂNG KÝ – NỘI DUNG ĐƠN', doi: 'DANH SÁCH ĐĂNG KÝ – NỘI DUNG ĐÔI' };

function guideSheet(kind, d) {
  const rows = [
    [{ v: 'HƯỚNG DẪN ĐIỀN FILE', s: S.title }],
    [{ v: `Nội dung: ${d.name} (${KIND_LABEL[kind]})`, s: S.note }],
    [],
    [head('Mục'), head('Cách điền')],
    ['Mỗi dòng', kind === 'don' ? 'Là 1 vận động viên đăng ký (nội dung đơn).' : 'Là 1 đôi đăng ký: VĐV 1 và VĐV 2 (nội dung đôi).'],
    ['Họ tên', 'Bắt buộc. Tối đa 80 ký tự.'],
    ['Số điện thoại', 'Bắt buộc. Số di động Việt Nam 10 chữ số, bắt đầu bằng 0 (vd. 0912345678). Mỗi SĐT chỉ đăng ký 1 lần trong nội dung.'],
    ['Trình', 'Từ 1.0 đến 8.0, tối đa 3 số lẻ (vd. 2.5 · 2.65 · 2.725). VĐV đã có hồ sơ trên hệ thống (trùng SĐT) sẽ dùng trình trên hệ thống, có thể bỏ trống.'],
    ['Ghi chú', 'Không bắt buộc, chỉ ban tổ chức thấy (vd. đã đóng lệ phí).'],
    ['Cột STT', 'Chỉ để dễ đếm, hệ thống bỏ qua.'],
    ['Lưu ý', `File này chỉ dùng cho nội dung ${KIND_LABEL[kind].toUpperCase()}. Không thêm, xoá hay đổi tên cột; hệ thống sẽ từ chối file sai mẫu.`],
    ['Nhập vào hệ thống', 'CMS → Giải đấu → Nội dung → Đăng ký → "Nhập từ Excel". Hệ thống hiện bảng để kiểm tra, sửa lỗi rồi mới lưu.'],
    [],
    [{ v: 'Ví dụ', s: S.title }],
    HEADERS[kind].map(head),
  ];
  const examples = kind === 'don'
    ? [['1', 'Nguyễn Văn A', '0912345678', '2.65', 'Đã đóng phí'], ['2', 'Trần Thị B', '0987654321', '3', '']]
    : [['1', 'Nguyễn Văn A', '0912345678', '2.65', 'Trần Thị B', '0987654321', '2.5', 'Đã đóng phí'],
      ['2', 'Lê Văn C', '0903123456', '3', 'Phạm Văn D', '0935123456', '2.725', '']];
  examples.forEach((r) => rows.push(r.map((v) => ({ v, s: S.example }))));
  rows.push([], [{ v: 'Ví dụ chỉ để tham khảo, hãy điền ở trang "Danh sách".', s: S.note }]);
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 2 && typeof r[0] === 'string') rows[i] = [{ v: r[0], s: S.cell }, { v: r[1], s: S.hint }];
  }
  return { name: 'Hướng dẫn', cols: kind === 'don' ? [20, 80, 14, 10, 18] : [20, 80, 13, 12, 22, 13, 12, 16], rows };
}

function templateBook(kind, d) {
  const evName = d.event ? d.event.name : '';
  const last = FIRST_ROW + TEMPLATE_ROWS - 1;
  const range = (col) => `${col}${FIRST_ROW}:${col}${last}`;
  const level = (col) => ({ type: 'decimal', operator: 'between', min: 1, max: 8, sqref: range(col),
    title: 'Trình', prompt: 'Từ 1.0 đến 8.0, vd. 2.65', error: 'Trình phải từ 1.0 đến 8.0 (vd. 2.65).' });
  const phone = (col) => ({ type: 'textLength', operator: 'between', min: 9, max: 13, sqref: range(col),
    title: 'Số điện thoại', prompt: '10 chữ số, bắt đầu bằng 0', error: 'SĐT di động Việt Nam gồm 10 chữ số, bắt đầu bằng 0.' });
  const end = xlsx.colName(HEADERS[kind].length - 1);
  const sheet = {
    name: 'Danh sách',
    cols: kind === 'don' ? [6, 30, 15, 10, 30] : [6, 26, 14, 11, 26, 14, 11, 24],
    rows: [
      [{ v: TITLE[kind], s: S.title }],
      [{ v: `${evName ? `Giải: ${evName} · ` : ''}Nội dung: ${d.name}`, s: S.note }],
      [{ v: `${kind === 'don' ? 'Mỗi dòng là 1 VĐV' : 'Mỗi dòng là 1 đôi'} · Điền từ dòng ${FIRST_ROW} · SĐT 10 số bắt đầu bằng 0 · Trình 1.0–8.0 (vd. 2.65) · Không đổi tên cột · Xem trang "Hướng dẫn".`, s: S.note }],
      HEADERS[kind].map(head),
    ],
    styleRange: { from: FIRST_ROW, to: last, cols: kind === 'don' ? [S.cell, S.text, S.text, S.cell, S.text] : [S.cell, S.text, S.text, S.cell, S.text, S.text, S.cell, S.text] },
    validations: kind === 'don' ? [phone('C'), level('D')] : [phone('C'), level('D'), phone('F'), level('G')],
    merges: [`A1:${end}1`, `A2:${end}2`, `A3:${end}3`],
    heights: { 1: 26, 3: 32, 4: 30 },
    freezeRow: 4,
  };
  return xlsx.write([sheet, guideSheet(kind, d)]);
}

router.get('/noi-dung/:id/dang-ky/mau.xlsx', editor, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const kind = kindOf(d);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="mau-dang-ky-${kind}-${fmt.slugify(d.name) || d.id}.xlsx"`);
  res.send(templateBook(kind, d));
}));

// ---------- Đọc file đã điền ----------
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

// Nhận diện cột theo tiêu đề; số 1/2 cuối tiêu đề cho biết VĐV 1 hay VĐV 2
function mapHeader(cells) {
  const map = {};
  cells.forEach((raw, i) => {
    const h = plain(raw);
    if (!h || /^(stt|#|tt)$/.test(h)) return;
    const idx = (/(?:vdv|nguoi|thanh vien)\s*([12])\b/.exec(h) || /\b([12])\s*$/.exec(h) || [])[1] || '';
    let key = null;
    if (/ghi chu|note/.test(h)) key = 'note';
    else if (/doi so|ma doi|so doi|cap so/.test(h)) key = 'pair';
    else if (/sdt|dien thoai|phone|so dt|di dong/.test(h)) key = 'phone';
    else if (/trinh|diem|level|rating/.test(h)) key = 'points';
    else if (/ten|vdv|van dong vien|nguoi choi/.test(h)) key = 'name';
    if (!key) return;
    const k = key === 'note' || key === 'pair' ? key : `${key}${idx}`;
    if (map[k] === undefined) map[k] = i;
  });
  return map;
}

// Đọc bảng → các dòng đăng ký; từ chối file không đúng mẫu Đơn/Đôi của nội dung (kind)
function rowsFromSheet(table, kind, divisionName) {
  let headerAt = -1;
  let map = null;
  for (let r = 0; r < Math.min(table.length, 20); r++) {
    const m = mapHeader(table[r] || []);
    const hasName = m.name !== undefined || m.name1 !== undefined;
    const hasPhone = m.phone !== undefined || m.phone1 !== undefined;
    if (hasName && hasPhone) { headerAt = r; map = m; break; }
  }
  if (!map) throw userError(`Không nhận ra dòng tiêu đề (cần có cột Họ tên và SĐT). Hãy bấm "Tải mẫu Excel" để lấy đúng mẫu nội dung ${KIND_LABEL[kind]}.`);
  // Mẫu Đôi có cột VĐV 2; mẫu Đơn thì không. Tiêu đề trang ("NỘI DUNG ĐƠN/ĐÔI") cũng phải khớp nếu có.
  const top = table.slice(0, headerAt).map((r) => plain((r || []).join(' '))).join(' ');
  const titleKind = /noi dung don\b/.test(top) ? 'don' : /noi dung doi\b/.test(top) ? 'doi' : null;
  const hasP2 = map.name2 !== undefined || map.phone2 !== undefined || map.points2 !== undefined || map.pair !== undefined;
  const fileKind = hasP2 ? 'doi' : titleKind || 'don';
  if (fileKind !== kind || (titleKind && titleKind !== kind)) {
    const got = KIND_LABEL[titleKind && titleKind !== kind ? titleKind : fileKind];
    throw userError(`Sai mẫu: file là mẫu nội dung ${got.toUpperCase()}, nhưng "${divisionName}" là nội dung ${KIND_LABEL[kind].toUpperCase()}. `
      + `Hãy bấm "Tải mẫu Excel" ngay trên trang này để lấy đúng mẫu ${KIND_LABEL[kind]}.`);
  }
  // Cột bắt buộc của mẫu: thiếu thì báo ngay thay vì để từng dòng báo lỗi
  const col = (k) => {
    if (map[k] !== undefined) return map[k];
    if (kind === 'don') return map[`${k}1`];
    return k.endsWith('1') ? map[k.slice(0, -1)] : undefined; // mẫu Đôi: "Họ tên" không số coi như VĐV 1
  };
  const need = kind === 'don' ? [['name', 'Họ tên'], ['phone', 'SĐT'], ['points', 'Trình']]
    : [['name1', 'Họ tên VĐV 1'], ['phone1', 'SĐT VĐV 1'], ['points1', 'Trình VĐV 1'], ['name2', 'Họ tên VĐV 2'], ['phone2', 'SĐT VĐV 2'], ['points2', 'Trình VĐV 2']];
  const missing = need.filter(([k]) => col(k) === undefined).map(([, l]) => l);
  if (missing.length) throw userError(`File thiếu cột: ${missing.join(', ')}. Hãy dùng đúng mẫu nội dung ${KIND_LABEL[kind]}, không xoá hay đổi tên cột.`);

  const val = (row, k) => { const c = k === 'note' ? map.note : col(k); return c === undefined ? '' : String(row[c] ?? '').trim(); };
  const rows = [];
  for (let r = headerAt + 1; r < table.length; r++) {
    const row = table[r] || [];
    const o = kind === 'don'
      ? { name1: val(row, 'name'), phone1: val(row, 'phone'), points1: val(row, 'points'), name2: '', phone2: '', points2: '' }
      : { name1: val(row, 'name1'), phone1: val(row, 'phone1'), points1: val(row, 'points1'), name2: val(row, 'name2'), phone2: val(row, 'phone2'), points2: val(row, 'points2') };
    o.note = val(row, 'note');
    o.line = `Dòng ${r + 1}`;
    if (['name1', 'phone1', 'points1', 'name2', 'phone2', 'points2'].some((f) => o[f])) rows.push(o);
  }
  // File mẫu tải ở nội dung khác (vd. tải ở "Đôi nam" rồi nhập vào "Đôi nữ"): cảnh báo, không chặn
  const sub = String((table[1] || [])[0] || '');
  const m = /Nội dung:\s*(.+)$/i.exec(sub);
  const warning = m && plain(m[1]) !== plain(divisionName)
    ? `File mẫu được tải cho nội dung "${m[1].trim()}", đang nhập vào "${divisionName}". Kiểm tra đúng nội dung trước khi lưu.` : null;
  return { rows, warning };
}

// ---------- Kiểm tra ----------
// Trình nhập: "2.65" / "2,65" / số Excel 2.65 / thang nghìn 2650 → phần nghìn (1000–8000)
function parsePoints(v) {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return null;
  if (/^\d{4}$/.test(s)) { const n = parseInt(s, 10); return n >= 1000 && n <= 8000 ? n : NaN; }
  const n = fmt.parseLevelInput(s);
  return n === null ? NaN : n;
}
// Excel lưu SĐT dạng số sẽ mất số 0 đầu: 912345678 → 0912345678
const phoneText = (v) => { const s = String(v || '').trim(); return /^[1-9]\d{8}$/.test(s) ? `0${s}` : s; };

async function checkRows(d, input) {
  const single = fmt.isSingle(d);
  const sides = single ? ['1'] : ['1', '2'];
  const rows = input.map((r) => {
    const o = { line: String(r.line || '').slice(0, 60), errors: [], warnings: [] };
    FIELDS.forEach((f) => { o[f] = String(r[f] ?? '').trim().slice(0, f === 'note' ? 200 : 80); });
    if (single) { o.name2 = ''; o.phone2 = ''; o.points2 = ''; }
    o.phone1 = phoneText(o.phone1); o.phone2 = phoneText(o.phone2);
    return o;
  }).filter((r) => FIELDS.some((f) => f !== 'note' && r[f]));
  const phones = rows.flatMap((r) => sides.map((s) => r[`phone${s}`])).map((p) => phoneLib.validate(p)).filter((p) => p.ok).map((p) => p.phone);
  const athletes = new Map((phones.length ? await all('SELECT id, phone, points FROM athletes WHERE phone = ANY(?::text[])', phones) : []).map((a) => [a.phone, a]));
  const taken = new Map();
  if (phones.length) {
    const regs = await all(`SELECT phone1, phone2, name1, name2 FROM registrations WHERE division_id = ? AND status <> 'rejected'
      AND (phone1 = ANY(?::text[]) OR phone2 = ANY(?::text[]))`, d.id, phones, phones);
    regs.forEach((g) => { [g.phone1, g.phone2].filter(Boolean).forEach((p) => taken.set(p, fmt.regName(g))); });
  }
  const seen = new Map();
  const maxPlayer = fmt.levelCap(d.max_player_points);
  rows.forEach((r, i) => {
    const ok = {};
    for (const s of sides) {
      const who = single ? 'VĐV' : `VĐV ${s}`;
      if (!r[`name${s}`]) r.errors.push(`${who}: thiếu họ tên.`);
      const p = phoneLib.validate(r[`phone${s}`]);
      if (!p.ok) { r.errors.push(`${who}: ${r[`phone${s}`] ? p.error : 'thiếu SĐT.'}`); continue; }
      r[`phone${s}`] = p.phone;
      const a = athletes.get(p.phone);
      const typed = parsePoints(r[`points${s}`]);
      if (Number.isNaN(typed)) r.errors.push(`${who}: trình "${r[`points${s}`]}" không hợp lệ (1.0–8.0, vd. 2.65).`);
      let pts = typed;
      if (a) {
        r[`athlete${s}`] = a.id;
        if (a.points) {
          if (typed !== null && !Number.isNaN(typed) && typed !== a.points) r.warnings.push(`${who} đã có hồ sơ: dùng trình hệ thống ${fmt.pts(a.points)}.`);
          pts = a.points;
        }
      } else if (typed === null) r.errors.push(`${who}: thiếu trình.`);
      r[`pts${s}`] = Number.isNaN(pts) ? null : pts;
      if (taken.has(p.phone)) r.errors.push(`${who}: SĐT ${p.phone} đã đăng ký trong nội dung này (${taken.get(p.phone)}).`);
      if (seen.has(p.phone)) r.errors.push(`${who}: SĐT ${p.phone} trùng với dòng ${seen.get(p.phone) + 1} trong bảng.`);
      ok[s] = p.phone;
    }
    if (ok['1'] && ok['1'] === ok['2']) r.errors.push('Hai VĐV trùng số điện thoại.');
    [ok['1'], ok['2']].forEach((p) => { if (p && !seen.has(p)) seen.set(p, i); });
    // Điều kiện của nội dung: chỉ cảnh báo (BTC nhập tay được quyền quyết định)
    const pts = sides.map((s) => r[`pts${s}`]);
    if (pts.every(Boolean)) {
      const lim = [];
      pts.forEach((p) => {
        if (maxPlayer && p > maxPlayer) lim.push(`trình ${fmt.pts(p)} vượt mức tối đa ${fmt.pts(maxPlayer)}`);
        if (d.min_player_points && p < d.min_player_points) lim.push(`trình ${fmt.pts(p)} dưới mức tối thiểu ${fmt.pts(d.min_player_points)}`);
      });
      if (!single && d.max_total_points && pts[0] + pts[1] > d.max_total_points) lim.push(`tổng trình ${fmt.pts(pts[0] + pts[1])} vượt ${fmt.pts(d.max_total_points)}`);
      if (lim.length) r.warnings.push(`Vượt điều kiện nội dung: ${lim.join('; ')}.`);
    }
  });
  return rows;
}

const gridOf = (rows, extra) => ({
  rows,
  errorCount: rows.filter((r) => r.errors.length).length,
  warnCount: rows.filter((r) => r.warnings.length).length,
  ...extra,
});

// ---------- Tải file lên → kiểm tra mẫu → đổ vào bảng ----------
router.post('/noi-dung/:id/dang-ky/nhap-file', editor, (req, res, next) => {
  xlsUpload.single('file')(req, res, (err) => { req.uploadError = err; next(); });
}, verifyCsrf, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const fail = (message) => renderPage(res, d, gridOf([], { fileError: message }), 400);
  if (req.uploadError) {
    const e = req.uploadError;
    return fail(e.code === 'LIMIT_FILE_SIZE' ? 'File quá lớn (tối đa 2 MB).' : e.expose || e.name === 'MulterError' ? e.message : 'Không đọc được file.');
  }
  if (!req.file) return fail('Chưa chọn file Excel.');
  let parsed;
  try {
    parsed = rowsFromSheet(xlsx.readFirstSheet(req.file.buffer), kindOf(d), d.name);
  } catch (e) {
    if (!e.expose) { console.error(e); return fail('Không đọc được file Excel. Hãy mở file và lưu lại dạng .xlsx.'); }
    return fail(e.message);
  }
  const unit = fmt.unitLabel(d);
  if (!parsed.rows.length) return fail(`File không có dòng dữ liệu nào (điền từ dòng ${FIRST_ROW} của file mẫu).`);
  if (parsed.rows.length > MAX_ROWS) return fail(`File có ${parsed.rows.length} ${unit}, mỗi lần nhập tối đa ${MAX_ROWS}. Hãy chia thành nhiều file.`);
  const rows = await checkRows(d, parsed.rows);
  await audit(req, 'registration_import_preview', `division:${d.id}`, `${kindOf(d)}: ${rows.length} ${unit}`);
  return renderPage(res, d, gridOf(rows, { source: 'excel', fileName: String(req.file.originalname || '').slice(0, 120), fileWarning: parsed.warning }));
}));

// ---------- Lưu bảng nhập nhanh ----------
function readGrid(body) {
  if (body.rows_json) {
    let list;
    try { list = JSON.parse(String(body.rows_json)); } catch { list = null; }
    if (!Array.isArray(list)) return [];
    return list.slice(0, MAX_ROWS + 1).map((r) => (r && typeof r === 'object' ? r : {}));
  }
  const col = (f) => [].concat(body[f] ?? []);
  const n = Math.max(...FIELDS.map((f) => col(f).length));
  return Array.from({ length: Math.min(n, MAX_ROWS + 1) }, (_, i) => Object.fromEntries(FIELDS.map((f) => [f, col(f)[i] ?? ''])));
}

router.post('/noi-dung/:id/dang-ky/nhap-nhanh', editor, wrap(async (req, res, next) => {
  const d = await loadDivision(req.params.id);
  if (!d) return next();
  const source = req.body.source === 'excel' ? 'excel' : 'grid';
  const status = req.body.reg_status === 'new' ? 'new' : 'approved';
  const unit = fmt.unitLabel(d);
  const input = readGrid(req.body).map((r, i) => ({ ...r, line: String(r.line || '').slice(0, 60) || `Dòng ${i + 1}` }));
  const extra = { source, regStatus: status };
  if (input.length > MAX_ROWS) return renderPage(res, d, gridOf([], { ...extra, fileError: `Mỗi lần lưu tối đa ${MAX_ROWS} ${unit}.` }), 400);
  const rows = await checkRows(d, input);
  if (!rows.length) return renderPage(res, d, gridOf([], { ...extra, fileError: 'Bảng chưa có dòng nào được điền.' }), 400);
  const grid = gridOf(rows, extra);
  if (grid.errorCount) return renderPage(res, d, { ...grid, saveError: true }, 400);
  const single = fmt.isSingle(d);
  const defaultNote = source === 'excel' ? 'Nhập từ Excel' : 'Thêm thủ công';
  await tx(async () => {
    for (const r of rows) {
      await run(`INSERT INTO registrations(division_id, athlete1_id, name1, phone1, points1, athlete2_id, name2, phone2, points2, status, admin_note)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, d.id, r.athlete1 || null, r.name1, r.phone1, r.pts1,
      single ? null : r.athlete2 || null, single ? null : r.name2, single ? null : r.phone2, single ? null : r.pts2,
      status, r.note || defaultNote);
    }
  });
  await audit(req, 'registration_bulk_add', `division:${d.id}`, `${source}: ${rows.length} ${unit} (${status})`);
  req.flash('success', `Đã thêm ${rows.length} ${unit}${status === 'approved' ? ' (đã duyệt)' : ' (chờ duyệt)'}. Sang "Bốc thăm & Nhánh đấu" để tạo ${single ? 'danh sách VĐV' : 'đội'} từ đăng ký đã duyệt.`);
  res.redirect(`/admin/noi-dung/${d.id}/dang-ky`);
}));

module.exports = router;
module.exports._test = { rowsFromSheet, mapHeader, parsePoints, templateBook };
