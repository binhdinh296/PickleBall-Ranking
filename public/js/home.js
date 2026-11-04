// Trang chủ: slider "vợt" VĐV nổi bật, số liệu đếm lên, hiệu ứng hiện dần khi cuộn
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  if (!reduce) document.documentElement.classList.add('js-motion');

  // ---- Hiện dần khi cuộn ----
  var revealEls = $$('.reveal');
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  // ---- Màn hẹp: dời khối sân (rally + tỉ số + thẻ số 1) xuống sau mục VĐV nổi bật để VĐV lộ ra ngay khi tải trang ----
  (function () {
    var visual = $('[data-hero-visual]'); var slot = $('[data-court-slot]');
    if (!visual || !slot || !window.matchMedia) return;
    var home = visual.parentNode; var mq = window.matchMedia('(max-width: 959px)');
    function place() {
      var target = mq.matches ? slot : home;
      if (visual.parentNode !== target) target.appendChild(visual);
      document.documentElement.classList.toggle('court-moved', mq.matches);
    }
    place();
    if (mq.addEventListener) mq.addEventListener('change', place); else if (mq.addListener) mq.addListener(place);
  })();

  // ---- Pha dink rally ở hero: dừng khi giảm chuyển động, tạm dừng khi khuất màn hình cho nhẹ máy ----
  $$('[data-rally]').forEach(function (svg) {
    if (typeof svg.pauseAnimations !== 'function') return;
    if (reduce) { svg.pauseAnimations(); if (svg.setCurrentTime) svg.setCurrentTime(0.7); return; }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { if (en[0].isIntersecting) svg.unpauseAnimations(); else svg.pauseAnimations(); }).observe(svg);
    }
  });

  // ---- Slider vợt: chỉ chuyển khi người dùng bấm lùi/tới, chấm, phím mũi tên hoặc vuốt (không tự trượt) ----
  var root = $('[data-paddles]');
  if (!root) return;
  var vp = $('[data-viewport]', root);
  var slots = $$('[data-slot]', root);
  var paddles = $$('[data-paddle]', root);
  var dots = $$('[data-dot]', root);

  function step() { return slots.length > 1 ? slots[1].offsetLeft - slots[0].offsetLeft : vp.clientWidth; }
  function atEnd() { return vp.scrollLeft + vp.clientWidth >= vp.scrollWidth - 4; }
  function current() { return Math.max(0, Math.min(slots.length - 1, Math.round(vp.scrollLeft / step()))); }
  function scrollToIndex(i) { vp.scrollTo({ left: Math.max(0, slots[i].offsetLeft - slots[0].offsetLeft), behavior: reduce ? 'auto' : 'smooth' }); }

  function next() {
    if (atEnd()) vp.scrollTo({ left: 0, behavior: reduce ? 'auto' : 'smooth' });
    else vp.scrollBy({ left: step(), behavior: reduce ? 'auto' : 'smooth' });
  }
  function prev() {
    if (vp.scrollLeft <= 4) vp.scrollTo({ left: vp.scrollWidth, behavior: reduce ? 'auto' : 'smooth' });
    else vp.scrollBy({ left: -step(), behavior: reduce ? 'auto' : 'smooth' });
  }

  // Chấm bóng theo thẻ đầu tiên đang hiện
  var raf = 0;
  vp.addEventListener('scroll', function () {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      var c = current();
      dots.forEach(function (d, k) { d.classList.toggle('is-active', k === c); d.setAttribute('aria-current', k === c ? 'true' : 'false'); });
    });
  }, { passive: true });

  dots.forEach(function (d, k) { d.addEventListener('click', function () { scrollToIndex(k); }); });
  $('[data-next]', root).addEventListener('click', next);
  $('[data-prev]', root).addEventListener('click', prev);

  // Chạm (màn cảm ứng) hoặc Enter/Space để mở thông tin; chỉ mở 1 vợt mỗi lúc
  function closeAll(except) {
    paddles.forEach(function (p) {
      if (p === except) return;
      p.classList.remove('is-open');
      $('.paddle-hit', p).setAttribute('aria-expanded', 'false');
    });
  }
  paddles.forEach(function (p) {
    var hit = $('.paddle-hit', p);
    hit.addEventListener('click', function () {
      var open = !p.classList.contains('is-open');
      closeAll(p);
      p.classList.toggle('is-open', open);
      hit.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { var link = $('.paddle-info a', p); if (link && document.activeElement === hit && !window.matchMedia('(hover: none)').matches) link.focus(); }
    });
  });
  document.addEventListener('click', function (e) { if (!root.contains(e.target)) closeAll(null); });
  root.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll(null);
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  });
})();
