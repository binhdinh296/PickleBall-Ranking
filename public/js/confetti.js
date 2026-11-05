/* Tung hoa giấy lặp lại ở mục "Những nhà vô địch" (trang chi tiết giải).
   File tĩnh để tuân thủ CSP. Chỉ chạy khi mục đang hiện trên màn hình và tab đang mở;
   tắt hẳn nếu người dùng bật giảm chuyển động. */
(function () {
  'use strict';
  var canvas = document.querySelector('[data-confetti]');
  if (!canvas || !canvas.getContext) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var host = canvas.parentElement;
  var ctx = canvas.getContext('2d');
  var COLORS = ['#E6C27A', '#F7DE92', '#D4F53C', '#14B8A6', '#FFFFFF', '#FF8A65', '#C9A35A'];
  var BURST_EVERY = 4500; // ms giữa hai lần bắn pháo giấy
  var MAX = 260;          // giới hạn số mảnh để nhẹ máy
  var parts = [];
  var w = 0, h = 0, dpr = 1;
  var running = false, visible = false, raf = 0, last = 0, nextBurst = 0, rainAcc = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = host.clientWidth; h = host.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function piece(x, y, vx, vy) {
    var shape = Math.random();
    return {
      x: x, y: y, vx: vx, vy: vy,
      size: rand(5, 10), color: pick(COLORS),
      shape: shape < 0.55 ? 'rect' : shape < 0.85 ? 'ribbon' : 'dot',
      rot: rand(0, Math.PI * 2), vr: rand(-0.2, 0.2),
      flip: rand(0, Math.PI * 2), vf: rand(0.08, 0.2),
      sway: rand(0.6, 1.6), life: 0, ttl: rand(4.5, 6.5)
    };
  }

  // Hai ống pháo ở hai góc dưới bắn chéo lên giữa
  function burst() {
    var n = Math.min(70, Math.max(30, Math.round(w / 18)));
    for (var i = 0; i < n && parts.length < MAX; i++) {
      var left = i % 2 === 0;
      var speed = rand(9, 15);
      var ang = (left ? rand(-78, -52) : rand(-128, -102)) * Math.PI / 180;
      parts.push(piece(left ? rand(0, w * 0.06) : rand(w * 0.94, w), h * rand(0.82, 0.95), Math.cos(ang) * speed, Math.sin(ang) * speed));
    }
  }

  // Hoa giấy rơi nhẹ từ trên xuống giữa các lần bắn
  function rain(dt) {
    rainAcc += dt * (w / 900) * 10; // ~10 mảnh/giây trên màn rộng
    while (rainAcc >= 1 && parts.length < MAX) {
      rainAcc -= 1;
      parts.push(piece(rand(0, w), -12, rand(-0.4, 0.4), rand(0.8, 2)));
    }
  }

  function draw(p) {
    var alpha = p.life > p.ttl - 1 ? Math.max(0, p.ttl - p.life) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.cos(p.flip)); // lật mảnh giấy như đang xoay trong không khí
    ctx.fillStyle = p.color;
    if (p.shape === 'dot') {
      ctx.beginPath(); ctx.arc(0, 0, p.size * 0.38, 0, Math.PI * 2); ctx.fill();
    } else if (p.shape === 'ribbon') {
      ctx.fillRect(-p.size * 0.18, -p.size, p.size * 0.36, p.size * 2);
    } else {
      ctx.fillRect(-p.size / 2, -p.size * 0.32, p.size, p.size * 0.64);
    }
    ctx.restore();
  }

  function frame(t) {
    if (!running) return;
    var dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    if (t >= nextBurst) { burst(); nextBurst = t + BURST_EVERY; }
    rain(dt);
    ctx.clearRect(0, 0, w, h);
    var k = dt * 60; // chuẩn hoá theo 60 khung hình/giây
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life += dt;
      p.vx *= Math.pow(0.985, k);
      p.vy = p.vy * Math.pow(0.985, k) + 0.16 * k;
      if (p.vy > 3.2) p.vy = 3.2; // rơi chậm như giấy
      p.x += (p.vx + Math.sin(p.life * 3 * p.sway) * 0.6) * k;
      p.y += p.vy * k;
      p.rot += p.vr * k;
      p.flip += p.vf * k;
      if (p.life > p.ttl || p.y > h + 20) { parts.splice(i, 1); continue; }
      draw(p);
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || !visible || document.hidden) return;
    running = true; last = 0;
    if (!nextBurst || nextBurst < performance.now()) nextBurst = performance.now() + 250;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
  else window.addEventListener('resize', resize);

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }, { threshold: 0.15 }).observe(host);
  } else { visible = true; start(); }

  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
})();
