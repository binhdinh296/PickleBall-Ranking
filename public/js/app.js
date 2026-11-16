(function () {
  'use strict';
  var root = document.documentElement;
  var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Lỗi kết nối.' }; }); });
  }
  window.PR = { postJSON: postJSON, csrf: csrf };

  // ---- Chọn giao diện: 4 theme nền tối — Midnight · Vàng sâm panh · Xanh dương nhạt · Xanh chuối ----
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    if (t === 'dark') root.removeAttribute('data-flat');
    else root.setAttribute('data-flat', '');
    try { localStorage.setItem('theme', t); } catch (e) { /* bỏ qua */ }
    $$('[data-theme-opt]').forEach(function (o) { o.setAttribute('aria-checked', String(o.getAttribute('data-theme-opt') === t)); });
  }
  $$('[data-theme-menu]').forEach(function (menu) {
    var btn = $('[data-theme-btn]', menu);
    var pop = $('.theme-pop', menu);
    var opts = $$('[data-theme-opt]', menu);
    var cur = root.getAttribute('data-theme');
    opts.forEach(function (o) { o.setAttribute('aria-checked', String(o.getAttribute('data-theme-opt') === cur)); });
    function open() {
      pop.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      var sel = $('[aria-checked="true"]', menu) || opts[0];
      if (sel) sel.focus();
    }
    function close(focusBtn) {
      if (pop.hidden) return;
      pop.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (focusBtn) btn.focus();
    }
    btn.addEventListener('click', function () { if (pop.hidden) open(); else close(); });
    opts.forEach(function (o, i) {
      o.addEventListener('click', function () { applyTheme(o.getAttribute('data-theme-opt')); close(true); });
      o.addEventListener('keydown', function (e) {
        var n = opts.length;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); opts[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n].focus(); }
        else if (e.key === 'Home') { e.preventDefault(); opts[0].focus(); }
        else if (e.key === 'End') { e.preventDefault(); opts[n - 1].focus(); }
      });
    });
    menu.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(true); });
    document.addEventListener('click', function (e) { if (!menu.contains(e.target)) close(); });
    menu.addEventListener('focusout', function (e) { if (e.relatedTarget && !menu.contains(e.relatedTarget)) close(); });
  });

  // ---- Ô chọn: hiển thị lựa chọn bằng chữ xuống dòng được (select gốc vẫn nhận thao tác) ----
  $$('select.input').forEach(function (sel) {
    if (sel.closest('.select-wrap')) return;
    var wrap = document.createElement('span');
    wrap.className = 'select-wrap';
    var inline = sel.getAttribute('style');
    if (inline) { wrap.setAttribute('style', inline); sel.setAttribute('style', ''); }
    var face = document.createElement('span');
    face.className = 'input select-face';
    face.setAttribute('aria-hidden', 'true');
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(face);
    wrap.appendChild(sel);
    function sync() { var o = sel.options[sel.selectedIndex]; face.textContent = o ? o.text : ''; }
    sel.addEventListener('change', sync);
    if (sel.form) sel.form.addEventListener('reset', function () { setTimeout(sync, 0); });
    sync();
  });

  // ---- Xác nhận trước khi gửi form nguy hiểm ----
  $$('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // ---- Kiểm tra SĐT Việt Nam khi gõ ----
  var phoneCfg = {};
  try { phoneCfg = JSON.parse(($('#phone-config') || {}).textContent || '{}'); } catch (e) { phoneCfg = {}; }
  var prefixToCarrier = {};
  Object.keys(phoneCfg).forEach(function (c) { phoneCfg[c].forEach(function (p) { prefixToCarrier[p] = c; }); });

  function normalizePhone(v) {
    v = String(v || '').trim().replace(/[\s.\-()]/g, '');
    if (v.indexOf('+84') === 0) v = '0' + v.slice(3);
    else if (v.indexOf('0084') === 0) v = '0' + v.slice(4);
    else if (v.indexOf('84') === 0 && v.length === 11) v = '0' + v.slice(2);
    return v;
  }
  function checkPhone(raw) {
    var p = normalizePhone(raw);
    if (!p) return { ok: false, empty: true };
    if (!/^\d+$/.test(p)) return { ok: false, error: 'Số điện thoại chỉ gồm chữ số.' };
    if (p.length < 10) return { ok: false, partial: true, error: 'Cần đủ 10 chữ số.' };
    if (p.length > 10 || p[0] !== '0') return { ok: false, error: 'Số di động Việt Nam gồm 10 chữ số, bắt đầu bằng 0.' };
    var c = prefixToCarrier[p.slice(0, 3)];
    if (!c) return { ok: false, error: 'Đầu số ' + p.slice(0, 3) + ' không phải đầu số di động Việt Nam.' };
    return { ok: true, phone: p, carrier: c };
  }
  window.PR.checkPhone = checkPhone;

  $$('input[data-phone]').forEach(function (input) {
    var hint = input.parentNode.querySelector('[data-phone-hint]');
    function update(final) {
      var r = checkPhone(input.value);
      if (!hint) return r;
      hint.classList.remove('ok', 'err');
      if (r.empty) { hint.textContent = hint.getAttribute('data-default') || ''; input.removeAttribute('aria-invalid'); }
      else if (r.ok) { hint.textContent = '✓ ' + r.carrier; hint.classList.add('ok'); input.removeAttribute('aria-invalid'); }
      else if (r.partial && !final) { hint.textContent = r.error; input.removeAttribute('aria-invalid'); }
      else { hint.textContent = r.error; hint.classList.add('err'); input.setAttribute('aria-invalid', 'true'); }
      return r;
    }
    input.addEventListener('input', function () { update(false); input.dispatchEvent(new CustomEvent('phonecheck', { detail: checkPhone(input.value) })); });
    input.addEventListener('blur', function () { var r = update(true); if (r.ok) input.value = r.phone; });
    if (input.value) update(true);
  });

  // ---- Tra cứu VĐV theo SĐT khi đăng ký giải ----
  $$('[data-lookup]').forEach(function (box) {
    var phone = $('input[data-phone]', box);
    var name = $('[data-lookup-name]', box);
    var trinh = $('[data-lookup-points]', box);
    var status = $('[data-lookup-status]', box);
    var last = '';
    var t = null;
    phone.addEventListener('phonecheck', function (e) {
      var r = e.detail;
      clearTimeout(t);
      if (!r.ok) {
        if (name.dataset.locked) { name.readOnly = false; trinh.readOnly = false; delete name.dataset.locked; status.textContent = ''; }
        return;
      }
      if (r.phone === last) return;
      t = setTimeout(function () {
        last = r.phone;
        fetch('/api/athlete-lookup?phone=' + encodeURIComponent(r.phone), { credentials: 'same-origin' })
          .then(function (x) { return x.json(); })
          .then(function (res) {
            if (res.found) {
              name.value = res.name; trinh.value = res.points;
              name.readOnly = true; trinh.readOnly = true; name.dataset.locked = '1';
              status.textContent = '✓ Đã có hồ sơ: dùng tên và điểm trên hệ thống';
              status.className = 'hint ok';
            } else {
              if (name.dataset.locked) { name.value = ''; trinh.value = ''; }
              name.readOnly = false; trinh.readOnly = false; delete name.dataset.locked;
              status.textContent = 'Chưa có hồ sơ: nhập tên và trình độ tự khai';
              status.className = 'hint';
            }
          }).catch(function () { /* bỏ qua lỗi tra cứu */ });
      }, 350);
    });
  });

  // ---- Chọn & cắt ảnh đại diện (Cropper.js) ----
  $$('[data-avatar-crop]').forEach(function (wrap) {
    var file = $('input[type=file]', wrap);
    var hidden = $('input[name=cropped_avatar_data]', wrap);
    var preview = $('.avatar-preview', wrap);
    var modal = $('.crop-modal', wrap);
    var img = $('.crop-area img', wrap);
    var cropper = null;
    var url = null;
    function close() { modal.classList.remove('open'); if (cropper) { cropper.destroy(); cropper = null; } if (url) { URL.revokeObjectURL(url); url = null; } document.body.style.overflow = ''; }
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { alert('Chỉ nhận ảnh JPG, PNG hoặc WebP.'); file.value = ''; return; }
      if (f.size > 8 * 1024 * 1024) { alert('Ảnh tối đa 8 MB.'); file.value = ''; return; }
      if (typeof window.Cropper !== 'function') { alert('Không tải được công cụ cắt ảnh, vui lòng tải lại trang.'); return; }
      url = URL.createObjectURL(f);
      img.src = url;
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      img.onload = function () {
        cropper = new window.Cropper(img, { aspectRatio: 1, viewMode: 1, dragMode: 'move', autoCropArea: 0.9, background: false, responsive: true });
      };
    });
    $('[data-crop-cancel]', wrap).addEventListener('click', function () { close(); file.value = ''; });
    $('[data-crop-rotate]', wrap).addEventListener('click', function () { if (cropper) cropper.rotate(90); });
    $('[data-crop-apply]', wrap).addEventListener('click', function () {
      if (!cropper) return;
      var canvas = cropper.getCroppedCanvas({ width: 600, height: 600, imageSmoothingQuality: 'high' });
      var data = canvas.toDataURL('image/jpeg', 0.9);
      hidden.value = data;
      preview.innerHTML = '';
      var im = document.createElement('img');
      im.src = data; im.alt = 'Ảnh đại diện đã chọn';
      preview.appendChild(im);
      close();
      file.value = '';
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });
  });

  // ---- Chặn gửi 2 lần ----
  $$('form[data-once]').forEach(function (f) {
    f.addEventListener('submit', function () {
      var b = $('button[type=submit]', f);
      if (b) setTimeout(function () { b.disabled = true; b.textContent = 'Đang gửi…'; }, 0);
    });
  });

  // ---- Tự tải lại nhánh đấu khi dữ liệu đổi ----
  var ver = $('[data-version-url]');
  if (ver) {
    var url = ver.getAttribute('data-version-url');
    var cur = Number(ver.getAttribute('data-version')) || 0;
    var every = ver.hasAttribute('data-has-live') ? 15000 : 60000;
    setInterval(function () {
      if (document.hidden) return;
      fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.v && d.v !== cur) {
          var y = window.scrollY;
          var sx = ($('.bracket-scroll') || {}).scrollLeft || 0;
          try { sessionStorage.setItem('restore', JSON.stringify({ y: y, x: sx, p: location.pathname + location.search })); } catch (e) { /* bỏ qua */ }
          location.reload();
        }
      }).catch(function () { /* thử lại lần sau */ });
    }, every);
  }
  try {
    var rs = JSON.parse(sessionStorage.getItem('restore') || 'null');
    if (rs && rs.p === location.pathname + location.search) {
      sessionStorage.removeItem('restore');
      window.scrollTo(0, rs.y);
      var bs = $('.bracket-scroll'); if (bs) bs.scrollLeft = rs.x;
    }
  } catch (e) { /* bỏ qua */ }

  // ---- Tỉ số trực tiếp cạnh trình phát ----
  var live = $('[data-score-url]');
  if (live) {
    var sUrl = live.getAttribute('data-score-url');
    var tick = function () {
      if (document.hidden) return;
      fetch(sUrl, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d.ok) return;
        var m = d.match;
        var box = $('[data-score-box]', live);
        var empty = $('[data-score-empty]', live);
        if (!m) { if (box) box.hidden = true; if (empty) empty.hidden = false; return; }
        if (box) box.hidden = false; if (empty) empty.hidden = true;
        $$('[data-f]', live).forEach(function (el) {
          var k = el.getAttribute('data-f');
          var v = k === 'title' ? [m.division, m.round, m.code].filter(Boolean).join(' · ') : m[k];
          if (v !== undefined && String(el.textContent) !== String(v)) el.textContent = v;
        });
      }).catch(function () { /* thử lại */ });
    };
    setInterval(tick, 5000);
  }

  // ---- Sao chép ----
  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = document.getElementById(btn.getAttribute('data-copy'));
      var text = target ? (target.value || target.textContent) : '';
      if (!text) return;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
        var o = btn.textContent; btn.textContent = 'Đã chép'; setTimeout(function () { btn.textContent = o; }, 1500);
      }).catch(function () { if (target && target.select) target.select(); });
    });
  });

  // ---- Menu "Xem với vai trò" (dev): đóng khi bấm ra ngoài hoặc nhấn Esc ----
  $$('[data-role-switch]').forEach(function (box) {
    document.addEventListener('click', function (e) { if (box.open && !box.contains(e.target)) box.open = false; });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && box.open) { box.open = false; var s = box.querySelector('summary'); if (s) s.focus(); }
    });
  });

  // ---- Menu "Xem với vai trò" (dev): đổi vai trò qua fetch rồi quay lại trang đích ----
  // (chuyển từ script inline trong partials/role-switcher.ejs để tuân thủ CSP)
  if ($('.rm-form') && !window._roleSwitcherBound) {
    window._roleSwitcherBound = true;
    document.addEventListener('submit', function (e) {
      var form = e.target.closest ? e.target.closest('.rm-form') : null;
      if (!form) return;
      e.preventDefault();
      var nextInput = form.querySelector('input[name="next"]');
      var next = (nextInput && nextInput.value) || window.location.pathname;
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      var params = new URLSearchParams();
      new FormData(form).forEach(function (v, k) { params.append(k, v); });
      var go = function () { window.location.href = next; };
      fetch(form.action, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      }).then(go, go);
    });
  }

  // ---- Banner giải lỗi/mất file (vd. ảnh upload cũ không còn): đổi sang ảnh dự phòng, hết dự phòng thì gỡ ảnh ----
  // <img data-fallback="/đường/dẫn">: thử ảnh dự phòng; data-fallback="" → gỡ ảnh, khung cha nhận class .img-missing
  function bannerFailed(img) {
    var fb = img.getAttribute('data-fallback');
    if (fb && img.getAttribute('src') !== fb) { img.removeAttribute('srcset'); img.setAttribute('src', fb); return; }
    img.removeAttribute('data-fallback');
    if (img.parentNode) img.parentNode.classList.add('img-missing');
    img.remove();
  }
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.hasAttribute('data-fallback')) bannerFailed(t);
  }, true);
  // Ảnh có thể đã lỗi trước khi app.js chạy (script nạp cuối trang)
  $$('img[data-fallback]').forEach(function (img) {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) bannerFailed(img);
  });

  // ---- Trang chi tiết giải: chuyển thẻ vinh danh ----
  (function () {
    var btns = $$('.podium-nav-btn');
    var cards = $$('[data-podium-card]');
    if (!btns.length || !cards.length) return;
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var target = btn.getAttribute('data-podium-target');
        cards.forEach(function (c) {
          c.style.display = (target === 'all' || c.id === target) ? '' : 'none';
        });
      });
    });
  })();

  // ---- Nhánh đấu: Điều hướng vòng & Thu nhỏ xem toàn cảnh ----
  (function () {
    var nav = $('#bracketNav');
    var scroll = $('#bracketScroll');
    var wrapper = $('#bracketWrapper');
    var btnPan = $('#btnTogglePanoramic');
    if (!nav || !scroll) return;

    var buttons = $$('.rnd-nav-btn', nav);
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var targetId = btn.getAttribute('data-target');
        if (targetId === 'all') {
          scroll.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          var el = document.getElementById(targetId);
          if (el) {
            var offset = el.offsetLeft - scroll.offsetLeft - 16;
            scroll.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
          }
        }
      });
    });

    if (btnPan && wrapper) {
      btnPan.addEventListener('click', function () {
        var isPan = wrapper.classList.toggle('bracket-panoramic');
        btnPan.classList.toggle('active', isPan);
        var label = $('span', btnPan);
        if (label) label.textContent = isPan ? 'Phóng to' : 'Thu nhỏ';
      });
    }
  })();

  // ---- Đăng ký qua link ngắn: ô chọn trình chỉ hiện các mức trong khoảng của nội dung đang chọn ----
  $$('[data-level-form]').forEach(function (form) {
    var selects = $$('[data-level-select]', form);
    if (!selects.length) return;
    var levels = $$('option', selects[0]).map(function (o) { return { v: o.value, t: o.textContent }; });
    function apply() {
      var picked = $('input[name=division_id]:checked', form);
      var min = (picked && parseInt(picked.getAttribute('data-min'), 10)) || 0;
      var max = (picked && parseInt(picked.getAttribute('data-max'), 10)) || Infinity;
      selects.forEach(function (sel) {
        var cur = sel.value;
        sel.innerHTML = '';
        levels.forEach(function (o) {
          var v = parseInt(o.v, 10);
          if (o.v && (v < min || v > max)) return;
          var opt = document.createElement('option');
          opt.value = o.v; opt.textContent = o.t;
          if (o.v === cur) opt.selected = true;
          sel.appendChild(opt);
        });
        if (sel.value !== cur) sel.value = '';
      });
    }
    $$('input[name=division_id]', form).forEach(function (r) { r.addEventListener('change', apply); });
    apply();
  });
})();
