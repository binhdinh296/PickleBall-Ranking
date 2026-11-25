// Chạy đồng bộ trong <head> để không nháy màu khi tải trang
(function () {
  var root = document.documentElement;
  // 'dark' = Midnight; các theme còn lại thuộc nhóm theme phẳng [data-flat]
  var THEMES = ['dark', 'luxe', 'sky', 'banana', 'rally', 'matchday'];
  var saved = null;
  var param = location.search.match(/[?&]theme=(dark|luxe|sky|banana|rally|matchday|blue)\b/);
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
  // Giá trị lạ (vd. 'light' cũ): bỏ
  if (saved && THEMES.indexOf(saved) === -1) {
    saved = null;
    try { localStorage.removeItem('theme'); } catch (e) {}
  }
  var defaultTheme = root.getAttribute('data-default-theme');
  var theme = saved || (THEMES.indexOf(defaultTheme) > -1 ? defaultTheme : 'dark');
  root.setAttribute('data-theme', theme);
  // Màu thương hiệu của theme phẳng nằm trong CSS (!important) nên không cần ghi đè màu CMS trên thẻ html
  if (theme === 'dark') root.removeAttribute('data-flat');
  else root.setAttribute('data-flat', '');
})();
