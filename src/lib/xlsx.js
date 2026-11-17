// Đọc / ghi file Excel .xlsx tối giản, không cần thư viện ngoài (chỉ dùng zlib của Node).
// • write(sheets): dựng file mẫu có định dạng (tiêu đề đậm, tô màu, cố định dòng đầu, độ rộng cột, ràng buộc dữ liệu)
// • readFirstSheet(buffer): lấy bảng giá trị (mảng dòng → mảng chuỗi) của trang tính đầu tiên
// File tải lên là dữ liệu không tin cậy: giới hạn số mục trong zip và dung lượng giải nén để chặn "zip bomb".
const zlib = require('zlib');

const MAX_ENTRIES = 300;
const MAX_UNZIPPED = 20 * 1024 * 1024;
const userError = (message) => Object.assign(new Error(message), { expose: true });

// ---------- ZIP ----------
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = Buffer.from(f.data, 'utf8');
    const data = zlib.deflateRawSync(raw);
    const crc = zlib.crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

function unzip(buf) {
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) throw userError('File không phải định dạng Excel .xlsx (nếu là .xls hoặc .csv, hãy mở bằng Excel và "Lưu thành" .xlsx).');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw userError('File Excel bị hỏng hoặc chưa lưu xong.');
  const count = buf.readUInt16LE(eocd + 10);
  if (count > MAX_ENTRIES) throw userError('File Excel quá phức tạp, hãy dùng file mẫu.');
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw userError('File Excel bị hỏng.');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localAt = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.(xml|rels)$/i.test(name)) continue; // chỉ cần các phần XML
    if (flags & 1) throw userError('File Excel đang đặt mật khẩu, hãy bỏ mật khẩu rồi tải lại.');
    if (localAt + 30 > buf.length) throw userError('File Excel bị hỏng.');
    const start = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28);
    const data = buf.subarray(start, start + size);
    let raw;
    if (method === 0) raw = data;
    else if (method === 8) {
      try { raw = zlib.inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED }); } catch { throw userError('File Excel quá lớn hoặc bị hỏng.'); }
    } else continue;
    total += raw.length;
    if (total > MAX_UNZIPPED) throw userError('File Excel quá lớn.');
    out.set(name.replace(/^\/+/, ''), raw.toString('utf8'));
  }
  return out;
}

// ---------- XML ----------
const escXml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  // bỏ ký tự điều khiển không hợp lệ trong XML
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const unescXml = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  const k = e.toLowerCase();
  if (k[0] === '#') {
    const code = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
  }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[k];
});
const attr = (s, name) => { const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(s); return m ? unescXml(m[1]) : null; };
// Gộp mọi <t> (bỏ phần phiên âm <rPh>) — chuỗi có định dạng gồm nhiều <r><t>…</t></r>
const textOf = (xml) => {
  const clean = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
  let s = '';
  const re = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g;
  let m;
  while ((m = re.exec(clean))) s += unescXml(m[1]);
  return s;
};
const colIndex = (ref) => {
  const letters = /^([A-Z]+)/i.exec(ref || '');
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
const colName = (i) => { let s = ''; i += 1; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

// Số đọc từ Excel có thể là 2.6499999999999999 → làm tròn 6 chữ số rồi bỏ số 0 thừa
const numText = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return String(Math.round(n * 1e6) / 1e6);
};

function readFirstSheet(buf, { maxRows = 2000 } = {}) {
  const files = unzip(buf);
  const wb = files.get('xl/workbook.xml');
  if (!wb) throw userError('Không tìm thấy trang tính trong file Excel.');
  const first = /<(?:\w+:)?sheet\b([^>]*)\/?>/.exec(wb);
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (first) {
    const rid = attr(first[1], 'r:id') || attr(first[1], '\\w+:id');
    const rels = files.get('xl/_rels/workbook.xml.rels') || '';
    const relRe = /<(?:\w+:)?Relationship\b([^>]*)\/?>/g;
    let m;
    while ((m = relRe.exec(rels))) {
      if (attr(m[1], 'Id') === rid) {
        const target = attr(m[1], 'Target') || '';
        sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
        break;
      }
    }
  }
  const sheet = files.get(sheetPath);
  if (!sheet) throw userError('Không đọc được trang tính đầu tiên của file Excel.');
  const shared = [];
  const sst = files.get('xl/sharedStrings.xml');
  if (sst) {
    const siRe = /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>|<(?:\w+:)?si\b[^>]*\/>/g;
    let m;
    while ((m = siRe.exec(sst))) shared.push(m[1] ? textOf(m[1]) : '');
  }

  const rows = [];
  const rowRe = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
  const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
  let rm;
  let nextRow = 0;
  while ((rm = rowRe.exec(sheet))) {
    const r = parseInt(attr(rm[1], 'r'), 10);
    const ri = Number.isFinite(r) ? r - 1 : nextRow;
    nextRow = ri + 1;
    if (ri >= maxRows) break;
    const cells = [];
    let cm;
    let nextCol = 0;
    while (rm[2] && (cm = cellRe.exec(rm[2]))) {
      const ref = attr(cm[1], 'r');
      const ci = ref ? colIndex(ref) : nextCol;
      nextCol = ci + 1;
      if (ci < 0 || ci > 60) continue;
      const t = attr(cm[1], 't');
      const body = cm[2] || '';
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body);
      let value = '';
      if (t === 's') value = v ? shared[parseInt(v[1], 10)] ?? '' : '';
      else if (t === 'inlineStr') value = textOf(body);
      else if (t === 'str' || t === 'e') value = v ? unescXml(v[1]) : '';
      else if (t === 'b') value = v ? (v[1] === '1' ? 'TRUE' : 'FALSE') : '';
      else value = v ? numText(unescXml(v[1])) : '';
      cells[ci] = String(value).trim();
    }
    rows[ri] = Array.from(cells, (c) => c ?? '');
  }
  return Array.from(rows, (r) => r || []);
}

