/* Form nội dung thi đấu: các ô đổi theo "Thể loại" (Đơn 1 VĐV / Đôi 2 VĐV).
   [data-for="pair"] chỉ hiện với Đôi, [data-for="single"] chỉ hiện với Đơn; ô bị ẩn thì tắt để không gửi lên. */
(function () {
  'use strict';
  var sel = document.getElementById('category');
  if (!sel) return;
  var form = sel.form;
  var nameChip = form.querySelector('[data-cat-name]');
  function sync() {
    var opt = sel.options[sel.selectedIndex];
    var type = (opt && opt.getAttribute('data-type')) || 'pair';
    form.querySelectorAll('[data-for]').forEach(function (el) {
      var on = el.getAttribute('data-for') === type;
      el.hidden = !on;
      if (el.matches('.field, details')) el.querySelectorAll('input, select, textarea').forEach(function (i) { i.disabled = !on; });
    });
    if (nameChip && opt) nameChip.textContent = opt.textContent.trim();
  }
  sel.addEventListener('change', sync);
  sync();
})();
