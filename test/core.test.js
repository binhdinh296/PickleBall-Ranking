const test = require('node:test');
const assert = require('node:assert/strict');
const phone = require('../src/lib/phone');
const fmt = require('../src/lib/format');
const points = require('../src/lib/points');
const bracket = require('../src/lib/bracket');
const youtube = require('../src/lib/youtube');

test('SĐT: chuẩn hóa các cách viết phổ biến', () => {
  for (const v of ['0912345678', '091 234 5678', '091.234.5678', '+84912345678', '84912345678', '0084912345678', '(091) 234-5678']) {
    assert.equal(phone.validate(v).phone, '0912345678', v);
  }
});

test('SĐT: nhận diện nhà mạng theo đầu số', () => {
  assert.equal(phone.validate('0981234567').carrier, 'Viettel');
  assert.equal(phone.validate('0831234567').carrier, 'VinaPhone');
  assert.equal(phone.validate('0701234567').carrier, 'MobiFone');
  assert.equal(phone.validate('0921234567').carrier, 'Vietnamobile');
  assert.equal(phone.validate('0591234567').carrier, 'Gmobile');
  assert.equal(phone.validate('0871234567').carrier, 'iTel');
  assert.equal(phone.validate('0551234567').carrier, 'Reddi');
});

test('SĐT: từ chối số sai', () => {
  for (const v of ['', 'abc', '091234567', '09123456789', '0101234567', '0201234567', '0951234567', '0241234567', '1912345678', '+1 415 555 0100']) {
    assert.equal(phone.validate(v).ok, false, v);
  }
});

test('SĐT: che số khi ghi log', () => {
  assert.equal(phone.mask('0912345678'), '091****678');
});

test('SĐT: danh sách đầu số đổi được từ cấu hình', () => {
  phone.loadPrefixes('MạngMới: 069');
  assert.equal(phone.validate('0691234567').carrier, 'MạngMới');
  assert.equal(phone.validate('0912345678').ok, false);
  phone.loadPrefixes('');
  assert.equal(phone.validate('0912345678').ok, true);
});

test('Điểm: đọc nhiều cách nhập', () => {
  assert.equal(fmt.parsePoints('3.5'), 3500);
  assert.equal(fmt.parsePoints('3,500'), 3500);
  assert.equal(fmt.parsePoints('3500'), 3500);
  assert.equal(fmt.parsePoints('2.875'), 2875);
  assert.equal(fmt.parsePoints('-1'), null);
  assert.equal(fmt.parsePoints('abc'), null);
  assert.equal(fmt.pts(3600), '3.600');
  assert.equal(fmt.signedPts(-50), '−0.050');
});

test('Điểm Lock: lấy mức cao nhất của sàn, mốc newbie, đỉnh − biên', () => {
  // Mặc định: sàn Nam 2.500, thoát newbie Nam 3.000, biên 0.100
  assert.equal(points.lockPoints({ gender: 'M', peak_points: 2600 }), 2500);
  assert.equal(points.lockPoints({ gender: 'M', peak_points: 3050 }), 3000);
  assert.equal(points.lockPoints({ gender: 'M', peak_points: 3600 }), 3500);
  assert.equal(points.lockPoints({ gender: 'F', peak_points: 2100 }), 2000);
});

test('Vòng tròn: thắng → hiệu số → đối đầu', () => {
  const teams = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const m = (a, b, sa, sb) => ({ team_a_id: a, team_b_id: b, score_a: sa, score_b: sb, status: 'done' });
  const matches = [m(2, 1, 41, 55), m(3, 4, 55, 43), m(4, 2, 55, 51), m(3, 1, 53, 55), m(1, 4, 55, 38), m(3, 2, 41, 55)];
  const { rows, subTables } = bracket.standings(teams, matches);
  assert.deepEqual(rows.map((r) => r.id), [1, 2, 3, 4]);
  assert.equal(rows[0].wins, 3);
  // Đội 2 và 3 cùng 1 trận thắng, cùng hiệu số → xét đối đầu (2 thắng 3)
  assert.equal(rows[1].diff, rows[2].diff);
  assert.equal(rows[1].basis, 'Đối đầu');
  assert.equal(subTables.length, 1);
});

test('YouTube: lấy ID video từ mọi dạng link, từ chối tên miền lạ', () => {
  const id = 'dQw4w9WgXcQ';
  for (const v of [id, `https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}`, `https://www.youtube.com/live/${id}?si=x`, `https://m.youtube.com/watch?v=${id}&t=5`]) {
    assert.equal(youtube.parseVideoId(v), id, v);
  }
  assert.equal(youtube.parseVideoId(`https://evil.example.com/watch?v=${id}`), null);
  assert.equal(youtube.parseVideoId('javascript:alert(1)'), null);
});

test('Escape HTML: tiêu đề trang chủ từ CMS không chèn được thẻ/thuộc tính', () => {
  assert.equal(fmt.esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(fmt.esc("Mỗi cú dink & 'ghi nhận'"), 'Mỗi cú dink &amp; &#39;ghi nhận&#39;');
  assert.equal(fmt.esc(null), '');
});

test('YouTube: buổi phát tạo qua API — giờ bắt đầu luôn ở tương lai, không tự dừng khi rớt mạng, cho nhúng + tự lưu video', () => {
  const now = Date.parse('2026-11-05T08:00:00Z');
  const past = youtube.broadcastBody({ title: 'Sân 1', scheduledStart: '2026-11-05T07:00:00Z', privacy: 'unlisted' }, now);
  assert.equal(past.snippet.scheduledStartTime, '2026-11-05T08:01:00.000Z'); // giờ đã qua → đẩy lên +1 phút
  const none = youtube.broadcastBody({ title: 'Sân 1' }, now);
  assert.equal(none.snippet.scheduledStartTime, '2026-11-05T08:01:00.000Z');
  const future = youtube.broadcastBody({ title: 'Sân 1', scheduledStart: '2026-11-06T01:30:00Z', privacy: 'public' }, now);
  assert.equal(future.snippet.scheduledStartTime, '2026-11-06T01:30:00.000Z');
  assert.equal(future.status.privacyStatus, 'public');
  assert.equal(past.status.privacyStatus, 'unlisted');
  const cd = future.contentDetails;
  assert.equal(cd.enableAutoStart, true);
  assert.equal(cd.enableAutoStop, false);
  assert.equal(cd.recordFromStart, true);
  assert.equal(cd.enableEmbed, true);
  assert.equal(youtube.broadcastBody({ title: 'x'.repeat(150) }, now).snippet.title.length, 100);
});

test('YouTube: ưu tiên RTMPS cho OBS', () => {
  assert.deepEqual(youtube.pickIngestion({ ingestionAddress: 'rtmp://a.rtmp.youtube.com/live2', rtmpsIngestionAddress: 'rtmps://a.rtmps.youtube.com/live2', streamName: 'abcd-1234' }),
    { url: 'rtmps://a.rtmps.youtube.com/live2', key: 'abcd-1234' });
  assert.deepEqual(youtube.pickIngestion({ ingestionAddress: 'rtmp://a.rtmp.youtube.com/live2', streamName: 'k' }), { url: 'rtmp://a.rtmp.youtube.com/live2', key: 'k' });
  assert.deepEqual(youtube.pickIngestion(undefined), { url: null, key: null });
});
