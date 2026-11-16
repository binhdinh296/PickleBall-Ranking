// Chạy đồng bộ trong <head> để không nháy màu khi tải trang
(function () {
  var root = document.documentElement;
  root.classList.add('js'); // CSS biết JS đang chạy (vd. khối sân hero được dời xuống dưới trên mobile)
  var saved = null;
  var param = location.search.match(/[?&]theme=(dark|blue)/);
  if (param) {
    saved = param[1];
    try { localStorage.setItem('theme', saved); } catch (e) {}
  } else {
    try { saved = localStorage.getItem('theme'); } catch (e) { /* trình duyệt chặn bộ nhớ */ }
  }
  // Bỏ 'light': nếu trước đó người dùng từng lưu 'light', xóa bỏ
  if (saved === 'light') {
    saved = null;
    try { localStorage.removeItem('theme'); } catch (e) {}
  }
  var defaultTheme = root.getAttribute('data-default-theme') || 'dark';
  var theme = saved === 'blue' || saved === 'dark' ? saved : (defaultTheme === 'blue' ? 'blue' : 'dark');
  root.setAttribute('data-theme', theme);

  if (!window._origColors) {
    window._origColors = {
      ball: root.style.getPropertyValue('--ball'),
      court: root.style.getPropertyValue('--court'),
      gold: root.style.getPropertyValue('--gold')
    };
  }
  if (theme === 'blue') {
    root.style.setProperty('--ball', '#3B82F6');
    root.style.setProperty('--court', '#2563EB');
    root.style.setProperty('--gold', '#60A5FA');
  }
})();
