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
        if (st === 'done' && !window.confirm('Kết thúc trận với tỉ số hiện tại? Sau khi kết thúc, trọng tài không sửa được tỉ số nữa.')) return;
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

  // ---- Tạo giải: thêm/bớt nội dung thi đấu (mỗi dòng có chỉ số riêng để gắn đúng ảnh tải lên) ----
  var divs = $('[data-divs]');
  if (divs) {
    var divTpl = $('template', divs);
    var nextIdx = parseInt(divs.getAttribute('data-next'), 10) || 0;
    $('[data-div-add]', divs).addEventListener('click', function () {
      var holder = document.createElement('div');
      holder.innerHTML = divTpl.innerHTML.replace(/__i__/g, String(nextIdx++));
      var row = holder.firstElementChild;
      $('[data-div-rows]', divs).appendChild(row);
      var first = $('input[name=div_name]', row);
      if (first) first.focus();
    });
    divs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-div-remove]');
      if (b) b.closest('[data-div-row]').remove();
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

// ---- Bảng quản trị (.atable): mở dòng chi tiết, bấm cả dòng để mở bản ghi, chọn nhiều ----
document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-row-toggle]');
  if (t) {
    var d = document.getElementById(t.getAttribute('aria-controls'));
    if (!d) return;
    var open = d.hidden;
    d.hidden = !open;
    t.setAttribute('aria-expanded', String(open));
    return;
  }
  var tr = e.target.closest('tr[data-href]');
  if (tr && !e.target.closest('a, button, input, select, textarea, label, form, summary')) {
    if (e.metaKey || e.ctrlKey) window.open(tr.getAttribute('data-href'), '_blank');
    else location.href = tr.getAttribute('data-href');
  }
});

(function () {
  var form = document.querySelector('[data-bulk-form]');
  if (!form) return;
  var items = Array.prototype.slice.call(form.querySelectorAll('[data-check-item]'));
  var all = form.querySelector('[data-check-all]');
  var count = form.querySelector('[data-bulk-count]');
  var actions = form.querySelectorAll('[data-bulk-action]');
  // Nút có data-bulk-skip="<trạng thái>": chỉ tính các dòng đã chọn CHƯA ở trạng thái đó (vd. "Duyệt" bỏ qua dòng đã duyệt);
  // không còn dòng nào cần đổi thì khoá nút để khỏi bấm mà không thấy gì thay đổi
  function eligible(b) {
    var skip = b.getAttribute('data-bulk-skip');
    return items.filter(function (c) { return c.checked && (!skip || c.getAttribute('data-status') !== skip); }).length;
  }
  function sync() {
    var n = items.filter(function (c) { return c.checked; }).length;
    if (count) count.textContent = n;
    actions.forEach(function (b) {
      var k = eligible(b);
      b.disabled = k === 0;
      b.title = n && !k ? 'Các mục đã chọn đều đã ở trạng thái này' : '';
    });
    if (all) { all.checked = n > 0 && n === items.length; all.indeterminate = n > 0 && n < items.length; }
  }
  // Trình duyệt có thể giữ lại ô đã tích khi tải lại / quay lại trang → luôn bỏ chọn khi trang hiện ra
  window.addEventListener('pageshow', function () { items.forEach(function (c) { c.checked = false; }); if (all) all.checked = false; sync(); });
  if (all) all.addEventListener('change', function () { items.forEach(function (c) { c.checked = all.checked; }); sync(); });
  items.forEach(function (c) { c.addEventListener('change', sync); });
  sync();

  form.querySelectorAll('.at-pts').forEach(function (i) {
    i.addEventListener('input', function () { i.classList.toggle('changed', i.value.trim() !== i.getAttribute('data-self')); });
  });

  form.addEventListener('submit', function (e) {
    var b = e.submitter;
    if (!b) return;
    var n = b.hasAttribute('data-bulk-skip') ? eligible(b) : (count ? count.textContent : '');
    var msg = b.getAttribute('data-confirm-one') || (b.hasAttribute('data-bulk-action') ? (b.getAttribute('data-bulk-confirm') || '').replace('{n}', n) : '');
    if (msg && !window.confirm(msg)) { e.preventDefault(); return; }
    // Chặn bấm hai lần trong lúc gửi
    setTimeout(function () { form.querySelectorAll('button[type="submit"]').forEach(function (x) { x.disabled = true; }); }, 0);
  });
})();

