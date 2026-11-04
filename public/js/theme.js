// Chạy đồng bộ trong <head> để không nháy màu khi tải trang
(function () {
  var root = document.documentElement;
  root.classList.add('js'); // CSS biết JS đang chạy (vd. khối sân hero được dời xuống dưới trên mobile)
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* trình duyệt chặn bộ nhớ */ }
  var theme = saved === 'light' || saved === 'dark' ? saved : root.getAttribute('data-default-theme') || 'dark';
  root.setAttribute('data-theme', theme);
})();
