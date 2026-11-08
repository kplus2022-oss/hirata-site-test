/* Holistic Retreat 2027 — 演出（2026-11-08）
   比喩：「映画館の照明が落ち、上映が終わると明かりが戻る」。
   【読みやすさの原則】ページ背景の明暗を大きく変えるのは、写真が画面全体を覆っていて文字がない間だけ。
   背景色はスクロール位置から直接求め、遅れを持たせない。ナビ・場面表示は帯色と文字色を対で切り替える。
   設計：retreat/演出設計_2027.md */
(() => {
  'use strict';
  const noop = () => {};
  const api = {
    active: false, start: noop, stop: noop, refresh: noop, finishFor: noop, pauseScroll: noop,
    scrollTo(top) { window.scrollTo(0, top); }
  };
  window.RetreatMotion = api;
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  const $ = (s, r = document) => r.querySelector(s);
  const all = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const C = { paper: '#F7F6F2', sand: '#ECE2D0', warm: '#F1E9DC', night: '#211E19', ink: '#2A2825', nightInk: '#EDE7DB' };
  /* 太陽／月の光：x%, y%, 半径%, 色（本文の背後だけ） */
  const SUN = {
    day: [82, 12, 44, 'rgba(255,236,200,0.62)'],
    dusk: [64, 66, 50, 'rgba(236,168,106,0.45)'],
    night: [20, 14, 26, 'rgba(236,230,214,0.12)'],
    evening: [72, 30, 48, 'rgba(240,196,140,0.42)'],
    morning: [26, 60, 48, 'rgba(255,226,186,0.55)']
  };
  const DUST = { day: '#ad8e58', dusk: '#d39a62', night: '#efe3c6', evening: '#c39565', morning: '#c19f69' };
  const SCENES = [
    ['#intro', '手紙', 'Letter'], ['.film-dusk', '上映', 'Film', true], ['.film-questions', '語らい', 'Dialogue', true],
    ['.film-copy-rest', '語らい', 'Dialogue', true], ['.interlude-lights', '語らい', 'Dialogue'],
    ['#gaiyou', '開催日程', 'Invitation'], ['#topics', '五つの入口', 'Perspectives'], ['.interlude-gather', '食卓へ', 'Together'],
    ['#basho', '場所', 'The Place'], ['#taberu', '食べる', 'Nourish'], ['#yasumu', '休む', 'Rest', true],
    ['.interlude-morning', '翌朝', 'Morning'], ['#anata', 'このような方へ', 'For You'], ['#saigoni', '結び', 'Closing'], ['#apply', 'お申し込み', 'Application']
  ];

  let ctx = null, lenis = null, particles = null, tickFn = null, listeners = null, S = null;
  let introPlayed = false, prepared = false;
  const shown = new WeakSet();
  let records = [];
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  /* ---------- 色の計算 ---------- */
  const mix = gsap.utils.interpolate;
  const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const rgb = c => { if (c[0] === '#') return [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16)); const m = c.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]]; };
  const lum = c => { const v = rgb(c).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const cache = {};
  const setVar = (name, v) => { const s = typeof v === 'number' ? v.toFixed(3) : v; if (cache[name] !== s) { root.style.setProperty(name, s); cache[name] = s; } };

  /* ---------- 一度だけのDOM準備（止めた状態でも見た目に影響しない） ---------- */
  function prepare() {
    if (prepared) return;
    prepared = true;
    all('main .sec-title').forEach(t => {
      if (t.querySelector('.mask')) return;
      [...t.childNodes].forEach(n => {
        if (n.nodeType === 1 && n.classList.contains('phrase')) {
          const m = document.createElement('span'); m.className = 'mask'; n.before(m); m.append(n);
        } else if (n.nodeType === 3 && n.textContent.trim()) {
          const m = document.createElement('span'), inner = document.createElement('span');
          m.className = 'mask'; inner.className = 'mask-in'; n.before(m); inner.append(n); m.append(inner);
        }
      });
    });
    const lead = $('#intro .reading-copy p');
    if (lead && !lead.querySelector('.ink-chars')) {
      const sr = document.createElement('span'), vis = document.createElement('span');
      sr.className = 'ink-sr'; sr.textContent = lead.textContent;
      vis.className = 'ink-chars'; vis.setAttribute('aria-hidden', 'true');
      const addChars = text => [...text].forEach(ch => { const s = document.createElement('span'); s.className = 'ink-c'; s.textContent = ch; vis.append(s); });
      lead.childNodes.forEach(n => { if (n.nodeName === 'WBR') vis.append(document.createElement('wbr')); else addChars(n.textContent); });
      lead.textContent = '';
      lead.append(sr, vis);
      lead.classList.add('ink-lead');
    }
    all('.btn').forEach(b => { if (!b.querySelector('.btn-hairline')) { const h = document.createElement('span'); h.className = 'btn-hairline'; h.setAttribute('aria-hidden', 'true'); b.append(h); } });
    all('textarea, #menuOverlay').forEach(e => e.setAttribute('data-lenis-prevent', ''));
  }

  /* ---------- 読みかけの位置を保つ ---------- */
  function captureAnchor() {
    if (window.scrollY < 10) return null;
    let el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.45);
    while (el && el !== document.body && el.getBoundingClientRect().height > window.innerHeight * 0.8) el = el.parentElement;
    if (!el || el === document.body || el === root) return null;
    return { el, top: el.getBoundingClientRect().top };
  }
  function restoreAnchor(a) {
    if (!a || !a.el.isConnected) return;
    const d = a.el.getBoundingClientRect().top - a.top;
    if (Math.abs(d) < 1) return;
    const y = Math.max(0, window.scrollY + d);
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
    ScrollTrigger.update();
  }

  /* ---------- 出現（一度だけ。通過済み・焦点が当たった要素は即完了） ---------- */
  function reveal(trigger, targets, o = {}) {
    const items = Array.from(targets).filter(Boolean);
    if (!items.length || !trigger || shown.has(items[0])) return;
    const r = trigger.getBoundingClientRect();
    if (r.bottom <= 80 || (o.keepVisible && r.top < window.innerHeight * 0.94)) { shown.add(items[0]); return; }
    const tl = gsap.timeline({ paused: true });
    o.build(tl, items);
    let st = null;
    const finish = () => { shown.add(items[0]); tl.progress(1).pause(); if (st) st.kill(); };
    const play = () => {
      shown.add(items[0]);
      if (trigger.getBoundingClientRect().bottom < 0) return finish();
      /* 同時に画面へ入った段落は、上から少しずつ間をあけて出す */
      let wait = 0;
      if (o.queue) { const now = gsap.ticker.time; wait = Math.min(0.3, Math.max(0, o.queue.t - now)); o.queue.t = now + wait + o.queue.gap; }
      if (wait) { tl.delay(wait); tl.restart(true); } else tl.play(0);
    };
    st = ScrollTrigger.create({
      trigger, start: o.start || 'top 88%', end: 'bottom top',
      onEnter: play, onLeave: finish, onEnterBack: finish
    });
    records.push({ items, finish });
  }
  const fadeUp = (dist, stagger = 0.14, dur = 1.5) => (tl, items) => {
    tl.fromTo(items, { autoAlpha: 0, y: dist }, { autoAlpha: 1, y: 0, duration: dur, ease: 'expo.out', stagger: Math.min(stagger, 0.42 / Math.max(1, items.length - 1)), clearProps: 'transform,opacity,visibility' });
  };

  function buildReveals(mobile, keepVisible) {
    all('main .sec-head').forEach(head => {
      if (head.classList.contains('film-head')) return;
      const label = head.querySelector('.sec-label'), line = head.querySelector('.sec-line');
      const masks = all('.sec-title .mask > *', head);
      reveal(head, [label || masks[0], ...masks, line].filter(Boolean), {
        keepVisible,
        build: tl => {
          if (label) tl.fromTo(label, { autoAlpha: 0, y: 14, filter: 'blur(6px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 1.3, ease: 'expo.out', clearProps: 'all' }, 0);
          if (masks.length) tl.fromTo(masks, { yPercent: 112 }, { yPercent: 0, duration: 1.5, ease: 'expo.out', stagger: 0.13, clearProps: 'transform' }, 0.1);
          if (line) tl.fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 1.8, ease: 'expo.inOut', clearProps: 'transform' }, 0.45);
        }
      });
    });
    const d = mobile ? 20 : 28;
    /* 本文：一段落ずつ、その段落が画面に入ったときに下からフェード（手紙の書き出しも同じ動きに墨のにじみを重ねる） */
    const queue = { t: 0, gap: 0.16 };
    all('.reading-copy, .lead:not(.reading-copy)').forEach(copy => {
      [...copy.children].filter(e => e.matches('p')).forEach(p => reveal(p, [p], { keepVisible, queue, build: fadeUp(d) }));
    });
    all('.topic-row').forEach(row => reveal(row, row.children, { keepVisible, build: fadeUp(d, 0.1) }));
    all('.schedule-list, .day-cards, .anata-list, .room-list').forEach(list => reveal(list, list.children, { keepVisible, build: fadeUp(mobile ? 18 : 24, 0.08, 1.2) }));
    all('.gaiyou-card, .meal-badge, .film-note, .message-author, .apply-intro + *').forEach(card => reveal(card, [card], { keepVisible, build: fadeUp(22, 0, 1.4) }));
    all('.interlude-gather .interlude-copy').forEach(copy => reveal(copy.closest('.interlude-stage'), [copy], { keepVisible, start: 'top 62%', build: fadeUp(mobile ? 24 : 34, 0, 1.6) }));

    /* 手紙の書き出し：読み進めるほど墨がにじむ */
    const chars = all('.ink-lead .ink-c');
    if (chars.length) {
      const lead = $('.ink-lead');
      if (keepVisible && lead.getBoundingClientRect().top < window.innerHeight) return;
      gsap.fromTo(chars, { opacity: 0.14 }, { opacity: 1, ease: 'none', stagger: 0.05, scrollTrigger: { trigger: lead, start: 'top 84%', end: 'bottom 52%', scrub: 0.6 } });
    }
  }

  /* ---------- ヒーロー ---------- */
  function buildHero(mobile) {
    const slides = all('.hero-slide');
    const veil = $('.hero-veil');
    if (slides.length) {
      /* ゆっくりした寄り引き（往復）と、写真同士のディゾルブ */
      const breath = gsap.fromTo(slides, { scale: 1.07 }, { scale: 1, duration: 22, ease: 'sine.inOut', repeat: -1, yoyo: true });
      const dissolve = slides.length > 1 ? gsap.timeline({ repeat: -1 })
        .to(slides[1], { opacity: 1, duration: 4, ease: 'sine.inOut' }, 9)
        .to(slides[1], { opacity: 0, duration: 4, ease: 'sine.inOut' }, 24)
        .to({}, { duration: 9 }) : null;
      let inView = true;
      const sync = () => { const on = inView && !document.hidden; breath.paused(!on); if (dissolve) dissolve.paused(!on); };
      ScrollTrigger.create({ trigger: '.hero-stage', start: 'top bottom', end: 'bottom top', onToggle: self => { inView = self.isActive; sync(); } });
      document.addEventListener('visibilitychange', sync, { signal: listeners.signal });
    }
    const parts = ['.hero-date', '.hero-jp', '.hero-theme', '.hero-sub', '.hero-details', '.hero-cta', '.hero-read'].map(s => $(s)).filter(Boolean);
    if (!introPlayed && window.scrollY < window.innerHeight * 0.5) {
      introPlayed = true;
      const tl = gsap.timeline({ delay: 0.1 });
      if (veil) tl.fromTo(veil, { '--wash': 1 }, { '--wash': 0, duration: 2.4, ease: 'power2.inOut' }, 0);
      tl.fromTo('.hero-date', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 1.6, ease: 'expo.out' }, 0.45)
        .fromTo('.hero-en', { autoAlpha: 0, filter: 'blur(16px)', letterSpacing: '0.3em' }, { autoAlpha: 1, filter: 'blur(0px)', letterSpacing: mobile ? '0.01em' : '0.025em', duration: 2.8, ease: 'expo.out', clearProps: 'filter,letterSpacing' }, 0.65)
        .fromTo(parts.slice(1), { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 1.6, ease: 'expo.out', stagger: 0.15, clearProps: 'transform' }, 1.3);
    } else {
      introPlayed = true;
      if (veil) gsap.set(veil, { '--wash': 0 });
    }
    const travel = Math.min(window.innerHeight * (mobile ? 0.085 : 0.12), mobile ? 72 : 112);
    gsap.fromTo('.hero-bg', { y: 0, scale: 1 }, { y: travel, scale: 1.06, ease: 'none', scrollTrigger: { trigger: '#hajimeni', start: 'top top', end: 'bottom top', scrub: 0.65 } });
    gsap.to('.hero-inner', { y: mobile ? -30 : -60, ease: 'none', scrollTrigger: { trigger: '#hajimeni', start: 'top top', end: 'bottom top', scrub: 0.65 } });
  }

  /* ---------- 映画：窓が開き、夜が降り、夕景が映写幕になる ---------- */
  function buildFilm(mobile) {
    const fig = $('.film-dusk .film-figure');
    if (!fig) return;
    const portrait = window.innerWidth / window.innerHeight < 0.9;
    const SCREEN = portrait ? ['20%', '6%', '42%', '6%'] : ['15%', '14%', '29%', '14%'];
    root.style.setProperty('--screen-t', SCREEN[0]); root.style.setProperty('--screen-r', SCREEN[1]);
    root.style.setProperty('--screen-b', SCREEN[2]); root.style.setProperty('--screen-l', SCREEN[3]);
    gsap.set(fig, { '--t': '22%', '--r': '18%', '--b': '22%', '--l': '18%' });
    gsap.set('.film-nightfall', { yPercent: -100 });
    gsap.set(['.film-caption', '.film-scrim', '.film-screen-glow', '.film-ghost'], { opacity: 0 });
    gsap.set('.film-head', { autoAlpha: 0 });
    gsap.set('.film-head .sec-label', { opacity: 0 });
    const img = $('.film-frame > img:not(.film-screen-img)');
    gsap.set('.film-screen-img', { opacity: 0 });

    gsap.timeline({ scrollTrigger: { trigger: '.film-dusk', start: 'top bottom', end: 'top top', scrub: true } })
      .to(fig, { '--t': '0%', '--r': '0%', '--b': '0%', '--l': '0%', ease: 'power2.inOut', duration: 1 }, 0)
      .fromTo(img, { scale: 1.32 }, { scale: 1.12, ease: 'none', duration: 1 }, 0)
      .to('.film-flare', { opacity: 1, ease: 'none', duration: 0.6 }, 0.4);

    const masks = all('.film-head .sec-title .mask > *');
    gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: '.film-dusk', start: 'top top', end: 'bottom bottom', scrub: 0.8 } })
      .to('.film-nightfall', { yPercent: 0, duration: 0.42, ease: 'power1.inOut' }, 0)
      .to(img, { scale: 1, duration: 0.5 }, 0)
      .to('.film-flare', { opacity: 0.25, duration: 0.3 }, 0.12)
      .to('.film-dim', { opacity: 0.5, duration: 0.3 }, 0.18)
      .to('.film-ghost', { opacity: 1, xPercent: -6, duration: 0.45 }, 0.05)
      .to(fig, { '--t': SCREEN[0], '--r': SCREEN[1], '--b': SCREEN[2], '--l': SCREEN[3], duration: 0.3, ease: 'power2.inOut' }, 0.45)
      .to('.film-dim', { opacity: 0.9, duration: 0.12 }, 0.48)
      .to('.film-nightfall', { autoAlpha: 0, duration: 0.2 }, 0.52)
      .to('.film-screen-img', { opacity: 1, duration: 0.08 }, 0.6)
      .to(img, { opacity: 0, duration: 0.08 }, 0.6)
      .to('.film-dim', { opacity: 0.06, duration: 0.14 }, 0.68)
      .to('.film-flare', { opacity: 0, duration: 0.2 }, 0.55)
      .to('.film-screen-glow', { opacity: 1, duration: 0.25 }, 0.6)
      .to(['.film-caption', '.film-scrim'], { opacity: 1, duration: 0.15 }, 0.7)
      .to('.film-ghost', { opacity: 0, duration: 0.2 }, 0.72)
      .to('.film-head', { autoAlpha: 1, duration: 0.05 }, 0.7)
      .to('.film-head .sec-label', { opacity: 1, duration: 0.12 }, 0.72)
      .fromTo(masks, { yPercent: 112 }, { yPercent: 0, duration: 0.16, stagger: 0.04, ease: 'power3.out' }, 0.74)
      .fromTo('.film-head .sec-line', { scaleX: 0 }, { scaleX: 1, duration: 0.14 }, 0.8)
      .to({}, { duration: 0.12 });

    /* 問い：映写機の光の中で、字幕のように一つずつ */
    const qs = all('.film-questions .q-list p');
    if (qs.length) {
      const q = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: '.film-questions', start: 'top 75%', end: 'bottom bottom', scrub: 0.8 } });
      q.fromTo('.film-beam', { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0).fromTo('.q-label', { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.2);
      qs.forEach((p, i) => {
        const at = 0.9 + i * 1.6;
        q.fromTo(p, { opacity: 0, y: 34, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6, ease: 'power2.out' }, at);
        if (i < qs.length - 1) q.to(p, { opacity: 0, y: -28, filter: 'blur(8px)', duration: 0.5, ease: 'power2.in' }, at + 1.1);
      });
      q.to({}, { duration: 0.7 }, 4.7);
      q.fromTo('.q-meter span', { scaleX: 0 }, { scaleX: 1, duration: q.duration() }, 0);
    }
  }

  /* ---------- 上映のあと：小さな窓が全面に広がり、明かりが戻る ---------- */
  function buildLights() {
    const sec = $('.interlude-lights');
    if (!sec) return;
    const frame = $('.media-full', sec), img = $('img', sec);
    gsap.set(frame, { '--t': '30%', '--r': '28%', '--b': '30%', '--l': '28%' });
    gsap.timeline({ scrollTrigger: { trigger: sec, start: 'top bottom', end: 'top top', scrub: true } })
      .to(frame, { '--t': '0%', '--r': '0%', '--b': '0%', '--l': '0%', ease: 'power2.inOut', duration: 1 }, 0)
      .fromTo(img, { scale: 1.25 }, { scale: 1.08, ease: 'none', duration: 1 }, 0)
      .fromTo($('.interlude-en', sec), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, 0.5);
    gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom bottom', scrub: 0.8 } })
      .to($('.interlude-en', sec), { opacity: 0, duration: 0.18 }, 0.12)
      .to($('.lights-dim', sec), { opacity: 0, duration: 0.45, ease: 'power1.inOut' }, 0.1)
      .fromTo($('.lights-glow', sec), { opacity: 0 }, { opacity: 0.9, duration: 0.3 }, 0.25)
      .to(img, { scale: 1, duration: 0.6 }, 0)
      .to($('.lights-glow', sec), { opacity: 0, duration: 0.25 }, 0.62)
      .to([frame, $('.interlude-caption', sec)], { opacity: 0, duration: 0.25 }, 0.72)
      .to({}, { duration: 0.06 });
  }

  /* ---------- 写真：幕が上がるように現れ、中で静かに視差 ---------- */
  function buildPhotos(mobile, keepVisible) {
    all('.media.parallax, .media.portrait').forEach((frame, i) => {
      if (frame.closest('.film-dusk')) return;
      const img = frame.querySelector('img'); if (!img) return;
      reveal(frame, [frame], {
        keepVisible, start: 'top 90%',
        build: tl => tl.fromTo(frame, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.9, ease: 'expo.inOut', clearProps: 'clipPath' })
          .fromTo(img, { scale: 1.22 }, { scale: 1, duration: 2.6, ease: 'expo.out', clearProps: 'scale' }, 0.1)
      });
      if (frame.classList.contains('media-float')) {
        const d = mobile ? 8 : 18;
        gsap.fromTo(frame, { y: d }, { y: -d, ease: 'none', scrollTrigger: { trigger: frame.parentElement, start: 'top bottom', end: 'bottom top', scrub: 0.75 } });
        return;
      }
      if (frame.classList.contains('yasumu-media') || frame.classList.contains('portrait')) return;
      const d = Math.min(window.innerHeight * (mobile ? 0.025 : 0.045), mobile ? 20 : 44);
      gsap.set(frame, { '--photo-travel': d + 'px' });
      gsap.fromTo(img, { y: -d }, { y: d, ease: 'none', scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: 0.75 } });
    });
    /* 幕間の写真（食卓へ・翌朝） */
    all('.interlude-gather, .interlude-morning').forEach(sec => {
      const frame = $('.media-full', sec), img = $('img', sec);
      const d = Math.min(window.innerHeight * (mobile ? 0.04 : 0.085), mobile ? 32 : 88);
      gsap.set(frame, { '--photo-travel': d + 'px' });
      gsap.fromTo(img, { y: -d }, { y: d, ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: 0.75 } });
      const leak = $('.interlude-leak', sec);
      if (leak) gsap.fromTo(leak, { xPercent: -60, opacity: 0 }, { xPercent: 60, opacity: 1, ease: 'none', scrollTrigger: { trigger: sec, start: 'top 70%', end: 'bottom 30%', scrub: 0.8 } });
    });
    /* 翌朝：休むの夜色から続く覆いが上へ引く */
    const mn = $('.interlude-morning .morning-night'), mc = $('.interlude-morning .interlude-copy');
    if (mn) {
      /* 言葉は覆いが通り過ぎてから現れる（覆いの柔らかな縁が文字に重ならない） */
      gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: '.interlude-morning', start: 'top 85%', end: 'top 15%', scrub: 0.8 } })
        .fromTo(mn, { yPercent: 0 }, { yPercent: -135, duration: 1, ease: 'power1.inOut' }, 0)
        .fromTo(mc, { autoAlpha: 0, y: mobile ? 22 : 30 }, { autoAlpha: 1, y: 0, duration: 0.25 }, 0.55);
    }
  }

  /* ---------- 休む：夜のパネルが窓のように開く ---------- */
  function buildPanels(mobile) {
    const y = $('#yasumu');
    if (y) gsap.fromTo(y, { '--pi': mobile ? '4%' : '7%', '--prad': '8px' }, { '--pi': '0%', '--prad': '0px', ease: 'power2.out', scrollTrigger: { trigger: y, start: 'top bottom', end: 'top 25%', scrub: 0.6 } });
  }

  /* ---------- 背景の大きな英字 ---------- */
  function buildGhosts() {
    all('.ghost-word').forEach(g => {
      if (g.classList.contains('film-ghost')) return;
      const sec = g.closest('section'); if (!sec) return;
      gsap.fromTo(g, { xPercent: 6 }, { xPercent: -10, ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: 1.2 } });
    });
  }

  /* ---------- ボタン・灯り・フォーム ---------- */
  function buildPointer() {
    const sig = { signal: listeners.signal, passive: true };
    if (finePointer.matches) {
      all('.btn').forEach(b => {
        const magnetic = b.classList.contains('fill') && !b.closest('form');
        const xTo = magnetic ? gsap.quickTo(b, 'x', { duration: 0.6, ease: 'power3.out' }) : null;
        const yTo = magnetic ? gsap.quickTo(b, 'y', { duration: 0.6, ease: 'power3.out' }) : null;
        b.addEventListener('pointermove', e => {
          const r = b.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
          b.style.setProperty('--mx', px.toFixed(1) + 'px'); b.style.setProperty('--my', py.toFixed(1) + 'px');
          if (magnetic) { xTo(Math.max(-14, Math.min(14, (px - r.width / 2) * 0.2))); yTo(Math.max(-10, Math.min(10, (py - r.height / 2) * 0.3))); }
        }, sig);
        if (magnetic) b.addEventListener('pointerleave', () => gsap.to(b, { x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' }), sig);
      });
      const lantern = $('.fx-lantern');
      if (lantern) {
        const lx = gsap.quickTo(lantern, 'x', { duration: 0.9, ease: 'power3.out' }), ly = gsap.quickTo(lantern, 'y', { duration: 0.9, ease: 'power3.out' });
        window.addEventListener('pointermove', e => {
          lx(e.clientX); ly(e.clientY); lantern.classList.add('on');
          mouse.tx = e.clientX / (window.innerWidth || 1) - 0.5; mouse.ty = e.clientY / (window.innerHeight || 1) - 0.5;
        }, sig);
      }
    }
    const acc = $('#application-form');
    if (acc) acc.addEventListener('toggle', () => {
      if (acc.open) gsap.fromTo('.application-panel', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', clearProps: 'all' });
    }, { signal: listeners.signal });
  }

  /* ---------- 場面表示（PC・タブレット）：画面中央にある場面を数フレームごとに実測 ---------- */
  let labelState = { idx: -1, els: [], frame: 0 };
  function buildLabels() {
    labelState = { idx: -2, els: SCENES.map(([sel]) => $(sel)), frame: 0 };
    updateLabel(true);
  }
  function updateLabel(force) {
    const label = $('.scene-label');
    if (!label || (!force && (++labelState.frame % 6))) return;
    const mid = window.innerHeight * 0.55;
    let idx = -1;
    labelState.els.forEach((el, i) => { if (!el) return; const r = el.getBoundingClientRect(); if (r.top <= mid && r.bottom > mid) idx = i; });
    if (idx === labelState.idx) return;
    labelState.idx = idx;
    label.classList.toggle('on', idx >= 0);
    label.classList.toggle('moon', idx >= 0 && !!SCENES[idx][3]);
    if (idx >= 0) { $('.scene-jp', label).textContent = SCENES[idx][1]; $('.scene-en', label).textContent = SCENES[idx][2]; }
  }

  /* ---------- 背景と光（毎フレーム、スクロールから直接） ---------- */
  function buildScene() {
    const vh = k => () => '+=' + Math.round((window.innerHeight || 800) * k);
    S = {
      open: ScrollTrigger.create({ trigger: '.film-dusk', start: 'top bottom', end: 'top top' }),
      night: ScrollTrigger.create({ trigger: '.film-dusk', start: 'top top', end: vh(0.35) }),
      lights: ScrollTrigger.create({ trigger: '.interlude-lights', start: 'top top', end: vh(0.35) }),
      sand: ScrollTrigger.create({ trigger: '#basho', start: 'top 70%', endTrigger: '#taberu', end: 'top 40%' }),
      morning: ScrollTrigger.create({ trigger: '.interlude-morning', start: 'top bottom', end: 'bottom top' })
    };
  }
  const chain = (steps, fn) => steps.reduce((acc, [target, p]) => (p > 0 ? fn(acc, target, p) : acc), steps[0][0]);
  function applyScene() {
    if (!S) return { nf: 0, dust: rgb(DUST.day) };
    const p = k => smooth(S[k] ? S[k].progress : 0);
    const pO = p('open'), pN = p('night'), pL = p('lights'), pS = p('sand'), pM = p('morning');
    const bg = chain([[C.paper, 1], [C.sand, pO], [C.night, pN], [C.paper, pL], [C.warm, pS], [C.paper, pM]], (a, b, t) => mix(a, b, t));
    setVar('--page-bg', bg);
    const dark = contrast(bg, C.nightInk) > contrast(bg, C.ink);
    if (root.classList.contains('scene-dark') !== dark) root.classList.toggle('scene-dark', dark);
    const nf = pN * (1 - pL);
    setVar('--night-f', nf);
    setVar('--vig', nf * 0.5);
    const sunSteps = [[SUN.day, 1], [SUN.dusk, pO], [SUN.night, pN], [SUN.day, pL], [SUN.evening, pS], [SUN.morning, pM]];
    const sun = chain(sunSteps, (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t), mix(a[3], b[3], t)]);
    setVar('--sx', sun[0].toFixed(2) + '%'); setVar('--sy', sun[1].toFixed(2) + '%'); setVar('--sr', sun[2].toFixed(2) + '%'); setVar('--sun', sun[3]);
    const dust = chain([[DUST.day, 1], [DUST.dusk, pO], [DUST.night, pN], [DUST.day, pL], [DUST.evening, pS], [DUST.morning, pM]], (a, b, t) => mix(a, b, t));
    return { nf, dust: rgb(dust) };
  }

  function frame(time) {
    if (lenis) lenis.raf(time * 1000);
    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;
    const st = applyScene();
    if (particles) particles.render(time, { color: st.dust, nf: st.nf, mx: mouse.x, my: mouse.y });
    updateLabel(false);
  }

  /* ---------- 開始・停止 ---------- */
  function teardown() {
    if (tickFn) gsap.ticker.remove(tickFn);
    tickFn = null;
    if (lenis) { lenis.destroy(); lenis = null; }
    if (listeners) { listeners.abort(); listeners = null; }
    if (ctx) { ctx.revert(); ctx = null; }
    if (particles) particles.stop();
    S = null; records = [];
    root.classList.remove('motion-ready', 'motion-boot', 'scene-dark');
    ['--page-bg', '--night-f', '--vig', '--sx', '--sy', '--sr', '--sun', '--screen-t', '--screen-r', '--screen-b', '--screen-l'].forEach(v => { root.style.removeProperty(v); delete cache[v]; });
    labelState = { idx: -1, els: [], frame: 0 };
    const label = $('.scene-label'); if (label) label.classList.remove('on', 'moon');
    api.active = false;
  }

  function start() {
    const anchor = captureAnchor();
    const keepVisible = ctx !== null || window.scrollY > 10;
    teardown();
    try {
      prepare();
      root.classList.add('motion-ready');
      api.active = true;
      const mobile = window.innerWidth <= 760;
      listeners = new AbortController();
      ScrollTrigger.config({ ignoreMobileResize: true });
      if (window.Lenis) {
        lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
        lenis.on('scroll', ScrollTrigger.update);
      }
      const canvas = $('#fx-particles');
      particles = canvas && window.RetreatParticles ? RetreatParticles.create(canvas, { mobile }) : null;
      if (particles) particles.start();
      ctx = gsap.context(() => {
        buildScene();
        buildHero(mobile);
        buildFilm(mobile);
        buildLights();
        buildReveals(mobile, keepVisible);
        buildPhotos(mobile, keepVisible);
        buildPanels(mobile);
        buildGhosts();
        buildLabels();
        buildPointer();
      });
      tickFn = time => frame(time);
      gsap.ticker.add(tickFn);
      gsap.ticker.lagSmoothing(0);
      window.addEventListener('resize', () => particles && particles.resize(), { signal: listeners.signal, passive: true });
      ScrollTrigger.refresh();
      restoreAnchor(anchor);
      frame(gsap.ticker.time);
    } catch (err) {
      teardown();
      if (window.console) console.error('RetreatMotion: 演出を開始できませんでした', err);
    }
  }

  function stop() {
    const wasActive = api.active || root.classList.contains('motion-boot');
    const anchor = wasActive ? captureAnchor() : null;
    teardown();
    if (wasActive) { ScrollTrigger.refresh(); restoreAnchor(anchor); }
  }

  /* 長距離の移動は短い溶暗で直接移動（画像読み込みと再計算の干渉を避ける） */
  function scrollTo(top, immediate, fade) {
    if (!lenis) { window.scrollTo({ top, behavior: immediate ? 'instant' : 'smooth' }); return; }
    if (!immediate) { lenis.scrollTo(top, { duration: 1.3, easing: t => 1 - Math.pow(1 - t, 4) }); return; }
    const veil = $('.fx-fade');
    if (!fade || !veil) { lenis.scrollTo(top, { immediate: true, force: true }); ScrollTrigger.update(); return; }
    gsap.timeline()
      .set(veil, { autoAlpha: 0 })
      .to(veil, { autoAlpha: 1, duration: 0.22, ease: 'power1.in' })
      .add(() => { lenis.scrollTo(top, { immediate: true, force: true }); ScrollTrigger.update(); })
      .to(veil, { autoAlpha: 0, duration: 0.45, ease: 'power1.out', delay: 0.05 });
  }

  function finishFor(target) {
    records.forEach(r => { if (r.items.some(i => i === target || i.contains(target))) r.finish(); });
  }

  Object.assign(api, {
    start, stop, scrollTo, finishFor,
    refresh() { if (api.active) ScrollTrigger.refresh(); },
    pauseScroll(paused) { if (lenis) { if (paused) lenis.stop(); else lenis.start(); } }
  });
})();
