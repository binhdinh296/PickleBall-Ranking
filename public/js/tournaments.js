/* Trang /giai-dau: tìm giải theo tên/địa điểm + thu gọn danh sách dài
   (file tĩnh để tuân thủ CSP, không dùng script inline) */
(function () {
  'use strict';
  var PAGE_SIZE = 9;
  var input = document.getElementById('tourSearchInput');
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-event-card]'));
  if (!cards.length) return;

  var emptyMsg = document.getElementById('searchEmptyMessage');
  var netFeatured = document.querySelector('[data-net-for="featured"]');
  var netGrid = document.querySelector('[data-net-for="grid"]');
  var grid = document.getElementById('tournamentGrid');
  var gridCount = netGrid ? netGrid.querySelector('b') : null;
  var moreWrap = document.querySelector('[data-load-more-wrap]');
  var moreBtn = moreWrap ? moreWrap.querySelector('[data-load-more]') : null;
  var moreCount = moreWrap ? moreWrap.querySelector('[data-load-more-count]') : null;
  var limit = PAGE_SIZE;

  function apply() {
    var query = input ? input.value.toLowerCase().trim() : '';
    var matches = 0;
    var gridMatches = 0;
    var featuredMatch = false;
    cards.forEach(function (card) {
      var name = card.getAttribute('data-name') || '';
      var venue = card.getAttribute('data-venue') || '';
      var isMatch = !query || name.indexOf(query) !== -1 || venue.indexOf(query) !== -1;
      var isFeatured = card.classList.contains('tc--featured');
      // Khi đang tìm thì hiện mọi kết quả; khi không tìm thì chỉ hiện `limit` giải đầu của lưới
      var visible = isMatch && (isFeatured || query || gridMatches < limit);
      card.style.display = visible ? '' : 'none';
      if (!isMatch) return;
      matches++;
      if (isFeatured) featuredMatch = true;
      else gridMatches++;
    });
    if (netFeatured) netFeatured.style.display = featuredMatch ? '' : 'none';
    if (netGrid) netGrid.style.display = gridMatches ? '' : 'none';
    if (grid) grid.style.display = gridMatches ? '' : 'none';
    if (gridCount) gridCount.textContent = gridMatches;
    if (emptyMsg) emptyMsg.style.display = (matches === 0 && query) ? '' : 'none';

    var hiddenCount = query ? 0 : Math.max(0, gridMatches - limit);
    if (moreWrap) moreWrap.hidden = hiddenCount === 0;
    if (moreCount) moreCount.textContent = Math.min(PAGE_SIZE, hiddenCount);
  }

  if (moreBtn) {
    moreBtn.addEventListener('click', function () {
      var firstNew = limit;
      limit += PAGE_SIZE;
      apply();
      // Đưa focus tới giải đầu tiên vừa hiện để người dùng bàn phím đọc tiếp
      var gridCards = grid ? grid.querySelectorAll('[data-event-card]') : [];
      var link = gridCards[firstNew] && gridCards[firstNew].querySelector('.tc-title a');
      if (link) link.focus({ preventScroll: false });
    });
  }

  if (input) {
    input.addEventListener('input', apply);
    Array.prototype.forEach.call(document.querySelectorAll('[data-search-clear]'), function (btn) {
      btn.addEventListener('click', function () {
        input.value = '';
        apply();
        input.focus();
      });
    });
  }

  apply();
})();
