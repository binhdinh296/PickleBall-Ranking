/* Tooltip nổi cho [data-hover-tip] (nội dung trong <template> con): rê chuột / focus bàn phím / chạm (mobile) để xem.
   Vẽ ở <body> với position: fixed nên không bị cắt bởi vùng cuộn của bảng. */
(function () {
  'use strict';
  var tip = null;
  var owner = null;

  function hide() {
    if (tip) tip.hidden = true;
    owner = null;
  }

  function show(el) {
    var tpl = el.querySelector('template');
    if (!tpl) return;
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'hover-tip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    owner = el;
    tip.innerHTML = '';
    tip.appendChild(tpl.content.cloneNode(true));
    tip.hidden = false;
    var r = el.getBoundingClientRect();
    var w = tip.offsetWidth;
    var h = tip.offsetHeight;
    var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6); // không đủ chỗ phía dưới → hiện phía trên
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest && e.target.closest('[data-hover-tip]');
    if (el && el !== owner) show(el);
    else if (!el && owner && !(tip && tip.contains(e.target))) hide();
  });
  document.addEventListener('focusin', function (e) {
    var el = e.target.closest && e.target.closest('[data-hover-tip]');
    if (el) show(el); else hide();
  });
  // Màn cảm ứng: chạm để mở / chạm lần nữa hoặc chạm ra ngoài để đóng
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-hover-tip]');
    if (el) { if (owner === el && tip && !tip.hidden && e.pointerType === 'touch') hide(); else show(el); return; }
    if (!(tip && tip.contains(e.target))) hide();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  // Cuộn trang hoặc cuộn trong bảng → ẩn (vị trí cũ không còn đúng)
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
})();
