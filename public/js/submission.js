/* Trang /cham-trinh: đổi gợi ý điểm tối thiểu theo giới tính đang chọn
   (file tĩnh để tuân thủ CSP, không dùng script inline) */
(function () {
  'use strict';
  var hint = document.querySelector('[data-floor-hint]');
  if (!hint) return;
  var radios = document.querySelectorAll('input[name="gender"]');

  function update() {
    var female = false;
    Array.prototype.forEach.call(radios, function (r) { if (r.checked && r.value === 'F') female = true; });
    var floor = hint.getAttribute(female ? 'data-floor-f' : 'data-floor-m');
    hint.textContent = 'Tối thiểu ' + floor + ' cho VĐV ' + (female ? 'Nữ' : 'Nam');
  }

  Array.prototype.forEach.call(radios, function (r) { r.addEventListener('change', update); });
})();
