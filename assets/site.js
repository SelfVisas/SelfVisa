// SELF.KG — меню, форма заявки в WhatsApp
(function () {
  var hdr = document.querySelector('.site-header');
  var onScroll = function () { hdr && hdr.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // мобильное меню
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    nav.querySelectorAll('.nav-dd > .nav-link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (window.matchMedia('(max-width: 900px)').matches) {
          e.preventDefault();
          a.parentElement.classList.toggle('open');
        }
      });
    });
    nav.querySelectorAll('a[href*="#"]').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open'); burger.setAttribute('aria-expanded', false); document.body.style.overflow = '';
      });
    });
  }

  // форма → WhatsApp
  document.querySelectorAll('form[data-wa-form]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = new FormData(f);
      var lines = [
        (f.dataset.hello || '') + ' ' + (d.get('direction') || ''),
        '',
        '👤 ' + (d.get('name') || ''),
        '📞 ' + (d.get('phone') || ''),
      ];
      if (d.get('comment')) lines.push('💬 ' + d.get('comment'));
      var url = 'https://wa.me/' + (window.SELF_WA || '') + '?text=' + encodeURIComponent(lines.join('\n'));
      window.open(url, '_blank', 'noopener');
    });
  });
})();

// карусель отзывов
(function () {
  document.querySelectorAll('.rv').forEach(function (rv) {
    var track = rv.querySelector('.rv-track');
    if (!track) return;
    var prev = rv.querySelector('[data-rv="prev"]'), next = rv.querySelector('[data-rv="next"]');
    var step = function () { var c = track.querySelector('.rv-card'); return c ? c.getBoundingClientRect().width + 16 : track.clientWidth; };
    var update = function () {
      if (!prev) return;
      prev.disabled = track.scrollLeft <= 4;
      next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    };
    prev && prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
    next && next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });
})();
