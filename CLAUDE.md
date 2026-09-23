# jobs-world — Site Instructions (jobsthe.world)

Inherits everything in `../CLAUDE.md` (root portfolio brief). Read that first.

---

## THIS IS AN INDEPENDENT SITE. IT IS NOT A MIRROR.

`jobs-world/` and `jobs/` are **two separate codebases for two separate businesses-in-miniature**,
each with its own repo, its own branch, its own Cloudflare project and its own deploy cadence.
They started from the same engine and are near-identical today, and **they are expected to
diverge** — that is the point of running two.

| | this site | sibling site |
|---|---|---|
| Folder | `jobs-world/` | `jobs/` |
| Brand | **Jobs World** | Job Guide Match |
| Domain | **jobsthe.world** | jobguidematch.com |
| Repo | `adeshsarwan/jobstheworld` | `chandrakanth527/content-arb-jobs` |
| Branch | **`developer/new-frontend`** | `main` |
| GA4 | `G-1JWDWNWK4R` | `G-44NKY8JETT` |

### Rules of engagement (owner's instruction, 2026-09-23)

1. **Never auto-propagate.** There is no generator, no sync script, no shared source of truth.
   A change made here is made HERE. Nothing you do in this folder may touch `jobs/`, and nothing
   done in `jobs/` may reach into this folder. The owner deploys the two sites separately and
   does not want one site's change to be able to break the other.
2. **By default the owner wants the same change on both sites** — but applied *by hand, to each
   codebase, as its own edit and its own commit*, so each can be reviewed, versioned and deployed
   on its own. When the owner asks for a change without naming a site, ask which sites it is for,
   or state plainly which one you are changing.
3. **When they diverge, that is allowed.** Do not "fix" a difference between the two sites just
   because it exists. Divergence is a deliberate option here, not drift to be corrected.
4. **Do not touch `main` of `adeshsarwan/jobstheworld`** — it holds an unrelated Next.js
   application belonging to someone else. This site lives ONLY on `developer/new-frontend`,
   which is an orphan branch (no shared history), so the two can never collide or be merged.

### Known differences from the sibling site

- **Analytics:** own GA4 property `G-1JWDWNWK4R`. Never point this site at jobguidematch's
  `G-44NKY8JETT` — one property fed by two domains mixes the sessions and breaks
  "which campaign is profitable" on *both* sites.
- **Google Ads tag:** none yet (`SITE.adsId` / `adsConversionLabel` are blank). Funnel events,
  including `reward_prompt`, still reach GA4 so funnel reporting is intact; what is missing is the
  Ads-side conversion, i.e. Google Ads cannot yet optimise bidding on the rewarded trigger here.
  Set both when a tag exists for this domain.
