/* Danh sách VĐV (CMS): popup "Chỉnh điểm nhanh" dùng chung cho mọi dòng.
   Mở từ menu Thao tác → điền tên / điểm hiện tại / đường dẫn gửi; nút ±0.025… điền ô cộng/trừ và xem trước điểm mới. */
(function () {
  'use strict';
  var modal = document.getElementById('modal-points');
  if (!modal) return;
  var form = modal.querySelector('[data-mp-form]');
  var mode = form.querySelector('[data-mp-mode]');
  var deltaIn = form.querySelector('[data-mp-delta-input]');
  var pointsIn = form.querySelector('[data-mp-points-input]');
  var preview = form.querySelector('[data-mp-preview]');
  var current = 0;

  function parse(v) { // "2.65" / "2,65" / "2650" → phần nghìn
    var s = String(v || '').trim().replace(',', '.').replace(/^\+/, '');
    if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
    var n = Number(s);
    return Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 1000);
  }
  function show(n) { return (n / 1000).toFixed(3); }
  function update() {
    var target = null;
    if (pointsIn.value.trim()) { mode.value = 'set'; target = parse(pointsIn.value); }
    else if (deltaIn.value.trim()) { mode.value = 'delta'; var d = parse(deltaIn.value); target = d === null ? null : current + d; }
    preview.textContent = target === null || target < 0 ? '—' : show(target);
  }

  document.addEventListener('click', function (e) {
    var open = e.target.closest('[data-points-open]');
    if (open) {
      current = parse(open.getAttribute('data-points')) || 0;
      form.action = '/admin/vdv/' + open.getAttribute('data-id') + '/diem';
      modal.querySelector('[data-mp-name]').textContent = open.getAttribute('data-name');
      modal.querySelector('[data-mp-current]').textContent = show(current);
      deltaIn.value = ''; pointsIn.value = ''; form.querySelector('#mp-note').value = '';
      update();
      setTimeout(function () { deltaIn.focus(); }, 50);
      return;
    }
    var chip = e.target.closest('[data-mp-delta]');
    if (chip && modal.contains(chip)) {
      deltaIn.value = chip.getAttribute('data-mp-delta');
      pointsIn.value = '';
      update();
    }
  });
  deltaIn.addEventListener('input', function () { if (deltaIn.value.trim()) pointsIn.value = ''; update(); });
  pointsIn.addEventListener('input', function () { if (pointsIn.value.trim()) deltaIn.value = ''; update(); });
  form.addEventListener('submit', function (e) {
    if (!deltaIn.value.trim() && !pointsIn.value.trim()) { e.preventDefault(); deltaIn.focus(); }
  });
})();
