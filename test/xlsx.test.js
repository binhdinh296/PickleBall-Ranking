const test = require('node:test');
const assert = require('node:assert');
const xlsx = require('../src/lib/xlsx');
const { rowsFromSheet, parsePoints, templateBook } = require('../src/routes/admin/reg-import')._test;

const d = { id: 1, name: 'Đôi nam 6.5', event: { name: 'Giải <thử> & bạn' } };
const read = (rows) => xlsx.readFirstSheet(xlsx.write([{ name: 'S', rows }]));
// Điền dữ liệu vào file mẫu thật (từ dòng 5) rồi đọc lại
const fill = (kind, data, name = d.name) => {
  const t = xlsx.readFirstSheet(templateBook(kind, { ...d, name }));
  return read([...t.slice(0, 4), ...data]);
};

test('Excel: file mẫu Đơn/Đôi đọc ngược lại đúng tiêu đề, ký tự đặc biệt được thoát', () => {
  for (const kind of ['don', 'doi']) {
    const t = xlsx.readFirstSheet(templateBook(kind, d));
    assert.match(t[0][0], kind === 'don' ? /NỘI DUNG ĐƠN/ : /NỘI DUNG ĐÔI/);
    assert.match(t[1][0], /Giải <thử> & bạn/);
    assert.strictEqual(t[3].includes('Họ tên VĐV 2'), kind === 'doi');
    assert.deepStrictEqual(rowsFromSheet(t, kind, d.name).rows, []); // dòng kẻ sẵn nhưng trống → không có đăng ký nào
  }
});

test('Excel: mẫu Đôi — số Excel (2.6499999) và SĐT mất số 0 vẫn đọc đúng', () => {
  const t = fill('doi', [[1, 'A', 912345678, 2.6499999999999999, 'B', '0987654321', '2,5', 'x'], [2, '', '', '', '', '', '', '']]);
  const { rows, warning } = rowsFromSheet(t, 'doi', d.name);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].points1, '2.65');
  assert.strictEqual(rows[0].phone1, '912345678'); // bù số 0 ở bước kiểm tra
  assert.strictEqual(rows[0].name2, 'B');
  assert.strictEqual(parsePoints(rows[0].points2), 2500);
  assert.strictEqual(warning, null);
});

test('Excel: mẫu Đơn — mỗi dòng 1 VĐV, không có VĐV 2', () => {
  const t = fill('don', [[1, 'Nguyễn A', '0912345678', 3, 'phí'], [2, 'Trần B', '0987654321', '2.75', '']]);
  const { rows } = rowsFromSheet(t, 'don', d.name);
  assert.deepStrictEqual(rows.map((r) => [r.name1, r.phone1, r.points1, r.name2, r.note]), [
    ['Nguyễn A', '0912345678', '3', '', 'phí'], ['Trần B', '0987654321', '2.75', '', ''],
  ]);
});

test('Excel: chặn file sai mẫu Đơn/Đôi so với loại nội dung', () => {
  const doiFile = fill('doi', [[1, 'A', '0912345678', 3, 'B', '0987654321', 3, '']]);
  const donFile = fill('don', [[1, 'A', '0912345678', 3, '']]);
  assert.throws(() => rowsFromSheet(doiFile, 'don', 'Đơn nam'), (e) => e.expose && /Sai mẫu: file là mẫu nội dung ĐÔI.*nội dung ĐƠN/.test(e.message));
  assert.throws(() => rowsFromSheet(donFile, 'doi', 'Đôi nam'), (e) => e.expose && /Sai mẫu: file là mẫu nội dung ĐƠN.*nội dung ĐÔI/.test(e.message));
  // File tự làm không có tiêu đề trang: nhận theo cột
  assert.throws(() => rowsFromSheet(read([['Họ tên VĐV 1', 'SĐT 1', 'Trình 1', 'Họ tên VĐV 2', 'SĐT 2', 'Trình 2']]), 'don', 'X'), /Sai mẫu/);
  assert.doesNotThrow(() => rowsFromSheet(read([['Họ tên', 'Số điện thoại', 'Trình độ']]), 'don', 'X'));
});

test('Excel: thiếu cột bắt buộc / không có dòng tiêu đề → báo lỗi rõ', () => {
  assert.throws(() => rowsFromSheet(read([['Họ tên VĐV 1', 'SĐT VĐV 1', 'Trình VĐV 1', 'Họ tên VĐV 2', 'SĐT VĐV 2']]), 'doi', 'X'), /thiếu cột: Trình VĐV 2/);
  assert.throws(() => rowsFromSheet(read([['a', 'b'], ['1', '2']]), 'doi', 'X'), /Không nhận ra dòng tiêu đề/);
});

test('Excel: mẫu tải ở nội dung khác → cảnh báo (không chặn)', () => {
  const t = fill('doi', [[1, 'A', '0912345678', 3, 'B', '0987654321', 3, '']], 'Đôi nữ 5.0');
  const { rows, warning } = rowsFromSheet(t, 'doi', 'Đôi nam 6.5');
  assert.strictEqual(rows.length, 1);
  assert.match(warning, /"Đôi nữ 5.0".*"Đôi nam 6.5"/);
});

test('Excel: trình nhập 1.0–8.0 hoặc thang nghìn, sai → NaN', () => {
  assert.strictEqual(parsePoints('2.725'), 2725);
  assert.strictEqual(parsePoints('3200'), 3200);
  assert.strictEqual(parsePoints(''), null);
  assert.ok(Number.isNaN(parsePoints('9')));
  assert.ok(Number.isNaN(parsePoints('abc')));
});

test('Excel: từ chối file không phải .xlsx / zip hỏng', () => {
  assert.throws(() => xlsx.readFirstSheet(Buffer.from('a,b,c\n1,2,3')), (e) => e.expose);
  assert.throws(() => xlsx.readFirstSheet(Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(40)])), (e) => e.expose);
});
