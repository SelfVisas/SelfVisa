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
    var step = function () { if (track.classList.contains('gal-track')) return track.clientWidth + 12; var c = [].find.call(track.children, function (x) { return !x.hidden; }); return c ? c.getBoundingClientRect().width + 16 : track.clientWidth; };
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

// отзывы: вкладки «Все / Визы / Учёба» и просмотр фото/видео
(function () {
  document.querySelectorAll('.rv-tabs').forEach(function (tabs) {
    var sec = tabs.closest('.rv-section');
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      var cat = b.dataset.cat;
      sec.querySelectorAll('.rv-card, .gal-tile').forEach(function (c) { c.hidden = !!cat && !!c.dataset.cat && c.dataset.cat !== cat; });
      sec.querySelectorAll('.rv-track').forEach(function (t) { t.scrollLeft = 0; t.dispatchEvent(new Event('scroll')); });
    });
  });
  var lb = document.getElementById('lb');
  if (!lb || typeof lb.showModal !== 'function') return;
  var body = lb.querySelector('.lb-body');
  var close = function () { lb.close(); };
  lb.addEventListener('close', function () { body.innerHTML = ''; });
  lb.querySelector('.lb-close').addEventListener('click', close);
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  document.addEventListener('click', function (e) {
    var m = e.target.closest('[data-lb]'); if (!m) return;
    e.preventDefault();
    var src = m.dataset.src, t = m.dataset.lb;
    if (t === 'img') body.innerHTML = '<img src="' + src + '" alt="">';
    else if (t === 'video') body.innerHTML = '<video src="' + src + '" controls autoplay playsinline></video>';
    else if (t === 'yt') body.innerHTML = '<iframe src="https://www.youtube.com/embed/' + src + '?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
    lb.showModal();
  });
})();