// Helper định vị thông minh cho Action Dropdown menu (không bao giờ bị che khuất)
function resetDropdownPosition(details) {
  var pop = details.querySelector('.dropdown-pop');
  if (pop) {
    pop.style.position = '';
    pop.style.top = '';
    pop.style.bottom = '';
    pop.style.left = '';
    pop.style.right = '';
    pop.style.zIndex = '';
  }
  details.classList.remove('dropup');
}

function positionActionDropdown(details) {
  var summary = details.querySelector('summary');
  var pop = details.querySelector('.dropdown-pop');
  if (!summary || !pop) return;

  var rect = summary.getBoundingClientRect();
  var popHeight = pop.offsetHeight || 160;
  var popWidth = pop.offsetWidth || 185;

  var spaceBelow = window.innerHeight - rect.bottom;
  var spaceAbove = rect.top;

  // Quyết định bung lên (dropup) hay bung xuống:
  // CHỈ BUNG LÊN khi:
  // 1. Phía dưới KHÔNG đủ chỗ (< popHeight + 12) VÀ
  // 2. Phía trên có NHIỀU CHỖ HƠN phía dưới (spaceAbove > spaceBelow) VÀ
  // 3. Phía trên ĐỦ CHỖ chứa menu (spaceAbove >= popHeight)
  var shouldDropup = (spaceBelow < popHeight + 12) && (spaceAbove > spaceBelow) && (spaceAbove >= popHeight);

  if (shouldDropup) {
    details.classList.add('dropup');
  } else {
    details.classList.remove('dropup');
  }

  // Đặt fixed position để KHÔNG BAO GIỜ bị overflow của .table-wrap hay thead cắt xén!
  pop.style.position = 'fixed';
  pop.style.zIndex = '9999';

  if (shouldDropup) {
    pop.style.top = 'auto';
    pop.style.bottom = Math.round(window.innerHeight - rect.top + 4) + 'px';
  } else {
    pop.style.bottom = 'auto';
    pop.style.top = Math.round(rect.bottom + 4) + 'px';
  }

  var rightCoord = Math.round(window.innerWidth - rect.right);
  if (rect.right - popWidth < 12) {
    pop.style.right = 'auto';
    pop.style.left = Math.max(12, Math.round(rect.left)) + 'px';
  } else {
    pop.style.left = 'auto';
    pop.style.right = Math.max(12, rightCoord) + 'px';
  }
}

// Bắt sự kiện cuộn trang hoặc resize để đóng Action Dropdown đang mở
window.addEventListener('scroll', function () {
  var openDropdowns = document.querySelectorAll('details.action-dropdown[open]');
  openDropdowns.forEach(function (d) {
    d.removeAttribute('open');
    resetDropdownPosition(d);
  });
}, true);

window.addEventListener('resize', function () {
  var openDropdowns = document.querySelectorAll('details.action-dropdown[open]');
  openDropdowns.forEach(function (d) {
    d.removeAttribute('open');
    resetDropdownPosition(d);
  });
});

// Lắng nghe sự kiện toggle native của details
document.addEventListener('toggle', function (e) {
  if (e.target && e.target.matches && e.target.matches('details.action-dropdown')) {
    if (e.target.open) {
      document.querySelectorAll('details.action-dropdown[open]').forEach(function (other) {
        if (other !== e.target) {
          other.removeAttribute('open');
          resetDropdownPosition(other);
        }
      });
      positionActionDropdown(e.target);
    } else {
      resetDropdownPosition(e.target);
    }
  }
}, true);

