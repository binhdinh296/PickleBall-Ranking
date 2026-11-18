/* Thanh điều hướng nội dung: chọn nội dung khác trong ô chọn → chuyển ngay sang đúng tab đó */
(function () {
  'use strict';
  var sel = document.querySelector('[data-dn-switch]');
  if (!sel) return;
  sel.addEventListener('change', function () { if (sel.value) location.href = sel.value; });
})();
