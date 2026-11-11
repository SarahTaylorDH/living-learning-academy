// Living Learning Academy: shared page behaviour (mobile menu).
document.documentElement.classList.add('js');
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;
  function setOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  }
  toggle.addEventListener('click', function () { setOpen(toggle.getAttribute('aria-expanded') !== 'true'); });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); }
  });
})();

// Elements that depend on site settings (assets/js/config.js), e.g. the online donation link.
//   data-config-href="donateUrl"  -> set href and show when the setting exists
//   data-config-missing="donateUrl" -> show only when the setting is missing
(function () {
  var cfg = window.LLA_CONFIG || {};
  document.querySelectorAll('[data-config-href]').forEach(function (el) {
    var v = cfg[el.getAttribute('data-config-href')];
    if (v) { el.setAttribute('href', v); el.hidden = false; }
  });
  document.querySelectorAll('[data-config-missing]').forEach(function (el) {
    el.hidden = Boolean(cfg[el.getAttribute('data-config-missing')]);
  });
})();

// Land in the right place: at the top of a newly opened page, or at #section links.
// Runs after the page (and any form options) have finished laying out, so the
// position is correct even when content above the target was added by script.
(function () {
  function scrollToHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = id && document.getElementById(id);
    if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
    return Boolean(el);
  }
  var nav = window.performance && performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
  var freshVisit = !nav || nav.type === 'navigate';
  window.addEventListener('load', function () {
    if (location.hash) { scrollToHash(); return; }
    if (freshVisit) document.body.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  window.LLA_scrollToHash = scrollToHash;
})();

// Links that open a popup instead (with a normal link as the fallback):
//   <a href="/#lla-approach" data-open-dialog="approach-dialog">
(function () {
  document.querySelectorAll('[data-open-dialog]').forEach(function (link) {
    var dialog = document.getElementById(link.getAttribute('data-open-dialog'));
    if (!dialog || typeof dialog.showModal !== 'function') return;
    link.addEventListener('click', function (e) { e.preventDefault(); dialog.showModal(); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
  });
})();

// Hero video: plays once and holds on its last frame. It does not start by itself for visitors who prefer
// reduced motion or have data saver / a slow connection on (they see the still photo), but the round
// Play / Pause button on the hero lets anyone start, pause or replay it.
(function () {
  var v = document.querySelector('.hero__video');
  var btn = document.querySelector('.hero__toggle');
  if (!v) return;
  var hero = v.closest('.hero');
  var conn = navigator.connection || {};
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var slow = conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');
  var small = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
  var loaded = false;
  function label(running) {
    if (!btn) return;
    hero.classList.toggle('hero--running', running);
    btn.setAttribute('aria-label', running ? 'Pause video' : (v.ended ? 'Replay video' : 'Play video'));
  }
  function off() { hero.classList.remove('hero--video', 'hero--playing'); label(false); }
  function start() {
    if (!loaded) {
      v.src = small ? v.getAttribute('data-src-720') : v.getAttribute('data-src-1080');
      loaded = true;
    }
    hero.classList.add('hero--video');
    if (v.ended) v.currentTime = 0;
    var p = v.play();
    if (p && p.catch) p.catch(off);
  }
  v.addEventListener('playing', function () { hero.classList.add('hero--playing'); label(true); });
  v.addEventListener('pause', function () { label(false); });
  v.addEventListener('ended', function () { label(false); });
  v.addEventListener('error', off);
  if (btn) {
    btn.hidden = false;
    btn.addEventListener('click', function () { if (!loaded || v.paused || v.ended) start(); else v.pause(); });
  }
  if (!(reduce || slow)) start();
})();

// "Copy" buttons, e.g. the e-Transfer email on the Donate page: <button data-copy="text"><span class="copy-label">Copy</span></button>
(function () {
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    var label = btn.querySelector('.copy-label') || btn;
    var original = label.textContent;
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var done = function (msg) { label.textContent = msg; setTimeout(function () { label.textContent = original; }, 2500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done('Copied! Now paste it in your bank app'); }, function () { done(text); });
      } else { done(text); }
    });
  });
})();
