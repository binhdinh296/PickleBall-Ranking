// Chạy đồng bộ trong <head> để không nháy màu khi tải trang
(function () {
  var root = document.documentElement;
  root.classList.add('js'); // CSS biết JS đang chạy (vd. khối sân hero được dời xuống dưới trên mobile)
  var saved = null;
  var param = location.search.match(/[?&]theme=(dark|luxe|blue)/);
  if (param) {
    saved = param[1];
    try { localStorage.setItem('theme', saved); } catch (e) {}
  } else {
    try { saved = localStorage.getItem('theme'); } catch (e) { /* trình duyệt chặn bộ nhớ */ }
  }
  // Theme xanh dương ('blue') đã được thay bằng 'luxe' (Đen huyền & Vàng sâm panh): chuyển lựa chọn cũ sang theme mới
  if (saved === 'blue') {
    saved = 'luxe';
    try { localStorage.setItem('theme', saved); } catch (e) {}
  }
  // Bỏ 'light': nếu trước đó người dùng từng lưu 'light', xóa bỏ
  if (saved === 'light') {
    saved = null;
    try { localStorage.removeItem('theme'); } catch (e) {}
  }
  var defaultTheme = root.getAttribute('data-default-theme') || 'dark';
  var theme = saved === 'luxe' || saved === 'dark' ? saved : (defaultTheme === 'luxe' ? 'luxe' : 'dark');
  root.setAttribute('data-theme', theme);

  if (!window._origColors) {
    window._origColors = {
      ball: root.style.getPropertyValue('--ball'),
      court: root.style.getPropertyValue('--court'),
      gold: root.style.getPropertyValue('--gold')
    };
  }
  if (theme === 'luxe') {
    root.style.setProperty('--ball', '#DDB552');
    root.style.setProperty('--court', '#9C8A6B');
    root.style.setProperty('--gold', '#DDB552');
  }
})();
