/* Sơ đồ nhánh đấu kiểu pickna (file tĩnh để tuân thủ CSP).
   Màn rộng hoặc khi "Xem toàn màn hình": cột ngang; mỗi thẻ được căn giữa theo các trận nguồn nằm ở cột liền trước
   (vd. PO1 nằm giữa T1 và T2) và vẽ đường nối gấp khúc từ trận nguồn sang. Màn hẹp: để CSS xếp dọc. */
(function () {
  'use strict';
  var shell = document.querySelector('[data-bk-shell]');
  if (!shell) return;
  var board = shell.querySelector('[data-bk-board]');
  var svg = shell.querySelector('[data-bk-lines]');
  var btn = shell.querySelector('[data-bk-full]');
  var cols = board ? Array.prototype.slice.call(board.querySelectorAll('[data-bk-col]')) : [];
  var zones = Array.prototype.slice.call(shell.querySelectorAll('.bk-zone'));
  var GAP = 12;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function bodies() { return cols.map(function (c) { return c.querySelector('[data-bk-body]'); }); }
  function cards(body) { return Array.prototype.slice.call(body.children); }
  function sources(card) { return (card.getAttribute('data-src') || '').split(',').filter(Boolean); }
  function isWide() { return shell.classList.contains('is-full') || window.innerWidth >= 760; }

  function reset() {
    if (board) board.classList.remove('is-wide');
    shell.classList.remove('bk-wide');
    bodies().forEach(function (b) { b.style.height = ''; cards(b).forEach(function (c) { c.style.top = ''; }); });
    if (svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }
  }

  // Co thẻ (190–224px) và khoảng cách cột (28–46px) để mọi cột vừa khung; không vừa thì mới cuộn ngang
  function fit() {
    var n = Math.max(cols.length, zones.length);
    if (!n) return;
    var avail = shell.querySelector('[data-bk-scroll]').clientWidth - 14;
    var cw = Math.max(190, Math.min(224, Math.floor((avail - (n - 1) * 28) / n)));
    var gap = n > 1 ? Math.max(28, Math.min(46, Math.floor((avail - n * cw) / (n - 1)))) : 46;
    shell.style.setProperty('--bk-card-w', cw + 'px');
    shell.style.setProperty('--bk-gap', gap + 'px');
  }

  function layout() {
    reset();
    if (!isWide() || (!cols.length && !zones.length)) return;
    if (board) board.classList.add('is-wide');
    shell.classList.add('bk-wide');
    fit();
    if (!board || !cols.length || !svg) return;
    var pos = {}; // id trận → { col, top, h, el }
    bodies().forEach(function (body, ci) {
      var y = 0;
      cards(body).forEach(function (card) {
        var h = card.offsetHeight;
        var prev = sources(card).map(function (id) { return pos[id]; }).filter(function (p) { return p && p.col === ci - 1; });
        var top = y;
        if (prev.length) {
          var mid = prev.reduce(function (s, p) { return s + p.top + p.h / 2; }, 0) / prev.length;
          top = Math.max(y, Math.round(mid - h / 2));
        }
        card.style.top = top + 'px';
        pos[card.getAttribute('data-match-id')] = { col: ci, top: top, h: h, el: card };
        y = top + h + GAP;
      });
      body.style.height = Math.max(0, y - GAP) + 'px';
    });

    // Đường nối: chỉ giữa hai cột liền nhau (trận lấy nguồn xa hơn thì ghi "Thắng T1" trong thẻ là đủ)
    var box = board.getBoundingClientRect();
    svg.setAttribute('width', board.scrollWidth);
    svg.setAttribute('height', board.scrollHeight);
    var d = '';
    bodies().forEach(function (body, ci) {
      if (!ci) return;
      cards(body).forEach(function (card) {
        var b = card.getBoundingClientRect();
        sources(card).forEach(function (id) {
          var p = pos[id];
          if (!p || p.col !== ci - 1) return;
          var a = p.el.getBoundingClientRect();
          var x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top;
          var x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top;
          var xm = Math.round(x1 + (x2 - x1) / 2);
          d += 'M' + x1 + ' ' + y1 + 'H' + xm + 'V' + y2 + 'H' + x2;
        });
      });
    });
    if (d) {
      var path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    }
  }

  function setFull(on) {
    shell.classList.toggle('is-full', on);
    document.body.classList.toggle('bk-lock', on);
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      btn.querySelector('span').textContent = on ? 'Thoát toàn màn hình' : 'Xem toàn màn hình';
    }
    layout();
    if (on) shell.scrollTop = 0;
  }
  if (btn) btn.addEventListener('click', function () { setFull(!shell.classList.contains('is-full')); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && shell.classList.contains('is-full')) setFull(false); });

  var t = null;
  window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(layout, 120); });
  layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
})();
