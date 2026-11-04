(function () {
  'use strict';
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  var postJSON = window.PR && window.PR.postJSON;

  // ---- Menu CMS trên mobile ----
  var navBtn = $('[data-admin-nav]');
  var side = $('.admin-side');
  if (navBtn && side) {
    navBtn.addEventListener('click', function () {
      var open = side.classList.toggle('open');
      navBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    side.addEventListener('click', function (e) { if (e.target === side) navBtn.click(); });
  }

  // ---- Nhập tỉ số tại sân: nút +/− tự lưu ----
  var scorer = $('[data-scorer]');
  if (scorer && postJSON) {
    var url = scorer.getAttribute('data-scorer');
    var state = $('[data-save-state]', scorer);
    var pending = null;
    function save(extra) {
      var body = {
        score_a: $('input[name=score_a]', scorer).value,
        score_b: $('input[name=score_b]', scorer).value,
      };
      var leg = $('select[name=current_leg]', scorer);
      if (leg) body.current_leg = leg.value;
      Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
      state.textContent = 'Đang lưu…';
      state.className = 'hint';
      return postJSON(url, body).then(function (r) {
        if (r.ok) {
          state.textContent = '✓ Đã lưu ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          state.className = 'hint ok';
          if (r.status) {
            $$('[data-status-label]').forEach(function (el) { el.textContent = { scheduled: 'Chưa đấu', live: 'Đang đấu', done: 'Đã xong' }[r.status]; });
            scorer.setAttribute('data-status', r.status);
          }
        } else {
          state.textContent = r.error || 'Lưu thất bại, thử lại.';
          state.className = 'hint err';
        }
      }).catch(function () { state.textContent = 'Mất kết nối, chưa lưu được.'; state.className = 'hint err'; });
    }
    function queue() { clearTimeout(pending); pending = setTimeout(save, 400); }
    $$('[data-step]', scorer).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = $('input[name=' + btn.getAttribute('data-target') + ']', scorer);
        var v = Math.max(0, (parseInt(input.value, 10) || 0) + parseInt(btn.getAttribute('data-step'), 10));
        input.value = v;
        if (navigator.vibrate) navigator.vibrate(15);
        queue();
      });
    });
    $$('input[name=score_a], input[name=score_b], select[name=current_leg]', scorer).forEach(function (el) { el.addEventListener('change', queue); });
    $$('[data-set-status]', scorer).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var st = btn.getAttribute('data-set-status');
        if (st === 'done' && !window.confirm('Kết thúc trận với tỉ số hiện tại?')) return;
        save({ status: st });
      });
    });
  }

  // ---- Bảng giải thưởng: thêm/bớt dòng ----
  var prizes = $('[data-prizes]');
  if (prizes) {
    var tpl = $('template', prizes);
    $('[data-prize-add]', prizes).addEventListener('click', function () {
      $('[data-prize-rows]', prizes).appendChild(tpl.content.cloneNode(true));
    });
    prizes.addEventListener('click', function (e) {
      var b = e.target.closest('[data-prize-remove]');
      if (b) b.closest('.prize-edit').remove();
    });
  }

  // ---- Vinh danh: tìm VĐV để gắn hồ sơ ----
  $$('[data-athlete-search]').forEach(function (wrap) {
    var input = $('input[type=search]', wrap);
    var idField = $('input[type=hidden]', wrap);
    var nameField = document.getElementById(wrap.getAttribute('data-name-field'));
    var list = $('ul', wrap);
    var t = null;
    input.addEventListener('input', function () {
      clearTimeout(t);
      var q = input.value.trim();
      if (q.length < 2) { list.innerHTML = ''; return; }
      t = setTimeout(function () {
        fetch('/admin/api/athletes?q=' + encodeURIComponent(q), { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (rows) {
          list.innerHTML = '';
          rows.forEach(function (row) {
            var li = document.createElement('li');
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'btn btn-sm'; b.textContent = row.label;
            b.addEventListener('click', function () {
              idField.value = row.id;
              if (nameField && !nameField.value) nameField.value = row.label.split(' · ')[0].replace(/ \(.*\)$/, '');
              input.value = row.label;
              list.innerHTML = '';
            });
            li.appendChild(b);
            list.appendChild(li);
          });
        });
      }, 300);
    });
    var clear = $('[data-clear]', wrap);
    if (clear) clear.addEventListener('click', function () { idField.value = ''; input.value = ''; });
  });

  // ---- Xem stream key (chỉ quản trị viên) ----
  var keyBtn = $('[data-stream-key]');
  if (keyBtn && postJSON) {
    keyBtn.addEventListener('click', function () {
      postJSON(keyBtn.getAttribute('data-stream-key'), {}).then(function (r) {
        var out = $('[data-key-out]');
        if (!r.ok) { out.hidden = false; $('#rtmp-key').value = ''; alert(r.error || 'Không lấy được stream key.'); return; }
        $('#rtmp-server').value = r.server || '';
        $('#rtmp-key').value = r.key || '';
        out.hidden = false;
        keyBtn.hidden = true;
      });
    });
  }

  // ---- Đổi chế độ tạo buổi phát ----
  $$('input[name=mode]').forEach(function (r) {
    function sync() {
      var manual = $('input[name=mode][value=manual]');
      $$('[data-mode-manual]').forEach(function (el) { el.hidden = !(manual && manual.checked); });
    }
    r.addEventListener('change', sync);
    sync();
  });
})();
