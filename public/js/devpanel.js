// Bảng test: chọn cỡ thiết bị cho từng khung, lưu tiến độ kịch bản, hiện phiên đăng nhập hiện tại
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  var KEY = 'devpanel-progress';
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { state = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* bỏ qua */ } }

  // ---- Khung thiết bị: thu nhỏ cho vừa cột ----
  $$('[data-frame]').forEach(function (frame) {
    var sel = $('[data-device]', frame);
    var stage = $('.dev-stage', frame);
    var device = $('.dev-device', frame);
    var iframe = $('iframe', frame);
    var url = $('[data-url]', frame);
    var open = $('[data-open-tab]', frame);
    var saved = null;
    try { saved = localStorage.getItem('devpanel-' + iframe.name); } catch (e) { /* bỏ qua */ }
    if (saved && $('option[value="' + saved + '"]', sel)) sel.value = saved;
    function fit() {
      var wh = sel.value.split('x').map(Number);
      var w = wh[0], h = wh[1];
      var border = w >= 1000 ? 8 : 16;
      device.classList.toggle('desktop', w >= 1000);
      device.style.width = (w + border) + 'px';
      device.style.height = (h + border) + 'px';
      var scale = Math.min(1, stage.clientWidth / (w + border));
      device.style.transform = 'scale(' + scale + ')';
      stage.style.height = Math.ceil((h + border) * scale) + 'px';
    }
    sel.addEventListener('change', function () { try { localStorage.setItem('devpanel-' + iframe.name, sel.value); } catch (e) { /* bỏ qua */ } fit(); });
    window.addEventListener('resize', fit);
    fit();
    $('[data-reload]', frame).addEventListener('click', function () { try { iframe.contentWindow.location.reload(); } catch (e) { iframe.src = iframe.src; } });
    iframe.addEventListener('load', function () {
      try {
        var p = iframe.contentWindow.location.pathname + iframe.contentWindow.location.search;
        url.textContent = p; open.href = p;
      } catch (e) { /* khác nguồn */ }
      whoami();
    });
  });

  // ---- Phiên đăng nhập hiện tại ----
  var roleLabel = { admin: 'Quản trị viên', editor: 'Biên tập viên', referee: 'Trọng tài' };
  function whoami() {
    fetch('/dev/whoami', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      $('[data-whoami]').textContent = d.loggedIn ? 'Đang đăng nhập: ' + d.name + ' (' + roleLabel[d.role] + ')' : 'Đang là khách (chưa đăng nhập CMS)';
    }).catch(function () { /* bỏ qua */ });
  }
  whoami();

  // ---- Tab vai trò ----
  $$('[data-tab]').forEach(function (t) {
    t.addEventListener('click', function () {
      $$('[data-tab]').forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
      $$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== t.getAttribute('data-tab'); });
    });
  });

  // ---- Tiến độ kịch bản ----
  function render() {
    var pass = 0;
    $$('[data-case]').forEach(function (c) {
      var id = c.getAttribute('data-case');
      var s = state[id] || {};
      c.setAttribute('data-state', s.pass ? 'pass' : s.fail ? 'fail' : '');
      $('[data-check="' + id + '"]', c).checked = !!s.pass;
      $('[data-status="' + id + '"]', c).textContent = s.pass ? 'Đạt' : s.fail ? 'Lỗi' : '';
      if (s.pass) pass++;
    });
    var total = $$('[data-case]').length;
    $('[data-progress]').textContent = pass;
    $('[data-progress-bar]').style.width = (total ? (pass / total) * 100 : 0) + '%';
    $$('[data-count]').forEach(function (el) {
      var g = el.getAttribute('data-count');
      var cases = $$('[data-group="' + g + '"]');
      var done = cases.filter(function (c) { return (state[c.getAttribute('data-case')] || {}).pass; }).length;
      el.textContent = '(' + done + '/' + cases.length + ')';
    });
  }
  $$('[data-check]').forEach(function (cb) {
    cb.addEventListener('click', function (e) { e.stopPropagation(); });
    cb.addEventListener('change', function () {
      var id = cb.getAttribute('data-check');
      state[id] = cb.checked ? { pass: true, at: Date.now() } : {};
      save(); render();
    });
  });
  $$('[data-fail]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-fail');
      var note = window.prompt('Mô tả lỗi gặp phải (lưu trên trình duyệt này):', (state[id] || {}).note || '');
      if (note === null) return;
      state[id] = { fail: true, note: note, at: Date.now() };
      save(); render();
    });
  });
  $('[data-reset]').addEventListener('click', function () {
    if (!window.confirm('Xóa toàn bộ tiến độ test trên trình duyệt này?')) return;
    state = {}; save(); render();
  });
  render();

  // ---- Chép dữ liệu test ----
  $$('[data-copy-text]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-copy-text');
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
        b.classList.add('chip-ok'); setTimeout(function () { b.classList.remove('chip-ok'); }, 1200);
      }).catch(function () { window.prompt('Chép dữ liệu:', t); });
    });
  });

  $$('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) { if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault(); });
  });
})();
