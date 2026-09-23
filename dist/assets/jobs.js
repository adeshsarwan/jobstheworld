/* jobs engine — vanilla, no dependencies.
   Drives the funnel across static per-step pages. Every step is a real pageview
   (good for ad requests); the engine handles the intake funnel, the matching
   screen, and the outbound redirect on the apply page.

   POLICY (see ../CLAUDE.md Fight 1 & 3):
   - No pop-ups / pop-unders, and no interstitial / forced-ad overlays anywhere.
     Ads are in-content units only (see build.js PLACEMENTS + README).
   - Nothing here fabricates a statistic. Copy is honest, framing only. */

(function () {
  "use strict";

  function svg(paths, size) {
    var s = size || 20;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" style="vertical-align:middle">' + paths + '</svg>';
  }
  var ICON = {
    check: svg('<path d="M20 6L9 17l-5-5"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>')
  };

  /* ---------- step 3 (apply / redirect) ----------
     Honest redirect UX (mirrors the compliant reference sites): a clear, labeled
     outbound button the user taps. We do NOT auto-open pop-unders. We add a short
     visible countdown that simply emphasizes the button; the user stays in control. */
  function initApply(cfg) {
    cfg = cfg || {};

    var btn = document.getElementById("go-btn");
    var note = document.getElementById("go-note");
    if (!btn) return;

    // If there's a real outbound URL, count down and highlight the button.
    if (cfg.url) {
      var n = 3;
      var base = note ? note.innerHTML : "";
      var t = setInterval(function () {
        n -= 1;
        if (note) note.innerHTML = ICON.arrow + " Opening " + (cfg.url.replace(/^https?:\/\//, "").split("/")[0]) + " in " + n + "…";
        btn.classList.add("cta-pulse");
        if (n <= 0) {
          clearInterval(t);
          if (note) note.innerHTML = base;
          btn.classList.remove("cta-pulse");
        }
      }, 1000);
      // Cancel countdown once the user interacts, so we never fight them.
      btn.addEventListener("click", function () { clearInterval(t); if (note) note.innerHTML = base; });
    }
  }

  /* ---------- home search (client-side filter over the job cards) ----------
     Real, functional filter — boosts the "job search" feel and keeps people in
     the funnel. No fake results; it simply shows/hides the cards we already have. */
  function initHomeSearch() {
    var input = document.getElementById("job-search");
    if (!input) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll(".job-card"));
    var sections = Array.prototype.slice.call(document.querySelectorAll(".content-block"));
    // In-feed native ad cards: hide them while a search query is active (they belong to the
    // full browse grid, not a filtered result set) and restore them when the query clears.
    var natives = Array.prototype.slice.call(document.querySelectorAll(".native-card"));
    var noResults = document.getElementById("no-results");

    function apply() {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      natives.forEach(function (n) { n.style.display = q ? "none" : ""; });
      cards.forEach(function (c) {
        var hay = c.getAttribute("data-search") || "";
        var match = !q || hay.indexOf(q) !== -1;
        c.style.display = match ? "" : "none";
        if (match) shown++;
      });
      // hide section headings that have no visible cards
      sections.forEach(function (sec) {
        var grid = sec.querySelector(".job-cards");
        if (!grid) return;
        var anyVisible = Array.prototype.some.call(grid.querySelectorAll(".job-card"), function (c) {
          return c.style.display !== "none";
        });
        sec.style.display = anyVisible ? "" : "none";
      });
      if (noResults) noResults.hidden = shown !== 0;
    }
    input.addEventListener("input", apply);
  }

  /* ================= INTAKE FUNNEL ================= */
  function byId(id) { return document.getElementById(id); }
  function findStore() { try { return JSON.parse(sessionStorage.getItem("find") || "{}"); } catch (e) { return {}; } }
  function findSave(o) { try { sessionStorage.setItem("find", JSON.stringify(o)); } catch (e) {} }

  /* Question pages: store the pick, then let the link navigate (works without JS too). */
  function initFind() {
    var picks = document.querySelectorAll(".pick");
    Array.prototype.forEach.call(picks, function (a) {
      a.addEventListener("click", function () {
        var o = findStore();
        var k = a.getAttribute("data-q"), v = a.getAttribute("data-val");
        if (k) o[k] = v;
        var m = a.getAttribute("data-match");
        if (m !== null) o.match = m;
        var lbl = a.querySelector(".pick-label");
        if (k && lbl) o[k + "_label"] = lbl.textContent.trim();
        findSave(o);
      });
    });
  }

  /* Matching screen: animated progress + status, then unlock the button (ask them
     to wait). Never navigates before the wait completes. */
  function initMatching(cfg) {
    var bar = byId("match-bar"), pct = byId("match-pct"), status = byId("match-status");
    var ans = findStore();
    var typeLbl = (ans.type_label || "job").toLowerCase();
    var statuses = [
      "Scanning employer career portals…",
      "Checking " + typeLbl + " openings near you…",
      "Ranking your best matches…",
      "Almost ready…"
    ];
    var wait = (cfg.wait || 7) * 1000, t0 = Date.now();
    var timer = setInterval(function () {
      var p = Math.min(100, Math.round((Date.now() - t0) / wait * 100));
      if (bar) bar.style.width = p + "%";
      if (pct) pct.textContent = p + "%";
      var si = Math.min(statuses.length - 1, Math.floor(p / 25));
      if (status && p < 100) status.textContent = statuses[si];
      if (p >= 100) {
        clearInterval(timer);
        if (status) status.textContent = "Your matches are ready!";
        // Straight to the results page — no interstitial / reward gate.
        setTimeout(function () { location.href = cfg.next; }, 400);
      }
    }, 100);
  }

  /* Personalize the results summary + surface matched jobs first. Shared by the plain results
     page and the rewarded-gate arm (the DOM is the same; the gate just hides it until reveal). */
  function personalizeMatches() {
    var ans = findStore();
    var sum = byId("match-summary");
    var type = ans.type || "any";
    // Only personalize when we actually captured answers — otherwise keep the
    // friendly static default ("Here are jobs hiring near you right now.").
    if (sum && ans.type) {
      var head = (type !== "any" && ans.type_label) ? ans.type_label : "Jobs";
      var s = head + " hiring";
      if (ans.location_label) s += " · " + ans.location_label;
      if (ans.schedule_label) s += " · " + ans.schedule_label;
      sum.textContent = s;
    }
    var wrap = byId("match-cards");
    if (!wrap) return;
    // 1) Order job cards by match relevance (the matched type first). Insert each before the
    //    native card so ordering is clean; step 2 then repositions the native card.
    if (type && type !== "any") {
      var cards = Array.prototype.slice.call(wrap.querySelectorAll(".job-card"));
      var match = [], rest = [];
      cards.forEach(function (c) {
        var cats = (c.getAttribute("data-cat") || "").split(" ");
        (cats.indexOf(type) >= 0 ? match : rest).push(c);
      });
      var nativeCard0 = wrap.querySelector(".native-card");
      if (match.length) match.concat(rest).forEach(function (c) {
        if (nativeCard0) wrap.insertBefore(c, nativeCard0); else wrap.appendChild(c);
      });
    }
    // 2) Put the in-feed native ad in the SECOND slot (right after the first job card) for max
    //    viewability — otherwise the reorder above leaves it at the very end where fewer see it.
    var nativeCard = wrap.querySelector(".native-card");
    var firstJob = wrap.querySelector(".job-card");
    if (nativeCard && firstJob && firstJob.nextSibling !== nativeCard) {
      wrap.insertBefore(nativeCard, firstJob.nextSibling);
    }
  }

  /* Results page: personalize the summary + surface matched jobs first. */
  function initMatches() { personalizeMatches(); }

  /* ---------- rewarded gate (on /find/ results, owner promoted to default) ----------
     OPT-IN rewarded video to reveal the matches. POLICY (Google rewards + CLAUDE.md Fight 3):
     opt-in, non-monetary reward, honest copy. Reveal rules (owner decision 2026-07-26 — nudge to
     finish, but NEVER a hard trap):
       - completed (reward granted)                 -> reveal
       - closed EARLY after a real ad started       -> re-prompt "finish the video" + show the
                                                       "Skip and see my matches" escape (do NOT reveal)
       - no-fill / error / SDK-absent / timeouts    -> reveal (there is no ad to watch; can't trap)
       - the escape link, po:rewarded, revealResults -> reveal
     The escape + the no-fill/error/timeout reveals are what keep this a nudge, not a forbidden
     non-skippable gate. Do NOT remove them. */
  function resolveAds() {
    // The partner exposes the API under a few globals across versions — the official resolver
    // (ad-skills/*/references/snippets.md) checks `window.PublisherExperience` →
    // `window.PriceOptimiserExperience` → the `window.PublisherExperienceSDK` registry, in that order.
    // The per-site bundle (jobguidematch.js — renamed from .com.js 2026-09-06) attaches the handle at the
    // root itself AND at `.jobGuideMatch`. Search all roots for the object that carries showRewarded
    // — the same object also carries preloadRewarded/preloadSlots (partner's combined example uses one
    // `ads` object for all three).
    var roots = [window.PublisherExperience, window.PriceOptimiserExperience, window.PublisherExperienceSDK];
    for (var r = 0; r < roots.length; r++) {
      var sdk = roots[r];
      if (!sdk) continue;
      if (typeof sdk.showRewarded === "function") return sdk;
      var named = [sdk.jobGuideMatch, sdk["jobguidematch.com"], sdk.jobguidematch, sdk.publisher, sdk.site, sdk.current];
      for (var i = 0; i < named.length; i++) {
        if (named[i] && typeof named[i].showRewarded === "function") return named[i];
      }
      for (var k in sdk) { if (sdk[k] && typeof sdk[k].showRewarded === "function") return sdk[k]; }
    }
    return null;
  }

  // Find whichever object exposes a given preload method — normally the same handle resolveAds()
  // returns, but fall back to the top-level partner globals in case the partner attached the preload
  // API there rather than on the per-site handle. Returns null if the method is absent (older SDK) so
  // every call site degrades to the pre-preload behaviour.
  function adsWith(method, a) {
    if (a && typeof a[method] === "function") return a;
    var cands = [window.PublisherExperience, window.PriceOptimiserExperience];
    for (var i = 0; i < cands.length; i++) {
      if (cands[i] && typeof cands[i][method] === "function") return cands[i];
    }
    return null;
  }

  // Explicit display-preload contract (ad-skills/new-publisher-display-preload-skill, 2026-08-29):
  // pass the EXACT ad-container div IDs to preload, not the legacy type names ["native","anchor"].
  // The skill requires every supplied ID to already exist in the DOM, so we return only the
  // registered slot IDs actually present on THIS page — which yields [] on the modal landers (no
  // display slots), keeping preloadSlots a no-op there exactly as before. These are the four
  // registered placement ids (build.js PLACEMENTS + anchorAd); IDs only, never sizes/GAM paths.
  var DISPLAY_SLOT_IDS = ["ad-leaderboard", "ad-incontent", "ad-results", "ad-anchor"];
  function presentDisplaySlotIds() {
    var ids = [];
    for (var i = 0; i < DISPLAY_SLOT_IDS.length; i++) {
      if (document.getElementById(DISPLAY_SLOT_IDS[i])) ids.push(DISPLAY_SLOT_IDS[i]);
    }
    return ids;
  }
  // Preload the display placements that exist on this page by their exact div IDs (no-op if none).
  function preloadDisplaySlots(ps) {
    var ids = presentDisplaySlotIds();
    if (ps && ids.length) { try { ps.preloadSlots(ids); } catch (e) {} }
    return ids;
  }

  /* Warm the ad SDK on funnel ENTRY, not at the rewarded click. The partner shipped a preload API
     (2026-08-28): preloadRewarded() REQUESTS the rewarded ad now without showing it, and the next
     showRewarded() consumes that cached ad automatically — so calling it as the funnel opens means
     the rewarded video is already fetched by the time the visitor finishes the questions and taps
     the CTA (instant instead of the ~3-5s cold SDK+GPT+auction chain). preloadDisplaySlots() warms
     any display/anchor slots that ALREADY EXIST on the current page by their EXACT div IDs (the
     partner's preferred contract as of 2026-08-29 — see the presentDisplaySlotIds() note; it can
     only define divs present in the DOM — no-op on the modal landers, which carry no display slots;
     it warms the /find/ results + guide slots where they exist). Both are feature-detected and guarded,
     so an older SDK (or a no-fill at preload time) degrades to the previous behaviour: the rewarded is
     simply requested at showRewarded() as before, never a trap. No init() call — the SDK auto-inits
     and the partner's public preload API (ad-skills/*) does not list init(). Called ONCE per page,
     retrying until the async bundle attaches. */
  // Rewarded-preload readiness, shared so a funnel can hold a "searching…" loader until the ad is
  // ready (or has definitively no-filled) before showing the reward CTA — moving the wait off the
  // click. _settled = onReady OR onFallback fired (nothing left to wait for); _ready = a real ad is
  // cached. rewardedSettled() also returns true when there is no preload API at all (nothing to wait
  // for), so the loader never hangs.
  var _rewardedReady = false, _rewardedSettled = false, _rewardedHasApi = false;
  function rewardedReady() { return _rewardedReady; }
  function rewardedSettled() { return _rewardedSettled || !_rewardedHasApi; }

  var _warmed = false;
  function warmAds() {
    if (_warmed) return;
    var tries = 0;
    (function tick() {
      if (_warmed) return;
      var a = resolveAds();
      if (a) {
        _warmed = true;
        // Pre-request the rewarded ad so showRewarded() at the click consumes a cached fill.
        var pr = adsWith("preloadRewarded", a);
        if (pr) {
          _rewardedHasApi = true;
          try {
            pr.preloadRewarded({
              onReady:    function () { _rewardedReady = true; _rewardedSettled = true; if (window.console) console.debug("[reward] preloaded"); },
              onFallback: function (info) { _rewardedSettled = true; if (window.console) console.debug("[reward] preload fallback:", info && info.status); }
            });
          } catch (e) { _rewardedSettled = true; }
        }
        // Warm any display/anchor slots that exist on THIS page by exact div ID (no-op where none
        // are rendered — presentDisplaySlotIds() returns [] on the modal landers).
        preloadDisplaySlots(adsWith("preloadSlots", a));
        return;
      }
      if (++tries < 40) setTimeout(tick, 150);   // ~6s window for the async SDK to attach
    })();
  }

  function setupRewardGate(onReveal) {
    warmAds();   // warm the SDK on results load so the rewarded is ready by the time they click
    var gate = byId("reward-gate"), panel = byId("result-reveal"), revealed = false;
    var titleEl = byId("reward-title"), msgEl = byId("reward-msg"), escapeEl = byId("reward-escape");
    var btn = document.querySelector("[data-po-rewarded-results]");
    var busy = false;

    function reveal(status) {
      if (revealed) return;
      revealed = true;
      if (window.console) console.debug("[reward] reveal:", status);
      if (gate) gate.hidden = true;
      if (panel) panel.hidden = false;
      if (typeof onReveal === "function") onReveal();
    }

    // User closed a real ad before finishing: nudge them to watch fully (do NOT reveal), and
    // surface the honest escape so they are never trapped.
    function reprompt() {
      if (revealed) return;
      if (window.console) console.debug("[reward] early close -> reprompt");
      busy = false;
      if (btn) { btn.disabled = false; btn.innerHTML = ICON.arrow + " Watch again to see my matches"; }
      if (titleEl) titleEl.textContent = "Almost there";
      if (msgEl) msgEl.textContent = "Finish the short video to unlock the jobs matched to you.";
      if (escapeEl) escapeEl.hidden = false;
    }

    // Extra broadcast hooks (harmless if never called).
    window.JobGuide = window.JobGuide || {};
    window.JobGuide.revealResults = function () { reveal("revealResults()"); };
    window.addEventListener("po:rewarded", function () { reveal("po:rewarded"); });

    if (!gate || !panel) { reveal("no-gate"); return; }
    if (!btn) { reveal("no-button"); return; }

    // Escape link (revealed after an early close) — an honest way out so we never trap.
    if (escapeEl) {
      var esc = escapeEl.querySelector("[data-po-reveal]");
      if (esc) esc.addEventListener("click", function (e) { e.preventDefault(); reveal("user-escape"); });
    }

    function waitForAds(timeoutMs, cb) {
      var ready = resolveAds();
      if (ready) { cb(ready); return; }              // sync when already loaded (keeps the user gesture)
      var waited = 0, stepMs = 150;
      var t = setInterval(function () {
        waited += stepMs;
        var a = resolveAds();
        if (a) { clearInterval(t); cb(a); }
        else if (waited >= timeoutMs) { clearInterval(t); cb(null); }
      }, stepMs);
    }

    btn.addEventListener("click", function () {
      if (busy || revealed) return;
      busy = true; btn.disabled = true; btn.textContent = "Loading your video…";
      if (window.track) track("reward_prompt", { funnel: "jobs_find" });
      // If the async SDK never attaches, don't trap the visitor — reveal.
      waitForAds(4000, function (ads) {
        if (!ads) { if (window.track) track("reward_nofill", { funnel: "jobs_find", via: "sdk-unavailable" }); reveal("sdk-unavailable"); return; }
        playRewarded(ads, reveal, reprompt, "jobs_find");
      });
    });
  }

  function playRewarded(ads, reveal, reprompt, ctx) {
    var fn = ctx || "jobs_find";
    var granted = false, started = false, settled = false, noShow = null, absolute = null;
    function clear() { if (noShow) clearTimeout(noShow); if (absolute) clearTimeout(absolute); }
    function settleReveal(status) {
      if (settled) return; settled = true; clear();
      // GA4: the rewarded gate is the sharpest drop-off point and is NOT its own URL. Report grant
      // vs no-fill per funnel so the owner can optimize around it.
      if (window.track) track(/^granted/.test(status) ? "reward_grant" : "reward_nofill", { funnel: fn, via: status });
      reveal(status);
    }
    // Early close of a REAL ad -> nudge to finish (not a terminal reveal).
    function settleReprompt(status) {
      if (settled) return; settled = true; clear(); if (window.console) console.debug("[reward]", status);
      if (window.track) track("reward_skip", { funnel: fn, via: status });
      reprompt();
    }

    noShow = setTimeout(function () { settleReveal("no-show-timeout"); }, 10000);    // never started -> reveal (10s: the SDK's serial bundle+config+GPT chain can take ~4-5s before an ad even requests, so 6s was giving up on slow fills)
    absolute = setTimeout(function () { settleReveal("absolute-timeout"); }, 45000); // started but silent -> reveal
    var p;
    try {
      p = ads.showRewarded({
        onReady:    function () { started = true; if (noShow) { clearTimeout(noShow); noShow = null; } },
        onGranted:  function (info) { granted = true; if (window.console) console.debug("[reward] granted:", info && info.reward); },
        onFallback: function (info) { settleReveal("fallback:" + (info && info.status)); },  // no-fill -> reveal
        onClosed:   function () {
          if (granted) settleReveal("granted+closed");        // watched fully -> reveal
          else if (started) settleReprompt("early-close");    // real ad, closed early -> nudge to finish
          else settleReveal("closed-no-start");               // nothing actually played -> reveal (no trap)
        }
      });
    } catch (e) { settleReveal("error:" + e); return; }
    // showRewarded() resolves with a final status: closed|shown|timeout|unavailable|busy|error.
    // "shown"/"closed" are handled via callbacks; anything else (no real ad) reveals.
    Promise.resolve(p).then(function (result) {
      var st = result && result.status;
      if (st === "shown" || st === "closed") return;
      settleReveal("status:" + st);
    }, function (e) { settleReveal("rejected:" + e); });
  }

  /* Rewarded-gate results page: personalize (behind the hidden reveal panel), then arm the gate. */
  function initRewardResults() {
    personalizeMatches();
    setupRewardGate(null);
  }

  /* Chat funnel: same questions, conversational UI. */
  function initChat(cfg) {
    var log = byId("chat-log"), quick = byId("chat-quick"), adBox = byId("chat-ad");
    var qs = cfg.questions, ans = {}, qi = 0;
    function scroll() { if (log) log.scrollTop = log.scrollHeight; window.scrollTo(0, document.body.scrollHeight); }
    function bubble(who, text) {
      var d = document.createElement("div"); d.className = "msg " + who;
      var b = document.createElement("div"); b.className = "bub"; b.textContent = text;
      d.appendChild(b); log.appendChild(d); scroll(); return d;
    }
    function typing(cb, delay) {
      var d = document.createElement("div"); d.className = "msg bot typing";
      d.innerHTML = '<div class="bub"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
      log.appendChild(d); scroll();
      setTimeout(function () { d.remove(); cb(); }, delay || 800);
    }
    function setQuick(opts, onPick) {
      quick.innerHTML = "";
      opts.forEach(function (o) {
        var b = document.createElement("button"); b.className = "chip"; b.textContent = o.label;
        b.addEventListener("click", function () { quick.innerHTML = ""; onPick(o); });
        quick.appendChild(b);
      });
    }
    function askNext() {
      if (qi >= qs.length) return doMatch();
      var q = qs[qi];
      typing(function () {
        bubble("bot", q.q);
        setQuick(q.options, function (o) {
          bubble("user", o.label);
          ans[q.key] = o.id; ans[q.key + "_label"] = o.label;
          qi++; setTimeout(askNext, 320);
        });
      }, qi === 0 ? 500 : 750);
    }
    function doMatch() {
      findSave(ans);
      typing(function () {
        bubble("bot", "Great — matching you with jobs near you…");
        var prog = document.createElement("div"); prog.className = "msg bot";
        prog.innerHTML = '<div class="bub"><div class="progress"><span id="chatbar"></span></div><div class="match-pct" id="chatpct">0%</div></div>';
        log.appendChild(prog); scroll();
        if (adBox) adBox.hidden = false;
        var bar = byId("chatbar"), pct = byId("chatpct"), t0 = Date.now(), wait = 8000;
        var timer = setInterval(function () {
          var p = Math.min(100, Math.round((Date.now() - t0) / wait * 100));
          if (bar) bar.style.width = p + "%"; if (pct) pct.textContent = p + "%";
          if (p >= 100) { clearInterval(timer); showResults(); }
        }, 100);
      }, 650);
    }
    function showResults() {
      var type = ans.type || "any";
      var list = cfg.props.filter(function (p) { return type === "any" || p.cats.indexOf(type) >= 0; });
      if (!list.length) list = cfg.props.slice(0, 4);
      typing(function () {
        var loc = ans.location_label ? (" · " + ans.location_label) : "";
        bubble("bot", "Here are your top matches" + loc + ". Tap one to see openings and apply on the official site:");
        var wrapEl = document.createElement("div"); wrapEl.className = "msg bot";
        var html = '<div class="bub cards">';
        list.slice(0, 5).forEach(function (p) {
          html += '<a class="chat-card" href="' + p.url + '"><span class="cc-title">' + p.short +
            '</span>' + (p.pay ? '<span class="cc-pay">' + p.pay + '</span>' : '') +
            '<span class="cc-go">View jobs ' + ICON.arrow + '</span></a>';
        });
        html += '</div>';
        wrapEl.innerHTML = html; log.appendChild(wrapEl); scroll();
        setQuick([{ label: "Start over", id: "restart" }], function () { location.reload(); });
      }, 850);
    }
    askNext();
  }

  /* ---------- /usa/ pop-up MODAL quiz (opt-in engagement, never a forced overlay) ----------
     A simple lander whose intake is a modal quiz: 3 quick tap questions with a progress bar,
     then an OPT-IN rewarded video, then we send the visitor to our regular matched-results page.
     POLICY (see ../CLAUDE.md Fight 1 & 3): the modal is always closeable (X / backdrop / Esc) and
     the lander is usable behind it — it is NOT a pop-under / forced-ad overlay. The only ad is the
     rewarded video, which reuses the SAME never-trap plumbing as the /find/ gate (playRewarded):
     the visitor reaches results on ANY terminal outcome (granted / no-fill / error / SDK-absent /
     timeout / early-close→escape). Answers are stored in the SAME "find" store + option ids as
     /find/, so the results page personalizes with the existing personalizeMatches (no new JS). */
  function initUsaModal(cfg) {
    var modal = byId("usa-modal");
    if (!modal) return;
    // Hoist the modal to <body> so its position:fixed resolves against the VIEWPORT. main.wrap has
    // a page-in transform (animation ... both) which otherwise becomes the containing block for
    // fixed descendants and pushes the dialog far down the (tall) main element, below the fold.
    if (modal.parentNode !== document.body) document.body.appendChild(modal);
    var bodyEl = byId("usa-body"), barEl = byId("usa-bar"), stepEl = byId("usa-modal-step");
    var qs = (cfg && cfg.questions) || [], total = qs.length + 1;
    var step = 0, ans = {}, rendered = false, fstarted = false;
    // Every user-visible string of the final (rewarded) step, overridable so the SAME engine can
    // run in Arabic/Urdu/Hindi/Bengali on the /me/x/quiet/ arm. Defaults reproduce the original
    // English /usa/ copy exactly, so the three existing landers are unchanged.
    var C = (cfg && cfg.copy) || {};
    var T = {
      stepFmt:  C.stepFmt  || "Step {n} of {t}",
      title:    C.title    || "Your jobs guide is ready",
      sub:      C.sub      || "Watch a short video from our sponsor to open your free guide — the roles hiring now and where to apply. No sign-up.",
      btn:      C.btn      || "Open my free guide",
      loading:  C.loading  || "Loading your video…",
      almost:   C.almost   || "Almost there",
      finish:   C.finish   || "Finish the short video to open your free jobs guide.",
      again:    C.again    || "Watch again to open my guide",
      skip:     C.skip     || "Skip and open the guide"
    };
    // GA4 funnel id — the modal quiz advances IN-PAGE (no URL change per question), so page_view
    // can't see this funnel's depth; custom events are the only signal. One modal engine serves
    // several landers, so the funnel is keyed by path (or passed in explicitly).
    var FN = (cfg && cfg.fn) ? cfg.fn
           : /usa-packing-jobs/.test(location.pathname) ? "jobs_usa_packing"
           : /packing-jobs/.test(location.pathname) ? "jobs_packing" : "jobs_usa";

    function lock(on) {
      try { document.body.classList[on ? "add" : "remove"]("usa-lock"); } catch (e) {}
    }

    // --- SPA arm helpers (/worldwide-pre/) — no-ops on the normal two-page landers (cfg.spa unset).
    // preloadSlots is FETCH-ONLY (partner-confirmed 2026-08-28), so warming the guide's native/anchor
    // creatives while it is still hidden never counts a non-viewable impression — the slots only
    // RENDER when the guide is revealed. Fetch ahead (during the reward), render on reveal.
    function spaPreloadNative() {
      if (!cfg.spa) return;
      var a = resolveAds();
      preloadDisplaySlots(adsWith("preloadSlots", a));   // exact div IDs of the slots on the (hidden) guide
    }
    // Reveal step (partner spec 2026-08-30): after the reward completes and the caller drops
    // `.wp-preview` (un-hiding the slots), tell the SDK to REVEAL the placements it preloaded during
    // the video. The slots were display:none at init, so the SDK never attached its visibility
    // observer to them — un-hiding alone does not render them; we must call the reveal API explicitly.
    // `revealSlots([...div IDs...])` is the ONLY reveal action (partner skill
    // publisher_display_skill_edit): the skill's own helper returns `reveal_slots_unavailable` and
    // does nothing when the API is absent — it does NOT fall back to refreshSlots, and refreshAll()
    // is explicitly forbidden as a reveal (fresh auction, discards the preload). Guarded with a
    // typeof check so an older SDK cannot throw. revealSlots shipped 2026-08-30 (live SDK etag
    // ac0c2f51…), so the guard is belt-and-braces. Exact div IDs only, filtered to the DOM.
    //
    // TIMING (partner spec 2026-08-30): the caller un-hides the container FIRST (drops `.wp-preview`),
    // then we reveal on a DOUBLE requestAnimationFrame. Calling reveal in the same tick as the un-hide
    // is too early — the browser has not yet committed the DOM/CSS, so the SDK sees the real divs (or
    // their ancestors) as not-yet-renderable and the reveal can break. Two frames give the layout time
    // to commit before the SDK checks renderability. (Fixed v1.37.0 — the previous synchronous call
    // was exactly the "reveal a little too early" failure mode.)
    function spaRenderAds() {
      var ids = presentDisplaySlotIds();
      if (!ids.length) return;
      function doReveal() {
        var rv = adsWith("revealSlots", resolveAds());
        if (!rv) return;                                   // reveal_slots_unavailable — do nothing
        try { rv.revealSlots(ids); } catch (e) {}
      }
      var raf = window.requestAnimationFrame && window.requestAnimationFrame.bind(window);
      if (raf) { raf(function () { raf(doReveal); }); }
      else { setTimeout(doReveal, 32); }   // no rAF (very old browser): ~2 frames
    }

    // Reveal the payoff (shared by the reward-complete path and the ?skip test bypass): on the SPA
    // landers drop the blur/overlay and render the in-page guide's ad slots; on the two-page landers
    // navigate to the results URL. Behaviour is identical to what the reward-complete `go()` used to
    // inline — extracted so the test bypass reuses the exact same path.
    function revealGuide(status) {
      if (window.console) console.debug("[usa] reveal:", status);
      if (cfg.spa) {
        if (modal) { modal.hidden = true; lock(false); }
        var g = byId(cfg.revealId);
        if (g) { g.hidden = false; g.classList.remove("wp-preview"); }
        var hide = cfg.hideId && byId(cfg.hideId); if (hide) hide.hidden = true;
        try { window.scrollTo(0, 0); } catch (e) {}
        spaRenderAds();
        if (window.gtag && cfg.guidePath) {
          try { gtag("event", "page_view", { page_path: cfg.guidePath, page_title: document.title, spa_arm: FN }); } catch (e) {}
        }
        return;
      }
      if (cfg.resultsUrl) location.href = cfg.resultsUrl;
    }

    // Test bypass: append `?skip` (or `?skip=1`) to the URL to jump straight past the whole intake
    // quiz AND the rewarded video to the destination — the revealed SPA feed/guide (or a navigation
    // on the two-page landers). URL-only, so it can never fire for real paid traffic, and every page
    // that uses this engine is noindex. Lets us test the payoff (e.g. the /worldwide-usy/ outstream
    // video) without running the funnel each time.
    function skipRequested() {
      try { return /(?:^|[?&])skip(?:=[^&]*)?(?:&|$)/.test(location.search); } catch (e) { return false; }
    }

    function open() {
      if (!rendered) { step = 0; ans = {}; render(); }
      if (modal.hidden) {
        modal.hidden = false; lock(true);
        warmAds();   // start the SDK now so the rewarded video is as ready as it can be at the click
        if (!fstarted) { fstarted = true; if (window.track) track("funnel_start", { funnel: FN, step_total: total }); }
      }
    }
    function close() { if (!modal.hidden) { modal.hidden = true; lock(false); } }

    // cfg.warmOnLoad: start requesting the rewarded ad the instant the page loads (not at modal open),
    // so it is cached well before a delayed/interaction-triggered popup appears. warmAds() is idempotent
    // (guarded by _warmed), so the later open() call is a no-op. Opt-in — other landers unchanged.
    if (cfg && cfg.warmOnLoad) warmAds();

    // Open triggers: any [data-usa-open] button (hero CTAs) + auto-open once per session.
    Array.prototype.forEach.call(document.querySelectorAll("[data-usa-open]"), function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); step = 0; ans = {}; render(); open(); });
    });
    // Owner: the modal should already be showing on arrival — open it immediately on every /usa
    // load (still fully closeable, so it stays an opt-in engagement modal, not a forced overlay).
    // NOTE: use a typeof check, not `|| default`, so an autoDelay of 0 is honored (0 is falsy).
    var delay = (cfg && typeof cfg.autoDelay === "number") ? cfg.autoDelay : 0;
    var iEvents = ["scroll", "wheel", "touchstart", "pointerdown", "keydown"];
    function disarmAutoOpen() {
      clearTimeout(autoTimer);
      if (cfg && cfg.openOnInteraction) iEvents.forEach(function (ev) { window.removeEventListener(ev, onInteract, true); });
    }
    // Single entry for both paths (timer + interaction): disarm BOTH triggers, then open once. This is
    // what stops a later scroll from re-opening the intake after the popup already opened by timer.
    function autoOpen() { disarmAutoOpen(); open(); }
    function onInteract() { autoOpen(); }
    var autoTimer = setTimeout(autoOpen, delay);
    // cfg.openOnInteraction: also open on the FIRST user interaction (scroll / wheel / touch / pointer /
    // key), whichever comes before the autoDelay timer. Opt-in — landers without this cfg keep the pure
    // timer behaviour (disarmAutoOpen just clears the timer for them).
    if (cfg && cfg.openOnInteraction) {
      iEvents.forEach(function (ev) { window.addEventListener(ev, onInteract, { capture: true, passive: true }); });
    }

    // ?skip test bypass: disarm the auto-open triggers and reveal the payoff immediately, skipping the
    // whole quiz + rewarded video. Fires on the next tick so the SDK/ad bundle has attached first.
    if (skipRequested()) { disarmAutoOpen(); setTimeout(function () { revealGuide("skip"); }, 0); }

    // Intake modal is FORWARD-ONLY: no X, no backdrop-close, no Esc. The visitor progresses
    // through the 3-tap quiz to the opt-in rewarded step (which keeps its own honest escape —
    // required so the rewarded AD stays skippable; see renderRewardStep + ../CLAUDE.md Fight 1).
    // close() is retained for programmatic use but no longer wired to any dismiss control.

    function progress() {
      var p = Math.min((step / total) * 100, 100);
      if (barEl) barEl.style.width = p + "%";
      if (stepEl) stepEl.textContent = T.stepFmt
        .replace("{n}", Math.min(step + 1, total)).replace("{t}", total);
    }

    function render() {
      rendered = true;
      progress();
      bodyEl.innerHTML = "";
      if (step < qs.length) {
        var q = qs[step];
        var h = document.createElement("h2"); h.className = "usa-q"; h.textContent = q.q;
        bodyEl.appendChild(h);
        if (q.sub) { var sub = document.createElement("p"); sub.className = "usa-sub"; sub.textContent = q.sub; bodyEl.appendChild(sub); }
        var opts = document.createElement("div"); opts.className = "usa-opts";
        q.options.forEach(function (o) {
          var b = document.createElement("button"); b.type = "button"; b.className = "usa-opt";
          var lbl = document.createElement("span"); lbl.className = "usa-opt-label"; lbl.textContent = o.label;
          b.appendChild(lbl);
          b.insertAdjacentHTML("beforeend", ICON.arrow);
          b.addEventListener("click", function () {
            ans[q.key] = o.id; ans[q.key + "_label"] = o.label;
            if (window.track) track("funnel_step", { funnel: FN, step_name: q.key, step_index: step + 1, step_total: total });
            step += 1; render();
          });
          opts.appendChild(b);
        });
        bodyEl.appendChild(opts);
      } else {
        renderRewardStep();
      }
    }

    // Final modal step: "Jobs found" + an OPT-IN rewarded video. Reuses playRewarded/resolveAds so
    // the visitor always reaches /usa/results/ on any terminal outcome (never trapped).
    function renderRewardStep() {
      findSave(ans);   // persist answers so /usa/results/ personalizes via personalizeMatches
      progress();      // 100%
      // Optional "searching for jobs…" loader (cfg.searchLoader): hold here until the rewarded preload
      // is ready (or has definitively no-filled), so the reward CTA plays the ad INSTANTLY instead of
      // waiting after the click. Always bounded (min display + hard cap), so it can never hang. No-op
      // unless cfg.searchLoader is set.
      if (cfg.searchLoader) { runSearchLoader(renderRewardCTA); } else { renderRewardCTA(); }
    }

    // Brief job-search loader shown before the reward CTA. A PROGRESS BAR (not a spinner) so it reads
    // as "working", not "waiting": the fill advances on a decelerating curve (always moving, never
    // flat) and snaps to 100% the moment the rewarded ad is ready (rewardedSettled). A minimum display
    // so it doesn't flash, and a hard cap so it never hangs.
    function runSearchLoader(next) {
      bodyEl.innerHTML =
        '<div class="usa-done usa-loading">' +
        '<h2 class="usa-q" id="usa-loading-title"></h2>' +
        '<p class="usa-sub" id="usa-loading-sub"></p>' +
        '<div class="usa-progress-track" role="progressbar" aria-label="Searching for jobs" aria-valuemin="0" aria-valuemax="100"><span class="usa-progress-fill" id="usa-progress-fill"></span></div>' +
        '</div>';
      byId("usa-loading-title").textContent = cfg.searchLoader;
      var subEl = byId("usa-loading-sub");
      if (subEl) subEl.textContent = (cfg.copy && cfg.copy.searchSub) || "";
      var fill = byId("usa-progress-fill"), trackEl = bodyEl.querySelector(".usa-progress-track");
      if (window.track) track("funnel_search", { funnel: FN });
      var MIN = 1200, MAX = 6000, TAU = 1600, t0 = Date.now(), finished = false;
      (function tick() {
        if (finished) return;
        var el = Date.now() - t0;
        if ((rewardedSettled() && el >= MIN) || el >= MAX) {
          finished = true;
          if (fill) fill.style.width = "100%";
          if (trackEl) trackEl.setAttribute("aria-valuenow", "100");
          setTimeout(next, 200);   // let the bar visibly complete before the CTA
          return;
        }
        // Decelerating fill that approaches (but never reaches) 100 until we actually finish.
        var pct = Math.min(95, 100 * (1 - Math.exp(-el / TAU)));
        if (fill) fill.style.width = pct.toFixed(1) + "%";
        if (trackEl) trackEl.setAttribute("aria-valuenow", String(Math.round(pct)));
        setTimeout(tick, 80);
      })();
    }

    function renderRewardCTA() {
      bodyEl.innerHTML =
        '<div class="usa-done">' +
        '<span class="usa-check">' + ICON.check + '</span>' +
        '<h2 class="usa-q" id="usa-done-title"></h2>' +
        '<p class="usa-sub" id="usa-done-msg"></p>' +
        '<button class="btn" type="button" id="usa-reward">' + ICON.arrow + ' <span id="usa-reward-label"></span></button>' +
        '<p class="usa-escape" id="usa-escape" hidden><a href="#" id="usa-escape-link"></a></p>' +
        '</div>';
      // textContent, not innerHTML — these strings are translated copy, never markup.
      byId("usa-done-title").textContent = T.title;
      byId("usa-done-msg").textContent = T.sub;
      byId("usa-reward-label").textContent = T.btn;
      byId("usa-escape-link").textContent = T.skip;
      var btn = byId("usa-reward"), titleEl = byId("usa-done-title"), msgEl = byId("usa-done-msg");
      var escapeWrap = byId("usa-escape"), escapeLink = byId("usa-escape-link");
      var busy = false, done = false;

      function go(status) {
        if (done) return; done = true;
        // SPA arm: the guide was already on screen behind the popup, VISIBLE but blurred (.wp-preview),
        // with only its ad slots held back (display:none) so no ad rendered behind the overlay. Now that
        // the overlay closes, drop the blur (un-hiding the slots) and RENDER them (preloaded during the
        // reward). Two-page arm: navigate to the results URL. Extracted into revealGuide() so the ?skip
        // test bypass reuses the exact same path.
        revealGuide(status);
      }
      // Early close of a real ad: nudge to finish (do NOT auto-advance) + reveal the honest escape.
      function reprompt() {
        if (done) return;
        busy = false;
        if (btn) { btn.disabled = false; btn.innerHTML = ICON.arrow + " "; btn.appendChild(document.createTextNode(T.again)); }
        if (titleEl) titleEl.textContent = T.almost;
        if (msgEl) msgEl.textContent = T.finish;
        if (escapeWrap) escapeWrap.hidden = false;
      }
      if (escapeLink) escapeLink.addEventListener("click", function (e) { e.preventDefault(); go("user-escape"); });

      btn.addEventListener("click", function () {
        if (busy || done) return;
        busy = true; btn.disabled = true; btn.textContent = T.loading;
        if (window.track) track("reward_prompt", { funnel: FN });
        spaPreloadNative();   // SPA arm: fetch the guide's banners now, while the rewarded video plays
        var ready = resolveAds();
        if (ready) { playRewarded(ready, go, reprompt, FN); return; }
        // Async SDK not attached yet — wait briefly, but never trap: reveal on timeout.
        var waited = 0, iv = setInterval(function () {
          waited += 150;
          var a = resolveAds();
          if (a) { clearInterval(iv); playRewarded(a, go, reprompt, FN); }
          else if (waited >= 4000) { clearInterval(iv); if (window.track) track("reward_nofill", { funnel: FN, via: "sdk-unavailable" }); go("sdk-unavailable"); }
        }, 150);
      });
    }
  }

  /* ---------- /me/<lang>/ready/ — the Saudi funnel's opt-in rewarded step ----------
     A whole PAGE (not a modal), so there is no overlay and the page's own display ads stay
     viewable. Every string is passed in from build.js because the page may be Arabic, Urdu,
     Hindi, Bengali or English. Reuses playRewarded, so the same never-trap rules apply: the
     guide opens on granted / no-fill / error / SDK-absent / timeout, and an early close nudges
     once and reveals the honest escape link. Do NOT remove the escape or the timeout paths. */
  function initMeReward(cfg) {
    var btn = byId("me-reward"); if (!btn) return;
    warmAds();   // warm the SDK on the /ready/ step so the rewarded is ready by the time they click
    var titleEl = byId("reward-title"), msgEl = byId("reward-msg");
    var escapeWrap = byId("reward-escape"), escapeLink = byId("me-escape");
    var busy = false, done = false;
    var fn = cfg.fn || "jobs_me";

    function go(status) {
      if (done) return; done = true;
      if (window.console) console.debug("[me] continue:", status);
      location.href = cfg.next;
    }
    // Early close of a REAL ad: nudge once, then show the way out. Never a hard trap.
    function reprompt() {
      if (done) return;
      busy = false;
      if (btn) { btn.disabled = false; btn.innerHTML = ICON.arrow + " " + cfg.again; }
      if (titleEl) titleEl.textContent = cfg.almost;
      if (msgEl) msgEl.textContent = cfg.finish;
      if (escapeWrap) escapeWrap.hidden = false;
    }
    if (escapeLink) escapeLink.addEventListener("click", function (e) { e.preventDefault(); go("user-escape"); });

    btn.addEventListener("click", function () {
      if (busy || done) return;
      busy = true; btn.disabled = true; btn.textContent = cfg.loading;
      if (window.track) track("reward_prompt", { funnel: fn });
      var ready = resolveAds();
      if (ready) { playRewarded(ready, go, reprompt, fn); return; }
      // SDK not attached yet — wait briefly, but never trap: continue on timeout.
      var waited = 0, iv = setInterval(function () {
        waited += 150;
        var a = resolveAds();
        if (a) { clearInterval(iv); playRewarded(a, go, reprompt, fn); }
        else if (waited >= 4000) {
          clearInterval(iv);
          if (window.track) track("reward_nofill", { funnel: fn, via: "sdk-unavailable" });
          go("sdk-unavailable");
        }
      }, 150);
    });
  }

  /* ---------- /worldwide-us/ "Apply now" gate — a SECOND opt-in rewarded, on the revealed advertorial ----------
     Every [data-wus-apply] CTA opens a small dismissable modal that opts the visitor into a short
     sponsored video; on ANY terminal outcome (granted / no-fill / error / SDK-absent / timeout /
     escape) they land on the how-to-apply guide (cfg.next). Reuses playRewarded/resolveAds, so the
     same never-trap rules apply as every other gate. The intake quiz (initUsaModal) is a separate
     dialog; this one is fully closeable (X / backdrop / escape) because there is real content — the
     whole advertorial — behind it, and the guide is reachable by skipping. */
  function initWusApply(cfg) {
    cfg = cfg || {};
    var triggers = document.querySelectorAll("[data-wus-apply]");
    var modal = byId("wus-apply-modal");
    if (!triggers.length || !modal) return;
    if (modal.parentNode !== document.body) document.body.appendChild(modal);
    var btn = byId("wus-apply-btn"), titleEl = byId("wus-apply-title"), msgEl = byId("wus-apply-msg");
    var escapeWrap = byId("wus-apply-escape"), escapeLink = byId("wus-apply-escape-link");
    var C = cfg.copy || {};
    var initTitle = titleEl ? titleEl.textContent : "";
    var initMsg = msgEl ? msgEl.textContent : "";
    var initLabel = btn ? btn.textContent : "Show me how to apply";
    var T = {
      loading: C.loading || "Loading your video…",
      almost:  C.almost  || "Almost there",
      finish:  C.finish  || "Finish the short video to open your apply guide.",
      again:   C.again   || "Watch again to open the guide"
    };
    var fn = cfg.fn || "jobs_worldwide_us_apply";
    var next = cfg.next || "/";
    var busy = false, done = false;

    function lock(on) { try { document.body.classList[on ? "add" : "remove"]("usa-lock"); } catch (e) {} }
    function resetUI() {
      if (titleEl) titleEl.textContent = initTitle;
      if (msgEl) msgEl.textContent = initMsg;
      if (btn) { btn.disabled = false; btn.textContent = initLabel; }
      if (escapeWrap) escapeWrap.hidden = true;
      busy = false;
    }
    // Re-arm the rewarded fill for THIS gate: warmAds() preloads the rewarded only once per page, and
    // the intake quiz's reward consumed that fill, so preload again here for a fast showRewarded().
    function preloadRewardedNow() {
      var a = resolveAds(); if (!a) return;
      var pr = adsWith("preloadRewarded", a); if (!pr) return;
      try { pr.preloadRewarded({ onReady: function () {}, onFallback: function () {} }); } catch (e) {}
    }
    function openModal() {
      if (done) return;
      resetUI();
      if (modal.hidden) { modal.hidden = false; lock(true); }
      preloadRewardedNow();
    }
    function closeModal() { if (!modal.hidden) { modal.hidden = true; lock(false); } resetUI(); }

    function go(status) {
      if (done) return; done = true;
      if (window.console) console.debug("[wus-apply] continue:", status);
      location.href = next;
    }
    function reprompt() {
      if (done) return;
      busy = false;
      if (btn) { btn.disabled = false; btn.textContent = T.again; }
      if (titleEl) titleEl.textContent = T.almost;
      if (msgEl) msgEl.textContent = T.finish;
      if (escapeWrap) escapeWrap.hidden = false;
    }
    function startReward() {
      if (busy || done) return;
      busy = true; if (btn) { btn.disabled = true; btn.textContent = T.loading; }
      if (window.track) track("reward_prompt", { funnel: fn });
      var ready = resolveAds();
      if (ready) { playRewarded(ready, go, reprompt, fn); return; }
      // SDK not attached yet — wait briefly, but never trap: continue to the guide on timeout.
      var waited = 0, iv = setInterval(function () {
        waited += 150;
        var a = resolveAds();
        if (a) { clearInterval(iv); playRewarded(a, go, reprompt, fn); }
        else if (waited >= 4000) {
          clearInterval(iv);
          if (window.track) track("reward_nofill", { funnel: fn, via: "sdk-unavailable" });
          go("sdk-unavailable");
        }
      }, 150);
    }

    Array.prototype.forEach.call(triggers, function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); openModal(); });
    });
    if (btn) btn.addEventListener("click", startReward);
    if (escapeLink) escapeLink.addEventListener("click", function (e) { e.preventDefault(); go("user-escape"); });
    Array.prototype.forEach.call(modal.querySelectorAll("[data-wus-apply-close]"), function (c) {
      c.addEventListener("click", function (e) { e.preventDefault(); closeModal(); });
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });
  }

  /* ---------- /worldwide-usy/ "View job" gate — a DIRECT interstitial, no opt-in modal ----------
     The /worldwide-usy/ variant (owner request 2026-09-14): the SECOND gate on the revealed feed is
     NOT the opt-in rewarded modal (initWusApply). Every [data-wus-apply] CTA fires a GAM INTERSTITIAL
     directly — no confirmation dialog — and then continues to the apply guide (cfg.next). The
     interstitial is the SDK/GAM web-interstitial format (ads.showInterstitial()), which the ad server
     frequency-caps and the visitor can always dismiss; it is triggered at the natural navigation break
     (feed -> apply guide), the sanctioned trigger point per the integration doc, NOT a hand-rolled
     forced overlay. The FIRST gate (the intake rewarded video, initUsaModal) is unchanged.
     NEVER TRAPS — the visitor ALWAYS reaches the guide: we navigate on the interstitial's terminal
     status (shown / closed / timeout / unavailable / busy / error), on a bounded safety guard if the
     SDK never resolves, immediately if the SDK/API is absent, and on any thrown/rejected error. The
     SDK "does not block content" (integration doc), so continuing is the required contract. */
  function initWusInterstitial(cfg) {
    cfg = cfg || {};
    var triggers = document.querySelectorAll("[data-wus-apply]");
    if (!triggers.length) return;
    var fn = cfg.fn || "jobs_worldwide_usy_apply";
    var next = cfg.next || "/";
    var done = false;

    function go(status) {
      if (done) return; done = true;
      if (window.console) console.debug("[wus-intr] continue:", status);
      if (window.track) track("interstitial_done", { funnel: fn, via: status });
      location.href = next;
    }

    // Is a real interstitial creative visibly on screen right now? An out-of-page interstitial renders
    // as a near-full-viewport overlay (a Google SafeFrame/syndication iframe) and Google's own Web
    // Interstitial (vignette) also stamps `#google_vignette` on the URL. We use this to tell "an ad is
    // actually showing, wait for the visitor to close it" apart from "nothing is showing, so do not make
    // them sit through the SDK's slow no-fill timeout". (Measured live: showInterstitial() takes ~10.5s
    // to resolve on a no-fill — waiting for it is the "stuck / sometimes it doesn't go" bug.)
    function interstitialOnScreen() {
      if (/google_vignette/i.test(location.hash)) return true;
      var vw = window.innerWidth || 0, vh = window.innerHeight || 0;
      if (!vw || !vh) return false;
      var nodes = document.querySelectorAll("iframe,ins");
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i], hay = (el.id || "") + " " + (el.src || "");
        if (!/google|doubleclick|safeframe|syndication/i.test(hay)) continue;
        var r = el.getBoundingClientRect();
        if (r.width >= vw * 0.6 && r.height >= vh * 0.6) return true;   // covers the viewport → showing
      }
      return false;
    }

    function fire() {
      if (done) return;
      var ads = resolveAds();
      if (!ads || typeof ads.showInterstitial !== "function") { go("sdk-unavailable"); return; }
      if (window.track) track("interstitial_prompt", { funnel: fn });
      // Fire the interstitial. Navigate when its lifecycle resolves (shown+closed, or a fast no-fill).
      var p;
      try { p = ads.showInterstitial(); }
      catch (e) { go("error:" + e); return; }
      Promise.resolve(p).then(function (result) { go("status:" + (result && result.status)); },
                              function (e) { go("rejected:" + e); });
      // Fast-forward guard: poll briefly for a VISIBLE interstitial. If one appears, stop polling and
      // let the promise resolve on dismissal (an ad is never cut off). If none appears within the
      // window, continue immediately — do NOT wait out the SDK's ~10s no-fill timeout (the stuck bug).
      var waited = 0, SHOW_WINDOW = 3500, poll = setInterval(function () {
        if (done) { clearInterval(poll); return; }
        if (interstitialOnScreen()) { clearInterval(poll); return; }   // showing → wait for dismiss
        waited += 300;
        if (waited >= SHOW_WINDOW) { clearInterval(poll); go("no-interstitial-shown"); }
      }, 300);
      // Absolute cap: a shown-but-never-dismissed interstitial still releases the visitor eventually.
      setTimeout(function () { if (!done) go("absolute-cap"); }, 20000);
    }

    Array.prototype.forEach.call(triggers, function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); fire(); });
    });
  }

  window.Jobs = {
    initApply: initApply,
    initMeReward: initMeReward,
    initWusApply: initWusApply,
    initWusInterstitial: initWusInterstitial,
    initHomeSearch: initHomeSearch, initFind: initFind, initMatching: initMatching,
    initMatches: initMatches, initRewardResults: initRewardResults, initChat: initChat,
    initUsaModal: initUsaModal
  };
})();
