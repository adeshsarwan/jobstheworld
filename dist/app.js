/* =============================================================================
 * jobsthe.world client — Jobs World
 *
 * 1) Ad core (resolveAds / adsWith / preloadDisplaySlots / warmAds / playRewarded)
 *    — ported verbatim from the jobguidematch funnel so ads PRELOAD identically:
 *    preloadRewarded() on load caches the rewarded ad, preloadSlots() warms the
 *    display placements present on the page, and showRewarded() at the CTA consumes
 *    the cached fill (instant instead of a cold ~4-5s SDK+GPT chain). Never-trap:
 *    no-fill / error / SDK-absent / early-close all let the visitor through.
 * 2) The "wall" funnel (jobcoachhub clone): 3 questions → loading → "View ad to
 *    continue" → our SDK rewarded → proceed. Opens on the first internal navigation
 *    per cooldown window; close/skip always lets the visitor through.
 * 3) Mobile nav toggle.
 * ========================================================================== */
(function () {
  "use strict";
  function byId(id) { return document.getElementById(id); }

  /* ---------- ad SDK resolver (partner exposes it under a few globals) ---------- */
  function resolveAds() {
    var roots = [window.PublisherExperience, window.PriceOptimiserExperience, window.PublisherExperienceSDK];
    for (var r = 0; r < roots.length; r++) {
      var sdk = roots[r];
      if (!sdk) continue;
      if (typeof sdk.showRewarded === "function") return sdk;
      var named = [sdk.jobGuideMatch, sdk["jobguidematch.com"], sdk.jobguidematch, sdk.publisher, sdk.site, sdk.current];
      for (var i = 0; i < named.length; i++) { if (named[i] && typeof named[i].showRewarded === "function") return named[i]; }
      for (var k in sdk) { try { if (sdk[k] && typeof sdk[k].showRewarded === "function") return sdk[k]; } catch (e) {} }
    }
    return null;
  }
  function adsWith(method, a) {
    if (a && typeof a[method] === "function") return a;
    var cands = [window.PublisherExperience, window.PriceOptimiserExperience];
    for (var i = 0; i < cands.length; i++) { if (cands[i] && typeof cands[i][method] === "function") return cands[i]; }
    return null;
  }
  // Our registered display placement ids (build.js adSlot + anchorAd). IDs only.
  var DISPLAY_SLOT_IDS = ["ad-leaderboard", "ad-incontent", "ad-results", "ad-sidebar", "ad-anchor"];
  function presentDisplaySlotIds() {
    var ids = [];
    for (var i = 0; i < DISPLAY_SLOT_IDS.length; i++) { if (document.getElementById(DISPLAY_SLOT_IDS[i])) ids.push(DISPLAY_SLOT_IDS[i]); }
    return ids;
  }
  function preloadDisplaySlots(ps) {
    var ids = presentDisplaySlotIds();
    if (ps && ids.length) { try { ps.preloadSlots(ids); } catch (e) {} }
    return ids;
  }

  var _warmed = false;
  function warmAds() {
    if (_warmed) return;
    var tries = 0;
    (function tick() {
      if (_warmed) return;
      var a = resolveAds();
      if (a) {
        _warmed = true;
        var pr = adsWith("preloadRewarded", a);
        if (pr) {
          try {
            pr.preloadRewarded({
              onReady: function () { if (window.console) console.debug("[reward] preloaded"); },
              onFallback: function (info) { if (window.console) console.debug("[reward] preload fallback:", info && info.status); },
            });
          } catch (e) {}
        }
        preloadDisplaySlots(adsWith("preloadSlots", a));
        return;
      }
      if (++tries < 40) setTimeout(tick, 150); // ~6s window for the async SDK to attach
    })();
  }

  // Resolve the SDK, waiting briefly if the async bundle has not attached yet.
  function waitForAds(timeoutMs, cb) {
    var ready = resolveAds();
    if (ready) { cb(ready); return; }
    var waited = 0, stepMs = 150;
    var t = setInterval(function () {
      waited += stepMs;
      var a = resolveAds();
      if (a) { clearInterval(t); cb(a); }
      else if (waited >= timeoutMs) { clearInterval(t); cb(null); }
    }, stepMs);
  }

  /* Rewarded play with the proven never-trap state machine.
     done(status)     -> terminal, let the visitor proceed
     reprompt(status) -> real ad closed early, nudge to finish (NOT terminal) */
  function playRewarded(ads, done, reprompt, ctx) {
    var fn = ctx || "wall";
    var granted = false, started = false, settled = false, noShow = null, absolute = null;
    function clear() { if (noShow) clearTimeout(noShow); if (absolute) clearTimeout(absolute); }
    function settleDone(status) {
      if (settled) return; settled = true; clear();
      if (window.track) track(/^granted/.test(status) ? "reward_grant" : "reward_nofill", { funnel: fn, via: status });
      done(status);
    }
    function settleReprompt(status) {
      if (settled) return; settled = true; clear();
      if (window.track) track("reward_skip", { funnel: fn, via: status });
      reprompt(status);
    }
    noShow = setTimeout(function () { settleDone("no-show-timeout"); }, 10000);
    absolute = setTimeout(function () { settleDone("absolute-timeout"); }, 45000);
    var p;
    try {
      p = ads.showRewarded({
        onReady: function () { started = true; if (noShow) { clearTimeout(noShow); noShow = null; } },
        onGranted: function (info) { granted = true; if (window.console) console.debug("[reward] granted:", info && info.reward); },
        onFallback: function (info) { settleDone("fallback:" + (info && info.status)); },
        onClosed: function () {
          if (granted) settleDone("granted+closed");
          else if (started) settleReprompt("early-close");
          else settleDone("closed-no-start");
        },
      });
    } catch (e) { settleDone("error:" + e); return; }
    Promise.resolve(p).then(function (result) {
      var st = result && result.status;
      if (st === "shown" || st === "closed") return;
      settleDone("status:" + st);
    }, function (e) { settleDone("rejected:" + e); });
  }

  /* ---------- the wall funnel ---------- */
  var WALL = window.__WALL || { questions: [], result: {}, cooldownSeconds: 600 };
  var COOLDOWN_KEY = "jw_wall_seen";
  function onCooldown() {
    try {
      var t = +sessionStorage.getItem(COOLDOWN_KEY) || 0;
      return (Date.now() - t) < (WALL.cooldownSeconds * 1000);
    } catch (e) { return false; }
  }
  function markSeen() { try { sessionStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch (e) {} }

  var wallEl = byId("lf-wall");
  var wallOpen = false, pendingHref = null;

  function closeWall(proceed) {
    wallOpen = false;
    document.body.classList.remove("wall-open");
    if (wallEl) wallEl.innerHTML = "";
    var href = pendingHref; pendingHref = null;
    if (proceed && href) window.location.assign(href);
  }

  function openWall(href) {
    if (!wallEl || wallOpen || !WALL.questions || !WALL.questions.length) return false;
    pendingHref = href || null;
    wallOpen = true;
    markSeen(); // one wall per cooldown window regardless of outcome
    document.body.classList.add("wall-open");
    warmAds(); // ensure the rewarded is warming while they answer
    if (window.track) track("funnel_start", { funnel: "wall", step_total: WALL.questions.length });
    renderQuestion(0, {});
    return true;
  }

  function card(inner) {
    return '<div class="wall__card"><button class="wall__close" type="button" aria-label="Close">×</button>' + inner + "</div>";
  }
  function bindClose() {
    var c = wallEl.querySelector(".wall__close");
    if (c) c.addEventListener("click", function () { if (window.track) track("funnel_abandon", { funnel: "wall" }); closeWall(true); });
  }

  function renderQuestion(step, answers) {
    var total = WALL.questions.length;
    var q = WALL.questions[step];
    var pct = Math.round((step / total) * 100);
    var opts = q.options.map(function (o) { return '<button class="wall__option" type="button" data-opt="' + o.replace(/"/g, "&quot;") + '">' + o + "</button>"; }).join("");
    wallEl.innerHTML = card(
      '<div class="wall__progress"><span class="wall__fill" style="width:' + pct + '%"></span></div>' +
      '<h2 class="wall__title">' + q.q + "</h2>" + opts
    );
    bindClose();
    Array.prototype.forEach.call(wallEl.querySelectorAll(".wall__option"), function (btn) {
      btn.addEventListener("click", function () {
        answers[step] = btn.getAttribute("data-opt");
        if (window.track) track("funnel_step", { funnel: "wall", step_index: step + 1, step_total: total });
        if (step + 1 < total) renderQuestion(step + 1, answers);
        else renderLoading();
      });
    });
  }

  function renderLoading() {
    var r = WALL.result || {};
    wallEl.innerHTML = card(
      '<div class="wall__progress"><span class="wall__fill" style="width:100%"></span></div>' +
      '<div class="wall__dots" aria-hidden="true"><span></span><span></span><span></span></div>' +
      '<p class="wall__loading">' + (r.loadingText || "Searching...") + "</p>"
    );
    bindClose();
    if (window.track) track("funnel_search", { funnel: "wall" });
    setTimeout(renderResult, Math.max(600, (r.loadingSeconds || 3) * 1000));
  }

  function renderResult() {
    var r = WALL.result || {};
    wallEl.innerHTML = card(
      '<h2 class="wall__title">' + (r.headline || "We found opportunities for you") + "</h2>" +
      '<p class="wall__body">' + (r.body || "") + "</p>" +
      '<button class="wall__cta" id="wall-cta" type="button">' + (r.buttonLabel || "Continue") + "</button>" +
      '<button class="wall__skip" id="wall-skip" type="button" hidden>Skip and continue</button>'
    );
    bindClose();
    var cta = byId("wall-cta"), skip = byId("wall-skip"), busy = false;
    function proceed() { closeWall(true); }
    function nudge() {
      busy = false;
      if (cta) { cta.disabled = false; cta.textContent = "Watch again to continue"; }
      if (skip) skip.hidden = false;
    }
    if (skip) skip.addEventListener("click", proceed);
    cta.addEventListener("click", function () {
      if (busy) return;
      busy = true; cta.disabled = true; cta.textContent = "Loading your video…";
      if (window.track) track("reward_prompt", { funnel: "wall" });
      waitForAds(4000, function (ads) {
        if (!ads) { if (window.track) track("reward_nofill", { funnel: "wall", via: "sdk-unavailable" }); proceed(); return; }
        playRewarded(ads, function () { proceed(); }, nudge, "wall");
      });
    });
  }

  /* ---------- intercept the first internal navigation per cooldown ---------- */
  function isInternal(a) {
    if (!a) return false;
    if (a.getAttribute("target")) return false;
    if (a.hasAttribute("download")) return false;
    var href = a.getAttribute("href") || "";
    if (href.charAt(0) !== "/" || href.indexOf("//") === 0) return false; // only our own paths
    if (/^\/(app\.js|styles\.css|img\/|sitemap|robots|ads\.txt|v\/)/.test(href)) return false;
    return true;
  }
  document.addEventListener("click", function (e) {
    if (wallOpen) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || !isInternal(a)) return;
    if (onCooldown()) return; // already shown recently — navigate freely
    if (!WALL.questions || !WALL.questions.length) return;
    e.preventDefault();
    openWall(a.getAttribute("href"));
  }, true);

  /* ---------- mobile nav ---------- */
  function initNav() {
    var btn = byId("menu-toggle"), nav = byId("primary-nav");
    if (btn && nav) btn.addEventListener("click", function () { nav.classList.toggle("hidden"); });
  }

  /* ---------- boot ---------- */
  function boot() { initNav(); warmAds(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
