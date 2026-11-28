// Living Learning Academy: Register page (/register/).
// Course list and pop-up: course details -> child (and parent) details -> your registration (cart)
// -> payment -> thank you. A family can add several courses and children, then pay once.
// Checkout goes through the Supabase Edge Function `checkout` (supabase/functions/checkout), which saves
// the order (prices and family discount are decided by the database) and, for card, sends the family
// to a Square checkout built for the whole order. Square tells the database when it's paid.
(function () {
  'use strict';

  var cfg = window.LLA_CONFIG || {};
  var CONTACT = cfg.contactEmail || 'info@livinglearningacademy.com';
  // Course e-Transfers go to the payments inbox (autodeposit). Donations go to donate@.
  var ETRANSFER_EMAIL = cfg.etransferEmail || 'payments@livinglearningacademy.com';
  var CONNECTED = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  // Prices (no tax). Shown per month first; the full amount only appears once a family picks "Pay in full".
  // The database has the same prices and is what actually charges (public.course_capacity).
  var PRICE = 27800, MONTHLY = 13900, MONTHS = 2;
  // Family discount: 10% off each additional course in a household, this term only.
  var TERM = 'winter-2027';
  var CART_KEY = 'lla-registration-v1';

  // Where and when. Each course uses these unless it sets its own place / day / dates
  // (e.g. place: 'Surrey, BC').
  var PLACE = 'Langley, BC';
  var DATES = 'January 15 to March 5, 2027 (8 weeks)';
  var DATES_MAR12 = 'January 15 to March 12, 2027 (8 weeks; no class February 19)';
  function placeOf(c) { return c.place || PLACE; }
  function whenOf(c) { return (c.day || 'Fridays') + ' ' + c.time + ', ' + (c.dates || DATES); }

  var COURSES = [
    { slug: 'music-theatre', name: 'LLA Music Theatre & Character', ref: 'Music Theatre', time: '9–11 am', ages: '12–18', fw: 'CW', max: 20,
      tagline: 'Singing, Acting & Performance for Teens',
      mentor: 'Natalia Pardalis', creds: 'Award-Winning Jazz Vocalist · Music Educator · Owner, Pardalis Studio of Music',
      hook: 'Where teens build the confidence to perform, and carry it into any room.',
      blurb: 'Led by award-winning jazz vocalist, music educator and Pardalis Studio of Music owner Natalia Pardalis, teens learn to sing, act and bring a character to life, then perform a musical number together.',
      learn: ['Basic singing technique and healthy vocal habits', 'Common theatre terms and stage skills', 'Bringing a character to life through song and acting', 'Performing a musical number together for the class and parents, with choreography, spoken lines and possible solos'],
      climb: [['C', 'Character: discipline, encouragement and grace in rehearsal'], ['L', 'Leadership: the courage to perform and lift up the ensemble'], ['I', 'Independent thinking: interpreting a character and story'], ['M', 'Mastery of life skills: confident speaking, teamwork and focus'], ['B', 'Building impact: a performance that blesses its audience']],
      faith: 'Taught from a Christian worldview, with Scripture woven into every class: learners are reminded that their gifts and talents come from God, and learn to use them to glorify Him and bless those around them. Everyone is welcome.',
      verse: { text: '“Worship the Lord with gladness; come before him with joyful songs.”', ref: 'Psalm 100:2 (NIV)' } },
    { slug: 'truth-hunters', name: 'LLA Jr. Truth Detectives', ref: 'Truth Detectives', time: '12–2 pm', ages: '6–11', fw: 'CW', max: 16, dates: DATES_MAR12,
      mentor: 'Drea Humphrey', creds: 'Investigative Journalist · Documentarian · LLA Founder',
      tagline: 'Critical Thinking for Kids', episode: 'Adventure 1: The Mystery of the Missing Ark',
      hook: 'Your junior detective’s first big case is waiting.',
      blurb: 'Led by investigative journalist, documentarian and LLA founder Drea Humphrey, children hunt for clues, explore Scripture and investigate the mystery of the Ark of the Covenant.',
      learn: ['Observing carefully and spotting clues', 'What is known about the Ark of the Covenant', 'Asking thoughtful questions and checking claims', 'Presenting their conclusions to the class and parents about where the Ark likely is, based on the evidence they’ve gathered'],
      climb: [['C', 'Character: honesty and fairness when weighing evidence'], ['L', 'Leadership: the courage to share findings and work as a team'], ['I', 'Independent thinking: questioning claims and testing what is true'], ['M', 'Mastery of life skills: careful observation, listening and reasoning'], ['B', 'Building impact: using truth to help and encourage others']],
      faith: 'Taught from a Christian worldview, with Scripture woven into every class: children learn that God is the source of all truth, and how to seek it carefully, wisely and with an open Bible. Everyone is welcome.',
      verse: { text: '“Prove all things; hold fast that which is good.”', ref: '1 Thessalonians 5:21 (KJV)' } },
    { slug: 'intro-entrepreneurship', name: 'LLA Young Entrepreneurs', ref: 'Young Entrepreneurs', time: '12–2 pm', ages: '13–18', fw: 'CV', max: 20, dates: DATES_MAR12,
      mentor: 'Jennifer Rees', creds: 'Entrepreneur · Financial Advisor · Education Assistant · LLA Chief Programs Officer',
      tagline: 'Business Startup Skills for Teens',
      hook: 'Teens bring their own idea and leave with a real business, ready to launch.',
      blurb: 'Led by entrepreneur, financial advisor, educator and LLA Chief Programs Officer Jennifer Rees, teens take their own idea, from baking and artwork to woodworking or a service, and build it into a small business in 8 weeks. An intro-level course: no business experience needed.',
      learn: ['Naming and branding their business', 'Costs, pricing, budgeting and profit', 'Building a simple website and marketing it safely', 'Presenting and launching their business to the class and parents'],
      climb: [['C', 'Character: honesty with customers and pride in good work'], ['L', 'Leadership: owning a project from first idea to launch'], ['I', 'Independent thinking: solving problems and making their own business decisions'], ['M', 'Mastery of life skills: budgeting, pricing, marketing and customer service'], ['B', 'Building impact: offering something of real value to their community']],
      faith: 'Taught in line with LLA’s core values: learners learn to work hard, overcome challenges, deal honestly and manage money wisely, and discover how they can make a real difference in people’s lives through service.',
      verse: { text: '“Well done is better than well said.”', ref: 'Benjamin Franklin' } },
    { slug: 'kidpreneurs', name: 'LLA Kidpreneurs', ref: 'Kidpreneurs', time: '3:30–5:30 pm', ages: '8–11', fw: 'CW', max: 20, dates: DATES_MAR12,
      mentor: 'Jennifer Rees', creds: 'Entrepreneur · Financial Advisor · Education Assistant · LLA Chief Programs Officer',
      tagline: 'Business & Money Skills for Kids',
      hook: 'Kids turn their own idea into a real little business, then open shop on Market Day.',
      blurb: 'Led by entrepreneur, financial advisor, educator and LLA Chief Programs Officer Jennifer Rees, kids pick a product or service, or bring their own idea, and build their own little business with guidance along the way.',
      learn: ['Choosing a product and creating a business name and logo', 'Understanding costs and profit', 'Advertising and selling to customers', 'What Scripture teaches about hard work, honesty and generosity', 'Running their own shop at a final Market Day for the class and parents'],
      climb: [['C', 'Character: honesty and kindness with every customer'], ['L', 'Leadership: the courage to set up shop and welcome customers'], ['I', 'Independent thinking: creativity and problem-solving with their own ideas'], ['M', 'Mastery of life skills: counting costs, pricing and selling'], ['B', 'Building impact: the pride of turning an idea into something real']],
      faith: 'Taught from a Christian worldview, with Scripture woven into every class: kids learn that their talents come from God, and that working hard, dealing honestly and serving customers well honours Him and blesses others. Everyone is welcome.',
      verse: { text: '“Seest thou a man diligent in his business? he shall stand before kings.”', ref: 'Proverbs 22:29 (KJV)' } },
    { slug: 'critical-thinking-debate', name: 'LLA Spot the Spin', ref: 'Spot the Spin', time: '3:30–5:30 pm', ages: '12–18', fw: 'CV', max: 18, dates: DATES_MAR12,
      mentor: 'Drea Humphrey', creds: 'Investigative Journalist · Documentarian · LLA Founder',
      tagline: 'Critical Thinking & Debate for Teens',
      hook: 'Beyond the headlines and the social media spin: teens learn to find what’s true, and stand firm in it.',
      blurb: 'Led by investigative journalist, documentarian and LLA founder Drea Humphrey, teens learn to investigate claims, check sources, recognize bias and build arguments using evidence. An intro-level course: no debate experience needed.',
      learn: ['Investigating claims and checking sources', 'Recognizing bias and spin in the news and on social media', 'Building strong arguments from evidence and debating opposing views with confidence', 'Exposing a misleading claim they’ve identified themselves, and presenting their findings to the class and parents'],
      climb: [['C', 'Character: discernment, and standing firm in their values'], ['L', 'Leadership: speaking with confidence, even when it means standing apart from the crowd'], ['I', 'Independent thinking: resisting peer and mainstream pressure'], ['M', 'Mastery of life skills: research, reasoning, debate and public speaking'], ['B', 'Building impact: engaging differing opinions respectfully, without taking offence']],
      faith: 'Taught in line with LLA’s core values: youth learn to practice discernment, consider differing opinions respectfully without taking offence, and stand firm in their values, even when it means standing apart from the crowd.',
      verse: { text: '“If you look for truth, you may find comfort in the end: if you look for comfort you will not get either comfort or truth.”', ref: 'C. S. Lewis' } }
  ];
  // Staff test: /register/?test adds a $1 test course (the database only accepts it from a staff email).
  if (/[?&]test\b/.test(location.search)) COURSES.push({ slug: 'test-course', name: 'LLA Test Course', ref: 'Test', time: 'test', ages: '5–18', fw: 'CV', max: 100, price: 100, monthly: 100,
    mentor: 'LLA Staff', creds: 'Staff test only', blurb: 'Staff checkout test. Charges $1.', learn: ['Checkout test'] });
  var STEPS = ['details', 'form', 'cart', 'pay'];
  var FAMILY_FIELDS = ['parent_name', 'email', 'phone', 'street_address', 'city', 'province', 'postal_code'];
  var CHILD_FIELDS = ['child_first_name', 'child_last_name', 'child_age'];

  var overlay = document.querySelector('[data-reg-overlay]');
  var dialog = document.querySelector('[data-reg-dialog]');
  if (!overlay || !dialog) return;

  // family: parent details (entered once). items: [{ course: slug, child: {first, last, age, gender} }].
  var state = {
    course: null, step: 'details', errors: {}, busy: false, opener: null, notice: '',
    family: { province: 'BC' }, confirm: { email2: '' }, kidEdit: {}, familyBefore: null, child: {}, childPick: '', items: [], policy_ack: false, referred_by: '', referrer_email: '',
    plan: '', method: '', etransfer_from: '', householdPrior: false, householdKey: '',
    code: '', codePercent: 0, codeCents: 0, codeNotice: '', codeError: '',
    result: null, bot: false,
    // Support needs and funding (payment step). Saved with the order; support@ contacts the family.
    support: false, supportTypes: [], supportNotes: '', fundingSource: '', olSchool: '', bestContact: ''
  };
  var openedAt = Date.now();

  // ------------------------------------------------------------ helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(c) { return '$' + (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2)); }
  function tag(c) { return '<span class="tag tag--' + c.fw.toLowerCase() + '" title="' + (c.fw === 'CW' ? 'Christian worldview' : 'Core values') + '">' + c.fw + '</span>'; }
  function find(slug) { for (var i = 0; i < COURSES.length; i++) if (COURSES[i].slug === slug) return COURSES[i]; return null; }
  function kids() {
    var seen = {}, out = [];
    state.items.forEach(function (it) { var k = (it.child.first + '|' + it.child.last).toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(it.child); } });
    return out;
  }
  function joinNames(list) { return list.length < 2 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }

  // Prices with the family discount: the first course in a new household is full price, every other one is 10% off.
  // A discount code applies to one course (whichever is larger, code or family; never both).
  function priced() {
    var used = false;
    return state.items.map(function (it, i) {
      var pct = state.householdPrior || i > 0 ? 10 : 0, c = find(it.course), p = c.price || PRICE, m = c.monthly || MONTHLY;
      var byCode = !used && state.code && (state.codeCents || state.codePercent > pct), cents = 0;
      if (byCode) { used = true; if (state.codeCents) cents = state.codeCents; else pct = state.codePercent; }
      var full = Math.round(p * (100 - pct) / 100), monthly = Math.round(m * (100 - pct) / 100);
      if (cents) { full = Math.max(full - cents, 100); monthly = Math.max(monthly - Math.round(cents / MONTHS), 100); }   // $ coupon: on top of the family discount
      return { item: it, course: c, discount: pct > 0 && (!byCode || cents > 0), byCode: byCode, cents: cents, pct: pct, full: full, monthly: monthly };
    });
  }
  function totals() {
    var t = { full: 0, monthly: 0 };
    priced().forEach(function (p) { t.full += p.full; t.monthly += p.monthly; });
    return t;
  }

  // Saved on this device so a registration in progress survives leaving the page.
  function persist() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify({ term: TERM, family: state.family, items: state.items,
        policy_ack: state.policy_ack, referred_by: state.referred_by, referrer_email: state.referrer_email, householdPrior: state.householdPrior, householdKey: state.householdKey }));
    } catch (e) {}
    renderBar();
  }
  function restore() {
    try {
      var s = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
      if (!s || s.term !== TERM) return;
      state.family = s.family || state.family;
      state.items = (s.items || []).filter(function (it) { return find(it.course); });
      state.policy_ack = !!s.policy_ack; state.referred_by = s.referred_by || ''; state.referrer_email = s.referrer_email || '';
      state.householdPrior = !!s.householdPrior; state.householdKey = s.householdKey || '';
    } catch (e) {}
  }
  function clearCart() {
    state.items = []; state.code = ''; state.codePercent = 0; state.codeError = ''; state.plan = ''; state.method = ''; state.etransfer_from = '';
    state.support = false; state.supportTypes = []; state.supportNotes = ''; state.fundingSource = ''; state.olSchool = ''; state.bestContact = '';
    try { localStorage.removeItem(CART_KEY); } catch (e) {}
    renderBar();
  }

  // ------------------------------------------------------------ live spot counts
  var spots = {};   // slug -> spots left (unknown until loaded)
  function isFull(c) { return spots[c.slug] === 0; }
  function spotsText(c, sep) {
    var n = spots[c.slug];
    if (n == null) return '';
    if (n === 0) return sep + '<strong style="color:#b3261e">Full</strong>';
    // Counts stay private until a course is nearly full: only 5 or fewer spots left starts the countdown.
    return n <= 5 ? sep + '<strong style="color:var(--gold-dark)">Only ' + n + ' spot' + (n === 1 ? '' : 's') + ' left</strong>' : '';
  }
  function apiHeaders() {
    var key = cfg.supabaseAnonKey, h = { apikey: key, 'Content-Type': 'application/json' };
    if (key.indexOf('eyJ') === 0) h.Authorization = 'Bearer ' + key;
    return h;
  }
  function api(path) { return cfg.supabaseUrl.replace(/\/$/, '') + path; }
  function loadSpots() {
    if (!CONNECTED) return Promise.resolve();
    return fetch(api('/rest/v1/rpc/course_availability'), { method: 'POST', headers: apiHeaders(), body: '{}' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        (rows || []).forEach(function (r) { spots[r.course_id] = Math.max(0, r.spots_left | 0); });
        renderLists();
        if (state.course && state.step === 'details') render();
      })
      .catch(function () {});
  }
  // Has this household (same email + phone) already registered this term? Then every course is 10% off.
  function checkHousehold() {
    var key = (state.family.email || '').toLowerCase() + '|' + (state.family.phone || '').replace(/\D/g, '').slice(-10);
    if (!CONNECTED || key === state.householdKey) return Promise.resolve();
    return fetch(api('/rest/v1/rpc/household_registered'), { method: 'POST', headers: apiHeaders(),
      body: JSON.stringify({ p_email: state.family.email, p_phone: state.family.phone, p_term: TERM }) })
      .then(function (r) { return r.ok ? r.json() : false; })
      .then(function (yes) { state.householdPrior = yes === true; state.householdKey = key; }, function () {});
  }

  // Discount codes are checked by the database (and checked again when the order is made).
  function checkCode(code) {
    return fetch(api('/rest/v1/rpc/discount_check'), { method: 'POST', headers: apiHeaders(),
      body: JSON.stringify({ p_code: code, p_email: state.family.email, p_phone: state.family.phone }) })
      .then(function (r) { if (!r.ok) throw new Error('code'); return r.json(); })
      .then(function (j) {
        if (j.ok) { state.code = j.code; state.codePercent = j.percent || 0; state.codeCents = j.amount_cents || 0; state.codeNotice = j.notice || ''; state.codeError = ''; return true; }
        state.code = ''; state.codePercent = 0;
        state.codeError = j.reason === 'expired' ? 'This code has expired.' : j.reason === 'spent' ? 'This code has already been used.' : j.reason === 'used' ? 'This code is for a family\'s first registration, and your household has already registered.' : 'We don\'t recognize that code. Please check the spelling.';
        return false;
      });
  }
  function applyCode() {
    var el = dialog.querySelector('input[name="discount_code"]'), v = el ? el.value.trim() : '';
    if (!v || state.busy || !CONNECTED) return;
    state.busy = true;
    checkCode(v).catch(function () { state.codeError = 'We couldn\'t check that code. Please try again.'; })
      .then(function () { state.busy = false; render(); });
  }
  function codeNote() { return state.code && state.codeNotice ? '<p class="reg-warn"><strong>NOTE:</strong> ' + esc(state.codeNotice) + '</p>' : ''; }
  function codeBox() {
    if (state.code) return '<p class="reg-note reg-hint">Code <strong>' + esc(state.code) + '</strong> applied: ' + (state.codeCents ? money(state.codeCents) : state.codePercent + '%') + ' off one course. <button type="button" class="reg-link" data-code-remove>Remove</button></p>' + codeNote();
    return '<div class="reg-fields" style="grid-template-columns:1fr auto;align-items:end"><div><label for="reg-discount_code">Discount code</label><input id="reg-discount_code" name="discount_code" type="text" maxlength="40" autocomplete="off" autocapitalize="characters"' + (state.codeError ? ' aria-invalid="true"' : '') + '></div>' +
      '<button type="button" class="btn btn--outline" data-code-apply>Apply</button></div>' + (state.codeError ? '<span class="reg-err" role="alert">' + esc(state.codeError) + '</span>' : '');
  }

  // Optional series lines under a course name (e.g. Jr. Truth Detectives' current adventure).
  function subtitle(c) {
    return (c.tagline ? '<span class="reg-tagline">' + esc(c.tagline) + '</span>' : '') +
      (c.episode ? '<span class="reg-episode">' + esc(c.episode) + '</span>' : '');
  }

  // ------------------------------------------------------------ page lists + "your registration" bar
  function renderLists() {
    var sched = document.querySelector('[data-reg-schedule]');
    var cards = document.querySelector('[data-reg-cards]');
    if (sched) {
      sched.innerHTML = COURSES.map(function (c) {
        return '<li><button type="button" class="reg-row" data-open="' + c.slug + '">' +
          '<span class="reg-row__time">' + esc(c.time) + '</span>' +
          '<span><span class="reg-row__name">' + esc(c.name) + '</span>' + subtitle(c) + '<span class="reg-row__meta">Ages ' + esc(c.ages) + ' · ' + esc(c.mentor) + spotsText(c, ' · ') + '</span></span>' +
          tag(c) + '<span class="reg-row__cta">' + (isFull(c) ? 'Full · Waitlist' : 'Details &amp; Register') + '</span></button></li>';
      }).join('');
    }
    if (cards) {
      var html = COURSES.map(function (c) {
        return '<li data-course-card><button type="button" class="reg-card" data-open="' + c.slug + '" id="' + c.slug + '-card">' +
          '<span class="reg-card__top">' + tag(c) + '<span class="reg-when">Fridays · ' + esc(c.time) + '</span></span>' +
          '<span class="reg-card__name">' + esc(c.name) + '</span>' + subtitle(c) +
          '<span class="reg-card__ages">Ages ' + esc(c.ages) + spotsText(c, ' · ') + '</span>' +
          '<span class="reg-card__blurb">' + esc(c.blurb) + '</span>' +
          '<span class="reg-learn">' + c.learn.map(function (l) { return '<span>' + esc(l) + '</span>'; }).join('') + '</span>' +
          '<span class="reg-mentor"><span class="reg-mentor__label">Your Mentor</span><span class="reg-mentor__name">' + esc(c.mentor) + '</span><span class="reg-mentor__creds">' + esc(c.creds) + '</span></span>' +
          '<span class="reg-card__foot"><span class="reg-price">' + money(c.monthly || MONTHLY) + '<small> per month</small><small class="reg-price__alt">Course runs ' + MONTHS + ' months &middot; ' + money(c.price || PRICE) + ' total</small><small class="reg-price__alt">OL school and Autism Funding accepted</small></span><span class="btn btn--gold">' + (isFull(c) ? 'Full · Join Waitlist' : 'Details &amp; Register') + ' <span aria-hidden="true">→</span></span></span>' +
          '</button></li>';
      }).join('');
      Array.prototype.forEach.call(cards.querySelectorAll('[data-course-card]'), function (li) { li.remove(); });
      cards.insertAdjacentHTML('afterbegin', html);
    }
  }
  var bar = null;
  function renderBar() {
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'reg-bar';
      document.body.appendChild(bar);
    }
    var n = state.items.length;
    bar.hidden = !n || !overlay.hidden;
    if (!n) return;
    bar.innerHTML = '<span><strong>Your registration</strong> · ' + n + ' course' + (n === 1 ? '' : 's') + '</span>' +
      '<button type="button" class="btn btn--gold" data-cart>Continue <span aria-hidden="true">→</span></button>';
  }

  // ------------------------------------------------------------ dialog views
  function head() {
    var c = state.course;
    var idx = STEPS.indexOf(state.step);
    var steps = idx < 0 ? '' : '<ol class="reg-steps" aria-label="Step ' + (idx + 1) + ' of 4">' + STEPS.map(function (s, i) { return '<li class="' + (i <= idx ? 'on' : '') + '"></li>'; }).join('') + '</ol>';
    var title = (state.step === 'details' || state.step === 'form' || state.step === 'full') && c
      ? '<p class="reg-dialog__tags">' + tag(c) + '<span class="reg-when">Fridays · ' + esc(c.time) + ' · Ages ' + esc(c.ages) + '</span></p><h2 id="reg-title">' + esc(c.name) + '</h2>' + subtitle(c)
      : '<h2 id="reg-title">' + ({ cart: 'Your Registration', edit: 'Your Details', pick: 'Add a Course', pay: 'Payment', thanks: 'Thank You', paid: 'Thank You', support: 'Thank You' }[state.step] || 'Register') + '</h2>';
    return '<div class="reg-dialog__head"><div>' + title + '</div>' +
      '<button type="button" class="reg-x" data-close aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      steps;
  }

  function viewDetails() {
    var c = state.course;
    return '<div class="reg-body">' +
      (c.hook ? '<p class="reg-hook">' + esc(c.hook) + '</p>' : '') +
      '<p style="font-size:16.5px">' + esc(c.blurb) + '</p>' +
      '<div><p class="reg-label">What they\'ll learn</p><ul class="reg-points">' + c.learn.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>' +
      (c.climb ? '<div><p class="reg-label">C.L.I.M.B. in action</p><ul class="reg-climb">' + c.climb.map(function (x) { return '<li><b>' + esc(x[0]) + '</b>' + esc(x[1]) + '</li>'; }).join('') + '</ul></div>' : '') +
      (c.faith ? '<div class="reg-faith"><p>' + esc(c.faith) + '</p>' + (c.verse ? '<p class="reg-verse">' + esc(c.verse.text) + ' <cite>' + esc(c.verse.ref) + '</cite></p>' : '') + '</div>' : '') +
      '<div class="reg-mentor"><span class="reg-mentor__label">Your Mentor</span><span class="reg-mentor__name">' + esc(c.mentor) + '</span><span class="reg-mentor__creds">' + esc(c.creds) + '</span></div>' +
      '<div class="reg-details">' +
        '<p><strong>When:</strong> ' + esc(whenOf(c)) + '</p>' +
        '<p><strong>Where:</strong> ' + esc(placeOf(c)) + ' (address emailed once you\'ve paid)</p>' +
        '<p><strong>Class size:</strong> 8–' + c.max + ' learners' + spotsText(c, ' · ') + '</p>' +
      '</div>' +
      '<div class="reg-foot"><div class="reg-cost"><p><span class="reg-price" style="font-size:30px">' + money(MONTHLY) + '<small> per month</small></span></p><p class="reg-price__note">This course runs ' + MONTHS + ' months (8 weeks). Pay ' + money(MONTHLY) + ' a month or in full.</p>' +
        '<p class="reg-note">Pay monthly, or pay in full</p>' +
        '<p class="reg-note">OL school and Autism Funding accepted</p>' +
        '<p class="reg-note"><strong>Family discount:</strong> 10% off each additional course in your household</p></div>' +
      (isFull(c)
        ? '<a class="btn btn--gold" href="/join/">Full · Join the Waitlist <span aria-hidden="true">→</span></a></div>'
        : '<button type="button" class="btn btn--gold" data-go="form">Register Now <span aria-hidden="true">→</span></button></div>') +
      (state.items.length ? '<p class="reg-note" style="text-align:center"><button type="button" class="reg-link" data-go="cart">View your registration (' + state.items.length + ')</button></p>' : '') +
      '</div>';
  }

  function field(group, name, label, type, extra) {
    var err = state.errors[name];
    return '<div><label for="reg-' + name + '">' + label + '</label>' +
      '<input id="reg-' + name + '" name="' + name + '" type="' + type + '" value="' + esc(state[group][name] || '') + '"' + (extra || '') +
      (err ? ' aria-invalid="true" aria-describedby="reg-' + name + '-err"' : '') + '>' +
      (err ? '<span class="reg-err" id="reg-' + name + '-err">' + esc(err) + '</span>' : '') + '</div>';
  }
  function familyDone() {
    var f = state.family;
    return f.parent_name && f.email && f.phone && f.street_address && f.city && f.province && f.postal_code && !state.editFamily;
  }

  // Email checks: common misspellings, then whether the part after @ can receive mail at all.
  // Only that part is looked up. If the lookup itself fails, the family can still continue.
  var EMAIL_TYPOS = { 'gmail.com': 'gmial.com gmai.com gamil.com gmal.com gnail.com gmaill.com gmali.com gmail.co gmail.cm gmail.con gmail.om gmail.ca',
    'hotmail.com': 'hotmial.com hotmai.com hotmal.com hotmil.com hotmail.con hotmail.cm', 'outlook.com': 'outlok.com outloo.com outlook.con outlook.cm',
    'yahoo.com': 'yaho.com yhoo.com yahooo.com yahoo.con yahoo.cm', 'icloud.com': 'icoud.com iclod.com icloud.con icloud.cm', 'telus.net': 'telus.ent telus.con', 'shaw.ca': 'shaw.ac shaw.cq' };
  var domainSeen = {};
  function emailTypo(email) {
    var d = String(email || '').split('@').pop().toLowerCase();
    for (var good in EMAIL_TYPOS) if ((' ' + EMAIL_TYPOS[good] + ' ').indexOf(' ' + d + ' ') >= 0) return good;
    return '';
  }
  function dns(domain, type) {
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 4000);
    return fetch('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=' + type, { signal: ctl.signal })
      .then(function (r) { if (!r.ok) throw new Error('dns'); return r.json(); })
      .then(function (j) { clearTimeout(timer); return j; }, function (e) { clearTimeout(timer); throw e; });
  }
  function emailReachable(email) {
    var d = String(email || '').split('@').pop().toLowerCase();
    if (d in domainSeen) return Promise.resolve(domainSeen[d]);
    return dns(d, 'MX').then(function (j) {
      if (j.Status === 3) return false;
      if (j.Status !== 0) return null;
      var mx = (j.Answer || []).filter(function (a) { return a.type === 15; });
      if (mx.length) return !(mx.length === 1 && /^0 \.$/.test(mx[0].data));
      return dns(d, 'A').then(function (k) { return k.Status === 0 ? (k.Answer || []).some(function (a) { return a.type === 1; }) : null; });
    }).then(function (ok) { if (ok !== null) domainSeen[d] = ok; return ok !== false; }, function () { return true; });
  }
  var BAD_EMAIL = 'Invalid email address. Please check the spelling.';

  function viewForm() {
    var gErr = state.errors.child_gender;
    var ch = state.child;
    var gender = function (v, label) {
      return '<label class="reg-check" style="align-items:center"><input type="radio" name="child_gender" value="' + v + '"' + (ch.child_gender === v ? ' checked' : '') + (gErr ? ' aria-invalid="true"' : '') + '> <span>' + label + '</span></label>';
    };
    var known = kids();
    var f = state.family;
    var picker = known.length
      ? '<div><p class="reg-label">Which child is this for?</p><div class="reg-others">' +
          known.map(function (k, i) {
            return '<button type="button" class="reg-other' + (state.childPick === String(i) ? ' is-on' : '') + '" data-child="' + i + '"><span>' + esc(k.first + ' ' + k.last) + ' <small>· age ' + esc(k.age) + '</small></span><em>' + (state.childPick === String(i) ? 'Selected' : 'Choose') + '</em></button>';
          }).join('') +
          '<button type="button" class="reg-other' + (state.childPick === 'new' ? ' is-on' : '') + '" data-child="new"><span>A different child</span><em>' + (state.childPick === 'new' ? 'Selected' : 'Choose') + '</em></button>' +
        '</div></div>'
      : '';
    var showChildFields = !known.length || state.childPick === 'new';
    return '<form class="reg-body" data-reg-form novalidate>' +
      (familyDone()
        ? '<div class="reg-summary"><p class="reg-label">Parent or guardian</p><p>' + esc(f.parent_name) + ' · ' + esc(f.email) + ' · ' + esc(f.phone) + '</p><button type="button" class="reg-link" data-edit-family>Edit</button></div>'
        : '<p class="reg-note">All fields are required before payment.</p>' +
          '<h3>Parent or guardian</h3>' +
          '<div class="reg-fields">' +
            field('family', 'parent_name', 'Full name', 'text', ' autocomplete="name" required') +
            field('family', 'email', 'Email', 'email', ' autocomplete="email" required') +
            field('confirm', 'email2', 'Confirm email', 'email', ' autocomplete="off" required') +
            field('family', 'phone', 'Cell phone', 'tel', ' autocomplete="tel" required') +
            field('family', 'street_address', 'Street address', 'text', ' autocomplete="street-address" required') +
            field('family', 'city', 'City', 'text', ' autocomplete="address-level2" required') +
            field('family', 'province', 'Province', 'text', ' autocomplete="address-level1" required') +
            field('family', 'postal_code', 'Postal code', 'text', ' autocomplete="postal-code" required') +
          '</div>') +
      '<h3>Your child</h3>' +
      picker +
      (state.errors.child_pick ? '<span class="reg-err">' + esc(state.errors.child_pick) + '</span>' : '') +
      (showChildFields
        ? '<div class="reg-fields">' +
            field('child', 'child_first_name', 'First name', 'text', ' required') +
            field('child', 'child_last_name', 'Last name', 'text', ' required') +
            field('child', 'child_age', 'Age', 'number', ' min="5" max="18" inputmode="numeric" required') +
            '<fieldset style="border:0;margin:0;padding:0"><legend style="font:700 12px/1.4 var(--sans);letter-spacing:.06em;color:var(--navy);margin:0 0 10px;padding:0">Gender</legend>' +
              '<div style="display:flex;gap:22px">' + gender('male', 'Male') + gender('female', 'Female') + '</div>' +
              (gErr ? '<span class="reg-err">' + esc(gErr) + '</span>' : '') +
            '</fieldset>' +
          '</div>'
        : '') +
      (state.items.length ? '' :
        '<div><p class="reg-label">Who referred you? <span style="font-weight:400">(optional)</span></p><div class="reg-fields">' +
          '<div><label for="reg-referred_by">Their name</label><input id="reg-referred_by" name="referred_by" type="text" maxlength="120" value="' + esc(state.referred_by) + '"></div>' +
          '<div><label for="reg-referrer_email">Their email</label><input id="reg-referrer_email" name="referrer_email" type="email" maxlength="200" autocomplete="off" value="' + esc(state.referrer_email) + '"' + (state.errors.referrer_email ? ' aria-invalid="true"' : '') + '>' +
            (state.errors.referrer_email ? '<span class="reg-err">' + esc(state.errors.referrer_email) + '</span>' : '') + '</div></div>' +
          '<span class="reg-note" style="display:block;margin-top:6px">Tell us the family who told you about LLA. If they\'ve registered with LLA, we\'ll email them a $20 coupon for their next course, and we\'ll try to connect your children with families you know.</span></div>') +
      '<div class="reg-hp" aria-hidden="true"><label for="reg-website">Leave this empty</label><input id="reg-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>' +
      (state.policy_ack ? '' :
        '<label class="reg-check"><input type="checkbox" name="policy_ack"' + (state.errors.policy_ack ? ' aria-invalid="true"' : '') + '> <span>I understand that each course needs 8–10 learners to run, and I\'ll get a full refund or transfer if it doesn\'t.</span></label>' +
        (state.errors.policy_ack ? '<span class="reg-err">' + esc(state.errors.policy_ack) + '</span>' : '')) +
      '<p class="reg-note">Please don\'t include health information here. We\'ll send a secure child information form after you register.</p>' +
      '<div class="reg-foot"><button type="button" class="reg-link" data-go="details">← Back</button>' +
      '<button type="submit" class="btn btn--gold"' + (state.busy ? ' disabled aria-busy="true"' : '') + '>Add to Registration <span aria-hidden="true">→</span></button></div>' +
      '</form>';
  }

  function viewCart() {
    var list = priced(), t = totals();
    var anyDisc = list.some(function (p) { return p.discount; });
    return '<div class="reg-body">' +
      (state.notice ? '<p class="reg-warn">' + state.notice + '</p>' : '') +
      (list.length
        ? '<ul class="reg-cart">' + list.map(function (p, i) {
            return '<li><div><strong>' + esc(p.course.name) + '</strong><span>' + esc(p.item.child.first + ' ' + p.item.child.last) + ' · Fridays ' + esc(p.course.time) + '</span></div>' +
              '<div class="reg-cart__price">' + money(p.monthly) + '<small>/month</small>' + (p.byCode ? '<em>' + (p.cents ? money(p.cents) + ' off course with code' : p.pct + '% off with code') + (p.discount ? ' + 10% family discount' : '') + '</em>' : p.discount ? '<em>10% family discount</em>' : '') + '</div>' +
              '<button type="button" class="reg-cart__x" data-remove="' + i + '" aria-label="Remove ' + esc(p.course.name + ' for ' + p.item.child.first) + '">×</button></li>';
          }).join('') + '</ul>' +
          '<p class="reg-cart__total"><span>Total</span><strong>' + money(t.monthly) + '<small>/month for ' + MONTHS + ' months</small></strong></p>' +
          (anyDisc ? '<p class="reg-note reg-hint">Your family discount is included: 10% off ' + (state.householdPrior ? 'every course, since your household already registered this term.' : 'each additional course.') + '</p>' : '<p class="reg-note">Adding another course for any child in your household? It\'s 10% off.</p>')
        : '<p>Your registration is empty.</p>') +
      (list.length ? codeBox() : '') +
      '<div class="reg-foot"><button type="button" class="btn btn--outline" data-go="pick">+ Add another course</button>' +
        (list.length ? '<button type="button" class="btn btn--gold" data-go="pay">Continue to Payment <span aria-hidden="true">→</span></button>' : '') + '</div>' +
      (list.length ? '<p><button type="button" class="reg-link" data-go="edit">← Back to edit your details</button></p>' : '') +
      '</div>';
  }

  // "← Back" from the cart: everything the family typed, ready to correct.
  function viewEdit() {
    var list = kids();
    return '<form class="reg-body" data-edit-form novalidate>' +
      '<p class="reg-note">Change anything that isn\'t right, then save.</p>' +
      '<h3>Parent or guardian</h3><div class="reg-fields">' +
        field('family', 'parent_name', 'Full name', 'text', ' autocomplete="name" required') +
        field('family', 'email', 'Email', 'email', ' autocomplete="email" required') +
        field('confirm', 'email2', 'Confirm email', 'email', ' autocomplete="off" required') +
        field('family', 'phone', 'Cell phone', 'tel', ' autocomplete="tel" required') +
        field('family', 'street_address', 'Street address', 'text', ' autocomplete="street-address" required') +
        field('family', 'city', 'City', 'text', ' autocomplete="address-level2" required') +
        field('family', 'province', 'Province', 'text', ' autocomplete="address-level1" required') +
        field('family', 'postal_code', 'Postal code', 'text', ' autocomplete="postal-code" required') +
      '</div>' +
      list.map(function (k, i) {
        var g = state.kidEdit['kid' + i + '_gender'];
        var opt = function (v, label) { return '<label class="reg-check" style="align-items:center"><input type="radio" name="kid' + i + '_gender" value="' + v + '"' + (g === v ? ' checked' : '') + '> <span>' + label + '</span></label>'; };
        return '<h3>' + (list.length > 1 ? 'Child ' + (i + 1) : 'Your child') + '</h3><div class="reg-fields">' +
          field('kidEdit', 'kid' + i + '_first', 'First name', 'text', ' required') +
          field('kidEdit', 'kid' + i + '_last', 'Last name', 'text', ' required') +
          field('kidEdit', 'kid' + i + '_age', 'Age', 'number', ' min="5" max="18" inputmode="numeric" required') +
          '<fieldset style="border:0;margin:0;padding:0"><legend style="font:700 12px/1.4 var(--sans);letter-spacing:.06em;color:var(--navy);margin:0 0 10px;padding:0">Gender</legend>' +
            '<div style="display:flex;gap:22px">' + opt('male', 'Male') + opt('female', 'Female') + '</div></fieldset>' +
        '</div>';
      }).join('') +
      '<div class="reg-foot"><button type="button" class="reg-link" data-go="pick">← Back to courses</button>' +
      '<button type="submit" class="btn btn--gold"' + (state.busy ? ' disabled aria-busy="true"' : '') + '>Save &amp; Continue <span aria-hidden="true">→</span></button></div>' +
      '</form>';
  }
  function startEdit() {
    state.kidEdit = {}; state.familyBefore = {}; state.confirm.email2 = state.family.email || '';
    FAMILY_FIELDS.forEach(function (n) { state.familyBefore[n] = state.family[n]; });
    kids().forEach(function (k, i) {
      state.kidEdit['kid' + i + '_first'] = k.first; state.kidEdit['kid' + i + '_last'] = k.last;
      state.kidEdit['kid' + i + '_age'] = k.age; state.kidEdit['kid' + i + '_gender'] = k.gender;
    });
  }
  function saveEdit(form) {
    var e = {}, ed = state.kidEdit, list = kids(), names = {};
    FAMILY_FIELDS.forEach(function (n) { state.family[n] = form.elements[n].value.trim(); });
    state.confirm.email2 = form.elements.email2.value.trim();
    list.forEach(function (k, i) {
      ['first', 'last', 'age'].forEach(function (n) { ed['kid' + i + '_' + n] = form.elements['kid' + i + '_' + n].value.trim(); });
      var g = form.querySelector('input[name="kid' + i + '_gender"]:checked');
      if (g) ed['kid' + i + '_gender'] = g.value;
    });
    validateFamily(e, true);
    list.forEach(function (k, i) {
      var first = ed['kid' + i + '_first'], last = ed['kid' + i + '_last'], age = parseInt(ed['kid' + i + '_age'], 10);
      var key = (first + '|' + last).toLowerCase();
      if (!first) e['kid' + i + '_first'] = 'Please enter your child\'s first name.';
      else if (names[key]) e['kid' + i + '_first'] = 'Two children have the same name.';
      if (!last) e['kid' + i + '_last'] = 'Please enter your child\'s last name.';
      if (!(age >= 5 && age <= 18)) e['kid' + i + '_age'] = 'Please enter an age from 5 to 18.';
      names[key] = 1;
    });
    state.errors = e;
    if (Object.keys(e).length) { render('[name="' + Object.keys(e)[0] + '"]'); return; }
    state.busy = true; render();
    emailReachable(state.family.email).then(function (ok) {
      state.busy = false;
      if (!ok) { state.errors = { email: BAD_EMAIL }; render('[name="email"]'); return; }
      applyEdit(list, ed);
    });
  }
  function applyEdit(list, ed) {
    var map = {};
    list.forEach(function (k, i) {
      map[(k.first + '|' + k.last).toLowerCase()] = { first: ed['kid' + i + '_first'], last: ed['kid' + i + '_last'], age: parseInt(ed['kid' + i + '_age'], 10), gender: ed['kid' + i + '_gender'] };
    });
    state.items.forEach(function (it) { it.child = map[(it.child.first + '|' + it.child.last).toLowerCase()]; });
    state.familyBefore = null; state.etransfer_from = '';
    persist();
    state.busy = true; render();
    checkHousehold().then(function () { state.busy = false; persist(); state.step = 'cart'; render(); });
  }

  function viewPick() {
    return '<div class="reg-body"><p class="reg-note">Choose a course, then tell us which child it\'s for.</p><div class="reg-others">' +
      COURSES.map(function (o) {
        return '<button type="button" class="reg-other" data-open="' + o.slug + '"' + (isFull(o) ? ' disabled' : '') + '><span>' + esc(o.name) + ' <small>· Ages ' + esc(o.ages) + ' · ' + esc(o.time) + (isFull(o) ? ' · Full' : '') + '</small></span><em>' + (isFull(o) ? 'Full' : 'View →') + '</em></button>';
      }).join('') + '</div>' +
      '<div class="reg-foot"><button type="button" class="reg-link" data-go="cart">← Back to your registration</button></div></div>';
  }

  // Payment screen options: a highlighted choice plus a short line explaining it.
  function seg(name, v, title, sub) {
    var on = state[name] === v;
    return '<label class="reg-seg__opt' + (on ? ' is-on' : '') + '"><input type="radio" name="' + name + '" value="' + v + '"' + (on ? ' checked' : '') + '><span><b>' + title + '</b><small>' + sub + '</small></span></label>';
  }

  // Support needs and funding: a short section at the top of the payment step.
  var FUNDING = [['self-pay', 'I\'ll pay myself', 'by card or e-Transfer, below'], ['ol-school', 'OL school learning funds', 'online learning school'],
    ['autism-funding', 'Autism Funding', 'BC government funding'], ['other', 'Other funding', '']];
  var SUPPORT_TYPES = [['autism', 'Autism (ASD)'], ['adhd', 'ADHD or attention'], ['learning', 'Learning disability'], ['developmental', 'Developmental or intellectual disability'],
    ['physical', 'Physical disability or mobility'], ['sensory-communication', 'Hearing, vision or communication'], ['behavioural-emotional', 'Behavioural, social or emotional'], ['other', 'Other']];
  function funded() { return state.support && state.fundingSource && state.fundingSource !== 'self-pay'; }
  function supportBox() {
    var e = state.errors;
    var html = '<div class="reg-support">' +
      '<label class="reg-check"><input type="checkbox" name="support"' + (state.support ? ' checked' : '') + '> <span><strong>My child has a disability or additional support needs.</strong> Help us plan for them.</span></label>' +
      '<p class="reg-note" style="margin:0 0 0 30px">Allergies or medical needs only? No need to tick this. We\'ll ask about those on the child information form after you register.</p>';
    if (!state.support) return html + '</div>';
    return html +
      '<p class="reg-note">Students with disabilities and additional support needs are welcome at LLA. A few quick questions help us plan the right support and, if you\'re using funding, help you get it in place. Your answers are private.</p>' +
      '<p class="reg-label" style="margin:8px 0 10px">What type of support need? <span style="font-weight:400">(choose all that apply)</span></p>' +
      '<div class="reg-types">' + SUPPORT_TYPES.map(function (t) {
        return '<label class="reg-check"><input type="checkbox" name="support_type" value="' + t[0] + '"' + (state.supportTypes.indexOf(t[0]) >= 0 ? ' checked' : '') + (e.support_type ? ' aria-invalid="true"' : '') + '> <span>' + t[1] + '</span></label>';
      }).join('') + '</div>' +
      (e.support_type ? '<span class="reg-err" role="alert">' + esc(e.support_type) + '</span>' : '') +
      '<div class="reg-fields" style="grid-template-columns:1fr;margin-top:8px">' +
        '<div><label for="reg-support_notes">In a few words, what helps your child do well in a group? <span style="font-weight:400">(optional)</span></label>' +
          '<textarea id="reg-support_notes" name="support_notes" rows="3" maxlength="600">' + esc(state.supportNotes) + '</textarea>' +
          '<span class="reg-note" style="display:block;margin-top:6px">No medical details needed here. We\'ll talk about the rest by phone.</span></div>' +
      '</div>' +
      '<p class="reg-label" style="margin:12px 0 10px">How are you planning to pay?</p>' +
      '<div class="reg-seg reg-seg--stack">' + FUNDING.map(function (f) { return seg('fundingSource', f[0], f[1], f[2]); }).join('') + '</div>' +
      (e.fundingSource ? '<span class="reg-err" role="alert">' + esc(e.fundingSource) + '</span>' : '') +
      '<div class="reg-fields" style="grid-template-columns:1fr;margin-top:12px">' +
        (state.fundingSource === 'ol-school' ? '<div><label for="reg-ol_school">OL school name <span style="font-weight:400">(optional)</span></label><input id="reg-ol_school" name="ol_school" type="text" maxlength="120" value="' + esc(state.olSchool) + '"></div>' : '') +
        '<div><label for="reg-best_contact">Best way and time to reach you</label>' +
          '<input id="reg-best_contact" name="best_contact" type="text" maxlength="200" placeholder="e.g. Text, weekday evenings" value="' + esc(state.bestContact) + '"' + (e.best_contact ? ' aria-invalid="true"' : '') + '>' +
          (e.best_contact ? '<span class="reg-err" role="alert">' + esc(e.best_contact) + '</span>' : '<span class="reg-note" style="display:block;margin-top:6px">Phone, text or email, and the days and times that work best.</span>') + '</div>' +
      '</div></div>';
  }

  function viewPay() {
    var t = totals(), busy = state.busy ? ' disabled aria-busy="true"' : '';
    var n = state.items.length;
    var action = '';
    if (funded()) {
      action = '<button type="button" class="btn btn--gold" data-checkout' + busy + '>' + (state.busy ? 'Saving…' : 'Submit &amp; Hold My Spot' + (n === 1 ? '' : 's') + ' <span aria-hidden="true">→</span>') + '</button>' +
        '<p class="reg-note">No payment today. ' + (n === 1 ? 'Your spot is' : 'Your spots are') + ' held while our support team contacts you about support and funding.</p>';
    } else if (state.plan && state.method === 'card') {
      action = '<button type="button" class="btn btn--gold" data-checkout' + busy + '>' + (state.busy ? 'Opening secure checkout…' : 'Continue to Secure Checkout <span aria-hidden="true">→</span>') + '</button>' +
        '<p class="reg-note">Pay by debit or credit card through Square\'s secure checkout.</p>';
    } else if (state.plan === 'full' && state.method === 'etransfer') {
      action = '<div class="reg-fields" style="grid-template-columns:1fr"><div><label for="reg-etransfer_from">Email you\'ll send the e-Transfer from</label>' +
          '<input id="reg-etransfer_from" name="etransfer_from" type="email" maxlength="200" autocomplete="email" value="' + esc(state.etransfer_from || state.family.email || '') + '"' + (state.errors.etransfer_from ? ' aria-invalid="true"' : '') + '>' +
          (state.errors.etransfer_from ? '<span class="reg-err">' + esc(state.errors.etransfer_from) + '</span>' : '<span class="reg-note" style="display:block;margin-top:6px">So we can match your payment and reach you if needed.</span>') + '</div></div>' +
        '<button type="button" class="btn btn--gold" data-checkout' + busy + '>Complete Registration <span aria-hidden="true">→</span></button>' +
        '<p class="reg-note">Next, we\'ll show you exactly what to send. ' + (n === 1 ? 'Your spot is' : 'Your spots are') + ' held for 12 hours while we wait for payment.</p>';
    }
    return '<div class="reg-body">' +
      (state.notice ? '<p class="reg-warn">' + state.notice + '</p>' : '') +
      supportBox() +
      (funded() ? '' : '<div class="reg-paybox">' +
        '<div class="reg-seg">' +
          seg('plan', 'monthly', 'Pay monthly', money(t.monthly) + '/month for ' + MONTHS + ' months') +
          seg('plan', 'full', 'Pay in full', 'one payment') +
        '</div>' +
        codeNote() +
        (state.plan === 'monthly' ? '<p class="reg-note reg-hint">' + money(t.monthly) + ' today and ' + money(t.monthly) + ' one month later, charged to the same card. Then it ends automatically.</p>' : '') +
        (state.plan === 'full' ? '<p class="reg-note reg-hint">One payment of ' + money(t.full) + ' for the full term' + (priced().some(function (p) { return p.byCode; }) ? ', including your discount code' : '') + '.</p>' +
            '<p class="reg-label" style="margin:6px 0 10px">Pay by</p>' +
            '<div class="reg-seg">' +
              seg('method', 'etransfer', 'e-Transfer', '<span class="reg-pill">Preferred · No fees</span>') +
              seg('method', 'card', 'Debit or credit card', 'through Square') +
            '</div>' +
            (state.method === 'etransfer' ? '<p class="reg-note reg-hint">Preferred: there are no card fees, so more of your payment goes to your child\'s learning.</p>' : '')
          : '') +
      '</div>') +
      action +
      '<p class="reg-note reg-fine">By registering, you agree to our <a href="/terms/#registration" target="_blank" rel="noopener">Registration Terms</a> and <a href="/privacy/" target="_blank" rel="noopener">Privacy Policy</a>.</p>' +
      '<div class="reg-foot"><button type="button" class="reg-link" data-go="cart">← Back</button></div>' +
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

  function closing() {
    return '<p class="reg-note" style="text-align:center"><strong>Know a family who would love LLA?</strong> You get $20 off your next course or program if they enter your name and email address in the referral box when they register for a course.</p>' +
      '<div class="reg-more"><a class="btn btn--outline" href="/donate/">Donate to LLA</a><button type="button" class="btn btn--outline" data-go="pick">Register Another Child</button></div>';
  }

  // e-Transfer: registered; here's what to send (also emailed).
  function viewThanks() {
    var r = state.result || {};
    var names = joinNames((r.kids || []));
    return '<div class="reg-body">' +
      (r.saveFailed ? '<p class="reg-warn">We couldn\'t save your registration automatically. Please email your name, phone and your child\'s name, age and course to <a href="mailto:' + esc(CONTACT) + '">' + esc(CONTACT) + '</a> so we can hold your spot.</p>' : '') +
      '<div class="reg-thanks"><p class="eyebrow" style="margin:0 0 8px">Almost Done</p>' +
        '<h3>' + (names ? esc(names) + (r.kids.length > 1 ? ' are' : ' is') + ' registered!' : 'You\'re registered!') + '</h3>' +
        '<p style="color:var(--muted)">Send your e-Transfer to finish. ' + (r.count > 1 ? 'Your spots are' : 'Your spot is') + ' held for 12 hours while we wait for payment.</p></div>' +
      (r.total ? '<div class="reg-paycard"><p class="reg-label">Send your e-Transfer</p><div class="reg-kv">' +
          '<p><span>Amount</span><strong>' + money(r.total) + ' <small style="font-weight:400">for the full term' + (r.code ? ', with code ' + esc(r.code) : '') + (r.discount ? (r.code ? ' and' : ', with') + ' your family discount' : '') + '</small>' + '</strong></p>' +
          '<p><span>To</span><strong>' + esc(r.to || ETRANSFER_EMAIL) + '</strong></p>' +
          '<p><span>Message</span><strong>' + esc(r.message || '') + '</strong></p>' +
        '</div><p class="reg-note">We\'ve emailed you these details too. Once your e-Transfer arrives, we\'ll email a thank-you with the address. More details will follow before the first class.</p></div>' : '') +
      (r.support ? '<p class="reg-note reg-hint">Thank you for telling us about your child\'s support needs. Our support team will contact you at the time you chose.</p>' : '') +
      (names ? '<p style="text-align:center">Our mentors look forward to helping ' + esc(names) + ' build confidence, character and real-world skills!</p>' : '') +
      closing() +
      '</div>';
  }

  // Support needs + funding: registered, spot held, we'll call.
  function viewSupport() {
    var r = state.result || {};
    var names = joinNames(r.kids || []);
    return '<div class="reg-body">' +
      '<div class="reg-thanks"><p class="eyebrow" style="margin:0 0 8px">Thank You</p>' +
        '<h3>We\'ve received ' + (names ? esc(names) + '\'s registration' : 'your registration') + '!</h3>' +
        '<p style="color:var(--muted)">Because you told us your child has a disability or additional support needs, someone from our support team will contact you at the time you chose to talk about what helps your child do well, whether a support worker would help, your child\'s IEP goals if they have one, and the next steps for funding.</p></div>' +
      '<div class="reg-paycard"><p class="reg-label">Your ' + (r.count > 1 ? 'spots are' : 'spot is') + ' held while we connect</p>' +
        '<p class="reg-note" style="margin:0">If we can\'t reach you within 48 hours of our first try, the spot will be released. You can always email <a href="mailto:support@livinglearningacademy.com">support@livinglearningacademy.com</a> to set up a call and rejoin if spots are still available. We\'ve emailed you these details too.</p></div>' +
      closing() +
      '</div>';
  }

  // Card: back from Square.
  function viewPaid() {
    return '<div class="reg-body">' +
      '<div class="reg-thanks"><p class="eyebrow" style="margin:0 0 8px">Thank You</p>' +
        '<h3>Your payment is complete!</h3>' +
        '<p style="color:var(--muted)">You\'ll get a confirmation email in a few minutes with the address. More details will follow. Our skilled mentors look forward to meeting your family!</p></div>' +
      closing() +
      '</div>';
  }

  function render(focusSelector) {
    var views = { details: viewDetails, form: viewForm, cart: viewCart, edit: viewEdit, pick: viewPick, pay: viewPay, thanks: viewThanks, paid: viewPaid, support: viewSupport, full: viewFull };
    dialog.innerHTML = head() + views[state.step]();
    var target = focusSelector && dialog.querySelector(focusSelector);
    (target || dialog).focus();
    overlay.scrollTop = 0;
  }

  // ------------------------------------------------------------ open / close
  function show() {
    overlay.hidden = false;
    document.body.classList.add('reg-lock');
    renderBar();
  }
  function open(slug, opener) {
    var c = find(slug);
    if (!c) return;
    if (overlay.hidden) state.opener = opener || document.activeElement;
    state.course = c; state.step = 'details'; state.errors = {}; state.notice = '';
    show();
    try { history.replaceState(null, '', '#' + slug); } catch (e) {}
    render();
  }
  function openStep(step, opener) {
    if (overlay.hidden) state.opener = opener || document.activeElement;
    state.step = step; state.errors = {}; state.notice = '';
    show();
    render();
  }
  function close() {
    if (state.familyBefore) { state.family = state.familyBefore; state.familyBefore = null; }
    if (state.step === 'edit') state.step = 'cart';
    overlay.hidden = true;
    document.body.classList.remove('reg-lock');
    state.course = null;
    if (state.step === 'thanks' || state.step === 'paid' || state.step === 'support') state.step = 'details';
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    if (state.opener && state.opener.focus) state.opener.focus();
    state.opener = null;
    renderBar();
  }
  function go(step) {
    state.errors = {}; if (step !== 'cart' && step !== 'pay') state.notice = '';
    if (step === 'form') { state.child = {}; state.childPick = ''; state.editFamily = false; }
    if (state.step === 'edit' && state.familyBefore) { state.family = state.familyBefore; state.familyBefore = null; }   // left without saving
    if (step === 'edit') startEdit();
    state.step = step;
    render(step === 'form' ? 'input:not([type=hidden]):not([tabindex="-1"])' : null);
  }

  // ------------------------------------------------------------ form -> add to cart
  function readForm(form) {
    if (form.elements.email2) state.confirm.email2 = form.elements.email2.value.trim();
    FAMILY_FIELDS.forEach(function (n) { if (form.elements[n]) state.family[n] = form.elements[n].value.trim(); });
    CHILD_FIELDS.forEach(function (n) { if (form.elements[n]) state.child[n] = form.elements[n].value.trim(); });
    var g = form.querySelector('input[name="child_gender"]:checked');
    if (g) state.child.child_gender = g.value;
    if (form.elements.referred_by) state.referred_by = form.elements.referred_by.value.trim();
    if (form.elements.referrer_email) state.referrer_email = form.elements.referrer_email.value.trim();
    if (form.elements.policy_ack) state.policy_ack = form.elements.policy_ack.checked;
  }
  function validateFamily(e, confirming) {
    var f = state.family;
    if (!f.parent_name) e.parent_name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email || '')) e.email = BAD_EMAIL;
    else if (emailTypo(f.email)) e.email = 'Invalid email address. Did you mean ' + emailTypo(f.email) + '?';
    if (confirming && (f.email || '').toLowerCase() !== (state.confirm.email2 || '').toLowerCase()) e.email2 = 'The two email addresses don\'t match.';
    if ((f.phone || '').replace(/\D/g, '').length < 10) e.phone = 'Please enter a 10-digit phone number.';
    if (!f.street_address) e.street_address = 'Please enter your street address.';
    if (!f.city) e.city = 'Please enter your city.';
    if (!f.province) e.province = 'Please enter your province.';
    if (!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(f.postal_code || '')) e.postal_code = 'Please enter a postal code like V1M 0B2.';
  }
  function validate() {
    var ch = state.child, e = {};
    validateFamily(e, !familyDone());
    if (Object.keys(e).length) state.editFamily = true;
    var known = kids();
    if (known.length && !state.childPick) { e.child_pick = 'Please choose which child this course is for.'; return e; }
    if (!known.length || state.childPick === 'new') {
      if (!ch.child_first_name) e.child_first_name = 'Please enter your child\'s first name.';
      if (!ch.child_last_name) e.child_last_name = 'Please enter your child\'s last name.';
      var age = parseInt(ch.child_age, 10);
      if (!(age >= 5 && age <= 18)) e.child_age = 'Please enter an age from 5 to 18.';
      if (ch.child_gender !== 'male' && ch.child_gender !== 'female') e.child_gender = 'Please choose male or female.';
    }
    if (state.referrer_email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.referrer_email)) e.referrer_email = BAD_EMAIL;
      else if (emailTypo(state.referrer_email)) e.referrer_email = 'Invalid email address. Did you mean ' + emailTypo(state.referrer_email) + '?';
      else if (state.referrer_email.toLowerCase() === (state.family.email || '').toLowerCase()) e.referrer_email = 'Please enter the other family\'s email, not yours.';
    }
    if (!state.policy_ack) e.policy_ack = 'Please confirm you understand the minimum class size.';
    return e;
  }
  function submit(form) {
    if (form.elements.email) state.editFamily = true;   // still filling in the parent's details
    readForm(form);
    state.errors = validate();
    if (Object.keys(state.errors).length) {
      var first = Object.keys(state.errors)[0];
      render('[name="' + first + '"], [data-child]');
      return;
    }
    state.bot = state.bot || Boolean(form.elements.website.value) || Date.now() - openedAt < 2500;
    state.busy = true; render();
    emailReachable(state.family.email).then(function (ok) {
      state.busy = false;
      if (!ok) { state.errors = { email: BAD_EMAIL }; state.editFamily = true; render('[name="email"]'); return; }
      addToCart();
    });
  }
  function addToCart() {
    var known = kids();
    var child = known.length && state.childPick !== 'new'
      ? known[parseInt(state.childPick, 10)]
      : { first: state.child.child_first_name, last: state.child.child_last_name, age: parseInt(state.child.child_age, 10), gender: state.child.child_gender };
    var c = state.course;
    var dupe = state.items.some(function (it) { return it.course === c.slug && it.child.first.toLowerCase() === child.first.toLowerCase() && it.child.last.toLowerCase() === child.last.toLowerCase(); });
    state.notice = dupe ? esc(child.first) + ' is already registered for ' + esc(c.name) + '.' : '';
    if (!dupe) state.items.push({ course: c.slug, child: child });
    state.editFamily = false;
    persist();
    state.busy = true; render();
    checkHousehold().then(function () { state.busy = false; persist(); state.step = 'cart'; render(); });
  }

  // ------------------------------------------------------------ checkout
  function readSupport() {
    var el = function (n) { return dialog.querySelector('[name="' + n + '"]'); };
    if (el('support_notes')) state.supportNotes = el('support_notes').value.trim();
    if (el('ol_school')) state.olSchool = el('ol_school').value.trim();
    if (el('best_contact')) state.bestContact = el('best_contact').value.trim();
    if (el('support_type')) state.supportTypes = Array.prototype.map.call(dialog.querySelectorAll('input[name="support_type"]:checked'), function (x) { return x.value; });
  }
  function checkout() {
    readSupport();
    var isFunded = funded();
    if (state.busy || !state.items.length || (!isFunded && (!state.plan || !state.method))) return;
    state.errors = {}; state.notice = '';
    if (state.support) {
      if (!state.supportTypes.length) state.errors.support_type = 'Please choose at least one type of support need.';
      if (!state.fundingSource) state.errors.fundingSource = 'Please choose how you\'re planning to pay.';
      if (state.bestContact.length < 3) state.errors.best_contact = 'Please tell us the best way and time to reach you.';
      if (Object.keys(state.errors).length) { render(state.errors.support_type ? 'input[name="support_type"]' : state.errors.fundingSource ? 'input[name="fundingSource"]' : 'input[name="best_contact"]'); return; }
    }
    if (!isFunded && state.method === 'etransfer') {
      var ef = dialog.querySelector('input[name="etransfer_from"]');
      state.etransfer_from = ef ? ef.value.trim() : state.family.email;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.etransfer_from)) { state.errors.etransfer_from = 'Please enter the email you\'ll send the e-Transfer from.'; render('input[name="etransfer_from"]'); return; }
    }
    var list = priced();
    var summary = { kids: kids().map(function (k) { return k.first; }), count: list.length, total: totals().full, support: state.support,
      discount: list.some(function (p) { return p.discount; }), to: ETRANSFER_EMAIL,
      message: list.map(function (p) { return (p.course.ref || p.course.name) + ' ' + p.item.child.first; }).join(', ') };
    if (state.bot) { state.result = summary; clearCart(); state.step = isFunded ? 'support' : state.method === 'card' ? 'paid' : 'thanks'; render(); return; }
    if (!CONNECTED) {
      state.notice = 'Online checkout isn\'t available right now. Please email <a href="mailto:' + esc(CONTACT) + '">' + esc(CONTACT) + '</a> and we\'ll register you.';
      render(); return;
    }
    var f = state.family;
    var body = {
      method: isFunded ? 'funding' : state.method, plan: isFunded ? 'full' : state.plan, policy_ack: true, source: location.pathname.slice(0, 40),
      support: state.support ? { needs: true, types: state.supportTypes, funding_source: state.fundingSource, ol_school: state.fundingSource === 'ol-school' ? state.olSchool : '',
        notes: state.supportNotes, best_contact: state.bestContact } : { needs: false },
      referred_by: state.referred_by, referrer_email: state.referrer_email, discount_code: priced().some(function (p) { return p.byCode; }) ? state.code : '', etransfer_from: !isFunded && state.method === 'etransfer' ? state.etransfer_from : '',
      family: { parent_name: f.parent_name, email: f.email, phone: f.phone, street_address: f.street_address, city: f.city, province: f.province, postal_code: f.postal_code },
      items: state.items.map(function (it) {
        return { course_id: it.course, child_first_name: it.child.first, child_last_name: it.child.last, child_age: it.child.age, child_gender: it.child.gender };
      })
    };
    state.busy = true; render();
    // Re-check the code first, so nobody pays a different amount than the one they saw.
    (state.code ? checkCode(state.code) : Promise.resolve(true)).then(function (valid) {
      if (!valid) { state.busy = false; state.notice = esc(state.codeError) + ' Your total has been updated.'; state.step = 'cart'; render(); return; }
      send(body, summary);
    }).catch(function () { state.busy = false; state.notice = 'We couldn\'t check your discount code. Please try again.'; render(); });
  }
  function send(body, summary) {
    fetch(api('/functions/v1/checkout'), { method: 'POST', headers: apiHeaders(), body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        var j = res.j || {};
        if (res.ok && j.checkout_url) { location.href = j.checkout_url; return; }   // card: Square, then back to ?order=
        state.busy = false;
        if (res.ok && j.method === 'funding') {
          state.result = summary; clearCart(); loadSpots();
          state.step = 'support'; render(); return;
        }
        if (res.ok && j.method === 'etransfer') {
          summary.total = j.total_cents; summary.message = j.etransfer_message; summary.to = j.etransfer_to || ETRANSFER_EMAIL;
          summary.discount = (j.items || []).some(function (i) { return i.family_discount; });
          summary.code = ((j.items || []).filter(function (i) { return i.discount_code; })[0] || {}).discount_code || '';
          state.result = summary; clearCart(); loadSpots();
          state.step = 'thanks'; render(); return;
        }
        if (j.error === 'course_full') {
          var c = find(j.course_id);
          spots[j.course_id] = 0; renderLists();
          state.items = state.items.filter(function (it) { return it.course !== j.course_id; });
          persist();
          state.notice = 'Sorry, ' + esc(c ? c.name : 'one course') + ' just filled up, so we took it out of your registration. Please review and continue, or <a href="/join/">join the waitlist</a>.';
          state.step = 'cart'; render(); return;
        }
        state.notice = 'Something went wrong starting your checkout. Please press the <button type="button" class="reg-link" data-go="edit">Back</button> button to confirm your information was entered correctly, then try again. If it still doesn\'t work, email <a href="mailto:' + esc(CONTACT) + '">' + esc(CONTACT) + '</a>.';
        render();
      })
      .catch(function () {
        state.busy = false;
        state.notice = 'We couldn\'t reach our checkout. Please check your connection and try again, or email <a href="mailto:' + esc(CONTACT) + '">' + esc(CONTACT) + '</a>.';
        render();
      });
  }

  // ------------------------------------------------------------ events
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open]');
    if (t && !t.disabled) { e.preventDefault(); open(t.getAttribute('data-open'), t); return; }
    if (e.target.closest('[data-cart]')) { openStep('cart', e.target.closest('[data-cart]')); return; }
    if (overlay.hidden) return;
    if (e.target === overlay || e.target.closest('[data-close]')) { close(); return; }
    if (e.target.closest('[data-checkout]')) { checkout(); return; }
    if (e.target.closest('[data-code-apply]')) { applyCode(); return; }
    if (e.target.closest('[data-code-remove]')) { state.code = ''; state.codePercent = 0; state.codeError = ''; render(); return; }
    var rm = e.target.closest('[data-remove]');
    if (rm) { state.items.splice(parseInt(rm.getAttribute('data-remove'), 10), 1); state.notice = ''; persist(); render(); return; }
    var ch = e.target.closest('[data-child]');
    if (ch) {
      var form = dialog.querySelector('[data-reg-form]');
      if (form) readForm(form);
      state.childPick = ch.getAttribute('data-child'); delete state.errors.child_pick;
      render(state.childPick === 'new' ? 'input[name="child_first_name"]' : '[data-child="' + state.childPick + '"]'); return;
    }
    if (e.target.closest('[data-edit-family]')) {
      var fm = dialog.querySelector('[data-reg-form]');
      if (fm) readForm(fm);
      state.editFamily = true; render('input[name="parent_name"]'); return;
    }
    var g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); go(g.getAttribute('data-go')); }
  });
  // Payment screen: picking an option redraws it (Pay in full adds e-Transfer / card).
  dialog.addEventListener('change', function (e) {
    var r = e.target;
    if (r.name === 'support' || r.name === 'fundingSource') {
      readSupport();
      if (r.name === 'support') state.support = r.checked; else state.fundingSource = r.value;
      delete state.errors.fundingSource;
      var keep = overlay.scrollTop;
      render('input[name="' + r.name + '"]' + (r.name === 'support' ? '' : ':checked'));
      overlay.scrollTop = keep;
      return;
    }
    if (r.type !== 'radio' || (r.name !== 'plan' && r.name !== 'method')) return;
    readSupport();
    state[r.name] = r.value;
    if (r.name === 'plan') state.method = r.value === 'monthly' ? 'card' : '';
    var top = overlay.scrollTop;
    render('input[name="' + r.name + '"]:checked');
    overlay.scrollTop = top;
  });
  dialog.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-reg-form]');
    if (form) { e.preventDefault(); if (!state.busy) submit(form); }
    var ef = e.target.closest('[data-edit-form]');
    if (ef) { e.preventDefault(); if (!state.busy) saveEdit(ef); }
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

  restore();
  renderLists();
  renderBar();
  loadSpots();
  // Back from Square's checkout: /register/?order=...
  var params = new URLSearchParams(location.search);
  if (params.get('order')) {
    clearCart();
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    openStep('paid');
  } else {
    // Deep links for QR codes and posts: /register/#truth-hunters opens that course.
    var slug = location.hash.replace('#', '');
    if (find(slug)) open(slug);
  }
})();
