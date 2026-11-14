// Living Learning Academy: Register page (/register/).
// Course list, pop-up (details -> your details -> payment -> thank you),
// and saving each registration to Supabase's `registrations` table
// (insert-only, see supabase/migrations/20261114000000_registrations.sql).
(function () {
  'use strict';

  var cfg = window.LLA_CONFIG || {};
  var CONTACT = cfg.contactEmail || 'info@livinglearningacademy.com';
  var ETRANSFER_EMAIL = cfg.etransferEmail || CONTACT;
  var CONNECTED = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  var PRICE = '$279';

  // Square checkout links: paste each course's link between the quotes.
  var COURSES = [
    { slug: 'music-theatre', name: 'LLA Music Theatre & Character', ref: 'LLA Music Theatre', time: '9–11 am', ages: '12–18', fw: 'CW',
      mentor: 'Natalia Pardalis', creds: 'Jazz Vocalist · Music Educator · Owner, Pardalis Music School',
      blurb: 'Build creative skills, stage confidence and teamwork through music and performance.',
      learn: ['Singing and healthy vocal technique', 'Stage presence and acting basics', 'Rehearsing and performing as an ensemble'],
      squareUrl: '' },
    { slug: 'truth-hunters', name: 'LLA Truth Hunters', ref: 'LLA Truth Hunters', time: '12–2 pm', ages: '6–11', fw: 'CW',
      mentor: 'Drea Humphrey', creds: 'Investigative Journalist · Documentarian · LLA Founder',
      blurb: "Junior detectives solve mysteries while learning to think carefully and discover what's true.",
      learn: ['Asking good questions', 'Spotting clues and checking the evidence', 'Telling fact from opinion'],
      squareUrl: '' },
    { slug: 'intro-entrepreneurship', name: 'LLA Intro to Entrepreneurship', ref: 'LLA Intro to', time: '12–2 pm', ages: '13–18', fw: 'CV',
      mentor: 'Jennifer Rees', creds: 'Financial Advisor · Education Assistant · LLA Chief Programs Officer',
      blurb: 'Teens learn how real businesses start and build a plan for their own idea.',
      learn: ['How businesses make money', 'Budgeting, pricing and profit', 'Writing and pitching a simple business plan'],
      squareUrl: '' },
    { slug: 'kidpreneurs', name: 'LLA Kidpreneurs', ref: 'LLA Kidpreneurs', time: '3–5 pm', ages: '8–11', fw: 'CW',
      mentor: 'Jennifer Rees', creds: 'Financial Advisor · Education Assistant · LLA Chief Programs Officer',
      blurb: 'Kids turn their own ideas into a small business, with honesty and hard work at the core.',
      learn: ['Earning, saving, giving and spending wisely', 'Turning an idea into a product', 'Selling with honesty and good service'],
      squareUrl: '' },
    { slug: 'critical-thinking-debate', name: 'LLA Critical Thinking & Debate', ref: 'LLA Critical Thinking', time: '3:30–5:30 pm', ages: '12–18', fw: 'CV',
      mentor: 'Drea Humphrey', creds: 'Investigative Journalist · Documentarian · LLA Founder',
      blurb: 'Teens learn to think clearly, test ideas and make their case with confidence and respect.',
      learn: ['Logic and spotting faulty reasoning', 'Building and defending an argument', 'Public speaking with confidence'],
      squareUrl: '' }
  ];
  var STEPS = ['details', 'form', 'pay', 'thanks'];
  var TEXT_FIELDS = ['parent_name', 'email', 'phone', 'street_address', 'city', 'province', 'postal_code', 'child_first_name', 'child_last_name', 'child_age'];

  var overlay = document.querySelector('[data-reg-overlay]');
  var dialog = document.querySelector('[data-reg-dialog]');
  if (!overlay || !dialog) return;

  var state = { course: null, step: 'details', form: { province: 'BC' }, errors: {}, saveFailed: false, savedKey: '', busy: false, opener: null };
  var openedAt = Date.now();

  // ------------------------------------------------------------ helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function tag(c) { return '<span class="tag tag--' + c.fw.toLowerCase() + '" title="' + (c.fw === 'CW' ? 'Christian worldview' : 'Core values') + '">' + c.fw + '</span>'; }
  function find(slug) { for (var i = 0; i < COURSES.length; i++) if (COURSES[i].slug === slug) return COURSES[i]; return null; }
  function childName() { return (state.form.child_first_name || '').trim(); }

  // ------------------------------------------------------------ live spot counts
  var spots = {};   // slug -> spots left (unknown until loaded)
  function isFull(c) { return spots[c.slug] === 0; }
  function spotsText(c, sep) {
    var n = spots[c.slug];
    if (n == null) return '';
    if (n === 0) return sep + '<strong style="color:#b3261e">Full</strong>';
    return sep + (n <= 5 ? '<strong style="color:var(--gold-dark)">Only ' + n + ' spot' + (n === 1 ? '' : 's') + ' left</strong>' : n + ' spots left');
  }
  function rpcHeaders() {
    var key = cfg.supabaseAnonKey, h = { apikey: key, 'Content-Type': 'application/json' };
    if (key.indexOf('eyJ') === 0) h.Authorization = 'Bearer ' + key;
    return h;
  }
  function loadSpots() {
    if (!CONNECTED) return Promise.resolve();
    return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/course_availability', { method: 'POST', headers: rpcHeaders(), body: '{}' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        (rows || []).forEach(function (r) { spots[r.course_id] = Math.max(0, r.spots_left | 0); });
        renderLists();
        if (state.course && state.step === 'details') render();
      })
      .catch(function () {});
  }
  function payMessage() { return state.course.ref + ' – ' + (childName() || "[Child's first name]"); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // ------------------------------------------------------------ page lists
  function renderLists() {
    var sched = document.querySelector('[data-reg-schedule]');
    var cards = document.querySelector('[data-reg-cards]');
    if (sched) {
      sched.innerHTML = COURSES.map(function (c) {
        return '<li><button type="button" class="reg-row" data-open="' + c.slug + '">' +
          '<span class="reg-row__time">' + esc(c.time) + '</span>' +
          '<span><span class="reg-row__name">' + esc(c.name) + '</span><span class="reg-row__meta">Ages ' + esc(c.ages) + ' · ' + esc(c.mentor) + spotsText(c, ' · ') + '</span></span>' +
          tag(c) + '<span class="reg-row__cta">' + (isFull(c) ? 'Full · Waitlist' : 'Details &amp; Register') + '</span></button></li>';
      }).join('');
    }
    if (cards) {
      var html = COURSES.map(function (c) {
        return '<li data-course-card><button type="button" class="reg-card" data-open="' + c.slug + '" id="' + c.slug + '-card">' +
          '<span class="reg-card__top">' + tag(c) + '<span class="reg-when">Fridays · ' + esc(c.time) + '</span></span>' +
          '<span class="reg-card__name">' + esc(c.name) + '</span>' +
          '<span class="reg-card__ages">Ages ' + esc(c.ages) + spotsText(c, ' · ') + '</span>' +
          '<span class="reg-card__blurb">' + esc(c.blurb) + '</span>' +
          '<span class="reg-learn">' + c.learn.map(function (l) { return '<span>' + esc(l) + '</span>'; }).join('') + '</span>' +
          '<span class="reg-mentor"><span class="reg-mentor__label">Your Mentor</span><span class="reg-mentor__name">' + esc(c.mentor) + '</span><span class="reg-mentor__creds">' + esc(c.creds) + '</span></span>' +
          '<span class="reg-card__foot"><span class="reg-price">' + PRICE + ' <small>+ tax</small></span><span class="btn btn--gold">' + (isFull(c) ? 'Full · Join Waitlist' : 'Details &amp; Register') + ' <span aria-hidden="true">→</span></span></span>' +
          '</button></li>';
      }).join('');
      Array.prototype.forEach.call(cards.querySelectorAll('[data-course-card]'), function (li) { li.remove(); });
      cards.insertAdjacentHTML('afterbegin', html);
    }
  }

  // ------------------------------------------------------------ dialog views
  function head() {
    var c = state.course;
    var idx = STEPS.indexOf(state.step);
    return '<div class="reg-dialog__head"><div>' +
      '<p class="reg-dialog__tags">' + tag(c) + '<span class="reg-when">Fridays · ' + esc(c.time) + ' · Ages ' + esc(c.ages) + '</span></p>' +
      '<h2 id="reg-title">' + esc(c.name) + '</h2></div>' +
      '<button type="button" class="reg-x" data-close aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<ol class="reg-steps" aria-label="Step ' + (idx + 1) + ' of 4">' + STEPS.map(function (s, i) { return '<li class="' + (i <= idx ? 'on' : '') + '"></li>'; }).join('') + '</ol>';
  }

  function viewDetails() {
    var c = state.course;
    return '<div class="reg-body">' +
      '<p style="font-size:16.5px">' + esc(c.blurb) + '</p>' +
      '<div><p class="reg-label">What they\'ll learn</p><ul class="reg-points">' + c.learn.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="reg-mentor"><span class="reg-mentor__label">Your Mentor</span><span class="reg-mentor__name">' + esc(c.mentor) + '</span><span class="reg-mentor__creds">' + esc(c.creds) + '</span></div>' +
      '<div class="reg-details">' +
        '<p><strong>When:</strong> Fridays ' + esc(c.time) + ', Jan 8 – Feb 19, 2027</p>' +
        '<p><strong>Field trip:</strong> Feb 26, optional; extra fees may apply, fundraising options available</p>' +
        '<p><strong>Where:</strong> LLA Langley Campus (address emailed after registration)</p>' +
        '<p><strong>Class size:</strong> 10–15 students' + spotsText(c, ' · ') + '</p>' +
      '</div>' +
      '<div class="reg-foot"><p><span class="reg-price" style="font-size:30px">' + PRICE + '</span> <span class="reg-note">per child, plus applicable tax</span></p>' +
      (isFull(c)
        ? '<a class="btn btn--gold" href="/join/">Full · Join the Waitlist <span aria-hidden="true">→</span></a></div>'
        : '<button type="button" class="btn btn--gold" data-go="form">Register Now <span aria-hidden="true">→</span></button></div>') +
      '</div>';
  }

  function field(name, label, type, extra) {
    var err = state.errors[name];
    return '<div><label for="reg-' + name + '">' + label + '</label>' +
      '<input id="reg-' + name + '" name="' + name + '" type="' + type + '" value="' + esc(state.form[name] || '') + '"' + (extra || '') +
      (err ? ' aria-invalid="true" aria-describedby="reg-' + name + '-err"' : '') + '>' +
      (err ? '<span class="reg-err" id="reg-' + name + '-err">' + esc(err) + '</span>' : '') + '</div>';
  }

  function viewForm() {
    var ackErr = state.errors.policy_ack;
    var gErr = state.errors.child_gender;
    var gender = function (v, label) {
      return '<label class="reg-check" style="align-items:center"><input type="radio" name="child_gender" value="' + v + '"' + (state.form.child_gender === v ? ' checked' : '') + (gErr ? ' aria-invalid="true"' : '') + '> <span>' + label + '</span></label>';
    };
    return '<form class="reg-body" data-reg-form novalidate>' +
      '<p class="reg-note">All fields are required before payment, whether you pay by e-Transfer or card.</p>' +
      '<h3>Parent or guardian</h3>' +
      '<div class="reg-fields">' +
        field('parent_name', 'Full name', 'text', ' autocomplete="name" required') +
        field('email', 'Email', 'email', ' autocomplete="email" required') +
        field('phone', 'Cell phone', 'tel', ' autocomplete="tel" required') +
        field('street_address', 'Street address', 'text', ' autocomplete="street-address" required') +
        field('city', 'City', 'text', ' autocomplete="address-level2" required') +
        field('province', 'Province', 'text', ' autocomplete="address-level1" required') +
        field('postal_code', 'Postal code', 'text', ' autocomplete="postal-code" required') +
      '</div>' +
      '<h3>Your child</h3>' +
      '<div class="reg-fields">' +
        field('child_first_name', 'First name', 'text', ' required') +
        field('child_last_name', 'Last name', 'text', ' required') +
        field('child_age', 'Age', 'number', ' min="5" max="18" inputmode="numeric" required') +
        '<fieldset style="border:0;margin:0;padding:0"><legend style="font:700 12px/1.4 var(--sans);letter-spacing:.06em;color:var(--navy);margin:0 0 10px;padding:0">Gender</legend>' +
          '<div style="display:flex;gap:22px">' + gender('male', 'Male') + gender('female', 'Female') + '</div>' +
          (gErr ? '<span class="reg-err">' + esc(gErr) + '</span>' : '') +
        '</fieldset>' +
      '</div>' +
      '<fieldset style="border:0;margin:0;padding:0"><legend class="reg-label" style="padding:0">How will you pay?</legend>' +
        '<div style="display:grid;gap:10px">' +
          '<label class="reg-check reg-option' + (state.form.payment_choice === 'etransfer' ? ' reg-option--best' : '') + '" style="flex-direction:row"><input type="radio" name="payment_choice" value="etransfer"' + (state.form.payment_choice === 'etransfer' ? ' checked' : '') + (state.errors.payment_choice ? ' aria-invalid="true"' : '') + '> <span><strong>Interac e-Transfer</strong> (preferred, no fees). Your spot is held for 12 hours while we wait for it.</span></label>' +
          '<label class="reg-check reg-option' + (state.form.payment_choice === 'square' ? ' reg-option--best' : '') + '" style="flex-direction:row"><input type="radio" name="payment_choice" value="square"' + (state.form.payment_choice === 'square' ? ' checked' : '') + (state.errors.payment_choice ? ' aria-invalid="true"' : '') + '> <span><strong>Debit or credit card</strong> through Square. Pay now to secure your spot right away.</span></label>' +
        '</div>' +
        (state.errors.payment_choice ? '<span class="reg-err">' + esc(state.errors.payment_choice) + '</span>' : '') +
      '</fieldset>' +
      '<div class="reg-hp" aria-hidden="true"><label for="reg-website">Leave this empty</label><input id="reg-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>' +
      '<label class="reg-check"><input type="checkbox" name="policy_ack"' + (state.form.policy_ack ? ' checked' : '') + (ackErr ? ' aria-invalid="true"' : '') + '> <span>I understand the course needs 10 students to run, and I\'ll get a full refund or transfer if it doesn\'t.</span></label>' +
      (ackErr ? '<span class="reg-err">' + esc(ackErr) + '</span>' : '') +
      '<p class="reg-note">Please don\'t include health information here. We\'ll send a secure child information form after you register.</p>' +
      '<div class="reg-foot"><button type="button" class="reg-link" data-go="details">← Back</button>' +
      '<button type="submit" class="btn btn--gold"' + (state.busy ? ' disabled aria-busy="true"' : '') + '>Continue to Payment <span aria-hidden="true">→</span></button></div>' +
      '</form>';
  }

  function viewPay() {
    var c = state.course;
    var card = c.squareUrl
      ? '<a class="btn btn--outline" href="' + esc(c.squareUrl) + '" target="_blank" rel="noopener">Pay ' + PRICE + ' by Card <span aria-hidden="true">↗</span></a>' +
        '<p class="reg-note">Opens Square\'s secure checkout in a new tab. Card processing fees apply. When you\'re done, come back and tap below.</p>' +
        '<button type="button" class="reg-link" data-go="thanks">I\'ve paid by card →</button>'
      : '<p class="reg-note">Card payment link coming soon. Email <a href="mailto:' + esc(CONTACT) + '?subject=' + encodeURIComponent('Card payment: ' + c.name) + '">' + esc(CONTACT) + '</a> and we\'ll send you a secure Square link.</p>';
    var etransfer = state.form.payment_choice === 'etransfer';
    return '<div class="reg-body">' +
      (state.saveFailed ? '<p class="reg-warn">We couldn\'t save your details automatically. Please also email your name, phone and child\'s name and age to <a href="mailto:' + esc(CONTACT) + '">' + esc(CONTACT) + '</a> so we can hold your spot.</p>' : '') +
      (etransfer
        ? '<div class="reg-option reg-option--best">' +
            '<div class="reg-option__head"><h3 style="margin:0">Pay by Interac e-Transfer</h3><span class="reg-badge">Preferred · No fees</span></div>' +
            '<ol class="reg-pay">' +
              '<li><strong>Send ' + PRICE + '</strong> by Interac e-Transfer to <strong>' + esc(ETRANSFER_EMAIL) + '</strong></li>' +
              '<li>In the e-Transfer message, write the <strong>first three words of the course name</strong> and your child\'s first name:' +
                '<div class="reg-msg"><span data-msg>' + esc(payMessage()) + '</span><button type="button" class="reg-copy" data-copy>Copy</button></div></li>' +
              '<li>Once your e-Transfer arrives, we\'ll email you a thank-you with the campus address and a short child information form.</li>' +
            '</ol>' +
            '<p class="reg-warn"><strong>Your spot is held for 12 hours.</strong> If your e-Transfer hasn\'t arrived by then, the spot is released to the next family.</p>' +
            '<button type="button" class="btn btn--gold" data-go="thanks">I\'ve Sent My e-Transfer <span aria-hidden="true">→</span></button>' +
          '</div>'
        : '<div class="reg-option reg-option--best">' +
            '<h3 style="margin:0">Pay by debit or credit card (via Square)</h3>' + card +
            '<p class="reg-warn"><strong>Pay now to secure your spot.</strong> Card payments confirm your spot right away. Unpaid card registrations are released after 1 hour.</p>' +
          '</div>') +
      '<div class="reg-foot"><button type="button" class="reg-link" data-go="form">← Change payment method</button></div>' +
      '</div>';
  }

  function viewFull() {
    var c = state.course;
    var open = COURSES.filter(function (o) { return o.slug !== c.slug && !isFull(o); });
    return '<div class="reg-body">' +
      '<div class="reg-thanks"><p class="eyebrow" style="margin:0 0 8px">Course Full</p>' +
        '<h3>Sorry, ' + esc(c.name) + ' is full.</h3>' +
        '<p style="color:var(--muted)">Join the waitlist and we\'ll contact you if a spot opens or when we run it again.</p></div>' +
      '<a class="btn btn--gold" href="/join/">Join the Waitlist <span aria-hidden="true">→</span></a>' +
      (open.length ? '<div style="padding-top:14px;border-top:1px solid #eee7da"><p class="reg-label">Courses with spots open</p><div class="reg-others">' +
        open.map(function (o) {
          return '<button type="button" class="reg-other" data-open="' + o.slug + '"><span>' + esc(o.name) + ' <small>· Ages ' + esc(o.ages) + ' · ' + esc(o.time) + '</small></span><em>View →</em></button>';
        }).join('') + '</div></div>' : '') +
      '</div>';
  }

  function viewThanks() {
    var c = state.course;
    var others = COURSES.filter(function (o) { return o.slug !== c.slug; });
    return '<div class="reg-body">' +
      '<div class="reg-thanks"><p class="eyebrow" style="margin:0 0 8px">Thank You</p>' +
        '<h3>You\'re registered for ' + esc(c.name) + '!</h3>' +
        '<p style="color:var(--muted)">We\'re so excited! Once your payment arrives, we\'ll email a thank-you with the Langley Campus address and everything you need for the first class. We can\'t wait to meet ' + esc(childName() || 'your child') + '.</p></div>' +
      '<div style="padding-top:14px;border-top:1px solid #eee7da"><p class="reg-label">Register for another course</p><div class="reg-others">' +
        others.map(function (o) {
          return '<button type="button" class="reg-other" data-open="' + o.slug + '"><span>' + esc(o.name) + ' <small>· Ages ' + esc(o.ages) + ' · ' + esc(o.time) + '</small></span><em>Add →</em></button>';
        }).join('') +
      '</div></div>' +
      '<div class="reg-more"><a class="btn btn--outline" href="/donate/">Donate to LLA</a><a class="btn btn--outline" href="/join/">Join the Waitlist</a></div>' +
      '</div>';
  }

  function render(focusSelector) {
    var views = { details: viewDetails, form: viewForm, pay: viewPay, thanks: viewThanks, full: viewFull };
    dialog.innerHTML = head() + views[state.step]();
    var target = focusSelector && dialog.querySelector(focusSelector);
    (target || dialog).focus();
    overlay.scrollTop = 0;
  }

  // ------------------------------------------------------------ open / close
  function open(slug, opener) {
    var c = find(slug);
    if (!c) return;
    if (!state.course) state.opener = opener || document.activeElement;
    state.course = c; state.step = 'details'; state.errors = {}; state.saveFailed = false;
    overlay.hidden = false;
    document.body.classList.add('reg-lock');
    try { history.replaceState(null, '', '#' + slug); } catch (e) {}
    render();
  }
  function close() {
    overlay.hidden = true;
    document.body.classList.remove('reg-lock');
    state.course = null;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    if (state.opener && state.opener.focus) state.opener.focus();
    state.opener = null;
  }
  function go(step) {
    state.step = step;
    render(step === 'form' ? 'input[name="parent_name"]' : null);
  }

  // ------------------------------------------------------------ form
  function readForm(form) {
    TEXT_FIELDS.forEach(function (n) { state.form[n] = form.elements[n].value.trim(); });
    var g = form.querySelector('input[name="child_gender"]:checked');
    state.form.child_gender = g ? g.value : '';
    var pm = form.querySelector('input[name="payment_choice"]:checked');
    state.form.payment_choice = pm ? pm.value : '';
    state.form.policy_ack = form.elements.policy_ack.checked;
  }
  function validate() {
    var f = state.form, e = {};
    if (!f.parent_name) e.parent_name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email || '')) e.email = 'Please enter a valid email.';
    if ((f.phone || '').replace(/\D/g, '').length < 10) e.phone = 'Please enter a 10-digit phone number.';
    if (!f.street_address) e.street_address = 'Please enter your street address.';
    if (!f.city) e.city = 'Please enter your city.';
    if (!f.province) e.province = 'Please enter your province.';
    if (!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(f.postal_code || '')) e.postal_code = 'Please enter a postal code like V1M 0B2.';
    if (!f.child_first_name) e.child_first_name = 'Please enter your child\'s first name.';
    if (!f.child_last_name) e.child_last_name = 'Please enter your child\'s last name.';
    var age = parseInt(f.child_age, 10);
    if (!(age >= 5 && age <= 18)) e.child_age = 'Please enter an age from 5 to 18.';
    if (f.child_gender !== 'male' && f.child_gender !== 'female') e.child_gender = 'Please choose male or female.';
    if (f.payment_choice !== 'etransfer' && f.payment_choice !== 'square') e.payment_choice = 'Please choose how you\'ll pay.';
    if (!f.policy_ack) e.policy_ack = 'Please confirm you understand the minimum class size.';
    return e;
  }
  function save() {
    var f = state.form, c = state.course;
    var row = {
      id: uuid(), course_id: c.slug, course_name: c.name,
      parent_name: f.parent_name.slice(0, 120), email: f.email.slice(0, 200), phone: f.phone.slice(0, 40),
      street_address: f.street_address.slice(0, 200), city: f.city.slice(0, 100), province: f.province.slice(0, 60),
      postal_code: f.postal_code.toUpperCase().replace(/[ -]/g, '').replace(/^(...)(...)$/, '$1 $2'),
      child_first_name: f.child_first_name.slice(0, 80), child_last_name: f.child_last_name.slice(0, 80),
      child_age: parseInt(f.child_age, 10), child_gender: f.child_gender,
      payment_choice: f.payment_choice, policy_ack: true,
      payment_reference: payMessage().slice(0, 120), source: location.pathname.slice(0, 40)
    };
    var headers = rpcHeaders();
    headers.Prefer = 'return=minimal';
    return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/registrations', { method: 'POST', headers: headers, body: JSON.stringify([row]) })
      .then(function (res) {
        if (res.ok) return;
        return res.text().then(function (body) {
          var err = new Error('Save failed (' + res.status + ')');
          err.full = /course_full/.test(body);
          throw err;
        });
      });
  }
  function submit(form) {
    readForm(form);
    state.errors = validate();
    if (Object.keys(state.errors).length) {
      var first = Object.keys(state.errors)[0];
      render(first === 'policy_ack' ? 'input[name="policy_ack"]' : 'input[name="' + first + '"]');
      return;
    }
    // Bots: filled the hidden field or submitted inhumanly fast. Pretend success.
    if (form.elements.website.value || Date.now() - openedAt < 2500) { state.saveFailed = false; go('pay'); return; }
    var saveKey = state.course.slug + '|' + JSON.stringify(state.form);
    if (!CONNECTED || saveKey === state.savedKey) { state.saveFailed = !CONNECTED; go('pay'); return; }
    state.busy = true; render();
    save().then(function () { state.savedKey = saveKey; state.saveFailed = false; state.busy = false; go('pay'); loadSpots(); })
      .catch(function (err) {
        state.busy = false;
        if (err && err.full) { spots[state.course.slug] = 0; renderLists(); go('full'); return; }
        state.saveFailed = true; go('pay');
      });
  }

  // ------------------------------------------------------------ events
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open]');
    if (t) { e.preventDefault(); open(t.getAttribute('data-open'), t); return; }
    if (overlay.hidden) return;
    if (e.target === overlay || e.target.closest('[data-close]')) { close(); return; }
    var g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); go(g.getAttribute('data-go')); return; }
    if (e.target.closest('[data-copy]')) {
      var text = payMessage(), btn = e.target.closest('[data-copy]');
      var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {}); else done();
    }
  });
  dialog.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-reg-form]');
    if (form) { e.preventDefault(); if (!state.busy) submit(form); }
  });
  document.addEventListener('keydown', function (e) {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    var items = dialog.querySelectorAll('a[href], button:not([disabled]), input:not([tabindex="-1"]), [tabindex="0"]');
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  renderLists();
  loadSpots();
  // Deep links for QR codes and posts: /register/#truth-hunters opens that course.
  var slug = location.hash.replace('#', '');
  if (find(slug)) open(slug);
})();
