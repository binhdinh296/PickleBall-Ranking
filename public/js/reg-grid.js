/* Bảng thêm đăng ký nhanh (CMS › Đăng ký): thêm/xoá dòng, dán vùng ô từ Excel, Enter xuống dòng,
   gửi cả bảng dưới dạng JSON (tránh giới hạn số trường của form). */
(function () {
  'use strict';
  var box = document.querySelector('[data-rq]');
  if (!box) return;
  var form = box.querySelector('[data-rq-form]');
  var body = box.querySelector('[data-rq-body]');
  var tpl = box.querySelector('[data-rq-tpl]');
  var countEl = box.querySelector('[data-rq-count]');
  var submit = box.querySelector('[data-rq-submit]');
  // Cột lấy theo dòng mẫu: nội dung Đơn có 4 cột (họ tên, SĐT, trình, ghi chú), nội dung Đôi có 7
  var COLS = Array.prototype.slice.call(tpl.content.querySelectorAll('.rq-in')).map(function (el) { return el.getAttribute('data-col'); });
  var MAX = 300;

  // Nút "Nhập từ Excel": chọn file xong là gửi luôn để đọc (chưa lưu gì)
  var upload = box.querySelector('[data-rq-upload]');
  if (upload) {
    var file = upload.querySelector('[data-rq-file]');
    var pick = file.closest('label');
    pick.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
    file.addEventListener('change', function () {
      if (!file.files.length) return;
      upload.querySelector('[data-rq-upload-label]').textContent = 'Đang đọc…';
      pick.classList.add('is-busy');
      upload.submit();
    });
  }

  function rows() { return Array.prototype.slice.call(body.querySelectorAll('[data-rq-row]')); }
  function inputs(row) { return COLS.map(function (c) { return row.querySelector('[data-col="' + c + '"]'); }); }
  function filled(row) { return inputs(row).some(function (el, i) { return COLS[i] !== 'note' && el.value.trim() !== ''; }); }
  function msgOf(row) { var n = row.nextElementSibling; return n && n.hasAttribute('data-rq-msg') ? n : null; }

  function renumber() {
    var n = 0;
    rows().forEach(function (r, i) {
      r.querySelector('[data-rq-no]').textContent = i + 1;
      inputs(r).forEach(function (el) { el.setAttribute('aria-label', el.getAttribute('aria-label').replace(/\d+$/, i + 1)); });
      if (filled(r)) n++;
    });
    countEl.textContent = n;
    submit.disabled = n === 0;
  }

  function addRows(k, after) {
    var made = [];
    for (var i = 0; i < k && rows().length < MAX; i++) {
      var frag = tpl.content.cloneNode(true);
      var row = frag.querySelector('[data-rq-row]');
      if (after) { var ref = msgOf(after) || after; ref.parentNode.insertBefore(frag, ref.nextSibling); after = row; } else body.appendChild(frag);
      made.push(row);
    }
    renumber();
    return made;
  }

  box.addEventListener('click', function (e) {
    var add = e.target.closest('[data-rq-add]');
    if (add) {
      var made = addRows(parseInt(add.getAttribute('data-rq-add'), 10) || 1);
      if (made[0]) inputs(made[0])[0].focus();
      return;
    }
    var del = e.target.closest('[data-rq-del]');
    if (del) {
      var row = del.closest('[data-rq-row]');
      var m = msgOf(row);
      if (m) m.remove();
      if (rows().length > 1) row.remove();
      else { inputs(row).forEach(function (el) { el.value = ''; }); row.classList.remove('is-err', 'is-warn'); }
      renumber();
    }
  });

  // Sửa 1 dòng đã báo lỗi → bỏ tô màu (kết quả kiểm tra cũ không còn đúng)
  body.addEventListener('input', function (e) {
    var row = e.target.closest('[data-rq-row]');
    if (!row) return;
    if (row.classList.contains('is-err') || row.classList.contains('is-warn')) {
      row.classList.remove('is-err', 'is-warn');
      var m = msgOf(row);
      if (m) m.classList.add('is-stale');
    }
    renumber();
  });

  // Enter: sang cùng cột ở dòng dưới (hết bảng thì thêm dòng)
  body.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.isComposing || !e.target.matches('.rq-in')) return;
    e.preventDefault();
    var row = e.target.closest('[data-rq-row]');
    var col = COLS.indexOf(e.target.getAttribute('data-col'));
    var list = rows();
    var next = list[list.indexOf(row) + (e.shiftKey ? -1 : 1)];
    if (!next && !e.shiftKey) next = addRows(1)[0];
    if (next) inputs(next)[col].focus();
  });

  // Dán vùng ô từ Excel / Google Sheets (cột cách nhau bằng Tab, dòng bằng xuống dòng)
  body.addEventListener('paste', function (e) {
    if (!e.target.matches('.rq-in')) return;
    var text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text || (text.indexOf('\t') < 0 && !/\r?\n./.test(text))) return; // 1 ô: để trình duyệt dán bình thường
    e.preventDefault();
    var lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n').map(function (l) { return l.split('\t'); });
    var col = COLS.indexOf(e.target.getAttribute('data-col'));
    // Copy cả cột STT của file mẫu (thêm 1 cột đầu là số) khi dán vào ô đầu → bỏ cột STT
    if (col === 0 && lines.every(function (c) { return c.length >= COLS.length + 1 && /^\s*\d*\s*$/.test(c[0]); })) lines = lines.map(function (c) { return c.slice(1); });
    var list = rows();
    var start = list.indexOf(e.target.closest('[data-rq-row]'));
    var need = start + lines.length - list.length;
    if (need > 0) addRows(need);
    list = rows();
    lines.forEach(function (cells, i) {
      var row = list[start + i];
      if (!row) return;
      var ins = inputs(row);
      cells.forEach(function (v, j) { if (ins[col + j]) ins[col + j].value = v.trim(); });
      row.classList.remove('is-err', 'is-warn');
      var m = msgOf(row);
      if (m) m.classList.add('is-stale');
    });
    renumber();
  });

  // Gửi: gom bảng thành JSON, bỏ name của từng ô để form chỉ còn vài trường
  form.addEventListener('submit', function (e) {
    var data = rows().filter(filled).map(function (r) {
      var o = { line: r.querySelector('[data-col="line"]').value };
      inputs(r).forEach(function (el, i) { o[COLS[i]] = el.value; });
      return o;
    });
    if (!data.length) { e.preventDefault(); return; }
    var json = form.querySelector('[data-rq-json]');
    json.value = JSON.stringify(data);
    json.disabled = false;
    body.querySelectorAll('[name]').forEach(function (el) { el.removeAttribute('name'); });
    submit.disabled = true;
    submit.textContent = 'Đang lưu…';
  });

  renumber();
  // Trang trả về sau khi đọc file / lưu lỗi: đưa thẳng tới bảng (cuộn lại sau khi tải xong vì ảnh, font làm lệch vị trí)
  if (box.hasAttribute('data-rq-focus')) {
    var go = function () { box.scrollIntoView({ block: 'start', behavior: 'instant' }); };
    go();
    window.addEventListener('load', go, { once: true });
  }
})();
