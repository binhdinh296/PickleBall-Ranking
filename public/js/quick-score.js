/* Nhập tỉ số nhanh trên sơ đồ nhánh đấu (CMS): bấm thẻ trận → popup (điểm ±, trạng thái, sân, giờ) → lưu.
   Ctrl/⌘/Shift + bấm hoặc nút "Mở trang trận đầy đủ" vẫn vào trang trận như cũ (đổi nguồn đội, trọng tài, livestream…).
   Lưu xong tải lại trang tại đúng vị trí cuộn (đội thắng/thua tự chảy sang trận sau ở máy chủ). */
(function () {
  'use strict';
  var modal = document.getElementById('modal-quick-score');
  if (!modal || !window.PR) return;
  var form = modal.querySelector('[data-qs-form]');
  var saveBtn = modal.querySelector('[data-qs-save]');
  var errBox = modal.querySelector('[data-qs-err]');
  var card = null;

  function $(sel) { return modal.querySelector(sel); }
  function field(n) { return form.elements[n]; }
  function setStatus(v) { form.querySelectorAll('input[name=status]').forEach(function (r) { r.checked = r.value === v; }); }
  function getStatus() { var r = form.querySelector('input[name=status]:checked'); return r ? r.value : 'scheduled'; }

  function open(c) {
    card = c;
    var d = c.dataset;
    var full = d.ta && d.tb;
    $('[data-qs-code]').textContent = d.code || 'Trận';
    $('[data-qs-round]').textContent = d.round ? '· ' + d.round : '';
    $('[data-qs-name="a"]').textContent = d.ta || 'Chờ đội';
    $('[data-qs-name="b"]').textContent = d.tb || 'Chờ đội';
    $('[data-qs-wait]').hidden = !!full;
    ['a', 'b'].forEach(function (s) {
      var inp = field('score_' + s);
      inp.value = d['s' + s] || (full ? '0' : '');
      inp.disabled = !full;
      modal.querySelectorAll('[data-qs-for="' + s + '"]').forEach(function (b) { b.disabled = !full; });
    });
    form.querySelectorAll('input[name=status]').forEach(function (r) { r.disabled = !full; });
    setStatus(d.status || 'scheduled');
    field('court').value = d.court || '';
    field('start_time').value = d.time || '';
    $('[data-qs-full]').href = c.getAttribute('href');
    errBox.hidden = true;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Lưu';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { (full ? field('score_a') : field('court')).focus(); }, 60);
  }

  // Bấm thẻ trận trên sơ đồ → mở popup (giữ phím bổ trợ thì mở trang như link thường)
  document.addEventListener('click', function (e) {
    var c = e.target.closest('a.bk-match[data-quick]');
    if (!c || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    open(c);
  });

  modal.addEventListener('click', function (e) {
    var b = e.target.closest('[data-qs-step]');
    if (!b) return;
    var inp = field('score_' + b.getAttribute('data-qs-for'));
    inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) + parseInt(b.getAttribute('data-qs-step'), 10));
    if (getStatus() === 'scheduled') setStatus('live'); // đã bắt đầu ghi điểm → đang đấu
  });

  function save() {
    if (!card) return;
    var body = { court: field('court').value.trim(), start_time: field('start_time').value.trim() };
    if (!field('score_a').disabled) {
      body.score_a = field('score_a').value.trim();
      body.score_b = field('score_b').value.trim();
      body.status = getStatus();
      if (body.status === 'done') {
        var a = parseInt(body.score_a, 10); var b = parseInt(body.score_b, 10);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
          errBox.textContent = 'Kết thúc trận cần tỉ số có đội thắng (không được hoà).';
          errBox.hidden = false;
          return;
        }
      }
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Đang lưu…';
    window.PR.postJSON('/admin/tran/' + card.getAttribute('data-match-id'), body).then(function (r) {
      if (!r || !r.ok) {
        errBox.textContent = (r && r.error) || 'Không lưu được, thử lại.';
        errBox.hidden = false;
        saveBtn.disabled = false;
        saveBtn.textContent = 'Lưu';
        return;
      }
      // Tải lại tại đúng chỗ đang xem (app.js trả lại vị trí cuộn dọc và ngang của sơ đồ)
      var bs = document.querySelector('[data-bk-scroll]');
      try { sessionStorage.setItem('restore', JSON.stringify({ y: window.scrollY, x: bs ? bs.scrollLeft : 0, p: location.pathname + location.search })); } catch (err) { /* bỏ qua */ }
      location.reload();
    });
  }
  saveBtn.addEventListener('click', save);
  form.addEventListener('submit', function (e) { e.preventDefault(); save(); });
  form.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); save(); } });
})();
