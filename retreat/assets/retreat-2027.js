(() => {
  'use strict';
  const $ = s => document.querySelector(s), all = s => [...document.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const accordion = $('#application-form'), form = $('#retreatForm'), summary = $('#formToggle');
  const menu = $('#menuOverlay'), menuButton = $('#menuBtn'), motionButton = $('#motionToggle');
  let userStopped = false, sending = false;
  let navigationUntil = 0, refreshTimer;
  const motion = () => window.RetreatMotion || null;
  try { userStopped = sessionStorage.getItem('retreat-motion') === 'off'; } catch (_) {}
  const motionOff = () => reduced.matches || userStopped;
  const refresh = () => {
    clearTimeout(refreshTimer);
    const wait = navigationUntil - performance.now();
    if (wait > 0) { refreshTimer = setTimeout(refresh, wait + 50); return; }
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  };
  $('#year').textContent = String(new Date().getFullYear());
  function go(target) {
    const top = Math.max(0, target.getBoundingClientRect().top + scrollY - $('#siteNav').offsetHeight - 16);
    // Long jumps arrive directly. Loading images along a long smooth scroll can
    // otherwise refresh ScrollTrigger and interrupt Safari before it arrives.
    const immediate = motionOff() || Math.abs(top - scrollY) > innerHeight * 2;
    navigationUntil = performance.now() + (immediate ? 100 : 900);
    if (!target.matches('a,button,input,summary,textarea,select')) target.setAttribute('tabindex','-1');
    target.focus({preventScroll:true});
    if (motion()?.active) motion().scrollTo(top, immediate, immediate && !motionOff());
    else window.scrollTo({top, behavior:immediate?'instant':'smooth'});
  }
  function setFormOpen(open, target = summary) {
    // Safari cancels a smooth scroll when the disclosure's layout is refreshed.
    // Wait for the toggle handler to finish before moving focus and scrolling.
    const move = () => requestAnimationFrame(() => go(target));
    if (accordion.open === open) move();
    else { accordion.addEventListener('toggle',move,{once:true}); accordion.open = open; }
  }
  function closeMenu(restore = true) {
    menu.hidden = true; menuButton.setAttribute('aria-expanded','false'); motion()?.pauseScroll(false);
    document.body.classList.remove('menu-open'); $('#main-content').inert = false; $('footer').inert = false;
    if (restore) menuButton.focus({preventScroll:true});
  }
  menuButton.addEventListener('click', () => {
    menu.hidden = false; menuButton.setAttribute('aria-expanded','true'); document.body.classList.add('menu-open'); motion()?.pauseScroll(true);
    $('#main-content').inert = true; $('footer').inert = true; $('.menu-close').focus();
  });
  $('.menu-close').addEventListener('click', () => closeMenu());
  menu.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
    if (e.key !== 'Tab') return;
    const controls = [...menu.querySelectorAll('a,button')], first = controls[0], last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  all('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const target = $(a.getAttribute('href')); if (!target) return; e.preventDefault();
    if (!menu.hidden) closeMenu(false);
    if (a.hasAttribute('data-open-form')) setFormOpen(true);
    else go(target);
    history.replaceState(null,'',a.getAttribute('href'));
  }));
  accordion.addEventListener('toggle', () => {
    summary.querySelector('span:first-child').textContent = accordion.open?'申し込みフォームを閉じる':'申し込みフォームへ';
    $('.accordion-icon').textContent = accordion.open?'−':'＋';
    refresh();
  });
  $('[data-close-form]').addEventListener('click', () => setFormOpen(false));
  function revealHash() {
    if (['#application-form','#retreatForm','#f-name','#f-email'].includes(location.hash)) {
      setFormOpen(true, location.hash.startsWith('#f-') ? $(location.hash) : summary);
    }
  }
  revealHash(); addEventListener('hashchange',revealHash);

  const dates = all('input[name="参加可能な日程[]"]');
  function validateDates(show = false) {
    const valid = dates.some(i => i.checked && !i.disabled);
    dates[0].setCustomValidity(valid?'':'参加可能な日程を1つ以上お選びください。');
    if (valid || show) $('#dates-error').hidden = valid;
    dates.forEach(i => { if (!valid && show) i.setAttribute('aria-invalid','true'); else i.removeAttribute('aria-invalid'); });
    return valid;
  }
  dates.forEach(i => i.addEventListener('change', () => validateDates())); validateDates();
  form.addEventListener('invalid', e => { accordion.open = true; if (dates.includes(e.target)) validateDates(true); },true);
  form.addEventListener('submit',async e => {
    e.preventDefault(); if (sending || !validateDates(true) || !form.reportValidity()) return;
    const submit = $('#submitBtn'), status = $('#formStatus'); sending = true; submit.disabled = true;
    submit.querySelector('span').textContent = '送信しています…'; status.textContent = 'そのままお待ちください。'; form.setAttribute('aria-busy','true');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),20000);
    try {
      const response = await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(form)).toString(),signal:controller.signal});
      if (!response.ok) throw new Error('Submission not accepted');
      const destination = new URL(form.action);
      if (['localhost','127.0.0.1'].includes(location.hostname)) destination.searchParams.set('preview','1');
      location.assign(destination.href);
    } catch (_) {
      status.textContent = '送信を完了できませんでした。入力内容はそのまま残っています。通信環境を確認して再度お試しいただくか、お問い合わせよりご連絡ください。';
      sending = false; submit.disabled = false; submit.querySelector('span').textContent = 'お申し込み内容を送信する'; form.removeAttribute('aria-busy');
    } finally { clearTimeout(timeout); }
  });
  addEventListener('pageshow',e => {
    validateDates(); if (!e.persisted) return;
    sending = false; $('#submitBtn').disabled = false; $('#submitBtn span').textContent = 'お申し込み内容を送信する';
    $('#formStatus').textContent = ''; form.removeAttribute('aria-busy'); refresh();
  });
  let queued = false;
  function scrollState() {
    queued = false; $('#siteNav').classList.toggle('scrolled',scrollY>40);
    const range = document.documentElement.scrollHeight-innerHeight;
    $('#progressBar').style.transform = `scaleX(${range>0?scrollY/range:0})`;
  }
  addEventListener('scroll',() => { if (!queued) { queued = true; requestAnimationFrame(scrollState); } },{passive:true}); scrollState();
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      all('.nav-links a').forEach(a => {
        const active = a.hash === '#'+entry.target.id; a.classList.toggle('active',active);
        if (active) a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current');
      });
    }),{rootMargin:'-20% 0px -65% 0px'});
    all('.nav-links a').forEach(a => { if ($(a.hash)) observer.observe($(a.hash)); });
  }

  // 演出は assets/retreat-motion.js が担う。ここでは開始・停止と停止ボタンの表示だけを扱う。
  function startMotion() {
    const available = !!(window.gsap && window.ScrollTrigger && motion());
    const enabled = available && !motionOff();
    document.documentElement.classList.toggle('motion-off',motionOff());
    motionButton.hidden = reduced.matches || !available;
    motionButton.setAttribute('aria-pressed',String(userStopped));
    motionButton.textContent = userStopped?'演出を再生する':'演出を止める';
    if (enabled) motion().start();
    else { motion()?.stop(); document.documentElement.classList.remove('motion-boot','motion-ready'); }
  }
  motionButton.addEventListener('click',() => { userStopped=!userStopped; try { sessionStorage.setItem('retreat-motion',userStopped?'off':'on'); } catch (_) {} startMotion(); });
  // A keyboard user can reach a link before its containing group has entered.
  // Finish that entrance immediately so the focused control remains readable.
  addEventListener('focusin',event => motion()?.finishFor(event.target));
  reduced.addEventListener('change',startMotion); startMotion();
  document.fonts?.ready.then(refresh); all('img').forEach(img => img.addEventListener('load',refresh,{once:true})); addEventListener('load',refresh);
  let resizeTimer, layoutWidth = innerWidth;
  addEventListener('resize',() => {
    // Safari's collapsing address bar changes height, not the reading layout.
    if (innerWidth === layoutWidth) return;
    clearTimeout(resizeTimer); resizeTimer=setTimeout(() => { layoutWidth=innerWidth; startMotion(); },220);
  });
})();
