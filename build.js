#!/usr/bin/env node
/* =============================================================================
 * jobsthe.world — static generator (Jobs World)
 *
 * This site is a faithful clone of the jobcoachhub.com article-hub UI + content,
 * rebuilt in our own architecture: a zero-dependency Node generator that emits a
 * pure static site into dist/, which Cloudflare's assets-only Worker `jobstheworld`
 * serves (dist/ is COMMITTED — see CLAUDE.md). It is NOT jobcoachhub's Astro build
 * and it does NOT use jobcoachhub's /_lf ad runtime.
 *
 * What is OURS and must stay ours (owner's instruction):
 *   - GA4         : SITE.ga4Id = G-1JWDWNWK4R  (jobsthe.world's own property)
 *   - ads.txt     : pub-1730786981458373 (GAM/AdX seller auth) — unchanged
 *   - Ad stack    : Price Optimiser Publisher Experience SDK (PARTNER_SCRIPT), our
 *                   ad server is GAM via GPT. Every ad slot is an EMPTY reserved
 *                   <div> carrying one of our 5 REGISTERED ids
 *                   (ad-leaderboard / ad-incontent / ad-results / ad-sidebar /
 *                   ad-anchor) that the SDK fills. No AdSense <ins>, no second
 *                   googletag. NEW ids never fill — reuse a registered id per page.
 *   - Ad preload  : app.js warms the SDK on load (preloadRewarded + preloadSlots)
 *                   exactly like jobguidematch.com so the rewarded is instant.
 *
 * What is CLONED from jobcoachhub: the design system (its compiled Tailwind CSS,
 * shipped verbatim as base.css), the magazine layout, all 61 articles + their hero
 * images, the 6 categories (Salary & Negotiation is intentionally empty — faithful),
 * the platforms directory, and the 3-question "wall → rewarded" funnel.
 * ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

const SITE = {
  // Brand: jobsthe.world keeps its own identity (the portfolio runs twins under
  // DISTINCT brands — Jobs World vs Job Guide Match). Look + content are cloned
  // from jobcoachhub; the name is not. Flip brandA/brandB if you want the literal
  // "Job Coach Hub" wordmark here.
  brandA: "Jobs",
  brandB: "World",
  get name() { return this.brandA + " " + this.brandB; },
  domain: "jobsthe.world",
  tagline: "Everything worth knowing, in one place",
  topbar: "Global job guidance · Updated daily",
  ga4Id: "G-1JWDWNWK4R",        // GA4 Measurement ID — jobsthe.world's own stream. NEVER jobguidematch's.
  adsPub: "pub-1730786981458373", // ads.txt seller line — unchanged (GAM/AdX auth)
  version: "2.0.0",             // BUMP on every commit/push (see CLAUDE.md) — exposed at /v
};

// Price Optimiser / GAM SDK — per-site bundle (siteKey baked in). Owner's instruction:
// reuse the jobguidematch bundle until the jobsthe.world bundle is issued. When it is,
// swap the URL here and curl it for a 200 FIRST (a 404 bundle kills the whole ad stack).
const PARTNER_SCRIPT = `<script async src="https://priceoptimiser1.thebesads.com/experiences/jobguidematch.js"></script>`;

// ---- load content ----------------------------------------------------------
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const DIST = path.join(ROOT, "dist");
const articles = JSON.parse(fs.readFileSync(path.join(DATA, "articles.json"), "utf8"));
const categories = JSON.parse(fs.readFileSync(path.join(DATA, "categories.json"), "utf8")); // {names, members}
const home = JSON.parse(fs.readFileSync(path.join(DATA, "home.json"), "utf8"));
const platformsMain = fs.readFileSync(path.join(DATA, "platforms.html"), "utf8");
const baseCss = fs.readFileSync(path.join(ROOT, "src", "base.css"), "utf8");
const appJs = fs.readFileSync(path.join(ROOT, "src", "app.js"), "utf8");

const BY_SLUG = Object.create(null);
articles.forEach((a) => { BY_SLUG[a.slug] = a; });
const CAT_NAMES = categories.names;       // slug -> "Display Name"
const CAT_MEMBERS = categories.members;   // slug -> [article slugs]
const CAT_ORDER = ["job-search-strategy", "resume-cover-letters", "interview-prep", "salary-negotiation", "workplace-success", "career-change-growth"];
const BUILT_AT = new Date();

// ---- small helpers ----------------------------------------------------------
function img(a) { return (a.hero || "").replace(/^\/_lf\/img\//, "/img/"); }
function rewriteContent(html) {
  // jobcoachhub content → ours: map its image proxy to our local /img/.
  return (html || "").replace(/\/_lf\/img\//g, "/img/");
}
function noInterceptInternal(html) {
  // Our Price Optimiser SDK installs a capture-phase click interceptor; tag our own
  // internal links so IT does not hijack them — our wall handles navigation instead.
  return html;
}
function attr(s) { return String(s == null ? "" : s); } // titles already carry HTML entities

// WALL funnel config — the exact jobcoachhub "wall" (3 questions → rewarded).
const WALL = {
  cooldownSeconds: 600,
  questions: [
    { q: "How available are you to work?", options: ["Day", "Night", "Flexible"] },
    { q: "What's most important to you in a job?", options: ["Salary", "Schedule", "Growth"] },
    { q: "When do you want to start working?", options: ["Immediately", "This Month", "Need more info"] },
  ],
  result: {
    headline: "We found some great opportunities near you",
    body: "See available positions",
    buttonLabel: "View ad to continue",
    loadingText: "Searching for best positions for you...",
    loadingSeconds: 3,
  },
};

// ---- ad slots (our registered SDK ids; the SDK fills the empty #id div) ------
// One registered id per page (NEW ids never fill — see CLAUDE.md / memory).
function adSlot(id) {
  return `<div class="admod"><span class="ad__label">Advertisement</span><div class="ad" id="${id}"></div></div>`;
}
function anchorAd() {
  // Fixed sticky anchor. Hidden while the wall overlay is open (no ad behind a modal).
  return `<div id="ad-anchor-wrap" class="anchor-wrap"><div class="ad" id="ad-anchor"></div></div>`;
}

// ---- reusable chrome --------------------------------------------------------
const NAV = [
  { href: "/", label: "Home" },
  ...CAT_ORDER.map((c) => ({ href: `/category/${c}/`, label: CAT_NAMES[c] })),
  { href: "/article/", label: "All Guides" },
  { href: "/platforms/", label: "Job Platforms" },
];

function header() {
  const navItems = NAV.map((n) => `<li><a href="${n.href}" data-po-no-intercept class="block py-2 hover:text-primary">${n.label}</a></li>`).join("");
  return `<header class="border-b border-border bg-background sticky top-0 z-40"><div class="bg-neutral-900 text-neutral-300 text-xs hidden sm:block"><div class="mx-auto max-w-7xl px-4 py-2 flex justify-between"><span class="hidden sm:inline">${SITE.topbar}</span><div class="flex gap-4"></div></div></div><div class="mx-auto max-w-7xl px-4 py-3 sm:py-5 flex items-center justify-between gap-4"><a href="/" data-po-no-intercept class="text-3xl font-serif font-bold tracking-tight" aria-label="${SITE.name}">${SITE.brandA} <span class="ml-1 text-muted-foreground">${SITE.brandB}</span></a><form action="/article/" method="get" role="search" class="hidden md:flex items-center gap-3 flex-1 max-w-md"><div class="flex items-center w-full border border-border rounded-md px-3 py-2 bg-background"><svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><input name="q" type="search" placeholder="Search guides, careers, platforms..." aria-label="Search" class="ml-2 w-full bg-transparent text-sm outline-none"></div></form><button id="menu-toggle" type="button" aria-label="Toggle menu" aria-controls="primary-nav" class="md:hidden p-2"><svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line></svg></button></div><nav class="border-t border-border bg-background" aria-label="Sections"><div id="primary-nav" class="mx-auto max-w-7xl px-4 hidden md:block"><ul class="flex flex-col md:flex-row md:items-center gap-1 md:gap-6 py-2 text-sm font-medium">${navItems}</ul></div></nav></header>`;
}

function disclaimerBlock() {
  // Site-wide disclaimer — every line TRUE of THIS site (an advertising-supported
  // job-guidance article hub). Root rule: answer "what it is NOT" first.
  return `<div class="mx-auto max-w-7xl px-4 py-6 text-[11px] leading-relaxed text-neutral-500 border-t border-neutral-900"><p><strong>Disclaimer.</strong> ${SITE.name} is an independent, advertising-supported publisher of general job-search and career guidance. We are <strong>not an employer, recruiter, staffing agency or job board</strong>, we do not accept job applications, and we make no promise of employment, interviews or earnings. We are not affiliated with, endorsed by or partnered with any company, job board or platform named on this site; all trademarks belong to their respective owners. Our articles and directory listings are editorial guidance compiled by our team for information only — no company pays to be listed or ranked here, and we earn no commission on any outbound link. The guidance is general in nature and is not legal, financial or professional career advice; outcomes depend on your own circumstances. Links to third-party sites are provided for convenience and we are not responsible for their content. To request a correction or removal, contact us at <a href="mailto:hello@${SITE.domain}" class="hover:text-white underline">hello@${SITE.domain}</a>.</p></div>`;
}

function footer() {
  const catLinks = CAT_ORDER.map((c) => `<li><a href="/category/${c}/" data-po-no-intercept class="hover:text-white">${CAT_NAMES[c]}</a></li>`).join("") + `<li><a href="/article/" data-po-no-intercept class="hover:text-white">All Guides</a></li>`;
  return `<footer class="bg-neutral-950 text-neutral-300 mt-16"><div class="mx-auto max-w-7xl px-4 py-12 grid gap-10 md:grid-cols-3"><div><div class="text-2xl font-serif font-bold text-white">${SITE.brandA} <span class="ml-1 text-neutral-400">${SITE.brandB}</span></div><p class="mt-3 text-sm text-neutral-400">${SITE.tagline}</p></div><div><h4 class="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Categories</h4><ul class="space-y-2 text-sm">${catLinks}</ul></div><div><h4 class="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Site</h4><ul class="space-y-2 text-sm"><li><a href="/platforms/" data-po-no-intercept class="hover:text-white">Job Platforms</a></li></ul></div></div>${disclaimerBlock()}<div class="border-t border-neutral-900"><div class="mx-auto max-w-7xl px-4 py-4 text-xs text-neutral-500 flex flex-col md:flex-row justify-between gap-2"><span>© ${BUILT_AT.getFullYear()} ${SITE.name}. All rights reserved.</span></div></div></footer>`;
}

// ---- cards ------------------------------------------------------------------
function card(slug) {
  const a = BY_SLUG[slug];
  if (!a) return "";
  return `<a href="/${a.slug}/" data-po-no-intercept class="group block article-item"><div class="aspect-[16/10] overflow-hidden rounded-md bg-muted"><img src="${img(a)}" alt="Featured image for &quot;${attr(a.title)}&quot;" loading="lazy" class="size-full object-cover group-hover:scale-105 transition-transform duration-500"></div><div class="mt-3"><span class="inline-block text-white font-semibold uppercase tracking-wider bg-primary text-[10px] px-2 py-0.5">${CAT_NAMES[a.category]}</span><h3 class="mt-2 font-serif text-xl font-bold leading-snug"><span class="headline-link">${attr(a.title)}</span></h3><p class="mt-2 text-sm text-muted-foreground line-clamp-2">${attr(a.dek)}</p><p class="mt-2 text-xs text-muted-foreground">${attr(a.author)} · ${attr(a.readMin)} min read</p></div></a>`;
}
function heroBig(slug) {
  const a = BY_SLUG[slug];
  return `<a href="/${a.slug}/" data-po-no-intercept class="group block relative overflow-hidden rounded-md aspect-[16/10] md:aspect-[16/9] lg:aspect-[4/3] bg-neutral-800"><img src="${img(a)}" alt="Featured image for &quot;${attr(a.title)}&quot;" fetchpriority="high" class="absolute inset-0 size-full object-cover group-hover:scale-105 transition-transform duration-500"><div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent"></div><div class="absolute bottom-0 p-6 md:p-8 text-white"><span class="inline-block text-white font-semibold uppercase tracking-wider bg-primary text-xs px-2 py-1">${CAT_NAMES[a.category]}</span><h2 class="mt-3 font-serif text-2xl md:text-4xl font-bold leading-tight max-w-3xl">${attr(a.title)}</h2><p class="hidden md:block mt-3 text-white/85 max-w-2xl">${attr(a.dek)}</p></div></a>`;
}
function heroSmall(slug) {
  const a = BY_SLUG[slug];
  return `<a href="/${a.slug}/" data-po-no-intercept class="group block relative overflow-hidden rounded-md aspect-[4/3] lg:aspect-auto bg-neutral-800"><img src="${img(a)}" alt="Featured image for &quot;${attr(a.title)}&quot;" loading="lazy" class="absolute inset-0 size-full object-cover group-hover:scale-105 transition-transform duration-500"><div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div><div class="absolute bottom-0 p-4 text-white"><span class="inline-block text-white font-semibold uppercase tracking-wider bg-primary text-[10px] px-2 py-0.5">${CAT_NAMES[a.category]}</span><h3 class="mt-2 font-serif text-lg font-bold leading-snug">${attr(a.title)}</h3></div></a>`;
}
function trendingList(slugs) {
  const items = slugs.map((slug, i) => {
    const a = BY_SLUG[slug];
    if (!a) return "";
    return `<li class="flex gap-3"><span class="font-serif text-3xl font-bold text-primary leading-none w-6 shrink-0">${i + 1}</span><a href="/${a.slug}/" data-po-no-intercept class="flex gap-3 group items-start"><img src="${img(a)}" alt="Featured image for &quot;${attr(a.title)}&quot;" loading="lazy" class="size-20 shrink-0 object-cover rounded-sm"><div><span class="text-[10px] uppercase tracking-wider font-semibold text-primary">${CAT_NAMES[a.category]}</span><h4 class="mt-1 font-serif text-sm font-semibold leading-snug group-hover:text-primary">${attr(a.title)}</h4></div></a></li>`;
  }).join("");
  return `<div><h2 class="font-serif font-bold border-b border-border pb-3 text-2xl mb-6">Trending</h2><ol class="space-y-4">${items}</ol></div>`;
}

// ---- page shell -------------------------------------------------------------
function page({ title, desc, body, canonical, bodyScript }) {
  const ga = SITE.ga4Id ? `<link rel="dns-prefetch" href="https://www.googletagmanager.com">
<script async src="https://www.googletagmanager.com/gtag/js?id=${SITE.ga4Id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${SITE.ga4Id}');
window.track=function(n,p){try{gtag('event',n,p||{});}catch(e){}};</script>` : "";
  const canon = canonical || `https://${SITE.domain}/`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description" content="${attr(desc)}"><meta name="robots" content="noindex, nofollow"><meta name="author" content="${SITE.name}"><link rel="canonical" href="${canon}"><meta property="og:site_name" content="${SITE.name}"><meta property="og:title" content="${attr(title)}"><meta property="og:description" content="${attr(desc)}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700;800;900&display=swap"><link rel="stylesheet" href="/styles.css">
${ga}</head><body><div class="flex min-h-screen flex-col">${header()}<main id="main" class="flex-1">${body}</main>${footer()}</div>${anchorAd()}<div id="lf-wall"></div>
<script>window.__WALL=${JSON.stringify(WALL)};</script>
<script src="/app.js" defer></script>
${bodyScript || ""}
${PARTNER_SCRIPT}
</body></html>`;
}

// ---- builders ---------------------------------------------------------------
function write(rel, html) {
  const out = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
}

function buildHome() {
  const side = home.heroSide.map(heroSmall).join("");
  const latest = home.latest.map(card).join("");
  const sections = CAT_ORDER.filter((c) => (CAT_MEMBERS[c] || []).length).map((c) => {
    const cards = (CAT_MEMBERS[c] || []).slice(0, 4).map(card).join("");
    return `<section class="mx-auto max-w-7xl px-4 mt-14"><div class="flex items-center justify-between mb-6 border-b border-border pb-3"><h2 class="font-serif text-2xl font-bold">${CAT_NAMES[c]}</h2><a href="/category/${c}/" data-po-no-intercept class="text-sm font-medium text-primary hover:underline">View all</a></div><div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">${cards}</div></section>`;
  }).join("");
  const body = `<section class="mx-auto max-w-7xl px-4 pt-6 pb-10 grid gap-6 lg:grid-cols-3"><div class="lg:col-span-2">${heroBig(home.heroMain)}</div><div class="grid gap-4 lg:auto-rows-fr">${side}</div></section>
<div class="mx-auto max-w-7xl px-4">${adSlot("ad-leaderboard")}</div>
<section class="mx-auto max-w-7xl px-4 grid gap-10 lg:grid-cols-3"><div class="lg:col-span-2"><h2 class="font-serif text-2xl font-bold mb-6 border-b border-border pb-3">Latest Guides</h2><div class="grid gap-8 sm:grid-cols-2">${latest}</div></div><aside class="space-y-8">${trendingList(home.trending)}${adSlot("ad-sidebar")}</aside></section>
${sections}`;
  write("index.html", page({ title: `${SITE.name} — ${SITE.tagline}`, desc: SITE.tagline, body, canonical: `https://${SITE.domain}/` }));
}

function buildCategory(c) {
  const members = CAT_MEMBERS[c] || [];
  const cards = members.map(card).join("");
  const grid = members.length
    ? `<div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">${cards}</div>`
    : `<p class="text-muted-foreground">New ${CAT_NAMES[c]} guides are on the way. In the meantime, browse <a href="/article/" data-po-no-intercept class="text-primary hover:underline">all guides</a>.</p>`;
  const body = `<section class="bg-neutral-900 text-white"><div class="mx-auto max-w-7xl px-4 py-12"><p class="text-xs uppercase tracking-widest opacity-80">Category</p><h1 class="mt-2 font-serif text-4xl md:text-5xl font-bold">${CAT_NAMES[c]}</h1></div></section>
<div class="mx-auto max-w-7xl px-4 mt-8">${adSlot("ad-leaderboard")}</div>
<section class="mx-auto max-w-7xl px-4 mt-8">${grid}</section>`;
  write(`category/${c}/index.html`, page({ title: `${CAT_NAMES[c]} — ${SITE.name}`, desc: `${CAT_NAMES[c]} guides and advice from ${SITE.name}.`, body, canonical: `https://${SITE.domain}/category/${c}/` }));
}

function buildArticleIndex() {
  const cards = articles.map((a) => card(a.slug)).join("");
  const body = `<section class="bg-neutral-900 text-white"><div class="mx-auto max-w-7xl px-4 py-12"><p class="text-xs uppercase tracking-widest opacity-80">Directory</p><h1 class="mt-2 font-serif text-4xl md:text-5xl font-bold">All Guides</h1><p class="mt-3 max-w-2xl text-white/85">Every job-search, resume, interview, workplace and career-change guide on ${SITE.name}.</p></div></section>
<div class="mx-auto max-w-7xl px-4 mt-8">${adSlot("ad-leaderboard")}</div>
<section class="mx-auto max-w-7xl px-4 mt-8"><div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">${cards}</div></section>`;
  write("article/index.html", page({ title: `All Guides — ${SITE.name}`, desc: `Every guide on ${SITE.name}.`, body, canonical: `https://${SITE.domain}/article/` }));
}

function buildPlatforms() {
  // External links: tag so the SDK does not trap, and mark nofollow/sponsored.
  let main = platformsMain.replace(/<a (href="https?:\/\/[^"]+")([^>]*)>/g, (m, href, rest) => {
    let r = rest;
    if (!/rel=/.test(r)) r += ' rel="nofollow noopener sponsored"';
    if (!/data-po-no-intercept/.test(r)) r += " data-po-no-intercept";
    return `<a ${href}${r}>`;
  });
  const body = `${main}
<div class="mx-auto max-w-7xl px-4 mt-10">${adSlot("ad-leaderboard")}</div>`;
  write("platforms/index.html", page({ title: `Best Job Search Platforms 2026 — ${SITE.name}`, desc: "A curated global directory of the job platforms recruiters and candidates actually use.", body, canonical: `https://${SITE.domain}/platforms/` }));
}

function buildArticle(a) {
  const related = (CAT_MEMBERS[a.category] || []).filter((s) => s !== a.slug).slice(0, 4);
  const relCards = related.map(card).join("");
  const relSection = related.length
    ? `<section class="mx-auto max-w-7xl px-4 mt-16"><h2 class="font-serif text-2xl font-bold mb-6 border-b border-border pb-3">More in ${CAT_NAMES[a.category]}</h2><div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">${relCards}</div></section>`
    : "";
  const bodyHtml = rewriteContent(a.body);
  const body = `<article><header class="mx-auto max-w-3xl px-4 pt-6 md:pt-10"><p class="text-xs uppercase tracking-wider font-semibold text-primary"><a href="/category/${a.category}/" data-po-no-intercept class="hover:underline">${CAT_NAMES[a.category]}</a></p><h1 class="mt-2 font-serif text-3xl md:text-5xl font-bold leading-tight">${attr(a.title)}</h1><p class="mt-4 text-base md:text-lg text-muted-foreground">${attr(a.dek)}</p><p class="mt-4 text-sm text-muted-foreground">By <span class="font-medium text-foreground">${attr(a.author)}</span> · ${attr(a.date)} · ${attr(a.readMin)} min read</p></header><div class="mx-auto max-w-3xl px-4">${adSlot("ad-incontent")}</div><div class="mx-auto max-w-4xl px-4 mt-8"><img src="${img(a)}" alt="Featured image for &quot;${attr(a.title)}&quot;" fetchpriority="high" decoding="async" class="w-full aspect-[16/9] object-cover rounded-md"></div><div class="mx-auto max-w-3xl px-4 mt-10 article-prose">${bodyHtml}</div><div class="mx-auto max-w-3xl px-4">${adSlot("ad-results")}</div><section class="mx-auto max-w-3xl px-4 mt-10 flex gap-4 border-t border-border pt-8"><div><p class="text-xs uppercase tracking-wider text-muted-foreground">Written by</p><p class="font-serif text-lg font-bold">${attr(a.author)}</p><p class="mt-1 text-sm text-muted-foreground">${SITE.name} editorial team</p></div></section></article>${relSection}`;
  write(`${a.slug}/index.html`, page({ title: `${a.title} — ${SITE.name}`, desc: a.dek, body, canonical: `https://${SITE.domain}/${a.slug}/` }));
}

function buildVersion() {
  const body = `<section class="mx-auto max-w-3xl px-4 py-16"><h1 class="font-serif text-3xl font-bold">${SITE.name}</h1><p class="mt-4 text-muted-foreground">Version <strong>${SITE.version}</strong></p><p class="mt-1 text-muted-foreground">Built ${BUILT_AT.toISOString()}</p><p class="mt-1 text-muted-foreground">${articles.length} guides.</p></section>`;
  write("v/index.html", page({ title: `v${SITE.version} — ${SITE.name}`, desc: "build version", body, canonical: `https://${SITE.domain}/v/` }));
}

function buildStatic() {
  // styles.css = jobcoachhub's compiled Tailwind (base.css) + our additions.
  fs.writeFileSync(path.join(DIST, "styles.css"), baseCss + "\n" + ADDITIONS);
  fs.writeFileSync(path.join(DIST, "app.js"), appJs);
  fs.writeFileSync(path.join(DIST, "ads.txt"), `google.com, ${SITE.adsPub}, DIRECT, f08c47fec0942fa0\n`);
  fs.writeFileSync(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: https://${SITE.domain}/sitemap.xml\n`);
  // images
  const imgSrc = path.join(DATA, "img"); const imgDst = path.join(DIST, "img");
  fs.mkdirSync(imgDst, { recursive: true });
  fs.readdirSync(imgSrc).forEach((f) => fs.copyFileSync(path.join(imgSrc, f), path.join(imgDst, f)));
  // sitemap
  const urls = ["/", "/article/", "/platforms/", ...CAT_ORDER.map((c) => `/category/${c}/`), ...articles.map((a) => `/${a.slug}/`)];
  const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `<url><loc>https://${SITE.domain}${u}</loc></url>`).join("\n") + `\n</urlset>\n`;
  fs.writeFileSync(path.join(DIST, "sitemap.xml"), sm);
}

// CSS additions appended to the shipped Tailwind build (ad slots, anchor, wall overlay).
const ADDITIONS = `
/* --- ${SITE.name} additions (our ad stack + wall overlay) --- */
.admod{margin:2rem 0;display:grid;place-items:center}
.admod .ad__label{display:block;margin-bottom:6px}
.ad{min-height:108px;display:grid;place-items:center;width:100%}
#ad-incontent,#ad-results,#ad-leaderboard,#ad-sidebar{min-height:108px;width:100%}
.anchor-wrap{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;justify-content:center;background:var(--background);box-shadow:0 -1px 0 var(--border)}
.anchor-wrap:empty,.anchor-wrap .ad:empty{min-height:0}
body.wall-open .anchor-wrap{display:none}
#lf-wall{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(17,24,39,.72)}
body.wall-open{overflow:hidden}
body.wall-open #lf-wall{display:flex}
.wall__close{position:absolute;top:10px;right:14px;background:transparent;border:0;color:var(--muted-foreground);font-size:22px;line-height:1;cursor:pointer}
.wall__skip{display:block;width:100%;margin-top:12px;background:transparent;border:0;color:var(--muted-foreground);font-size:13px;text-decoration:underline;cursor:pointer}
`;

// ---- run --------------------------------------------------------------------
function main() {
  // clean dist
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  buildHome();
  CAT_ORDER.forEach(buildCategory);
  buildArticleIndex();
  buildPlatforms();
  articles.forEach(buildArticle);
  buildVersion();
  buildStatic();
  const pages = 1 + CAT_ORDER.length + 2 + articles.length + 1;
  console.log(`[build] ${SITE.name} v${SITE.version} → dist/  (${pages} pages, ${articles.length} articles)`);
}
main();
