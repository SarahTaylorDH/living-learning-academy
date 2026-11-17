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
  // Course price: 2 monthly payments, or all at once (plus applicable tax).
  var MONTHLY = '$139';
  var TOTAL = '$278';
  var PAY2_DUE = 'February 12, 2027';

  // Square checkout links: paste each course's link between the quotes.
  var COURSES = [
    { slug: 'music-theatre', name: 'LLA Music Theatre & Character', ref: 'Music Theatre', time: '9–11 am', ages: '12–18', fw: 'CW', max: 20,
      mentor: 'Natalia Pardalis', creds: 'Award-Winning Jazz Vocalist · Music Educator · Owner, Pardalis Studio of Music',
      hook: 'Where teens build the confidence to perform, and carry it into any room.',
      blurb: 'Led by award-winning jazz vocalist and music educator Natalia Pardalis, teens learn to sing, act and bring a character to life, then perform a musical number together.',
      learn: ['Basic singing technique and healthy vocal habits', 'Common theatre terms and stage skills', 'Bringing a character to life through song and acting', 'Performing a musical number together, with choreography, spoken lines and possible solos'],
      climb: [['C', 'Character: discipline, encouragement and grace in rehearsal'], ['L', 'Leadership: the courage to perform and lift up the ensemble'], ['I', 'Independent thinking: interpreting a character and story'], ['M', 'Mastery of life skills: confident speaking, teamwork and focus'], ['B', 'Building impact: a performance that blesses its audience']],
      faith: 'Taught from a Christian worldview: students are reminded that their gifts and talents come from God, and learn to use them to glorify Him and bless those around them. Everyone is welcome.',
      verse: { text: '“Worship the Lord with gladness; come before him with joyful songs.”', ref: 'Psalm 100:2 (NIV)' },
      squareUrl: '' },
    { slug: 'truth-hunters', name: 'LLA Jr. Truth Detectives', ref: 'Truth Detectives', time: '12–2 pm', ages: '6–11', fw: 'CW', max: 16,
      mentor: 'Drea Humphrey', creds: 'Investigative Journalist · Documentarian · LLA Founder',
      tagline: 'Critical Thinking for Kids', episode: 'Adventure 1: The Mystery of the Missing Ark',
      hook: 'Your junior detective’s first big case is waiting.',
      blurb: 'Led by Christian investigative journalist Drea Humphrey, children hunt for clues, explore Scripture and investigate the mystery of the Ark of the Covenant.',
      learn: ['Observing carefully and spotting clues', 'What is known about the Ark of the Covenant', 'Asking thoughtful questions and checking claims', 'Drawing conclusions from the evidence'],
      climb: [['C', 'Character: honesty and fairness when weighing evidence'], ['L', 'Leadership: the courage to share findings and work as a team'], ['I', 'Independent thinking: questioning claims and testing what is true'], ['M', 'Mastery of life skills: careful observation, listening and reasoning'], ['B', 'Building impact: using truth to help and encourage others']],
      faith: 'Taught from a Christian worldview: children learn that God is the source of all truth, and how to seek it carefully, wisely and with an open Bible. Everyone is welcome.',
      verse: { text: '“Prove all things; hold fast that which is good.”', ref: '1 Thessalonians 5:21 (KJV)' },
      squareUrl: '' },
    { slug: 'intro-entrepreneurship', name: 'LLA Intro to Entrepreneurship', ref: 'Entrepreneurship', time: '12–2 pm', ages: '13–18', fw: 'CV', max: 20,
      mentor: 'Jennifer Rees', creds: 'Financial Advisor · Education Assistant · LLA Chief Programs Officer',
      blurb: 'Teens learn how real businesses start and build a plan for their own idea.',
      learn: ['How businesses make money', 'Budgeting, pricing and profit', 'Writing and pitching a simple business plan'],
      squareUrl: '' },
    { slug: 'kidpreneurs', name: 'LLA Kidpreneurs', ref: 'Kidpreneurs', time: '3–5 pm', ages: '8–11', fw: 'CW', max: 20,
      mentor: 'Jennifer Rees', creds: 'Financial Advisor · Education Assistant · LLA Chief Programs Officer',
      blurb: 'Kids turn their own ideas into a small business, with honesty and hard work at the core.',
      learn: ['Earning, saving, giving and spending wisely', 'Turning an idea into a product', 'Selling with honesty and good service'],
      squareUrl: '' },
    { slug: 'critical-thinking-debate', name: 'LLA Spot the Spin', ref: 'Spot the Spin', time: '3:30–5:30 pm', ages: '12–18', fw: 'CV', max: 18,
      mentor: 'Drea Humphrey', creds: 'Investigative Journalist · Documentarian · LLA Founder',
      tagline: 'Critical Thinking & Debate for Teens',
      hook: 'Beyond the headlines and the social media spin: teens learn to find what’s true, and stand firm in it.',
      blurb: 'Led by investigative journalist Drea Humphrey, teens learn to investigate claims, check sources, recognize bias and build arguments using evidence.',
      learn: ['Investigating claims and checking sources', 'Recognizing bias and spin in the news and media', 'Building strong arguments from evidence', 'Debating, responding to opposing views and presenting with confidence'],
      climb: [['C', 'Character: discernment, and standing firm in their values'], ['L', 'Leadership: speaking with confidence, even when it means standing apart from the crowd'], ['I', 'Independent thinking: resisting peer and mainstream pressure'], ['M', 'Mastery of life skills: research, reasoning, debate and public speaking'], ['B', 'Building impact: engaging differing opinions respectfully, without taking offence']],
      faith: 'Taught in line with LLA’s core values: youth learn to practice discernment, consider differing opinions respectfully without taking offence, and stand firm in their values, even when it means standing apart from the crowd.',
      verse: { text: '“If you look for truth, you may find comfort in the end: if you look for comfort you will not get either comfort or truth.”', ref: 'C. S. Lewis' },
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
    // Counts stay private until a course is nearly full: only 5 or fewer spots left starts the countdown.
    return n <= 5 ? sep + '<strong style="color:var(--gold-dark)">Only ' + n + ' spot' + (n === 1 ? '' : 's') + ' left</strong>' : '';
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
  function monthly() { return state.form.payment_plan !== 'full'; }
  function payNow() { return monthly() ? MONTHLY : TOTAL; }
  function payHint(name, v) {
    if (name === 'payment_plan') return v === 'monthly' ? MONTHLY + ' + tax now, and ' + MONTHLY + ' + tax by ' + PAY2_DUE + '.' : v === 'full' ? 'One payment of ' + TOTAL + ' + tax.' : '';
    return v === 'etransfer' ? 'Your spot is held for 12 hours while we wait for your e-Transfer.' : v === 'square' ? 'Pay by card through Square to secure your spot right away.' : '';
  }
  function payMessage() { return state.course.ref + ' ' + (childName() || "[Child's first name]"); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // Optional series lines under a course name (e.g. Jr. Truth Detectives' current adventure).
  function subtitle(c) {
    return (c.tagline ? '<span class="reg-tagline">' + esc(c.tagline) + '</span>' : '') +
      (c.episode ? '<span class="reg-episode">' + esc(c.episode) + '</span>' : '');
  }

  // ------------------------------------------------------------ page lists
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
          '<span class="reg-card__foot"><span class="reg-price">' + MONTHLY + '<small>/month</small><small class="reg-price__alt">2 months · or ' + TOTAL + ' + tax all at once</small></span><span class="btn btn--gold">' + (isFull(c) ? 'Full · Join Waitlist' : 'Details &amp; Register') + ' <span aria-hidden="true">→</span></span></span>' +
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
      '<h2 id="reg-title">' + esc(c.name) + '</h2>' + subtitle(c) + '</div>' +
      '<button type="button" class="reg-x" data-close aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<ol class="reg-steps" aria-label="Step ' + (idx + 1) + ' of 4">' + STEPS.map(function (s, i) { return '<li class="' + (i <= idx ? 'on' : '') + '"></li>'; }).join('') + '</ol>';
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
        '<p><strong>When:</strong> Fridays ' + esc(c.time) + ', Jan 15 – Mar 5, 2027 (8 weeks)</p>' +
        '<p><strong>Where:</strong> LLA Langley Learning Centre (address emailed after registration)</p>' +
        '<p><strong>Class size:</strong> 10–' + c.max + ' students' + spotsText(c, ' · ') + '</p>' +
      '</div>' +
      '<div class="reg-foot"><div class="reg-cost"><p><span class="reg-price" style="font-size:30px">' + MONTHLY + '<small>/month for 2 months</small></span></p>' +
        '<p class="reg-note">' + TOTAL + ' + tax total · pay monthly or all at once</p>' +
        '<p class="reg-note"><strong>Family discount:</strong> 10% off each additional course in your household</p></div>' +
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
    var seg = function (name, v, title, sub) {
      var on = state.form[name] === v;
      return '<label class="reg-seg__opt' + (on ? ' is-on' : '') + '"><input type="radio" name="' + name + '" value="' + v + '"' + (on ? ' checked' : '') + (state.errors[name] ? ' aria-invalid="true"' : '') + '><span><b>' + title + '</b><small>' + sub + '</small></span></label>';
    };
    var hint = function (name) {
      return state.errors[name] ? '<span class="reg-err">' + esc(state.errors[name]) + '</span>' : '<p class="reg-note reg-hint" data-hint="' + name + '">' + payHint(name, state.form[name]) + '</p>';
    };
    return '<form class="reg-body" data-reg-form novalidate>' +
      '<p class="reg-note">All fields are required before payment.</p>' +
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
      '<div><label for="reg-referred_by">Who referred you? <span style="font-weight:400;color:var(--muted)">(optional)</span></label>' +
        '<input id="reg-referred_by" name="referred_by" type="text" maxlength="120" value="' + esc(state.form.referred_by || '') + '">' +
        '<span class="reg-note" style="display:block;margin-top:6px">Tell us the family who told you about LLA. They get $20 off, and we\'ll try to connect your children with families you know.</span></div>' +
      '<div class="reg-paybox">' +
        '<p class="reg-label">Payment plan <span class="reg-label__note">plus applicable tax</span></p>' +
        '<div class="reg-seg">' +
          seg('payment_plan', 'monthly', MONTHLY + '/month', '2 payments') +
          seg('payment_plan', 'full', TOTAL, 'all at once') +
        '</div>' +
        hint('payment_plan') +
        '<p class="reg-label" style="margin-top:6px">Pay by</p>' +
        '<div class="reg-seg">' +
          seg('payment_choice', 'etransfer', 'e-Transfer', '<span class="reg-pill">Preferred · No fees</span>') +
          seg('payment_choice', 'square', 'Debit or credit card', 'through Square') +
        '</div>' +
        hint('payment_choice') +
      '</div>' +
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
    var etransfer = state.form.payment_choice === 'etransfer';
    var second = monthly() ? ' Your second payment of ' + MONTHLY + ' + tax is due by ' + PAY2_DUE + '. We\'ll send you a reminder.' : '';
    var card = c.squareUrl
      ? '<a class="btn btn--gold" href="' + esc(c.squareUrl) + '" target="_blank" rel="noopener">Pay ' + payNow() + ' + tax by Card <span aria-hidden="true">↗</span></a>' +
        '<p class="reg-note">Opens Square\'s secure checkout. When you\'re done, come back and tap below.' + second + '</p>' +
        '<button type="button" class="reg-link" data-go="thanks">I\'ve paid by card →</button>'
      : '<p class="reg-note">Our secure card checkout is almost ready. Email <a href="mailto:' + esc(CONTACT) + '?subject=' + encodeURIComponent('Card payment: ' + c.name) + '">' + esc(CONTACT) + '</a> and we\'ll send you a Square payment link.</p>';
    return '<div class="reg-body">' +
      (state.saveFailed ? '<p class="reg-warn">We couldn\'t save your details automatically. Please also email your name, phone and child\'s name and age to <a href="mailto:' + esc(CONTACT) + '">' + esc(CONTACT) + '</a> so we can hold your spot.</p>' : '') +
      (etransfer
        ? '<div class="reg-paycard">' +
            '<p class="reg-label">Send an Interac e-Transfer</p>' +
            '<div class="reg-kv">' +
              '<p><span>Amount</span><strong>' + payNow() + ' + tax</strong></p>' +
              '<p><span>To</span><strong>' + esc(ETRANSFER_EMAIL) + '</strong></p>' +
              '<p><span>Message</span><strong>' + esc(c.ref) + ' (child\'s first name)</strong></p>' +
            '</div>' +
            '<p class="reg-note">In the message, write the course you picked and your child\'s first name.</p>' +
          '</div>' +
          '<p class="reg-note">Your spot is held for 12 hours while we wait for your e-Transfer.' + second + '</p>' +
          '<button type="button" class="btn btn--gold" data-go="thanks">I\'ve Sent My e-Transfer <span aria-hidden="true">→</span></button>'
        : '<div class="reg-paycard">' +
            '<p class="reg-label">Pay by debit or credit card</p>' + card +
          '</div>' +
          '<p class="reg-note">Card payments secure your spot right away. Unpaid card registrations are released after 1 hour.</p>') +
      '<div class="reg-foot"><button type="button" class="reg-link" data-go="form">← Change payment</button></div>' +
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
        '<p style="color:var(--muted)">We\'re so excited! Once your payment arrives, we\'ll email a thank-you with the Langley Learning Centre address and everything you need for the first class. We can\'t wait to meet ' + esc(childName() || 'your child') + '.</p></div>' +
      '<p class="reg-note" style="text-align:center"><strong>Know a family who would love LLA?</strong> When they register and add your name, you get $20 off.</p>' +
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
    var pp = form.querySelector('input[name="payment_plan"]:checked');
    state.form.payment_plan = pp ? pp.value : '';
    state.form.referred_by = form.elements.referred_by.value.trim();
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
    if (f.payment_plan !== 'monthly' && f.payment_plan !== 'full') e.payment_plan = 'Please choose monthly or all at once.';
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
      payment_choice: f.payment_choice, payment_plan: f.payment_plan, referred_by: (f.referred_by || '').slice(0, 120) || null, policy_ack: true,
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
      render('input[name="' + first + '"]');
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
  // Payment choices: highlight the picked option and show its short explanation.
  dialog.addEventListener('change', function (e) {
    var r = e.target;
    if (r.type !== 'radio' || (r.name !== 'payment_plan' && r.name !== 'payment_choice')) return;
    state.form[r.name] = r.value;
    Array.prototype.forEach.call(dialog.querySelectorAll('input[name="' + r.name + '"]'), function (x) { x.closest('.reg-seg__opt').classList.toggle('is-on', x.checked); });
    var h = dialog.querySelector('[data-hint="' + r.name + '"]');
    if (h) h.textContent = payHint(r.name, r.value);
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
