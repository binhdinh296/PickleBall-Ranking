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

  // ---- Slider vợt: tự lướt từng TRANG (cả nhóm vợt đang hiện) mỗi 4 giây, hết thì quay về đầu ----
  // Tạm dừng khi rê chuột / focus / chạm / mở thông tin / khuất màn hình / tab ẩn / bấm nút dừng.
  // Người dùng chọn giảm chuyển động: mặc định không tự chạy.
  var root = $('[data-paddles]');
  if (!root) return;
  var vp = $('[data-viewport]', root);
  var slots = $$('[data-slot]', root);
  var paddles = $$('[data-paddle]', root);
  var dots = $$('[data-dot]', root);
  var toggle = $('[data-toggle]', root);
  var interval = Number(root.getAttribute('data-interval')) || 4000;
  var n = slots.length;
  if (!n) return;
  root.style.setProperty('--pg-ms', interval + 'ms');

  var userPaused = reduce;
  var holds = { hover: false, focus: false, touch: false, open: false, offscreen: false, hidden: false };
  var timer = null;

  function step() { return n > 1 ? slots[1].offsetLeft - slots[0].offsetLeft : vp.clientWidth; }
  function maxLeft() { return Math.max(0, vp.scrollWidth - vp.clientWidth); }
  function leftOf(i) { return Math.min(maxLeft(), Math.max(0, slots[i].offsetLeft - slots[0].offsetLeft)); }
  function current() { return Math.max(0, Math.min(n - 1, Math.round(vp.scrollLeft / step()))); }
  // Số vợt hiện trọn trong khung (chừa vùng mờ ở mép phải)
  function perPage() { return Math.max(1, Math.floor((vp.clientWidth - 40 + 22) / step())); }
  function atEnd() { return vp.scrollLeft >= maxLeft() - 4; }

  // Vợt của trang mới nổi lên lần lượt (so le) trong lúc trang lướt tới
  function stagger(from) {
    var count = perPage() + 1;
    for (var k = 0; k < count && from + k < n; k++) {
      var s = slots[from + k];
      s.classList.remove('pg-in');
      void s.offsetWidth;
      s.style.setProperty('--k', k);
      s.classList.add('pg-in');
    }
  }
  function goTo(i) {
    var idx = Math.max(0, Math.min(n - 1, i));
    if (!reduce) stagger(idx);
    vp.scrollTo({ left: leftOf(idx), behavior: reduce ? 'auto' : 'smooth' });
  }
  function nextPage() { if (atEnd()) goTo(0); else goTo(current() + perPage()); }
  function prevPage() {
    if (vp.scrollLeft <= 4) goTo(n - 1); // từ trang đầu lùi → về trang cuối
    else goTo(current() - perPage());
  }

  function paused() {
    if (userPaused) return true;
    for (var k in holds) if (holds[k]) return true;
    return false;
  }
  function restartProgress() {
    var bar = $('.pg-progress i', root);
    if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
  }
  function schedule() {
    clearTimeout(timer);
    var p = paused();
    root.classList.toggle('is-paused', p);
    vp.setAttribute('aria-live', p ? 'polite' : 'off');
    if (!p) {
      restartProgress();
      timer = setTimeout(function () { nextPage(); schedule(); }, interval);
    }
  }
  function hold(key, on) { if (holds[key] === on) return; holds[key] = on; schedule(); }

  // Chấm bóng theo vợt đầu tiên đang hiện
  var raf = 0;
  vp.addEventListener('scroll', function () {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      var c = current();
      dots.forEach(function (d, k) { d.classList.toggle('is-active', k === c); d.setAttribute('aria-current', k === c ? 'true' : 'false'); });
    });
  }, { passive: true });

  // Bấm tay: chuyển ngay và tính lại 4 giây từ đầu
  dots.forEach(function (d, k) { d.addEventListener('click', function () { goTo(k); schedule(); }); });
  $('[data-next]', root).addEventListener('click', function () { nextPage(); schedule(); });
  $('[data-prev]', root).addEventListener('click', function () { prevPage(); schedule(); });

  function syncToggle() {
    if (!toggle) return;
    $('[data-icon-pause]', toggle).hidden = userPaused;
    $('[data-icon-play]', toggle).hidden = !userPaused;
    toggle.setAttribute('aria-label', userPaused ? 'Tiếp tục tự chạy' : 'Tạm dừng tự chạy');
    toggle.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
  }
  if (toggle) toggle.addEventListener('click', function () { userPaused = !userPaused; syncToggle(); schedule(); });

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
      hold('open', open);
      if (open) { var link = $('.paddle-info a', p); if (link && document.activeElement === hit && !window.matchMedia('(hover: none)').matches) link.focus(); }
    });
  });
  document.addEventListener('click', function (e) { if (!root.contains(e.target)) { closeAll(null); hold('open', false); } });
  root.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeAll(null); hold('open', false); }
    if (e.key === 'ArrowRight') { nextPage(); schedule(); }
    if (e.key === 'ArrowLeft') { prevPage(); schedule(); }
  });

  root.addEventListener('mouseenter', function () { hold('hover', true); });
  root.addEventListener('mouseleave', function () { hold('hover', false); });
  root.addEventListener('focusin', function () { hold('focus', true); });
  root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) hold('focus', false); });
  var touchTimer = 0;
  vp.addEventListener('touchstart', function () { clearTimeout(touchTimer); hold('touch', true); }, { passive: true });
  vp.addEventListener('touchend', function () { clearTimeout(touchTimer); touchTimer = setTimeout(function () { hold('touch', false); }, 4000); }, { passive: true });
  document.addEventListener('visibilitychange', function () { hold('hidden', document.hidden); });
  if ('IntersectionObserver' in window) {
    // Chỉ cần lộ ~10% là chạy (khi mới tải trang, hàng vợt chỉ hiện một phần dưới hero)
    new IntersectionObserver(function (en) { hold('offscreen', !(en[0].isIntersecting && en[0].intersectionRatio >= 0.1)); }, { threshold: [0, 0.1, 0.3] }).observe(root);
  }

  syncToggle();
  schedule();
})();
