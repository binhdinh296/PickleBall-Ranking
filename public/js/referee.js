/* Trang trọng tài: "Bắt đầu" trận ngay trên danh sách rồi vào màn nhập tỉ số */
(function () {
  'use strict';
  if (!window.PR) return;
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rf-start]');
    if (!b) return;
    var id = b.getAttribute('data-rf-start');
    b.disabled = true;
    b.textContent = 'Đang mở…';
    window.PR.postJSON('/admin/tran/' + id, { status: 'live' }).then(function (r) {
      if (r && r.ok) { location.href = '/admin/tran/' + id; return; }
      b.disabled = false;
      b.textContent = 'Bắt đầu';
      alert((r && r.error) || 'Không bắt đầu được trận, thử lại.');
    });
  });
})();
