/* Cấu hình bốc thăm (CMS › Nhánh đấu)
   • Nút [data-bs-open="tab-…"] (trên thanh tóm tắt / cạnh sơ đồ): mở khung cấu hình, chuyển tới đúng bước, cuộn tới
   • Chọn 1 bảng thì ẩn ô "Suất vào loại trực tiếp" (vòng tròn tất cả, không có nhánh sau) */
(function () {
  'use strict';
  var setup = document.getElementById('bs-setup');
  if (setup) {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-bs-open]');
      if (!btn) return;
      e.preventDefault(); // nút nằm trong <summary>: không để trình duyệt tự đóng/mở khung
      e.stopPropagation();
      setup.open = true;
      var tab = setup.querySelector('.admin-tabs [data-tab-target="' + btn.getAttribute('data-bs-open') + '"]');
      if (tab) tab.click();
      setup.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  var sel = document.querySelector('[data-bs-groups]');
  var adv = document.querySelector('[data-bs-advance]');
  if (sel && adv) {
    var sync = function () { adv.hidden = sel.value === '1'; };
    sel.addEventListener('change', sync);
    sync();
  }
})();
