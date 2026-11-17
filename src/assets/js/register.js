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
      faith: 'Taught from a Christian worldview: students are reminded that their gifts and talents come from God, and learn to use them to glorify Him and bless those around them. Everyone is welcome.',
      verse: { text: '“Worship the Lord with gladness; come before him with joyful songs.”', ref: 'Psalm 100:2 (NIV)' } },
    { slug: 'truth-hunters', name: 'LLA Jr. Truth Detectives', ref: 'Truth Detectives', time: '12–2 pm', ages: '6–11', fw: 'CW', max: 16,
      mentor: 'Drea Humphrey', creds: 'Investigative Journalist · Documentarian · LLA Founder',
      tagline: 'Critical Thinking for Kids', episode: 'Adventure 1: The Mystery of the Missing Ark',
      hook: 'Your junior detective’s first big case is waiting.',
      blurb: 'Led by investigative journalist, documentarian and LLA founder Drea Humphrey, children hunt for clues, explore Scripture and investigate the mystery of the Ark of the Covenant.',
      learn: ['Observing carefully and spotting clues', 'What is known about the Ark of the Covenant', 'Asking thoughtful questions and checking claims', 'Presenting their conclusions to the class and parents about where the Ark likely is, based on the evidence they’ve gathered'],
      climb: [['C', 'Character: honesty and fairness when weighing evidence'], ['L', 'Leadership: the courage to share findings and work as a team'], ['I', 'Independent thinking: questioning claims and testing what is true'], ['M', 'Mastery of life skills: careful observation, listening and reasoning'], ['B', 'Building impact: using truth to help and encourage others']],
      faith: 'Taught from a Christian worldview: children learn that God is the source of all truth, and how to seek it carefully, wisely and with an open Bible. Everyone is welcome.',
      verse: { text: '“Prove all things; hold fast that which is good.”', ref: '1 Thessalonians 5:21 (KJV)' } },
    { slug: 'intro-entrepreneurship', name: 'LLA Young Entrepreneurs', ref: 'Young Entrepreneurs', time: '12–2 pm', ages: '13–18', fw: 'CV', max: 20,
      mentor: 'Jennifer Rees', creds: 'Financial Advisor · Education Assistant · LLA Chief Programs Officer',
      tagline: 'Business Startup Skills for Teens',
      hook: 'Teens bring their own idea and leave with a real business, ready to launch.',
      blurb: 'Led by financial advisor, educator and LLA Chief Programs Officer Jennifer Rees, teens take their own idea, from baking and artwork to woodworking or a service, and build it into a small business in 8 weeks. An intro-level course: no business experience needed.',
      learn: ['Naming and branding their business', 'Costs, pricing, budgeting and profit', 'Building a simple website and marketing it safely', 'Presenting and launching their business to the class and parents'],
      climb: [['C', 'Character: honesty with customers and pride in good work'], ['L', 'Leadership: owning a project from first idea to launch'], ['I', 'Independent thinking: solving problems and making their own business decisions'], ['M', 'Mastery of life skills: budgeting, pricing, marketing and customer service'], ['B', 'Building impact: offering something of real value to their community']],
      faith: 'Taught in line with LLA’s core values: students learn to work hard, overcome challenges, deal honestly and manage money wisely, and discover how they can make a real difference in people’s lives through service.',
      verse: { text: '“Well done is better than well said.”', ref: 'Benjamin Franklin' } },
    { slug: 'kidpreneurs', name: 'LLA Kidpreneurs', ref: 'Kidpreneurs', time: '3–5 pm', ages: '8–12', fw: 'CV', max: 20,
      mentor: 'Jennifer Rees', creds: 'Financial Advisor · Education Assistant · LLA Chief Programs Officer',
      tagline: 'Business & Money Skills for Kids',
      hook: 'Kids turn their own idea into a real little business, then open shop on Market Day.',
      blurb: 'Led by financial advisor, educator and LLA Chief Programs Officer Jennifer Rees, kids pick a product or service, or bring their own idea, and build their own little business with guidance along the way.',
      learn: ['Choosing a product and creating a business name and logo', 'Understanding costs and profit', 'Advertising and selling to customers', 'Running their own shop at a final Market Day for the class and parents'],
      climb: [['C', 'Character: honesty and kindness with every customer'], ['L', 'Leadership: the courage to set up shop and welcome customers'], ['I', 'Independent thinking: creativity and problem-solving with their own ideas'], ['M', 'Mastery of life skills: counting costs, pricing and selling'], ['B', 'Building impact: the pride of turning an idea into something real']],
      faith: 'Taught in line with LLA’s core values: students learn to work hard, overcome challenges, deal honestly and manage money wisely, and discover how they can make a real difference in people’s lives through service.',
      verse: { text: '“Well done is better than well said.”', ref: 'Benjamin Franklin' } },
    { slug: 'critical-thinking-debate', name: 'LLA Spot the Spin', ref: 'Spot the Spin', time: '3:30–5:30 pm', ages: '12–18', fw: 'CV', max: 18,
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
    family: { province: 'BC' }, child: {}, childPick: '', items: [], policy_ack: false, referred_by: '',
    plan: '', method: '', etransfer_from: '', householdPrior: false, householdKey: '',
    result: null, bot: false
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
  function priced() {
    return state.items.map(function (it, i) {
      var disc = state.householdPrior || i > 0, c = find(it.course), p = c.price || PRICE, m = c.monthly || MONTHLY;
      return { item: it, course: c, discount: disc,
        full: disc ? Math.round(p * 0.9) : p, monthly: disc ? Math.round(m * 0.9) : m };
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
        policy_ack: state.policy_ack, referred_by: state.referred_by, householdPrior: state.householdPrior, householdKey: state.householdKey }));
    } catch (e) {}
    renderBar();
  }
  function restore() {
    try {
      var s = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
      if (!s || s.term !== TERM) return;
      state.family = s.family || state.family;
      state.items = (s.items || []).filter(function (it) { return find(it.course); });
      state.policy_ack = !!s.policy_ack; state.referred_by = s.referred_by || '';
      state.householdPrior = !!s.householdPrior; state.householdKey = s.householdKey || '';
    } catch (e) {}
  }
  function clearCart() {
    state.items = []; state.plan = ''; state.method = ''; state.etransfer_from = '';
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
          '<span class="reg-card__foot"><span class="reg-price">' + money(MONTHLY) + '<small>/month</small><small class="reg-price__alt">for ' + MONTHS + ' months</small></span><span class="btn btn--gold">' + (isFull(c) ? 'Full · Join Waitlist' : 'Details &amp; Register') + ' <span aria-hidden="true">→</span></span></span>' +
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
      : '<h2 id="reg-title">' + ({ cart: 'Your Registration', pick: 'Add a Course', pay: 'Payment', thanks: 'Thank You', paid: 'Thank You' }[state.step] || 'Register') + '</h2>';
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
        '<p><strong>Class size:</strong> 10–' + c.max + ' students' + spotsText(c, ' · ') + '</p>' +
      '</div>' +
      '<div class="reg-foot"><div class="reg-cost"><p><span class="reg-price" style="font-size:30px">' + money(MONTHLY) + '<small>/month for ' + MONTHS + ' months</small></span></p>' +
        '<p class="reg-note">Pay monthly, or pay in full</p>' +
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
        '<div><label for="reg-referred_by">Who referred you? <span style="font-weight:400;color:var(--muted)">(optional)</span></label>' +
          '<input id="reg-referred_by" name="referred_by" type="text" maxlength="120" value="' + esc(state.referred_by) + '">' +
          '<span class="reg-note" style="display:block;margin-top:6px">Tell us the family who told you about LLA. They get $20 off, and we\'ll try to connect your children with families you know.</span></div>') +
      '<div class="reg-hp" aria-hidden="true"><label for="reg-website">Leave this empty</label><input id="reg-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>' +
      (state.policy_ack ? '' :
        '<label class="reg-check"><input type="checkbox" name="policy_ack"' + (state.errors.policy_ack ? ' aria-invalid="true"' : '') + '> <span>I understand each course needs 10 students to run, and I\'ll get a full refund or transfer if it doesn\'t.</span></label>' +
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
              '<div class="reg-cart__price">' + money(p.monthly) + '<small>/month</small>' + (p.discount ? '<em>10% family discount</em>' : '') + '</div>' +
              '<button type="button" class="reg-cart__x" data-remove="' + i + '" aria-label="Remove ' + esc(p.course.name + ' for ' + p.item.child.first) + '">×</button></li>';
          }).join('') + '</ul>' +
          '<p class="reg-cart__total"><span>Total</span><strong>' + money(t.monthly) + '<small>/month for ' + MONTHS + ' months</small></strong></p>' +
          (anyDisc ? '<p class="reg-note reg-hint">Your family discount is included: 10% off ' + (state.householdPrior ? 'every course, since your household already registered this term.' : 'each additional course.') + '</p>' : '<p class="reg-note">Adding another course for any child in your household? It\'s 10% off.</p>')
        : '<p>Your registration is empty.</p>') +
      '<div class="reg-foot"><button type="button" class="btn btn--outline" data-go="pick">+ Add another course</button>' +
        (list.length ? '<button type="button" class="btn btn--gold" data-go="pay">Continue to Payment <span aria-hidden="true">→</span></button>' : '') + '</div>' +
      '</div>';
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

  function viewPay() {
    var t = totals(), busy = state.busy ? ' disabled aria-busy="true"' : '';
    var n = state.items.length;
    var action = '';
    if (state.plan && state.method === 'card') {
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
      '<div class="reg-paybox">' +
        '<div class="reg-seg">' +
          seg('plan', 'monthly', 'Pay monthly', money(t.monthly) + '/month for ' + MONTHS + ' months') +
          seg('plan', 'full', 'Pay in full', 'one payment') +
        '</div>' +
        (state.plan === 'monthly' ? '<p class="reg-note reg-hint">' + money(t.monthly) + ' today and ' + money(t.monthly) + ' one month later, charged to the same card. Then it ends automatically.</p>' : '') +
        (state.plan === 'full' ? '<p class="reg-note reg-hint">One payment of ' + money(t.full) + '.</p>' +
            '<p class="reg-label" style="margin:6px 0 10px">Pay by</p>' +
            '<div class="reg-seg">' +
              seg('method', 'etransfer', 'e-Transfer', '<span class="reg-pill">Preferred · No fees</span>') +
              seg('method', 'card', 'Debit or credit card', 'through Square') +
            '</div>' +
            (state.method === 'etransfer' ? '<p class="reg-note reg-hint">Preferred: there are no card fees, so more of your payment goes to your child\'s learning.</p>' : '')
          : '') +
      '</div>' +
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
    return '<p class="reg-note" style="text-align:center"><strong>Know a family who would love LLA?</strong> When they register and add your name, you get $20 off.</p>' +
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
          '<p><span>Amount</span><strong>' + money(r.total) + (r.discount ? ' <small style="font-weight:400">(includes your family discount)</small>' : '') + '</strong></p>' +
          '<p><span>To</span><strong>' + esc(r.to || ETRANSFER_EMAIL) + '</strong></p>' +
          '<p><span>Message</span><strong>' + esc(r.message || '') + '</strong></p>' +
        '</div><p class="reg-note">We\'ve emailed you these details too. Once your e-Transfer arrives, we\'ll email a thank-you with the address and everything you need for the first class.</p></div>' : '') +
      (names ? '<p style="text-align:center">Our mentors look forward to helping ' + esc(names) + ' build confidence, character and real-world skills!</p>' : '') +
      closing() +
      '</div>';
  }

  // Card: back from Square.
  function viewPaid() {
    return '<div class="reg-body">' +
      '<div class="reg-thanks"><p class="eyebrow" style="margin:0 0 8px">Thank You</p>' +
        '<h3>Your payment is complete!</h3>' +
        '<p style="color:var(--muted)">You\'ll get a confirmation email in a few minutes with the address and everything you need for the first class. Our mentors look forward to meeting your family!</p></div>' +
      closing() +
      '</div>';
  }

  function render(focusSelector) {
    var views = { details: viewDetails, form: viewForm, cart: viewCart, pick: viewPick, pay: viewPay, thanks: viewThanks, paid: viewPaid, full: viewFull };
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
    overlay.hidden = true;
    document.body.classList.remove('reg-lock');
    state.course = null;
    if (state.step === 'thanks' || state.step === 'paid') state.step = 'details';
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    if (state.opener && state.opener.focus) state.opener.focus();
    state.opener = null;
    renderBar();
  }
  function go(step) {
    state.errors = {}; if (step !== 'cart' && step !== 'pay') state.notice = '';
    if (step === 'form') { state.child = {}; state.childPick = ''; state.editFamily = false; }
    state.step = step;
    render(step === 'form' ? 'input:not([type=hidden]):not([tabindex="-1"])' : null);
  }

  // ------------------------------------------------------------ form -> add to cart
  function readForm(form) {
    FAMILY_FIELDS.forEach(function (n) { if (form.elements[n]) state.family[n] = form.elements[n].value.trim(); });
    CHILD_FIELDS.forEach(function (n) { if (form.elements[n]) state.child[n] = form.elements[n].value.trim(); });
    var g = form.querySelector('input[name="child_gender"]:checked');
    if (g) state.child.child_gender = g.value;
    if (form.elements.referred_by) state.referred_by = form.elements.referred_by.value.trim();
    if (form.elements.policy_ack) state.policy_ack = form.elements.policy_ack.checked;
  }
  function validate() {
    var f = state.family, ch = state.child, e = {};
    if (!f.parent_name) e.parent_name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email || '')) e.email = 'Please enter a valid email.';
    if ((f.phone || '').replace(/\D/g, '').length < 10) e.phone = 'Please enter a 10-digit phone number.';
    if (!f.street_address) e.street_address = 'Please enter your street address.';
    if (!f.city) e.city = 'Please enter your city.';
    if (!f.province) e.province = 'Please enter your province.';
    if (!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(f.postal_code || '')) e.postal_code = 'Please enter a postal code like V1M 0B2.';
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
    if (!state.policy_ack) e.policy_ack = 'Please confirm you understand the minimum class size.';
    return e;
  }
  function submit(form) {
    readForm(form);
    state.errors = validate();
    if (Object.keys(state.errors).length) {
      var first = Object.keys(state.errors)[0];
      render('[name="' + first + '"], [data-child]');
      return;
    }
    state.bot = state.bot || Boolean(form.elements.website.value) || Date.now() - openedAt < 2500;
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
  function checkout() {
    if (state.busy || !state.plan || !state.method || !state.items.length) return;
    state.errors = {}; state.notice = '';
    if (state.method === 'etransfer') {
      var ef = dialog.querySelector('input[name="etransfer_from"]');
      state.etransfer_from = ef ? ef.value.trim() : state.family.email;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.etransfer_from)) { state.errors.etransfer_from = 'Please enter the email you\'ll send the e-Transfer from.'; render('input[name="etransfer_from"]'); return; }
    }
    var list = priced();
    var summary = { kids: kids().map(function (k) { return k.first; }), count: list.length, total: totals().full,
      discount: list.some(function (p) { return p.discount; }), to: ETRANSFER_EMAIL,
      message: list.map(function (p) { return (p.course.ref || p.course.name) + ' ' + p.item.child.first; }).join(', ') };
    if (state.bot) { state.result = summary; clearCart(); state.step = state.method === 'card' ? 'paid' : 'thanks'; render(); return; }
    if (!CONNECTED) {
      state.notice = 'Online checkout isn\'t available right now. Please email <a href="mailto:' + esc(CONTACT) + '">' + esc(CONTACT) + '</a> and we\'ll register you.';
      render(); return;
    }
    var f = state.family;
    var body = {
      method: state.method, plan: state.plan, policy_ack: true, source: location.pathname.slice(0, 40),
      referred_by: state.referred_by, etransfer_from: state.method === 'etransfer' ? state.etransfer_from : '',
      family: { parent_name: f.parent_name, email: f.email, phone: f.phone, street_address: f.street_address, city: f.city, province: f.province, postal_code: f.postal_code },
      items: state.items.map(function (it) {
        return { course_id: it.course, child_first_name: it.child.first, child_last_name: it.child.last, child_age: it.child.age, child_gender: it.child.gender };
      })
    };
    state.busy = true; render();
    fetch(api('/functions/v1/checkout'), { method: 'POST', headers: apiHeaders(), body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        var j = res.j || {};
        if (res.ok && j.checkout_url) { location.href = j.checkout_url; return; }   // card: Square, then back to ?order=
        state.busy = false;
        if (res.ok && j.method === 'etransfer') {
          summary.total = j.total_cents; summary.message = j.etransfer_message; summary.to = j.etransfer_to || ETRANSFER_EMAIL;
          summary.discount = (j.items || []).some(function (i) { return i.family_discount; });
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
        state.notice = 'Something went wrong starting your checkout. Please try again, or email <a href="mailto:' + esc(CONTACT) + '">' + esc(CONTACT) + '</a>.';
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
    if (r.type !== 'radio' || (r.name !== 'plan' && r.name !== 'method')) return;
    state[r.name] = r.value;
    if (r.name === 'plan') state.method = r.value === 'monthly' ? 'card' : '';
    var top = overlay.scrollTop;
    render('input[name="' + r.name + '"]:checked');
    overlay.scrollTop = top;
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
