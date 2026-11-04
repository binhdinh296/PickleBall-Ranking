// Lớp tỉ số cho OBS: lấy tỉ số mỗi 2 giây
(function () {
  var el = document.querySelector('[data-overlay]');
  if (!el) return;
  var url = el.getAttribute('data-overlay');
  function set(k, v) {
    var n = el.querySelector('[data-f="' + k + '"]');
    if (n && n.textContent !== String(v)) {
      n.textContent = v;
      if (k === 'scoreA' || k === 'scoreB') { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); }
    }
  }
  function tick() {
    fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) return;
      var m = d.match;
      el.classList.toggle('idle', !m);
      if (!m) return;
      set('teamA', m.teamA); set('teamB', m.teamB);
      set('scoreA', m.scoreA); set('scoreB', m.scoreB);
      set('title', [m.division, m.round, m.code].filter(Boolean).join(' · '));
      set('leg', m.leg ? 'Chặng ' + m.leg.index + ' · ' + (m.leg.pair || '') + ' · đến ' + m.leg.target : '');
    }).catch(function () { /* giữ tỉ số cũ khi mất mạng */ });
  }
  tick();
  setInterval(tick, 2000);
})();
