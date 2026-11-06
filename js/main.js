/* ==========================================================================
   НБУ · Культурное наследие Узбекистана — playback + scroll transition
   Vanilla JS, no dependencies.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Config (tweak here, not in the logic below) ---------- */
  var CONFIG = {
    mobileMax: 899,               // px: below this the card sits on top, text below; above: card right, text left
    shrinkShare: 0.7,             // share of the pinned scroll distance used by the shrink; the rest is a "reading hold"
    cardRadius: { mobile: 20, desktop: 28 },
    pauseWhenOffscreen: true,     // pause (and resume) the video when the stage is scrolled out of view
    hideSoundControlIfSilent: true // hide the sound button when the browser can tell the file has no audio track
  };

  var root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };
  var video = $('hero-video'), stage = $('stage'), sticky = $('sticky'), win = $('window'),
      intro = $('intro'), soundBtn = $('sound-btn'), gate = $('gate'), header = $('site-header');
  if (!video || !stage) return;

  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var easeInOut = function (t) { return 0.5 - Math.cos(Math.PI * t) / 2; };

  /* ======================================================================
     1. VIDEO PLAYBACK + AUDIO
     Order of attempts: play with sound → (if the browser refuses) show the
     tap-to-start gate. We never silently fall back to muted playback.
     ====================================================================== */
  var gateShown = false;
  var inView = true;

  video.controls = false;                 // native controls are only a no-JS fallback
  video.removeAttribute('controls');
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('webkit-playsinline', '');
  video.disablePictureInPicture = true;
  try { video.disableRemotePlayback = true; } catch (e) { /* not supported */ }

  function setSoundUi() {
    var on = !video.muted && video.volume > 0;
    soundBtn.classList.toggle('is-on', on);
    soundBtn.setAttribute('aria-label', on ? 'Выключить звук' : 'Включить звук');
  }

  function showGate() {
    if (gateShown) return;
    gateShown = true;
    gate.hidden = false;
    soundBtn.hidden = true;
  }
  function hideGate() {
    gateShown = false;
    gate.hidden = true;
  }

  // Returns true only when the browser says explicitly that there is no audio track.
  function knownSilent() {
    if ('mozHasAudio' in video) return video.mozHasAudio === false;
    if (video.audioTracks && typeof video.audioTracks.length === 'number') return video.audioTracks.length === 0;
    if ('webkitAudioDecodedByteCount' in video) return video.currentTime > 1 && video.webkitAudioDecodedByteCount === 0;
    return false;
  }

  function tryPlay() {
    var p;
    try { p = video.play(); } catch (e) { p = Promise.reject(e); }
    if (p && typeof p.then === 'function') {
      p.catch(function (err) {
        // NotAllowedError = autoplay-with-sound policy. Anything else (Abort, NotSupported) is not a gesture problem.
        if (err && err.name === 'NotAllowedError') showGate();
      });
    }
  }

  function start() {
    video.muted = false;                  // ask for sound
    video.volume = 1;
    tryPlay();
  }

  video.addEventListener('playing', function () {
    hideGate();
    setSoundUi();
    soundBtn.hidden = false;
    if (CONFIG.hideSoundControlIfSilent) {
      setTimeout(function () { if (knownSilent()) soundBtn.hidden = true; }, 1200);
    }
    hintPlaying = true; evaluateHint();   // scroll hint: arm its timer only once playback has really started
  });
  video.addEventListener('volumechange', setSoundUi);

  gate.addEventListener('click', function () { start(); });     // user gesture → sound is allowed
  win.addEventListener('click', function () { if (gateShown) start(); }); // tapping the shrunken card works too

  soundBtn.addEventListener('click', function () {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 1;
    setSoundUi();
  });

  function syncPlayback() {
    var shouldPlay = !document.hidden && (inView || !CONFIG.pauseWhenOffscreen);
    if (shouldPlay && video.paused && !gateShown) {
      tryPlay();                          // resumes with whatever sound state the visitor chose; a refusal shows the gate
    } else if (!shouldPlay && !video.paused) {
      video.pause();
    }
  }
  document.addEventListener('visibilitychange', syncPlayback);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      syncPlayback();
    }).observe(stage);
  }

  video.addEventListener('error', function () {      // missing/broken file: leave the poster, no dead UI
    hideGate(); soundBtn.hidden = true;
  });

  /* ======================================================================
     1b. SCROLL HINT  («Прокрутите вниз» + one bouncing chevron)
     Shown HINT_DELAY ms after the video has really started playing, and only
     while the page is at the very top. Hidden at once when the page starts to
     move, or when playback stops / the gate is up. Scroll state comes from
     update() below (setHintAtTop) — there is no second scroll listener.
     One timer id (hintTimer) guarantees there are never parallel timers.
     ====================================================================== */
  var hint = $('scroll-hint');
  var HINT_DELAY = 3000;
  var hintPlaying = false;    // true after the 'playing' event, false on pause / error
  var hintAtTop = true;       // fed by update()
  var hintTimer = 0;          // the single pending timer (0 = none)
  var hintShown = false;

  function hintAllowed() {
    return !!hint && hintPlaying && hintAtTop && !gateShown && !document.hidden && !video.paused;
  }
  function clearHintTimer() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = 0; }
  }
  function setHintVisible(on) {
    if (hintShown === on) return;
    hintShown = on;
    hint.classList.toggle('is-visible', on);
  }
  function evaluateHint() {
    if (!hint) return;
    if (!hintAllowed()) { clearHintTimer(); setHintVisible(false); return; }
    if (hintShown || hintTimer) return;               // already visible, or already counting down
    hintTimer = setTimeout(function () {
      hintTimer = 0;
      if (hintAllowed()) setHintVisible(true);
    }, HINT_DELAY);
  }
  function setHintAtTop(atTop) {
    if (hintAtTop === atTop) return;
    hintAtTop = atTop;
    evaluateHint();
  }
  ['pause', 'error', 'emptied'].forEach(function (name) {
    video.addEventListener(name, function () { hintPlaying = false; evaluateHint(); });
  });
  document.addEventListener('visibilitychange', evaluateHint);

  start();                                            // attempt 1: with sound

  /* ======================================================================
     2. SCROLL-DRIVEN SHRINK  (position: sticky + transforms + rAF)
     Window (clip-path) animates from full viewport → portrait card.
     The video element itself is moved/scaled with a single transform, so its
     proportions never change; the window just reveals more of it as it shrinks.
     ====================================================================== */
  var reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var geo = null, ticking = false, lastKey = '', probe = null;

  function stageActive() { return root.classList.contains('is-stage'); }

  function safeBottom() {
    if (!probe) {
      probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)';
      document.body.appendChild(probe);
    }
    return parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  }

  function computeGeo() {
    var vw = sticky.clientWidth, vh = sticky.clientHeight;
    var bw = video.videoWidth || 1080, bh = video.videoHeight || 1920;   // natural size = layout box of the video
    var ar = bw / bh;
    var hh = header ? header.offsetHeight : 56;
    var mobile = vw <= CONFIG.mobileMax;
    var fx = parseFloat(video.getAttribute('data-focus-x')); fx = isNaN(fx) ? 0.5 : fx / 100;
    var fy = parseFloat(video.getAttribute('data-focus-y')); fy = isNaN(fy) ? 0.4 : fy / 100;

    // Start rect: video "covers" the viewport
    var coverW = Math.max(vw, vh * ar), coverH = coverW / ar;
    var start = { x: (vw - coverW) * fx, y: (vh - coverH) * fy, w: coverW, h: coverH };

    // End rect: a card with the video's own aspect ratio
    var cardH, cardW, cardX, cardY, textTop = null;
    if (mobile) {
      cardH = Math.min(vh * (vh < 700 ? 0.38 : 0.46), (vw * 0.6) / ar);
      cardW = cardH * ar;
      cardX = (vw - cardW) / 2;
      cardY = hh + 16;
      textTop = cardY + cardH + 24;
    } else {
      cardH = Math.min((vh - hh) * 0.76, (vw * 0.36) / ar);
      cardW = cardH * ar;
      var gutter = clamp(vw * 0.05, 20, 40);
      var cw = Math.min(vw - 2 * gutter, 1120), left = (vw - cw) / 2;   // matches .container in CSS
      var colW = cw * 0.4;                                   // right column
      cardX = left + cw - colW + (colW - cardW) / 2;
      cardY = hh + (vh - hh - cardH) / 2;
    }
    var end = { x: cardX, y: cardY, w: cardW, h: cardH };

    geo = { vw: vw, vh: vh, bw: bw, bh: bh, start: start, end: end, mobile: mobile, textTop: textTop,
            radius: mobile ? CONFIG.cardRadius.mobile : CONFIG.cardRadius.desktop, safeB: safeBottom() };

    video.style.width = bw + 'px';
    video.style.height = bh + 'px';
    if (mobile && textTop !== null) intro.style.top = textTop + 'px'; else intro.style.top = '';
    lastKey = '';
  }

  function update() {
    ticking = false;
    // Reduced-motion / baseline layout has no stage progress, so fall back to the page offset for the scroll hint.
    if (!stageActive()) setHintAtTop((window.pageYOffset || 0) <= 0);
    if (!geo) return;
    var rect = stage.getBoundingClientRect();
    var dist = Math.max(1, rect.height - geo.vh);
    var raw = clamp(-rect.top / dist, 0, 1);
    var q = clamp(raw / CONFIG.shrinkShare, 0, 1);
    if (stageActive()) setHintAtTop(q === 0);          // scroll hint: any movement away from the top hides it
    var key = q.toFixed(4);
    if (key === lastKey) return;                  // nothing changed (hold phase / stage off-screen)
    lastKey = key;

    var e = easeInOut(q), s = geo.start, t = geo.end;

    // window (clip) rect
    var wx = lerp(0, t.x, e), wy = lerp(0, t.y, e);
    var ww = lerp(geo.vw, t.w, e), wh = lerp(geo.vh, t.h, e);
    var r = geo.radius * e;
    win.style.clipPath = e === 0 ? 'none'
      : 'inset(' + wy.toFixed(2) + 'px ' + (geo.vw - wx - ww).toFixed(2) + 'px ' + (geo.vh - wy - wh).toFixed(2) + 'px ' + wx.toFixed(2) + 'px round ' + r.toFixed(2) + 'px)';

    // video rect → single transform
    var vx = lerp(s.x, t.x, e), vy = lerp(s.y, t.y, e), vs = lerp(s.w, t.w, e) / geo.bw;
    video.style.transform = 'translate3d(' + vx.toFixed(2) + 'px,' + vy.toFixed(2) + 'px,0) scale(' + vs.toFixed(5) + ')';

    // sound button rides the bottom-right corner of the window
    var inset = lerp(16, 10, e), sb = geo.safeB * (1 - e);
    soundBtn.style.transform = 'translate3d(' + (wx + ww - inset - 44).toFixed(1) + 'px,' + (wy + wh - inset - sb - 44).toFixed(1) + 'px,0)';

    // tap-to-start gate fades as soon as the user starts scrolling
    if (gateShown) {
      gate.style.opacity = String(clamp(1 - q * 5, 0, 1));
      gate.style.pointerEvents = q > 0.15 ? 'none' : '';
    }

    // intro text
    var tt = clamp((q - 0.65) / 0.35, 0, 1), te = easeInOut(tt);
    intro.style.opacity = te.toFixed(3);
    intro.style.transform = 'translate3d(0,' + ((1 - te) * 22).toFixed(1) + 'px,0)';
    intro.classList.toggle('is-active', tt > 0.6);

    root.classList.toggle('is-docked', q > 0.8);
  }

  function request() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  function layout() { if (stageActive()) { computeGeo(); request(); } }

  function resetInline() {
    ['clipPath'].forEach(function (k) { win.style[k] = ''; });
    video.style.cssText = ''; soundBtn.style.cssText = ''; intro.style.cssText = ''; gate.style.cssText = '';
    intro.classList.remove('is-active');
    root.classList.remove('is-ready', 'is-docked');
  }

  function applyMode() {
    var wantStage = !reduceMq.matches;
    root.classList.toggle('is-stage', wantStage);
    if (wantStage) {
      root.classList.add('is-ready');
      computeGeo(); request();
    } else {
      resetInline();
    }
  }

  var resizeRaf = 0;
  function onResize() {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(layout);
  }

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  video.addEventListener('loadedmetadata', layout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  if (reduceMq.addEventListener) reduceMq.addEventListener('change', applyMode);
  else if (reduceMq.addListener) reduceMq.addListener(applyMode);

  applyMode();

  /* ======================================================================
     3. REVEAL ON SCROLL
     ====================================================================== */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }
})();