// ---------- Ghi file ----------
// Kiểu ô (chỉ số trong cellXfs của styles.xml)
const S = { normal: 0, title: 1, note: 2, head: 3, text: 4, cell: 5, hint: 6, example: 7 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="15"/><color rgb="FF0B3D2E"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF5B6770"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="11"/><color rgb="FF8A949C"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0E7C5A"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F3"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD5DDD9"/></left><right style="thin"><color rgb="FFD5DDD9"/></right><top style="thin"><color rgb="FFD5DDD9"/></top><bottom style="thin"><color rgb="FFD5DDD9"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="49" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// sheet: { name, cols: [độ rộng], rows: [[{ v, s }|chuỗi]], heights: {chỉ số dòng: px}, merges: ['A1:H1'],
//          freezeRow: số dòng cố định, validations: [{ type, sqref, min, max, title, error, prompt }], styleRange: { from, to, cols: [s] } }
function sheetXml(sh) {
  const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
  out.push('<sheetViews><sheetView workbookViewId="0"' + (sh.tabSelected ? ' tabSelected="1"' : '') + '>');
  if (sh.freezeRow) out.push(`<pane ySplit="${sh.freezeRow}" topLeftCell="A${sh.freezeRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="B${sh.freezeRow + 1}" sqref="B${sh.freezeRow + 1}"/>`);
  out.push('</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>');
  if (sh.cols) out.push('<cols>' + sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>');
  out.push('<sheetData>');
  const total = Math.max(sh.rows.length, sh.styleRange ? sh.styleRange.to : 0);
  for (let r = 0; r < total; r++) {
    const row = sh.rows[r] || [];
    const blank = sh.styleRange && r + 1 >= sh.styleRange.from && r + 1 <= sh.styleRange.to ? sh.styleRange.cols : null;
    const n = Math.max(row.length, blank ? blank.length : 0);
    if (!n) continue;
    const ht = sh.heights && sh.heights[r + 1];
    out.push(`<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>`);
    for (let c = 0; c < n; c++) {
      const cell = row[c];
      const ref = `${colName(c)}${r + 1}`;
      const v = cell && typeof cell === 'object' ? cell.v : cell;
      const s = cell && typeof cell === 'object' && cell.s !== undefined ? cell.s : blank ? blank[c] : S.normal;
      if (v === undefined || v === null || v === '') { if (s) out.push(`<c r="${ref}" s="${s}"/>`); continue; }
      if (typeof v === 'number') out.push(`<c r="${ref}" s="${s}"><v>${v}</v></c>`);
      else out.push(`<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escXml(v)}</t></is></c>`);
    }
    out.push('</row>');
  }
  out.push('</sheetData>');
  if (sh.merges && sh.merges.length) out.push(`<mergeCells count="${sh.merges.length}">` + sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('') + '</mergeCells>');
  if (sh.validations && sh.validations.length) {
    out.push(`<dataValidations count="${sh.validations.length}">`);
    for (const dv of sh.validations) {
      out.push(`<dataValidation type="${dv.type}" allowBlank="1" showInputMessage="1" showErrorMessage="1"${dv.operator ? ` operator="${dv.operator}"` : ''}`
        + ` errorTitle="${escXml(dv.title || 'Dữ liệu không hợp lệ')}" error="${escXml(dv.error || '')}" promptTitle="${escXml(dv.title || '')}" prompt="${escXml(dv.prompt || '')}" sqref="${dv.sqref}">`
        + (dv.min !== undefined ? `<formula1>${dv.min}</formula1>` : '') + (dv.max !== undefined ? `<formula2>${dv.max}</formula2>` : '') + '</dataValidation>');
    }
    out.push('</dataValidations>');
  }
  out.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>');
  out.push('</worksheet>');
  return out.join('');
}

function write(sheets) {
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<bookViews><workbookView activeTab="0"/></bookViews><sheets>'
      + sheets.map((s, i) => `<sheet name="${escXml(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml({ ...s, tabSelected: i === 0 }) })),
  ];
  return zip(files);
}

module.exports = { write, readFirstSheet, STYLE: S, colName };
