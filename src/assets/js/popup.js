// Email sign-up pop-up. Shows on page load (and again on refresh) until the visitor signs up.
// It only appears when the site is connected to the database, and it only says "Thank you" after
// the email has really been saved. Saves a row in `submissions` with form_type = 'updates'.
(function () {
  var dlg = document.getElementById('email-popup');
  if (!dlg || typeof dlg.showModal !== 'function') return;
  var cfg = window.LLA_CONFIG || {};
  if (!(cfg.supabaseUrl && cfg.supabaseAnonKey)) return;               // never show a form that can't save
  var path = location.pathname;
  if (/^\/(join|register|login|privacy|terms|404)(\/|$)/.test(path)) return; // pages with their own forms or legal text
  var CONSENT_VERSION = '2026-11-04';
  var CONTACT = cfg.contactEmail || 'info@livinglearningacademy.com';
  function get(store, k) { try { return window[store].getItem(k); } catch (e) { return null; } }
  function set(store, k, v) { try { window[store].setItem(k, v); } catch (e) {} }
  if (get('localStorage', 'lla_subscribed')) return;                    // already signed up

  var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {};
  var isReload = nav.type === 'reload';
  if (!isReload && get('sessionStorage', 'lla_popup_closed')) return;   // closed earlier this visit; a refresh shows it again

  var form = dlg.querySelector('.emailpop__form');
  var err = dlg.querySelector('[data-popup-error]');
  var shownAt = 0, saved = false;
  dlg.addEventListener('close', function () { if (!saved) set('sessionStorage', 'lla_popup_closed', '1'); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function fail(msg) { err.innerHTML = msg; err.hidden = false; }
  function done() {
    saved = true; set('localStorage', 'lla_subscribed', '1');
    dlg.querySelector('[data-popup-form]').hidden = true;
    dlg.querySelector('[data-popup-done]').hidden = false;
    setTimeout(function () { if (dlg.open) dlg.close(); }, 4000);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.hidden = true;
    var email = form.elements.email.value.trim();
    var first = form.elements.first_name.value.trim().slice(0, 60);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) { fail('Please enter a valid email address.'); form.elements.email.focus(); return; }
    if (!form.elements.consent.checked) { fail('Please tick the box so we know you’d like to hear from us.'); form.elements.consent.focus(); return; }
    // Bots: filled the hidden field or submitted instantly. Pretend success, save nothing.
    if (form.elements.website.value || Date.now() - shownAt < 800) { done(); return; }
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    var key = cfg.supabaseAnonKey, headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
    if (key.indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + key;
    fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/submissions', {
      method: 'POST', headers: headers,
      body: JSON.stringify([{
        id: uuid(), form_type: 'updates', full_name: first.length >= 2 ? first : 'Friend of LLA', email: email,
        updates_opt_in: true, privacy_consent: true, consent_version: CONSENT_VERSION, source: ('popup:' + path).slice(0, 40)
      }])
    }).then(function (res) {
      if (!res.ok) throw new Error('save failed ' + res.status);
      done();
    }).catch(function () {
      fail('Sorry, we couldn’t save that just now. Please try again, or email <a href="mailto:' + CONTACT + '">' + CONTACT + '</a>.');
      btn.disabled = false; btn.removeAttribute('aria-busy');
    });
  });

  setTimeout(function () { if (!document.querySelector('dialog[open]')) { shownAt = Date.now(); dlg.showModal(); } }, 1200);
})();