// ---- Modal Popup và Action Dropdown tuân thủ CSP ----
document.addEventListener('click', function (e) {
  // 1. Mở Modal Popup qua [data-modal-target]
  var modalOpenBtn = e.target.closest('[data-modal-target]');
  if (modalOpenBtn) {
    var modalId = modalOpenBtn.getAttribute('data-modal-target');
    var modalEl = document.getElementById(modalId);
    if (modalEl) {
      modalEl.classList.add('open');
      document.body.style.overflow = 'hidden';
      var parentDetails = modalOpenBtn.closest('details.action-dropdown');
      if (parentDetails) {
        parentDetails.removeAttribute('open');
        resetDropdownPosition(parentDetails);
      }
    }
    return;
  }

  // 2. Đóng Modal Popup qua [data-modal-close] hoặc click ra vùng nền backdrop
  var modalCloseBtn = e.target.closest('[data-modal-close]');
  if (modalCloseBtn) {
    var targetModal = modalCloseBtn.closest('.admin-modal');
    if (targetModal) {
      targetModal.classList.remove('open');
      document.body.style.overflow = '';
    }
    return;
  }
  if (e.target.classList && e.target.classList.contains('admin-modal')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
    return;
  }

  // 3. Xử lý [data-toggle-target]
  var toggleBtn = e.target.closest('[data-toggle-target]');
  if (toggleBtn) {
    var targetId = toggleBtn.getAttribute('data-toggle-target');
    var targetEl = document.getElementById(targetId);
    if (targetEl) {
      if (targetEl.tagName === 'DETAILS') {
        targetEl.open = !targetEl.open;
        if (targetEl.open) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        targetEl.hidden = !targetEl.hidden;
        if (!targetEl.hidden) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    return;
  }

  // 3b. Kiểm tra hướng mở và định vị Action Dropdown (không bao giờ bị che khuất)
  var dropdownSummary = e.target.closest('details.action-dropdown > summary');
  if (dropdownSummary) {
    var details = dropdownSummary.parentElement;
    
    // Đóng các dropdown khác đang mở
    document.querySelectorAll('details.action-dropdown[open]').forEach(function (other) {
      if (other !== details) {
        other.removeAttribute('open');
        resetDropdownPosition(other);
      }
    });

    requestAnimationFrame(function () {
      if (details.open) {
        positionActionDropdown(details);
      } else {
        resetDropdownPosition(details);
      }
    });
  }

  // 4. Click item bên trong Action Dropdown: tự đóng dropdown
  var item = e.target.closest('.dropdown-pop button, .dropdown-pop a');
  if (item) {
    var detailsEl = item.closest('details.action-dropdown');
    if (detailsEl) {
      detailsEl.removeAttribute('open');
      resetDropdownPosition(detailsEl);
    }
  }

  // 5. Đóng Action Dropdown khi click ra ngoài
  var openDropdowns = document.querySelectorAll('details.action-dropdown[open]');
  openDropdowns.forEach(function (d) {
    if (!d.contains(e.target)) {
      d.removeAttribute('open');
      resetDropdownPosition(d);
    }
  });

  // 6. Chuyển đổi Tabs trong form quản trị (.admin-tabs)
  var tabBtn = e.target.closest('[data-tab-target]');
  if (tabBtn) {
    var tabList = tabBtn.closest('.admin-tabs');
    var targetId = tabBtn.getAttribute('data-tab-target');
    if (!tabList && targetId) {
      var externalNavTab = document.querySelector('.admin-tabs [data-tab-target="' + targetId + '"]');
      if (externalNavTab) {
        externalNavTab.click();
        return;
      }
    }
    if (tabList && targetId) {
      var allTabs = tabList.querySelectorAll('[data-tab-target]');
      allTabs.forEach(function (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tabBtn.classList.add('active');
      tabBtn.setAttribute('aria-selected', 'true');

      var container = tabList.closest('form') || tabList.parentElement;
      var panes = container.querySelectorAll('.admin-tab-pane');
      panes.forEach(function (p) {
        if (p.id === targetId) {
          p.hidden = false;
        } else {
          p.hidden = true;
        }
      });
    }
    return;
  }

  // 7. Multi-Step Form Wizard (Next / Prev / Jump)
  var nextBtn = e.target.closest('[data-step-next]');
  var prevBtn = e.target.closest('[data-step-prev]');
  var stepBtn = e.target.closest('[data-step-target]');

  if (nextBtn) {
    var wizard = nextBtn.closest('[data-wizard]');
    if (!wizard) return;
    var currentPane = wizard.querySelector('.wizard-pane:not([hidden])');
    if (!currentPane) return;
    
    // Validate các input trong pane hiện tại trước khi chuyển bước
    var inputs = currentPane.querySelectorAll('input, select, textarea');
    for (var i = 0; i < inputs.length; i++) {
      if (!inputs[i].checkValidity()) {
        inputs[i].reportValidity();
        return;
      }
    }

    var currentStep = parseInt(currentPane.getAttribute('data-step'), 10) || 1;
    var nextStep = currentStep + 1;
    var nextPane = wizard.querySelector('.wizard-pane[data-step="' + nextStep + '"]');
    if (nextPane) {
      goToWizardStep(wizard, nextStep);
    }
    return;
  }

  if (prevBtn) {
    var wizard = prevBtn.closest('[data-wizard]');
    if (!wizard) return;
    var currentPane = wizard.querySelector('.wizard-pane:not([hidden])');
    if (!currentPane) return;
    var currentStep = parseInt(currentPane.getAttribute('data-step'), 10) || 1;
    var prevStep = Math.max(1, currentStep - 1);
    goToWizardStep(wizard, prevStep);
    return;
  }

  if (stepBtn) {
    var wizard = stepBtn.closest('[data-wizard]');
    if (!wizard) return;
    var targetStep = parseInt(stepBtn.getAttribute('data-step-target'), 10);
    if (!targetStep) return;

    var currentPane = wizard.querySelector('.wizard-pane:not([hidden])');
    var currentStep = currentPane ? (parseInt(currentPane.getAttribute('data-step'), 10) || 1) : 1;
    if (targetStep > currentStep) {
      var inputs = currentPane.querySelectorAll('input, select, textarea');
      for (var j = 0; j < inputs.length; j++) {
        if (!inputs[j].checkValidity()) {
          inputs[j].reportValidity();
          return;
        }
      }
    }
    goToWizardStep(wizard, targetStep);
    return;
  }
});

function goToWizardStep(wizard, stepNum) {
  var panes = wizard.querySelectorAll('.wizard-pane');
  var steps = wizard.querySelectorAll('.wizard-step');
  
  panes.forEach(function (pane) {
    var s = parseInt(pane.getAttribute('data-step'), 10);
    if (s === stepNum) {
      pane.hidden = false;
      pane.classList.add('active');
    } else {
      pane.hidden = true;
      pane.classList.remove('active');
    }
  });

  steps.forEach(function (btn) {
    var s = parseInt(btn.getAttribute('data-step-target'), 10);
    if (s === stepNum) {
      btn.classList.add('active');
      btn.classList.remove('completed');
    } else if (s < stepNum) {
      btn.classList.remove('active');
      btn.classList.add('completed');
    } else {
      btn.classList.remove('active');
      btn.classList.remove('completed');
    }
  });

  var header = wizard.querySelector('.wizard-header');
  if (header) header.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---- Xử lý change event: auto-submit và bracket mode switcher ----
document.addEventListener('change', function (e) {
  // 1. Tự động submit form khi chọn dropdown có [data-auto-submit]
  if (e.target && e.target.matches('select[data-auto-submit]')) {
    if (e.target.form) e.target.form.submit();
  }

  // 2. Chuyển đổi giữa Option 1 (Knockout) và Option 2 (Chia bảng)
  if (e.target && e.target.matches('input[name="bracket_mode"][data-bracket-mode]')) {
    var mode = e.target.getAttribute('data-bracket-mode');
    var optKo = document.getElementById('opt-ko');
    var optGroups = document.getElementById('opt-groups');
    if (optKo && optGroups) {
      if (mode === 'groups_knockout') {
        optKo.style.display = 'none';
        optGroups.style.display = 'block';
      } else {
        optKo.style.display = 'block';
        optGroups.style.display = 'none';
      }
    }
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    // Đóng Modal Popup đang mở
    var openModal = document.querySelector('.admin-modal.open');
    if (openModal) {
      openModal.classList.remove('open');
      document.body.style.overflow = '';
    }
    // Đóng Action Dropdowns
    document.querySelectorAll('details.action-dropdown[open]').forEach(function (d) {
      d.removeAttribute('open');
    });
  }
});
