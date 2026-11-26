/* Machine Materials Lab: small enhancements. The site works without JavaScript. */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- mobile menu
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        toggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
        toggle.focus();
      }
    });
  }

  // ---- homepage header: research photos that cross-fade. Only the first photo loads with the page;
  // each next one is fetched while the current one shows. With reduced motion they do not advance
  // on their own, but the buttons still work.
  (function () {
    var hero = document.querySelector(".hero");
    var controls = hero && hero.querySelector(".hero-controls");
    if (!controls) return;
    var DELAY = 7000;
    var imgs = [].slice.call(hero.querySelectorAll(".hero-img"));
    var dots = [].slice.call(hero.querySelectorAll(".hero-dot"));
    var credit = hero.querySelector(".hero-credit");
    var pauseBtn = hero.querySelector(".hero-pause");
    var cur = 0, wanted = 0, timer = null;
    var userPaused = reduceMotion, onScreen = true;
    hero.style.setProperty("--hero-delay", DELAY + "ms");
    controls.hidden = false;

    function load(i) {
      var im = imgs[i];
      if (!im.getAttribute("src") && im.getAttribute("data-src")) im.src = im.getAttribute("data-src");
      return im;
    }
    function whenReady(im, cb) {
      if (im.decode) { im.decode().then(cb, cb); return; }   // loaded and decoded, so the fade is smooth
      if (im.complete && im.naturalWidth) return cb();
      var done = function () { im.removeEventListener("load", done); im.removeEventListener("error", done); cb(); };
      im.addEventListener("load", done);
      im.addEventListener("error", done);
    }
    function running() { return !userPaused && onScreen && !document.hidden; }
    function schedule() {
      clearTimeout(timer);
      var dot = dots[cur];
      dot.classList.remove("is-timing");
      hero.classList.toggle("is-playing", running());
      if (!running()) return;
      void dot.offsetWidth;            // restart the progress bar
      dot.classList.add("is-timing");
      timer = setTimeout(function () { show(cur + 1); }, DELAY);
    }
    function show(i) {
      i = (i + imgs.length) % imgs.length;
      wanted = i;
      clearTimeout(timer);
      var im = load(i);
      whenReady(im, function () {
        if (wanted !== i) return;      // another photo was chosen meanwhile
        if (i !== cur) {
          imgs[cur].classList.remove("is-active");
          imgs[cur].setAttribute("aria-hidden", "true");
          dots[cur].removeAttribute("aria-current");
          dots[cur].classList.remove("is-timing");
          cur = i;
          im.classList.add("is-active");
          im.removeAttribute("aria-hidden");
          dots[i].setAttribute("aria-current", "true");
          credit.querySelector("span").textContent = im.getAttribute("data-caption");
          credit.setAttribute("href", im.getAttribute("data-link") || "#");
        }
        load((i + 1) % imgs.length);  // fetch the next photo in advance
        schedule();
      });
    }
    function setPaused(p) {
      userPaused = p;
      hero.classList.toggle("is-paused", p);
      pauseBtn.setAttribute("aria-label", p ? "Play the photos" : "Pause the photos");
      schedule();
    }

    dots.forEach(function (d, i) { d.addEventListener("click", function () { show(i); }); });
    pauseBtn.addEventListener("click", function () { setPaused(!userPaused); });
    document.addEventListener("visibilitychange", schedule);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        schedule();
      }).observe(hero);
    }
    setPaused(userPaused);
    // start fetching the second photo once the page itself has loaded
    if (document.readyState === "complete") load(1);
    else window.addEventListener("load", function () { load(1); });
  })();

  // ---- YouTube: load the player only when clicked (faster, and no Google requests before that)
  document.querySelectorAll(".yt-lite").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-yt-id");
      var list = btn.getAttribute("data-yt-list");
      var src = list
        ? "https://www.youtube-nocookie.com/embed/videoseries?list=" + encodeURIComponent(list) + "&autoplay=1"
        : "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?autoplay=1&rel=0";
      var iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.title = "YouTube video";
      iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      iframe.allowFullscreen = true;
      btn.replaceWith(iframe);
    });
  });

  // ---- publications search
  var filter = document.getElementById("pub-filter");
  if (filter) {
    var pubs = Array.prototype.slice.call(document.querySelectorAll(".pub"));
    var years = Array.prototype.slice.call(document.querySelectorAll(".pub-year"));
    var count = document.getElementById("pub-count");
    var empty = document.getElementById("pub-empty");
    var total = pubs.length;
    pubs.forEach(function (li) { li._text = li.textContent.toLowerCase().replace(/\s+/g, " "); });
    filter.addEventListener("input", function () {
      var terms = filter.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      var shown = 0;
      pubs.forEach(function (li) {
        var ok = terms.every(function (t) { return li._text.indexOf(t) !== -1; });
        li.hidden = !ok;
        if (ok) shown++;
      });
      years.forEach(function (y) { y.hidden = !y.querySelector(".pub:not([hidden])"); });
      count.textContent = terms.length ? shown + " of " + total : total + " publications";
      empty.hidden = shown > 0;
    });
  }

  // ---- image viewer: click a picture in a post, the gallery, or a group photo to enlarge it
  var lb = document.querySelector(".lightbox");
  var zoomables = Array.prototype.slice.call(
    document.querySelectorAll("[data-zoom], .prose img, .group-photo img, .about-photo img"));
  if (lb && typeof lb.showModal === "function" && zoomables.length) {
    var lbImg = lb.querySelector(".lb-img");
    var lbCap = lb.querySelector(".lb-caption");
    var current = 0;
    var showPicture = function (i) {
      current = (i + zoomables.length) % zoomables.length;
      var el = zoomables[current];
      lbImg.src = el.currentSrc || el.src;
      lbImg.alt = el.alt || "";
      var cap = el.getAttribute("data-caption") || el.alt || "";
      if (/^(dsc|img|pxl|image|picture)[\s_-]*\d*$/i.test(cap)) cap = "";  // camera file names
      lbCap.textContent = cap;
      var link = el.getAttribute("data-link");
      if (link) {
        var a = document.createElement("a");
        a.href = link;
        a.textContent = "Read more →";
        if (a.host && a.host !== location.host) { a.target = "_blank"; a.rel = "noopener"; }  // other website
        if (cap) lbCap.appendChild(document.createTextNode(" · "));
        lbCap.appendChild(a);
      }
    };
    zoomables.forEach(function (el, i) {
      var target = el.closest("button") || el;
      target.addEventListener("click", function (e) {
        e.preventDefault();
        showPicture(i);
        lb.classList.toggle("is-single", zoomables.length < 2);
        lb.showModal();
      });
    });
    lb.querySelector(".lb-close").addEventListener("click", function () { lb.close(); });
    lb.querySelector(".lb-prev").addEventListener("click", function () { showPicture(current - 1); });
    lb.querySelector(".lb-next").addEventListener("click", function () { showPicture(current + 1); });
    lb.addEventListener("click", function (e) {
      if (e.target === lb || e.target.classList.contains("lb-figure")) lb.close();
    });
    lb.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") showPicture(current - 1);
      if (e.key === "ArrowRight") showPicture(current + 1);
    });
  }

  // ---- hero: three interactive metamaterial animations
  var canvas = document.querySelector("canvas.lattice");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var fig = canvas.closest(".hero-visual");
  var buttons = Array.prototype.slice.call(fig.querySelectorAll("[data-visual]"));
  var captionText = fig.querySelector(".visual-text");
  var captionLink = fig.querySelector(".visual-link");
  var W = 0, H = 0, col = {};
  var mode = null, param = 0, goal = 0, pointer = null;
  var visible = true, raf = 0, last = performance.now(), t0 = last, autoTimer = 0;

  function readColors() {
    var cs = getComputedStyle(root);
    ["ink", "accent", "muted", "line", "bg", "surface-2"].forEach(function (k) {
      col[k] = cs.getPropertyValue("--" + k).trim();
    });
  }

  // wavelength (nm) -> visible colour
  function spectral(l) {
    var r = 0, g = 0, b = 0;
    if (l < 440) { r = (440 - l) / 60; b = 1; }
    else if (l < 490) { g = (l - 440) / 50; b = 1; }
    else if (l < 510) { g = 1; b = (510 - l) / 20; }
    else if (l < 580) { r = (l - 510) / 70; g = 1; }
    else if (l < 645) { r = 1; g = (645 - l) / 65; }
    else { r = 1; }
    var f = l < 420 ? 0.3 + 0.7 * (l - 380) / 40 : l > 700 ? 0.3 + 0.7 * (780 - l) / 80 : 1;
    return "rgb(" + [r, g, b].map(function (c) { return Math.round(255 * Math.pow(Math.max(0, c * f), 0.8)); }).join(",") + ")";
  }

  var MODES = {
    // Rotating squares. Squares are hinged at their corners and neighbours counter-rotate by
    // +/- theta; the centre spacing L = s (cos theta + sin theta) grows in every direction as the
    // lattice opens: a negative Poisson's ratio (auxetic).
    squares: {
      start: 0.42,
      idle: function (t) { return 0.40 + 0.34 * Math.sin(t / 1600); },
      fromPointer: function (f) { return 0.02 + f * 0.76; },
      draw: function (theta) {
        var s = Math.min(W, H) / 8.2;
        var L = s * (Math.cos(theta) + Math.sin(theta));
        var n = Math.ceil(Math.max(W, H) / 2 / L) + 1;
        for (var i = -n; i <= n; i++) {
          for (var j = -n; j <= n; j++) {
            var sign = ((i + j) & 1) ? -1 : 1;
            ctx.save();
            ctx.translate(W / 2 + i * L, H / 2 + j * L);
            ctx.rotate(sign * theta);
            ctx.fillStyle = sign > 0 ? col.ink : col.accent;
            ctx.fillRect(-s / 2, -s / 2, s, s);
            ctx.restore();
          }
        }
      }
    },

    // Odd elasticity with two motorised hinges. Each motor applies a torque set by the angles of
    // both arms (angles counter-clockwise on screen):
    //   tau1 = -k dth1 - ka dth2,   tau2 = ka dth1 - k dth2.
    // The coupling ka is antisymmetric (non-reciprocal): push arm 1 and arm 2 follows; push arm 2
    // and arm 1 turns the other way. The pushed arm follows the push; the free arm relaxes
    // (overdamped) under its motor torque. Released, both spiral back to rest.
    odd: (function () {
      var KA = 0.8, RATE = 7, A = 0.5, AMAX = 0.6;      // ka / k, k / damping (1/s), push (rad)
      var th = [0, 0], drv = -1, target = 0, clock = 0, pf = null, hl = [0, 0];
      function torque(i) { return i === 0 ? -th[0] - KA * th[1] : KA * th[0] - th[1]; }
      function smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
      function bump(c, a, b) { return smooth((c - a) / 0.9) * smooth((b - c) / 0.9); }
      function geom() {
        return { x: [W / 2 - 0.15 * W, W / 2 + 0.15 * W], yb: H * 0.5, La: W * 0.19, rM: W * 0.055 };
      }
      // the idle demonstration: push arm 1 to the right, release, push arm 2 to the right, release
      function scripted(c) {
        c = c % 10;
        if (c >= 0.6 && c < 4.6) return [0, -A * bump(c, 0.6, 4.6)];
        if (c >= 5.2 && c < 9.2) return [1, -A * bump(c, 5.2, 9.2)];
        return [-1, 0];
      }
      // the pointer pushes the nearest arm, which leans towards it
      function fromX(f) {
        var g = geom(), xp = f * W, i = xp < W / 2 ? 0 : 1;
        return [i, -Math.max(-1, Math.min(1, (xp - g.x[i]) / (0.16 * W))) * AMAX];
      }
      function settle() {
        if (drv === 0) { th[0] = target; th[1] = KA * target; }
        else if (drv === 1) { th[1] = target; th[0] = -KA * target; }
        hl = [drv === 0 ? 1 : 0, drv === 1 ? 1 : 0];
      }
      function arrowHead(x, y, dx, dy, s) {
        ctx.beginPath();
        ctx.moveTo(x - s * dx + s * 0.6 * dy, y - s * dy - s * 0.6 * dx);
        ctx.lineTo(x, y);
        ctx.lineTo(x - s * dx - s * 0.6 * dy, y - s * dy + s * 0.6 * dx);
        ctx.stroke();
      }
      function arcArrow(x, y, r, a, color) {
        var a1 = -Math.PI / 2 - a, sg = a > 0 ? 1 : -1;
        ctx.beginPath();
        ctx.arc(x, y, r, -Math.PI / 2, a1, a > 0);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        arrowHead(x + r * Math.cos(a1), y + r * Math.sin(a1), sg * Math.sin(a1), -sg * Math.cos(a1), Math.max(6, W * 0.014));
      }
      // a few math glyphs: [text, kind], kind i = italic, n = upright, s = subscript, p = superscript
      function font(kind, fs) {
        var size = kind === "s" || kind === "p" ? fs * 0.68 : fs;
        return (kind === "i" || kind === "p" ? "italic " : "") + size.toFixed(1) + 'px "Source Serif 4", Georgia, "Times New Roman", serif';
      }
      function width(parts, fs) {
        return parts.reduce(function (w, p) { ctx.font = font(p[1], fs); return w + ctx.measureText(p[0]).width; }, 0);
      }
      function write(parts, x, y, fs, color, alpha) {
        if (alpha <= 0.01) return;
        var cx0 = x - width(parts, fs) / 2;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        parts.forEach(function (p) {
          ctx.font = font(p[1], fs);
          ctx.fillText(p[0], cx0, y + (p[1] === "s" ? fs * 0.28 : p[1] === "p" ? -fs * 0.34 : 0));
          cx0 += ctx.measureText(p[0]).width;
        });
        ctx.globalAlpha = 1;
      }
      function emph(parts, x, y, fs, h) {
        write(parts, x, y, fs, col.ink, 1 - h);
        write(parts, x, y, fs, col.accent, h);
      }
      function paren(x, yt, yb, side, w) {
        var xo = x + (side < 0 ? w : 0), xi = x + (side < 0 ? 0 : w);
        ctx.beginPath();
        ctx.moveTo(xo, yt);
        ctx.quadraticCurveTo(xi, (yt + yb) / 2, xo, yb);
        ctx.stroke();
      }
      function law(yL, fs) {
        var tau = [[["τ", "i"], ["1", "s"]], [["τ", "i"], ["2", "s"]]];
        var M = [[[["−", "n"], ["κ", "i"]], [["−", "n"], ["κ", "i"], ["a", "p"]]],
                 [[["κ", "i"], ["a", "p"]], [["−", "n"], ["κ", "i"]]]];
        var dth = [[["δθ", "i"], ["1", "s"]], [["δθ", "i"], ["2", "s"]]];
        var wT = width(tau[0], fs), wM = width(M[0][1], fs), wD = width(dth[0], fs);
        var pw = fs * 0.42, gap = fs * 0.55, cg = fs * 0.9, wEq = width([["=", "n"]], fs);
        var total = 6 * pw + wT + 2 * gap + wEq + gap + 2 * wM + cg + gap + wD + 2 * pw * 0.5;
        var x = W / 2 - total / 2, lh = fs * 1.4, yt = yL - lh * 1.05, ybt = yL + lh * 1.05;
        var rows = [yL - lh / 2, yL + lh / 2];
        ctx.textBaseline = "middle";
        ctx.strokeStyle = col.muted;
        ctx.lineWidth = 1.3;
        // (tau1, tau2)
        paren(x, yt, ybt, -1, pw * 0.7); x += pw;
        rows.forEach(function (y, r) { emph(tau[r], x + wT / 2, y, fs, hl[1 - r]); });
        x += wT; paren(x + pw * 0.3, yt, ybt, 1, pw * 0.7); x += pw + gap;
        write([["=", "n"]], x + wEq / 2, yL, fs, col.ink, 1); x += wEq + gap;
        // the matrix
        paren(x, yt, ybt, -1, pw * 0.7); x += pw;
        rows.forEach(function (y, r) {
          emph(M[r][0], x + wM / 2, y, fs, r === 1 ? hl[0] : 0);
          emph(M[r][1], x + wM + cg + wM / 2, y, fs, r === 0 ? hl[1] : 0);
        });
        x += 2 * wM + cg; paren(x + pw * 0.3, yt, ybt, 1, pw * 0.7); x += pw + gap * 0.5;
        // (dth1, dth2)
        paren(x, yt, ybt, -1, pw * 0.7); x += pw;
        rows.forEach(function (y, r) { write(dth[r], x + wD / 2, y, fs, col.ink, 1); });
        x += wD; paren(x + pw * 0.3, yt, ybt, 1, pw * 0.7);
        ctx.textBaseline = "alphabetic";
      }
      return {
        start: 0,
        reset: function () {
          th = [0, 0]; drv = -1; target = 0; clock = 0; pf = null; hl = [0, 0];
          if (reduceMotion) { drv = 0; target = -A; settle(); }
        },
        idle: function () { pf = null; return 0; },
        fromPointer: function (f) {
          pf = f;
          if (reduceMotion) { var d = fromX(f); drv = d[0]; target = d[1]; settle(); }
          return 1;
        },
        step: function (dt) {
          clock += dt;
          var d = pf === null ? scripted(clock) : fromX(pf);
          drv = d[0]; target = d[1];
          for (var n = 0; n < 2; n++) {
            var h = dt / 2;
            if (drv >= 0) th[drv] += (target - th[drv]) * (1 - Math.exp(-h * 9));
            for (var i = 0; i < 2; i++) if (i !== drv) th[i] += h * RATE * torque(i);
          }
          for (var k = 0; k < 2; k++) {
            var want = drv === k ? Math.min(1, Math.abs(th[k]) / 0.25) : 0;
            hl[k] += (want - hl[k]) * (1 - Math.exp(-dt * 6));
          }
        },
        draw: function () {
          var g = geom(), fs = Math.max(12, Math.min(19, W * 0.04));
          ctx.textAlign = "left";
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          // the bar that holds the two motors
          ctx.beginPath();
          ctx.moveTo(g.x[0], g.yb);
          ctx.lineTo(g.x[1], g.yb);
          ctx.strokeStyle = col.ink;
          ctx.lineWidth = g.rM * 0.7;
          ctx.stroke();
          for (var i = 0; i < 2; i++) {
            var x = g.x[i], phi = -Math.PI / 2 - th[i];
            var tx = x + g.La * Math.cos(phi), ty = g.yb + g.La * Math.sin(phi);
            // rest position
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(x, g.yb - g.rM);
            ctx.lineTo(x, g.yb - g.La);
            ctx.strokeStyle = col.muted;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.setLineDash([]);
            // arm
            ctx.beginPath();
            ctx.moveTo(x, g.yb);
            ctx.lineTo(tx, ty);
            ctx.strokeStyle = col.ink;
            ctx.lineWidth = W * 0.032;
            ctx.stroke();
            // motor, with its shaft turning
            ctx.beginPath();
            ctx.arc(x, g.yb, g.rM, 0, 2 * Math.PI);
            ctx.fillStyle = col.ink;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, g.yb, g.rM * 0.5, 0, 2 * Math.PI);
            ctx.fillStyle = col.bg;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x, g.yb);
            ctx.lineTo(x + g.rM * 0.5 * Math.cos(phi), g.yb + g.rM * 0.5 * Math.sin(phi));
            ctx.strokeStyle = col.ink;
            ctx.lineWidth = 2;
            ctx.stroke();
            // joint at the tip
            ctx.beginPath();
            ctx.arc(tx, ty, W * 0.02, 0, 2 * Math.PI);
            ctx.fillStyle = col.bg;
            ctx.fill();
            ctx.strokeStyle = col.ink;
            ctx.lineWidth = 2;
            ctx.stroke();
            // how far it turned: dark for the pushed arm, coloured for the response
            if (Math.abs(th[i]) > 0.03) arcArrow(x, g.yb, g.La + W * 0.045, th[i], i === drv ? col.ink : col.accent);
            write([[String(i + 1), "n"]], x, g.yb + g.rM + fs * 0.95, fs * 0.9, col.muted, 1);
          }
          // the push
          if (drv >= 0 && Math.abs(target) > 0.02) {
            var pphi = -Math.PI / 2 - th[drv], sg = target < 0 ? 1 : -1;
            var px = g.x[drv] + 0.62 * g.La * Math.cos(pphi), py = g.yb + 0.62 * g.La * Math.sin(pphi);
            var dx = -sg * Math.sin(pphi), dy = sg * Math.cos(pphi);
            var gap = W * 0.03, len = W * 0.09;
            var x0 = px - dx * (gap + len), y0 = py - dy * (gap + len), x1 = px - dx * gap, y1 = py - dy * gap;
            ctx.globalAlpha = Math.min(1, Math.abs(target) / 0.2);
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.strokeStyle = col.ink;
            ctx.lineWidth = 2.5;
            ctx.stroke();
            arrowHead(x1, y1, dx, dy, Math.max(7, W * 0.016));
            ctx.font = '13px "Source Sans 3", "Helvetica Neue", Arial, sans-serif';
            ctx.fillStyle = col.muted;
            ctx.textAlign = "center";
            ctx.fillText("push", (x0 + x1) / 2, Math.min(y0, y1) - 9);
            ctx.globalAlpha = 1;
          }
          ctx.textAlign = "left";
          law(H * 0.77, fs);
        }
      };
    })(),

    // Mechano-optical metasurface (ACS Photonics 2025): a rotating-squares variant in which every
    // tile is an ellipse and neighbouring ellipses are joined by thin beams. Stretching makes the
    // ellipses counter-rotate and spread apart in every direction (auxetic); the larger spacing
    // tunes the optical resonance, so the reflected colour shifts to the red.
    // The parameter is the strain, equal to the relative increase of the tile spacing.
    chameleon: {
      start: 0.15,
      idle: function (t) { return 0.19 + 0.18 * Math.sin(t / 2200); },
      fromPointer: function (f) { return f * 0.4; },
      draw: function (eps) {
        var s = W * 0.088;                                    // tile spacing at rest
        var theta = Math.asin(Math.min(1, (1 + eps) / Math.SQRT2)) - Math.PI / 4;  // so that L = s (1 + eps)
        var L = s * (Math.cos(theta) + Math.sin(theta));      // spacing of hinged tiles rotated by +/- theta
        var ea = s * 0.36, eb = s * 0.21;                     // ellipse semi-axes
        var tilt = 0.72;                                       // the plane is seen at an angle
        var cx = W / 2, cy = H * 0.6, R0 = W * 0.22;
        var lam = 450 + 200 * (eps / 0.4);
        var reflected = spectral(lam);
        // where a beam leaves the ellipse: on the ray towards the hinge at (s/2, s/2)
        var phiA = Math.PI / 4;
        var rA = ea * eb / Math.sqrt(Math.pow(eb * Math.cos(phiA), 2) + Math.pow(ea * Math.sin(phiA), 2));
        var bx = rA * Math.cos(phiA), by = rA * Math.sin(phiA);
        var n = Math.ceil(R0 / s) + 1;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, tilt);
        for (var j = -n; j <= n; j++) {
          for (var i = -n; i <= n; i++) {
            var rr = Math.sqrt(i * i + j * j) * s;
            if (rr > R0) continue;
            var sign = ((i + j) & 1) ? -1 : 1;
            var c = spectral(lam + 22 * (j * s / R0) - 10 * (i * s / R0));
            ctx.globalAlpha = 0.6 + 0.4 * (1 - rr / R0);
            ctx.save();
            ctx.translate(i * L, j * L);
            ctx.rotate(sign * theta);
            // beams to the four hinges shared with the neighbours
            ctx.beginPath();
            [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (d) {
              ctx.moveTo(d[0] * bx, d[1] * by);
              ctx.lineTo(d[0] * s / 2, d[1] * s / 2);
            });
            ctx.strokeStyle = c;
            ctx.lineWidth = s * 0.08;
            ctx.lineCap = "round";
            ctx.stroke();
            // the elliptical tile
            ctx.beginPath();
            ctx.ellipse(0, 0, ea, eb, 0, 0, 2 * Math.PI);
            ctx.fillStyle = c;
            ctx.fill();
            ctx.restore();
          }
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        var patchX = R0 * L / s + s * 0.5;

        // incoming white light (a bundle of colours) and the reflected colour
        var hitX = cx, hitY = cy - 4;
        var inX = cx - W * 0.3, inY = H * 0.16, outX = cx + W * 0.3, outY = H * 0.16;
        var ux = hitX - inX, uy = hitY - inY, ul = Math.hypot(ux, uy);
        var px = -uy / ul, py = ux / ul;
        [410, 470, 530, 580, 630, 680].forEach(function (l, k) {
          var o = (k - 2.5) * 1.8;
          ctx.beginPath();
          ctx.moveTo(inX + px * o, inY + py * o);
          ctx.lineTo(hitX + px * o, hitY + py * o);
          ctx.strokeStyle = spectral(l);
          ctx.lineWidth = 1.6;
          ctx.stroke();
        });
        ctx.save();
        ctx.shadowColor = reflected;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(hitX, hitY);
        ctx.lineTo(outX, outY);
        ctx.strokeStyle = reflected;
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();

        // stretch arrows
        var ex = patchX + 6, len = 10 + eps * 70;
        [-1, 1].forEach(function (sgn) {
          var x0 = cx + sgn * ex, x1 = x0 + sgn * len;
          ctx.beginPath();
          ctx.moveTo(x0, cy);
          ctx.lineTo(x1, cy);
          ctx.moveTo(x1 - sgn * 7, cy - 6);
          ctx.lineTo(x1, cy);
          ctx.lineTo(x1 - sgn * 7, cy + 6);
          ctx.strokeStyle = col.ink;
          ctx.lineWidth = 2.5;
          ctx.lineCap = "round";
          ctx.stroke();
        });
      }
    }
  };

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now() - t0);
  }
  function draw(t) {
    if (!mode) return;
    ctx.clearRect(0, 0, W, H);
    MODES[mode].draw(param, t);
  }
  function frame(now) {
    raf = 0;
    if (!visible || !mode) return;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    var m = MODES[mode];
    if (pointer === null && !reduceMotion) goal = m.idle(now - t0);
    param += (goal - param) * 0.08;
    if (m.step && !reduceMotion) m.step(dt, param);
    draw(now - t0);
    if (!reduceMotion || Math.abs(goal - param) > 0.002) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function setMode(key, byUser) {
    if (!MODES[key]) return;
    if (byUser) stopAuto();
    var apply = function () {
      mode = key;
      var m = MODES[key];
      param = goal = m.start;
      if (m.reset) m.reset();
      canvas.setAttribute("data-mode", key);
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-visual") === key));
        if (b.getAttribute("data-visual") === key) {
          captionText.textContent = b.getAttribute("data-caption");
          captionLink.href = b.getAttribute("data-link");
          captionLink.firstElementChild.textContent = b.getAttribute("data-link-text");
        }
      });
      canvas.classList.remove("is-switching");
      draw(performance.now() - t0);
      kick();
    };
    if (mode) { canvas.classList.add("is-switching"); setTimeout(apply, 250); } else apply();
  }
  function nextMode() {
    var keys = buttons.map(function (b) { return b.getAttribute("data-visual"); });
    setMode(keys[(keys.indexOf(mode) + 1) % keys.length], false);
  }
  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = 0; } }

  buttons.forEach(function (b) {
    b.addEventListener("click", function () { setMode(b.getAttribute("data-visual"), true); });
  });
  canvas.addEventListener("pointermove", function (e) {
    var r = canvas.getBoundingClientRect();
    pointer = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    goal = MODES[mode].fromPointer(pointer);
    stopAuto();
    kick();
  });
  canvas.addEventListener("pointerleave", function () {
    pointer = null;
    if (reduceMotion) goal = MODES[mode].start;
    kick();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) kick();
    }).observe(canvas);
  }
  document.addEventListener("visibilitychange", function () { visible = !document.hidden; if (visible) kick(); });
  window.addEventListener("resize", resize);

  readColors();
  resize();
  var fromHash = (location.hash.match(/visual=(\w+)/) || [])[1];  // e.g. /#visual=odd
  setMode(MODES[fromHash] ? fromHash : canvas.getAttribute("data-mode") || "squares", false);
  if (!fromHash && !reduceMotion && buttons.length > 1) autoTimer = setInterval(nextMode, 12000);
})();