- **Price Optimiser / GAM SDK:** this site currently loads the **jobguidematch** per-site bundle
  (`experiences/jobguidematch.js`) because it is the only one that exists today (owner's
  instruction: reuse the existing script until the new one arrives).
  **Known limitation:** the siteKey is baked INTO that bundle, so this site's impressions report
  to GAM as jobguidematch, and fill on a domain the partner has not registered is not guaranteed.
  When thebesads issues the jobsthe.world bundle, change `PARTNER_SCRIPT` in `build.js` — and
  **curl the new URL for a 200 first**, because a 404 bundle silently kills the entire ad stack
  (that exact failure took the sibling site's ads down once already).
- **`ads.txt` is unchanged** (`pub-1730786981458373`) and should stay: same Opti Digital / GAM
  seller account, so the same authorization line is the correct one.

### Deploy — Cloudflare **Worker** (not Pages)

jobsthe.world is served by an existing Cloudflare **Worker** named **`jobstheworld`**, which the
custom domain is attached to. It previously ran the OpenNext/Next.js app from `main`; it now builds
this branch instead. Confirmed live before the switch: the apex resolved to Cloudflare and responded
with `x-opennext: 1`, so DNS and the custom domain are already correct and must NOT be touched.

**`wrangler.toml` `name` MUST stay `jobstheworld`.** It is the deploy target. If it says anything
else, `wrangler deploy` creates a SECOND Worker with no domain attached, the deploy "succeeds", and
jobsthe.world silently keeps serving the old build. This is the single easiest way to lose an hour
here.

Workers Builds settings (dashboard → the `jobstheworld` Worker → Settings → Build):

| setting | value |
|---|---|
| Git repository | `adeshsarwan/jobstheworld` |
| Branch | **`developer/new-frontend`** |
| Root directory | **`/`** (repo root — was `frontend` for the Next.js app) |
| Build command | **empty** (`dist/` is committed; nothing to build) |
| Deploy command | `npx wrangler deploy` |

The Worker is **assets-only** — there is no Worker script, just `[assets] directory = "./dist"`.
`html_handling` defaults to `auto-trailing-slash`, which is what serves `/find/1/` from
`dist/find/1/index.html`; every page here is a directory index, so do not change it.

**After the first switch, purge the Cloudflare cache.** The Next.js app sent
`cache-control: s-maxage=31536000` on its HTML, so the edge can hold year-old copies of `/` and
serve them over the new site.

After a push, open `https://jobsthe.world/v` and check the version + build time match what you just
shipped. Rollback is the same screen: point the branch back and redeploy, or use the Worker's
Deployments tab to roll back to a previous version.

---

## Site identity

- **Brand name:** Jobs World (`SITE.name` in `build.js`) — tagline "Jobs Hiring Near You".
- **Domain:** jobsthe.world (`SITE.domain`) — drives canonical + sitemap + robots. Deploys via
  Cloudflare git-integration from the **`developer/new-frontend`** branch of
  `adeshsarwan/jobstheworld` (NOT `main` — see the independence section above).
- **Content skin:** U.S. job discovery — employer advertorials + job-category search pages.
- **Logo:** inline-SVG location-pin-cradling-a-briefcase mark. No emoji anywhere (root rule).
- **Home page:** skips the top logo bar (via `page({hideHeader})`) — the brand lives once, as a
  lockup inside the hero, so there's no double branding. Other pages keep the header for nav.

### Build & deploy
- **Build:** `node build.js` → outputs the whole static site to `dist/` (pure HTML/CSS/JS).
- **Version — ALWAYS bump before committing/pushing.** Bump `SITE.version` in `build.js` (semver) on
  **every** commit that goes to remote, then rebuild so `dist/` carries it. The build stamps a fresh
  timestamp and emits **`/v`** (`dist/v/index.html`, noindex) reporting `SITE.version` + build time.
  Because `dist/` is committed and Cloudflare serves it, after a push open `https://jobsthe.world/v`
  to confirm the deploy shipped this release (version + time should match). No bump = you can't tell
  whether the committed build is the one live. (Same discipline as senior-quizzes.)
- **Local preview:** serve `dist/` (e.g. `python3 -m http.server` from inside `dist/`).
- **New property = new `data/<id>.json`, then `node build.js`.** No page hand-editing.
- **Monetization is 100% Google Ad Manager (GAM) via the Price Optimiser Publisher Experience SDK**
  (`PARTNER_SCRIPT` in `build.js`, loaded on every page — see `../PUBLISHER_INTEGRATION.md`).
  **Our ad server is GAM, NOT AdSense.** Every ad slot renders as an **empty reserved `<div>`
  carrying the unit's `#id`**; the SDK attaches a GAM slot to it via GPT (`googletag`) and fills it.
  The SDK is the PER-SITE bundle `experiences/jobguidematch.js` (partner renamed it from
  `jobguidematch.com.js` around 2026-09-06 — the old `.com.js` URL now 404s and killed the whole ad
  stack until corrected v1.42.0; ALWAYS curl the bundle URL for a 200 before debugging fill) (switched 2026-08-30, partner
  request) — it carries the site's display-placement registry baked in; the old shared
  `publisher-sdk.js` + `data-po-site` form has NO display placements (rewarded only) and must not
  be restored.
  **Do NOT set an AdSense client / render `<ins>` units / load `adsbygoogle.js` / hand-roll a second
  `googletag` setup** — per the integration doc that is a forbidden SECOND ad stack on the SDK's own
  slots. (The old `SITE.adsenseClient`/`SITE.adSlots` config and the `<ins>`/mock code path were
  removed 2026-07-26 for exactly this reason — matching what senior-quizzes did on 2026-07-25.)
  `ads.txt` (Google `pub-1730786981458373`) stays — that is GAM/AdX seller authorization, not AdSense.
- **Go-live before paid traffic:** the SDK is already wired on every page. Confirm the domain is
  approved in Price Optimiser and that slots fill on the live host; no per-site ad IDs to paste.

---

## The money model (owner decision, recorded)

Content arbitrage: buy clicks on Google/Facebook → land on our pages → monetize. The owner's
instinct was "a popup ad on every click." We do **not** build literal pop-ups/pop-unders —
they are a banned ad format (AdSense demonetization) and a Google Ads landing-page violation
(account suspension). See root §4 Fight 1. Instead we implement the compliant version that the
reference arbitrage sites actually use, which earns the same "every click is monetized" outcome:

**Every click advances a 3-step funnel, and every step is its own URL = its own pageview =
a fresh set of ad impressions.** Base model = **funnel monetized with in-content + native ad
units** (never per-click; no FORCED interstitial/pop-up overlays). An **opt-in, skippable
rewarded gate** is now the default on `/find/` results, with a no-gate control arm — see Ad placement.

```
Step 1  <base>/            Advertorial landing   (leaderboard, in-content, results, anchor ads)
Step 2  <base>/openings/   Open-roles page       (roles + in-content/native ads)
Step 3  <base>/apply/      Redirect page         (ad + outbound to a real job board)
```

- Two page types from one engine, keyed by the data file's `type`:
  - `type:"employer"` → "<Company> is hiring" advertorial → `/jobs/<id>/...`
  - `type:"category"` → "<Category> jobs near you" search page → `/<id>/...` (id ends in `-jobs`).
- **Monetized with GAM display + native units** on every step (see Ad placement). Each step is
  its own pageview = its own ad impressions — the core arbitrage lever.
- **Outbound** goes to official careers pages / reputable job boards (`applyUrl` per data file),
  `rel="nofollow noopener sponsored"`. This is the affiliate/CPC leg of the funnel.

## Ad placement (empty reserved slots filled by the Price Optimiser SDK — see root §4/§5)
- Leaderboard (top), in-content, and results rectangles on every step. Each is an empty
  reserved `<div>` (see `adSlot()`); the SDK fills it by `#id`. `.ad-reserve` fixes the box
  size up-front so nothing shifts (CLS protection).
- Sticky anchor ad on every page (`anchorAd()`, `#ad-anchor`) — empty until the SDK fills it.
- **Native in-feed ad** (`nativeAdCard()`) — the EXISTING in-content unit (`#ad-incontent`) dropped
  inside the job-card grid, styled to match a real job card so it flows natively (reusing the unit =
  no extra ad / lower density; the standalone in-content slot is removed on those pages). It keeps a
  small "Ad" chip in the corner — the MINIMUM compliant label. Do NOT remove that chip / ship it fully
  unlabelled: a disguised ad styled as a job card = Google Publisher Policy strike + invalid-traffic
  clawback + the fastest job-funnel ban (see research brief). The chip is small on purpose; it stays.
- **No FORCED interstitial / pop-up / forced-ad overlays** — banned format, still off-limits.
  The old hard step-break interstitial stays gone.
- **Opt-in rewarded gate is now ON the champion `/find/` results page — the DEFAULT for all traffic
  (owner decisions 2026-07-26: re-introduced it, promoted it to default, then tightened it to nudge
  completion).** It is opt-in, non-monetary (unlocks the matches), honest copy. Reveal rules in
  `setupRewardGate`/`playRewarded` (`jobs.js`): watched-to-completion (reward granted) → reveal;
  **early close of a real ad → re-prompt "finish the video" + show a "Skip and see my matches"
  escape (does NOT reveal) — nudges completed views**; no-fill / error / SDK-absent / 6s+45s guards /
  the escape link → reveal. **Do NOT remove the escape or the no-fill/error/timeout reveals** — they
  are the only thing keeping this a nudge and not a forbidden non-skippable gate (Google rewards
  policy: dismissing an ad must not break site use). A hard "watch fully or no results, no way out"
  gate is a policy strike = ban. Because the gate is on 100% of default traffic, a no-gate control
  arm at `/x/no-gate/` exists to detect whether it suppresses conversion (see Experiment arms).
- **Start below the density cap; A/B toward the ceiling with real RPM/viewability/bounce data.**
- The full ad-unit map (names, div IDs, sizes, where each shows up) lives in `README.md`.

## Experiment arms (root §7 — split at the ad-buy, noindex)
The champion funnel is `/find/` — **7 questions + the opt-in reward gate** (the promoted default,
indexable question pages). One control arm is built, `noindex` and excluded from the sitemap:
- `/x/no-gate/` — the SAME 7-question funnel but with NO reward gate. Split some paid traffic here
  and compare results-through / apply-rate vs the champion to see whether the gate is helping or
  suppressing conversion. If the gate hurts, promote `/x/no-gate/` to `/` (drop the gate); if it
  helps, delete the arm. Measure before trusting it (root §4 Fight 1 / §7).

## Remote funnel — `/remote/` (dedicated work-from-home experience, added 2026-07-26)
A SECOND, niche-specific funnel alongside the generic `/find/`, built for the "remote jobs for
seniors / stay-at-home parents / students / …" ad angles. Same page-per-question engine (each Q =
one pageview = one ad impression), but tuned end-to-end for the one thing a remote funnel lives or
dies on: **trust** (remote work's #1 objection is "is this a scam?"). Defined in `build.js`:
`REMOTE_INTAKE` (8 questions), `REMOTE_ROLES` (the 5 real role types — single source of truth shared
by intake Q2 AND the results cards so they never drift), `REMOTE_ANGLES` (per-angle landers).
- **8 questions** `/remote/find/1..8/`: (1) audience self-ID — lets ONE funnel serve every ad angle;
  (2) role type `key:type` — drives the results reorder; (3) hours; (4) quiet space + internet — the
  legitimacy move (real screening = feels legit, and it's honest); (5) computer comfort; (6) start;
  (7) pay (honest ranges); (8) **trust seal** — single honest CTA, NOT a fake either/or (Fight 3),
  reassures "no email, no sign-up, no pay-to-start, reputable boards only" at the highest-intent moment.
- **"No email / no sign-up" promise** is repeated at entry (landing hero), on every question (the
  `funnel.micro` line), at the trust seal, and on results. **HARD GUARDRAIL: never add a lead-capture /
  email step to this funnel** — that would be bait-and-switch (FTC + ad-policy) against a stated promise.
- **Results** (`buildRemoteResults`) show the real remote ROLES as cards (not the all-property grid),
  each linking into the genuine `remote-jobs` destination funnel (→ openings → apply on a reputable
  board). The Q2-picked role surfaces first via the existing `personalizeMatches` reorder (card
  `data-cat` = role id). No reward gate on this funnel.
- **Landings:** generic `/remote/` is indexable (in sitemap); per-angle `/remote/seniors|parents|students/`
  are `noindex` near-duplicate paid landers that match their creative's headline and feed the shared
  `/remote/find/` funnel. Add an angle = add a `REMOTE_ANGLES` entry. Whole funnel (question steps,
  matching, results) is `noindex` (paid traffic; the generic landing carries any SEO).
- **Reporting note:** angle landers are distinct URLs (CPC attributes per FB/Google campaign), but the
  funnel steps are shared, so per-step RPM is blended across angles. Split the funnel by URL or wire
  `exp`/`arm` key-values (root §7) if per-angle funnel RPM is ever needed.

## USA modal lander + guide — `/usa/` → rewarded video → `/usa/remote-jobs/` (added 2026-07-29)
A THIRD entry point alongside `/find/` and `/remote/`, mirroring the reference arbitrage-lander UI
(jobguidedaily.com/job-opportunities-in-usa) but tuned as the judged-best compliant-arbitrage shape.
Defined in `build.js`: `USA_MODAL` (3 questions), `USA_REMOTE_BOARDS`/`USA_REMOTE_EMPLOYERS` (guide
content), `usaModal()`, `buildUsaLanding`, `placeList`, `buildUsaGuide`. Client: `Jobs.initUsaModal`.

**The funnel (owner decisions 2026-07-29):**
`/usa/` (entry, real content behind the modal) → **modal quiz opens IMMEDIATELY on load** → 3 quick
tap questions → **opt-in REWARDED video** (THE revenue maker) → **`/usa/remote-jobs/` CONTENT GUIDE**.
- **`/usa/`** (indexable): "Job Opportunities in the USA" lander (hero, two employer `propCard`s =
  our own SVG banners never ripped logos, benefit callouts, how-it-works, FAQ, ad slots). The modal
  **auto-opens immediately** (`USA_MODAL.autoDelay = 0`; owner: "modal should already show") on every
  load AND on any `data-usa-open` CTA. It is ALWAYS closeable (X / backdrop / Esc) with real content
  behind it — that closeability + the content behind are the line between an opt-in engagement modal
  and a **banned forced interstitial** (and they protect Google-Ads landing-page Quality Score → CPC).
- **The rewarded video is the revenue maker, placed at peak intent** (right after the quiz, not on a
  cold arrival) for the best completion (= revenue) rate. It REUSES the champion never-trap plumbing
  (`playRewarded`/`resolveAds`): the guide opens on ANY terminal outcome (granted / no-fill / error /
  SDK-absent / timeout / early-close→escape). **Do NOT remove the escape/timeout reveals**, and do NOT
  try to autoplay it (rewarded ads must be user-initiated — policy + the SDK needs a gesture).
- **`/usa/remote-jobs/`** (indexable, in sitemap — the rewarded-ad payoff): a GENUINE content guide —
  remote-role types with honest pay ranges (reuses `REMOTE_ROLES`), reputable BOARDS + EMPLOYERS with
  real outbound links (`rel="nofollow noopener sponsored"`, never their logos), scam-avoidance tips,
  FAQ — with in-content display ads (leaderboard + 2× in-content + results + anchor) spaced BETWEEN
  substantial sections (compliant density, high viewability). Real content = long dwell + an
  affiliate/outbound leg + it reads as an article, not a thin doorway (what keeps a monetized page off
  GAM's demonetization list). All copy is TRUE framing ("regularly hires", "search their site") — never
  an invented "X open roles now" (root §4 Fight 2). **Do NOT rename this page's boards/employers into
  fake "hiring now" counts, and keep the outbound `sponsored` rel + the footer disclosure.**
- **Widened 2026-08-20 to serve BOTH the U.S. visitor and the international one, and to carry the
  part-time / stay-at-home ad angle.** It is now the payoff for every entry point we can point a
  "work from home", "part-time", or "US remote jobs from <country>" creative at. Three blocks were
  added on top of the original U.S. spine (`FLEX_ROLES`, `FLEX_PLATFORMS`, `GLOBAL_BOARDS`,
  `GLOBAL_PLATFORMS`, `GLOBAL_EMPLOYERS` in `build.js`; `plainList()` renders the non-link rows):
  - *Part-time and flexible work* — role types + platforms that recruit in many countries.
    **Deliberately NO hourly $ ranges here**: this work is paid per task / per lesson / per audio
    minute and the volume moves week to week, so "how it is paid" is the only true framing. The
    research-studies row says out loud that it is supplemental income, not a job. Do not "improve"
    these into earnings claims — that is the exact shape of the work-from-home scam Google's
    Misrepresentation policy suspends accounts over.
  - The duplicate second `adSlot("inContent")` was REMOVED (duplicate `#id` never fills — see the
    `/me/` ad-load note). The page now carries leaderboard + in-content + results + anchor, each
    once. Do not "add density" by repeating a placement — ask thebesads to register another unit.
  - The international half was SPLIT OUT the same day into `/remote-jobs-worldwide/` (below). This
    page keeps a card CTA + a lead-paragraph link to it, and the "Can I get a U.S. remote job from
    another country?" FAQ points there.

## International guide + funnel — `/worldwide/` → rewarded → `/remote-jobs-worldwide/` (added 2026-08-20)
A SEVENTH entry point, for the "remote jobs in the US from <country>" ad angles (India, Nigeria,
Philippines …). Defined in `build.js`: `GLOBAL_BOARDS`/`GLOBAL_PLATFORMS`/`GLOBAL_EMPLOYERS` (guide
content), `buildWorldwideGuide`, `WORLDWIDE_MODAL`, `buildWorldwideLanding`. Reuses the one modal
engine (`usaModal({bare:true})` + `Jobs.initUsaModal`) — same shape as `/generic/`.

> **PROMOTION 2026-08-28 — `/worldwide/` now serves the SINGLE-PAGE (SPA) shape** (built by
> `buildWorldwidePre`, `fn: jobs_worldwide`). The two-page modal lander described in THIS section
> (`buildWorldwideLanding`) was **demoted to `/worldwide-bkp/`** (`fn: jobs_worldwide_bkp`), kept as a
> fallback / A/B arm. `/worldwide-pre/` no longer exists (its build moved into `/worldwide/`). The SPA
> mechanics are documented in the "`/worldwide/` — SINGLE-PAGE (SPA) CHAMPION" subsection below; the
> text in this section describes the backup shape now living at `/worldwide-bkp/`.

```
/worldwide/                bare pop-up on load — 3 geo-neutral questions   (noindex, NO ad slots)
   -> opt-in rewarded video
   -> /remote-jobs-worldwide/   international guide (indexable, full ad load)
```
- **Why it is its own page and not a section of `/usa/remote-jobs/`:** (1) one more ad-bearing
  pageview per visitor who cares about it, carrying a FULL slot load instead of sharing the U.S.
  page's three (root §2 — session depth is the lever); (2) a page whose `<h1>` and canonical say
  "U.S." will never rank for "remote jobs from India", and its own page can. The two guides link to
  each other both ways, so either can be the paid landing without orphaning the other.
- **The guide is genuinely international.** It states the real reason most U.S. postings are
  U.S.-only (the employer must run payroll and tax where you live), then only the three routes that
  exist: international/EOR employers, contractor + freelance work, and global at-home recruiters.
  Boards are ones that show which countries a company can hire in; platforms are the freelance
  marketplaces; employers are genuinely cross-border. Outbound `rel="nofollow noopener sponsored"`,
  no logos, **no earnings figures anywhere** (root §4 Fight 2).
- **HARD GUARDRAIL: NEVER add a visa, sponsorship, or relocation angle** — to the guide, the lander,
  or any creative pointed at them. Nobody can sell a U.S. job or a visa; the claim is false, it is
  Google Ads Misrepresentation (job-scam enforcement, which is account-level, not ad-level), and it
  is the single fastest ban available in this niche. The guide says so explicitly and the six-item
  scam list leads with it, alongside the WhatsApp/Telegram daily-payment task fraud — the two that
  matter most for this traffic.
- **`/worldwide/` carries NO display slots and `hideAnchor`** — the modal opens on load and covers
  the page (root §5, the 2026-08-08 rule). Monetization is the rewarded video plus the guide's ad
  load. The page behind the pop-up is minimal but not empty and the pop-up is always dismissable —
  both load-bearing (a modal over a blank page is a doorway). Do not auto-forward.
- **The three questions are geo-NEUTRAL on purpose** (type / prior remote experience / start). Asking
  "which country are you in?" would telegraph a multi-country campaign and undercut the "this is for
  me" feel — same reasoning as `/packing-jobs/`. The guide is static and does not depend on them.
- GA4 funnel id `jobs_worldwide` (distinct from `jobs_generic`), so the arms separate in reporting.
- Linked from the home lander's "Popular right now" quick-links (root home-lander rule).
- **Next revenue step, not yet done:** this is the modal shape (1 ad-bearing pageview before the
  reward). The `/me/` page-per-question shape earns ~5. If the angle proves out, rebuild it as
  page-per-question and split at the ad-buy to measure — do not promote on instinct.

### `/worldwide/` — SINGLE-PAGE (SPA) CHAMPION (built by `buildWorldwidePre`; promoted 2026-08-28)
Was `/worldwide-pre/` (an experiment arm) until 2026-08-28, when it was **promoted into `/worldwide/`**
(the old two-page shape backs up at `/worldwide-bkp/`, `fn: jobs_worldwide_bkp`). Builder still named
`buildWorldwidePre`; it now writes `worldwide/index.html` with `fn: jobs_worldwide`. **Identical funnel
to the backup** — same 3 geo-neutral
questions, same opt-in rewarded video, same payoff CONTENT (`worldwideGuideBody()`, shared with the
real guide), same tracking events. **The ONLY difference is how the page loads:** instead of a
two-page navigation (`/worldwide/` → rewarded → `/remote-jobs-worldwide/`), the whole guide is
rendered on THIS page and shown **VISIBLE-BUT-BLURRED behind the popup** (`#wp-guide.wp-preview`) —
the final page is already loaded underneath, frosted by the modal's own `.usa-backdrop`
(`backdrop-filter: blur`), so when the reward completes the blur simply lifts and the visitor is
already on the page (no pop-in, no reload). `initUsaModal` with `cfg.spa`/`revealId`/`guidePath`.
No navigation → the ad SDK inits ONCE and stays warm, so the guide's ads come up faster on reveal.
- **Why it is compliant (the point that unblocked it):** `.wp-preview` holds back ONLY the ad slots —
  `.ad-slot`/`.anchor-slot` are set to `display:none`, so the SDK skips them (no ad renders behind the
  overlay = no non-viewable impression) while every other pixel of the guide is on screen. Their
  reserved `.ad-reserve` boxes keep their space, so nothing shifts when the ads fill on reveal.
  Verified in-browser: `#wp-guide` computed `display:block` (visible), all four ad slots `display:none`
  behind the popup, blur lifts on reveal and the SDK defines+requests the slots. During the rewarded
  video `spaPreloadNative()` calls `preloadSlots([...exact div IDs...])` (v1.34.0; was the legacy
  `["native","anchor"]` type form), which is **FETCH-ONLY**
  (thebesads confirmed 2026-08-28 — it does not render or count an impression); the slots only RENDER
  (counted) at reveal. **The reveal needs an EXPLICIT SDK call — un-hiding alone does NOT render them
  (v1.36.0 fix for the blank `/worldwide/` ads).** Because the slots are `display:none` at init, the
  SDK never attaches its visibility observer to them, so dropping `.wp-preview` does not trigger a
  request. `spaRenderAds()` (called on reveal, after the blur is dropped) now calls the partner's reveal
  API on the exact div IDs: **`revealSlots([ids])` ONLY** (v1.38.0, per partner skill
  `publisher_display_skill_edit`): the skill's own helper returns `reveal_slots_unavailable` and does
  NOTHING when the API is absent — it does NOT fall back to `refreshSlots`, so our old refreshSlots
  fallback was removed. Guarded with a typeof check so an older SDK cannot throw. `revealSlots`
  SHIPPED 2026-08-30 (live SDK etag `ac0c2f51…`, 88,642 B), so the guard is belt-and-braces. **NEVER `refreshAll()`** (fresh auction, discards the preload — the v1.35.0
  no-op that removed refreshAll left NOTHING on reveal, which is exactly why the slots went blank).
  **TIMING (v1.37.0, partner spec 2026-08-30): un-hide the container FIRST, then reveal on a DOUBLE
  `requestAnimationFrame`.** The caller drops `.wp-preview` (removing the slots' `display:none`), and
  `spaRenderAds()` schedules the reveal two frames later. Calling reveal in the same tick as the
  un-hide is TOO EARLY — the browser has not committed the DOM/CSS, so the SDK sees the real divs (or
  their ancestors) as not-yet-renderable and the reveal can break. v1.36.0 called it synchronously
  (the bug); do NOT remove the double-rAF. **FILL STATUS (traced live 2026-08-30 with `?po_debug=1` — read before blaming the
  integration): the whole reveal/preload chain WORKS; GAM simply returns no ad.** The SDK log shows,
  per slot: `PO preload GPT defined` -> `PO preload requested` -> `GAM display floor:3` ->
  `render ended isEmpty:true` -> retry `floor:1` -> empty -> `GAM plain fallback request floor:null`
  -> empty -> `GAM waterfall exhausted` -> `PO preload failed`. **Even at `floor:null` (no floor at
  all) it is empty**, so this is NOT pricing, NOT our code, and NOT SPA-specific (the plain
  `/remote-jobs-worldwide/` guide behaves identically). REWARDED is also `empty-render` on mobile.
  Escalate as a DEMAND/fill question (GAM unfilled-impressions by Country + Ad unit), not a code bug.
  Note `countryCode: IN` in the runtime-config from this location.
- **REWARDED is DESKTOP-INELIGIBLE by Google's design (diagnosed 2026-08-30).** On a desktop-width
  viewport GPT logs `OutOfPageFormat.REWARDED ad slot ineligible as page is not mobile optimized`
  and our preload ends `[reward] preload fallback: timeout`. **This is not a page bug** — our viewport
  meta is correct (`width=device-width, initial-scale=1`) and the warning DISAPPEARS entirely at 375px,
  where the rewarded slot becomes eligible and requests normally (retry reason changes from
  `attempt-timeout` to `empty-render`). Google's web Rewarded format is mobile-only. Consequence:
  desktop visitors can never receive a rewarded ad and always fall through the never-trap reveal path
  (granted/no-fill/error/timeout all reveal) — which is exactly what the funnel already does. Do NOT
  "fix" this in the page, and always test rewarded at a mobile viewport.
  Fetch ahead, render on reveal. **Do NOT drop `.wp-preview` from the initial markup and do NOT make
  the ad slots visible before reveal** — that would render ads behind the overlay = non-viewable
  impressions + policy risk. (On localhost the slots no-fill and collapse — that is the unauthorized-
  domain behavior, not the flow; verify fill on the live host / GAM, see the fill-diagnosis note.)
- **noindex, NOT in the sitemap.** It is a paid entry and a near-duplicate of the indexable guide; the
  owner confirmed this angle gets no organic traffic, so there is nothing to protect for SEO. The
  indexable `/remote-jobs-worldwide/` guide is untouched and still carries any SEO.
- GA4 funnel id `jobs_worldwide` + a virtual `page_view` for the guide path on reveal. The backup
  two-page shape at `/worldwide-bkp/` uses `jobs_worldwide_bkp`, so the two shapes separate in reporting
  and can be A/B'd by pointing campaigns at the two URLs (root §7).
- **"Searching for jobs…" loader (v1.32.0; PROGRESS BAR v1.33.0):** after the last question,
  `runSearchLoader()` holds a branded loader (`cfg.searchLoader` + `copy.searchSub` + an animated
  **progress bar**, not a spinner — reads as "working", not "waiting") UNTIL the rewarded ad preload is
  ready (`rewardedReady`/`rewardedSettled`, set from `warmAds`' `preloadRewarded` callbacks) — bounded
  min ~1.2s / max 6s so it never hangs. The bar fills on a decelerating curve (`1-e^(-t/τ)`, capped 95%,
  always moving) and snaps to 100% the instant the ad is ready. This moves the rewarded-load wait OFF
  the CTA click, so tapping the CTA plays the ad instantly instead of lagging. The CTA text is **"View
  jobs"** (not "Show my guide"). Both are `cfg`-scoped (`searchLoader` + `copy`), so ONLY `/worldwide/`
  gets them — the backup and other landers are unchanged. `funnel_search` GA4 event fires on show.
- Verified in-browser incl. **mobile 375px** (primary traffic): quiz → "Searching for jobs…" loader →
  "View jobs" CTA → in-page reveal, guide blurred behind then un-blurs, ad slots held back, 56px tap
  targets, zero horizontal overflow, no console errors.
- **RESOLVED (thebesads 2026-08-30):** the render trigger on reveal is simply **un-hiding the slots**
  (drop `.wp-preview` → the slots lose `display:none`); the SDK renders the creatives it preloaded on
  its own. We **removed the `refreshAll()`** we used to fire here — it forced a fresh auction that
  discarded the preloaded ads. Confirm ad FILL on the live host — a
  tooling/localhost browser shows no-fill+collapse regardless (see the fill-diagnosis note), so verify
  in a real browser or GAM before judging.

### Geo pages: `/remote-jobs-worldwide/<country>/` — how aggressive ad copy becomes legal (2026-08-20)
`buildSouthAfricaGuide` + `buildSaLanding` in `build.js`; first instance is South Africa.

```
/worldwide/sa/                               SA paid entry (noindex, NO ad slots)
   -> opt-in rewarded video
   -> /remote-jobs-worldwide/south-africa/   SA guide (indexable, full ad load)
```
- **WHY THIS PATTERN EXISTS — read before writing any creative.** The owner needs hard-hitting ad
  copy to win clicks. The way to get it is NOT to loosen the claim, it is to make the landing page
  PROVE the claim. "Paid in dollars, not rands" was unsupportable while no page mentioned currency —
  a reviewer sees an unbacked financial claim, which is the Misrepresentation bucket. With
  `PAY_RAILS` on the global guide and `SA_PAY_NOTES` on the SA page, the same sentence is a
  checkable fact. **Specificity is the aggression: a geo page buys you named companies, real
  time-zone arithmetic and real payment mechanics, all of which out-pull a vague promise.**
- **The line that does not move: mechanism yes, amount never.** How you are paid (currency, who
  holds the money, which rails reach a local bank, who pays the fee) is fact. What you will earn is
  a promise, and a specific figure — in rands or in dollars — is Google's "unreliable claims" rule
  and is enforced by suspending the ACCOUNT. The SA page says this outright in its scam block.
- SA facts are all verifiable and fixed: SAST is UTC+2 **with no daylight saving**, so the overlap
  arithmetic (SA afternoon = US East morning; near-total overlap with UK/Western Europe) is true
  year-round. PayPal withdrawals in SA route through First National Bank. SARS taxes residents on
  worldwide income. Load shedding is in there deliberately — omitting it is what marks a page as
  written by a foreigner, and it is the first thing an international employer asks about.
- `SA_EMPLOYERS` are global firms with **real South African operations** (Teleperformance,
  Concentrix, WNS, CCI Global, iSON, Amazon SA) — they can employ locally, no EOR needed. That is a
  different list from `GLOBAL_EMPLOYERS` and the distinction is the page's most useful content.
- **Adding another country = one guide builder + one lander + sitemap + home-lander link.** Keep the
  same spine: why applications get rejected / what the country has going for it / how payment lands
  / platforms / global employers / employers already operating there / practical requirements /
  local scams / FAQ. Never add a visa or relocation angle to any of them.

- The 3 quiz questions exist to build investment before the rewarded ask (higher completion); the
  guide is content, so it does not depend on the answers. (Old thin `/usa/results/` cards page was
  replaced by this guide 2026-07-29.)

### No ads behind the modal (fix 2026-08-08 — do not regress)
On `/usa/` (and `/usa-packing-jobs/`) the intake modal opens IMMEDIATELY on load and covers the page.
Display ad slots there rendered BEHIND the blurred backdrop = non-viewable impressions Google can read
as an ad hidden by an interstitial (Publisher Policy / Better Ads risk) and viewability → RPM tanks. So
**these modal-first landers carry NO `adSlot()` units and set `page({hideAnchor:true})`** — nothing
renders behind the blur. Monetization is where the visitor can see it: the opt-in rewarded video, then
the content-guide page (which keeps its full in-content ad load). `page()` now takes `hideAnchor`.
**Do NOT re-add ad slots or the anchor to a lander whose modal opens over the page.**

## USA packing-jobs modal lander + guide — `/usa-packing-jobs/` → rewarded → `/usa-packing-jobs/from-home/` (added 2026-08-08)
A FOURTH entry point, same judged-best shape as `/usa/` for the "packing jobs from home" ad angle.
Reuses the one modal engine (`usaModal()` markup + `Jobs.initUsaModal`). Defined in `build.js`:
`PACKING_MODAL` (3 low-friction questions), `PACKING_ROLES`/`PACKING_BOARDS`/`PACKING_EMPLOYERS`
(guide content), `buildPackingLanding`, `buildPackingGuide`.
- **`/usa-packing-jobs/`** (indexable lander): hero → benefits → how-it-works → FAQ, modal opens on
  load, always closeable. NO ads behind the modal (see rule above).
- **`/usa-packing-jobs/from-home/`** (indexable guide, in sitemap — the rewarded payoff): honest
  packing-jobs article with in-content display ads. **This niche is a scam magnet** ("work-from-home
  packing / envelope-stuffing / assembly-kit" pay-a-fee scams), so the guide's compliance job is
  bigger than usual: it states plainly that genuine at-home packing is limited, most packing jobs are
  warehouse/fulfillment, and **a real job never charges you to start** — then links only to reputable
  boards/employers (`rel="nofollow noopener sponsored"`, no logos). Honest + useful = compliant. **Do
  NOT turn this into "X packing jobs from home, apply now" hype or drop the scam-warning section** —
  that would be exactly the deceptive framing (root §4 Fight 2) that bans the ad account.
- Linked from the home lander's "Popular right now" quick-links (root home-lander rule).

## Worldwide packing-jobs modal lander + guide — `/packing-jobs/` → rewarded → `/packing-jobs/guide/` (added 2026-08-08)
A FIFTH entry point: the GEO-NEUTRAL sibling of `/usa-packing-jobs/`, for running the packing-jobs
creatives as a **WORLD campaign** (not USA-only). Same judged-best shape and the exact same one modal
engine (`usaModal()` markup + `Jobs.initUsaModal`). Defined in `build.js`: `WORLD_PACKING_MODAL`
(4 questions), `WORLD_PACKING_ROLES`/`WORLD_PACKING_BOARDS`/`WORLD_PACKING_EMPLOYERS` (guide content),
`buildWorldPackingLanding`, `buildWorldPackingGuide`.
- **`/packing-jobs/`** (indexable lander): hero → benefits → how-it-works → FAQ, modal opens on load,
  always closeable. NO ads behind the modal + `hideAnchor` (same rule as `/usa/` — do not regress).
- **4 questions** (owner: 3-4): type → **experience** → hours → start. **Deliberately NO location
  question** — asking "where are you based?" would telegraph to the visitor that this is a multi-country
  campaign and undercut the "jobs near you" feel (owner decision 2026-08-08). The experience question is
  a generic, universal investment-builder that also reinforces the "no experience needed" hook. All the
  visible lander copy is kept locally-framed (no "worldwide"/"which countries"/"in your country") for the
  same reason — the funnel FEELS local while the guide underneath is honestly global. The guide is static
  content and does not depend on the answers; the questions only build investment before the rewarded ask.
- **`/packing-jobs/guide/`** (indexable guide, in sitemap — the rewarded payoff): honest, GEO-NEUTRAL
  packing-jobs article with in-content display ads. **Nothing is US-specific** — no "USA"/"nationwide",
  no "$"/"weekly pay" claims (pay is framed as "varies by country and employer — the official posting
  shows local pay"). Boards/employers are ones that operate across many countries and localize to the
  visitor (Indeed/LinkedIn/Jooble/Careerjet; Amazon Ops/Adecco/Randstad/ManpowerGroup), outbound
  `rel="nofollow noopener sponsored"`, no logos. Same scam-magnet spine as the US packing guide (genuine
  at-home packing is limited, most are warehouse/fulfillment, a real job NEVER charges to start). **Do
  NOT turn this into "X packing jobs, apply now" hype or drop the scam-warning section** (root §4 Fight 2).
- Linked from the home lander's "Popular right now" quick-links (root home-lander rule).

## `/worldwide-us/` advertorial → SECOND rewarded gate → `/worldwide-us/apply/` (added 2026-09-03, v1.41.0)
`/worldwide-us/` is the jobguidedaily.com clone on the SPA engine (`buildWorldwideUs`, own purple skin,
noindex). Its funnel used to end at the in-page advertorial reveal, and the advertorial's CTAs
**re-opened the intake quiz** (`data-usa-open`) — dead-end friction. Now the advertorial drives a
SECOND opt-in rewarded gate to a real how-to-apply guide. Defined in `build.js`: `applyBtn()` +
`applyGateCfg` + the `#wus-apply-modal` markup in `buildWorldwideUs`, `buildWorldwideUsApply` (the
guide page), and `Jobs.initWusApply` (`jobs.js`).
- **The advertorial's "Apply now" CTAs** (`data-wus-apply`, 7 of them incl. the nav + hero + several
  between-section bands) each open `#wus-apply-modal` — a **fully-dismissable** rewarded prompt (X /
  backdrop / Esc / honest escape link), SEPARATE from the forward-only intake quiz. It reuses
  `playRewarded`/`resolveAds`, so on **any** terminal outcome (granted / no-fill / error / SDK-absent /
  timeout / early-close→escape — **never a trap**) the visitor goes to `/worldwide-us/apply/`.
  `initWusApply` re-preloads the rewarded on open (`warmAds` only preloads once/page and the first gate
  consumed it). The employer cards were relabelled "View openings" (they still hand off straight to a
  job board) so "Apply now" is reserved for the gate. GA4 funnel id `jobs_worldwide_us_apply`.
- **`/worldwide-us/apply/`** (`buildWorldwideUsApply`, noindex, WUS skin, full ad load: leaderboard +
  in-content + results + anchor, each ONCE — `page()` renders the anchor, so the builder must NOT also
  emit `anchorAd()` or the `#ad-anchor` id duplicates and never fills): a **genuine, substantial,
  brand-safe article** — 5 apply steps, reputable national job boards (Indeed/LinkedIn/Glassdoor/
  Snagajob/USAJOBS) with real outbound links (`rel="nofollow noopener sponsored" data-po-no-intercept`,
  no logos), resume tips, a scam-avoidance block, FAQ. **Substance is the point:** high-quality
  contextual ads come from real US-jobs content + long dwell, not a thin doorway (a thin gated page is
  a Publisher-Policy doorway strike). **Do NOT thin it out, add fake "X jobs" counts, salary figures,
  or a visa/sponsorship angle** (root §4 F2 + the `/worldwide/` HARD guardrail). `/worldwide-us/`
  prefetches this page during the session so its ad divs fill a round-trip sooner.
- **Compliance:** two opt-in rewarded asks per session is allowed **only** while each stays honestly
  opt-in and never-traps, and the payoff page is real content — both hold here. Rewarded is mobile-only
  (Google), so desktop visitors skip the video via the never-trap path straight to the guide.

## Saudi Arabia multi-language funnel — `/me/<language>/` (added 2026-08-13)
A SIXTH entry point, and the first **geo-targeted, multi-language** one. Deliberately tiny: three
questions, an opt-in rewarded video, then a real Saudi jobs guide — emitted in **five languages**.
Defined in `build.js`: `ME_LANG_META` + `ME_T` (all translations) → `ME_LANGS`, `ME_BOARDS` /
`ME_OFFICIAL` / `ME_EMPLOYERS` (shared URLs, per-language descriptions), `buildMeHub`,
`buildMeQuestion`, `buildMeReady`, `buildMeGuide`. Client: `Jobs.initMeReward`.

```
/me/                  language hub (indexable, hreflang x-default)
/me/<lang>/           Q1 "What kind of job are you looking for?"   <- the PAID LANDING (indexable)
/me/<lang>/2/         Q2 "When can you start?"                      (noindex)
/me/<lang>/3/         Q3 "Which shift works best for you?"          (noindex)
/me/<lang>/ready/     opt-in rewarded video -> the guide            (noindex)
/me/<lang>/jobs/      Saudi Arabia jobs GUIDE (indexable, in sitemap)
```
- **Languages** (`slug` = URL segment): `english`, `arabic`, `urdu`, `hindi`, `bengali`. Arabic is
  the country's language, English the business lingua franca, and Urdu/Hindi/Bengali are the
  languages of the three largest expatriate worker populations. Next candidates if we widen:
  Tagalog, Malayalam. **Adding a language = one `ME_LANG_META` entry + one `ME_T` block** — the
  hub, hreflang cluster, sitemap and footer switcher all follow automatically.
- **PAGE-PER-QUESTION, not the modal shape.** Five ad-bearing pageviews per visit instead of one:
  the modal landers (`/usa/`, `/packing-jobs/`) must suppress every display slot because the modal
  covers the page, and this funnel has no overlay so every step carries its ad load. Session depth
  is the lever (root §2). **Do not "simplify" this into the modal engine** — it would cost ~80% of
  the impressions per visit.
- **The rewarded ask is deliberately quiet** (owner spec: "don't say watch this ad to see the
  rewarded content"): the CTA is just "Show my jobs" and ONE small line (`.reward-note`) names the
  sponsored video. **That line stays.** Google's rewarded policy needs the value exchange to be
  opt-in and disclosed; a full-screen video that arrives with no warning is an unexpected
  interstitial = Publisher Policy strike. Same never-trap plumbing as every other funnel
  (`initMeReward` → `playRewarded`): the guide opens on granted / no-fill / error / SDK-absent /
  timeout, and an early close nudges once then reveals the escape link. **Do NOT remove the escape
  or the timeout paths.**
- **The guide is genuinely Saudi.** Sectors actually hiring (giga-projects, retail/hospitality,
  delivery/logistics, healthcare/office/tech), Saudi job boards, the **official government
  services** (Qiwa, HRSD, Jadarat, Musaned), employers with real careers pages, and the
  recruitment-fee / "free visa" scam warnings that matter more in this market than in any other we
  run. **No invented openings counts and no salary figures anywhere** (root §4 Fight 2) — pay is
  always "the official posting states it". Government links carry `rel="nofollow noopener"` and
  **not** `sponsored`: they are not a commercial relationship and must not be dressed as one.
- **The whole footer is translated** (`meFooter`) — disclosure, the 8-line disclaimer, the links,
  plus a language switcher. Root §5 requires the disclaimer to be readable by the visitor it
  protects; an Arabic lander carrying an English disclaimer is worth nothing in a policy review.
  Ship a new language's footer with it, never later.
- **RTL + script fonts** live in `styles.css` under the `/me/` block. No webfont is downloaded
  (speed = revenue) — we ask for the system Arabic/Nastaliq/Devanagari/Bengali faces. `page()`
  gained `lang`, `dir`, `foot`, `alternates` and `bodyAttrs` for this; everything defaults to the
  old English shell so no existing page changed.
- **Ad load on the guide: leaderboard + in-content + results, each ONCE.** The SDK fills a slot by
  `#id`, so a page may carry only one div per registered id. Do not repeat a placement to "add
  density" — a duplicate id never fills. (The duplicate second `adSlot("inContent")` that used to
  sit on the guides was cleared 2026-08-20; see the density section below.)

## Ad density: what is actually registered, and how to add more (verified live 2026-08-20)
**The partner SDK's configured placement keys are exactly four:** `anchor`, `native-leaderboard`,
`native-incontent`, `native-results`. Verified by loading a page that renders no ad divs at all
(`/worldwide/sa/`) and reading the SDK's own log — it prints `placement element unavailable` once
per configured placement whose selector is missing, and it printed exactly those four. It printed
**nothing for a sidebar**, so there is no sidebar unit despite an older note claiming five ids.
Init also reports `rewarded: 0` — nothing bound for rewarded either.
- **Consequence: every long guide already uses every unit available to it.** Adding a div does
  nothing. `PLACEMENTS.inContent2` / `inContent3` exist in `build.js` and are POSITIONED in the two
  long international guides and the packing guides, but they are marked `pending: true` and
  `adSlot()` returns `""` for a pending placement unless `SITE.extraAdUnits` is true. An
  unregistered id would only reserve an empty box — dead space that earns nothing.
- **TO ACTIVATE:** ask thebesads to register two more in-content placements, set the `id` values in
  `PLACEMENTS.inContent2/3` to whatever they register (the current names are provisional), then set
  `SITE.extraAdUnits = true`. Dry-run verified: the SA guide goes 4 units -> 6, packing guides 4 -> 5,
  and with the flag off the output carries zero pending divs.
- **Do not flip the flag speculatively.** Ids that are not registered never fill.

## Ad latency: loading the rewarded + the next page's slots in advance (added 2026-08-28)
The owner asked (re: `/worldwide/`) to cut the wait before the rewarded video, pointing at
`jobguidedaily.com/job-opportunities-in-usa/`. That reference site runs its **OWN** GPT stack
(`cdp.lookfinity.net/…-ad-manager.js`): it can (a) **pre-request the rewarded slot on page load** so
`makeRewardedVisible()` at the quiz-end is instant, and (b) set `enableLazyLoad({fetchMarginPercent:200})`
so display ads fetch two screens early. At first we could NOT replicate the rewarded pre-request —
the Price Optimiser SDK owns GPT and its API had no preload hook — so the rewarded was requested cold
at the click, which WAS the wait. **thebesads then shipped a preload API (2026-08-28), which we now
use — see point 2.** (We are still forbidden from touching `googletag` directly; preload is the
partner's own method.)
- **What we ship in our own code (done):**
  1. **Prefetch the payoff guide during the quiz.** `page({prefetch})` emits
     `<link rel="prefetch" href="<resultsUrl>" as="document">`; every modal lander passes
     `prefetch: cfg.resultsUrl` (`/worldwide/`, `/worldwide/sa/`, `/usa/`, `/packing-jobs/`,
     `/usa-packing-jobs/`, `/generic/`, the 5 `/me/x/quiet/` arms). The guide's HTML — and thus its
     ad `<div>`s — is in cache before the reward completes, so the SDK starts filling the guide's
     display slots a round-trip sooner. Cheap and safe: these landers carry no display ads, so the
     prefetch never competes for the ad sockets. (Full-page nav still re-inits the SDK on the guide;
     an SPA would remove that, but the SPA arm was retired — this is the honest available win.)
  2. **Warm + PRELOAD the ads on funnel entry, not at the click.** `warmAds()` (jobs.js) runs once as
     soon as the async bundle attaches — kicked off on modal open (`initUsaModal`), on the `/find/`
     results reveal (`setupRewardGate`), and on the `/me/` `/ready/` step (`initMeReward`). It calls
     only the partner's sanctioned public preload API — no `init()` (the SDK auto-inits and the
     `ad-skills/` skill docs do not list `init()`; removed v1.30.2):
     - **`preloadRewarded()` — the real fix, shipped by thebesads 2026-08-28 (v1.29.0).** It REQUESTS
       the rewarded ad without showing it; the next `showRewarded()` **consumes the cached ad
       automatically**. Called as the funnel opens, the video is fetched while the visitor answers
       the questions, so the CTA is near-instant instead of the ~3-5s cold SDK+GPT+auction chain;
     - **`preloadSlots([...exact div IDs...])`** — warms display/anchor slots that ALREADY EXIST on the
       current page (it can only define divs present in the DOM, so it is a no-op on the modal
       landers, which carry no display slots; it warms the `/find/` results + guide slots).
       **(v1.34.0 — updated per `ad-skills/new-publisher-display-preload-skill`)** we now pass the
       **EXACT ad-container div IDs** (`ad-leaderboard`/`ad-incontent`/`ad-results`/`ad-anchor`) instead
       of the legacy type names `["native","anchor"]`, which the new skill marks backward-compat-only.
       `presentDisplaySlotIds()` in `jobs.js` filters the four registered IDs to those actually in the
       DOM before calling `preloadSlots(ids)`, so the "no-op on modal landers" behaviour is unchanged
       (they render no display divs → empty list → no call). Used by `warmAds()` and the SPA
       `spaPreloadNative()`/`spaRenderAds()`.
- **API notes (`../PUBLISHER_INTEGRATION.md` preload section + `../ad-skills/` skill docs):** the
  partner exposes the API under three globals; the official resolver checks them in order —
  `window.PublisherExperience` → `window.PriceOptimiserExperience` → the `window.PublisherExperienceSDK`
  registry (live the handle is `.publisher`). `resolveAds()` searches ALL THREE roots for the object
  with `showRewarded`; `adsWith(method,a)` finds whichever object carries a preload method (falling
  back to `window.PublisherExperience` / `window.PriceOptimiserExperience`). The public API is exactly
  `preloadRewarded / preloadSlots / showRewarded / refresh / refreshAll / status` — do NOT call
  `googletag`, `init()`, or set any `price_rule`/`exp_key`/floors/targeting (partner Hard Boundaries).
  Everything is feature-detected and guarded, so an older SDK or a preload no-fill degrades to the
  previous behaviour (rewarded requested at `showRewarded()`, never a trap). Do NOT pass
  `{usePreload:false}` to `showRewarded()` — that forces a fresh request and throws away the preloaded
  ad; we WANT the cached one. **Audited against `ad-skills/` (re-checked 2026-08-30 vs the updated
  `new-publisher-display-preload-skill`): our implementation matches the partner's checklists** (one SDK
  script, preload during the flow, **explicit div IDs** for display preload — migrated off the legacy
  `["anchor","native"]` type form v1.34.0, every ID confirmed present in the DOM before the call,
  showRewarded consumes the preload, reserved boxes kept, no aggressive looping, no competing 30s
  refresh timer, fallback never traps).
- **Still-open thebesads asks** (do not conflate with the above — these are NOT done): load `gpt.js`
  in PARALLEL with `runtime-config` (the ~1s serial config round-trip is the biggest remaining
  display-ad delay), edge-cache `runtime-config`, and register the 2 extra in-content placements
  (`SITE.extraAdUnits`, guides 4→6). Display ads on the guide still load at full navigation.

### A note on diagnosing fill — do not repeat this mistake
An automated/in-app browser may be served no ads at all on pages that fill perfectly for a normal
visitor. Empty slots in a tooling browser are **not** evidence of a site-wide fill problem; check a
real browser, or GAM's own Country + Ad unit report (impressions vs **unfilled impressions**),
before telling anyone to hold ad spend. `isEmpty: true` in the console proves the slot rendered
empty *in that session*, nothing more.
- **Every funnel-continuation link carries `data-po-no-intercept`** (memory `partner-script-nav-trap`):
  the SDK's capture-phase click interceptor can swallow a click behind an interstitial and never
  resume, trapping the visitor mid-funnel. The older jobs funnels do NOT have this attribute yet —
  worth a separate pass.
- Linked from the home lander's "Popular right now" quick-links (root home-lander rule).

### The funnel SHAPE is a parameter — two arms (added 2026-08-14, root §7)
`ME_CHAMPION` and `ME_QUIET` in `build.js` are arm objects (`{id, base, dir, ads, noindex}`); the
builders take the arm, so both shapes come from one set of builders and **one modal engine**.
Split at the ad-buy: point campaign A at the champion, campaign B at the arm.

| | champion `/me/<lang>/` | quiet arm `/me/x/quiet/<lang>/` |
|---|---|---|
| shape | page-per-question (4 URLs) | ONE page, questions in a pop-up |
| ads before the reward | leaderboard + in-content + anchor on every step | **none at all** |
| ads after the reward | full load on `/me/<lang>/jobs/` | full load on `/me/x/quiet/<lang>/jobs/` |
| indexable | yes (Q1 + guide, hreflang) | no — noindex, out of the sitemap |

- **The quiet arm is the owner's spec of 2026-08-14: "until the rewarded ad no ads are shown, super
  simple popup with nothing."** The modal is stripped via `usaModal({bare:true})` — close X,
  question, three options, nothing else (no progress bar, no step label, no sub-lines) — and the
  page sets no `adSlot()` and `hideAnchor`.
- **HYPOTHESIS to measure before promoting either:** an ad-free run-up lifts reward completion
  enough that the guide's impressions beat the champion's four in-funnel pageviews. That is a real
  trade — the champion earns on every step, the arm earns **nothing** until the video plays — so
  compare `reward_grant` rate and revenue per session between the two URL prefixes. Do not promote
  on instinct (root §4 Fight 1).
- **There is still a page behind the pop-up, and the pop-up is still dismissable — both are load-
  bearing.** A modal over a blank page is a dead end when closed, which is the definition of a
  forced interstitial / doorway (the banned pattern this whole site avoids). The page behind is the
  smallest honest thing that survives dismissal: brand, headline, one line, and a button that
  reopens the pop-up. **Do NOT strip it to nothing and do NOT make the modal non-dismissable.**
- **`initUsaModal` is now fully translatable**: `cfg.copy` overrides every string of the rewarded
  step (`title`/`sub`/`btn`/`loading`/`almost`/`finish`/`again`/`skip`/`stepFmt`) and `cfg.fn`
  overrides the GA4 funnel id. **All defaults reproduce the original English `/usa/` copy exactly**,
  so `/usa/`, `/usa-packing-jobs/` and `/packing-jobs/` are byte-for-byte unchanged — verified in
  browser. Any new string added to that step must be added to the `T` defaults too, or the
  non-English arms will silently render English.
- The arm's language switcher stays **inside the arm**, so switching language cannot silently cross
  a visitor into the other arm and pollute both readings.

## `/generic/` — dead-simple pop-up → the USA content page (added 2026-08-13, reshaped 2026-08-14)
The neutral paid entry point: a brand-safe landing URL for broad creatives that don't name a niche
("jobs hiring now"), so that campaign gets its **own URL** (CPC attributes per campaign, root §7).
`GENERIC_MODAL` + `buildGenericLanding` in `build.js`.

```
/generic/            bare pop-up on load — 3 questions, nothing else
   -> opt-in rewarded video
   -> /usa/remote-jobs/   the EXISTING USA content guide (full display ad load)
```
- **Owner spec 2026-08-14: "the popup with content leading to usa page, keep it dead simple."** Same
  stripped `usaModal({bare:true})` as the `/me/x/quiet/` arm (close X + question + three options),
  same three questions, English.
- **It owns no content.** The payoff is the existing `/usa/remote-jobs/` guide — one US guide to
  maintain, and the visitor lands on a real article rather than a thin new duplicate. (The earlier
  version was a lander with its own hero/benefits copy that linked to `/usa/`; that content is gone.)
- **NO display slots and no anchor** — the modal opens on load and covers the page (root §5, the
  2026-08-08 rule). Monetization is the rewarded video plus the guide's own ad load.
- The page behind the pop-up is minimal but **not empty**, and the pop-up is always dismissable. A
  modal over a blank page is a dead end when closed = forced interstitial / doorway. Do not strip it
  to nothing, do not make the modal non-dismissable, and **do not auto-forward** (a redirect-only
  page is a doorway: Google Ads landing-page violation + Publisher Policy risk).
- `noindex`, out of the sitemap.

## Compliance rules baked into this site (root §4 Fights 2 & 3 — do not regress)
- **No invented statistics presented as fact.** Pay is framed as ranges "commonly advertised,"
  openings as "thousands / hiring in most areas," always "confirm on the official posting."
  Never hardcode a fake specific stat ("92% get hired").
- **Advertising + affiliate + non-affiliation disclosure** renders in the footer of every page
  (`disclosure()`), plus a fuller `/about/` page. Required for FTC + Google/FB ad review, and
  it is what keeps the *ad account* alive.
- **No deceptive redirects / disguised ads.** The apply button is clearly labeled "You'll be
  redirected to an external site," ad blocks carry an "Ad" tag, and the redirect countdown only
  emphasizes a button the user taps — no auto pop-unders.
- **Images: NEVER rip employer logos or photos.** Each property renders an original generated
  SVG banner (brand-tinted panel + themed line icon + initials) — zero copyright risk, instant
  load. If a real image is ever added, it must be licensed/PD with attribution (root rule).

## CTA colour — orange, and why (added 2026-08-14)
The primary `.btn` is a warm orange (`--cta` / `--cta-2` / `--cta-ink` / `--cta-dark` in
`styles.css`), everywhere, on every surface. Blue stays the TRUST colour: brand, links, secondary
buttons, progress.
- **The reason is isolation, not hue.** There is no universally highest-converting button colour —
  the famous "red beats green" tests are contrast tests, not hue tests. This page was blue on blue
  on blue (background wash, hero gradient, logo, links, progress bar), so a blue button had almost
  no isolation from its surroundings. Orange is the one thing on the page that is neither blue nor
  white. It is also the hi-vis / site-signage colour this audience reads as "go", without red's
  error-and-danger connotation.
- **The label is near-black on a vivid fill, not white on a dark fill** (the Amazon buy-button
  pattern). White text would force the fill down to a muddy brick to reach 4.5:1; dark ink on
  vivid orange reaches 6.5–7.8:1 and keeps the colour energetic. The button label drops to 16px on
  small phones, so it is NOT "large text" and genuinely needs 4.5:1. **Do not switch the label back
  to white without darkening the fill** — white on `#F97316` is 2.8:1 and fails outright.
- The dark lip (`--cta-dark`, 7.5:1 against the page) carries the button's boundary contrast, so
  the fill doesn't have to.
- **The hero CTA is orange too.** It used to be white-on-blue, but white is the hero's own colour
  (headline, lead, brand, micro line are all white) so the button blended into its own card. Do not
  reintroduce a per-surface CTA colour.
- **This is a hypothesis, not a proven lift.** It is defensible on isolation grounds, but colour
  claims are exactly the kind of thing that should be measured, not asserted — the arm/URL split
  (root §7) is there if you want to prove it.

### Answer rows are FILLED BLUE, the CTA is orange — keep the two apart
`.pick` (page-per-question steps) and `.usa-opt` (the pop-up) are filled blue buttons with white
labels and a 3D lip (`--pick` / `--pick-2` / `--pick-dark`), not white cards with a grey hairline.
- **Why filled:** these rows ARE the click target on every question step. As white-on-near-white
  cards they read as a list to scan rather than buttons to tap — and in the bare pop-up, where the
  three rows are the only thing on screen, it left a screen with no colour on it at all.
- **Why blue and not orange:** orange stays reserved for the single money button (the rewarded
  CTA), so the accent lands as a *new* colour at the moment that matters instead of being worn out
  by every question before it. Question steps = blue, the one payoff button = orange. **Do not
  make the answer rows orange**, and do not add a second orange element to a screen that has a CTA.
- The row gradient deliberately starts darker than the hero's (`#1a6fdb`, not `#2f8bff`): white
  text on `#2f8bff` is 3.36:1 and fails AA. Both row stops clear 4.5:1.

## Mobile-first (root rule)
Paid traffic lands overwhelmingly on phones. Fluid type via `clamp()`, grid/flex, big tap
targets (role/search rows ≥ 56px), no horizontal scroll. Test every new component at ~360px.

## Definition of done for v1
- One engine generating both employer + category funnels from `data/*.json`. ✓
- 3-step funnel per property (landing → openings → apply/redirect), pageview per step. ✓
- Ad slots (display + native) positioned and filled by the Price Optimiser SDK. ✓
- In-content + native ad units + sticky anchor; outbound to real job boards. (No FORCED overlays;
  opt-in rewarded gate default on `/find/`, no-gate control at `/x/no-gate/`.) ✓
- Disclosure + about page for ad-network/FTC compliance. ✓
- Fast, trustworthy, mobile-first UI. ✓

## Open items before launch
- Domain is set (`SITE.domain` = jobsthe.world) — canonical + sitemap live.
- Monetization is wired: GAM via the Price Optimiser SDK (per-site `jobguidematch.js` bundle).
  Remaining: confirm the domain is approved/filling in Price Optimiser on the live host.
- Confirm traffic source (Google vs Facebook) — changes landing-page compliance rules.
- Optional: swap Indeed category outbound links for a CPC/affiliate job-board partner.
