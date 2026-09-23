#!/usr/bin/env node
/* jobs — static job-discovery site generator (content arbitrage). Zero deps (Node core).
 *
 * The money mechanic (see ../CLAUDE.md §2 & §4 and jobs/CLAUDE.md):
 * every click advances a FUNNEL where each step is its own URL = its own pageview =
 * a fresh set of ad impressions. No pop-ups (banned format = AdSense ban + Google Ads
 * suspension) and no interstitial / forced-ad overlays. Instead: advertorial -> openings
 * (related-searches money page) -> apply (outbound to a real job board), monetized with
 * in-content ad units only (see PLACEMENTS + README for the full ad-unit map).
 *
 * Two page types, both generated from data/*.json by a `type` field:
 *   type:"employer"  -> "Company is hiring" advertorial      -> /jobs/<id>/...
 *   type:"category"  -> "Warehouse jobs near you" search page -> /<id>/...      (id ends in -jobs)
 *
 * Per property the generator writes a 3-step funnel:
 *   <base>/                    advertorial landing (hero stats, story, roles, ads)
 *   <base>/openings/           open-roles results page (roles + display/native ads)
 *   <base>/apply/              redirect page: ad + outbound button to the job board
 *
 * New property = new data/<id>.json, then `node build.js`. No page hand-editing.
 * Run:  node build.js       (from the jobs/ folder)
 */

const fs = require("fs");
const path = require("path");

/* ----------------------------------------------------------------------------
 * SITE CONFIG.
 * Monetization is 100% Google Ad Manager (GAM) via the Price Optimiser Publisher Experience
 * SDK (PARTNER_SCRIPT, loaded on every page — see ../PUBLISHER_INTEGRATION.md). Our ad server
 * is GAM, NOT AdSense. Every ad slot renders as an EMPTY reserved <div> carrying the unit's
 * #id; the SDK attaches a GAM slot to it via GPT and fills it. There is NO AdSense client,
 * no <ins>/adsbygoogle, and no second GPT setup here (the integration doc forbids that as a
 * duplicate ad stack). The SDK is the PER-SITE bundle jobguidematch.js (siteKey baked in;
 * no data-po-site attribute — see PARTNER_SCRIPT). NOTE 2026-09-06: partner renamed the bundle
 * from jobguidematch.com.js -> jobguidematch.js (their integration doc's name); the old .com.js
 * URL now hard-404s, which silently killed the whole ad stack until this was corrected.
 * -------------------------------------------------------------------------- */
const SITE = {
  name: "Jobs World",            // brand — matches the live domain jobguidematch.com
  tagline: "Jobs Hiring Near You",
  editor: "The Jobs World Editorial Team",  // byline — a real author keeps the page off "thin doorway"
  base: "/",                          // set to "/subdir/" if hosted in a subfolder
  domain: "jobsthe.world",        // used for canonical + sitemap + robots
  ga4Id: "G-1JWDWNWK4R",              // GA4 Measurement ID (stream: website / 15340580719). Powers campaign
                                      // attribution: GA4 auto-reads the landing URL's standard UTMs into
                                      // Session source/medium/campaign/id — the "which campaign is profitable"
                                      // lever. Empty string disables analytics. See ANALYTICS_SCRIPT below.
  adsId: "",            // Google Ads tag ID. Loaded on every page (same gtag.js as GA4) so we
                                      // can count the rewarded-ad request as a Google Ads conversion. On every
                                      // rewarded trigger — /find/ gate, the USA/packing/worldwide/generic modal
                                      // funnels, and the Saudi /me/<lang>/ steps — window.track fires a
                                      // "reward_requested" event to this destination (see ANALYTICS_SCRIPT).
                                      // Empty string disables the Ads tag.
  adsConversionLabel: "",  // Google Ads conversion action label ("manual_rewarded_prompt",
                                      // recreated in the MCC 2026-08-28). When set, every rewarded trigger ALSO
                                      // fires gtag('event','conversion',{send_to:'AW-18385537543/<label>'}).
                                      // Blank it to stop the labeled conversion (the reward_requested event
                                      // still fires so the action can also be built from the detected event).
  adsConversionValue: null,           // count-only action (the Event snippet carries no value/currency), so the
  adsConversionCurrency: "",          // conversion call omits value+currency. Set both to emit a value again.
  // Flip to true ONLY once thebesads has registered the two extra in-content placements and the
  // ids in PLACEMENTS.inContent2/3 match theirs. Until then those slots emit nothing (see adSlot).
  extraAdUnits: false,
  version: "1.55.0"                 // BUMP THIS on every commit/push (see CLAUDE.md) — exposed at /v
};

const DATA_DIR = path.join(__dirname, "data");
const SRC_DIR = path.join(__dirname, "src");
const OUT_DIR = path.join(__dirname, "dist");
const B = SITE.base.replace(/\/+$/, "") + "/";   // normalized base with trailing slash

// Build-time "last updated" stamp for the editorial byline (real, refreshed each build).
const BUILD_MONTH = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
// Full build timestamp — stamped fresh every `node build.js`, surfaced at /v alongside
// SITE.version so a deploy can be confirmed live (visit /v, check the version + time match).
const BUILT_AT = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

/* ----------------------------------------------------------------------------
 * INTAKE FUNNEL — the question-first flow (/find/1..4/ + matching + results,
 * and the /chat/ variant). Each Q1 option's `match` lists real property ids so
 * the results genuinely lead to the right company / category pages.
 * -------------------------------------------------------------------------- */
const INTAKE = {
  questions: [
    {
      key: "type", q: "What kind of work are you looking for?",
      sub: "Pick the closest match — we'll find openings hiring near you.",
      options: [
        { id: "warehouse", label: "Warehouse & Logistics", icon: "box",     match: ["warehouse-jobs", "amazon-warehouse", "ups", "fedex"] },
        { id: "retail",    label: "Retail & Store",         icon: "cart",    match: ["walmart", "target", "costco"] },
        { id: "driving",   label: "Driving & Delivery",     icon: "truck",   match: ["driver-jobs", "amazon-warehouse", "ups", "fedex"] },
        { id: "food",      label: "Food Service",           icon: "food",    match: ["mcdonalds", "starbucks"] },
        { id: "cleaning",  label: "Cleaning & Facilities",  icon: "spark",   match: ["cleaning-jobs"] },
        { id: "healthcare", label: "Healthcare & Care",     icon: "heart",   match: ["caregiver-jobs"] },
        { id: "hospitality", label: "Hospitality",          icon: "building", match: ["hospitality-jobs", "starbucks", "mcdonalds"] },
        { id: "security",  label: "Security",               icon: "shield",  match: ["security-jobs"] },
        { id: "remote",    label: "Remote / Work from Home", icon: "laptop", match: ["remote-jobs"] },
        { id: "admin",     label: "Office & Admin",         icon: "briefcase", match: ["admin-jobs", "remote-jobs"] },
        { id: "customer",  label: "Customer Service",       icon: "users",   match: ["remote-jobs", "admin-jobs"] },
        { id: "any",       label: "Show me everything",     icon: "briefcase", match: [] }
      ]
    },
    {
      key: "location", q: "Where do you want to work?",
      sub: "We focus on U.S. openings.",
      options: [
        { id: "local",  label: "In my local area", icon: "pin" },
        { id: "remote", label: "Remote (from home)", icon: "laptop" },
        { id: "us",     label: "Anywhere in the U.S.", icon: "briefcase" }
      ]
    },
    {
      key: "schedule", q: "What schedule works best?",
      sub: "You can change this later on the employer's site.",
      options: [
        { id: "full",     label: "Full-time", icon: "clock" },
        { id: "part",     label: "Part-time", icon: "clock" },
        { id: "flexible", label: "Flexible / any", icon: "calendar" }
      ]
    },
    {
      key: "experience", q: "What's your experience level?",
      sub: "Plenty of roles need no experience at all.",
      options: [
        { id: "none",  label: "No experience — entry level", icon: "spark" },
        { id: "some",  label: "Some experience", icon: "check" },
        { id: "exp",   label: "Experienced", icon: "star" }
      ]
    },
    // All 7 questions run on the champion funnel (/find/) — owner decision 2026-07-26 to promote
    // the longer onboarding to the default. Each added question is its own pageview (more ad
    // impressions) AND deepens the visitor's investment before the results.
    {
      key: "start", q: "When can you start?",
      sub: "This just helps us surface the most relevant openings.",
      options: [
        { id: "asap",      label: "As soon as possible", icon: "bolt" },
        { id: "fewweeks",  label: "Within a few weeks", icon: "calendar" },
        { id: "exploring", label: "Just exploring for now", icon: "search" }
      ]
    },
    {
      key: "pay", q: "What hourly pay are you hoping for?",
      sub: "Pay is set by each employer — we'll always show the real range on the posting.",
      options: [
        { id: "p15",   label: "$15+ per hour", icon: "dollar" },
        { id: "p18",   label: "$18+ per hour", icon: "dollar" },
        { id: "p22",   label: "$22+ per hour", icon: "dollar" },
        { id: "popen", label: "Open to any pay", icon: "check" }
      ]
    },
    {
      key: "commute", q: "How far are you willing to travel?",
      sub: "We'll prioritize roles that fit your commute.",
      options: [
        { id: "near",    label: "Within 10 miles", icon: "pin" },
        { id: "mid",     label: "Within 25 miles", icon: "truck" },
        { id: "anydist", label: "Any distance (or remote)", icon: "laptop" }
      ]
    }
  ]
};
// Champion onboarding now serves ALL questions at /find/ (owner promoted the long form to default).
// Kept as a constant so the sitemap + chat stay in sync if the set changes.
const CHAMPION_COUNT = INTAKE.questions.length;

/* ----------------------------------------------------------------------------
 * USA MODAL LANDER — a /usa/ entry lander whose intake is a POP-UP MODAL quiz that opens
 * IMMEDIATELY on arrival, then an OPT-IN REWARDED VIDEO, then it lands the visitor on a
 * genuine CONTENT GUIDE page (/usa/remote-jobs/) that explains remote jobs, lists reputable
 * boards + employers with outbound links, and carries in-content display ads.
 *
 * FUNNEL SHAPE (the judged-best format for compliant content arbitrage — see CLAUDE.md):
 *   /usa/  (entry, real content behind the modal) → modal quiz opens on load
 *     → 3 quick tap questions (build investment so the rewarded view actually completes)
 *     → OPT-IN rewarded video (THE revenue maker; asked at peak intent = best completion)
 *     → /usa/remote-jobs/  (content guide: explainer + places-hiring links + display ads).
 * Two content pageviews + a rewarded video + display ads + outbound affiliate = the deepest
 * compliant monetization of one bought click; the rewarded ad sits at the highest-intent
 * moment for the best completion (= revenue) rate.
 *
 * WHY THIS IS COMPLIANT (root §4 Fight 1 & 3): the immediate "pop-up" is NOT a forced ad
 * overlay / pop-under (those stay banned). It is an OPT-IN engagement quiz the visitor can
 * always close (X, backdrop, Esc), with REAL content behind it — that closeability + the
 * content behind are the line between an engagement modal and a banned interstitial (and
 * they protect the Google-Ads landing-page Quality Score → CPC). The only ad in the flow is
 * the OPT-IN rewarded video, which reuses the SAME never-trap plumbing as the /find/ gate
 * (playRewarded in jobs.js): the guide is revealed on ANY terminal outcome (granted /
 * no-fill / error / SDK-absent / timeout / early-close→escape). A rewarded video CANNOT be
 * autoplayed (policy + the SDK needs a user gesture); instead we optimize the opt-in to
 * convert. No invented stats — all copy is true framing (root §4 Fight 2).
 * -------------------------------------------------------------------------- */
const USA_MODAL = {
  autoDelay: 0,   // open the modal immediately on load (owner: "modal should already show")
  // Generic, low-friction REMOTE-work questions (≤3 options each) — this is a remote-jobs angle,
  // so the copy is work-from-home flavoured. Answers just build investment before the rewarded
  // ask (the guide is static content and does not depend on them), so keep them easy and broad.
  questions: [
    {
      key: "type", q: "What kind of remote work interests you?",
      sub: "Pick the closest fit — this is just to tailor your guide.",
      options: [
        { id: "support",  label: "Customer service & support" },
        { id: "admin",    label: "Data entry & admin" },
        { id: "any",      label: "Show me everything" }
      ]
    },
    {
      key: "schedule", q: "How many hours a week do you want?",
      sub: "You can always change this with the employer.",
      options: [
        { id: "full",     label: "Full-time" },
        { id: "part",     label: "Part-time" },
        { id: "flexible", label: "Flexible / any hours" }
      ]
    },
    {
      key: "start", q: "When would you like to start?",
      sub: "No commitment — this just helps set expectations.",
      options: [
        { id: "asap",      label: "As soon as possible" },
        { id: "fewweeks",  label: "Within a few weeks" },
        { id: "exploring", label: "Just exploring for now" }
      ]
    }
  ]
};

/* Content for the /usa/remote-jobs/ GUIDE (the rewarded-ad payoff). All entries are REAL,
 * reputable destinations with HONEST framing ("regularly hires", "search their site") — never
 * an invented "X open roles now" (root §4 Fight 2). Outbound links carry rel="nofollow noopener
 * sponsored" (the affiliate/CPC leg + FTC-safe). We NEVER render their logos (root image rule) —
 * just a neutral line icon. Split into specialist boards + known remote employers = genuinely
 * useful content, which is exactly what keeps a monetized page off the thin-doorway list. */
const USA_REMOTE_BOARDS = [
  { name: "We Work Remotely",   url: "https://weworkremotely.com/",                 icon: "laptop", desc: "One of the largest remote-only job boards — support, marketing, tech and more." },
  { name: "FlexJobs",           url: "https://www.flexjobs.com/",                   icon: "check",  desc: "Screened remote and flexible listings (paid) — vetted to cut down on scams." },
  { name: "Remote.co",          url: "https://remote.co/remote-jobs/",              icon: "home",   desc: "Curated remote roles across customer service, data entry, writing and design." },
  { name: "Working Nomads",     url: "https://www.workingnomads.com/jobs",          icon: "wifi",   desc: "Free, frequently-updated feed of remote jobs you can filter by category." },
  { name: "LinkedIn — Remote",  url: "https://www.linkedin.com/jobs/remote-jobs/",  icon: "users",  desc: "Filter the largest professional network to remote-only postings." },
  { name: "Indeed — Remote",    url: "https://www.indeed.com/q-remote-jobs.html",   icon: "search", desc: "Search millions of listings with the 'Remote' filter turned on." }
];
const USA_REMOTE_EMPLOYERS = [
  { name: "Amazon — Virtual Jobs",   url: "https://www.amazon.jobs/en/business_categories/virtual-locations", icon: "box",   desc: "Work-from-home customer service and corporate roles across many U.S. states." },
  { name: "Concentrix",              url: "https://jobs.concentrix.com/",                                     icon: "users", desc: "Customer-experience company that regularly hires remote support agents." },
  { name: "TTEC",                    url: "https://www.ttecjobs.com/en/search-jobs/remote",                   icon: "users", desc: "Hires work-from-home customer service and sales reps; training provided." },
  { name: "Liveops",                 url: "https://liveops.com/agent-opportunities/",                         icon: "clock", desc: "Independent-contractor remote call-center agents with flexible scheduling." },
  { name: "Working Solutions",       url: "https://www.workingsolutions.com/",                                icon: "spark", desc: "Contract remote customer-support and data roles across the U.S." },
  { name: "Robert Half — Remote",    url: "https://www.roberthalf.com/us/en/jobs/remote",                     icon: "briefcase", desc: "Staffing agency listing remote admin, finance and tech assignments." }
];

/* PART-TIME / FLEXIBLE work — the "fits around the school run" half of the guide (2026-08-20).
 * This is the payoff page for the part-time / stay-at-home ad angles, and it is the single most
 * scam-saturated corner of the whole jobs niche ("work from home mom", envelope-stuffing,
 * pay-for-a-starter-kit, WhatsApp task scams). So the honesty here is not decoration — it is what
 * keeps the AD ACCOUNT alive (root §4 Fight 2) and what makes the page worth the click.
 * Deliberately NO hourly $ ranges: most flexible work is paid per task, per lesson or per audio
 * minute and the volume moves week to week. Stating "how it is paid" is true; stating "$18/hr"
 * would not be. The last entry says out loud that studies are supplemental income, not a job. */
const FLEX_ROLES = [
  { name: "Customer support, part-time",             icon: "users",    desc: "Contact-centre employers regularly post 15–25 hour schedules, including evenings and weekends. Paid hourly, and training is usually provided." },
  { name: "Online tutoring and language practice",   icon: "spark",    desc: "Teach a school subject or practise conversation by video. Usually paid per lesson, with students booking into hours you open yourself." },
  { name: "Data annotation and search evaluation",   icon: "check",    desc: "Rate search results, label images, or check AI answers against written guidelines. Task-based, so you work when you are free." },
  { name: "Transcription and captioning",            icon: "laptop",   desc: "Type what you hear from short audio or video files. Paid per audio minute, so the hours are entirely your own." },
  { name: "Virtual assistant, a few hours a day",    icon: "calendar", desc: "Inbox, calendar and small admin tasks for one client. Once you have a regular client this is the steadiest of the flexible options." },
  { name: "Paid research studies and website tests", icon: "clock",    desc: "Short paid studies and usability tests. Genuinely flexible, but treat it as supplemental income — the work arrives irregularly and it is not a job." }
];

/* Platforms for the flexible/part-time roles above. Most recruit in many countries, which is why
 * this block serves the international visitor as well as the U.S. one. Descriptions say plainly
 * that availability varies — an honest expectation is what stops the bounce-and-complain loop. */
const FLEX_PLATFORMS = [
  { name: "Appen",         url: "https://www.appen.com/careers/available-jobs", icon: "check",  desc: "Task-based work-from-home projects — data annotation, search evaluation — recruited across a long list of countries. Projects come and go, so check back." },
  { name: "TELUS Digital", url: "https://www.telusdigital.com/careers",         icon: "users",  desc: "Recruits part-time, from-home raters and data contributors internationally. Each project lists the countries and languages it needs." },
  { name: "Clickworker",   url: "https://www.clickworker.com/clickworker/",     icon: "bolt",   desc: "Short micro-tasks paid per task — text, categorisation, data checks. Open in many countries; how much is available changes week to week." },
  { name: "Preply",        url: "https://preply.com/en/teach",                  icon: "spark",  desc: "Tutor a subject or a language online. You set your own rate and open only the hours you actually want to teach." },
  { name: "italki",        url: "https://www.italki.com/",                      icon: "calendar", desc: "Teach a language by video call to students worldwide, entirely on a schedule you control." },
  { name: "TranscribeMe",  url: "https://www.transcribeme.com/careers/",        icon: "laptop", desc: "Transcribe short audio files from home once you pass their entry test. Paid per audio minute, worked whenever suits you." }
];

/* OUTSIDE THE UNITED STATES — boards, platforms and employers that can actually hire someone who
 * is not in the U.S. (2026-08-20). The honest fact this section is built on: most "US remote"
 * postings say United States only because the employer has to run payroll and tax where you live,
 * and that is exactly the gap the scam industry sells into ("we'll get you a US job / a visa").
 * We state the limit, then give the three routes that genuinely exist. No promises, no visas. */
const GLOBAL_BOARDS = [
  { name: "Remote OK",       url: "https://remoteok.com/",              icon: "wifi",   desc: "Large remote-only board. Many listings say 'worldwide' rather than naming one country — filter for those first." },
  { name: "Remotive",        url: "https://remotive.com/remote-jobs",   icon: "laptop", desc: "Curated remote roles where each posting names the regions the company is able to hire in." },
  { name: "Himalayas",       url: "https://himalayas.app/jobs",         icon: "search", desc: "Lets you filter by the countries a company can legally employ in — the quickest way to skip US-only postings." },
  { name: "Jobspresso",      url: "https://jobspresso.co/browse-jobs/", icon: "check",  desc: "Hand-screened remote roles across support, marketing, writing and tech." },
  { name: "Wellfound",       url: "https://wellfound.com/jobs",         icon: "spark",  desc: "Startup jobs with a remote filter. Startups hire contractors internationally far more often than large employers do." },
  { name: "Europe Remotely", url: "https://europeremotely.com/",        icon: "pin",    desc: "Remote roles open to people working in European time zones." }
];
const GLOBAL_PLATFORMS = [
  { name: "Upwork",         url: "https://www.upwork.com/",       icon: "briefcase", desc: "The largest freelance marketplace. Clients hire by project or by the hour — the most common route to overseas clients from outside the U.S." },
  { name: "Fiverr",         url: "https://www.fiverr.com/",       icon: "cart",      desc: "You list the service you offer and buyers come to you. Useful for a first international client when you have no track record yet." },
  { name: "Freelancer.com", url: "https://www.freelancer.com/",   icon: "search",    desc: "Long-running global marketplace covering admin, data, writing, design and development work." },
  { name: "Toptal",         url: "https://www.toptal.com/talent", icon: "star",      desc: "Vetted network for experienced freelancers. The screening is demanding, but the rates are higher and the clients are largely U.S. companies." },
  { name: "Turing",         url: "https://www.turing.com/",       icon: "laptop",    desc: "Matches software engineers based outside the U.S. with long-term remote roles at U.S. companies." },
  { name: "Andela",         url: "https://andela.com/",           icon: "users",     desc: "Places technologists — with a large African talent network — into remote roles with companies abroad." }
];
const GLOBAL_EMPLOYERS = [
  { name: "Automattic",      url: "https://automattic.com/work-with-us/", icon: "home",   desc: "The company behind WordPress.com is fully distributed and hires people in dozens of countries." },
  { name: "GitLab",          url: "https://about.gitlab.com/jobs/",       icon: "laptop", desc: "All-remote company. Every posting lists the countries it is able to hire in — read that line before you apply." },
  { name: "Zapier",          url: "https://zapier.com/jobs",              icon: "bolt",   desc: "Remote-first from the start, with roles open across a number of countries." },
  { name: "Teleperformance", url: "https://jobs.teleperformance.com/",    icon: "users",  desc: "Global customer-experience employer running work-at-home programmes in many countries — often the most accessible entry-level route." },
  { name: "Welocalize",      url: "https://www.welocalize.com/careers/",  icon: "spark",  desc: "Language, localisation and data work recruited internationally, much of it project-based and part-time." },
  { name: "Crossover",       url: "https://www.crossover.com/",           icon: "clock",  desc: "Recruits worldwide for long-term full-time remote contracts. Pay is competitive; expect intensive screening and monitored working hours." }
];

/* ----------------------------------------------------------------------------
 * USA PACKING-JOBS MODAL LANDER — a fourth entry point at /usa-packing-jobs/, built to the
 * SAME judged-best shape as /usa/ (modal quiz on load → opt-in rewarded video → content guide),
 * for the "packing jobs from home" ad angle. Same compliance spine as /usa/: the modal is always
 * closeable with real content behind it (opt-in engagement, never a forced overlay), and NO display
 * ad ever sits behind the blurred modal (the lander suppresses ad slots + anchor — see buildPacking-
 * Landing). Monetization is the rewarded video + the /usa-packing-jobs/from-home/ GUIDE's in-content ads.
 *
 * WHY THE CONTENT IS HONEST (root §4 Fights 2 & 3 — this niche is scam-magnet, so this matters):
 * "work from home packing / envelope-stuffing / assembly-kit" ads are among the most common job
 * scams (the pay-a-fee-for-a-starter-kit hustle). We do NOT promote those. The guide tells the
 * TRUTH — genuine at-home packing/assembly is real but limited, most "packing jobs" are warehouse/
 * fulfillment roles, and a legit job NEVER charges you to start — then links only to reputable
 * boards/employers. Honest + useful = long dwell + a live affiliate leg + it reads as a real
 * article, which is exactly what keeps a monetized page off GAM's demonetization list.
 * -------------------------------------------------------------------------- */
const PACKING_MODAL = {
  autoDelay: 0,   // open immediately on load, same as /usa/ (owner shape)
  // Low-friction, packing-flavoured questions. They only build investment before the rewarded
  // ask (the guide is static content and does not depend on the answers), so keep them easy/broad.
  questions: [
    {
      key: "type", q: "What kind of packing work are you after?",
      sub: "Pick the closest fit — this just tailors your guide.",
      options: [
        { id: "home",      label: "From-home packing / light assembly" },
        { id: "warehouse", label: "Warehouse packing / fulfillment" },
        { id: "any",       label: "Show me everything" }
      ]
    },
    {
      key: "schedule", q: "How many hours a week do you want?",
      sub: "You can always change this with the employer.",
      options: [
        { id: "full",     label: "Full-time" },
        { id: "part",     label: "Part-time" },
        { id: "flexible", label: "Flexible / any hours" }
      ]
    },
    {
      key: "start", q: "When would you like to start?",
      sub: "No commitment — this just helps set expectations.",
      options: [
        { id: "asap",      label: "As soon as possible" },
        { id: "fewweeks",  label: "Within a few weeks" },
        { id: "exploring", label: "Just exploring for now" }
      ]
    }
  ]
};

/* The real, common types of packing/assembly work (honest framing — no invented counts). Used by
 * the /usa-packing-jobs/from-home/ guide. Notes stay truthful about what is and isn't from-home. */
const PACKING_ROLES = [
  { title: "At-home assembly & kitting",  icon: "box",    note: "Assembling kits, packets or small products at home for a business. Real but limited — usually via local employers or staffing agencies, never a paid 'starter kit'." },
  { title: "E-commerce / subscription-box packing", icon: "home", note: "Small brands hire people to pack and ship orders — some let you work from home, most are on-site at a small warehouse." },
  { title: "Warehouse packer / fulfillment associate", icon: "briefcase", note: "The most common 'packing job' by far: pack and prep orders on-site. Entry-level, training provided, steady hours." },
  { title: "Handmade-seller packing help", icon: "spark",  note: "Etsy and small makers sometimes hire local help to pack orders during busy seasons — ask sellers directly or watch local listings." }
];

/* Reputable places to find real packing / fulfillment work. Outbound = nofollow noopener sponsored
 * (affiliate/CPC leg + FTC-safe). Never their logos (root image rule) — a neutral line icon only. */
const PACKING_BOARDS = [
  { name: "Indeed — Packer jobs",   url: "https://www.indeed.com/q-packer-jobs.html",           icon: "search", desc: "Search live packing and fulfillment listings nationwide; turn on the location or 'remote' filter." },
  { name: "Snagajob",               url: "https://www.snagajob.com/search?q=packer",            icon: "clock",  desc: "Hourly warehouse, packing and fulfillment jobs — apply directly, often hiring immediately." },
  { name: "FlexJobs",               url: "https://www.flexjobs.com/",                           icon: "check",  desc: "Screened flexible and from-home roles (paid) — vetting cuts down on the packing-from-home scams." },
  { name: "Indeed — Remote packing",url: "https://www.indeed.com/q-work-from-home-packing-jobs.html", icon: "home", desc: "The genuine work-from-home packing/assembly postings, filtered to reputable employers." }
];
const PACKING_EMPLOYERS = [
  { name: "Amazon — Warehouse / Fulfillment", url: "https://www.amazon.jobs/en/business_categories/fulfillment-center-jobs", icon: "box",       desc: "Packer and fulfillment-associate roles across U.S. sites; training provided, weekly pay common." },
  { name: "Walmart — Fulfillment",            url: "https://careers.walmart.com/",                                            icon: "briefcase", desc: "Packing and order-fulfillment jobs at Walmart distribution and store-fulfillment centers." },
  { name: "Integrity Staffing Solutions",     url: "https://www.integritystaffing.com/",                                      icon: "users",     desc: "Staffing agency that places warehouse and packing workers — free to job-seekers." },
  { name: "Adecco USA",                       url: "https://www.adeccousa.com/job-seekers/",                                  icon: "users",     desc: "Global staffing agency listing warehouse, packing and light-industrial roles nationwide." }
];

/* ----------------------------------------------------------------------------
 * WORLDWIDE PACKING-JOBS MODAL LANDER — a fifth entry point at /packing-jobs/, the GEO-NEUTRAL
 * sibling of /usa-packing-jobs/, for running the packing-jobs creatives as a WORLD campaign (not
 * USA-only). Same judged-best shape and the exact same one modal engine (usaModal() markup +
 * Jobs.initUsaModal): modal quiz on load -> opt-in rewarded video -> content guide. Same compliance
 * spine as /usa/ + /usa-packing-jobs/: the modal is always closeable with real content behind it
 * (opt-in engagement, never a forced overlay), and NO display ad ever sits behind the blurred modal
 * (the lander suppresses ad slots + anchor). Monetization = the rewarded video + the
 * /packing-jobs/guide/ GUIDE's in-content ads.
 *
 * WHY WORLDWIDE CHANGES THE COPY (root §5 geo focus, §4 Fight 2):
 * - NOTHING is US-specific: no "USA"/"nationwide", no "$"/"weekly pay" claims (pay + pay cadence
 *   vary by country). Pay is framed as "varies by country and employer — the official posting shows
 *   local pay". Boards/employers are ones that operate across many countries and localize to the
 *   visitor's region. RPM ambition still leans US/UK/CA/AU (root §5), but the funnel serves any geo.
 * - A REGION self-ID question (Q2) is added vs the US packing modal: it makes the flow feel tailored
 *   no matter which country the paid click came from (higher completion = higher CTR into the reward),
 *   and it self-documents the geo mix in reporting. The guide is static content and does not depend on
 *   the answers, so the questions only build investment before the rewarded ask.
 * - Same scam-magnet caveat as the US packing guide: "work-from-home packing" is a global scam term,
 *   so the guide tells the truth (genuine at-home packing is limited, most packing jobs are on-site
 *   warehouse/fulfillment, a real job NEVER charges you to start) and links only to reputable boards.
 * -------------------------------------------------------------------------- */
const WORLD_PACKING_MODAL = {
  autoDelay: 0,   // open immediately on load, same shape as /usa/ + /usa-packing-jobs/
  // Low-friction, packing-flavoured questions (owner: 3-4). They only build investment before the
  // rewarded ask (the guide is static content and does not depend on the answers), so keep them easy.
  questions: [
    {
      key: "type", q: "What kind of packing work are you after?",
      sub: "Pick the closest fit — this just tailors your guide.",
      options: [
        { id: "home",      label: "From-home packing / light assembly" },
        { id: "warehouse", label: "Warehouse packing / fulfillment" },
        { id: "any",       label: "Show me everything" }
      ]
    },
    {
      // GENERIC experience question — deliberately NOT a location question. Asking "where are you
      // based?" would telegraph to the visitor that this is a multi-country campaign (undercuts the
      // "jobs near you" feel). Experience is universal, builds investment, and reinforces the
      // "no experience needed" hook. The guide doesn't depend on the answer.
      key: "experience", q: "Have you done packing or warehouse work before?",
      sub: "No wrong answer — many roles train you from scratch.",
      options: [
        { id: "some",  label: "Yes, I have some experience" },
        { id: "little", label: "A little" },
        { id: "none",  label: "No, I'm new to it" }
      ]
    },
    {
      key: "schedule", q: "How many hours a week do you want?",
      sub: "You can always change this with the employer.",
      options: [
        { id: "full",     label: "Full-time" },
        { id: "part",     label: "Part-time" },
        { id: "flexible", label: "Flexible / any hours" }
      ]
    },
    {
      key: "start", q: "When would you like to start?",
      sub: "No commitment — this just helps set expectations.",
      options: [
        { id: "asap",      label: "As soon as possible" },
        { id: "fewweeks",  label: "Within a few weeks" },
        { id: "exploring", label: "Just exploring for now" }
      ]
    }
  ]
};

/* Real, common packing/assembly role types — geo-neutral (no country-specific claims). Used by the
 * /packing-jobs/guide/. Notes stay truthful about what is and isn't genuinely from-home. */
const WORLD_PACKING_ROLES = [
  { title: "At-home assembly & kitting",  icon: "box",    note: "Assembling kits, packets or small products at home for a business. Real but limited — usually via local employers or staffing agencies, and never a paid 'starter kit'." },
  { title: "E-commerce / subscription-box packing", icon: "home", note: "Small brands hire people to pack and ship orders — some allow home-based work, most are on-site at a small warehouse." },
  { title: "Warehouse packer / fulfillment associate", icon: "briefcase", note: "The most common packing job by far, in every country: pack and prep orders on-site. Entry-level, training provided, steady hours." },
  { title: "Handmade-seller packing help", icon: "spark",  note: "Online makers sometimes hire local help to pack orders during busy seasons — ask sellers directly or watch local listings in your area." }
];

/* Reputable places to find real packing / fulfillment work in MANY countries. Global aggregators
 * that localize to the visitor's country, plus screened options. Outbound = nofollow noopener
 * sponsored (affiliate/CPC leg + FTC-safe). Never their logos (root image rule) — a line icon only. */
const WORLD_PACKING_BOARDS = [
  { name: "Indeed — Packer & warehouse jobs", url: "https://www.indeed.com/q-packer-jobs.html",  icon: "search", desc: "The world's largest job board — opens in your country's Indeed. Search 'packer' or 'warehouse' and set your location or a 'remote' filter." },
  { name: "LinkedIn Jobs",                    url: "https://www.linkedin.com/jobs/",             icon: "briefcase", desc: "Search packing, warehouse and fulfillment roles worldwide, filter by country and city, and apply directly to the employer." },
  { name: "Jooble",                           url: "https://jooble.org/",                        icon: "spark",  desc: "A job aggregator covering 70+ countries — pulls packing and warehouse listings from many boards into one local search." },
  { name: "Careerjet",                        url: "https://www.careerjet.com/",                 icon: "check",  desc: "Search-engine for jobs across 90+ countries and 20+ languages — good for finding local packing and logistics roles." }
];
/* Employers / staffing agencies that hire packing & fulfillment staff across MANY countries. */
const WORLD_PACKING_EMPLOYERS = [
  { name: "Amazon — Operations / Fulfillment", url: "https://www.amazon.jobs/en/business_categories/fulfillment-center-jobs", icon: "box",       desc: "Packer and fulfillment-associate roles at fulfillment centres worldwide; training provided, pick your country on the site." },
  { name: "Adecco (worldwide)",                url: "https://www.adecco.com/",                                                 icon: "users",     desc: "One of the largest global staffing agencies — lists warehouse, packing and light-industrial roles in 60+ countries. Free to job-seekers." },
  { name: "Randstad (worldwide)",              url: "https://www.randstad.com/jobs/",                                          icon: "users",     desc: "Global recruitment agency placing warehouse and packing workers across Europe, the Americas and Asia-Pacific." },
  { name: "ManpowerGroup",                     url: "https://www.manpower.com/",                                               icon: "briefcase", desc: "International staffing firm hiring for logistics, packing and fulfillment assignments in dozens of countries." }
];

/* ----------------------------------------------------------------------------
 * REMOTE FUNNEL — a dedicated work-from-home experience at /remote/, separate from
 * the generic /find/ funnel. It runs the SAME page-per-question engine (each Q = one
 * pageview = one ad impression) but the questions are tuned for remote work, and the
 * whole flow is engineered around the ONE thing that makes or breaks a remote-jobs
 * funnel: trust. Remote work's #1 objection is "is this a scam?", so the funnel
 * disarms that HONESTLY (real screening questions, reputable-board destinations,
 * repeated "no sign-up / no email" promise) — never with invented stats (root §4
 * Fights 2 & 3). One funnel serves every ad angle (seniors / stay-at-home parents /
 * students / …): Q1 self-identifies the audience so the flow feels tailored no matter
 * which paid creative brought the visitor, and per-angle landing pages match the ad's
 * first impression. All roads lead to the genuine remote-jobs destination.
 * -------------------------------------------------------------------------- */

// Source of truth for the remote ROLE types — shared by intake Q2 AND the results
// cards so they never drift. Titles/pay mirror data/remote-jobs.json (the real
// destination). Each id is used as the answer value AND the results card's data-cat,
// so picking a role on Q2 surfaces that role first on the results page (reusing the
// existing personalizeMatches reorder — no new client JS).
const REMOTE_ROLES = [
  { id: "support",    title: "Customer Service Rep (Remote)",    pay: "$15 – $22 / hr", icon: "users",    blurb: "Handle calls, chats, or emails from a queue — full training is common." },
  { id: "dataentry",  title: "Data Entry Clerk (Remote)",        pay: "$15 – $20 / hr", icon: "check",    blurb: "Enter and check information accurately — great entry-level starting point." },
  { id: "va",         title: "Virtual Assistant",                pay: "$16 – $25 / hr", icon: "calendar", blurb: "Manage calendars, email, and small tasks for a client or team." },
  { id: "sales",      title: "Remote Sales / Appointment Setter", pay: "$17 – $28 / hr", icon: "dollar",   blurb: "Set appointments and follow up with warm leads by phone and email." },
  { id: "moderation", title: "Content Moderator / QA",           pay: "$16 – $23 / hr", icon: "shield",   blurb: "Review content against clear guidelines to keep platforms safe." }
];

const REMOTE_INTAKE = {
  questions: [
    // Q1 — audience self-ID. Personalizes the flow AND lets one funnel serve every ad
    // angle (whatever creative pulled them in, they see themselves here).
    {
      key: "audience", q: "Which best describes you?",
      sub: "We'll tailor work-from-home roles to your situation.",
      options: [
        { id: "senior",   label: "Semi-retired or 50+, want to work from home", icon: "star" },
        { id: "parent",   label: "A parent working from home",                   icon: "heart" },
        { id: "student",  label: "A student or recent grad",                     icon: "spark" },
        { id: "switch",   label: "Working now, want to switch to remote",        icon: "laptop" },
        { id: "between",  label: "Between jobs, need remote work",               icon: "search" },
        { id: "explore",  label: "Just exploring remote options",                icon: "users" }
      ]
    },
    // Q2 — role type. key "type" so the existing results personalization (keys off
    // ans.type) reorders the matched role first. Every option matches the real
    // remote-jobs destination.
    {
      key: "type", q: "What kind of remote work interests you?",
      sub: "Pick the closest fit — we'll surface matching openings.",
      options: REMOTE_ROLES.map((r) => ({ id: r.id, label: r.title.replace(/ \(Remote\)$/, ""), icon: r.icon, match: ["remote-jobs"] }))
        .concat([{ id: "any", label: "Not sure — show me what's available", icon: "briefcase", match: ["remote-jobs"] }])
    },
    // Q3 — hours (key "schedule" so it shows in the results summary line).
    {
      key: "schedule", q: "How many hours a week are you looking for?",
      sub: "You can change this later on the employer's site.",
      options: [
        { id: "part",     label: "Part-time (under 20)",     icon: "clock" },
        { id: "mid",      label: "20 – 30 hours",            icon: "clock" },
        { id: "full",     label: "Full-time (35+)",          icon: "calendar" },
        { id: "flexible", label: "Flexible / whatever fits", icon: "spark" }
      ]
    },
    // Q4 — the legitimacy move. Real remote roles have real requirements; asking makes
    // the flow feel like genuine screening (not a scam), and it's completely honest.
    {
      key: "space", q: "Do you have a quiet space and reliable internet?",
      sub: "Most work-from-home roles need this — it helps us match you to ones you'll actually get.",
      options: [
        { id: "both",     label: "Yes, both",                                icon: "wifi" },
        { id: "internet", label: "Internet yes, still setting up a quiet space", icon: "home" },
        { id: "equip",    label: "Not yet — show roles that provide equipment", icon: "box" }
      ]
    },
    // Q5 — experience/comfort. Reassures the "no experience" visitor that entry-level
    // and training-provided roles exist (true — see data/remote-jobs.json).
    {
      key: "computer", q: "How comfortable are you with a computer?",
      sub: "Plenty of roles are entry-level with training provided.",
      options: [
        { id: "high",     label: "Very — I use one every day",       icon: "laptop" },
        { id: "some",     label: "Fairly — I can find my way around", icon: "check" },
        { id: "beginner", label: "Beginner — I'd want training",      icon: "spark" }
      ]
    },
    // Q6 — start date (commitment / relevance signal).
    {
      key: "start", q: "When would you like to start?",
      sub: "This just helps us surface the most relevant openings.",
      options: [
        { id: "asap",      label: "Right away",           icon: "bolt" },
        { id: "fewweeks",  label: "Within a few weeks",   icon: "calendar" },
        { id: "exploring", label: "Just exploring for now", icon: "search" }
      ]
    },
    // Q7 — pay, framed with honest ranges (never a fabricated specific figure — Fight 2).
    {
      key: "pay", q: "What pay are you hoping for?",
      sub: "Pay is set by each employer — we always show the real range on the posting.",
      options: [
        { id: "p15",   label: "$15+ per hour", icon: "dollar" },
        { id: "p18",   label: "$18+ per hour", icon: "dollar" },
        { id: "p22",   label: "$22+ per hour", icon: "dollar" },
        { id: "popen", label: "Open to any pay", icon: "check" }
      ]
    },
    // Q8 — the trust seal, right before results (highest-intent moment). Turns the
    // scam/"here comes the form" objection into reassurance. Single honest CTA — NOT a
    // fake either/or choice (root §4 Fight 3: no dark patterns on a vulnerable audience).
    {
      key: "confirm", q: "You're all set — ready to see your matches?",
      sub: "The roles we show come only from reputable job boards and official company pages. A legitimate remote job never asks you to pay to start, and we'll never ask for your email or a sign-up.",
      options: [
        { id: "go", label: "Show my remote job matches", icon: "shield", match: ["remote-jobs"] }
      ]
    }
  ]
};

// Per-angle landing variants. Each is a thin lander that matches its paid creative's
// first impression, then feeds the SAME /remote/find/ funnel. The generic /remote/ is
// indexable; the angle variants are noindex (near-duplicate paid landers). Add an angle
// = add an entry. CPC attributes per campaign because each entry is its own URL.
const REMOTE_ANGLES = [
  { id: "seniors",  h1: "Remote Jobs for People 50+",           lead: "Flexible work-from-home roles that value experience — customer service, data entry, and virtual assistant openings hiring nationwide.", banner: 0 },
  { id: "parents",  h1: "Remote Jobs for Stay-at-Home Parents", lead: "Work from home around your family — part-time and flexible remote roles hiring now. No commute, no sign-up.", banner: 3 },
  { id: "students", h1: "Remote Jobs for Students",             lead: "Flexible, entry-level work-from-home roles that fit around classes — many need no experience and provide training.", banner: 4 }
];

/* ---------- inline SVG icons (NO EMOJI — hard rule, see root CLAUDE.md) ----------
 * Line icons, 24x24, currentColor, self-contained. Add new ones here as needed. */
const ICON_PATHS = {
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 13h20"/>',
  pin:       '<path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  box:       '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8"/>',
  truck:     '<path d="M1 5h13v11H1zM14 9h4l3 3v4h-7z"/><circle cx="6" cy="18.5" r="1.8"/><circle cx="18" cy="18.5" r="1.8"/>',
  cart:      '<circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M2 3h3l2.3 12.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21.5 7H6"/>',
  food:      '<path d="M4 11h16a8 8 0 0 0-16 0zM3 15h18M5 19h14a3 3 0 0 0 2-3H3a3 3 0 0 0 2 3z"/>',
  spark:     '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
  heart:     '<path d="M20.8 5.6a5 5 0 0 0-7.8-1L12 5.5l-1-1a5 5 0 0 0-7.8 6L12 21l8.8-10.4a5 5 0 0 0 0-5z"/>',
  building:  '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.5M12 6h.5M16 6h.5M8 10h.5M12 10h.5M16 10h.5M8 14h.5M12 14h.5M16 14h.5"/>',
  laptop:    '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M2 20h20"/>',
  dollar:    '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  clock:     '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search:    '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  arrow:     '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron:   '<path d="M9 6l6 6-6 6"/>',
  check:     '<path d="M20 6L9 17l-5-5"/>',
  shield:    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  users:     '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  star:      '<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>',
  calendar:  '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  wrench:    '<path d="M14.7 6.3a4 4 0 0 0-5.4 5L3 17.6 6.4 21l6.3-6.3a4 4 0 0 0 5-5.4l-2.6 2.6-2.4-2.4z"/>',
  bolt:      '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  home:      '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  wifi:      '<path d="M2 8.5a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a6 6 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
  close:     '<path d="M18 6L6 18M6 6l12 12"/>',
  external:  '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
};
function icon(name, size) {
  const p = ICON_PATHS[name] || ICON_PATHS.briefcase;
  const s = size || 24;
  return `<svg class="icon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

/* ---------- original SVG hero banner (zero copyright risk — see CLAUDE.md) ----------
 * We NEVER rip employer logos/photos. Each property renders a generated banner:
 * a clean brand-tinted panel with the themed line icon + the property initials.
 * Instant load (great CWV/RPM), varied per property, legally safe. */
const BANNERS = [
  { a: "#1f6feb", b: "#0b3d91", ink: "#eaf1ff" },
  { a: "#0e9f6e", b: "#04663f", ink: "#e7fff4" },
  { a: "#e8730c", b: "#a8410a", ink: "#fff2e6" },
  { a: "#7b3fe4", b: "#4a1f9e", ink: "#f2ecff" },
  { a: "#0891b2", b: "#0a5566", ink: "#e6fbff" },
  { a: "#d61f69", b: "#8a0f45", ink: "#ffe8f3" }
];
function initials(s) {
  // First two letters of the cleaned label — cleaner, more recognizable badges
  // (McDonald's -> MC, Amazon -> AM, Walmart -> WA, Warehouse Jobs -> WA).
  const clean = String(s).replace(/[^a-z]/gi, "");
  return (clean.slice(0, 2) || "JB").toUpperCase();
}
function bannerSVG(uid, i, label, iconName) {
  const p = BANNERS[i % BANNERS.length];
  const gid = "bg" + uid, did = "bd" + uid;
  const iconPath = ICON_PATHS[iconName] || ICON_PATHS.briefcase;
  return `<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(label)}">
  <defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/>
    </linearGradient>
    <pattern id="${did}" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="1.5" fill="${p.ink}" opacity="0.16"/>
    </pattern>
  </defs>
  <rect width="400" height="220" fill="url(#${gid})"/>
  <rect width="400" height="220" fill="url(#${did})"/>
  <circle cx="66" cy="110" r="46" fill="${p.ink}" opacity="0.14"/>
  <g transform="translate(44,88) scale(3.7)" stroke="${p.ink}" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round">${iconPath}</g>
  <g transform="translate(232,74)">
    <rect x="0" y="0" width="120" height="72" rx="16" fill="${p.ink}" opacity="0.95"/>
    <text x="60" y="50" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="800" fill="${p.b}">${esc(initials(label))}</text>
  </g>
  <rect x="24" y="176" width="150" height="12" rx="6" fill="${p.ink}" opacity="0.5"/>
  <rect x="24" y="196" width="96" height="10" rx="5" fill="${p.ink}" opacity="0.32"/>
</svg>`;
}

/* ---------- brand logo (inline SVG mark + wordmark) ---------- */
function logoMark() {
  // "Nest" mark: a location pin cradling a briefcase — find work near you.
  return `<svg class="logo-mark" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(SITE.name)} logo">
  <defs>
    <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2f8bff"/><stop offset="1" stop-color="#0b57d0"/>
    </linearGradient>
  </defs>
  <path d="M24 4c8.3 0 15 6.5 15 14.6C39 29 24 44 24 44S9 29 9 18.6C9 10.5 15.7 4 24 4z" fill="url(#logoGrad)"/>
  <rect x="15" y="16" width="18" height="12" rx="2.5" fill="#fff"/>
  <path d="M20 16v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M15 21h18" stroke="#0b57d0" stroke-width="1.8" fill="none" stroke-linecap="round"/>
</svg>`;
}
function logo() {
  return `<a class="brand" href="${B}">
  ${logoMark()}
  <span class="brand-text">
    <span class="brand-name">${esc(SITE.name)}</span>
    <span class="brand-tag">${esc(SITE.tagline || "")}</span>
  </span>
</a>`;
}

/* ---------- tiny helpers ---------- */
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function write(rel, html) {
  const full = path.join(OUT_DIR, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html);
}

/* Base path for a property's funnel. Employer pages nest under /jobs/, category
 * pages sit at the root with an SEO slug (id already ends in "-jobs"). */
function propBase(p) {
  return p.type === "employer" ? `${B}jobs/${p.id}/` : `${B}${p.id}/`;
}
function propDir(p) {
  return p.type === "employer" ? `jobs/${p.id}` : `${p.id}`;
}
function propLabel(p) {
  return p.type === "employer" ? p.employer : p.category;
}

/* Price Optimiser Publisher Experience SDK (thebesads / priceoptimiser). Loads async on
 * EVERY page. It loads GPT, attaches a GAM slot to each ad div BY #id, and fills it.
 * PER-SITE bundle (switched 2026-08-30, partner request; renamed to jobguidematch.js 2026-09-06
 * after the .com.js name started 404ing): jobguidematch.js carries the
 * site's placement registry BAKED IN (slotKeys ad-leaderboard/ad-incontent/ad-results/ad-anchor
 * with their #id selectors) — the shared publisher-sdk.js bundle we used before has NO display
 * placements in it (rewarded only) and no longer reads data-po-site, which is why the div-id
 * preload/revealSlots calls mapped to nothing and the guide's ads went blank after the v1.34.0
 * div-id migration. No data-po-site attribute — the siteKey is hardcoded in the bundle.
 * This is the SINGLE owner of GPT: we do NOT render <ins> units, load adsbygoogle.js, or
 * hand-roll a second googletag setup (../PUBLISHER_INTEGRATION.md forbids that as a
 * duplicate ad stack). */
const PARTNER_SCRIPT = `<script async src="https://priceoptimiser1.thebesads.com/experiences/jobguidematch.js"></script>`;

/* GA4 — the LIGHTWEIGHT analytics path (raw gtag.js, async, NO Google Tag Manager container).
 * Why this and not GAM key-values: our ad server is driven by the Price Optimiser SDK, which
 * OWNS the GAM ad request and forbids the publisher from setting targeting/key-values on it
 * (../PUBLISHER_INTEGRATION.md). So the page cannot fill GAM key-values directly. GA4 instead
 * reads campaign data straight off the landing URL: it auto-maps the STANDARD utm params
 * (utm_source/medium/campaign + utm_id for the campaign ID, utm_content) into its Session
 * dimensions, session-scoped, with ZERO extra JS — every funnel step is a full pageview so
 * GA4 fires page_view per step and attributes the whole session to the landing UTMs. Link
 * GAM360 <-> GA4 to break ad revenue down by campaign (tier-dependent — verify in GA4 Admin ->
 * Product links). Loaded async + placed AFTER the ad SDK so ads/content keep priority (speed =
 * revenue, root §5); dns-prefetch (not preconnect) so it never competes for the ad sockets. */
/* Google Ads conversion hook. Every rewarded flow — the /find/ gate, the USA/packing/worldwide/
 * generic modal funnels and the Saudi /me/<lang>/ steps — fires track('reward_prompt', {funnel})
 * on the user's click that triggers the rewarded video, BEFORE the ad loads (jobs.js). That single
 * moment is "the visitor requested the rewarded ad", so we hang the Google Ads conversion off it in
 * ONE place here rather than touching every flow. On reward_prompt we send a named event
 * (reward_requested) to the Ads tag so it is detectable in Google Ads to build a conversion
 * from, and — once SITE.adsConversionLabel is set from a classic conversion action's snippet — the
 * standard gtag('event','conversion',{send_to:'AW-.../<label>'}). */
const GTAG_ID = SITE.ga4Id || SITE.adsId;   // gtag.js is one library; load it under whichever id exists
const ADS_HOOK = SITE.adsId
  ? `if(n==='reward_prompt'){var _sf=(p&&p.funnel)||'';gtag('event','reward_requested',{send_to:'${SITE.adsId}',funnel:_sf});${
      SITE.adsConversionLabel ? `gtag('event','conversion',{send_to:'${SITE.adsId}/${SITE.adsConversionLabel}'${SITE.adsConversionValue != null ? `,value:${SITE.adsConversionValue},currency:'${SITE.adsConversionCurrency}'` : ""},funnel:_sf});` : ""}}`
  : "";
const ANALYTICS_SCRIPT = GTAG_ID
  ? `<link rel="dns-prefetch" href="https://www.googletagmanager.com">
<script async src="https://www.googletagmanager.com/gtag/js?id=${GTAG_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${SITE.ga4Id ? `gtag('config','${SITE.ga4Id}');` : ""}${SITE.adsId ? `gtag('config','${SITE.adsId}');` : ""}
/* Portfolio funnel-tracking helper (identical across every site). window.track(name,params)
 * sends a GA4 event; the DOMContentLoaded block auto-fires funnel_step/start/complete from
 * <body data-fn / data-fn-item / data-step / data-steps / data-step-name>. In-page moments
 * (reward gate, modal-quiz questions) call window.track() directly from jobs.js. The reward_prompt
 * branch also fires the Google Ads conversion (see ADS_HOOK above). */
window.track=function(n,p){try{gtag('event',n,p||{});${ADS_HOOK}}catch(e){}};
addEventListener('DOMContentLoaded',function(){var d=(document.body||{}).dataset||{};if(!d.fn)return;var s=d.step?+d.step:0,t=d.steps?+d.steps:0,p={funnel:d.fn};if(d.fnItem)p.funnel_item=d.fnItem;if(s)p.step_index=s;if(t)p.step_total=t;if(s&&t)p.step_pct=Math.round(s/t*100);if(d.stepName)p.step_name=d.stepName;track('funnel_step',p);if(s===1)track('funnel_start',p);if(/^(results|guide|complete)$/.test(d.stepName||''))track('funnel_complete',p);});</script>`
  : "";

/* Warm the ad-delivery connections BEFORE the scripts run. The chain — partner loader
 * (thebesads) -> Google Publisher Tag (securepubads.doubleclick) -> creative (pagead2 /
 * tpc.googlesyndication) — is cold on every pageview: full DNS+TCP+TLS per host before the
 * first impression. On a page-per-step funnel a fast visitor clicks through before that
 * finishes, so we pay for the click and lose the (viewable) impression. preconnect opens
 * those sockets up front; dns-prefetch is the fallback for browsers that ignore preconnect.
 * crossorigin is required — the ad fetches are CORS. Pure latency reduction, no layout change. */
const AD_HOSTS = [
  "https://priceoptimiser1.thebesads.com",
  "https://securepubads.g.doubleclick.net",
  "https://pagead2.googlesyndication.com",
  "https://tpc.googlesyndication.com"
];
const AD_PRECONNECT = AD_HOSTS.map((h) => `<link rel="preconnect" href="${h}" crossorigin>`).join("\n") +
  "\n" + AD_HOSTS.map((h) => `<link rel="dns-prefetch" href="${h}">`).join("\n");

/* ---------- ad slots ----------
 * All placements defined here so the ad map is in one place. Each slot renders as an EMPTY
 * container (a <div> carrying the #id). The Price Optimiser SDK (PARTNER_SCRIPT) attaches a
 * GAM slot to it by #id and fills it — there is NO AdSense <ins> and no second GPT setup.
 * CSS reserves the standard ad height for every slot UP-FRONT (via .ad-reserve) so the ad
 * paints into already-allocated space and never shifts content (Core Web Vitals / CLS). */
const PLACEMENTS = {
  leaderboard:  { id: "ad-leaderboard", size: "970×90 · 728×90 · 320×100 · 320×50", label: "Leaderboard (top)", cls: "s-leaderboard", slot: "leaderboard", reserve: "r-leaderboard" },
  inContent:    { id: "ad-incontent",   size: "300×250 · 336×280",                  label: "In-content",        cls: "s-incontent",   slot: "inContent",   reserve: "r-rect" },
  results:      { id: "ad-results",      size: "300×250 · 336×280",                  label: "Results",           cls: "s-results",     slot: "results",     reserve: "r-rect" },

  /* PENDING PARTNER REGISTRATION — render nothing until SITE.extraAdUnits is turned on.
   * Verified live 2026-08-20: the SDK's configured placement keys are exactly four —
   * `anchor`, `native-leaderboard`, `native-incontent`, `native-results` (it logs
   * "placement element unavailable" for each when the div is missing, and logged NOTHING for a
   * sidebar, so no sidebar unit exists despite an older note claiming one). An id the partner has
   * not registered NEVER fills, and rendering it anyway would leave a reserved empty box in the
   * page — dead space that hurts the read and the layout without earning anything. So these two
   * are defined and positioned in the long guides now, but emit "" until the flag flips.
   *
   * TO ACTIVATE: ask thebesads to register two more in-content placements, set the `id`s below to
   * whatever they register (these names are provisional), then set SITE.extraAdUnits = true. */
  inContent2:   { id: "ad-incontent-2", size: "300×250 · 336×280",                  label: "In-content 2",      cls: "s-incontent",   slot: "inContent2",  reserve: "r-rect", pending: true },
  inContent3:   { id: "ad-incontent-3", size: "300×250 · 336×280",                  label: "In-content 3",      cls: "s-incontent",   slot: "inContent3",  reserve: "r-rect", pending: true }
};

/* Every ad slot is an EMPTY reserved div. The Price Optimiser SDK attaches a GAM slot to it
 * BY #id and owns loading/refresh/lazy-load. We only supply the correct id and a fixed
 * reserved box (via .ad-reserve, see CSS) so the ad paints into already-allocated space and
 * NEVER shifts the page (CLS protection). No <ins>, no adsbygoogle, no second GPT setup. */
function adSlot(kind) {
  const p = PLACEMENTS[kind];
  // A placement the partner has not registered yet emits NOTHING — an unfillable id would only
  // reserve empty space. Call sites can therefore be positioned now and go live with one flag.
  if (p.pending && !SITE.extraAdUnits) return "";
  return `<div class="ad-reserve ${p.reserve}">
  <div class="ad-slot ${p.cls}" id="${p.id}" data-ad-size="${esc(p.size)}"></div>
</div>`;
}

/* Sticky bottom anchor ad — appears on every page (empty until the SDK fills it by #id).
 * CSS pins it to the bottom only once an ad fills it. */
function anchorAd() {
  return `<div class="anchor-slot" id="ad-anchor" data-ad-size="320×50 · 320×100 · 728×90"></div>`;
}

function arrow() { return ` <span class="btn-arrow">${icon("arrow", 20)}</span>`; }

/* Editorial byline + updated date. Trust signal + it keeps a monetized page from reading as a
 * thin doorway (a real author is what ad-network review looks for). */
function byline() {
  return `<div class="byline">
  <span class="byline-av">${icon("users", 16)}</span>
  <span class="byline-txt">By <strong>${esc(SITE.editor)}</strong> · Updated ${esc(BUILD_MONTH)}</span>
</div>`;
}

/* Breadcrumb trail (nav + light SEO signal) for the funnel steps. */
function breadcrumb(trail) {
  const parts = trail.map((t, i) => {
    const last = i === trail.length - 1;
    return last
      ? `<span aria-current="page">${esc(t.label)}</span>`
      : `<a href="${esc(t.href)}">${esc(t.label)}</a><span class="bc-sep">${icon("chevron", 14)}</span>`;
  }).join("");
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${parts}</nav>`;
}

/* Advertising + affiliate disclosure (FTC / ad-policy compliant — see CLAUDE.md Fight 2).
 * Truthful, non-affiliation, "estimates from public sources" — no invented stats. */
/* The short trust line that sits above the disclaimer block. */
function disclosure() {
  return `<p class="disclosure">${SITE.name} is a free job-discovery guide. We are an independent
  publisher and are <strong>not affiliated with, endorsed by, or a recruiter for</strong> the
  employers featured. Openings and pay are estimates gathered from public sources and vary by
  location and employer.</p>`;
}

/* ----------------------------------------------------------------------------
 * SITE DISCLAIMER — footer of every page (root CLAUDE.md §5).
 *
 * Written for THIS site, not copied between properties. In the jobs vertical the lines that
 * earn their place are the ones about what we are not and about money: job-seekers are the
 * target of a large amount of fraud, and "we never ask you for payment" is both true here and
 * the most useful sentence on the page for someone who has just been asked for money elsewhere.
 *
 * NOTE the commission line that used to be in disclosure() is gone, and nothing replaced it in
 * either direction. Every outbound link goes straight to the employer's own careers site
 * (careers.walmart.com, careers.fedex.com, careers.mcdonalds.com ...) with no affiliate or
 * tracking parameter, so there is no commercial relationship to disclose — and the cleanest
 * thing is not to raise the subject. Do not reintroduce a commission line in either direction
 * unless the links actually change. See root CLAUDE.md §5.
 * -------------------------------------------------------------------------- */
const DISCLAIMER = [
  `${SITE.name} is an independent guide. We are <strong>not an employer, a recruiter, or an employment agency</strong>, and we do not accept, process or forward job applications.`,
  `We are not affiliated with, endorsed by, or acting on behalf of any employer named on this site. All company names, logos and trademarks are the property of their respective owners.`,
  `<strong>We never charge for a job, and we will never ask you for payment, bank details, or identity documents.</strong> No legitimate employer asks a candidate to pay to be hired.`,
  `Job titles, openings and pay figures are estimates compiled from public sources. They change constantly and vary by employer and location — always confirm on the employer's own site.`,
  `Applying is done entirely on the employer's or job board's own website. We do not see or store anything you submit there.`,
  `This site is supported by advertising.`,
  `External links are provided for convenience only; we are not responsible for third-party content, hiring decisions or practices.`,
  `Corrections and takedown requests are welcome — see the About page.`
];

function disclaimerBlock() {
  return `<div class="site-disclaimer">
  <h2>Disclaimer</h2>
  <ul>
${DISCLAIMER.map((l) => `    <li>${l}</li>`).join("\n")}
  </ul>
</div>`;
}

/* ---------- page shell ----------
 * lang/dir/foot/alternates exist for the MULTI-LANGUAGE /me/ funnel (Saudi Arabia): a page can
 * declare its own <html lang dir>, ship a TRANSLATED footer (disclosure + disclaimer + links —
 * root §5 requires the disclaimer to be readable by the visitor, so an Arabic page must not carry
 * an English one), and emit hreflang alternates. Everything defaults to the English shell, so no
 * existing page changes. bodyAttrs feeds the GA4 auto funnel_step helper in ANALYTICS_SCRIPT. */
function page({ title, desc, body, pageScript, canonical, wide, hideHeader, noindex, hideAnchor,
                lang, dir, foot, alternates, bodyAttrs, prefetch }) {
  // Thin/interstitial funnel steps (the "matching…" wait, JS-rendered results, chat) are noindex
  // so a "please wait" page never lands in Google's index = thin-content/doorway risk. A noindex
  // page also drops its canonical (nothing to canonicalize an unindexed URL to).
  const canon = !noindex && canonical && SITE.domain
    ? `<link rel="canonical" href="https://${esc(SITE.domain)}${esc(canonical)}">` : "";
  const robots = noindex ? `\n<meta name="robots" content="noindex">` : "";
  // hreflang cluster (only meaningful on indexable pages — an unindexed URL has nothing to pair).
  const alts = !noindex && alternates && SITE.domain
    ? "\n" + alternates.map((a) => `<link rel="alternate" hreflang="${esc(a.hreflang)}" href="https://${esc(SITE.domain)}${esc(a.href)}">`).join("\n")
    : "";
  // Warm the NEXT page while the visitor is still on this one. On a modal funnel the payoff guide
  // (the rewarded-ad target) is a full navigation away, so its ad divs can't exist until it loads.
  // Prefetching its document during the quiz puts the guide's HTML in cache, so the moment the
  // rewarded completes and we navigate, the guide paints and its ad slots are present immediately —
  // the SDK starts filling them a round-trip sooner. Low priority, and these landers carry no
  // display ads of their own, so it never competes for the ad sockets (root §5 / §2, speed=revenue).
  const pre = prefetch ? `\n<link rel="prefetch" href="${esc(prefetch)}" as="document">` : "";
  // The home page carries the brand in its hero, so it skips the top logo bar (no double branding).
  const header = hideHeader ? "" : `<header class="site-head">${logo()}</header>`;
  const footBlock = foot || `  ${disclosure()}
  ${disclaimerBlock()}
  <p class="foot-links"><a href="${B}">All Jobs</a> · <a href="${B}about/">About</a></p>`;
  return `<!DOCTYPE html>
<html lang="${esc(lang || "en")}"${dir === "rtl" ? ` dir="rtl"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc || title)}">${robots}
${canon}${alts}${pre}
${AD_PRECONNECT}
<link rel="stylesheet" href="${B}assets/styles.css">
${PARTNER_SCRIPT}
${ANALYTICS_SCRIPT}
</head>
<body${bodyAttrs ? " " + bodyAttrs : ""}>
${header}
<main class="wrap${wide ? " wide" : ""}">
${body}
<footer class="foot">
${footBlock}
</footer>
</main>
${hideAnchor ? "" : anchorAd()}
<script src="${B}assets/jobs.js"></script>
${pageScript ? `<script>${pageScript}</script>` : ""}
</body>
</html>`;
}

/* ---------- funnel step header (progress = momentum, honest labels) ---------- */
function stepHead(step, label) {
  const steps = ["Overview", "Open Roles", "Apply"];
  const dots = steps.map((s, i) =>
    `<span class="step-dot ${i + 1 === step ? "on" : ""} ${i + 1 < step ? "done" : ""}">${i + 1 < step ? icon("check", 14) : (i + 1)}</span>`
  ).join('<span class="step-line"></span>');
  return `<div class="stepper" aria-label="Step ${step} of 3">
  <div class="step-track">${dots}</div>
  <div class="step-label">${esc(label)}</div>
</div>`;
}

/* ---------- property card (home + cross-recommendations) ---------- */
function propThumb(p, i) {
  if (p.image && p.image.src) {
    const src = /^https?:/.test(p.image.src) ? p.image.src : B + p.image.src;
    return `<img class="card-thumb" src="${esc(src)}" alt="${esc(p.image.alt || propLabel(p))}" loading="lazy" width="${p.image.w || 800}" height="${p.image.h || 600}">`;
  }
  return `<span class="card-thumb">${bannerSVG("thumb-" + p.id, i || 0, propLabel(p), p.icon || "briefcase")}</span>`;
}
// Big hero banner: licensed photo if present, else the generated brand banner.
function heroBannerInner(p, i) {
  if (p.logo && p.logo.src) {
    const src = /^https?:/.test(p.logo.src) ? p.logo.src : B + p.logo.src;
    return `<span class="hero-logo"><img src="${esc(src)}" alt="${esc(p.logo.alt || propLabel(p) + " logo")}"></span>`;
  }
  if (p.image && p.image.src) {
    const src = /^https?:/.test(p.image.src) ? p.image.src : B + p.image.src;
    return `<img src="${esc(src)}" alt="${esc(p.image.alt || propLabel(p))}" width="${p.image.w || 800}" height="${p.image.h || 600}">`;
  }
  return bannerSVG("hero-" + p.id, i, propLabel(p), p.icon || "briefcase");
}

// Which intake job-type ids (Q1) does this property satisfy? ("any" always matches.)
function catsForProp(p) {
  return INTAKE.questions[0].options.filter((o) => (o.match || []).includes(p.id)).map((o) => o.id);
}
function propCard(p, i) {
  const kicker = p.type === "employer" ? "Now Hiring" : "Roles Near You";
  const pay = p.hero && p.hero.pay ? p.hero.pay : "";
  const searchText = [propLabel(p), p.title, (p.searchTerms || []).join(" "), (p.roles || []).map((r) => typeof r === "string" ? r : r.title).join(" ")].join(" ").toLowerCase();
  const cats = catsForProp(p).concat("any").join(" ");
  const openings = p.hero && p.hero.openings ? p.hero.openings : "";
  const hasLogo = p.logo && p.logo.src;
  const logoSrc = hasLogo ? (/^https?:/.test(p.logo.src) ? p.logo.src : B + p.logo.src) : "";
  const thumbHtml = hasLogo
    ? `<span class="card-thumb logo-thumb"><img class="brand-logo" src="${esc(logoSrc)}" alt="${esc(p.logo.alt || propLabel(p) + " logo")}" loading="lazy"></span>`
    : propThumb(p, i);
  const overlayChips = hasLogo ? "" :
    `<span class="card-scrim"></span>
    <span class="card-logo">${icon(p.icon || "briefcase", 22)}<span class="card-mono">${esc(initials(propLabel(p)))}</span></span>`;
  return `<a class="job-card" href="${propBase(p)}" data-search="${esc(searchText)}" data-cat="${esc(cats)}">
  <span class="card-thumb-wrap${hasLogo ? " is-logo" : ""}">
    ${thumbHtml}
    ${overlayChips}
    <span class="card-badge"><span class="pulse"></span>${esc(kicker)}</span>
    ${pay ? `<span class="card-pay">${esc(pay)}</span>` : ""}
  </span>
  <span class="job-card-body">
    <span class="job-card-title">${esc(p.title)}</span>
    <span class="job-card-meta">${openings ? `<span class="jm">${icon("briefcase", 14)} ${esc(openings)}</span>` : ""}<span class="job-card-cta">View openings ${icon("arrow", 16)}</span></span>
  </span>
</a>`;
}

/* ---------- shared content blocks ---------- */
function heroStats(p) {
  const h = p.hero || {};
  const cells = [
    h.openings ? { ic: "briefcase", k: "Openings", v: h.openings } : null,
    h.pay      ? { ic: "dollar",    k: "Pay",      v: h.pay } : null,
    h.type     ? { ic: "clock",     k: "Schedule", v: h.type } : null,
    h.location ? { ic: "pin",       k: "Where",    v: h.location } : null
  ].filter(Boolean);
  if (!cells.length) return "";
  return `<div class="stat-grid">
${cells.map((c) => `  <div class="stat">
    <span class="stat-ic">${icon(c.ic, 20)}</span>
    <span class="stat-v">${esc(c.v)}</span>
    <span class="stat-k">${esc(c.k)}</span>
  </div>`).join("\n")}
</div>`;
}

function sectionsHTML(sections) {
  return (sections || []).map((s) => {
    const bullets = (s.bullets && s.bullets.length)
      ? `<ul class="ticks">${s.bullets.map((b) => `<li>${icon("check", 18)}<span>${esc(b)}</span></li>`).join("")}</ul>`
      : "";
    const para = s.p ? `<p>${esc(s.p)}</p>` : "";
    return `<section class="content-block">
  <h2>${esc(s.h)}</h2>
  ${para}
  ${bullets}
</section>`;
  }).join("\n");
}

function rolesHTML(roles, nextUrl) {
  if (!roles || !roles.length) return "";
  const items = roles.map((r) => {
    const title = typeof r === "string" ? r : r.title;
    const pay = typeof r === "object" && r.pay ? `<span class="role-pay">${esc(r.pay)}</span>` : "";
    return `<a class="role-row" href="${esc(nextUrl)}">
    <span class="role-ic">${icon("briefcase", 18)}</span>
    <span class="role-main"><span class="role-title">${esc(title)}</span>${pay}</span>
    <span class="role-go">${icon("chevron", 18)}</span>
  </a>`;
  }).join("\n");
  return `<div class="role-list">${items}</div>`;
}

function faqHTML(faqs) {
  if (!faqs || !faqs.length) return "";
  const items = faqs.map((f) =>
    `<details class="faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n");
  return `<section class="content-block"><h2>Common questions</h2>${items}</section>`;
}

function stepsHTML(steps) {
  if (!steps || !steps.length) return "";
  const items = steps.map((s, i) =>
    `<li><span class="step-num">${i + 1}</span><span>${esc(s)}</span></li>`).join("\n");
  return `<section class="content-block"><h2>How to apply</h2><ol class="how-steps">${items}</ol></section>`;
}

function ctaButton(href, label) {
  return `<a class="btn" href="${esc(href)}">${esc(label)}${arrow()}</a>`;
}

/* Trust row — credibility signals (true by construction, no invented stats). */
function trustRow() {
  const items = [
    { ic: "shield", t: "Free to use" },
    { ic: "check", t: "Apply on official sites" },
    { ic: "calendar", t: `Updated ${BUILD_MONTH}` }
  ];
  return `<div class="trust-row">
${items.map((x) => `  <span class="trust-item">${icon(x.ic, 16)} ${esc(x.t)}</span>`).join("\n")}
</div>`;
}

function recCards(p, byId) {
  const recs = (p.recommendations || [])
    .filter((rid) => byId[rid] && rid !== p.id)
    .map((rid) => byId[rid]);
  if (!recs.length) return "";
  return `<section class="content-block">
  <h2>More jobs hiring now</h2>
  <div class="job-cards">
${recs.map((r, i) => propCard(r, i)).join("\n")}
  </div>
</section>`;
}

/* ============================================================================
 * STEP 1 — advertorial landing
 * ==========================================================================*/
function buildLanding(p, byId, i) {
  const base = propBase(p);
  const openingsUrl = base + "openings/";
  const kicker = p.type === "employer" ? `${propLabel(p)} Careers` : "Hiring Now";

  const ctaLabel = p.type === "employer" ? "See Open Roles" : "See Jobs Near You";
  const micro = `<p class="micro">${icon("shield", 14)} Free to browse · Apply on the official site</p>`;
  // A brand logo (employer pages) is a small inline lockup, NOT a giant banner — a logo on a
  // gradient panel is low-value chrome that pushes the title, stats, CTA and first ad below the
  // fold. The generated SVG banner (category pages, no logo) still gets the visual hero. This
  // lifts the money elements up and lets the copy breathe.
  const hero = p.logo && p.logo.src
    ? `<article class="hero-card logo-hero">
  <div class="hero-body">
    <div class="brand-lockup">
      <span class="brand-logo-sm">${heroBannerInner(p, i)}</span>
      <span class="kicker">${icon(p.icon || "briefcase", 16)} ${esc(kicker)}</span>
    </div>
    <h1>${esc(p.title)}</h1>
    ${byline()}
    <p class="lead">${esc(p.subtitle)}</p>
    ${heroStats(p)}
    ${ctaButton(openingsUrl, ctaLabel)}
    ${micro}
  </div>
</article>`
    : `<article class="hero-card">
  <figure class="hero-banner">${heroBannerInner(p, i)}${p.image && p.image.credit ? `<figcaption class="img-credit">${esc(p.image.credit)}</figcaption>` : ""}</figure>
  <div class="hero-body">
    <span class="kicker">${icon(p.icon || "briefcase", 16)} ${esc(kicker)}</span>
    <h1>${esc(p.title)}</h1>
    ${byline()}
    <p class="lead">${esc(p.subtitle)}</p>
    ${heroStats(p)}
    ${ctaButton(openingsUrl, ctaLabel)}
    ${micro}
  </div>
</article>`;

  const body = `${hero}

${adSlot("leaderboard")}

${p.intro ? `<section class="content-block intro"><p>${esc(p.intro)}</p></section>` : ""}

${sectionsHTML((p.sections || []).slice(0, 2))}

${adSlot("inContent")}

${sectionsHTML((p.sections || []).slice(2))}

${stepsHTML(p.steps)}

<section class="content-block">
  <h2>${p.type === "employer" ? "Popular roles" : "Popular searches"}</h2>
  ${rolesHTML(p.roles, openingsUrl)}
</section>

<div class="cta-band">
  <p>${esc(p.ctaLine || "Openings fill fast. See what's available near you today.")}</p>
  ${ctaButton(openingsUrl, "See Open Roles")}
</div>

${faqHTML(p.faqs)}

${adSlot("results")}

${recCards(p, byId)}`;

  write(`${propDir(p)}/index.html`, page({
    title: `${p.title} | ${SITE.name}`,
    desc: p.subtitle,
    canonical: base,
    body
  }));
}

/* ============================================================================
 * STEP 2 — openings / open-roles page (roles + display/native ads)
 * ==========================================================================*/
function buildOpenings(p, byId, i) {
  const base = propBase(p);
  const applyUrl = base + "apply/";
  const label = propLabel(p);

  const body = `${breadcrumb([{ label: "Home", href: B }, { label: label, href: base }, { label: "Open Roles" }])}
${stepHead(2, `Open roles — ${label}`)}

${adSlot("leaderboard")}

<section class="content-block tight">
  <h2>${p.type === "employer" ? `Roles hiring at ${esc(label)}` : `${esc(label)} near you`}</h2>
  <p class="lead">${esc(p.openingsLead || "Tap a role or a popular search below to see current openings and apply on the official site.")}</p>
</section>

${adSlot("inContent")}

<h3 class="rs-head">${icon("briefcase", 18)} Open roles</h3>
${rolesHTML(p.roles, applyUrl)}

<div class="cta-band">
  <p>Ready to apply? We'll send you to the official application page.</p>
  ${ctaButton(applyUrl, "Continue to Apply")}
</div>

${adSlot("results")}

${recCards(p, byId)}`;

  write(`${propDir(p)}/openings/index.html`, page({
    title: `${label} Openings — Apply Now | ${SITE.name}`,
    desc: `Browse current ${label} openings and popular searches, then apply on the official site.`,
    canonical: base + "openings/",
    body
  }));
}

/* ============================================================================
 * STEP 3 — apply / redirect page (ad + outbound to a real job board)
 * ==========================================================================*/
function buildApply(p, byId, i) {
  const base = propBase(p);
  const label = propLabel(p);
  const out = p.applyUrl || "";
  const host = out ? out.replace(/^https?:\/\//, "").split("/")[0] : "the careers site";

  // Natural phrasing per type: category labels already end in "Jobs" (avoid "Jobs jobs"),
  // and employer outbound is an official careers site vs. a category board (indeed etc.).
  const headline = p.type === "employer" ? `You're being connected to ${label} jobs` : `You're being connected to ${label}`;
  const btnLabel = p.type === "employer" ? `Continue to ${label} Jobs` : `Continue to ${label}`;
  const dest = p.type === "employer"
    ? `the official ${label} careers site (<strong>${esc(host)}</strong>)`
    : `a trusted job board (<strong>${esc(host)}</strong>)`;

  const body = `${breadcrumb([{ label: "Home", href: B }, { label: label, href: base }, { label: "Open Roles", href: base + "openings/" }, { label: "Apply" }])}
${stepHead(3, `Apply — ${label}`)}

<div class="card center redirect-card">
  <span class="hero-icon">${icon("briefcase", 40)}</span>
  <h1>${esc(headline)}</h1>
  <p class="lead">We'll open ${dest} so you can apply directly. It's free.</p>
  <a class="btn" id="go-btn" href="${esc(out || "#")}" target="_blank" rel="nofollow noopener sponsored">${esc(btnLabel)}${arrow()}</a>
  <p class="micro" id="go-note">${icon("shield", 14)} You'll be redirected to an external site</p>
</div>

${adSlot("results")}

${recCards(p, byId)}

${adSlot("inContent")}`;

  // Category labels already end in "Jobs"; only employers need the suffix appended.
  const titleLabel = p.type === "employer" ? `${label} Jobs` : label;
  write(`${propDir(p)}/apply/index.html`, page({
    title: `Apply for ${titleLabel} | ${SITE.name}`,
    desc: `Apply for ${titleLabel} on the ${p.type === "employer" ? "official careers site" : "job board"}.`,
    canonical: base + "apply/",
    body,
    pageScript: `Jobs.initApply({ url: ${JSON.stringify(out)} });`
  }));
}

/* ---------- native in-feed ad ----------
 * Reuses an EXISTING ad unit (the in-content placement) and drops it INSIDE the job-card grid,
 * styled to match a real job card so it flows natively (native in-feed earns more than a boxed
 * rectangle, and reusing the unit means NO extra ad / lower density). It carries only a small
 * "Ad" chip in the corner — the smallest compliant label. COMPLIANCE (Google Publisher Policy /
 * FTC): a native ad MUST stay labelled + distinguishable; we intentionally keep the "Ad" chip and
 * never ship it fully unlabelled, because a disguised ad = policy strike + invalid-traffic
 * clawback + account ban. Empty reserved div; the Price Optimiser SDK fills it by #id. */
function nativeAdCard(placement) {
  return `<div class="native-card" role="complementary" aria-label="Advertisement">
  <span class="native-tag">Ad</span>
  <div class="ad-slot" id="${esc(placement.id)}" data-ad-size="${esc(placement.size)}"></div>
</div>`;
}

/* Render a job-card grid with the given ad `placement` slotted in-feed (after the 3rd card, or
 * last if the grid is shorter). `placement` omitted => a plain grid. The page must NOT also
 * render this placement as a standalone slot (one #id per page). */
function cardGrid(list, placement) {
  const cards = list.map((p, i) => propCard(p, i));
  if (placement && cards.length >= 2) cards.splice(Math.min(3, cards.length), 0, nativeAdCard(placement));
  return cards.join("\n");
}

/* ---------- home ---------- */
function buildHome(props) {
  const employers = props.filter((p) => p.type === "employer");
  const categories = props.filter((p) => p.type === "category");
  const section = (heading, list, placement) => list.length ? `<section class="content-block">
  <h2>${esc(heading)}</h2>
  <div class="job-cards">
${cardGrid(list, placement)}
  </div>
</section>` : "";

  const body = `<section class="hero-card home-hero">
  <div class="hero-body">
    <span class="hero-brand">
      <span class="hero-brand-badge">${logoMark()}</span>
      <span class="hero-brand-name">${esc(SITE.name)}</span>
    </span>
    <h1>Find a job hiring near you</h1>
    <p class="lead">Answer a few quick questions and we'll match you with companies hiring right now — then you apply on their official site. Free, no sign-up.</p>
    <div class="hero-ctas">
      <a class="btn" href="${B}find/1/">Find my job${arrow()}</a>
      <a class="btn ghost" href="${B}chat/">${icon("users", 18)} Chat to find jobs</a>
    </div>
    <p class="micro center light">${icon("clock", 14)} Takes about 30 seconds</p>
  </div>
</section>

${trustRow()}

<div class="home-search">
  <span class="home-search-ic">${icon("search", 20)}</span>
  <input type="search" id="job-search" placeholder="Or search — e.g. warehouse, driver, remote" aria-label="Search jobs" autocomplete="off">
</div>
<p class="no-results" id="no-results" hidden>No matches — try a broader term like "warehouse" or "remote".</p>

<nav class="quick-links" aria-label="Popular job searches">
  <span class="quick-links-label">Popular right now:</span>
  <a href="${B}usa/">USA jobs hiring now</a>
  <a href="${B}remote/">Remote &amp; work-from-home</a>
  <a href="${B}remote-jobs-worldwide/">Remote jobs from any country</a>
  <a href="${B}remote-jobs-worldwide/south-africa/">Remote jobs from South Africa</a>
  <a href="${B}usa-packing-jobs/">Packing jobs from home</a>
  <a href="${B}packing-jobs/">Packing jobs worldwide</a>
  <a href="${B}me/">Jobs in Saudi Arabia</a>
</nav>

${adSlot("leaderboard")}

${section("Companies hiring now", employers, PLACEMENTS.inContent)}

${section("Jobs by category", categories, PLACEMENTS.results)}`;

  write("index.html", page({
    title: `${SITE.name} — ${SITE.tagline}`,
    desc: "Answer a few quick questions and get matched with companies hiring near you. Free, no sign-up.",
    canonical: B,
    body,
    wide: true,
    hideHeader: true,
    pageScript: `Jobs.initHomeSearch();`
  }));
}

/* ---------- about page (trust + disclosure; helps ad-network review) ---------- */
function buildAbout() {
  const body = `<section class="content-block">
  <h1>About ${esc(SITE.name)}</h1>
  <p>${esc(SITE.name)} is a free job-discovery guide that helps people find companies and roles
  hiring near them. For each employer and category we summarize what's typically available —
  openings, pay ranges, schedules, and how to apply — and then link you to the official careers
  page or a reputable job board so you can apply directly.</p>
  <h2>How we make money</h2>
  <p>The site is free for you to use. We earn revenue from advertising shown on our pages and,
  in some cases, a commission when you visit a partner job board. This never changes what it
  costs you to apply — applying on the official site is always free.</p>
  <h2>Independence</h2>
  <p>We are an independent publisher. We are <strong>not affiliated with, endorsed by, or a
  recruiter for</strong> any of the employers featured, and we do not collect applications
  ourselves. Openings and pay figures are estimates gathered from public sources and vary by
  location and employer.</p>
</section>

${adSlot("inContent")}`;
  write("about/index.html", page({
    title: `About | ${SITE.name}`,
    desc: `About ${SITE.name} — a free job-discovery guide.`,
    canonical: B + "about/",
    body
  }));
}

/* ---------- OUTSTREAM VIDEO TEST PAGE -> dist/test-video-ad/ (noindex, out of the sitemap) ----------
 * A test surface (root §7 experimentation) to trial the partner's OUTSTREAM (IMA) VIDEO unit before
 * wiring it into real funnels. Native display clears a low CPM; an outstream video unit typically
 * clears much higher, so we test whether it FILLS and what it earns first.
 *
 * IMPLEMENTED PER THE PARTNER SKILL `ad-skills/videoadsskill` (jobguidematch-price-optimiser,
 * references/outstream-publisher.md), which supersedes the earlier hand-rolled `#po-outstream-slot`
 * floating box. The contract is now:
 *   - PLACEMENT: one mount `<div data-po-outstream>` with responsive 4:3 space reserved (validated
 *     request sizes 400x300 / 640x480). Publisher reserves space ONLY — the SDK builds the IMA player,
 *     the mute/play/skip controls and the close (X) inside the mount. We do NOT hand-roll a shell,
 *     label, close button, video element, GAM tag or VAST — that is all SDK-owned.
 *   - TIMING: publisher drives it via `PublisherExperienceSDK.jobGuideMatch.outstream` →
 *     `prepare()` (issues the GAM/IMA request, no visible playback) then `show()` once the mount is
 *     >=50% visible (SDK visibility gate). `cancel()`/`getState()` round it out. One-shot: never loop
 *     `prepare()`, never create a second auction at `show()`, never add a refresh timer (server-owned).
 *   - Fail-open: if the SDK/outstream API is absent or no-fills, the page just continues.
 * Unit `/23360556473/priceoptimiser_outstream_test` (a TEST unit — experiment 100% control/unpriced),
 * prepared-TTL 45s. If it stays empty on the LIVE host that's a partner-registration/demand item, not
 * a page bug (see the fill-diagnosis note). `hideAnchor` so the bottom anchor doesn't fight the mount.
 * This page includes a small on-page test harness (state readout + Prepare/Show/Cancel + a log) so the
 * lifecycle can be verified on a real device. */
function buildTestVideoAd() {
  const body = `<article class="content-block">
  <h1>Warehouse &amp; Delivery Jobs: What to Expect and How to Apply</h1>
  ${byline()}
  <p class="lead">Warehouse, packing and delivery roles are some of the most consistently
  advertised jobs in the country. This guide walks through the day-to-day of the work, the pay
  ranges commonly advertised, the shifts on offer, and the reputable places to apply — so you can
  decide whether it's a fit before you fill in a single form.</p>

  <section class="ov-panel" aria-label="Outstream video test harness">
    <h2 class="ov-h">Outstream video — test harness</h2>
    <p class="ov-note">Internal test of the Price Optimiser outstream (IMA) video unit
    (<code>priceoptimiser_outstream_test</code>). The player, controls and close (X) are built by
    the SDK in the floating window (bottom-right); this page only positions it and drives prepare/show.</p>
    <p class="ov-statep">SDK state: <b id="ov-state">loading…</b></p>
    <div class="ov-row">
      <button id="ov-prepare" type="button">Prepare</button>
      <button id="ov-show" type="button">Show</button>
      <button id="ov-cancel" type="button">Cancel</button>
    </div>
    <pre class="ov-log" id="ov-log" aria-live="polite"></pre>
  </section>

  <div class="ov-mount" data-po-outstream id="ov-mount"></div>

  <h2>The roles that hire most often</h2>
  <p>Fulfillment centres, sortation hubs and last-mile delivery depots run year-round and staff up
  heavily around peak seasons. The most commonly advertised roles are warehouse associate (picking,
  packing and stowing), sortation associate, forklift/reach-truck operator, and delivery driver.
  Most are entry-level and advertised as "no experience needed" — the employer trains on site.</p>
  <p>Schedules vary widely. Many sites run four-day weeks, overnight and weekend shifts, and
  part-time blocks that fit around school or a second job. If flexibility matters to you, filter for
  "part-time" or "flexible shift" on the boards below — those tags are common in this category.</p>

  <h2>Pay, honestly framed</h2>
  <p>Hourly pay in this category is commonly advertised in a band that varies by employer, region
  and shift, with overnight and weekend hours often carrying a premium. Pay figures move constantly,
  so treat any range you see as a starting point and confirm the exact number on the employer's own
  posting before you apply — that is always where the real figure lives.</p>

  <h2>How to apply the right way</h2>
  <p>Apply directly on the employer's official careers site or through a reputable national job
  board. A genuine employer never charges you to apply, never asks for bank details or identity
  documents up front, and never requires payment for "training kits" or "starter packs". If any of
  that comes up, walk away — it is the clearest sign of a scam in this niche.</p>
  <ol class="tv-steps">
    <li>Search a reputable board (Indeed, LinkedIn, Snagajob) for the role and your area.</li>
    <li>Open the posting on the <strong>employer's own site</strong> and read the real requirements.</li>
    <li>Prepare a short, honest application — dates you can work and any equipment you can operate.</li>
    <li>Apply directly. Never pay, and never send documents before an interview.</li>
  </ol>

  <h2>Common questions</h2>
  <p><strong>Do I need experience?</strong> Usually not for associate and sortation roles — training
  is on site. Driving roles may need a clean licence and, for larger vehicles, the right class.</p>
  <p><strong>Are there part-time options?</strong> Yes — part-time and flexible shifts are common in
  this category, especially around peak seasons.</p>
  <p><strong>How fast is hiring?</strong> Peak-season hiring can move within days, but timelines vary
  by employer and location. The official posting is the only reliable source.</p>

  <p>Ready to look? Head to our <a href="${B}usa/remote-jobs/" data-po-no-intercept>jobs guide</a>
  for reputable boards and employers to search next.</p>
</article>

<style>
/* FLOATING outstream window — fixed bottom-right, compact and dismissible. The SDK builds the IMA
   player + controls + close (X) INSIDE the mount; publisher only positions + sizes it. Kept small
   (<=300px, ~30vw desktop; smaller on phones) so it never covers the content, at 4:3 (request sizes
   400x300 / 640x480; physical render is smaller responsively). CRITICAL: it must stay geometrically
   ON-SCREEN even while empty so the SDK's >=50% visibility gate can pass and show() — so instead of
   display:none we keep it present but TRANSPARENT + click-through while empty (no blank box floats),
   and paint the frame only once the SDK injects a player (mount non-empty). The SDK's close (X)
   collapses the shell (empties the mount), which returns it to the invisible state. */
.ov-mount {
  position: fixed; right: 16px; bottom: 16px; z-index: 55;
  width: clamp(180px, 30vw, 300px); aspect-ratio: 4 / 3;
  border-radius: 12px; overflow: hidden;
}
.ov-mount:empty { pointer-events: none; }                 /* invisible + click-through until filled */
.ov-mount:not(:empty) {
  background: #000; border: 1px solid rgba(0,0,0,.16); box-shadow: 0 10px 30px rgba(0,0,0,.28);
}
.ov-mount img, .ov-mount video, .ov-mount iframe { width: 100%; height: 100%; max-width: 100%; max-height: 100%; }
@media (max-width: 480px) { .ov-mount { right: 10px; bottom: 10px; width: clamp(160px, 46vw, 240px); } }
/* Test-harness panel (not part of the ad — internal verification UI). */
.ov-panel { max-width: 640px; margin: 20px auto; padding: 14px 16px; border: 1px solid #e5e7eb;
  border-radius: 12px; background: #fafafa; }
.ov-panel .ov-h { margin: 0 0 8px; font-size: 16px; }
.ov-note { margin: 0 0 10px; font-size: 12.5px; line-height: 1.5; color: #6b7280; }
.ov-note code, .ov-statep code { background: rgba(0,0,0,.06); padding: 1px 6px; border-radius: 5px; font-size: 12px; }
.ov-statep { margin: 0 0 10px; font-size: 13px; color: #374151; }
.ov-statep b { color: #111; }
.ov-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 10px; }
.ov-row button { appearance: none; border: 1px solid #cbd5e1; background: #fff; border-radius: 8px;
  padding: 9px 16px; font: inherit; font-weight: 600; cursor: pointer; min-height: 40px; }
.ov-row button:hover { border-color: #94a3b8; }
.ov-log { margin: 0; padding: 10px; height: 150px; overflow: auto; background: #0f172a; color: #cbd5e1;
  border-radius: 8px; font: 12px/1.5 ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; }
</style>`;

  // Publisher-driven outstream lifecycle per the partner skill: resolve
  // PublisherExperienceSDK.jobGuideMatch.outstream, then prepare() -> show() once the mount is >=50%
  // visible. Manual Prepare/Show/Cancel buttons + a live getState() readout + a log make the lifecycle
  // verifiable on a real device. No GAM/VAST/IMA is created here (SDK-owned); no refresh timer; the
  // auto-run is one-shot (prepare once, poll getState briefly for prepared+visible, show once); fail-open.
  const pageScript = `(function(){
var LOG=document.getElementById('ov-log'),STATE=document.getElementById('ov-state'),mount=document.querySelector('[data-po-outstream]');
/* Hoist the floating mount to <body>: main.wrap has a page-in transform (animation ... both) that
   establishes a containing block, so a position:fixed child would anchor to that tall element, not the
   viewport. Moving it to <body> fixes it to the viewport (same fix the intake modal uses). */
if(mount&&mount.parentNode!==document.body){try{document.body.appendChild(mount);}catch(e){}}
function log(m){try{if(window.console)console.debug('[outstream]',m);}catch(e){}if(LOG){LOG.textContent+=m+'\\n';LOG.scrollTop=LOG.scrollHeight;}}
function rstate(os){try{var s=os&&os.getState?os.getState():null;if(s&&typeof s==='object')return s.state||JSON.stringify(s);return s==null?'(no getState)':String(s);}catch(e){return '(getState error)';}}
function resolve(){var roots=[window.PublisherExperienceSDK,window.PublisherExperience,window.PriceOptimiserExperience];for(var i=0;i<roots.length;i++){var s=roots[i];if(!s)continue;if(s.outstream&&typeof s.outstream.prepare==='function')return s.outstream;var named=[s.jobGuideMatch,s['jobguidematch.com'],s.jobguidematch,s.publisher,s.site,s.current];for(var j=0;j<named.length;j++){var n=named[j];if(n&&n.outstream&&typeof n.outstream.prepare==='function')return n.outstream;}for(var k in s){try{var v=s[k];if(v&&v.outstream&&typeof v.outstream.prepare==='function')return v.outstream;}catch(e){}}}return null;}
function visible(el){if(!el)return false;var r=el.getBoundingClientRect(),vh=window.innerHeight||0;if(r.height<=0)return false;var vis=Math.min(r.bottom,vh)-Math.max(r.top,0);return vis>=r.height*0.5;}
var os=null,shown=false;
function doPrepare(){if(!os)return Promise.resolve(false);var st=rstate(os);if(st==='preparing'||st==='prepared'||st==='showing'){log('prepare skipped (state='+st+')');return Promise.resolve(true);}log('prepare() ...');return Promise.resolve(os.prepare()).then(function(){log('prepare() ok. state='+rstate(os));return true;},function(e){log('prepare() failed: '+e);return false;});}
function doShow(){if(!os||shown)return;if(!visible(mount)){log('show() deferred - mount not >=50% visible');return;}shown=true;log('show() ...');Promise.resolve(os.show()).then(function(){log('show() ok. state='+rstate(os));},function(e){shown=false;log('show() failed: '+e);});}
function autoRun(){doPrepare().then(function(ok){if(!ok)return;var n=0;(function until(){if(shown)return;var st=rstate(os);if(st==='prepared'&&visible(mount)){doShow();return;}if(++n<60){setTimeout(until,250);return;}log('auto-show gave up (state='+st+', visible='+visible(mount)+') - use the Show button.');})();});}
var tries=0;(function wait(){os=resolve();if(os){log('outstream API ready. state='+rstate(os));if(STATE)STATE.textContent=rstate(os);var p=document.getElementById('ov-prepare'),s=document.getElementById('ov-show'),c=document.getElementById('ov-cancel');if(p)p.onclick=function(){doPrepare();};if(s)s.onclick=function(){shown=false;doShow();};if(c)c.onclick=function(){try{os.cancel&&os.cancel();shown=false;log('cancel()');}catch(e){log('cancel failed: '+e);}};setInterval(function(){if(STATE)STATE.textContent=rstate(os);},1000);autoRun();return;}if(++tries<50){setTimeout(wait,200);return;}log('outstream API not found after ~10s - page continues normally.');if(STATE)STATE.textContent='unavailable';})();
})();`;

  write("test-video-ad/index.html", page({
    title: `Warehouse & Delivery Jobs Guide | ${SITE.name}`,
    desc: `A test guide page trialling an outstream video ad unit.`,
    noindex: true,
    hideAnchor: true,
    pageScript,
    body
  }));
}

/* ---------- ads.txt (authorized digital sellers — required for GAM/AdSense payout) ----------
 * Declares Google as an authorized seller of this domain's inventory. Same Google publisher
 * ID for GAM and AdSense. Missing/wrong ads.txt = buyers treat our impressions as unauthorized
 * = revenue suppressed. Must sit at the web root (served as /ads.txt). */
const ADS_TXT = `google.com, pub-1730786981458373, DIRECT, f08c47fec0942fa0\n`;

/* ---------- version endpoint -> dist/v/ (deploy-freshness check) ----------
 * A tiny, noindex page that always reports SITE.version + the build timestamp. Because dist/ is
 * committed and Cloudflare serves it, after a push visit https://jobsthe.world/v to confirm
 * the deploy shipped THIS release (version + time should match). BUMP SITE.version on every
 * commit/push (see CLAUDE.md) so the number moves. Mirrors senior-quizzes' /v page. */
function buildVersionPage() {
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(SITE.name)} — version</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0;
    min-height: 100dvh; display: grid; place-items: center; background: #0f1730; color: #eef2fb; }
  .v { text-align: center; padding: 28px; }
  .v .n { font-size: clamp(40px, 12vw, 72px); font-weight: 900; letter-spacing: -1px; margin: 0; }
  .v .l { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; opacity: .6; margin: 0 0 4px; }
  .v .t { font-size: 15px; opacity: .8; margin: 14px 0 0; }
  .v code { background: rgba(255,255,255,.08); padding: 2px 8px; border-radius: 6px; }
</style>
</head>
<body>
<main class="v">
  <p class="l">${esc(SITE.name)}</p>
  <p class="n">v${esc(SITE.version)}</p>
  <p class="t">Last updated: <code>${esc(BUILT_AT)}</code></p>
</main>
<!-- machine-readable: {"name":"${esc(SITE.name)}","version":"${esc(SITE.version)}","builtAt":"${esc(BUILT_AT)}"} -->
<script>window.__VERSION__ = { name: ${JSON.stringify(SITE.name)}, version: ${JSON.stringify(SITE.version)}, builtAt: ${JSON.stringify(BUILT_AT)} };</script>
</body>
</html>`;
  write("v/index.html", body);
}

/* ---------- robots + sitemap (basic; helps arbitrage LPs get reviewed/indexed) ---------- */
function buildMeta(props) {
  write("ads.txt", ADS_TXT);
  // Sitemap lists only indexable pages. The intake interstitials (/find/matching/, /find/results/,
  // /chat/) are noindex (thin/JS-rendered) — a sitemap must NOT advertise noindex URLs, so they are
  // omitted here. The static per-question pages (/find/N/) carry unique question text and stay in.
  const urls = [B, B + "about/", B + "remote/", B + "usa/", B + "usa/remote-jobs/",
    B + "remote-jobs-worldwide/", B + "remote-jobs-worldwide/south-africa/",
    B + "usa-packing-jobs/", B + "usa-packing-jobs/from-home/",
    B + "packing-jobs/", B + "packing-jobs/guide/", B + "me/"];
  // Saudi funnel: only the indexable pages — the language landing (Q1) and the guide. The inner
  // question steps, /me/<lang>/ready/ and /generic/ are noindex and must NOT appear here.
  ME_LANGS.forEach((l) => { urls.push(meBase(l), meBase(l) + "jobs/"); });
  // Only the champion /find/N/ question pages are indexable. The extended arm (/x/…) and the
  // remote funnel steps (/remote/find/…, noindex paid funnel) are omitted; the generic /remote/
  // landing above is the one indexable remote entry point.
  for (let n = 1; n <= CHAMPION_COUNT; n++) urls.push(`${B}find/${n}/`);
  props.forEach((p) => {
    const base = propBase(p);
    urls.push(base, base + "openings/", base + "apply/");
  });
  if (SITE.domain) {
    const body = urls.map((u) => `  <url><loc>https://${SITE.domain}${u}</loc></url>`).join("\n");
    write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
    write("robots.txt", `User-agent: *\nAllow: /\nSitemap: https://${SITE.domain}${B}sitemap.xml\n`);
  } else {
    write("robots.txt", `User-agent: *\nAllow: /\n`);
  }
  // NOTE: the worktrendhub.com origin is nginx (with an nginx proxy/page cache in front),
  // which ignores .htaccess entirely — so we do NOT ship one. Cache invalidation on this
  // host is server-side (clear the nginx cache + reload). See jobs/CLAUDE.md deploy notes.
}

/* ============================================================================
 * INTAKE FUNNEL — question-first flow + matching/wait + results, and /chat/
 * ==========================================================================*/

// Slim client-side snapshot of properties for the chat + results filtering.
function propsClient(props) {
  return props.map((p) => ({
    id: p.id, title: p.title, short: propLabel(p), url: propBase(p),
    kicker: p.type === "employer" ? "Now Hiring" : "Roles Near You",
    pay: (p.hero && p.hero.pay) || "", cats: catsForProp(p).concat("any")
  }));
}

// Slim progress header for the funnel steps (minimal — a bar + "Step n of N").
function funnelBar(step, total) {
  const pct = Math.round((step / total) * 100);
  return `<div class="fbar-wrap">
  <div class="fbar-row"><span class="fbar-step">Step ${step} of ${total}</span><span class="fbar-pct">${pct}%</span></div>
  <div class="fbar"><span style="width:${pct}%"></span></div>
</div>`;
}

/* ---------- /find/<n>/ — one question per page (pageview = ad impression) ----------
 * Parameterized by a `funnel` = { dir, base, questions, noindex } so the champion funnel (/find/)
 * and the extended-onboarding A/B arm (/x/onboarding-ext/find/) share one builder. */
function buildFindQuestion(funnel, qi) {
  const total = funnel.questions.length;
  const n = qi + 1;
  const q = funnel.questions[qi];
  const last = n === total;
  const nextUrl = last ? `${funnel.base}find/matching/` : `${funnel.base}find/${n + 1}/`;

  const picks = q.options.map((o) =>
    `<a class="pick" href="${esc(nextUrl)}" data-q="${esc(q.key)}" data-val="${esc(o.id)}"${o.match ? ` data-match="${esc((o.match || []).join(","))}"` : ""}>
    <span class="pick-ic">${icon(o.icon || "briefcase", 22)}</span>
    <span class="pick-label">${esc(o.label)}</span>
    <span class="pick-go">${icon("chevron", 20)}</span>
  </a>`).join("\n");

  const body = `${funnelBar(n, total)}

${adSlot("leaderboard")}

<div class="q-head">
  <h1>${esc(q.q)}</h1>
  ${q.sub ? `<p class="lead">${esc(q.sub)}</p>` : ""}
</div>

<div class="pick-list">
${picks}
</div>

<p class="micro center">${funnel.micro || `${icon("shield", 14)} Free · No sign-up · Apply on official sites`}</p>`;

  write(`${funnel.dir}find/${n}/index.html`, page({
    title: `${q.q} | ${SITE.name}`,
    desc: q.sub || q.q,
    canonical: funnel.noindex ? "" : `${funnel.base}find/${n}/`,
    noindex: funnel.noindex,
    body,
    pageScript: `Jobs.initFind({ step: ${n}, total: ${total} });`
  }));
}

/* ---------- /find/matching/ — the "please wait" screen (ads + timer) ---------- */
function buildMatching(funnel) {
  const c = funnel.copy || {};
  const head = c.matchHead || "Matching you with jobs near you";
  const lead = c.matchLead || "Scanning employer career portals…";
  const wait = c.matchWaitLine || "Please wait — checking current openings for you.";
  const body = `${adSlot("leaderboard")}

<div class="match-card">
  <div class="match-spin" aria-hidden="true"><span></span><span></span><span></span></div>
  <h1>${esc(head)}</h1>
  <p class="lead" id="match-status">${esc(lead)}</p>
  <div class="progress"><span id="match-bar"></span></div>
  <div class="match-pct" id="match-pct">0%</div>
  <p class="micro center">${icon("clock", 14)} ${esc(wait)}</p>
</div>

${adSlot("results")}`;

  write(`${funnel.dir}find/matching/index.html`, page({
    title: `Matching your jobs… | ${SITE.name}`,
    desc: "Matching you with current job openings near you.",
    body,
    noindex: true,   // interstitial "please wait" page — must never be indexed (thin/doorway)
    pageScript: `Jobs.initMatching({ next: ${JSON.stringify(funnel.base + "find/results/")}, wait: 7 });`
  }));
}

/* ---------- /find/results/ — genuine matches → real destinations ---------- */
function buildResults(funnel, props, byId) {
  const cards = cardGrid(props, PLACEMENTS.inContent);

  const tips = [
    "Apply only on official company sites or reputable job boards — a real job never asks you to pay to start.",
    "Have a short, up-to-date resume ready; many employers reply within a few days.",
    "Apply to several roles — the more official applications you send, the faster you'll hear back."
  ];

  // The matches payoff (summary + job cards + supporting ads + tips). In the rewarded-gate arm
  // this whole block lives inside a hidden #result-reveal panel, unlocked after the opt-in video.
  const revealInner = `<p class="lead" id="match-summary">Here are jobs hiring near you right now.</p>

<div class="job-cards" id="match-cards">
${cards}
</div>

<section class="content-block">
  <h2>Before you apply</h2>
  <ul class="ticks">${tips.map((t) => `<li>${icon("check", 18)}<span>${esc(t)}</span></li>`).join("")}</ul>
</section>

${adSlot("results")}`;

  // Rewarded-gate arm: OPT-IN video to reveal the matches. Honest, skippable, never-trap (the
  // matches are also free on the ungated /find/ funnel; engine reveals on any terminal outcome).
  const gate = funnel.rewardGate ? `
<div class="reward-gate" id="reward-gate">
  <span class="reward-ic">${icon("star", 34)}</span>
  <h2 id="reward-title">Unlock your job matches</h2>
  <p id="reward-msg">Watch a short video from our sponsor to unlock the jobs matched to you. It's free.</p>
  <button class="btn" type="button" data-po-rewarded-results>${icon("bolt", 18)} Watch &amp; see my matches</button>
  <p class="reward-escape" id="reward-escape" hidden><a href="#" data-po-reveal>Skip and see my matches</a></p>
</div>` : "";

  const body = funnel.rewardGate
    ? `<div class="results-head">
  <span class="results-check">${icon("check", 30)}</span>
  <h1>Your matches are ready</h1>
</div>

${adSlot("leaderboard")}
${gate}
<div id="result-reveal" hidden>
${revealInner}
</div>`
    : `<div class="results-head">
  <span class="results-check">${icon("check", 30)}</span>
  <h1>Your matches are ready</h1>
</div>

${adSlot("leaderboard")}

${revealInner}`;

  write(`${funnel.dir}find/results/index.html`, page({
    title: `Your job matches | ${SITE.name}`,
    desc: "Your matched jobs hiring near you — apply on the official sites.",
    body,
    wide: true,
    noindex: true,   // JS-rendered per-session matches — no stable content to index (thin)
    pageScript: funnel.rewardGate ? `Jobs.initRewardResults();` : `Jobs.initMatches();`
  }));
}

/* ---------- remote results: matched REMOTE roles (not all-props) ----------
 * A remote-jobs-specific results page. Instead of the all-property grid, it shows the
 * real remote ROLE types (REMOTE_ROLES) as cards, each linking into the genuine
 * remote-jobs destination funnel (→ openings → apply on a reputable board). The role
 * the visitor picked on Q2 is surfaced first, reusing the existing personalizeMatches
 * reorder (matches ans.type against each card's data-cat). Honest by construction:
 * every card is a real role listed on data/remote-jobs.json, one real destination. */
function remoteRoleCard(role, i, remoteProp) {
  return `<a class="job-card" href="${propBase(remoteProp)}" data-search="${esc((role.title + " " + role.blurb).toLowerCase())}" data-cat="${esc(role.id)} any">
  <span class="card-thumb-wrap">
    <span class="card-thumb">${bannerSVG("remrole-" + role.id, i, role.title, role.icon)}</span>
    <span class="card-scrim"></span>
    <span class="card-logo">${icon(role.icon || "laptop", 22)}<span class="card-mono">${esc(initials(role.title))}</span></span>
    <span class="card-badge"><span class="pulse"></span>Now Hiring</span>
    <span class="card-pay">${esc(role.pay)}</span>
  </span>
  <span class="job-card-body">
    <span class="job-card-title">${esc(role.title)}</span>
    <span class="job-card-meta"><span class="jm">${icon("laptop", 14)} Work from home</span><span class="job-card-cta">View openings ${icon("arrow", 16)}</span></span>
  </span>
</a>`;
}

function buildRemoteResults(funnel, remoteProp) {
  const cards = REMOTE_ROLES.map((r, i) => remoteRoleCard(r, i, remoteProp));
  // In-feed native ad after the first role card (same pattern as cardGrid).
  if (cards.length >= 2) cards.splice(Math.min(3, cards.length), 0, nativeAdCard(PLACEMENTS.inContent));

  const tips = [
    "A legitimate remote job never asks you to pay to start — apply only on official company sites or reputable job boards.",
    "Have a short, up-to-date resume ready; many remote employers reply within a few days.",
    "Apply to several roles — the more official applications you send, the faster you'll hear back."
  ];

  // The matches payoff. When the reward gate is on, this whole block lives inside a hidden
  // #result-reveal panel, unlocked by the opt-in video (or any terminal fallback).
  const revealInner = `<p class="lead" id="match-summary">Here are remote roles matched to you — apply directly, no account needed.</p>

<div class="job-cards" id="match-cards">
${cards.join("\n")}
</div>

<p class="micro center">${icon("shield", 14)} No account needed — tap any role to apply directly on the employer's site.</p>

<section class="content-block">
  <h2>Before you apply</h2>
  <ul class="ticks">${tips.map((t) => `<li>${icon("check", 18)}<span>${esc(t)}</span></li>`).join("")}</ul>
</section>

${adSlot("results")}`;

  // OPT-IN rewarded video (owner decision 2026-07-26). Same compliant, never-trap pattern as the
  // champion /find/ gate: honest copy, non-monetary reward, and the matches reveal on ANY terminal
  // outcome (complete / early-close→escape / no-fill / error / SDK-absent / timeout) — see
  // setupRewardGate in jobs.js. A rewarded video is NOT a sign-up or an email, so it does not break
  // this funnel's "no sign-up / no email" promise; the copy stays honest and optional.
  const gate = funnel.rewardGate ? `
<div class="reward-gate" id="reward-gate">
  <span class="reward-ic">${icon("star", 34)}</span>
  <h2 id="reward-title">Unlock your remote job matches</h2>
  <p id="reward-msg">Watch a short video from our sponsor to unlock the remote roles matched to you. It's free — still no sign-up and no email.</p>
  <button class="btn" type="button" data-po-rewarded-results>${icon("bolt", 18)} Watch &amp; see my matches</button>
  <p class="reward-escape" id="reward-escape" hidden><a href="#" data-po-reveal>Skip and see my matches</a></p>
</div>` : "";

  const body = funnel.rewardGate
    ? `<div class="results-head">
  <span class="results-check">${icon("check", 30)}</span>
  <h1>Your remote job matches are ready</h1>
</div>

${adSlot("leaderboard")}
${gate}
<div id="result-reveal" hidden>
${revealInner}
</div>`
    : `<div class="results-head">
  <span class="results-check">${icon("check", 30)}</span>
  <h1>Your remote job matches are ready</h1>
</div>

${adSlot("leaderboard")}

${revealInner}`;

  write(`${funnel.dir}find/results/index.html`, page({
    title: `Your remote job matches | ${SITE.name}`,
    desc: "Your matched remote work-from-home roles — apply directly on the official sites. No sign-up.",
    body,
    wide: true,
    noindex: true,   // JS-personalized per-session matches — thin, no stable content to index
    pageScript: funnel.rewardGate ? `Jobs.initRewardResults();` : `Jobs.initMatches();`
  }));
}

/* ---------- /remote/ (+ per-angle) landing pages that start the remote funnel ---------- */
function buildRemoteLanding(angle, remoteProp, i) {
  const isGeneric = !angle;
  const h1 = isGeneric ? "Legitimate Remote Jobs Hiring Now" : angle.h1;
  const lead = isGeneric
    ? "Real work-from-home roles — customer service, data entry, virtual assistant and more. Answer a few quick questions and we'll match you to openings you can apply to directly."
    : angle.lead;
  const dir = isGeneric ? "remote/" : `remote/${angle.id}/`;
  const canonical = isGeneric ? `${B}remote/` : "";

  const legit = [
    "Roles from reputable job boards and official company pages only",
    "A real remote job never asks you to pay to start",
    "No sign-up and no email — your answers just match you to roles",
    "You apply directly on the employer's own site"
  ];

  const body = `<section class="hero-card home-hero">
  <div class="hero-body">
    <span class="hero-brand">
      <span class="hero-brand-badge">${logoMark()}</span>
      <span class="hero-brand-name">${esc(SITE.name)}</span>
    </span>
    <h1>${esc(h1)}</h1>
    <p class="lead">${esc(lead)}</p>
    <div class="hero-ctas">
      <a class="btn" href="${B}remote/find/1/">Find my remote job${arrow()}</a>
    </div>
    <p class="micro center light">${icon("shield", 14)} Free · No sign-up · No email needed · Takes about 30 seconds</p>
  </div>
</section>

${trustRow()}

${adSlot("leaderboard")}

<section class="content-block">
  <h2>How we keep it legitimate</h2>
  <ul class="ticks">${legit.map((t) => `<li>${icon("check", 18)}<span>${esc(t)}</span></li>`).join("")}</ul>
</section>

<section class="content-block">
  <h2>Remote roles hiring now</h2>
  <div class="job-cards">
${REMOTE_ROLES.map((r, idx) => remoteRoleCard(r, idx, remoteProp)).join("\n")}
  </div>
</section>

${adSlot("results")}

<div class="hero-ctas center">
  <a class="btn" href="${B}remote/find/1/">Find my remote job${arrow()}</a>
</div>`;

  write(`${dir}index.html`, page({
    title: isGeneric ? `Remote Jobs Hiring Now — Work From Home | ${SITE.name}` : `${h1} | ${SITE.name}`,
    desc: lead,
    canonical,
    body,
    wide: true,
    noindex: !isGeneric,   // generic /remote/ is indexable; angle landers are near-duplicate paid landers
    hideHeader: true
  }));
}

/* ---------- /chat/ — conversational intake (same questions, clean chat UI) ---------- */
function buildChat(props) {
  const cfg = {
    base: B,
    matchingUrl: `${B}find/matching/`,
    resultsUrl: `${B}find/results/`,
    // Chat is a champion-path intake alternative — keep it to the champion question set.
    questions: INTAKE.questions.slice(0, CHAMPION_COUNT).map((q) => ({
      key: q.key, q: q.q,
      options: q.options.map((o) => ({ id: o.id, label: o.label }))
    })),
    props: propsClient(props)
  };

  const body = `<div class="chat" id="chat">
  <div class="chat-head">
    <span class="chat-av">${icon("briefcase", 20)}</span>
    <div class="chat-meta"><span class="chat-name">${esc(SITE.name)} Assistant</span><span class="chat-status">Online · finds jobs near you</span></div>
  </div>
  <div class="chat-log" id="chat-log" aria-live="polite"></div>
  <div class="chat-ad" id="chat-ad" hidden>${adSlot("inContent")}</div>
  <div class="chat-quick" id="chat-quick"></div>
</div>`;

  write("chat/index.html", page({
    title: `Find your job — chat | ${SITE.name}`,
    desc: "Answer a few quick questions and get matched with jobs hiring near you.",
    body,
    noindex: true,   // empty JS-driven chat shell — thin + a duplicate intake path of /find/
    pageScript: `Jobs.initChat(${JSON.stringify(cfg)});`
  }));
}

/* ---------- /usa/ — simple editorial lander + pop-up modal quiz (see USA_MODAL) ---------- */

// The pop-up modal markup. Hidden by default; jobs.js `initUsaModal` opens it (auto after a
// short delay AND on any [data-usa-open] tap) and renders the questions into #usa-body. It is
// always closeable (X / backdrop / Esc) — an opt-in engagement quiz, never a forced overlay.
/* opts.total   — step count for the "Step 1 of N" label (default: the /usa/ modal's).
 * opts.bare    — strip the progress bar AND the step label, leaving only the close X, the
 *                question and its options. Used by the /me/x/quiet/ arm (owner: "super simple
 *                popup with nothing"). The close X is NOT optional in either shape — a modal you
 *                cannot dismiss is a forced interstitial (banned format), not an opt-in quiz.
 * opts.close   — accessible label for the close button (translated on the /me/ arm). */
function usaModal(opts) {
  const o = opts || {};
  const total = o.total || (USA_MODAL.questions.length + 1);
  const label = o.close || "Close";
  const chrome = o.bare ? "" : `
    <div class="usa-progress" aria-hidden="true"><span class="usa-bar" id="usa-bar"></span></div>
    <div class="usa-step-label" id="usa-modal-step">Step 1 of ${total}</div>`;
  return `<div class="usa-modal${o.bare ? " bare" : ""}" id="usa-modal" hidden role="dialog" aria-modal="true"${o.bare ? ` aria-label="${esc(o.ariaLabel || label)}"` : ` aria-labelledby="usa-modal-step"`}>
  <div class="usa-backdrop"></div>
  <div class="usa-dialog" role="document">
    ${chrome}
    <div class="usa-body" id="usa-body"></div>
  </div>
</div>`;
}

function buildUsaLanding(props, byId) {
  const h1 = "Job Opportunities in the United States";
  const lead = "Thousands of employers across the U.S. are hiring this week — including remote and work-from-home roles. Answer a few quick questions and we'll open a free guide to the roles and the reputable places hiring right now.";

  // Two real employer cards up top (reference shows "now hiring" employer cards). Reuses propCard
  // so the banner is our own generated SVG (never a ripped employer logo/photo — root rule).
  const employers = props.filter((p) => p.type === "employer").slice(0, 2);
  const employerCards = employers.length
    ? `<section class="content-block">
  <h2>Hiring across the U.S. this week</h2>
  <div class="job-cards">
${employers.map((p, i) => propCard(p, i)).join("\n")}
  </div>
</section>` : "";

  // Benefit callouts (reference: "No experience needed / Flexible schedules / Weekly pay / Growth
  // paths"). All TRUE framing — hedged so nothing reads as an invented guarantee (root §4 Fight 2).
  const benefits = [
    { ic: "spark",     t: "No experience needed", d: "Many roles train you on the job." },
    { ic: "clock",     t: "Flexible schedules",   d: "Full-time, part-time and flexible shifts." },
    { ic: "dollar",    t: "Weekly pay",           d: "Weekly pay is common at many employers." },
    { ic: "arrow",     t: "Room to grow",         d: "Entry roles that can lead to more." }
  ];
  const benefitGrid = `<section class="content-block">
  <div class="usa-benefits">
${benefits.map((b) => `    <div class="usa-benefit">
      <span class="usa-benefit-ic">${icon(b.ic, 20)}</span>
      <span class="usa-benefit-t">${esc(b.t)}</span>
      <span class="usa-benefit-d">${esc(b.d)}</span>
    </div>`).join("\n")}
  </div>
</section>`;

  const how = [
    "Answer 3 quick questions about the work you want and when you can start.",
    "We match you to companies and roles hiring in your area right now.",
    "You apply directly on the employer's official site — free, no account with us."
  ];
  const howBlock = `<section class="content-block">
  <h2>How it works</h2>
  <ol class="how-steps">${how.map((s, i) => `<li><span class="step-num">${i + 1}</span><span>${esc(s)}</span></li>`).join("")}</ol>
</section>`;

  const faqs = [
    { q: "Do I need experience?", a: "No — many of the roles we surface are entry-level and provide training. Each posting lists its own requirements." },
    { q: "How soon could I start?", a: "It varies by employer. Some are hiring immediately; others interview over a week or two. The official posting has the current timeline." },
    { q: "Is it full-time or part-time?", a: "Both. When you answer the quick questions we prioritise roles that fit the schedule you pick, but you can change it on the employer's site." },
    { q: "How do I avoid job scams?", a: "Apply only on official company sites or reputable job boards — a legitimate job never asks you to pay to start. We link you straight to the official posting." }
  ];

  const body = `<section class="hero-card home-hero">
  <div class="hero-body">
    <span class="hero-brand">
      <span class="hero-brand-badge">${logoMark()}</span>
      <span class="hero-brand-name">${esc(SITE.name)}</span>
    </span>
    <h1>${esc(h1)}</h1>
    <p class="lead">${esc(lead)}</p>
    <div class="hero-ctas">
      <button class="btn" type="button" data-usa-open>See jobs hiring near you${arrow()}</button>
    </div>
    <p class="micro center light">${icon("clock", 14)} Free · No sign-up · Takes about 30 seconds</p>
  </div>
</section>

${trustRow()}

${employerCards}

${benefitGrid}

${howBlock}

${faqHTML(faqs)}

<div class="hero-ctas center">
  <button class="btn" type="button" data-usa-open>Find jobs hiring near you${arrow()}</button>
</div>

${usaModal()}`;
  // NO display ad slots / anchor on this modal-first lander: the modal opens IMMEDIATELY on load
  // (USA_MODAL.autoDelay = 0) and covers the page, so any ad here would render BEHIND the blurred
  // backdrop = a non-viewable impression that Google can read as an ad hidden by an interstitial
  // (Publisher Policy / Better Ads risk, and it tanks viewability → RPM). Monetization for this
  // funnel lives where the visitor can actually SEE it: the opt-in rewarded video, then the
  // /usa/remote-jobs/ content guide (which keeps its full in-content ad load). hideAnchor drops the
  // sticky anchor for the same reason. (Fix 2026-08-08 — do not re-add ad slots behind the modal.)

  const cfg = {
    questions: USA_MODAL.questions.map((q) => ({
      key: q.key, q: q.q, sub: q.sub,
      options: q.options.map((o) => ({ id: o.id, label: o.label }))
    })),
    resultsUrl: `${B}usa/remote-jobs/`,   // the rewarded-ad payoff = the content guide (not a thin cards page)
    autoDelay: USA_MODAL.autoDelay
  };

  write("usa/index.html", page({
    title: `Job Opportunities in the USA — Hiring Now | ${SITE.name}`,
    desc: "Thousands of U.S. employers are hiring this week. Answer a few quick questions and get matched to jobs you can apply to directly. Free, no sign-up.",
    canonical: `${B}usa/`,
    body,
    wide: true,
    hideHeader: true,
    hideAnchor: true,   // modal covers the page on load — no ad may sit behind the blur (see note above)
    prefetch: cfg.resultsUrl,   // warm the payoff guide (+ its ad slots) while the quiz is answered
    pageScript: `Jobs.initUsaModal(${JSON.stringify(cfg)});`
  }));
}

/* ---------- /usa/remote-jobs/ — the CONTENT GUIDE (the rewarded-ad payoff) ----------
 * A genuine, useful remote-jobs explainer: what the roles are, reputable BOARDS + EMPLOYERS
 * to apply through (real outbound links), and how to avoid scams — with in-content display
 * ads spaced between substantial content sections (compliant density, high viewability). Real
 * content = long dwell + an affiliate/outbound leg + it reads as an article, not a thin doorway
 * (which is what keeps a monetized page off GAM's demonetization list). Indexable (it's real
 * content that can also earn organic traffic). */
function placeList(items) {
  return `<ul class="place-list">
${items.map((it) => `  <li class="place">
    <span class="place-ic">${icon(it.icon || "briefcase", 20)}</span>
    <span class="place-main">
      <a class="place-name" href="${esc(it.url)}" target="_blank" rel="nofollow noopener sponsored">${esc(it.name)} ${icon("external", 14)}</a>
      <span class="place-desc">${esc(it.desc)}</span>
    </span>
  </li>`).join("\n")}
</ul>`;
}

/* Same visual row as placeList() but with NO outbound link — for describing role TYPES rather than
 * destinations. Reuses .place-* so it needs no new CSS. */
function plainList(items) {
  return `<ul class="place-list">
${items.map((it) => `  <li class="place">
    <span class="place-ic">${icon(it.icon || "briefcase", 20)}</span>
    <span class="place-main">
      <span class="place-name place-name-plain">${esc(it.name)}</span>
      <span class="place-desc">${esc(it.desc)}</span>
    </span>
  </li>`).join("\n")}
</ul>`;
}

/* ---------- /remote-jobs-worldwide/ — the INTERNATIONAL guide (split out 2026-08-20) ----------
 * Was the bottom half of /usa/remote-jobs/. Split into its own URL for two reasons, both scoreboard:
 *   1. It is one more ad-bearing pageview per visitor who cares about it (root §2 — session depth is
 *      THE lever), and it carries a full slot load instead of sharing the U.S. page's three.
 *   2. A page whose <h1> and canonical say "U.S." will never rank for "remote jobs from India".
 *      Its own page, own title, own hreflang-free canonical, can.
 * It is the rewarded payoff for the /worldwide/ paid entry (see buildWorldwideLanding) and is linked
 * both ways with the U.S. guide, so either half can be the paid landing without orphaning the other.
 *
 * COMPLIANCE SPINE (root §4 Fight 2 — this page is aimed at India/Nigeria/Philippines traffic, where
 * job fraud is endemic): it states the real reason most U.S. postings are U.S.-only (payroll and tax
 * where you live), then only the routes that genuinely exist. **NEVER add a visa, sponsorship or
 * relocation angle** — nobody can sell a U.S. job or a visa, the claim is false, and it is the
 * fastest ad-account ban in this niche. No earnings figures anywhere. */
/* HOW YOU GET PAID — the section that makes the "paid in dollars" ad angle LEGAL (2026-08-20).
 * An ad claim is only safe if the landing page proves it. "Paid in USD, not rands" was
 * unsupportable while the guide never mentioned currency at all — a reviewer sees an unbacked
 * financial claim, which is the Misrepresentation bucket. These rows describe the PAYMENT
 * MECHANISM (who pays in what currency, how it reaches a local bank) and contain **no amounts**,
 * which is the line: the mechanism is a checkable fact, an amount is an earnings promise. */
const PAY_RAILS = [
  { name: "Client pays the platform, the platform pays you", icon: "dollar",   desc: "On Upwork, Fiverr, Toptal and similar, the client is billed in their own currency — usually USD or EUR — and the platform holds it until the work is approved. You are never chasing a client for money directly." },
  { name: "You choose how it lands",                          icon: "check",    desc: "Most platforms pay out by direct transfer to a local bank account, or through Payoneer, Wise or PayPal. Which of those are available depends on your country — each platform lists its own options at sign-up." },
  { name: "Currency conversion is yours to manage",           icon: "wrench",   desc: "You are paid in the client's currency and it converts when it reaches your account. Conversion rates and transfer fees differ a lot between the payout options, so compare before you pick one." },
  { name: "Joining is free — payouts have a fee, jobs do not", icon: "shield",  desc: "No reputable platform charges you to join or to apply. They take a percentage of what you earn, or a flat withdrawal fee, and it is published up front. Anyone charging an entry fee is not a platform, it is a scam." },
  { name: "Foreign income is still taxable at home",          icon: "building", desc: "Money earned from clients abroad is normally taxable where you live, whatever currency it arrived in. Check your own tax authority's rules on foreign income before your first payout, not after." }
];

// The guide's BODY is factored out so the single-page test twin (/worldwide-pre/, buildWorldwidePre)
// can render the exact same content behind its overlay — identical article, identical ad slots.
function worldwideGuideBody() {
  const routes = [
    "Remote-first companies that hire internationally. Their postings name the countries they can employ in — larger firms do it through an employer-of-record service.",
    "Contract and freelance work, where you invoice as a contractor instead of being employed. This is how most people outside the U.S. end up working for U.S. clients.",
    "Global outsourcing, language and data-work companies that recruit directly in your own country for at-home roles."
  ];

  const expect = [
    "Several hours of overlap with the client's working day is a common requirement — the posting will say how many.",
    "Contract work means you handle your own tax and there is no paid leave, so price your rate with that included.",
    "Most platforms ask you to pass a short test or build a first review before the better-paid work opens up.",
    "No legitimate employer, agency or platform charges you a fee to be hired, and no genuine remote job comes with a visa you have to pay for."
  ];

  const scamTips = [
    "Nobody can sell you a work visa or guarantee you a job abroad. Any offer built on that promise is a fraud, wherever it comes from.",
    "A legitimate employer never asks you to pay for a job, equipment, 'training', or a placement fee up front.",
    "Treat 'jobs' that arrive by WhatsApp or Telegram offering daily payments for simple tasks as a scam — that pattern is task fraud, not employment.",
    "Apply on the company's own careers page or a reputable platform — not a link forwarded to you in a group chat.",
    "Be wary of instant hiring with no interview, or pay that is far above the going rate for the work.",
    "Never send bank details or identity documents before you have a verified, signed contract."
  ];

  const faqs = [
    { q: "Can I get a U.S. remote job if I live in another country?", a: "Sometimes, but usually not as an employee. Most U.S. postings are limited to the U.S. because the employer has to run payroll and tax where you live. The realistic routes are remote-first companies that hire internationally, contract or freelance work, and global companies that recruit at-home staff in your own country — all covered on this page." },
    { q: "Why do so many remote listings say 'United States only'?", a: "Employing someone means running payroll, tax and benefits in their country, and setting that up somewhere new costs the employer real money. That line is an accounting and legal limit, not a judgement about your skills." },
    { q: "Do I need a visa to work remotely for a company abroad?", a: "Not if you are living and working in your own country — you are not entering theirs. Anyone offering to sell you a visa or a guaranteed job abroad is running a scam." },
    { q: "What is an employer of record?", a: "A service that legally employs you in your own country on behalf of a company based somewhere else. It is how larger international employers hire across borders, and it is why some postings list many countries." },
    { q: "Is freelancing safer than applying for jobs?", a: "It is usually more available, not safer. Working through an established platform gives you a contract and a payment record, which is far safer than an offer that arrives by message. The risk is unsteady income, not fraud." },
    { q: "How much can I earn?", a: "It varies too much to promise a figure — it depends on the work, your experience and the client's market. Each platform publishes its own rates, and the posting is the only reliable source. Treat any site that guarantees you a specific daily income as a warning sign." },
    { q: "What equipment do I need?", a: "Usually a reliable computer, a stable internet connection, and a quiet space for calls. You should never have to buy equipment from the employer itself." }
  ];

  return `<div class="results-head">
  <span class="results-check">${icon("check", 30)}</span>
  <h1>Remote Jobs You Can Do From Any Country: Who Actually Hires Internationally</h1>
</div>
${byline()}

${adSlot("leaderboard")}

<section class="content-block">
  <p class="lead">If you are outside the United States, most "US remote" listings will not take your application — and that has nothing to do with your skills. This free guide explains why, then covers the routes that genuinely work: the boards that show which countries a company can hire in, the freelance platforms that connect you to clients abroad, and the employers who really do hire across borders.</p>
</section>

<section class="content-block">
  <div class="card">
    <h2>Why most U.S. remote jobs say "United States only"</h2>
    <p>When a company employs you, it has to run payroll, tax and benefits in the country you actually live in. Setting that up somewhere new costs real money, so most U.S. employers restrict their postings to places they already operate. That line on the posting is an accounting and legal limit, not a judgement about you — and it is why applying to U.S.-only listings from abroad so rarely goes anywhere.</p>
    <p>It is also the gap that job fraud sells into. Nobody can sell you a U.S. job or a visa, and any offer built on that promise is a scam. The three routes below are the ones that genuinely exist.</p>
  </div>
</section>

<section class="content-block">
  <h2>Three routes that do work</h2>
  <ul class="ticks">${routes.map((t) => `<li>${icon("check", 18)}<span>${esc(t)}</span></li>`).join("")}</ul>
</section>

${adSlot("inContent")}

<section class="content-block">
  <h2>Remote job boards with international listings</h2>
  <p>Boards where postings state which countries a company can hire in, so you can skip the U.S.-only ones instead of applying into a wall. Each opens on the board's own site and is free to search.</p>
  ${placeList(GLOBAL_BOARDS)}
</section>

<section class="content-block">
  <h2>Freelance and contract platforms</h2>
  <p>The most common route to overseas clients from outside the U.S. You work as a contractor rather than an employee, which is why country limits do not apply the same way. All are free to join.</p>
  ${placeList(GLOBAL_PLATFORMS)}
</section>

${adSlot("results")}

<section class="content-block">
  <h2>Companies that hire across countries</h2>
  <p>Employers with genuinely international hiring, from remote-first tech companies to global at-home customer-service programmes. Check each posting for the countries it covers before you apply.</p>
  ${placeList(GLOBAL_EMPLOYERS)}
</section>

<section class="content-block">
  <h2>How you actually get paid</h2>
  <p>Working for a client abroad means being paid in their currency — usually US dollars or euros — rather than your own. That is the single biggest practical difference from a local job, and it is worth understanding before you start rather than after your first invoice.</p>
  ${plainList(PAY_RAILS)}
</section>

<section class="content-block">
  <h2>Flexible and part-time work, wherever you are</h2>
  <p>Several of the platforms that recruit worldwide are task-based rather than shift-based — tutoring, data annotation, transcription and micro-tasks. They pay per task, per lesson or per audio minute, so the hours are genuinely yours. Those are listed in full on our part-time guide.</p>
  ${placeList(FLEX_PLATFORMS.slice(0, 3))}
</section>

${adSlot("inContent2")}

<section class="content-block">
  <h2>What to expect</h2>
  <ul class="ticks">${expect.map((t) => `<li>${icon("shield", 18)}<span>${esc(t)}</span></li>`).join("")}</ul>
</section>

<section class="content-block">
  <h2>How to spot and avoid remote-job scams</h2>
  <ul class="ticks">${scamTips.map((t) => `<li>${icon("shield", 18)}<span>${esc(t)}</span></li>`).join("")}</ul>
</section>

${faqHTML(faqs)}

${adSlot("inContent3")}

<section class="content-block">
  <div class="card">
    <h2>Guides for where you are</h2>
    <p>Country pages go further than this one: the employers already operating there, how payment in dollars reaches a local bank account, the time-zone overlap, and the scams that target that market specifically.</p>
    <div class="hero-ctas">
      <a class="btn" href="${B}remote-jobs-worldwide/south-africa/" data-po-no-intercept>Remote jobs from South Africa${arrow()}</a>
      <a class="btn secondary" href="${B}usa/remote-jobs/" data-po-no-intercept>Remote jobs in the U.S.${arrow()}</a>
    </div>
  </div>
</section>`;
}

function buildWorldwideGuide() {
  write("remote-jobs-worldwide/index.html", page({
    title: `Remote Jobs From Any Country — Who Hires Internationally & How to Apply | ${SITE.name}`,
    desc: "A free guide to remote work from outside the U.S.: why most U.S. listings are U.S.-only, the boards and freelance platforms that hire internationally, employers that hire across countries, and how to avoid job scams.",
    canonical: `${B}remote-jobs-worldwide/`,
    body: worldwideGuideBody(),
    wide: true
  }));
}

/* ---------- /worldwide/ — SINGLE-PAGE (SPA) CHAMPION international funnel (promoted 2026-08-28) ----------
 * Built by buildWorldwidePre() (name kept from when it lived at /worldwide-pre/). Promoted into the
 * /worldwide/ slot 2026-08-28; the old two-page modal lander was demoted to /worldwide-bkp/
 * (buildWorldwideLanding). IDENTICAL funnel to the backup (same 3 geo-neutral questions, same
 * opt-in rewarded video, same events, same payoff CONTENT) — the ONLY difference is how the page loads:
 * instead of a two-page navigation (/worldwide/ lander -> rewarded -> /remote-jobs-worldwide/ guide),
 * the WHOLE guide is rendered on THIS page, hidden behind the quiz/reward overlay, and REVEALED in-page
 * when the reward completes. No navigation => the ad SDK initialises ONCE and stays warm across the
 * reward, so the guide's ads can come up much faster on reveal.
 *
 * WHY IT IS COMPLIANT (the point that unblocked it): the guide sits in a `hidden` (display:none)
 * container, so the SDK does NOT render/fill its ad slots while the overlay is up (per
 * PUBLISHER_INTEGRATION.md the SDK skips display:none slots) — nothing is a non-viewable "ad behind a
 * modal". During the rewarded video we PRELOAD the native/anchor creatives (preloadSlots is FETCH-ONLY,
 * confirmed by thebesads 2026-08-28 — it does not render or count an impression), and only when the
 * overlay closes do we un-blur the guide and let the slots RENDER (counted) as viewable. Fetch ahead,
 * render on reveal — the compliant version of "load the ads in advance".
 *
 * HOW IT LOOKS (owner spec 2026-08-28): the guide is rendered and VISIBLE-BUT-BLURRED behind the
 * popup (`.wp-preview`) — the whole final page is already loaded underneath, so when the reward
 * completes the blur simply lifts and the visitor is already on the page (no pop-in, no reload). The
 * ONLY things held back behind the blur are the AD SLOTS: `.wp-preview` sets the `.ad-slot`/
 * `.anchor-slot` elements to `display:none`, so the SDK skips them (no ad renders behind the overlay =
 * no non-viewable impression) while every other pixel of the guide is on screen. Their reserved boxes
 * still hold space, so nothing shifts when the ads fill on reveal. Do NOT drop `.wp-preview` from the
 * initial markup and do NOT make the ad slots visible before reveal.
 *
 * noindex + NOT in the sitemap + NOT on the home lander: it is a paid/test arm and a near-duplicate of
 * the indexable guide; the owner confirmed this angle gets no organic traffic, so there is nothing to
 * protect for SEO and the real /worldwide/ + /remote-jobs-worldwide/ pages are left untouched.
 * OPEN (thebesads): confirm the exact call that RENDERS a preloaded slot on reveal — we currently
 * RESOLVED (thebesads 2026-08-30): the render trigger on reveal is simply un-hiding the slots (drop
 * `.wp-preview`, which removes their display:none); the SDK renders the preloaded creatives itself. We
 * REMOVED the old refreshAll() on reveal — it forced a fresh auction that discarded the preloaded ads.
 * If a no-fill still shows, that is the SDK/tooling, not the flow. */
function buildWorldwidePre() {
  const total = WORLDWIDE_MODAL.questions.length + 1;

  // The full guide, rendered and VISIBLE-BUT-BLURRED behind the overlay (.wp-preview). The whole final
  // page is loaded underneath so the reveal is just the blur lifting. .wp-preview also hides the
  // ad-slot/anchor-slot elements (display:none) so the SDK never fills an ad behind the blur; their
  // reserved boxes keep their space so nothing shifts when the ads arrive on reveal.
  const guide = `<div id="wp-guide" class="wp-preview">
${worldwideGuideBody()}
${anchorAd()}
</div>`;

  const body = `${guide}
${usaModal({ bare: true, total, close: "Close", ariaLabel: "Remote jobs from any country" })}`;

  const cfg = {
    questions: WORLDWIDE_MODAL.questions.map((q) => ({
      key: q.key, q: q.q,
      options: q.options.map((label, oi) => ({ id: String(oi), label }))
    })),
    // SPA reveal instead of a navigation: on reward completion, drop the blur on #wp-guide (which also
    // un-hides its ad slots) and render them. The page was already on screen behind the blur.
    spa: true,
    revealId: "wp-guide",
    guidePath: `${B}remote-jobs-worldwide/`,   // virtual page_view fired on reveal (reporting parity)
    autoDelay: 0,
    fn: "jobs_worldwide",   // promoted 2026-08-28 to the champion /worldwide/ (the old two-page shape backs up at /worldwide-bkp/, fn jobs_worldwide_bkp)
    // After the last question, hold a "searching for jobs…" loader until the rewarded ad is preloaded
    // (or has no-filled), so the reward CTA plays the ad instantly instead of the visitor waiting after
    // the click. Bounded (min ~1.2s / max 6s) so it never hangs.
    searchLoader: "Searching for jobs…",
    copy: {
      title: "Your guide is ready",
      sub: "A short sponsored video plays first.",
      searchSub: "Matching you to roles hiring now…",
      btn: "View jobs",
      loading: "Loading…",
      almost: "Almost there",
      finish: "Finish the short video to view your jobs.",
      again: "View jobs",
      skip: "Skip and view jobs"
    }
  };

  // Promoted 2026-08-28 from /worldwide-pre/ to the champion /worldwide/ (the old two-page shape backs
  // up at /worldwide-bkp/). Still noindex — paid entry, near-duplicate of the indexable guide.
  write("worldwide/index.html", page({
    title: `Remote Jobs You Can Do From Any Country | ${SITE.name}`,
    desc: "Answer three quick questions and get a free guide to the companies and platforms that hire remotely across countries. Free, no sign-up.",
    noindex: true,     // paid entry — never indexed, never in the sitemap
    body,
    wide: true,
    hideHeader: true,
    hideAnchor: true,  // the anchor lives inside #wp-guide so it cannot render behind the overlay
    pageScript: `Jobs.initUsaModal(${JSON.stringify(cfg)});`
  }));
}

/* ---------- /worldwide-us/ — jobguidedaily.com CLONE on the /worldwide SPA engine (added 2026-09-01)
 * A visual + funnel clone of the reference lander https://jobguidedaily.com/job-opportunities-in-usa/
 * (owner request), powered by the EXACT SAME single-page (SPA) engine as the champion /worldwide/
 * (buildWorldwidePre → usaModal + Jobs.initUsaModal with cfg.spa/revealId/guidePath). Nothing here
 * changes /worldwide/ or the shared engine — this is a self-contained new page with its OWN skin.
 *
 * HOW IT CLONES THE REFERENCE:
 *  - Funnel: an on-load pop-up quiz (2 questions: job type / when can you start) → a
 *    "Searching for jobs near you" loader → an opt-in rewarded video ("We found vacancies for you"
 *    → "View vacancies") → the advertorial revealed in-page. Same reward copy as the reference.
 *  - Design: page-scoped <style> (WUS_SKIN) restyles the shared .usa-* modal (PURPLE #5b35a0 options
 *    + a top progress bar, step label hidden) and the advertorial to the reference look — Playfair
 *    Display serif headings, warm near-white ground, crimson-red CTAs (#d23b2b). The style block only
 *    exists on THIS page, so overriding the global .usa-* and .btn classes here cannot leak to any other
 *    page (/worldwide/, /usa/, /generic/ are byte-for-byte unchanged).
 *  - The whole advertorial is rendered VISIBLE-BUT-BLURRED behind the pop-up (#wus-guide.wp-preview)
 *    and revealed when the reward completes — identical SPA mechanics to /worldwide/ (ad slots held
 *    back by .wp-preview → the SDK never fills an ad behind the overlay; revealed + rendered on close).
 *
 * COMPLIANCE DEVIATIONS FROM THE REFERENCE (deliberate — root §4 Fight 2/3, jobs CLAUDE.md):
 *  1. The reference's named success story ("John, 34, from New Jersey…") is reproduced as a clearly
 *     LABELLED illustrative example, not a claimed real person — a fabricated named testimonial is an
 *     FTC deceptive-endorsement + Google/FB misrepresentation risk that can ban the ad account.
 *  2. Featured-employer cards use SECTOR names (not real trademarks) and link out to reputable board
 *     searches (rel="nofollow noopener sponsored", data-po-no-intercept) — we are "not an employer or
 *     recruiter" (disclaimer), so we don't imply a specific named company hires through us.
 *  3. The reference's "we may receive compensation" line is DROPPED: our outbound links carry no
 *     affiliate parameter, so claiming a commission would be false (root §5). We ship our own honest
 *     disclosure + disclaimer footer instead.
 *  4. The reference's "Skilled Worker Visa" related-read is REPLACED with a scam-avoidance one — the
 *     HARD guardrail is never a visa/sponsorship/relocation angle on any US-remote page.
 *  noindex + NOT in the sitemap + NOT on the home lander — a paid entry and near-duplicate of the
 *  /worldwide/ angle (same precedent as /worldwide/, /generic/). */
const WORLDWIDE_US_MODAL = {
  autoDelay: 0,
  questions: [
    { key: "type", q: "What kind of job are you looking for?", options: [
      { id: "full", label: "Full-time" }, { id: "part", label: "Part-time" }, { id: "any", label: "Any available role" } ] },
    { key: "start", q: "When can you start?", options: [
      { id: "now", label: "Immediately" }, { id: "week", label: "This week" }, { id: "month", label: "This month" } ] }
  ]
};

// Page-scoped skin — only emitted on /worldwide-us/, so every global-class override below (.usa-*,
// .btn) is local to this page. Reference tokens: Playfair Display serif headings, Inter/system body,
// warm near-white ground, crimson-red primary CTA, purple quiz modal.
const WUS_SKIN = `<style>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&display=swap');
.wus{--wred:#d23b2b;--wred-d:#a72c1f;--wpur:#5b35a0;--wpur-d:#4f2d8b;--wink:#232120;--wmut:#6b6b72;--wbg:#fdfcfa;--wcard:#fff;--wbd:#e7e5e1;
  --wserif:'Playfair Display',Georgia,'Times New Roman',serif;color:var(--wink);}
html body{background:#fdfcfa;}
main.wrap.wide{max-width:none;padding:0;}
main.wrap{animation:none;}
main.wrap>footer.foot{max-width:1120px;margin:0 auto;padding:36px clamp(16px,4vw,22px) 64px;}
.wus-in{max-width:1120px;margin:0 auto;padding:0 clamp(16px,4vw,22px);}
.wus h1,.wus h2,.wus h3{font-family:var(--wserif);color:var(--wink);letter-spacing:-.01em;}
/* header */
.wus-topbar{background:#171717;color:#c7c7cc;font-size:12px;}
.wus-topbar .wus-in{display:flex;justify-content:space-between;align-items:center;padding-top:8px;padding-bottom:8px;gap:12px;}
.wus-topbar a{color:#c7c7cc;text-decoration:none;margin-left:16px;}
.wus-topbar a:hover{color:#fff;}
.wus-topbar-l{opacity:.9;}
.wus-nav{background:#fff;border-bottom:1px solid var(--wbd);position:sticky;top:0;z-index:30;}
.wus-nav .wus-in{display:flex;align-items:center;justify-content:space-between;gap:14px;padding-top:14px;padding-bottom:14px;}
.wus-brand{display:inline-flex;align-items:center;gap:9px;text-decoration:none;font-family:var(--wserif);font-weight:800;font-size:21px;color:var(--wink);}
.wus-brand .logo-mark{width:30px;height:30px;}
.wus-brand b{color:var(--wred);}
.wus-nav-links{display:flex;gap:20px;font-size:14px;font-weight:600;}
.wus-nav-links a{color:#3a3a40;text-decoration:none;}
.wus-nav-links a:hover{color:var(--wred);}
.wus-nav-cta{background:var(--wred);color:#fff;border:0;border-radius:7px;padding:9px 16px;font:inherit;font-weight:700;font-size:14px;cursor:pointer;}
.wus-nav-cta:hover{background:var(--wred-d);}
@media(max-width:760px){.wus-nav-links{display:none;}}
/* hero */
.wus-hero{background:linear-gradient(180deg,#fff 0%,#fbf7f4 100%);border-bottom:1px solid var(--wbd);}
.wus-hero .wus-in{padding-top:clamp(40px,7vw,72px);padding-bottom:clamp(40px,7vw,72px);text-align:center;}
.wus-hero h1{font-size:clamp(30px,6vw,50px);line-height:1.06;font-weight:800;margin:0 auto 18px;max-width:14ch;}
.wus-lead{font-size:clamp(16px,2.4vw,19px);line-height:1.55;color:#4a4a52;max-width:60ch;margin:0 auto 26px;}
.wus-spon{display:inline-block;margin-top:22px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#a9a9b2;}
.wus-cta-row{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;}
/* red primary button (advertorial CTAs) — .btn is orange site-wide; overridden ONLY on this page */
.wus .btn{background:var(--wred);color:#fff;border:0;border-radius:9px;box-shadow:0 4px 0 var(--wred-d);
  font-weight:800;padding:15px 26px;font-size:clamp(15px,2vw,16px);display:inline-flex;align-items:center;gap:8px;min-height:54px;}
.wus .btn:hover{background:var(--wred-d);filter:none;transform:translateY(-1px);}
.wus .btn:active{transform:translateY(2px);box-shadow:0 2px 0 var(--wred-d);}
.wus .btn .btn-arrow .icon{stroke:#fff;}
/* section shell */
.wus-block{padding:clamp(36px,6vw,60px) 0;}
.wus-h2{font-size:clamp(24px,4vw,34px);line-height:1.12;font-weight:800;text-align:center;margin:0 0 8px;}
.wus-block-sub{text-align:center;color:var(--wmut);max-width:56ch;margin:0 auto 30px;}
/* employer cards */
.wus-emps{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;max-width:900px;margin:0 auto;}
.wus-emp{display:block;background:var(--wcard);border:1px solid var(--wbd);border-radius:14px;padding:22px;text-decoration:none;color:inherit;transition:box-shadow .15s,transform .12s;}
.wus-emp:hover{box-shadow:0 14px 30px rgba(17,24,39,.10);transform:translateY(-2px);}
.wus-emp-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
.wus-emp-name{font-family:var(--wserif);font-size:20px;font-weight:700;margin:0;}
.wus-emp-roles{color:var(--wmut);font-size:14px;margin:6px 0 0;}
.wus-emp-loc{margin:12px 0 0;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--wred);font-weight:700;}
.wus-emp-ic .icon{color:#b7b7c0;width:18px;height:18px;}
.wus-emp:hover .wus-emp-ic .icon{color:var(--wred);}
.wus-emp-apply{display:inline-flex;align-items:center;gap:6px;margin-top:16px;color:var(--wred);font-weight:800;font-size:14px;}
.wus-emp-apply .icon{width:16px;height:16px;}
/* fast band */
.wus-fast{background:#faf5ef;border-top:1px solid var(--wbd);border-bottom:1px solid var(--wbd);}
.wus-fast .wus-in{padding-top:clamp(36px,6vw,58px);padding-bottom:clamp(36px,6vw,58px);text-align:center;}
.wus-fast p{color:#4a4a52;max-width:60ch;margin:12px auto 24px;font-size:clamp(15px,2vw,17px);line-height:1.55;}
/* benefits */
.wus-bens{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;max-width:1000px;margin:0 auto;}
.wus-ben{background:var(--wcard);border:1px solid var(--wbd);border-radius:14px;padding:22px;}
.wus-ben-ic{display:inline-grid;place-items:center;width:42px;height:42px;border-radius:10px;background:rgba(210,59,43,.10);color:var(--wred);margin-bottom:12px;}
.wus-ben-ic .icon{width:21px;height:21px;}
.wus-ben h3{font-family:inherit;font-size:16px;font-weight:700;margin:0 0 5px;}
.wus-ben p{color:var(--wmut);font-size:14px;line-height:1.5;margin:0;}
/* story */
.wus-story{background:#fff;}
.wus-story .wus-in{max-width:760px;padding-top:clamp(36px,6vw,58px);padding-bottom:clamp(36px,6vw,58px);}
.wus-story-tag{display:inline-block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--wpur);font-weight:800;margin-bottom:12px;}
.wus-story h2{font-size:clamp(24px,4vw,36px);line-height:1.14;font-weight:800;margin:0 0 18px;}
.wus-story h3{font-family:inherit;font-size:19px;font-weight:800;margin:28px 0 8px;color:var(--wink);}
.wus-story p{color:#3d3d44;font-size:16px;line-height:1.7;margin:0 0 14px;}
.wus-story-note{margin-top:26px;padding:12px 16px;background:#f7f5f2;border-left:3px solid var(--wbd);border-radius:0 8px 8px 0;color:var(--wmut);font-size:13px;line-height:1.55;}
/* faq */
.wus-faq{max-width:760px;margin:0 auto;border:1px solid var(--wbd);border-radius:14px;overflow:hidden;background:#fff;}
.wus-faq details{border-bottom:1px solid var(--wbd);}
.wus-faq details:last-child{border-bottom:0;}
.wus-faq summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;font-weight:700;color:var(--wink);}
.wus-faq summary::-webkit-details-marker{display:none;}
.wus-faq summary .wus-faq-x{color:var(--wred);font-size:22px;line-height:1;transition:transform .2s;flex:0 0 auto;}
.wus-faq details[open] summary .wus-faq-x{transform:rotate(45deg);}
.wus-faq p{margin:0;padding:0 20px 18px;color:var(--wmut);line-height:1.6;}
/* closing */
.wus-closing{background:linear-gradient(180deg,#fbf7f4,#f6efe8);border-top:1px solid var(--wbd);}
.wus-closing .wus-in{padding-top:clamp(40px,6vw,64px);padding-bottom:clamp(40px,6vw,64px);text-align:center;}
.wus-closing p{color:#4a4a52;max-width:52ch;margin:12px auto 24px;font-size:clamp(15px,2vw,17px);line-height:1.55;}
/* related */
.wus-related{background:#fff;border-top:1px solid var(--wbd);}
.wus-rel-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;max-width:1000px;margin:0 auto;}
.wus-rel{display:block;background:var(--wcard);border:1px solid var(--wbd);border-radius:14px;padding:20px;text-decoration:none;color:inherit;transition:box-shadow .15s,transform .12s;}
.wus-rel:hover{box-shadow:0 14px 30px rgba(17,24,39,.10);transform:translateY(-2px);}
.wus-rel h3{font-family:var(--wserif);font-size:18px;font-weight:700;margin:0 0 8px;line-height:1.2;}
.wus-rel p{color:var(--wmut);font-size:14px;line-height:1.55;margin:0;}
/* ad slots sit between bands — center them */
.wus-guide .ad-reserve{margin:22px auto;}
/* ---- PURPLE modal skin (reference) — overrides the shared .usa-* classes, page-local ---- */
.usa-dialog{background:#fff;border-radius:8px;max-width:460px;padding:0 0 22px;overflow:hidden;box-shadow:0 20px 38px rgba(17,24,39,.20);}
.usa-backdrop{background:rgba(24,18,45,.42);backdrop-filter:blur(4px) saturate(.95);-webkit-backdrop-filter:blur(4px) saturate(.95);}
.usa-progress{height:8px;border-radius:0;margin:0 0 4px;background:#eceff3;}
.usa-bar{background:#5b35a0;border-radius:0;}
.usa-step-label{display:none;}
.usa-body{padding:0;}
.usa-q{font-family:inherit;font-size:21px;font-weight:800;line-height:1.32;text-align:center;color:#202124;padding:28px 24px 8px;margin:0;}
.usa-sub{text-align:center;color:#6b6b72;font-size:14px;padding:0 24px;margin:2px 0 14px;}
.usa-opts{padding:8px 24px 0;gap:12px;}
.usa-opt{justify-content:center;text-align:center;min-height:52px;border-radius:6px;background:#5b35a0;color:#fff;font-weight:600;font-size:15px;box-shadow:none;padding:12px 16px;}
.usa-opt:hover{background:#4f2d8b;filter:none;transform:none;}
.usa-opt:active{transform:none;box-shadow:none;}
.usa-opt .usa-opt-label{flex:0 1 auto;}
.usa-opt .btn-arrow,.usa-opt svg{display:none;}
.usa-done{padding-top:26px;}
.usa-done .usa-check{display:none;}
.usa-done .usa-q{padding:0 24px 2px;}
.usa-done .usa-sub{margin-bottom:16px;}
.usa-done .btn{background:#5b35a0;color:#fff;border:0;border-radius:6px;box-shadow:none;min-height:64px;width:calc(100% - 48px);min-width:0;max-width:none;margin:0 24px;padding:14px 20px;font-weight:700;font-size:16px;justify-content:center;}
.usa-done .btn:hover{background:#4f2d8b;transform:none;}
.usa-done .btn svg,.usa-done .btn .icon,.usa-done .btn .btn-arrow{display:none;}
.usa-loading .usa-progress-fill{background:#5b35a0;}
.usa-loading .usa-progress-track{background:#eceff3;}
.usa-loading .usa-q{padding-top:26px;}
.usa-escape{padding:0 24px;}
.usa-escape a{color:#8a8a92;}
/* apply-gate modal close X (this dialog IS dismissable — unlike the forward-only intake quiz) */
.usa-x{position:absolute;top:10px;right:10px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:0;border-radius:8px;background:transparent;color:#6b6b72;cursor:pointer;z-index:2;}
.usa-x:hover{background:#f1eef8;color:#202124;}
.usa-x .icon{stroke:currentColor;}
#wus-apply-modal .usa-dialog{position:relative;}
/* "Apply now" CTA bands spaced between advertorial sections */
.wus-cta-band{margin:26px auto 0;max-width:640px;text-align:center;}
.wus-cta-band p{margin:0 0 14px;color:var(--wmut);font-size:15px;}
.wus-cta-band .btn,.wus-apply-cta{min-width:230px;}
/* ---- /worldwide-us/apply/ how-to-apply guide ---- */
.wus-hero-apply{text-align:center;}
.wus-hero-apply .wus-lead{margin-left:auto;margin-right:auto;}
.wus-block-lead{max-width:64ch;margin:6px auto 22px;text-align:center;color:#4a4a52;font-size:clamp(15px,2vw,17px);line-height:1.55;}
.wus-steps{display:flex;flex-direction:column;gap:16px;max-width:760px;margin:8px auto 0;}
.wus-step{display:flex;gap:16px;align-items:flex-start;background:var(--wcard);border:1px solid var(--wbd);border-radius:12px;padding:18px 20px;}
.wus-step-n{flex:0 0 auto;width:38px;height:38px;border-radius:50%;background:var(--wpur);color:#fff;font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center;}
.wus-step h3{margin:2px 0 6px;font-size:18px;color:var(--wink);}
.wus-step p{margin:0;color:#4a4a52;font-size:15px;line-height:1.55;}
.wus-boards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;max-width:900px;margin:8px auto 0;}
.wus-board{display:flex;flex-direction:column;gap:8px;background:var(--wcard);border:1px solid var(--wbd);border-radius:12px;padding:18px 20px;text-decoration:none;color:inherit;transition:border-color .15s,box-shadow .15s;}
.wus-board:hover{border-color:var(--wpur);box-shadow:0 6px 18px rgba(91,53,160,.10);}
.wus-board-h{display:flex;justify-content:space-between;align-items:center;gap:10px;}
.wus-board-h h3{margin:0;font-size:18px;color:var(--wink);}
.wus-board-h span{color:var(--wmut);display:flex;}
.wus-board p{margin:0;color:#4a4a52;font-size:14px;line-height:1.5;flex:1;}
.wus-board-go{color:var(--wpur);font-weight:700;font-size:14px;display:inline-flex;align-items:center;gap:4px;}
.wus-scam .wus-scam-list{list-style:none;padding:0;max-width:720px;margin:0 auto 18px;display:flex;flex-direction:column;gap:10px;}
.wus-scam-list li{position:relative;padding-left:30px;color:#4a4a52;font-size:15px;line-height:1.5;}
.wus-scam-list li::before{content:"";position:absolute;left:8px;top:8px;width:8px;height:8px;border-radius:50%;background:var(--wred);}
.wus-scam p{max-width:720px;margin:0 auto;color:#4a4a52;font-size:15px;line-height:1.55;text-align:center;}
</style>`;

function buildWorldwideUs() {
  const total = WORLDWIDE_US_MODAL.questions.length + 1;
  const openBtn = (label) => `<button class="btn" type="button" data-usa-open>${esc(label)}${arrow()}</button>`;
  // "Apply now" CTAs on the advertorial: they DON'T reopen the quiz. Each opens the opt-in rewarded
  // gate (Jobs.initWusApply) and, on ANY terminal outcome (granted / no-fill / error / timeout /
  // escape — never a trap), sends the visitor to the how-to-apply guide at /worldwide-us/apply/.
  const applyBtn = (label) => `<button class="btn wus-apply-cta" type="button" data-wus-apply>${esc(label || "Apply now")}${arrow()}</button>`;

  // Sector employer cards (NOT real trademarks) → reputable board searches. rel + no-intercept per
  // the funnel-link rules; we are not a recruiter, so these hand off to the board, not "us".
  const employers = [
    { name: "National Retail Group", roles: "Store associates, cashiers, stockers", loc: "Multiple US locations", url: "https://www.indeed.com/q-retail-associate-jobs.html" },
    { name: "US Logistics & Fulfillment", roles: "Warehouse, packing, delivery drivers", loc: "US distribution centers", url: "https://www.indeed.com/q-warehouse-jobs.html" }
  ];
  const empCards = employers.map((e) => `<a class="wus-emp" href="${esc(e.url)}" target="_blank" rel="nofollow noopener sponsored" data-po-no-intercept>
    <div class="wus-emp-top">
      <div>
        <h3 class="wus-emp-name">${esc(e.name)}</h3>
        <p class="wus-emp-roles">${esc(e.roles)}</p>
        <p class="wus-emp-loc">${esc(e.loc)}</p>
      </div>
      <span class="wus-emp-ic">${icon("external", 18)}</span>
    </div>
    <span class="wus-emp-apply">View openings ${icon("arrow", 16)}</span>
  </a>`).join("\n");

  // Benefit callouts — TRUE framing, hedged (no invented guarantee — root §4 Fight 2).
  const bens = [
    { ic: "spark",  t: "No experience needed", d: "Many entry-level roles train you on the job — bring a willingness to learn." },
    { ic: "clock",  t: "Flexible schedules",   d: "Morning, afternoon, evening and weekend shifts are commonly available." },
    { ic: "dollar", t: "Weekly pay",           d: "Weekly or bi-weekly pay with direct deposit is common at many employers." },
    { ic: "arrow",  t: "Growth paths",         d: "Internal promotion programs let many workers move into supervision over time." }
  ];
  const benCards = bens.map((b) => `<div class="wus-ben">
    <span class="wus-ben-ic">${icon(b.ic, 21)}</span>
    <h3>${esc(b.t)}</h3>
    <p>${esc(b.d)}</p>
  </div>`).join("\n");

  const faqs = [
    { q: "Do I need previous experience to apply?", a: "No. Many employers in the United States are actively hiring entry-level workers and provide on-the-job training. Roles in retail, logistics, warehousing and customer service routinely accept candidates with no prior experience." },
    { q: "How quickly can I start working?", a: "It varies by employer. Many positions move from application to first day within one to two weeks, and some run same-week onboarding for in-demand roles. The official posting has the current timeline." },
    { q: "Are these jobs full-time or part-time?", a: "Both. You can filter by shift and weekly hours when you view vacancies. Many employers also offer flexible scheduling, evening shifts and weekend-only options." },
    { q: "Is the application really free?", a: "Yes. Applying is always free. Be cautious of anyone asking for upfront fees, equipment deposits or payment to 'reserve' a position — those are scams, not real employers." }
  ];
  const faqBlock = faqs.map((f) => `<details><summary><span>${esc(f.q)}</span><span class="wus-faq-x" aria-hidden="true">+</span></summary><p>${esc(f.a)}</p></details>`).join("\n");

  // Related reads — decorative internal links. The reference's "Skilled Worker Visa" card is REPLACED
  // with a scam-avoidance one (HARD guardrail: never a visa / sponsorship / relocation angle).
  const related = [
    { t: "Hard Skills vs Soft Skills: What Employers Value Most", d: "Why the strongest candidates lead with results — and how to balance technical depth with communication and reliability." },
    { t: "LinkedIn vs Indeed vs Glassdoor: Which Platform Fits You", d: "A head-to-head on reach, recruiter quality and signal — and how to use each one differently." },
    { t: "How to Spot and Avoid Job Scams", d: "A real employer never asks you to pay to start. The warning signs to watch for before you apply anywhere." }
  ];
  const relCards = related.map((r) => `<a class="wus-rel" href="${B}">
    <h3>${esc(r.t)}</h3>
    <p>${esc(r.d)}</p>
  </a>`).join("\n");

  // The whole advertorial — rendered visible-but-blurred behind the pop-up, revealed on reward.
  const guide = `<div id="wus-guide" class="wus wus-guide wp-preview">
<header class="wus-head">
  <div class="wus-topbar"><div class="wus-in">
    <span class="wus-topbar-l">Global job guidance · Updated ${esc(BUILD_MONTH)}</span>
    <span><a href="${B}about/">About</a><a href="${B}">Resources</a><a href="${B}">News</a></span>
  </div></div>
  <div class="wus-nav"><div class="wus-in">
    <a class="wus-brand" href="${B}">${logoMark()}<span>Job Guide <b>Match</b></span></a>
    <nav class="wus-nav-links"><a href="${B}">Home</a><a href="${B}">Industries</a><a href="${B}">Platforms</a><a href="${B}about/">About</a></nav>
    <button class="wus-nav-cta" type="button" data-wus-apply>Apply now</button>
  </div></div>
</header>

<section class="wus-hero"><div class="wus-in">
  <h1>Job opportunities in the United States are waiting for you</h1>
  <p class="wus-lead">Thousands of employers across the US are hiring this week — many entry-level, with weekly pay and flexible shifts common. Here's how to apply.</p>
  <div class="wus-cta-row">${applyBtn("Apply now")}</div>
  <span class="wus-spon">Sponsored</span>
</div></section>

${adSlot("leaderboard")}

<section class="wus-block"><div class="wus-in">
  <h2 class="wus-h2">Featured employers hiring now</h2>
  <div class="wus-emps">
${empCards}
  </div>
  <div class="wus-cta-band">
    <p>Ready to get started? See exactly how to apply, step by step.</p>
    ${applyBtn("Apply now")}
  </div>
</div></section>

<section class="wus-fast"><div class="wus-in">
  <h2 class="wus-h2">The fastest way to land your next role</h2>
  <p>Major US employers post hundreds of new openings every day. The candidates who move first — and apply on the right platforms — are the ones getting hired this month.</p>
  ${applyBtn("Apply now")}
</div></section>

<section class="wus-block"><div class="wus-in">
  <h2 class="wus-h2">Why these jobs are worth a look</h2>
  <div class="wus-bens">
${benCards}
  </div>
  <div class="wus-cta-band">
    <p>These roles fill fast. Here's the step-by-step on how to apply.</p>
    ${applyBtn("Apply now")}
  </div>
</div></section>

${adSlot("inContent")}

<section class="wus-story"><div class="wus-in">
  <span class="wus-story-tag">A typical path</span>
  <h2>How a job at a major US employer can change everything</h2>
  <p>Picture someone who spent nearly a year looking for stable work after the place they worked shut down. Dozens of applications, little response — until they hear that a large employer nearby is hiring entry-level staff and decide to apply.</p>
  <h3>A simple application</h3>
  <p>The application takes about ten minutes. For roles like these the hiring team often reaches out within a couple of days and offers an in-person interview, and a start date can follow within the same week.</p>
  <h3>Training on day one</h3>
  <p>No warehouse certifications or college degree required. A paid orientation typically covers safety, operations and customer service — enough to be productive from the first full shift.</p>
  <h3>Weekly pay you can plan around</h3>
  <p>For the first time in a long while, a predictable amount arrives every week. That steadiness is what lets people catch up on bills and start putting a little aside.</p>
  <h3>A path upward</h3>
  <p>Within months, reliable workers are often the first considered for shift-lead and supervisor roles — many large employers prefer to promote from within, so the people who show up and do the work move up first.</p>
  <h3>What this means for you</h3>
  <p>This path isn't unusual. Major US employers are actively hiring right now, and most care more about reliability and attitude than a resume. If you're ready to start, the next step is knowing how to apply.</p>
  <div class="wus-cta-band">${applyBtn("Apply now")}</div>
  <p class="wus-story-note">Illustrative example. This is a representative account of a common entry-level hiring path, not a specific individual, and is not a promise of results, pay or timing. Actual roles, pay and timelines are set by each employer and shown on the official posting.</p>
</div></section>

<section class="wus-block"><div class="wus-in">
  <h2 class="wus-h2">Frequently asked questions</h2>
  <div class="wus-faq">
${faqBlock}
  </div>
</div></section>

${adSlot("results")}

<section class="wus-closing"><div class="wus-in">
  <h2 class="wus-h2">The United States is ready for you</h2>
  <p>Employers across all 50 states are hiring this week. See the step-by-step guide on where and how to apply.</p>
  ${applyBtn("Apply now")}
</div></section>

<section class="wus-related"><div class="wus-in wus-block">
  <h2 class="wus-h2">Related reads</h2>
  <div class="wus-rel-grid">
${relCards}
  </div>
</div></section>
${anchorAd()}
</div>`;

  // Opt-in rewarded gate behind every "Apply now" CTA. Reuses the shared .usa-* modal styling (so it
  // picks up the page's purple skin) but is a SEPARATE dialog from the intake quiz. Always dismissable
  // via the honest escape; on any terminal reward outcome the visitor lands on /worldwide-us/apply/.
  const applyModal = `<div class="usa-modal" id="wus-apply-modal" hidden role="dialog" aria-modal="true" aria-labelledby="wus-apply-title">
  <div class="usa-backdrop" data-wus-apply-close></div>
  <div class="usa-dialog" role="document">
    <button class="usa-x" type="button" id="wus-apply-x" aria-label="Close" data-wus-apply-close>${icon("close", 20)}</button>
    <div class="usa-body">
      <div class="usa-done">
        <h2 class="usa-q" id="wus-apply-title">You're one step from the full apply guide</h2>
        <p class="usa-sub" id="wus-apply-msg">Watch a short video from our sponsor to open the step-by-step guide — the platforms to use, how to apply, and how to spot scams. No sign-up.</p>
        <button class="btn" type="button" id="wus-apply-btn"><span id="wus-apply-label">Show me how to apply</span></button>
        <p class="usa-escape" id="wus-apply-escape" hidden><a href="#" id="wus-apply-escape-link">Skip and see how to apply</a></p>
      </div>
    </div>
  </div>
</div>`;

  const body = `${WUS_SKIN}
${guide}
${usaModal({ total, ariaLabel: "Job opportunities in the USA" })}
${applyModal}`;

  const cfg = {
    questions: WORLDWIDE_US_MODAL.questions.map((q) => ({
      key: q.key, q: q.q,
      options: q.options.map((o) => ({ id: o.id, label: o.label }))
    })),
    spa: true,
    revealId: "wus-guide",
    guidePath: `${B}worldwide-us/vacancies`,   // virtual page_view on reveal (reporting parity)
    autoDelay: WORLDWIDE_US_MODAL.autoDelay,
    fn: "jobs_worldwide_us",                    // distinct GA4 funnel id so this clone separates in reporting
    searchLoader: "Searching for jobs near you",
    copy: {
      title: "We found vacancies for you",
      sub: "A short sponsored video plays first.",
      searchSub: "Matching you to roles hiring now…",
      btn: "View vacancies",
      loading: "Loading…",
      almost: "Almost there",
      finish: "Finish the short video to view your vacancies.",
      again: "View vacancies",
      skip: "Skip and view vacancies"
    }
  };

  // Second (opt-in) rewarded gate — behind the "Apply now" CTAs on the revealed advertorial. Never a
  // trap: granted / no-fill / error / timeout / escape all send the visitor to the how-to-apply guide.
  const applyGateCfg = {
    next: `${B}worldwide-us/apply/`,
    fn: "jobs_worldwide_us_apply",     // distinct GA4 funnel id for the apply-gate
    copy: {
      title: "You're one step from the full apply guide",
      sub: "Watch a short video from our sponsor to open the step-by-step guide — the platforms to use, how to apply, and how to spot scams. No sign-up.",
      loading: "Loading your video…",
      almost: "Almost there",
      finish: "Finish the short video to open your apply guide.",
      again: "Watch again to open the guide",
      skip: "Skip and see how to apply"
    }
  };

  write("worldwide-us/index.html", page({
    title: `Job Opportunities in the USA — Apply This Week | ${SITE.name}`,
    desc: "Thousands of U.S. employers are hiring this week — many entry-level, with weekly pay and flexible shifts. Answer two quick questions to see what's open. Free, no sign-up.",
    noindex: true,     // paid entry — never indexed, never in the sitemap
    body,
    wide: true,
    hideHeader: true,  // the clone renders its own reference-style header inside #wus-guide
    hideAnchor: true,  // the anchor lives inside #wus-guide so it cannot render behind the overlay
    prefetch: `${B}worldwide-us/apply/`,   // warm the apply guide (and its ad divs) during the session
    pageScript: `Jobs.initUsaModal(${JSON.stringify(cfg)});Jobs.initWusApply(${JSON.stringify(applyGateCfg)});`
  }));
}

/* /worldwide-us/apply/ — the how-to-apply GUIDE, the payoff of the advertorial's "Apply now" gate.
 * A genuine, substantial, brand-safe article (this is what earns high-quality contextual ads: real
 * US-jobs content + long dwell + real outbound links, not a thin doorway). Full display ad load
 * (leaderboard + in-content + results + anchor), spaced BETWEEN substantial sections for viewability.
 * TRUE framing only — no invented stats, no salary figures, no visa/sponsorship angle (root §4 F2). */
function buildWorldwideUsApply() {
  const steps = [
    { n: "1", t: "Decide which roles fit you", d: "Start with what you can do now, not the perfect job. Entry-level roles in retail, warehousing and fulfillment, customer service, delivery, cleaning and hospitality hire year-round and train on the job. Pick two or three role types so you can apply to more openings without spreading yourself thin." },
    { n: "2", t: "Set up on the right job platforms", d: "Most US hiring runs through a handful of job boards. Create a free profile on the ones below, turn on email or app alerts for your role and city, and let new openings come to you. Applying is always free — you never pay to use a legitimate job board." },
    { n: "3", t: "Prepare a simple, honest resume", d: "One page is enough. List your contact details, the kind of work you're looking for, any past jobs with dates, and a short line on skills like reliability, teamwork or basic computer use. No experience? Say you're seeking an entry-level role and are ready to learn — many employers value attitude and availability over a long history." },
    { n: "4", t: "Apply to several roles the right way", d: "Apply to a batch each day rather than one and waiting. Use the exact job title from the posting, answer every screening question, and double-check your phone and email. Keep a short list of where and when you applied so you can follow up." },
    { n: "5", t: "Follow up, interview, and start", d: "If you haven't heard back in a week, a short polite follow-up shows you're serious. For many entry-level roles the interview is brief and practical; a start date can follow within days. Bring ID and any documents the employer asks for on the official posting." }
  ];
  const stepCards = steps.map((s) => `<div class="wus-step">
    <span class="wus-step-n">${esc(s.n)}</span>
    <div><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div>
  </div>`).join("\n");

  // Reputable, genuinely national job boards. Outbound rel + no-intercept per the funnel-link rules;
  // we are not a recruiter, so these hand off to the board. No logos (root image rule).
  const boards = [
    { name: "Indeed", d: "The largest US job board — filter by role, city, pay and shift.", url: "https://www.indeed.com/" },
    { name: "LinkedIn Jobs", d: "Strong for customer service, office and remote-friendly roles; recruiters search here.", url: "https://www.linkedin.com/jobs/" },
    { name: "Glassdoor", d: "Listings plus employee reviews so you know what a workplace is really like.", url: "https://www.glassdoor.com/Job/index.htm" },
    { name: "Snagajob", d: "Built for hourly and shift work — retail, food service, warehousing.", url: "https://www.snagajob.com/" },
    { name: "USAJOBS", d: "Official US federal government jobs. Free to apply; never asks for a fee.", url: "https://www.usajobs.gov/" }
  ];
  const boardCards = boards.map((b) => `<a class="wus-board" href="${esc(b.url)}" target="_blank" rel="nofollow noopener sponsored" data-po-no-intercept>
    <div class="wus-board-h"><h3>${esc(b.name)}</h3><span>${icon("external", 16)}</span></div>
    <p>${esc(b.d)}</p>
    <span class="wus-board-go">Search jobs ${icon("arrow", 15)}</span>
  </a>`).join("\n");

  const faqs = [
    { q: "Do I need experience or a degree to apply?", a: "No. Many US employers actively hire entry-level workers and provide paid on-the-job training. Retail, logistics, warehousing, cleaning and customer service roles routinely accept candidates with no prior experience." },
    { q: "How much does it cost to apply?", a: "Nothing. Applying is always free, and every job board above is free to use. A real employer never asks you to pay for training, equipment, a background check or to 'reserve' a position — those requests are scams." },
    { q: "How long until I hear back?", a: "It varies by employer. Many entry-level roles move from application to first day within one to two weeks, and some run same-week onboarding for in-demand positions. The official posting shows the current timeline." },
    { q: "How many jobs should I apply to?", a: "More than one. Applying to a batch of suitable roles each day, rather than waiting on a single application, is the fastest way to get interviews." }
  ];
  const faqBlock = faqs.map((f) => `<details><summary><span>${esc(f.q)}</span><span class="wus-faq-x" aria-hidden="true">+</span></summary><p>${esc(f.a)}</p></details>`).join("\n");

  const guide = `<div class="wus wus-guide">
<header class="wus-head">
  <div class="wus-topbar"><div class="wus-in">
    <span class="wus-topbar-l">Global job guidance · Updated ${esc(BUILD_MONTH)}</span>
    <span><a href="${B}about/">About</a><a href="${B}">Resources</a><a href="${B}">News</a></span>
  </div></div>
  <div class="wus-nav"><div class="wus-in">
    <a class="wus-brand" href="${B}">${logoMark()}<span>Job Guide <b>Match</b></span></a>
    <nav class="wus-nav-links"><a href="${B}">Home</a><a href="${B}">Industries</a><a href="${B}">Platforms</a><a href="${B}about/">About</a></nav>
    <a class="wus-nav-cta" href="${boards[0].url}" target="_blank" rel="nofollow noopener sponsored" data-po-no-intercept>Search jobs</a>
  </div></div>
</header>

<section class="wus-hero wus-hero-apply"><div class="wus-in">
  <h1>How to apply for jobs in the United States</h1>
  <p class="wus-lead">A clear, step-by-step guide to finding openings, applying the right way, and avoiding the scams that target job seekers. Free — no sign-up.</p>
  <span class="wus-spon">Sponsored</span>
</div></section>

${adSlot("leaderboard")}

<section class="wus-block"><div class="wus-in">
  <h2 class="wus-h2">Five steps to your next role</h2>
  <div class="wus-steps">
${stepCards}
  </div>
</div></section>

${adSlot("inContent")}

<section class="wus-block"><div class="wus-in">
  <h2 class="wus-h2">Where to search — the platforms that matter</h2>
  <p class="wus-block-lead">These are the reputable, national job boards US employers actually post to. Each is free to use. Set up alerts on two or three, and apply directly on the employer's or board's official page.</p>
  <div class="wus-boards">
${boardCards}
  </div>
</div></section>

<section class="wus-fast"><div class="wus-in">
  <h2 class="wus-h2">Make your application stand out</h2>
  <p>For entry-level roles, employers screen for reliability and availability more than a long resume. Fill in every field on the application, match the job title exactly, list the shifts and days you can work, and reply quickly if they reach out — being easy to schedule is often what moves you to the top of the list.</p>
</div></section>

${adSlot("results")}

<section class="wus-block wus-scam"><div class="wus-in">
  <h2 class="wus-h2">Avoid job scams — a real job never charges you</h2>
  <p class="wus-block-lead">Job seekers are a favorite target for fraud. Walk away from any "employer" who does the following:</p>
  <ul class="wus-scam-list">
    <li>Asks you to pay for training, equipment, a background check, or to "reserve" your spot.</li>
    <li>Offers a job with no interview and pressures you to start or pay today.</li>
    <li>Moves the conversation to WhatsApp or Telegram and promises daily cash for simple "tasks".</li>
    <li>Asks for your bank login, a copy of your ID before any interview, or an upfront deposit.</li>
    <li>Sends a check and asks you to buy gift cards or wire part of it back.</li>
  </ul>
  <p>Legitimate employers pay you — never the other way around. When in doubt, search the company name plus the word "scam", and apply through the official job boards above.</p>
</div></section>

<section class="wus-block"><div class="wus-in">
  <h2 class="wus-h2">Frequently asked questions</h2>
  <div class="wus-faq">
${faqBlock}
  </div>
</div></section>

<section class="wus-closing"><div class="wus-in">
  <h2 class="wus-h2">You're ready — start applying today</h2>
  <p>Pick a job board, turn on alerts, and send a handful of applications. The people who apply first and follow up are the ones getting hired this month.</p>
  <a class="btn" href="${boards[0].url}" target="_blank" rel="nofollow noopener sponsored" data-po-no-intercept>Search jobs on Indeed${arrow()}</a>
</div></section>
</div>`;

  const body = `${WUS_SKIN}
${guide}`;

  write("worldwide-us/apply/index.html", page({
    title: `How to Apply for Jobs in the USA — Step-by-Step Guide | ${SITE.name}`,
    desc: "A free step-by-step guide to applying for jobs in the United States: which roles hire year-round, the reputable job boards to use, how to write a simple resume, and how to avoid job scams.",
    noindex: true,     // paid-funnel payoff, near-duplicate of the advertorial angle — matches /worldwide-us/
    body,
    wide: true,
    hideHeader: true,  // renders its own reference-style header
    canonical: `${B}worldwide-us/apply/`
  }));
}

/* ---------- /worldwide-usx/ — /worldwide-us/ CLONE + a "job board" front screen (added 2026-09-08)
 * Owner request: a self-contained twin of /worldwide-us/ (buildWorldwideUs) that, on arrival, shows
 * what reads as a LIVE JOB BOARD first (a grid of roles hiring now), THEN drops the intake popup over
 * it — so the visitor feels they are about to browse real jobs, which lifts opt-in rewarded-video
 * completion (the revenue maker). Nothing here touches /worldwide-us/ or the shared SPA engine: it is
 * its OWN page with its OWN routes (worldwide-usx/ + worldwide-usx/apply/), its OWN GA4 funnel ids
 * (jobs_worldwide_usx / jobs_worldwide_usx_apply) and its OWN reveal id (#wusx-guide). It REUSES the
 * page-scoped WUS_SKIN, the shared usaModal() markup, the #wus-apply-modal markup and both runtimes
 * (Jobs.initUsaModal + Jobs.initWusApply) — all safe to reuse because each page is a separate document,
 * so the fixed ids those runtimes key off never collide across pages.
 *
 * THE ONE FUNNEL DIFFERENCE vs /worldwide-us/:
 *  - The behind-popup content LEADS with a job-listings board (`.wusx-board`), so the top of the page
 *    reads as a real job site the instant it loads. The intake popup opens on a short delay
 *    (WORLDWIDE_USX_AUTODELAY, ~1.8s) instead of 0, so the board is seen BEFORE the popup frosts it.
 *  - Once open, the intake is the SAME forward-only 2-question quiz -> "Searching for jobs near you"
 *    loader -> opt-in rewarded video -> in-page reveal. Same never-trap rewarded rules.
 *
 * COMPLIANCE (root §4 Fight 2/3 — the reason the board is honest, not a decoy):
 *  - The listings are SECTOR role types with TRUE framing ("Actively hiring", entry-level, shift
 *    options) — NO fabricated company names presented as confirmed hirers, NO invented "N jobs near
 *    you" counts, NO salary figures. A fabricated job board is bait-and-switch = FTC + Google/FB
 *    Misrepresentation = the account-level ban that zeros all revenue. The cards open the honest
 *    intake (data-usa-open); the payoff is the real how-to-apply guide that links to real boards.
 *  - The ad slots stay held back behind .wp-preview until the reward completes (no ad behind the
 *    overlay), noindex, out of the sitemap, not on the home lander — identical posture to /worldwide-us/. */
// Intake popup timing. Owner change 2026-09-14: the popup now opens IMMEDIATELY on load (autoDelay 0,
// no open-on-interaction) — same as /worldwide-usy/. (It used to wait for the first scroll/touch/key OR
// a 5s fallback so the board showed first; the owner asked for the popup up front.) Set PAUSE to true to
// return to review mode (popup never auto-opens; job cards still open it on click).
const WORLDWIDE_USX_PAUSE_POPUP = false;
const WORLDWIDE_USX_AUTODELAY = 0;      // ms: 0 = popup opens immediately on load (owner request 2026-09-14)

// Dedicated intake questions for /worldwide-usx/ (SEPARATE from WORLDWIDE_US_MODAL so /worldwide-us/ is
// untouched). Q1 carries an intro `sub` that tells the visitor WHY they're answering — the value
// exchange up front lifts completion (and it is honest: we do use the answers to frame the reward).
const WORLDWIDE_USX_MODAL = {
  questions: [
    // The "why" lives in the TITLE (big, read) — not a small sub that gets skipped.
    { key: "type", q: "Before we show your remote jobs, what kind of work do you want?",
      options: [ { id: "full", label: "Full-time" }, { id: "part", label: "Part-time" }, { id: "any", label: "Any remote role" } ] },
    { key: "start", q: "Almost there — when can you start?",
      options: [ { id: "now", label: "Immediately" }, { id: "week", label: "This week" }, { id: "month", label: "This month" } ] }
  ]
};

// Extra page-scoped CSS for the job-board front screen (layered on top of WUS_SKIN). Scoped under
// .wusx so it only affects /worldwide-usx/ and cannot leak to /worldwide-us/ or any other page.
const WUSX_SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const WUSX_BOARD_CSS = `<style>
/* Dense job-FEED look for /worldwide-usx/ (scoped under .wusx so it can't leak to /worldwide-us/):
   compact listing rows like naukri.com / monster.com, not article cards. Sans titles (serif reads
   editorial), tight padding so 4-5 rows fit one screen. Copy is generic/worldwide (remote / work from
   home — no "near you"). Badges are generic category framing only — NO invented counts or salary
   figures (hard rule on the worldwide funnel). */
.wusx .wus-topbar{display:none;}   /* remove the black top bar */
.wusx .wus-hero{display:none;}     /* no advertorial hero — a feed leads with listings */
.wusx .wus-nav{border-bottom:1px solid var(--wbd);}
/* board header + filter chips */
.wusx-board{background:#f4f5f7;}
.wusx-board .wus-in{padding-top:18px;padding-bottom:22px;}
.wusx-board-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 12px;}
.wusx-board-head h1{font-family:${WUSX_SANS};font-size:clamp(20px,3.2vw,26px);line-height:1.15;font-weight:800;letter-spacing:-.01em;margin:0;}
.wusx-board-spon{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#a9a9b2;}
.wusx-cats{display:flex;gap:8px;overflow-x:auto;padding:2px 0 4px;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.wusx-cats::-webkit-scrollbar{display:none;}
.wusx-cat{flex:0 0 auto;border:1px solid var(--wbd);background:#fff;color:#3a3a40;border-radius:999px;padding:8px 14px;font:inherit;font-family:${WUSX_SANS};font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;transition:border-color .12s,color .12s,background .12s;}
.wusx-cat:hover{border-color:var(--wred);color:var(--wred);}
.wusx-cat.on{background:var(--wink);border-color:var(--wink);color:#fff;}
.wusx-expect{font-family:${WUSX_SANS};font-size:13px;line-height:1.5;color:#5a5a62;margin:0 0 14px;max-width:70ch;}
.wusx-count{margin:14px 0 10px;font-size:12px;color:#6b6b72;font-weight:700;text-transform:uppercase;letter-spacing:.05em;font-family:${WUSX_SANS};}
/* condensed listing rows — dense enough that 4-5 fit one mobile screen, still readable */
.wusx-jobs{display:flex;flex-direction:column;gap:8px;}
.wusx-job{display:flex;align-items:flex-start;gap:11px;text-align:left;width:100%;background:#fff;border:1px solid var(--wbd);border-radius:10px;padding:11px 12px;cursor:pointer;font:inherit;color:inherit;transition:box-shadow .14s,border-color .14s,transform .1s;}
.wusx-job:hover{box-shadow:0 8px 20px rgba(17,24,39,.08);border-color:var(--wred);transform:translateY(-1px);}
.wusx-job:active{transform:translateY(0);}
.wusx-job-ic{flex:0 0 auto;width:38px;height:38px;border-radius:8px;background:rgba(210,59,43,.08);color:var(--wred);display:grid;place-items:center;margin-top:1px;}
.wusx-job-ic .icon{width:19px;height:19px;}
.wusx-job-main{flex:1 1 auto;min-width:0;}
.wusx-job-title{font-family:${WUSX_SANS};font-size:14.5px;font-weight:700;margin:0;line-height:1.22;color:var(--wink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.wusx-job-org{font-family:${WUSX_SANS};font-size:12px;color:#3a3a40;font-weight:600;margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.wusx-job-meta{font-family:${WUSX_SANS};color:#6b6b72;font-size:11.5px;margin:3px 0 0;display:flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden;}
.wusx-job-meta .wusx-loc{overflow:hidden;text-overflow:ellipsis;}
.wusx-job-meta .icon{width:11px;height:11px;flex:0 0 auto;}
.wusx-badges{display:flex;flex-wrap:nowrap;gap:5px;margin:7px 0 0;overflow:hidden;}
.wusx-badge{font-family:${WUSX_SANS};flex:0 0 auto;display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;letter-spacing:.01em;color:#356030;background:#e9f4e4;border-radius:5px;padding:3px 7px;white-space:nowrap;}
.wusx-badge.urgent{color:#a72c1f;background:#fdecea;}
.wusx-badge.remote{color:#1d4ed8;background:#e7edff;}
.wusx-job-side{flex:0 0 auto;align-self:center;}
.wusx-job-apply{display:inline-flex;align-items:center;gap:4px;background:var(--wred);color:#fff;border:0;border-radius:7px;padding:8px 12px;font:inherit;font-family:${WUSX_SANS};font-weight:800;font-size:12.5px;box-shadow:0 2px 0 var(--wred-d);white-space:nowrap;}
.wusx-job .wusx-job-apply .icon{width:12px;height:12px;stroke:#fff;}
.wusx-board-cta{text-align:center;margin:16px auto 0;}
.wusx-board-cta .btn{min-width:230px;}
@media(max-width:520px){
  .wusx-job-title{font-size:14px;-webkit-line-clamp:2;}
  .wusx-job-apply{padding:7px 10px;font-size:12px;}
}
/* compliance disclosure under the feed */
.wusx-disclose{font-family:${WUSX_SANS};font-size:11px;line-height:1.5;color:#8a8a92;margin:14px 0 0;max-width:72ch;}
/* THE MONEY BUTTON — the "watch to unlock" reward CTA (both rewarded gates on this page). A single
   high-intent ORANGE (the portfolio's reserved payoff accent) that pops against the purple modal so the
   watch action owns the one hot colour at the moment that matters. Dark ink on orange = AA contrast
   (house rule: white on #F97316 fails). Scoped to .usa-modal so it only affects this page's dialogs. */
.usa-modal .usa-done .btn{background:#f97316;color:#171717;box-shadow:0 3px 0 #c2410c;animation:wusxglow 2s ease-in-out infinite;}
.usa-modal .usa-done .btn:hover{background:#ea6a0c;color:#171717;transform:translateY(-1px);}
.usa-modal .usa-done .btn:active{transform:translateY(2px);box-shadow:0 1px 0 #c2410c;}
@keyframes wusxglow{0%,100%{box-shadow:0 3px 0 #c2410c,0 0 0 0 rgba(249,115,22,.34);}50%{box-shadow:0 3px 0 #c2410c,0 0 0 9px rgba(249,115,22,0);}}
@media(prefers-reduced-motion:reduce){.usa-modal .usa-done .btn{animation:none;}}
</style>`;

/* buildWorldwideUsx(V) builds the /worldwide-usx/ feed funnel, OR a variant of it. V defaults to the
 * original /worldwide-usx/ config so that call is byte-for-byte unchanged. The /worldwide-usy/ twin
 * (buildWorldwideUsy) passes a V that (a) opens the intake popup IMMEDIATELY on load (autoDelay 0, no
 * open-on-interaction) and (b) makes the SECOND gate a DIRECT interstitial (no opt-in rewarded modal)
 * — owner request 2026-09-14. The FIRST rewarded gate (intake video) is identical in both. */
function buildWorldwideUsx(V) {
  V = V || {};
  const slug        = V.slug || "worldwide-usx";
  const revealId    = V.revealId || "wusx-guide";
  const proxyId     = V.proxyId || "wusx-intake-proxy";
  const funnelId    = V.fn || "jobs_worldwide_usx";
  const applyFn     = V.applyFn || "jobs_worldwide_usx_apply";
  const secondGate  = V.secondGate || "rewarded";   // "rewarded" (opt-in modal) | "interstitial" (direct)
  const modalDelay  = (typeof V.autoDelay === "number") ? V.autoDelay
                       : (WORLDWIDE_USX_PAUSE_POPUP ? 2147483647 : WORLDWIDE_USX_AUTODELAY);
  const openOnIx    = (typeof V.openOnInteraction === "boolean") ? V.openOnInteraction : false;
  const outstream   = !!V.outstream;   // /worldwide-usy/ only: floating Price Optimiser Outstream video
  const total = WORLDWIDE_USX_MODAL.questions.length + 1;
  // "Apply now" CTAs on the advertorial open the SECOND opt-in rewarded gate (Jobs.initWusApply) and,
  // on ANY terminal outcome (granted / no-fill / error / timeout / escape — never a trap), send the
  // visitor to the how-to-apply guide at /worldwide-usx/apply/.
  const applyBtn = (label) => `<button class="btn wus-apply-cta" type="button" data-wus-apply>${esc(label || "Apply now")}${arrow()}</button>`;

  // Generic WORLDWIDE / remote listings (no "near you" — this is the worldwide funnel). Role CATEGORIES
  // that genuinely exist remotely everywhere. The org line is an honest aggregator descriptor (categories
  // across many employers, not one named company). COMPLIANCE (2026-09-09): urgency is NOT stamped on
  // each card any more — a per-card "Urgently hiring" on a non-specific category reads as an
  // unsubstantiated claim. Each card now carries only TRUE ATTRIBUTE badges (Remote + a real trait);
  // the single honest urgency line lives once as a section note. No counts, timestamps or salary.
  const B_REMOTE = { remote: true };
  const listings = [
    { t: "Remote Customer Service Agent", org: "Multiple remote employers", ic: "users",    loc: "Remote · Worldwide", badges: [["Remote", B_REMOTE], ["No experience"]] },
    { t: "Data Entry Clerk (Remote)",     org: "Various companies",          ic: "laptop",   loc: "Work from home",     badges: [["Remote", B_REMOTE], ["Beginner friendly"]] },
    { t: "Virtual Assistant",             org: "Global support teams",       ic: "calendar", loc: "Remote · Worldwide", badges: [["Remote", B_REMOTE], ["Flexible hours"]] },
    { t: "Online Chat Support",           org: "Remote-first companies",     ic: "wifi",     loc: "Work from home",     badges: [["Remote", B_REMOTE], ["No experience"]] },
    { t: "Remote Sales Representative",    org: "International employers",    ic: "bolt",     loc: "Remote · Worldwide", badges: [["Remote", B_REMOTE], ["Flexible hours"]] },
    { t: "Content Moderator (Remote)",    org: "Global platforms",           ic: "shield",   loc: "Work from home",     badges: [["Remote", B_REMOTE], ["Training provided"]] },
    { t: "Online Tutor / Coach",          org: "Tutoring platforms",         ic: "star",     loc: "Remote · Worldwide", badges: [["Remote", B_REMOTE], ["Flexible hours"]] },
    { t: "Data Annotation / AI Trainer",  org: "Various companies",          ic: "laptop",   loc: "Work from home",     badges: [["Remote", B_REMOTE], ["No experience"]] },
    { t: "Remote Admin Assistant",        org: "Multiple employers",         ic: "briefcase",loc: "Work from home",     badges: [["Remote", B_REMOTE], ["Full-time · Part-time"]] },
    { t: "Transcriptionist (Remote)",     org: "Global transcription teams", ic: "laptop",   loc: "Remote · Worldwide", badges: [["Remote", B_REMOTE], ["Beginner friendly"]] }
  ];
  const jobRow = (j) => {
    const badges = j.badges.map(([label, kind]) => {
      const k = kind && kind.remote ? " remote" : "";
      return `<span class="wusx-badge${k}">${esc(label)}</span>`;
    }).join("");
    // CTA is "View job" (singular) — NOT "Apply": tapping opens the how-to-apply guide (after the opt-in
    // video), it does not submit an application to that specific posting, so "Apply" would misrepresent.
    return `<button class="wusx-job" type="button" data-wus-apply aria-label="${esc(j.t)} — view job">
    <span class="wusx-job-ic">${icon(j.ic, 19)}</span>
    <span class="wusx-job-main">
      <span class="wusx-job-title">${esc(j.t)}</span>
      <span class="wusx-job-org">${esc(j.org)}</span>
      <span class="wusx-job-meta">${icon("pin", 11)}<span class="wusx-loc">${esc(j.loc)}</span></span>
      <span class="wusx-badges">${badges}</span>
    </span>
    <span class="wusx-job-side">
      <span class="wusx-job-apply">View job ${icon("arrow", 12)}</span>
    </span>
  </button>`;
  };
  const jobCards1 = listings.slice(0, 5).map(jobRow).join("\n");
  const jobCards2 = listings.slice(5).map(jobRow).join("\n");

  const cats = ["All jobs", "Remote", "Work from home", "Data entry", "Customer service", "Virtual assistant", "Sales", "Part-time"];
  const catChips = cats.map((c, i) => `<button class="wusx-cat${i === 0 ? " on" : ""}" type="button" data-wus-apply>${esc(c)}</button>`).join("");

  const boardHead = `<section class="wusx-board"><div class="wus-in">
  <div class="wusx-board-head">
    <h1>Remote &amp; work-from-home jobs</h1>
    <span class="wusx-board-spon">Sponsored</span>
  </div>
  <p class="wusx-expect">Role categories hiring across many employers worldwide — tap a role to see how and where to apply.</p>
  <div class="wusx-cats">${catChips}</div>
  <p class="wusx-count">Popular remote roles &middot; new openings added regularly</p>
  <div class="wusx-jobs">
${jobCards1}
  </div>
</div></section>`;

  const board2 = `<section class="wusx-board" style="border-top:1px solid var(--wbd)"><div class="wus-in" style="padding-top:16px">
  <p class="wusx-count">More remote roles hiring</p>
  <div class="wusx-jobs">
${jobCards2}
  </div>
  <p class="wusx-disclose">Listings show role types that are hiring across many employers worldwide. Jobs World is not an employer or recruiter — we point you to reputable job boards to apply. Advertising-supported.</p>
  <div class="wusx-board-cta"><button class="btn" type="button" data-wus-apply>See all jobs${arrow()}</button></div>
</div></section>`;

  // Sector employer cards (generic aggregator labels, NOT real trademarks) → reputable REMOTE board
  // searches. Worldwide/remote framing to match the feed above.
  const employers = [
    { name: "Global Remote Employers", roles: "Customer service, data entry, virtual assistant", loc: "Remote · Worldwide", url: "https://www.indeed.com/q-remote-jobs.html" },
    { name: "Remote-First Companies", roles: "Support, admin, content, sales", loc: "Work from home", url: "https://remoteok.com/" }
  ];
  const empCards = employers.map((e) => `<a class="wus-emp" href="${esc(e.url)}" target="_blank" rel="nofollow noopener sponsored" data-po-no-intercept>
    <div class="wus-emp-top">
      <div>
        <h3 class="wus-emp-name">${esc(e.name)}</h3>
        <p class="wus-emp-roles">${esc(e.roles)}</p>
        <p class="wus-emp-loc">${esc(e.loc)}</p>
      </div>
      <span class="wus-emp-ic">${icon("external", 18)}</span>
    </div>
    <span class="wus-emp-apply">View openings ${icon("arrow", 16)}</span>
  </a>`).join("\n");

  const bens = [
    { ic: "home",  t: "Work from home",       d: "Remote roles you can do from anywhere with a laptop and an internet connection." },
    { ic: "spark", t: "No experience needed", d: "Many entry-level remote roles train you on the job — bring a willingness to learn." },
    { ic: "clock", t: "Flexible hours",       d: "Full-time, part-time and flexible schedules are commonly available." },
    { ic: "arrow", t: "Room to grow",         d: "Entry-level remote roles that can lead to more responsibility over time." }
  ];
  const benCards = bens.map((b) => `<div class="wus-ben">
    <span class="wus-ben-ic">${icon(b.ic, 21)}</span>
    <h3>${esc(b.t)}</h3>
    <p>${esc(b.d)}</p>
  </div>`).join("\n");

  const faqs = [
    { q: "Do I need previous experience to apply?", a: "No. Many employers are actively hiring for entry-level remote roles and provide on-the-job training. Customer service, data entry, virtual assistant and moderation roles routinely accept candidates with no prior experience." },
    { q: "How quickly can I start working?", a: "It varies by employer. Many remote roles move from application to a first task or onboarding within one to two weeks, and some run same-week onboarding for in-demand roles. The official posting has the current timeline." },
    { q: "Are these jobs full-time or part-time?", a: "Both. You can filter by hours when you view vacancies. Many remote employers also offer flexible scheduling and part-time options you can fit around other commitments." },
    { q: "Is the application really free?", a: "Yes. Applying is always free. Be cautious of anyone asking for upfront fees, equipment deposits or payment to 'reserve' a position — those are scams, not real employers." }
  ];
  const faqBlock = faqs.map((f) => `<details><summary><span>${esc(f.q)}</span><span class="wus-faq-x" aria-hidden="true">+</span></summary><p>${esc(f.a)}</p></details>`).join("\n");

  // The whole page reads as a JOB BOARD (dense listing rows, urgency badges, filter chips) — not an
  // article. Visible-but-blurred behind the popup, revealed on reward. Reveal id #wusx-guide (distinct
  // from /worldwide-us/). The article-y "typical path" story + "related reads" are intentionally
  // dropped here; the substantive apply content lives on the /worldwide-usx/apply/ payoff page.
  const guide = `<div id="${revealId}" class="wus wus-guide wusx wp-preview">
<header class="wus-head">
  <div class="wus-nav"><div class="wus-in">
    <a class="wus-brand" href="${B}">${logoMark()}<span>Job Guide <b>Match</b></span></a>
    <nav class="wus-nav-links"><a href="${B}">Home</a><a href="${B}">Remote jobs</a><a href="${B}">Companies</a><a href="${B}about/">About</a></nav>
  </div></div>
</header>

${adSlot("leaderboard")}

${boardHead}

${adSlot("inContent")}

${board2}

${adSlot("inContent2")}

<section class="wus-block"><div class="wus-in">
  <h2 class="wus-h2">Employers hiring remote workers</h2>
  <div class="wus-emps">
${empCards}
  </div>
</div></section>

${adSlot("results")}

<section class="wus-block"><div class="wus-in">
  <h2 class="wus-h2">Why these remote roles are worth a look</h2>
  <div class="wus-bens">
${benCards}
  </div>
  <div class="wus-cta-band">
    <p>New openings are added regularly. See exactly how and where to apply.</p>
    ${applyBtn("See how to apply")}
  </div>
</div></section>

<section class="wus-block"><div class="wus-in">
  <h2 class="wus-h2">Frequently asked questions</h2>
  <div class="wus-faq">
${faqBlock}
  </div>
</div></section>

${adSlot("inContent3")}

<section class="wus-closing"><div class="wus-in">
  <h2 class="wus-h2">Remote roles are open now</h2>
  <p>Employers around the world are hiring remote and work-from-home staff. See the roles and exactly how to apply.</p>
  ${applyBtn("See how to apply")}
</div></section>
${outstream ? "" : anchorAd()}
</div>`;

  // SECOND gate behind every feed CTA. Two shapes, chosen by V.secondGate:
  //  - "rewarded": an opt-in, fully-dismissable rewarded video modal (#wus-apply-modal + Jobs.initWusApply).
  //  - "interstitial" (/worldwide-usy/): NO modal — the CTA fires a GAM interstitial directly, then
  //    continues to the apply guide (Jobs.initWusInterstitial). No confirmation dialog is rendered.
  // The #wus-apply-modal markup is only emitted for the rewarded shape (safe: a separate page, so the
  // fixed ids never collide with /worldwide-us/ or /worldwide-usx/).
  const applyModal = secondGate === "rewarded" ? `<div class="usa-modal" id="wus-apply-modal" hidden role="dialog" aria-modal="true" aria-labelledby="wus-apply-title">
  <div class="usa-backdrop" data-wus-apply-close></div>
  <div class="usa-dialog" role="document">
    <button class="usa-x" type="button" id="wus-apply-x" aria-label="Close" data-wus-apply-close>${icon("close", 20)}</button>
    <div class="usa-body">
      <div class="usa-done">
        <h2 class="usa-q" id="wus-apply-title">You're one step from the full apply guide</h2>
        <p class="usa-sub" id="wus-apply-msg">Watch a short video from our sponsor to open the step-by-step guide — the platforms to use, how to apply, and how to spot scams. No sign-up.</p>
        <button class="btn" type="button" id="wus-apply-btn"><span id="wus-apply-label">Show me how to apply</span></button>
        <p class="usa-escape" id="wus-apply-escape" hidden><a href="#" id="wus-apply-escape-link">Skip and see how to apply</a></p>
      </div>
    </div>
  </div>
</div>` : "";

  // Hidden proxy so the pre-reveal guard can open the INTAKE quiz (rewarded #1) from any feed click,
  // even though every feed CTA is wired to data-wus-apply (which post-reveal opens the second gate).
  const intakeProxy = `<button type="button" data-usa-open id="${proxyId}" hidden aria-hidden="true" tabindex="-1"></button>`;

  // Optional (V.lessBlur, /worldwide-usy/): soften the intake popup's backdrop so the feed behind is a
  // bit more visible — less blur + a lighter tint than the shared WUS skin (blur 4px / .42). Emitted
  // AFTER WUS_SKIN so it wins, and only in THIS document, so /worldwide-us/ and /worldwide-usx/ are
  // untouched (each lander is a separate page — a plain .usa-backdrop rule here cannot leak to them).
  const lessBlurCss = V.lessBlur ? `\n<style>
.usa-backdrop{background:rgba(24,18,45,.30);backdrop-filter:blur(2px) saturate(.97);-webkit-backdrop-filter:blur(2px) saturate(.97);}
</style>` : "";

  // OUTSTREAM VIDEO (V.outstream — /worldwide-usy/ ONLY; usx passes no flag so all three strings are ""
  // and its output is byte-for-byte unchanged). Implemented PER THE PARTNER "JOBGUIDEMATCH — OUTSTREAM
  // VIDEO INTEGRATION INSTRUCTIONS" (2026-09-16): ONE mount `<div data-po-outstream>` (the SDK builds the
  // IMA player + mute/skip/close INSIDE it — we never hand-roll a shell/VAST/GAM tag or a refresh timer),
  // unit `/23360556473/priceoptimiser_outstream_test`. Publisher owns ONLY the FIRST opportunity:
  // prefetch prepare() -> show() (status-checked). After the first video STARTS, Price Optimiser owns the
  // 30s refresh cycle — we never loop prepare(). Small + FROZEN (position:fixed bottom-right, rides the
  // scroll). §9: the mount MUST stay present + measurable + visible + unobscured at show(), so we do NOT
  // use `:empty{pointer-events:none}`; pointer-events are disabled ONLY in the pre-reveal state (keyed on
  // the `.po-ov-live` class, never on `:empty`), and re-enabled the moment the feed is live = show() time.
  // COMPLIANCE (root §5 — no ad behind a modal/overlay): show() fires ONLY once the feed is REVEALED and
  // NO overlay is up (guide not `.wp-preview`, body not `.usa-lock`); it is `cancel()`-disposed the instant
  // the apply modal re-opens so it can never render behind the blur. Anchor ad is dropped on this page
  // (owner: its RPM is too low) so nothing fights the video at the bottom. Fail-open throughout.
  const outstreamMount = outstream ? `<div id="po-outstream-slot" data-po-outstream></div>` : "";
  const outstreamCss = outstream ? `\n<style>
#po-outstream-slot{position:fixed;right:14px;bottom:14px;z-index:60;width:clamp(150px,38vw,240px);aspect-ratio:4/3;border-radius:12px;overflow:hidden;}
/* Present + measurable at all times (no display:none, no :empty pointer-events trick — partner §9). */
#po-outstream-slot:not(.po-ov-live){pointer-events:none;}         /* pre-reveal only; live (=show time) has pointer-events auto */
#po-outstream-slot.po-ov-live{background:#0b0b12;border:1px solid rgba(255,255,255,.14);box-shadow:0 12px 34px rgba(0,0,0,.34);}
#po-outstream-slot.po-ov-live::before{content:"Sponsored";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.5);font:600 12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;}
#po-outstream-slot:not(:empty)::before{display:none;}             /* SDK injected the player — hide the placeholder label */
#po-outstream-slot img,#po-outstream-slot video,#po-outstream-slot iframe{position:relative;width:100%;height:100%;max-width:100%;max-height:100%;}
@media (max-width:480px){#po-outstream-slot{right:10px;bottom:10px;width:clamp(140px,44vw,196px);}}
</style>` : "";
  // Publisher-driven FIRST-opportunity lifecycle, self-contained IIFE (emitted only on usy; jobs.js
  // untouched). Per the partner instructions:
  //  - PRELOAD: prepare() ahead of show — fired when the intake rewarded is initiated (#usa-reward click),
  //    or at reveal as a fallback (?skip has no rewarded). prepare() is a request only (no visible playback),
  //    so preloading while the intake modal still covers the page is fine. Called ONCE (never on a timer,
  //    never again just because show() returned not_eligible).
  //  - SHOW: only after the feed is revealed + the mount is visible/unobscured. We DO NOT treat a resolved
  //    Promise as success — only status==='showing' counts. status==='not_eligible' keeps the prepared
  //    opportunity and RETRIES show() when the mount is eligible again (no re-prepare, no new request).
  //  - REFRESH: none from us. After the first video starts, Price Optimiser handles the 30s cycle.
  //  - DISPOSE: cancel() when the apply modal opens post-reveal, so no ad renders behind the overlay.
  const outstreamScript = outstream ? `(function(){
var mount=document.getElementById('po-outstream-slot');if(!mount)return;
/* Hoist to <body>: the reveal container has a page-in transform (containing block), so a fixed child
   would anchor to that tall element, not the viewport (same fix the intake modal uses). */
if(mount.parentNode!==document.body){try{document.body.appendChild(mount);}catch(e){}}
var guide=document.getElementById(${JSON.stringify(revealId)});
function locked(){return document.body.classList.contains('usa-lock');}
function feedVisible(){return !!guide&&!guide.classList.contains('wp-preview')&&!locked();}
function resolve(){var roots=[window.PublisherExperienceSDK,window.PublisherExperience,window.PriceOptimiserExperience];for(var i=0;i<roots.length;i++){var s=roots[i];if(!s)continue;if(s.outstream&&typeof s.outstream.prepare==='function')return s.outstream;var named=[s.jobGuideMatch,s.jobguidematch,s.publisher];for(var j=0;j<named.length;j++){var n=named[j];if(n&&n.outstream&&typeof n.outstream.prepare==='function')return n.outstream;}for(var k in s){try{var v=s[k];if(v&&v.outstream&&typeof v.outstream.prepare==='function')return v.outstream;}catch(e){}}}return null;}
function rstatus(r){try{return (r&&typeof r==='object')?(r.status||''):String(r||'');}catch(e){return '';}}
function vis(el){if(!el)return false;if(document.hidden)return false;var r=el.getBoundingClientRect(),vh=window.innerHeight||0;if(r.height<=0)return false;var v=Math.min(r.bottom,vh)-Math.max(r.top,0);return v>=r.height*0.5;}
var os=null,prepared=false,showing=false,disposed=false,revealed=false;
/* PRELOAD — one prepare(); never looped, never re-fired on not_eligible. */
function preload(){if(!os||prepared||disposed||showing)return;prepared=true;try{Promise.resolve(os.prepare()).then(function(){},function(){});}catch(e){}}
/* SHOW — status-checked; not_eligible retries on the next visible tick without re-preparing. */
function tryShow(){if(!os||showing||disposed)return;if(!feedVisible()||!vis(mount))return;try{Promise.resolve(os.show()).then(function(r){var s=rstatus(r);if(s==='showing'){showing=true;}/* not_eligible / anything else: leave prepared, retry later */},function(){});}catch(e){}}
function goLive(){revealed=true;mount.classList.add('po-ov-live');preload();tryShow();}
function onLock(){if(revealed&&locked()&&!disposed){disposed=true;try{os&&os.cancel&&os.cancel();}catch(e){}}}
var tries=0;(function wait(){os=resolve();if(!os){if(++tries<50)setTimeout(wait,200);return;}
/* Prefetch during the intake rewarded (recommended timing) — fire preload when its CTA is tapped. */
try{document.addEventListener('click',function(e){var t=e.target&&e.target.closest&&e.target.closest('#usa-reward,#usa-reward-label');if(t)preload();},true);}catch(e){}
try{var mo=new MutationObserver(function(){if(feedVisible())goLive();onLock();});mo.observe(document.body,{attributes:true,attributeFilter:['class']});if(guide)mo.observe(guide,{attributes:true,attributeFilter:['class']});}catch(e){}
var n=0;(function loop(){if(disposed)return;if(feedVisible())goLive();onLock();if(++n<900)setTimeout(loop,400);})();
})();
})();` : "";

  const body = `${WUS_SKIN}
${WUSX_BOARD_CSS}${lessBlurCss}${outstreamCss}
${guide}
${intakeProxy}
${usaModal({ total, ariaLabel: "Remote & work-from-home jobs" })}
${applyModal}${outstream ? "\n" + outstreamMount : ""}`;

  const cfg = {
    questions: WORLDWIDE_USX_MODAL.questions.map((q) => ({
      key: q.key, q: q.q, sub: q.sub,
      options: q.options.map((o) => ({ id: o.id, label: o.label }))
    })),
    spa: true,
    revealId,
    guidePath: `${B}${slug}/vacancies`,          // virtual page_view on reveal (reporting parity)
    // usx: popup opens on first interaction OR at AUTODELAY (5s), whichever is first (PAUSE → never).
    // usy: popup opens IMMEDIATELY on load (modalDelay 0, no open-on-interaction) — owner request.
    autoDelay: modalDelay,
    openOnInteraction: openOnIx,
    warmOnLoad: true,                            // start loading the rewarded ad on PAGE load (not modal open)
    fn: funnelId,                                // distinct GA4 funnel id so this clone separates in reporting
    // NO searchLoader: the rewarded is preloaded from page load (warmOnLoad) + the popup opens later, so
    // there's ample time — the CTA plays instantly without a loading bar.
    copy: {
      title: "We found vacancies for you",
      sub: "A short sponsored video plays first.",
      btn: "View vacancies",
      loading: "Loading…",
      almost: "Almost there",
      finish: "Finish the short video to view your vacancies.",
      again: "View vacancies",
      skip: "Skip and view vacancies"
    }
  };

  // Rewarded second gate (usx): opt-in video modal → apply guide.
  const applyGateCfg = {
    next: `${B}${slug}/apply/`,
    fn: applyFn,                        // distinct GA4 funnel id for the apply-gate
    copy: {
      title: "You're one step from the full apply guide",
      sub: "Watch a short video from our sponsor to open the step-by-step guide — the platforms to use, how to apply, and how to spot scams. No sign-up.",
      loading: "Loading your video…",
      almost: "Almost there",
      finish: "Finish the short video to open your apply guide.",
      again: "Watch again to open the guide",
      skip: "Skip and see how to apply"
    }
  };
  // Interstitial second gate (usy): feed CTA fires a GAM interstitial directly (no modal), then continues.
  const interstitialCfg = { next: `${B}${slug}/apply/`, fn: applyFn };

  // The second-gate wiring the pageScript emits, keyed by V.secondGate.
  const secondGateInit = secondGate === "interstitial"
    ? `Jobs.initWusInterstitial(${JSON.stringify(interstitialCfg)});`
    : `Jobs.initWusApply(${JSON.stringify(applyGateCfg)});`;

  write(`${slug}/index.html`, page({
    title: `Remote & Work-From-Home Jobs — Hiring Now | ${SITE.name}`,
    desc: "Remote and work-from-home roles hiring worldwide — customer service, data entry, virtual assistant and more. Many entry-level with training provided. Free, no sign-up.",
    noindex: true,     // paid entry — never indexed, never in the sitemap
    body,
    wide: true,
    hideHeader: true,  // the clone renders its own reference-style header inside the reveal container
    hideAnchor: true,  // the anchor lives inside the reveal container so it cannot render behind the overlay
    prefetch: `${B}${slug}/apply/`,   // warm the apply guide (and its ad divs) during the session
    pageScript: `Jobs.initUsaModal(${JSON.stringify(cfg)});${secondGateInit}`
      // Pre-reveal guard: every feed CTA is a data-wus-apply. BEFORE the feed is unlocked (guide still
      // .wp-preview) a click must open the INTAKE (rewarded #1), not the second gate — so we intercept in
      // capture phase, block the second-gate handler, and fire the hidden intake proxy. AFTER reveal the
      // guard is inert, so clicks flow to the second gate (rewarded modal on usx, interstitial on usy).
      + `(function(){var g=document.getElementById(${JSON.stringify(revealId)}),p=document.getElementById(${JSON.stringify(proxyId)});`
      + `function shown(){return g&&!g.classList.contains('wp-preview');}`
      + `document.addEventListener('click',function(e){var t=e.target&&e.target.closest&&e.target.closest('[data-wus-apply]');`
      + `if(t&&!shown()){e.preventDefault();e.stopImmediatePropagation();if(p)p.click();}},true);})();`
      + outstreamScript   // Outstream video lifecycle — "" on usx (unchanged), the IIFE on usy only
  }));
}

/* /worldwide-usx/apply/ + /worldwide-usx/apply/tips/ — the REMOTE/WORLDWIDE how-to-apply guide, SPLIT
 * across TWO pages (payoff of the feed's Apply rewarded gate). Splitting is the session-depth lever
 * (root §2): each page is its own URL = its own pageview = its own full set of ad units, so the payoff
 * earns ~2× the display impressions of a single page — genuine content on both (not a thin doorway),
 * connected by an honest "Next" read-more (no extra ad gate). Page 1 = steps + platforms; page 2 =
 * stand-out tips + scam-avoidance + FAQ. Each carries leaderboard + inContent + results + anchor (page()
 * renders the anchor), plus a POSITIONED-but-PENDING inContent2/inContent3 that emits nothing until the
 * partner registers it (then each page is 4→6). TRUE framing, NO earnings figures (worldwide guardrail),
 * noindex. Both share one reference-style header. */
function buildWorldwideUsxApply(slug) {
  slug = slug || "worldwide-usx";
  const P1 = `${B}${slug}/apply/`, P2 = `${B}${slug}/apply/tips/`;

  // Reputable, genuinely worldwide/remote job platforms. Outbound rel + no-intercept; no logos.
  const boards = [
    { name: "We Work Remotely", d: "One of the largest remote-only job boards — support, admin, sales and more, hiring worldwide.", url: "https://weworkremotely.com/" },
    { name: "Remote OK", d: "Big remote-only board; many listings say 'worldwide' rather than naming one country — filter for those first.", url: "https://remoteok.com/" },
    { name: "Remote.co", d: "Curated remote roles with a strong customer-service and virtual-assistant section.", url: "https://remote.co/remote-jobs/" },
    { name: "LinkedIn Jobs", d: "Set the location filter to 'Remote' — recruiters search here and many roles are remote-friendly.", url: "https://www.linkedin.com/jobs/search/?f_WT=2" },
    { name: "Indeed (remote)", d: "The largest general board — search your role plus 'remote' and turn on email alerts.", url: "https://www.indeed.com/q-remote-jobs.html" }
  ];
  const boardCards = boards.map((b) => `<a class="wus-board" href="${esc(b.url)}" target="_blank" rel="nofollow noopener sponsored" data-po-no-intercept>
    <div class="wus-board-h"><h3>${esc(b.name)}</h3><span>${icon("external", 16)}</span></div>
    <p>${esc(b.d)}</p>
    <span class="wus-board-go">Search jobs ${icon("arrow", 15)}</span>
  </a>`).join("\n");

  const header = (searchUrl) => `<header class="wus-head">
  <div class="wus-nav"><div class="wus-in">
    <a class="wus-brand" href="${B}">${logoMark()}<span>Job Guide <b>Match</b></span></a>
    <nav class="wus-nav-links"><a href="${B}">Home</a><a href="${B}">Remote jobs</a><a href="${B}">Companies</a><a href="${B}about/">About</a></nav>
    <a class="wus-nav-cta" href="${searchUrl}" target="_blank" rel="nofollow noopener sponsored" data-po-no-intercept>Search jobs</a>
  </div></div>
</header>`;

  /* ---------- PAGE 1: steps + platforms ---------- */
  const steps = [
    { n: "1", t: "Pick the remote roles that fit you", d: "Start with what you can do now. Remote roles in customer service, data entry, virtual assistance, chat and content moderation, tutoring and transcription hire year-round and train on the job. Pick two or three role types so you can apply to more openings without spreading yourself thin." },
    { n: "2", t: "Set up on the right remote job platforms", d: "Most remote hiring runs through a handful of platforms. Create a free profile on the ones below, turn on alerts for your role, and let new openings come to you. Applying is always free — you never pay to use a legitimate job board." },
    { n: "3", t: "Prepare a simple, honest resume", d: "One page is enough. List your contact details, the kind of work you're looking for, any past jobs with dates, and a short line on skills like reliability, communication and basic computer use. No experience? Say you're seeking an entry-level remote role and are ready to learn — many employers value attitude and availability over a long history." },
    { n: "4", t: "Check you're set up to work remotely", d: "Most remote roles ask for a reliable internet connection, a quiet place to work and a computer or smartphone. A headset helps for support and chat roles. Note your time-zone overlap with the employer — many list the hours they need covered on the posting." },
    { n: "5", t: "Apply to several roles, then follow up", d: "Apply to a batch each day rather than one and waiting. Use the exact job title from the posting, answer every screening question, and keep a short list of where and when you applied. A short, polite follow-up after a week shows you're serious." }
  ];
  const stepCards = steps.map((s) => `<div class="wus-step">
    <span class="wus-step-n">${esc(s.n)}</span>
    <div><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div>
  </div>`).join("\n");

  const guide1 = `<div class="wus wus-guide wusx-apply">
${header(boards[0].url)}

<section class="wus-hero wus-hero-apply"><div class="wus-in">
  <h1>How to apply for remote &amp; work-from-home jobs</h1>
  <p class="wus-lead">A clear, step-by-step guide to finding remote openings and applying the right way. Free — no sign-up.</p>
  <span class="wus-spon">Sponsored</span>
</div></section>

${adSlot("leaderboard")}

<section class="wus-block"><div class="wus-in">
  <h2 class="wus-h2">Five steps to your next remote role</h2>
  <div class="wus-steps">
${stepCards}
  </div>
</div></section>

${adSlot("inContent")}

<section class="wus-block"><div class="wus-in">
  <h2 class="wus-h2">Where to search — the platforms that matter</h2>
  <p class="wus-block-lead">These are the reputable remote job platforms employers actually post to. Each is free to use. Set up alerts on two or three, and apply directly on the platform's or employer's official page.</p>
  <div class="wus-boards">
${boardCards}
  </div>
</div></section>

${adSlot("inContent2")}

${adSlot("results")}

<section class="wus-closing"><div class="wus-in">
  <h2 class="wus-h2">Next: get hired faster — and stay safe</h2>
  <p>The final part of the guide: how to make your application stand out, and how to spot the scams that target remote job seekers.</p>
  <a class="btn" href="${P2}">Continue the guide${arrow()}</a>
</div></section>
</div>`;

  write(`${slug}/apply/index.html`, page({
    title: `How to Apply for Remote & Work-From-Home Jobs | ${SITE.name}`,
    desc: "A free step-by-step guide to applying for remote and work-from-home jobs worldwide: which roles hire year-round and the reputable remote job boards to use.",
    noindex: true,
    body: `${WUS_SKIN}\n${guide1}`,
    wide: true,
    hideHeader: true,
    prefetch: P2,                 // warm page 2 (and its ad divs) while they read page 1
    canonical: P1
  }));

  /* ---------- PAGE 2: stand-out tips + scam-avoidance + FAQ ---------- */
  const faqs = [
    { q: "Do I need experience or a degree to apply?", a: "No. Many employers hire for entry-level remote roles and provide training. Customer service, data entry, virtual assistant, chat support and moderation roles routinely accept candidates with no prior experience." },
    { q: "Can I really work from another country?", a: "For many roles, yes — freelance, contractor and global-support roles hire across borders. Some employers can only hire where they are set up to run payroll, so check the 'where can you hire' note on the posting. Never trust anyone who offers to 'arrange a visa' for a fee — that is a scam." },
    { q: "How much does it cost to apply?", a: "Nothing. Applying is always free, and every platform in this guide is free to use. A real employer never asks you to pay for training, equipment, a 'starter kit' or to 'reserve' a position — those requests are scams." },
    { q: "How long until I hear back?", a: "It varies by employer. Many remote roles move from application to a first task or onboarding within one to two weeks. The official posting shows the current timeline." }
  ];
  const faqBlock = faqs.map((f) => `<details><summary><span>${esc(f.q)}</span><span class="wus-faq-x" aria-hidden="true">+</span></summary><p>${esc(f.a)}</p></details>`).join("\n");

  const guide2 = `<div class="wus wus-guide wusx-apply">
${header(boards[0].url)}

<section class="wus-hero wus-hero-apply"><div class="wus-in">
  <h1>Get hired faster — and avoid the scams</h1>
  <p class="wus-lead">How to make your remote application stand out, and how to spot the scams that target job seekers. Free — no sign-up.</p>
  <span class="wus-spon">Sponsored</span>
</div></section>

${adSlot("leaderboard")}

<section class="wus-fast"><div class="wus-in">
  <h2 class="wus-h2">Make your remote application stand out</h2>
  <p>For remote roles, employers screen for reliability, communication and a workable setup as much as a long resume. Fill in every field, match the job title exactly, mention your internet and quiet workspace, note your time-zone overlap, and reply quickly if they reach out — being easy to reach and schedule often moves you to the top of the list.</p>
</div></section>

${adSlot("inContent")}

<section class="wus-block wus-scam"><div class="wus-in">
  <h2 class="wus-h2">Avoid job scams — a real job never charges you</h2>
  <p class="wus-block-lead">Remote job seekers are a favourite target for fraud. Walk away from any "employer" who does the following:</p>
  <ul class="wus-scam-list">
    <li>Asks you to pay for training, equipment, a "starter kit", a background check, or to "reserve" your spot.</li>
    <li>Offers to "arrange a visa", relocation or a guaranteed job abroad for a fee — no one can sell you a job or a visa.</li>
    <li>Moves the conversation to WhatsApp or Telegram and promises daily cash for simple "tasks".</li>
    <li>Offers a job with no interview and pressures you to start or pay today.</li>
    <li>Asks for your bank login or a copy of your ID before any interview, or sends a check and asks you to wire part of it back.</li>
  </ul>
  <p>Legitimate employers pay you — never the other way around. When in doubt, search the company name plus the word "scam", and apply through the official platforms in this guide.</p>
</div></section>

${adSlot("results")}

<section class="wus-block"><div class="wus-in">
  <h2 class="wus-h2">Frequently asked questions</h2>
  <div class="wus-faq">
${faqBlock}
  </div>
</div></section>

${adSlot("inContent3")}

<section class="wus-closing"><div class="wus-in">
  <h2 class="wus-h2">You're ready — start applying today</h2>
  <p>Pick a platform, turn on alerts, and send a handful of applications. The people who apply first and follow up are the ones getting hired this month.</p>
  <a class="btn" href="${boards[0].url}" target="_blank" rel="nofollow noopener sponsored" data-po-no-intercept>Search remote jobs${arrow()}</a>
</div></section>
</div>`;

  write(`${slug}/apply/tips/index.html`, page({
    title: `Remote Job Application Tips & Avoiding Scams | ${SITE.name}`,
    desc: "How to make your remote job application stand out, and how to spot and avoid the scams that target remote job seekers. Free — no sign-up.",
    noindex: true,
    body: `${WUS_SKIN}\n${guide2}`,
    wide: true,
    hideHeader: true,
    canonical: P2
  }));
}

/* ---------- /worldwide-usy/ — /worldwide-usx/ TWIN (owner-requested variant, 2026-09-14)
 * A self-contained clone of the /worldwide-usx/ remote job-FEED funnel (buildWorldwideUsx), reusing the
 * SAME builders, skin, feed markup and runtime — its OWN routes (worldwide-usy/ + worldwide-usy/apply/
 * [+ /tips/]), its OWN reveal id (#wusy-guide), its OWN GA4 funnel ids. It is IDENTICAL to /worldwide-usx/
 * (including the SECOND gate = the opt-in REWARDED modal, Jobs.initWusApply) except for two small
 * presentation changes, both passed as variant flags so nothing in /worldwide-usx/ changes:
 *   1. THE INTAKE POPUP OPENS IMMEDIATELY ON LOAD (autoDelay 0, no open-on-interaction) — the visitor
 *      does not have to scroll/wait; the popup shows the instant the page arrives.
 *   2. THE INTAKE POPUP'S BACKDROP IS BLURRED LESS (lessBlur) — a lighter frost so the feed behind is a
 *      bit more visible and the visitor can see what is coming.
 * (History: a direct-interstitial second gate was tried here but reverted 2026-09-14 — the GAM
 * interstitial unit was not filling, so it showed nothing and just added a wait. Back to the rewarded
 * gate, which fills. The interstitial variant still exists in the builder via secondGate:"interstitial"
 * if fill is ever fixed.) Same compliance posture as /worldwide-usx/: honest role categories, no invented
 * counts/salary, no visa/sponsorship claim, no ad behind the overlay, noindex, out of sitemap, off the home lander. */
function buildWorldwideUsy() {
  buildWorldwideUsx({
    slug: "worldwide-usy",
    revealId: "wusy-guide",
    proxyId: "wusy-intake-proxy",
    fn: "jobs_worldwide_usy",
    applyFn: "jobs_worldwide_usy_apply",
    secondGate: "rewarded",       // SAME opt-in rewarded 2nd gate as usx (interstitial reverted — no fill)
    autoDelay: 0,                 // popup opens IMMEDIATELY on load
    openOnInteraction: false,     // no need to wait for an interaction — it is already open
    lessBlur: true,               // soften the intake popup's backdrop so the feed peeks through a little
    outstream: true               // floating Price Optimiser Outstream video on the revealed feed (usy only)
  });
}
function buildWorldwideUsyApply() { buildWorldwideUsxApply("worldwide-usy"); }

function buildUsaGuide(remoteProp) {
  // Role types (honest pay ranges) reused from the remote funnel's single source of truth.
  const roleRows = REMOTE_ROLES.map((r) => `<a class="role-row" href="${remoteProp ? propBase(remoteProp) : B + "remote/"}">
    <span class="role-ic">${icon(r.icon || "laptop", 18)}</span>
    <span class="role-main"><span class="role-title">${esc(r.title.replace(/ \(Remote\)$/, ""))}</span><span class="role-pay">${esc(r.pay)}</span></span>
    <span class="role-go">${icon("chevron", 18)}</span>
  </a>`).join("\n");

  const scamTips = [
    "A legitimate employer never asks you to pay for a job, equipment or 'training' up front.",
    "Apply on the company's own careers page or a reputable job board — not a link from a random text or DM.",
    "Be wary of offers with no interview, instant hiring, or pay that sounds too good to be true.",
    "Never share bank details or your SSN before you have a signed, verified offer.",
    "Treat 'jobs' that arrive by WhatsApp or Telegram offering daily payments for simple tasks as a scam — that pattern is a task fraud, not employment."
  ];

  const faqs = [
    { q: "Are remote jobs legitimate?", a: "Yes — many established companies hire remote customer service, data entry, tutoring and admin staff. The key is applying through official sites and reputable boards, which is what this guide links to." },
    { q: "What kind of remote work fits around school hours or family?", a: "Work paid per task or per lesson rather than by a fixed shift: tutoring, transcription, data annotation and part-time virtual assistant work. Part-time customer service is the exception — it is hourly, but many employers post short evening and weekend schedules." },
    { q: "Can I get a U.S. remote job if I live in another country?", a: "Sometimes, but usually not as an employee — most U.S. postings are limited to the U.S. because the employer has to run payroll and tax where you live. The routes that do work are covered in our guide to remote jobs you can do from any country, linked above." },
    { q: "How much can I earn working part-time from home?", a: "It varies too much to promise a figure. Task-based work pays per item completed and the volume changes week to week. Each platform publishes its own rates and the official posting is the only reliable source — treat any site that guarantees you a specific daily income as a warning sign." },
    { q: "Do I need experience or a degree to work from home?", a: "Often not. Customer service, data entry, annotation and transcription usually test you rather than ask for a CV, and training is common. Tutoring and freelance work depend on demonstrable skill rather than formal qualifications." },
    { q: "What equipment do I need?", a: "Usually a reliable computer and internet connection, and a quiet space for calls. Some employers provide equipment — the posting will say. You should never have to buy equipment from the employer itself." },
    { q: "How do I avoid work-from-home scams?", a: "A real job never asks you to pay to start. Apply only through the official links above, and never send money or bank details before a verified offer." }
  ];

  const body = `<div class="results-head">
  <span class="results-check">${icon("check", 30)}</span>
  <h1>Remote and Work-From-Home Jobs in the U.S.: Full-Time, Part-Time, and Where to Apply</h1>
</div>
${byline()}

${adSlot("leaderboard")}

<section class="content-block">
  <p class="lead">Remote and work-from-home jobs are more common than ever — in customer service, data entry, virtual assistance, tutoring and content review. This free guide covers the roles hiring most often in the United States, the part-time and flexible work that fits around a family, and the reputable boards and employers to apply through. Applying from outside the U.S.? <a href="${B}remote-jobs-worldwide/" data-po-no-intercept>Start with our international guide</a>.</p>
</section>

<section class="content-block">
  <h2>Popular types of remote jobs</h2>
  <p>These are the roles hiring most often, with the pay ranges commonly advertised. Actual pay is set by each employer and shown on the official posting.</p>
  <div class="role-list">
${roleRows}
  </div>
</section>

<section class="content-block">
  <h2>Part-time and flexible work that fits around your day</h2>
  <p>If you need work that bends around school hours, caring for someone at home, or another job, these are the options that genuinely flex. Most are paid per task, per lesson or per audio minute rather than by a fixed shift — which is what makes the hours yours, and also why the income moves week to week.</p>
  ${plainList(FLEX_ROLES)}
</section>

${adSlot("inContent")}

<section class="content-block">
  <h2>Where to find flexible, part-time work</h2>
  <p>Platforms that recruit for the flexible roles above. Most of them hire in many countries, so this list is worth checking wherever you are based. Each opens on the platform's own site, and all of them are free to join.</p>
  ${placeList(FLEX_PLATFORMS)}
</section>

<section class="content-block">
  <h2>Best places to find remote jobs in the U.S.</h2>
  <p>Job boards that specialise in remote and flexible work. Each opens on the board's own site, where you can search and apply directly — free.</p>
  ${placeList(USA_REMOTE_BOARDS)}
</section>

${adSlot("results")}

<section class="content-block">
  <h2>Companies known for hiring remote workers in the U.S.</h2>
  <p>Large U.S. employers that regularly post work-from-home roles. Openings change often — search each company's careers page for what's live today.</p>
  ${placeList(USA_REMOTE_EMPLOYERS)}
</section>

<section class="content-block">
  <div class="card">
    <h2>Applying from outside the United States?</h2>
    <p>Most of the U.S. listings above will not take an application from abroad — the employer has to run payroll and tax in the country you live in, so their postings stay inside the states they already operate in. That is a legal and accounting limit, not a judgement about you, and there are routes that work around it.</p>
    <p>Our international guide covers them: the boards that show which countries a company can hire in, the freelance platforms that connect you to clients abroad, the employers who genuinely hire across borders, and the job scams that target people applying from overseas.</p>
    <div class="hero-ctas">
      <a class="btn" href="${B}remote-jobs-worldwide/" data-po-no-intercept>Remote jobs from any country${arrow()}</a>
    </div>
  </div>
</section>

<section class="content-block">
  <h2>How to spot and avoid remote-job scams</h2>
  <ul class="ticks">${scamTips.map((t) => `<li>${icon("shield", 18)}<span>${esc(t)}</span></li>`).join("")}</ul>
</section>

${faqHTML(faqs)}

<div class="hero-ctas center">
  <a class="btn" href="${B}remote/" data-po-no-intercept>Match me to remote roles${arrow()}</a>
</div>`;

  write("usa/remote-jobs/index.html", page({
    title: `Remote & Work-From-Home Jobs in the USA — Part-Time Options and Where to Apply | ${SITE.name}`,
    desc: "A free guide to remote and work-from-home jobs in the USA: the roles hiring most often, flexible part-time work that fits around a family, reputable boards and employers to apply through, and how to avoid scams.",
    canonical: `${B}usa/remote-jobs/`,
    body,
    wide: true
  }));
}

/* ---------- /usa-packing-jobs/ — modal lander (mirrors /usa/; NO ads behind the modal) ----------
 * Reuses usaModal()'s markup/CSS and the Jobs.initUsaModal client runtime (same #usa-modal ids), so
 * there is one modal engine. Simple + clean: hero → benefits → how-it-works → FAQ, modal opens on
 * load, rewarded video, then the /usa-packing-jobs/from-home/ guide. hideAnchor + no adSlot() = no
 * ad can ever render behind the blur. */
function buildPackingLanding() {
  const h1 = "Packing Jobs in the USA — From Home & Warehouse";
  const lead = "Looking for packing or assembly work you can do from home — or a warehouse packer role hiring near you? Answer a few quick questions and we'll open a free guide to the real roles, the reputable places hiring, and how to steer clear of the packing-from-home scams.";

  const benefits = [
    { ic: "spark",  t: "No experience needed", d: "Many packing roles train you on the job." },
    { ic: "home",   t: "From-home options",    d: "Genuine at-home assembly and packing, where it exists." },
    { ic: "clock",  t: "Flexible schedules",   d: "Full-time, part-time and flexible shifts." },
    { ic: "shield", t: "Scam-safe",            d: "We only link reputable boards — a real job never charges you to start." }
  ];
  const benefitGrid = `<section class="content-block">
  <div class="usa-benefits">
${benefits.map((b) => `    <div class="usa-benefit">
      <span class="usa-benefit-ic">${icon(b.ic, 20)}</span>
      <span class="usa-benefit-t">${esc(b.t)}</span>
      <span class="usa-benefit-d">${esc(b.d)}</span>
    </div>`).join("\n")}
  </div>
</section>`;

  const how = [
    "Answer 3 quick questions about the packing work you want and when you can start.",
    "We open a free guide to real from-home and warehouse packing roles — and the reputable places hiring.",
    "You apply directly on the employer's or job board's official site — free, no account with us."
  ];
  const howBlock = `<section class="content-block">
  <h2>How it works</h2>
  <ol class="how-steps">${how.map((s, i) => `<li><span class="step-num">${i + 1}</span><span>${esc(s)}</span></li>`).join("")}</ol>
</section>`;

  const faqs = [
    { q: "Are there real packing jobs you can do from home?", a: "Yes, but they're limited — mostly at-home assembly or kitting for a business, or packing orders for a small online seller. Most packing jobs are on-site warehouse or fulfillment roles. The guide covers both honestly." },
    { q: "Do I need experience?", a: "Usually not. Warehouse packer and fulfillment roles are typically entry-level with training provided. Each posting lists its own requirements." },
    { q: "How do I avoid packing-from-home scams?", a: "A legitimate employer never asks you to pay for a 'starter kit', registration or training. If an ad wants money up front, walk away — apply only through the reputable boards and company pages the guide links to." },
    { q: "How soon could I start?", a: "It varies. Many warehouse and fulfillment employers hire quickly; smaller from-home roles depend on the employer. The official posting has the current timeline." }
  ];

  const body = `<section class="hero-card home-hero">
  <div class="hero-body">
    <span class="hero-brand">
      <span class="hero-brand-badge">${logoMark()}</span>
      <span class="hero-brand-name">${esc(SITE.name)}</span>
    </span>
    <h1>${esc(h1)}</h1>
    <p class="lead">${esc(lead)}</p>
    <div class="hero-ctas">
      <button class="btn" type="button" data-usa-open>See packing jobs hiring now${arrow()}</button>
    </div>
    <p class="micro center light">${icon("clock", 14)} Free · No sign-up · Takes about 30 seconds</p>
  </div>
</section>

${trustRow()}

${benefitGrid}

${howBlock}

${faqHTML(faqs)}

<div class="hero-ctas center">
  <button class="btn" type="button" data-usa-open>Find packing jobs near you${arrow()}</button>
</div>

${usaModal()}`;
  // Same as /usa/: NO display ad slots and hideAnchor — the modal opens on load and covers the page,
  // so no ad may sit behind the blur. Ads live on the /usa-packing-jobs/from-home/ guide instead.

  const cfg = {
    questions: PACKING_MODAL.questions.map((q) => ({
      key: q.key, q: q.q, sub: q.sub,
      options: q.options.map((o) => ({ id: o.id, label: o.label }))
    })),
    resultsUrl: `${B}usa-packing-jobs/from-home/`,   // the rewarded-ad payoff = the content guide
    autoDelay: PACKING_MODAL.autoDelay
  };

  write("usa-packing-jobs/index.html", page({
    title: `Packing Jobs in the USA — From Home & Warehouse, Hiring Now | ${SITE.name}`,
    desc: "Find real packing and assembly jobs in the USA — from-home and warehouse roles. Answer a few quick questions and get a free guide to reputable employers. Free, no sign-up.",
    canonical: `${B}usa-packing-jobs/`,
    body,
    wide: true,
    hideHeader: true,
    hideAnchor: true,   // modal covers the page on load — no ad may sit behind the blur
    prefetch: cfg.resultsUrl,   // warm the payoff guide (+ its ad slots) while the quiz is answered
    pageScript: `Jobs.initUsaModal(${JSON.stringify(cfg)});`
  }));
}

/* ---------- /usa-packing-jobs/from-home/ — the CONTENT GUIDE (the rewarded-ad payoff) ----------
 * A genuine, honest packing-jobs article (real role types, reputable boards + employers, and a
 * prominent scam-warning this niche needs) with in-content display ads spaced between substantial
 * sections. Indexable — real content that can also earn organic traffic. */
function buildPackingGuide() {
  const roleRows = PACKING_ROLES.map((r) =>
    `<li>${icon(r.icon || "box", 18)}<span><strong>${esc(r.title)}.</strong> ${esc(r.note)}</span></li>`
  ).join("\n");

  const scamTips = [
    "A legitimate employer never charges you for a job, a 'starter kit', registration or training.",
    "Be very wary of any 'work-from-home packing / envelope-stuffing / assembly-kit' ad that asks for money up front — it is the classic packing scam.",
    "Apply on the company's own careers page or a reputable job board — not a link from a random text, DM or flyer.",
    "Never send bank details or your SSN before you have a signed, verified offer from a company you've checked out."
  ];

  const faqs = [
    { q: "Can I really get paid to pack from home?", a: "Some at-home assembly, kitting and small-seller packing work is genuine, but it's limited and you should never pay to get it. Most reliable packing jobs are on-site warehouse or fulfillment roles — this guide links to both." },
    { q: "What do warehouse packing jobs pay?", a: "Pay is set by each employer and shown on the official posting. Packer and fulfillment roles are commonly advertised as hourly, often with weekly pay and training provided." },
    { q: "Do I need experience or equipment?", a: "Warehouse packing is usually entry-level with training. From-home assembly may need basic supplies, but a real employer provides materials — they don't sell them to you." },
    { q: "How do I know a packing job is legit?", a: "It never asks you to pay to start, it interviews you, and it's posted on the company's own site or a reputable board. If any of those are missing, treat it as a scam." }
  ];

  const body = `<div class="results-head">
  <span class="results-check">${icon("check", 30)}</span>
  <h1>Packing Jobs in the USA: Real From-Home & Warehouse Roles (and How to Avoid the Scams)</h1>
</div>
${byline()}

${adSlot("leaderboard")}

<section class="content-block">
  <p class="lead">"Packing jobs from home" is one of the most searched — and most scammed — job terms in the U.S. This free guide is straight with you: genuine at-home packing and assembly work exists but is limited, most real packing jobs are warehouse or fulfillment roles, and no honest employer ever charges you to start. Here are the real role types, the reputable places hiring, and how to spot a scam.</p>
</section>

<section class="content-block">
  <h2>Types of packing &amp; assembly work</h2>
  <p>What the work actually looks like — and which parts of it can genuinely be done from home.</p>
  <ul class="ticks">
${roleRows}
  </ul>
</section>

${adSlot("inContent")}

<section class="content-block">
  <h2>Where to find real packing jobs</h2>
  <p>Job boards and search filters for packing and fulfillment work. Each opens on the site's own page, where you can search and apply directly — free.</p>
  ${placeList(PACKING_BOARDS)}
</section>

${adSlot("results")}

<section class="content-block">
  <h2>Employers &amp; agencies that hire packers</h2>
  <p>Large employers and staffing agencies that regularly hire packing and fulfillment staff. Openings change often — search each site for what's live today.</p>
  ${placeList(PACKING_EMPLOYERS)}
</section>

${adSlot("inContent2")}

<section class="content-block">
  <h2>How to spot and avoid packing-job scams</h2>
  <ul class="ticks">${scamTips.map((t) => `<li>${icon("shield", 18)}<span>${esc(t)}</span></li>`).join("")}</ul>
</section>

${faqHTML(faqs)}

<div class="hero-ctas center">
  <a class="btn" href="${B}find/1/">Match me to jobs hiring near me${arrow()}</a>
</div>`;

  write("usa-packing-jobs/from-home/index.html", page({
    title: `Packing Jobs From Home in the USA — Real Roles, Reputable Employers & Scam Warnings | ${SITE.name}`,
    desc: "A free, honest guide to packing jobs in the USA: which from-home packing work is real, the warehouse and fulfillment roles hiring now, reputable places to apply, and how to avoid packing-from-home scams.",
    canonical: `${B}usa-packing-jobs/from-home/`,
    body,
    wide: true
  }));
}

/* ---------- /packing-jobs/ — WORLDWIDE modal lander (geo-neutral sibling of /usa-packing-jobs/) ----
 * For running the packing creatives as a WORLD campaign. Reuses the one modal engine (usaModal() +
 * Jobs.initUsaModal) exactly like /usa-packing-jobs/. hideAnchor + no adSlot() = no ad behind the
 * blur. Copy carries NO country-specifics; the modal adds a region self-ID question (higher completion
 * on international traffic). Rewarded video -> /packing-jobs/guide/. */
function buildWorldPackingLanding() {
  const h1 = "Packing Jobs — From Home & Warehouse, Hiring Now";
  const lead = "Looking for packing or assembly work you can do from home — or a warehouse packer role hiring near you? Answer a few quick questions and we'll open a free guide to the real roles, the reputable places hiring, and how to steer clear of the packing-from-home scams.";

  const benefits = [
    { ic: "spark",  t: "No experience needed", d: "Many packing roles train you on the job." },
    { ic: "home",   t: "From-home options",    d: "Genuine at-home assembly and packing, where it exists." },
    { ic: "clock",  t: "Flexible schedules",   d: "Full-time, part-time and flexible shifts." },
    { ic: "shield", t: "Scam-safe",            d: "We only link reputable boards — a real job never charges you to start." }
  ];
  const benefitGrid = `<section class="content-block">
  <div class="usa-benefits">
${benefits.map((b) => `    <div class="usa-benefit">
      <span class="usa-benefit-ic">${icon(b.ic, 20)}</span>
      <span class="usa-benefit-t">${esc(b.t)}</span>
      <span class="usa-benefit-d">${esc(b.d)}</span>
    </div>`).join("\n")}
  </div>
</section>`;

  const how = [
    "Answer a few quick questions about the packing work you want and when you can start.",
    "We open a free guide to real from-home and warehouse packing roles — and the reputable places hiring near you.",
    "You apply directly on the employer's or job board's official site — free, no account with us."
  ];
  const howBlock = `<section class="content-block">
  <h2>How it works</h2>
  <ol class="how-steps">${how.map((s, i) => `<li><span class="step-num">${i + 1}</span><span>${esc(s)}</span></li>`).join("")}</ol>
</section>`;

  const faqs = [
    { q: "Where are these jobs?", a: "The guide points you to major job boards and employers that show packing and warehouse roles near you — you search your own area and apply directly on their site." },
    { q: "Are there real packing jobs you can do from home?", a: "Yes, but they're limited — mostly at-home assembly or kitting for a business, or packing orders for a small online seller. Most packing jobs are on-site warehouse or fulfillment roles. The guide covers both honestly." },
    { q: "Do I need experience?", a: "Usually not. Warehouse packer and fulfillment roles are typically entry-level with training provided. Each posting lists its own requirements." },
    { q: "How do I avoid packing-from-home scams?", a: "A legitimate employer never asks you to pay for a 'starter kit', registration or training. If an ad wants money up front, walk away — apply only through the reputable boards and company pages the guide links to." }
  ];

  const body = `<section class="hero-card home-hero">
  <div class="hero-body">
    <span class="hero-brand">
      <span class="hero-brand-badge">${logoMark()}</span>
      <span class="hero-brand-name">${esc(SITE.name)}</span>
    </span>
    <h1>${esc(h1)}</h1>
    <p class="lead">${esc(lead)}</p>
    <div class="hero-ctas">
      <button class="btn" type="button" data-usa-open>See packing jobs hiring now${arrow()}</button>
    </div>
    <p class="micro center light">${icon("clock", 14)} Free · No sign-up · Takes about 30 seconds</p>
  </div>
</section>

${trustRow()}

${benefitGrid}

${howBlock}

${faqHTML(faqs)}

<div class="hero-ctas center">
  <button class="btn" type="button" data-usa-open>Find packing jobs near you${arrow()}</button>
</div>

${usaModal()}`;
  // Same as /usa/ + /usa-packing-jobs/: NO display ad slots and hideAnchor — the modal opens on load
  // and covers the page, so no ad may sit behind the blur. Ads live on the /packing-jobs/guide/ guide.

  const cfg = {
    questions: WORLD_PACKING_MODAL.questions.map((q) => ({
      key: q.key, q: q.q, sub: q.sub,
      options: q.options.map((o) => ({ id: o.id, label: o.label }))
    })),
    resultsUrl: `${B}packing-jobs/guide/`,   // the rewarded-ad payoff = the content guide
    autoDelay: WORLD_PACKING_MODAL.autoDelay
  };

  write("packing-jobs/index.html", page({
    title: `Packing Jobs — From Home & Warehouse, Hiring Now | ${SITE.name}`,
    desc: "Find real packing and assembly jobs — from-home and warehouse roles hiring now. Answer a few quick questions and get a free guide to reputable employers near you. Free, no sign-up.",
    canonical: `${B}packing-jobs/`,
    body,
    wide: true,
    hideHeader: true,
    hideAnchor: true,   // modal covers the page on load — no ad may sit behind the blur
    prefetch: cfg.resultsUrl,   // warm the payoff guide (+ its ad slots) while the quiz is answered
    pageScript: `Jobs.initUsaModal(${JSON.stringify(cfg)});`
  }));
}

/* ---------- /packing-jobs/guide/ — WORLDWIDE content guide (the rewarded-ad payoff) ----------
 * Geo-neutral honest packing-jobs article (real role types, global boards + employers, scam warning)
 * with in-content display ads between substantial sections. Indexable. */
function buildWorldPackingGuide() {
  const roleRows = WORLD_PACKING_ROLES.map((r) =>
    `<li>${icon(r.icon || "box", 18)}<span><strong>${esc(r.title)}.</strong> ${esc(r.note)}</span></li>`
  ).join("\n");

  const scamTips = [
    "A legitimate employer never charges you for a job, a 'starter kit', registration or training — in any country.",
    "Be very wary of any 'work-from-home packing / envelope-stuffing / assembly-kit' ad that asks for money up front — it is the classic packing scam worldwide.",
    "Apply on the company's own careers page or a reputable job board — not a link from a random text, DM or flyer.",
    "Never send bank details or ID documents before you have a signed, verified offer from a company you've checked out."
  ];

  const faqs = [
    { q: "Can I really get paid to pack from home?", a: "Some at-home assembly, kitting and small-seller packing work is genuine, but it's limited and you should never pay to get it. Most reliable packing jobs are on-site warehouse or fulfillment roles — this guide links to both, in any country." },
    { q: "What do packing jobs pay?", a: "Pay varies by country and employer and is set on the official posting in your local currency. Packer and fulfillment roles are commonly advertised as hourly, often with training provided." },
    { q: "Do I need experience or equipment?", a: "Warehouse packing is usually entry-level with training. From-home assembly may need basic supplies, but a real employer provides materials — they don't sell them to you." },
    { q: "How do I know a packing job is legit?", a: "It never asks you to pay to start, it interviews you, and it's posted on the company's own site or a reputable board. If any of those are missing, treat it as a scam." }
  ];

  const body = `<div class="results-head">
  <span class="results-check">${icon("check", 30)}</span>
  <h1>Packing Jobs Worldwide: Real From-Home & Warehouse Roles (and How to Avoid the Scams)</h1>
</div>
${byline()}

${adSlot("leaderboard")}

<section class="content-block">
  <p class="lead">"Packing jobs from home" is one of the most searched — and most scammed — job terms in the world. This free guide is straight with you: genuine at-home packing and assembly work exists but is limited, most real packing jobs are warehouse or fulfillment roles, and no honest employer ever charges you to start. Here are the real role types, the reputable places hiring in your country, and how to spot a scam.</p>
</section>

<section class="content-block">
  <h2>Types of packing &amp; assembly work</h2>
  <p>What the work actually looks like — and which parts of it can genuinely be done from home.</p>
  <ul class="ticks">
${roleRows}
  </ul>
</section>

${adSlot("inContent")}

<section class="content-block">
  <h2>Where to find real packing jobs</h2>
  <p>Global job boards and search engines for packing and fulfillment work. Each opens in your country, where you can search and apply directly — free.</p>
  ${placeList(WORLD_PACKING_BOARDS)}
</section>

${adSlot("results")}

<section class="content-block">
  <h2>Employers &amp; agencies that hire packers</h2>
  <p>International employers and staffing agencies that regularly hire packing and fulfillment staff across many countries. Openings change often — search each site for what's live in your area today.</p>
  ${placeList(WORLD_PACKING_EMPLOYERS)}
</section>

${adSlot("inContent2")}

<section class="content-block">
  <h2>How to spot and avoid packing-job scams</h2>
  <ul class="ticks">${scamTips.map((t) => `<li>${icon("shield", 18)}<span>${esc(t)}</span></li>`).join("")}</ul>
</section>

${faqHTML(faqs)}

<div class="hero-ctas center">
  <a class="btn" href="${B}remote/">Explore remote &amp; work-from-home jobs${arrow()}</a>
</div>`;

  write("packing-jobs/guide/index.html", page({
    title: `Packing Jobs Worldwide — Real Roles, Reputable Employers & Scam Warnings | ${SITE.name}`,
    desc: "A free, honest guide to packing jobs worldwide: which from-home packing work is real, the warehouse and fulfillment roles hiring now, reputable places to apply in your country, and how to avoid packing-from-home scams.",
    canonical: `${B}packing-jobs/guide/`,
    body,
    wide: true
  }));
}

/* ============================================================================
 * SAUDI ARABIA MULTI-LANGUAGE FUNNEL  ->  /me/<language>/   (added 2026-08-13)
 * ============================================================================
 * A sixth entry point, and the first GEO-TARGETED, MULTI-LANGUAGE one: a deliberately tiny
 * 3-question funnel for job-seekers in Saudi Arabia, built once and emitted in the five languages
 * that actually cover the Saudi labour market (see ME_LANGS). "me" = Middle East.
 *
 * SHAPE (owner spec 2026-08-13 — "only these 3 questions, then a rewarded ad, super simple"):
 *   /me/                     language hub (indexable, hreflang cluster)
 *   /me/<lang>/              Q1  What kind of job are you looking for?   <- the PAID LANDING
 *   /me/<lang>/2/            Q2  When can you start?
 *   /me/<lang>/3/            Q3  Which shift works best for you?
 *   /me/<lang>/ready/        opt-in rewarded video  ->  the guide
 *   /me/<lang>/jobs/         Saudi Arabia jobs GUIDE (the payoff + the display-ad load)
 *
 * WHY PAGE-PER-QUESTION AND NOT THE ONE-PAGE MODAL (root §2/§4): five pages per visit = five
 * ad-bearing pageviews instead of one. The modal landers (/usa/, /packing-jobs/) must suppress
 * ALL display slots because the modal covers the page (root §5) — this shape has no overlay, so
 * every step carries its ad load AND the guide keeps a full one. Session depth is the lever.
 *
 * WHY THE REWARD ASK IS ONE SHORT LINE, NOT A PITCH (owner: "don't say watch this ad to see the
 * rewarded content"): the CTA is just "Show my jobs" and the video is described by a single small
 * micro line. That line STAYS. Google's rewarded-ad policy requires the value exchange to be
 * opt-in and disclosed; a full-screen video that appears with no warning at all is an unexpected
 * interstitial = Publisher Policy strike, and on a funnel this cheap a strike costs everything.
 * One quiet line satisfies it. Same never-trap plumbing as every other funnel (playRewarded):
 * the guide opens on ANY terminal outcome — granted / no-fill / error / SDK-absent / timeout /
 * early-close→escape. Do NOT remove the escape link or the timeout reveals.
 *
 * WHY SAUDI-SPECIFIC CONTENT ON THE GUIDE: a geo campaign that lands on generic US content is a
 * bounce (and a Google Ads landing-page-relevance hit = higher CPC). The guide is real Saudi
 * content — the sectors actually hiring, Saudi job boards, the OFFICIAL government services
 * (Qiwa / HRSD / Jadarat / Musaned), employers with real careers pages, and the recruitment-fee
 * and "visa for sale" scam warnings that matter more in this market than anywhere else we run.
 * Nothing here invents a number (root §4 Fight 2) — no "5,000 jobs today", no salary figures.
 * -------------------------------------------------------------------------- */

/* The five languages. Arabic is the country's language; English is the business lingua franca;
 * Urdu, Hindi and Bengali are the languages of the three largest expatriate worker populations
 * in the Kingdom (Pakistan, India, Bangladesh). Next candidates if we widen: Tagalog, Malayalam.
 * `slug` is the URL segment (ASCII, ad-platform friendly), `code` the BCP-47 hreflang value. */
const ME_LANG_META = [
  { slug: "english", code: "en", dir: "ltr", native: "English",  english: "English" },
  { slug: "arabic",  code: "ar", dir: "rtl", native: "العربية",   english: "Arabic"  },
  { slug: "urdu",    code: "ur", dir: "rtl", native: "اردو",      english: "Urdu"    },
  { slug: "hindi",   code: "hi", dir: "ltr", native: "हिन्दी",     english: "Hindi"   },
  { slug: "bengali", code: "bn", dir: "ltr", native: "বাংলা",     english: "Bengali" }
];

/* Icons for the three questions' options — shared across every language (the option ORDER is
 * identical in all five, so one icon list serves them all). */
const ME_Q_ICONS = [
  ["briefcase", "clock", "search"],   // Q1 full-time / part-time / any role
  ["bolt", "calendar", "calendar"],   // Q2 immediately / this week / this month
  ["spark", "clock", "check"]         // Q3 morning / afternoon / any shift
];

/* Destinations. URLs + brand names are language-independent (a brand name is not translated);
 * only the one-line description is, keyed by `id` in each language's `boards`/`official`/
 * `employers` map. Outbound rel is set per group: commercial boards/employers get the standard
 * nofollow noopener sponsored, government services get nofollow noopener (they are not a
 * commercial relationship and must not be dressed as one). */
const ME_BOARDS = [
  { id: "bayt",       name: "Bayt.com",                  url: "https://www.bayt.com/en/saudi-arabia/",              icon: "search" },
  { id: "gulftalent", name: "GulfTalent",                url: "https://www.gulftalent.com/saudi-arabia/jobs",       icon: "briefcase" },
  { id: "naukrigulf", name: "Naukrigulf",                url: "https://www.naukrigulf.com/jobs-in-saudi-arabia",    icon: "users" },
  { id: "linkedin",   name: "LinkedIn Jobs",             url: "https://www.linkedin.com/jobs/",                     icon: "users" },
  { id: "indeed",     name: "Indeed Saudi Arabia",       url: "https://sa.indeed.com/",                             icon: "search" }
];
const ME_OFFICIAL = [
  { id: "qiwa",    name: "Qiwa",                                              url: "https://qiwa.sa/",              icon: "shield" },
  { id: "hrsd",    name: "Ministry of Human Resources and Social Development", url: "https://www.hrsd.gov.sa/",      icon: "building" },
  { id: "jadarat", name: "Jadarat",                                            url: "https://www.jadarat.sa/",       icon: "briefcase" },
  { id: "musaned", name: "Musaned",                                            url: "https://musaned.com.sa/",       icon: "home" }
];
const ME_EMPLOYERS = [
  { id: "aramco",   name: "Saudi Aramco",   url: "https://www.aramco.com/en/careers",       icon: "bolt" },
  { id: "sabic",    name: "SABIC",          url: "https://www.sabic.com/en/careers",        icon: "wrench" },
  { id: "neom",     name: "NEOM",           url: "https://www.neom.com/en-us/careers",      icon: "building" },
  { id: "redsea",   name: "Red Sea Global", url: "https://www.redseaglobal.com/en/careers", icon: "star" },
  { id: "almarai",  name: "Almarai",        url: "https://www.almarai.com/en/careers/",     icon: "truck" },
  { id: "alshaya",  name: "Alshaya Group",  url: "https://www.alshaya.com/en/careers/",     icon: "cart" }
];

/* --------------------------------------------------------------------------
 * TRANSLATIONS. One object per language, same keys throughout. Every user-visible string on
 * the /me/ funnel comes from here — including the FOOTER (disclosure + the 8-line site
 * disclaimer): root §5 requires the disclaimer to be readable by the visitor it protects, so
 * an Arabic lander carrying an English disclaimer would be worth nothing in a policy review.
 * ------------------------------------------------------------------------ */
const ME_T = {};

ME_T.english = {
  hubName: "English",
  close: "Close",
  quietLead: "Three quick questions, and your free guide to finding work in Saudi Arabia opens.",
  kicker: "Jobs in Saudi Arabia",
  stepFmt: "Step {n} of {t}",
  micro: "Free · No sign-up · Apply on official sites",
  qs: [
    { q: "What kind of job are you looking for?", options: ["Full-time", "Part-time", "Any available role"] },
    { q: "When can you start?",                   options: ["Immediately", "This week", "This month"] },
    { q: "Which shift works best for you?",        options: ["Morning", "Afternoon", "Any shift"] }
  ],
  ready: {
    h1: "Your job guide is ready",
    head: "Jobs in Saudi Arabia",
    btn: "Show my jobs",
    micro: "A short sponsored video plays first.",
    loading: "Loading…",
    almost: "Almost there",
    finish: "Finish the short video to open your guide.",
    again: "Show my jobs",
    skip: "Skip and open my guide",
    tipsTitle: "Before you apply",
    tips: [
      "Apply on the employer's own website or a well-known job site — never through a private message.",
      "No employer and no licensed recruitment office may ask you to pay for a job or a visa.",
      "Check your contract in Qiwa before you travel or start work."
    ]
  },
  guide: {
    title: "Jobs in Saudi Arabia — Where to Look, Who Is Hiring, How to Stay Safe",
    desc: "A free guide to finding work in Saudi Arabia: the sectors hiring, the main job sites, the official government services, employers with open careers pages, and how to avoid job and visa scams.",
    h1: "Jobs in Saudi Arabia: Where to Look, Who Is Hiring, and How to Stay Safe",
    lead: "Saudi Arabia hires across construction, retail, hospitality, logistics, healthcare and services, and employers post openings publicly all year. This free guide shows you where those openings are listed, which government services confirm that a job and a contract are real, and the fee and visa scams to walk away from.",
    secSectors: "Where the jobs are",
    secSectorsLead: "The parts of the Saudi labour market that hire most often. Every opening states its own requirements — read the posting.",
    secBoards: "Job sites for Saudi Arabia",
    secBoardsLead: "Search these yourself and apply directly. They are free to search and openings change every day.",
    secOfficial: "Official government services",
    secOfficialLead: "These are the Kingdom's own platforms. Use them to check an employer, a work permit or a contract before you commit to anything.",
    secEmployers: "Employers hiring in Saudi Arabia",
    secEmployersLead: "Large employers that publish their own vacancies. Openings change often — search each careers page for what is live today.",
    secScams: "How to avoid job and visa scams",
    faqTitle: "Common questions",
    cta: "See remote and work-from-home jobs"
  },
  sectors: [
    { title: "Construction and giga-projects", note: "NEOM, the Red Sea, Qiddiya and Diriyah keep hiring engineers, technicians, drivers, safety officers and site workers through main contractors and staffing agencies." },
    { title: "Retail, hospitality and food service", note: "Malls, hotels and restaurants recruit sales staff, cashiers, baristas, cooks and housekeeping, and tourism growth keeps these roles open in Riyadh, Jeddah, Makkah and Madinah." },
    { title: "Delivery, logistics and warehousing", note: "E-commerce and quick-commerce hire drivers, riders, warehouse pickers and packers and dispatch staff, often with training provided." },
    { title: "Healthcare, offices and technology", note: "Hospitals, banks, telecoms and government contractors recruit nurses, technicians, accountants, administrators and IT staff. Regulated roles need the relevant Saudi licence." }
  ],
  boards: {
    bayt:       "One of the largest job sites in the Middle East. Filter by city, sector and experience, and apply directly to the employer.",
    gulftalent: "Gulf-focused site with professional and technical vacancies across Saudi Arabia and the wider GCC.",
    naukrigulf: "Gulf jobs board widely used by candidates from India, Pakistan and Bangladesh, with roles at every experience level.",
    linkedin:   "Set the location to Saudi Arabia to see current openings and apply on the employer's own page.",
    indeed:     "The Saudi edition of the world's biggest job search engine — search any role and city, free."
  },
  official: {
    qiwa:    "The Ministry's labour platform. Your employment contract, job title and work permit should be visible here — check them before you travel or start.",
    hrsd:    "The Ministry of Human Resources and Social Development: labour rights, wage protection and the official channels for a complaint.",
    jadarat: "The national employment gateway, where private-sector employers publish vacancies for candidates eligible to work in the Kingdom.",
    musaned: "The only official route for domestic-worker recruitment. It shows the licensed offices and the real cost of the contract."
  },
  employers: {
    aramco:  "The national energy company recruits engineering, technical, operations and corporate staff, and runs its own training programmes.",
    sabic:   "Chemicals and manufacturing employer with plants and offices across the Kingdom, hiring engineering and operations roles.",
    neom:    "The giga-project on the Red Sea coast hires across construction, hospitality, technology and operations.",
    redsea:  "Tourism development on the west coast, recruiting for hotels, construction, environment and support services.",
    almarai: "Food and dairy company that regularly hires drivers, production, warehouse and sales staff across Saudi Arabia.",
    alshaya: "Retail operator behind many well-known mall brands, recruiting store, warehouse and support teams."
  },
  scams: [
    "A real employer never asks a worker to pay for a job. In Saudi Arabia recruitment costs are the employer's responsibility, not yours.",
    "Never buy a \"free visa\" or a visa offered on WhatsApp, Facebook or by an agent in the street. Working on one is illegal and leaves you with no protection.",
    "Only use recruitment offices licensed by the Ministry. For domestic work, that means Musaned and nothing else.",
    "Never hand over your passport, and never send bank details or identity documents before you have a verified offer.",
    "Check the contract in Qiwa before you travel: the employer name, the job title and the salary must match what you were told."
  ],
  faqs: [
    { q: "Can I apply from outside Saudi Arabia?", a: "Yes. Employers and licensed recruitment offices hire from abroad, and every job site listed here can be used from any country. Confirm the employer exists and that nobody asks you for money." },
    { q: "Do I need to speak Arabic?", a: "It depends on the role. Engineering, healthcare, technology and multinational offices often work in English, while customer-facing retail, hospitality and government-related roles usually prefer Arabic. The posting states the requirement." },
    { q: "Can I change employer once I am there?", a: "Under the Labour Reform Initiative an expatriate worker can transfer between employers when the stated conditions are met, through the official platforms. Check the current rules on Qiwa before you rely on it." },
    { q: "What should I check before accepting an offer?", a: "The contract in Qiwa, the job title, the salary, hours, housing and transport, who pays the recruitment cost, and that you were never asked for a payment." }
  ],
  foot: {
    disclosure: "Jobs World is a free job-discovery guide. We are an independent publisher and are not affiliated with, endorsed by, or a recruiter for the employers or services named on this site.",
    title: "Disclaimer",
    lines: [
      "Jobs World is an independent guide. We are <strong>not an employer, a recruiter, or an employment agency</strong>, and we do not accept, process or forward job applications.",
      "We are not affiliated with, endorsed by, or acting on behalf of any employer, job site or government service named on this site. All names and trademarks belong to their owners.",
      "<strong>We never charge for a job, and we will never ask you for payment, bank details, or identity documents.</strong> No legitimate employer asks a candidate to pay to be hired.",
      "This page lists employers, job sites and official services in an order chosen by our editors on how useful they are to a job-seeker. Nobody paid to appear here.",
      "We do not state the number of openings or the salary for any job. Vacancies and pay change constantly — always confirm on the employer's own posting.",
      "Applying happens entirely on the employer's, job site's or government service's own website. We do not see or store anything you submit there.",
      "This site is supported by advertising.",
      "External links are provided for convenience only; we are not responsible for third-party content, hiring decisions or practices. Corrections and takedown requests are welcome — see the About page."
    ],
    linkAll: "All Jobs",
    linkAbout: "About",
    langLabel: "Read this in another language"
  }
};

ME_T.arabic = {
  hubName: "العربية",
  close: "إغلاق",
  quietLead: "ثلاثة أسئلة سريعة، ويُفتح دليلك المجاني للعمل في السعودية.",
  kicker: "وظائف في المملكة العربية السعودية",
  stepFmt: "الخطوة {n} من {t}",
  micro: "مجاني · بدون تسجيل · التقديم على المواقع الرسمية",
  qs: [
    { q: "ما نوع الوظيفة التي تبحث عنها؟", options: ["دوام كامل", "دوام جزئي", "أي وظيفة متاحة"] },
    { q: "متى يمكنك البدء؟",              options: ["فوراً", "هذا الأسبوع", "هذا الشهر"] },
    { q: "ما الوردية الأنسب لك؟",          options: ["صباحية", "مسائية", "أي وردية"] }
  ],
  ready: {
    h1: "دليل الوظائف جاهز",
    head: "وظائف في السعودية",
    btn: "اعرض الوظائف",
    micro: "يُعرض مقطع فيديو إعلاني قصير أولاً.",
    loading: "جارٍ التحميل…",
    almost: "بقي القليل",
    finish: "أكمل الفيديو القصير لفتح الدليل.",
    again: "اعرض الوظائف",
    skip: "تخطَّ وافتح الدليل",
    tipsTitle: "قبل أن تتقدم",
    tips: [
      "قدّم عبر موقع صاحب العمل نفسه أو موقع توظيف معروف، وليس عبر رسالة خاصة.",
      "لا يحق لأي صاحب عمل ولا لأي مكتب استقدام مرخّص أن يطلب منك دفع مقابل وظيفة أو تأشيرة.",
      "تحقق من عقدك في منصة قوى قبل السفر أو بدء العمل."
    ]
  },
  guide: {
    title: "وظائف في السعودية — أين تبحث، من يوظّف، وكيف تتجنب النصب",
    desc: "دليل مجاني للعمل في المملكة العربية السعودية: القطاعات التي توظّف، أهم مواقع التوظيف، الخدمات الحكومية الرسمية، أصحاب العمل الذين ينشرون وظائفهم، وكيف تتجنب عمليات النصب المتعلقة بالوظائف والتأشيرات.",
    h1: "وظائف في السعودية: أين تبحث، من يوظّف، وكيف تحمي نفسك",
    lead: "توظّف المملكة العربية السعودية في الإنشاءات والتجزئة والضيافة والخدمات اللوجستية والرعاية الصحية والخدمات، وينشر أصحاب العمل شواغرهم علناً طوال العام. يوضح لك هذا الدليل المجاني أين تُنشر هذه الشواغر، وأي الخدمات الحكومية تؤكد أن الوظيفة والعقد حقيقيان، وأي عروض الرسوم والتأشيرات يجب أن تبتعد عنها.",
    secSectors: "أين توجد الوظائف",
    secSectorsLead: "القطاعات الأكثر توظيفاً في سوق العمل السعودي. لكل شاغر متطلباته الخاصة — اقرأ الإعلان.",
    secBoards: "مواقع التوظيف في السعودية",
    secBoardsLead: "ابحث بنفسك وقدّم مباشرة. البحث مجاني والشواغر تتغير يومياً.",
    secOfficial: "الخدمات الحكومية الرسمية",
    secOfficialLead: "هذه منصات المملكة الرسمية. استخدمها للتحقق من صاحب العمل أو رخصة العمل أو العقد قبل أن تلتزم بأي شيء.",
    secEmployers: "جهات توظّف في السعودية",
    secEmployersLead: "جهات كبيرة تنشر شواغرها بنفسها. الشواغر تتغير باستمرار — ابحث في كل صفحة توظيف عمّا هو متاح اليوم.",
    secScams: "كيف تتجنب النصب في الوظائف والتأشيرات",
    faqTitle: "أسئلة شائعة",
    cta: "شاهد وظائف العمل عن بُعد"
  },
  sectors: [
    { title: "الإنشاءات والمشاريع الكبرى", note: "تواصل مشاريع نيوم والبحر الأحمر والقدية والدرعية توظيف المهندسين والفنيين والسائقين ومشرفي السلامة وعمال المواقع عبر المقاولين الرئيسيين ومكاتب التوظيف." },
    { title: "التجزئة والضيافة والمطاعم", note: "توظّف المراكز التجارية والفنادق والمطاعم موظفي مبيعات وكاشيرات وباريستا وطهاة وعاملي إشراف داخلي، ونمو السياحة يبقي هذه الوظائف مفتوحة في الرياض وجدة ومكة والمدينة." },
    { title: "التوصيل والخدمات اللوجستية والمستودعات", note: "توظّف التجارة الإلكترونية سائقين ومندوبي توصيل وعاملي مستودعات وتغليف وموظفي تشغيل، وغالباً مع توفير التدريب." },
    { title: "الصحة والمكاتب والتقنية", note: "توظّف المستشفيات والبنوك وشركات الاتصالات والمتعاقدون الحكوميون ممرضين وفنيين ومحاسبين وإداريين وموظفي تقنية معلومات. المهن المنظّمة تتطلب الترخيص السعودي المناسب." }
  ],
  boards: {
    bayt:       "أحد أكبر مواقع التوظيف في الشرق الأوسط. صنّف حسب المدينة والقطاع والخبرة وقدّم مباشرة لصاحب العمل.",
    gulftalent: "موقع متخصص في الخليج بشواغر مهنية وفنية في السعودية ودول المجلس.",
    naukrigulf: "موقع وظائف خليجي يستخدمه على نطاق واسع مرشحون من الهند وباكستان وبنغلاديش، بوظائف لجميع مستويات الخبرة.",
    linkedin:   "اضبط الموقع على السعودية لعرض الشواغر الحالية وقدّم عبر صفحة صاحب العمل نفسه.",
    indeed:     "النسخة السعودية من أكبر محرك بحث عن الوظائف في العالم — ابحث عن أي وظيفة وأي مدينة، مجاناً."
  },
  official: {
    qiwa:    "منصة العمل التابعة للوزارة. يجب أن يظهر فيها عقدك ومسماك الوظيفي ورخصة عملك — تحقق منها قبل السفر أو بدء العمل.",
    hrsd:    "وزارة الموارد البشرية والتنمية الاجتماعية: حقوق العمل وحماية الأجور والقنوات الرسمية لتقديم شكوى.",
    jadarat: "البوابة الوطنية للتوظيف، حيث ينشر أصحاب العمل في القطاع الخاص شواغرهم للمؤهلين للعمل في المملكة.",
    musaned: "الطريق الرسمي الوحيد لاستقدام العمالة المنزلية. يوضح المكاتب المرخصة والتكلفة الحقيقية للعقد."
  },
  employers: {
    aramco:  "شركة الطاقة الوطنية توظّف في الهندسة والتخصصات الفنية والتشغيل والوظائف الإدارية، ولديها برامج تدريب خاصة بها.",
    sabic:   "شركة كيماويات وتصنيع لديها مصانع ومكاتب في أنحاء المملكة، وتوظّف في الهندسة والتشغيل.",
    neom:    "مشروع عملاق على ساحل البحر الأحمر يوظّف في الإنشاءات والضيافة والتقنية والتشغيل.",
    redsea:  "مشروع تطوير سياحي على الساحل الغربي، يوظّف في الفنادق والإنشاءات والبيئة وخدمات الدعم.",
    almarai: "شركة أغذية وألبان توظّف بانتظام سائقين وعاملي إنتاج ومستودعات ومبيعات في أنحاء السعودية.",
    alshaya: "مشغّل تجزئة لعدد كبير من العلامات المعروفة في المراكز التجارية، يوظّف فرق المتاجر والمستودعات والدعم."
  },
  scams: [
    "صاحب العمل الحقيقي لا يطلب من العامل دفع مقابل وظيفة. في السعودية تكاليف الاستقدام مسؤولية صاحب العمل وليست مسؤوليتك.",
    "لا تشترِ أبداً «تأشيرة حرة» أو تأشيرة معروضة عبر واتساب أو فيسبوك أو عبر وسيط في الشارع. العمل بها مخالف للنظام ويتركك بلا حماية.",
    "استخدم فقط مكاتب الاستقدام المرخصة من الوزارة. وللعمالة المنزلية، ذلك يعني منصة مساند حصراً.",
    "لا تسلّم جواز سفرك أبداً، ولا ترسل بيانات بنكية أو وثائق هوية قبل الحصول على عرض عمل موثّق.",
    "تحقق من العقد في منصة قوى قبل السفر: اسم صاحب العمل والمسمى الوظيفي والراتب يجب أن تطابق ما قيل لك."
  ],
  faqs: [
    { q: "هل يمكنني التقديم من خارج السعودية؟", a: "نعم. يوظّف أصحاب العمل ومكاتب الاستقدام المرخصة من الخارج، ويمكن استخدام كل مواقع التوظيف المذكورة هنا من أي دولة. تأكد من وجود صاحب العمل ومن أن أحداً لم يطلب منك مالاً." },
    { q: "هل أحتاج إلى اللغة العربية؟", a: "يعتمد على الوظيفة. الهندسة والرعاية الصحية والتقنية والمكاتب متعددة الجنسيات تعمل غالباً بالإنجليزية، بينما التجزئة والضيافة والوظائف المرتبطة بالجهات الحكومية تفضّل العربية عادةً. الإعلان يوضح المطلوب." },
    { q: "هل يمكنني تغيير صاحب العمل بعد وصولي؟", a: "بموجب مبادرة تحسين العلاقة التعاقدية يمكن للعامل الوافد الانتقال بين أصحاب العمل عند تحقق الشروط المعلنة، عبر المنصات الرسمية. راجع القواعد الحالية في منصة قوى قبل الاعتماد على ذلك." },
    { q: "ماذا أتحقق منه قبل قبول العرض؟", a: "العقد في قوى، والمسمى الوظيفي، والراتب، وساعات العمل، والسكن والمواصلات، ومن يتحمل تكلفة الاستقدام، وألا يكون أحد قد طلب منك أي دفعة." }
  ],
  foot: {
    disclosure: "Jobs World دليل مجاني للبحث عن الوظائف. نحن ناشر مستقل ولسنا تابعين لأي جهة عمل أو خدمة مذكورة في هذا الموقع ولا معتمدين منها ولا وكلاء توظيف لها.",
    title: "إخلاء مسؤولية",
    lines: [
      "Jobs World دليل مستقل. نحن <strong>لسنا صاحب عمل ولا وكالة توظيف ولا مكتب استقدام</strong>، ولا نستقبل طلبات التوظيف ولا نعالجها ولا نحوّلها.",
      "لسنا تابعين لأي جهة عمل أو موقع توظيف أو جهة حكومية مذكورة هنا، ولا نعمل بالنيابة عنها ولا نحمل اعتمادها. جميع الأسماء والعلامات التجارية ملك لأصحابها.",
      "<strong>لا نتقاضى أي مقابل عن أي وظيفة، ولن نطلب منك أبداً مالاً أو بيانات بنكية أو وثائق هوية.</strong> لا يطلب أي صاحب عمل نظامي من المتقدم أن يدفع ليُوظَّف.",
      "ترتيب جهات العمل ومواقع التوظيف والخدمات الرسمية في هذه الصفحة يختاره محررونا بناءً على فائدته لمن يبحث عن عمل. لم يدفع أحد مقابل الظهور هنا.",
      "لا نذكر عدد الشواغر ولا راتب أي وظيفة. الشواغر والرواتب تتغير باستمرار — تحقق دائماً من إعلان صاحب العمل نفسه.",
      "التقديم يتم بالكامل على موقع صاحب العمل أو موقع التوظيف أو الجهة الحكومية. نحن لا نرى ولا نحفظ أي شيء ترسله هناك.",
      "هذا الموقع مموَّل بالإعلانات.",
      "الروابط الخارجية للتسهيل فقط؛ ولسنا مسؤولين عن محتوى الغير أو قرارات التوظيف أو ممارساتها. نرحب بالتصحيحات وطلبات الإزالة — انظر صفحة «About»."
    ],
    linkAll: "كل الوظائف",
    linkAbout: "عن الموقع",
    langLabel: "اقرأ هذا بلغة أخرى"
  }
};

ME_T.urdu = {
  hubName: "اردو",
  close: "بند کریں",
  quietLead: "تین مختصر سوالات، اور سعودی عرب میں کام تلاش کرنے کی آپ کی مفت گائیڈ کھل جائے گی۔",
  kicker: "سعودی عرب میں ملازمتیں",
  stepFmt: "مرحلہ {n} از {t}",
  micro: "مفت · رجسٹریشن کے بغیر · درخواست سرکاری ویب سائٹ پر",
  qs: [
    { q: "آپ کس قسم کی ملازمت تلاش کر رہے ہیں؟", options: ["کل وقتی", "جز وقتی", "کوئی بھی دستیاب ملازمت"] },
    { q: "آپ کام کب شروع کر سکتے ہیں؟",          options: ["فوراً", "اسی ہفتے", "اسی مہینے"] },
    { q: "کون سی شفٹ آپ کے لیے بہتر ہے؟",        options: ["صبح", "دوپہر", "کوئی بھی شفٹ"] }
  ],
  ready: {
    h1: "آپ کی ملازمت گائیڈ تیار ہے",
    head: "سعودی عرب میں ملازمتیں",
    btn: "ملازمتیں دکھائیں",
    micro: "پہلے ایک مختصر اشتہاری ویڈیو چلے گی۔",
    loading: "لوڈ ہو رہا ہے…",
    almost: "بس تھوڑا سا باقی ہے",
    finish: "گائیڈ کھولنے کے لیے مختصر ویڈیو مکمل کریں۔",
    again: "ملازمتیں دکھائیں",
    skip: "چھوڑ کر گائیڈ کھولیں",
    tipsTitle: "درخواست دینے سے پہلے",
    tips: [
      "درخواست آجر کی اپنی ویب سائٹ یا کسی معروف جاب سائٹ پر دیں — کسی نجی پیغام کے ذریعے نہیں۔",
      "کوئی آجر یا لائسنس یافتہ بھرتی دفتر آپ سے ملازمت یا ویزے کے پیسے نہیں مانگ سکتا۔",
      "سفر یا کام شروع کرنے سے پہلے اپنا معاہدہ قوى (Qiwa) پر ضرور دیکھیں۔"
    ]
  },
  guide: {
    title: "سعودی عرب میں ملازمتیں — کہاں تلاش کریں، کون بھرتی کر رہا ہے، اور فراڈ سے کیسے بچیں",
    desc: "سعودی عرب میں کام تلاش کرنے کی مفت گائیڈ: کون سے شعبے بھرتی کر رہے ہیں، اہم جاب سائٹس، سرکاری خدمات، آجروں کے کیریئر صفحات، اور ملازمت و ویزا فراڈ سے بچنے کا طریقہ۔",
    h1: "سعودی عرب میں ملازمتیں: کہاں تلاش کریں، کون بھرتی کر رہا ہے، اور خود کو کیسے محفوظ رکھیں",
    lead: "سعودی عرب میں تعمیرات، ریٹیل، مہمان نوازی، لاجسٹکس، صحت اور خدمات کے شعبوں میں بھرتی ہوتی رہتی ہے، اور آجر سال بھر اپنی اسامیاں عام کرتے ہیں۔ یہ مفت گائیڈ بتاتی ہے کہ یہ اسامیاں کہاں شائع ہوتی ہیں، کون سی سرکاری خدمات یہ تصدیق کرتی ہیں کہ ملازمت اور معاہدہ اصلی ہے، اور کن فیس اور ویزا پیشکشوں سے دور رہنا ہے۔",
    secSectors: "ملازمتیں کہاں ہیں",
    secSectorsLead: "سعودی لیبر مارکیٹ کے وہ حصے جہاں سب سے زیادہ بھرتی ہوتی ہے۔ ہر اسامی کی اپنی شرائط ہوتی ہیں — اشتہار ضرور پڑھیں۔",
    secBoards: "سعودی عرب کے لیے جاب سائٹس",
    secBoardsLead: "خود تلاش کریں اور براہِ راست درخواست دیں۔ تلاش مفت ہے اور اسامیاں روز بدلتی ہیں۔",
    secOfficial: "سرکاری خدمات",
    secOfficialLead: "یہ سعودی حکومت کے اپنے پلیٹ فارم ہیں۔ کسی بھی چیز پر رضامندی سے پہلے آجر، ورک پرمٹ یا معاہدے کی تصدیق کے لیے انہیں استعمال کریں۔",
    secEmployers: "سعودی عرب میں بھرتی کرنے والے ادارے",
    secEmployersLead: "بڑے ادارے جو اپنی اسامیاں خود شائع کرتے ہیں۔ اسامیاں اکثر بدلتی ہیں — ہر کیریئر صفحے پر آج دستیاب اسامیاں دیکھیں۔",
    secScams: "ملازمت اور ویزا فراڈ سے کیسے بچیں",
    faqTitle: "عام سوالات",
    cta: "گھر سے کام کی ملازمتیں دیکھیں"
  },
  sectors: [
    { title: "تعمیرات اور بڑے منصوبے", note: "نیوم، ریڈ سی، قدیہ اور دِرعیہ کے منصوبے مرکزی ٹھیکیداروں اور بھرتی دفاتر کے ذریعے انجینئرز، ٹیکنیشنز، ڈرائیورز، سیفٹی افسران اور سائٹ ورکرز کو بھرتی کرتے رہتے ہیں۔" },
    { title: "ریٹیل، مہمان نوازی اور ریستوران", note: "مالز، ہوٹل اور ریستوران سیلز اسٹاف، کیشیئر، باریستا، باورچی اور ہاؤس کیپنگ کے لوگ رکھتے ہیں، اور سیاحت کی ترقی سے ریاض، جدہ، مکہ اور مدینہ میں یہ اسامیاں کھلی رہتی ہیں۔" },
    { title: "ڈیلیوری، لاجسٹکس اور گودام", note: "ای کامرس ڈرائیور، رائیڈر، گودام میں پیکنگ اور پکنگ کرنے والے اور ڈسپیچ اسٹاف بھرتی کرتی ہے، اکثر تربیت کے ساتھ۔" },
    { title: "صحت، دفاتر اور ٹیکنالوجی", note: "اسپتال، بینک، ٹیلی کام اور سرکاری ٹھیکیدار نرسیں، ٹیکنیشنز، اکاؤنٹنٹ، ایڈمن اور آئی ٹی اسٹاف رکھتے ہیں۔ ریگولیٹڈ پیشوں کے لیے متعلقہ سعودی لائسنس ضروری ہے۔" }
  ],
  boards: {
    bayt:       "مشرقِ وسطیٰ کی سب سے بڑی جاب سائٹس میں سے ایک۔ شہر، شعبے اور تجربے کے حساب سے فلٹر کریں اور براہِ راست درخواست دیں۔",
    gulftalent: "خلیج پر مرکوز سائٹ، سعودی عرب اور دیگر خلیجی ممالک میں پیشہ ورانہ اور تکنیکی اسامیوں کے ساتھ۔",
    naukrigulf: "خلیجی جاب بورڈ جسے بھارت، پاکستان اور بنگلہ دیش کے امیدوار بڑے پیمانے پر استعمال کرتے ہیں، ہر سطح کے تجربے کی اسامیاں۔",
    linkedin:   "مقام سعودی عرب مقرر کریں، موجودہ اسامیاں دیکھیں اور آجر کے اپنے صفحے پر درخواست دیں۔",
    indeed:     "دنیا کے سب سے بڑے جاب سرچ انجن کا سعودی ایڈیشن — کوئی بھی ملازمت اور شہر مفت تلاش کریں۔"
  },
  official: {
    qiwa:    "وزارت کا لیبر پلیٹ فارم۔ آپ کا ملازمت کا معاہدہ، عہدہ اور ورک پرمٹ یہاں نظر آنا چاہیے — سفر یا کام شروع کرنے سے پہلے دیکھ لیں۔",
    hrsd:    "وزارتِ افرادی قوت و سماجی بہبود: مزدوروں کے حقوق، تحفظِ اجرت اور شکایت کے سرکاری راستے۔",
    jadarat: "قومی روزگار پورٹل، جہاں نجی شعبے کے آجر مملکت میں کام کے اہل امیدواروں کے لیے اسامیاں شائع کرتے ہیں۔",
    musaned: "گھریلو ملازمین کی بھرتی کا واحد سرکاری راستہ۔ یہ لائسنس یافتہ دفاتر اور معاہدے کی اصل لاگت دکھاتا ہے۔"
  },
  employers: {
    aramco:  "قومی توانائی کمپنی انجینئرنگ، تکنیکی، آپریشنز اور دفتری عملہ بھرتی کرتی ہے اور اپنے تربیتی پروگرام بھی چلاتی ہے۔",
    sabic:   "کیمیکلز اور مینوفیکچرنگ کا ادارہ، مملکت بھر میں پلانٹس اور دفاتر کے ساتھ، انجینئرنگ اور آپریشنز میں بھرتی۔",
    neom:    "بحیرۂ احمر کے ساحل پر بڑا منصوبہ، تعمیرات، مہمان نوازی، ٹیکنالوجی اور آپریشنز میں بھرتی کرتا ہے۔",
    redsea:  "مغربی ساحل پر سیاحتی منصوبہ، ہوٹل، تعمیرات، ماحولیات اور معاون خدمات کے لیے بھرتی۔",
    almarai: "خوراک اور ڈیری کمپنی جو سعودی عرب بھر میں ڈرائیور، پیداوار، گودام اور سیلز اسٹاف باقاعدگی سے رکھتی ہے۔",
    alshaya: "کئی معروف مال برانڈز چلانے والا ریٹیل ادارہ، اسٹور، گودام اور معاون ٹیموں کے لیے بھرتی۔"
  },
  scams: [
    "اصلی آجر کبھی کارکن سے ملازمت کے پیسے نہیں مانگتا۔ سعودی عرب میں بھرتی کے اخراجات آجر کی ذمہ داری ہیں، آپ کی نہیں۔",
    "«فری ویزا» یا واٹس ایپ، فیس بک یا کسی ایجنٹ کے ذریعے پیش کیا گیا ویزا کبھی نہ خریدیں۔ اس پر کام کرنا غیر قانونی ہے اور آپ بے یار و مددگار رہ جاتے ہیں۔",
    "صرف وزارت سے لائسنس یافتہ بھرتی دفاتر استعمال کریں۔ گھریلو کام کے لیے صرف اور صرف مساند (Musaned)۔",
    "اپنا پاسپورٹ کبھی کسی کے حوالے نہ کریں، اور تصدیق شدہ آفر سے پہلے بینک تفصیلات یا شناختی دستاویزات نہ بھیجیں۔",
    "سفر سے پہلے معاہدہ قوى پر دیکھیں: آجر کا نام، عہدہ اور تنخواہ وہی ہونی چاہیے جو آپ کو بتائی گئی۔"
  ],
  faqs: [
    { q: "کیا میں سعودی عرب سے باہر رہ کر درخواست دے سکتا ہوں؟", a: "جی ہاں۔ آجر اور لائسنس یافتہ بھرتی دفاتر بیرونِ ملک سے بھی بھرتی کرتے ہیں، اور یہاں دی گئی ہر جاب سائٹ کسی بھی ملک سے استعمال کی جا سکتی ہے۔ تصدیق کریں کہ آجر واقعی موجود ہے اور کسی نے آپ سے پیسے نہیں مانگے۔" },
    { q: "کیا عربی آنا ضروری ہے؟", a: "یہ ملازمت پر منحصر ہے۔ انجینئرنگ، صحت، ٹیکنالوجی اور کثیر القومی دفاتر میں اکثر انگریزی چلتی ہے، جبکہ ریٹیل، مہمان نوازی اور سرکاری اداروں سے متعلق کاموں میں عموماً عربی کو ترجیح دی جاتی ہے۔ اشتہار میں شرط لکھی ہوتی ہے۔" },
    { q: "کیا وہاں پہنچ کر آجر تبدیل کیا جا سکتا ہے؟", a: "لیبر ریفارم انیشی ایٹو کے تحت غیر ملکی کارکن مقررہ شرائط پوری ہونے پر سرکاری پلیٹ فارمز کے ذریعے آجر تبدیل کر سکتا ہے۔ اس پر انحصار سے پہلے قوى پر موجودہ قواعد دیکھ لیں۔" },
    { q: "آفر قبول کرنے سے پہلے کیا دیکھوں؟", a: "قوى پر معاہدہ، عہدہ، تنخواہ، اوقاتِ کار، رہائش اور ٹرانسپورٹ، بھرتی کا خرچ کون دے رہا ہے، اور یہ کہ آپ سے کوئی رقم نہ مانگی گئی ہو۔" }
  ],
  foot: {
    disclosure: "Jobs World ملازمت تلاش کرنے کی ایک مفت گائیڈ ہے۔ ہم ایک آزاد پبلشر ہیں اور اس سائٹ پر مذکور کسی آجر یا خدمت سے وابستہ، ان کے منظور شدہ یا ان کے بھرتی ایجنٹ نہیں ہیں۔",
    title: "دستبرداری",
    lines: [
      "Jobs World ایک آزاد گائیڈ ہے۔ ہم <strong>آجر، بھرتی ایجنٹ یا ایمپلائمنٹ ایجنسی نہیں ہیں</strong>، اور ہم ملازمت کی درخواستیں نہ وصول کرتے ہیں، نہ آگے بھیجتے ہیں۔",
      "ہم اس سائٹ پر مذکور کسی آجر، جاب سائٹ یا سرکاری خدمت سے وابستہ نہیں، نہ ان کی جانب سے کام کرتے ہیں۔ تمام نام اور ٹریڈ مارک اپنے مالکان کی ملکیت ہیں۔",
      "<strong>ہم کسی ملازمت کے پیسے نہیں لیتے، اور آپ سے کبھی رقم، بینک تفصیلات یا شناختی دستاویزات نہیں مانگیں گے۔</strong> کوئی جائز آجر امیدوار سے ملازمت کے بدلے رقم نہیں مانگتا۔",
      "اس صفحے پر آجروں، جاب سائٹس اور سرکاری خدمات کی ترتیب ہمارے ادارتی عملے نے اس بنیاد پر چنی ہے کہ ملازمت کے متلاشی کے لیے کیا زیادہ مفید ہے۔ یہاں شامل ہونے کے لیے کسی نے پیسے نہیں دیے۔",
      "ہم کسی ملازمت کی اسامیوں کی تعداد یا تنخواہ بیان نہیں کرتے۔ اسامیاں اور تنخواہیں مسلسل بدلتی ہیں — ہمیشہ آجر کے اپنے اشتہار سے تصدیق کریں۔",
      "درخواست مکمل طور پر آجر، جاب سائٹ یا سرکاری خدمت کی اپنی ویب سائٹ پر دی جاتی ہے۔ آپ وہاں جو کچھ جمع کراتے ہیں وہ ہم نہ دیکھتے ہیں نہ محفوظ کرتے ہیں۔",
      "یہ سائٹ اشتہارات سے چلتی ہے۔",
      "بیرونی روابط صرف سہولت کے لیے ہیں؛ ہم فریقِ ثالث کے مواد، بھرتی کے فیصلوں یا طریقوں کے ذمہ دار نہیں۔ تصحیح اور ہٹانے کی درخواستیں خوش آئند ہیں — «About» صفحہ دیکھیں۔"
    ],
    linkAll: "تمام ملازمتیں",
    linkAbout: "ہمارے بارے میں",
    langLabel: "اسے کسی اور زبان میں پڑھیں"
  }
};

ME_T.hindi = {
  hubName: "हिन्दी",
  close: "बंद करें",
  quietLead: "तीन छोटे सवाल, और सऊदी अरब में काम खोजने की आपकी मुफ़्त गाइड खुल जाएगी।",
  kicker: "सऊदी अरब में नौकरियाँ",
  stepFmt: "चरण {n} / {t}",
  micro: "मुफ़्त · कोई रजिस्ट्रेशन नहीं · आवेदन आधिकारिक साइट पर",
  qs: [
    { q: "आप किस तरह की नौकरी ढूँढ रहे हैं?", options: ["फ़ुल-टाइम", "पार्ट-टाइम", "कोई भी उपलब्ध नौकरी"] },
    { q: "आप कब शुरू कर सकते हैं?",           options: ["तुरंत", "इसी हफ़्ते", "इसी महीने"] },
    { q: "कौन-सी शिफ़्ट आपके लिए ठीक है?",     options: ["सुबह", "दोपहर", "कोई भी शिफ़्ट"] }
  ],
  ready: {
    h1: "आपकी नौकरी गाइड तैयार है",
    head: "सऊदी अरब में नौकरियाँ",
    btn: "नौकरियाँ दिखाएँ",
    micro: "पहले एक छोटा प्रायोजित वीडियो चलेगा।",
    loading: "लोड हो रहा है…",
    almost: "बस थोड़ा और",
    finish: "गाइड खोलने के लिए छोटा वीडियो पूरा करें।",
    again: "नौकरियाँ दिखाएँ",
    skip: "छोड़ें और गाइड खोलें",
    tipsTitle: "आवेदन से पहले",
    tips: [
      "आवेदन नियोक्ता की अपनी वेबसाइट या किसी जानी-मानी जॉब साइट पर करें — निजी संदेश के ज़रिए कभी नहीं।",
      "कोई भी नियोक्ता या लाइसेंसी भर्ती कार्यालय आपसे नौकरी या वीज़ा के पैसे नहीं माँग सकता।",
      "यात्रा या काम शुरू करने से पहले अपना अनुबंध Qiwa पर ज़रूर देखें।"
    ]
  },
  guide: {
    title: "सऊदी अरब में नौकरियाँ — कहाँ खोजें, कौन भर्ती कर रहा है, और ठगी से कैसे बचें",
    desc: "सऊदी अरब में काम खोजने की मुफ़्त गाइड: कौन-से क्षेत्र भर्ती कर रहे हैं, मुख्य जॉब साइटें, आधिकारिक सरकारी सेवाएँ, नियोक्ताओं के करियर पेज, और नौकरी व वीज़ा ठगी से बचने का तरीका।",
    h1: "सऊदी अरब में नौकरियाँ: कहाँ खोजें, कौन भर्ती कर रहा है, और खुद को कैसे सुरक्षित रखें",
    lead: "सऊदी अरब में निर्माण, रिटेल, आतिथ्य, लॉजिस्टिक्स, स्वास्थ्य और सेवा क्षेत्रों में भर्ती चलती रहती है, और नियोक्ता पूरे साल अपनी रिक्तियाँ सार्वजनिक रूप से प्रकाशित करते हैं। यह मुफ़्त गाइड बताती है कि ये रिक्तियाँ कहाँ छपती हैं, कौन-सी सरकारी सेवाएँ यह पुष्टि करती हैं कि नौकरी और अनुबंध असली हैं, और किन फ़ीस और वीज़ा प्रस्तावों से दूर रहना है।",
    secSectors: "नौकरियाँ कहाँ हैं",
    secSectorsLead: "सऊदी श्रम बाज़ार के वे हिस्से जहाँ सबसे ज़्यादा भर्ती होती है। हर रिक्ति की अपनी शर्तें होती हैं — विज्ञापन ज़रूर पढ़ें।",
    secBoards: "सऊदी अरब के लिए जॉब साइटें",
    secBoardsLead: "खुद खोजें और सीधे आवेदन करें। खोज मुफ़्त है और रिक्तियाँ हर दिन बदलती हैं।",
    secOfficial: "आधिकारिक सरकारी सेवाएँ",
    secOfficialLead: "ये सऊदी सरकार के अपने प्लेटफ़ॉर्म हैं। किसी भी बात पर सहमत होने से पहले नियोक्ता, वर्क परमिट या अनुबंध की जाँच के लिए इनका इस्तेमाल करें।",
    secEmployers: "सऊदी अरब में भर्ती करने वाले नियोक्ता",
    secEmployersLead: "बड़े नियोक्ता जो अपनी रिक्तियाँ खुद प्रकाशित करते हैं। रिक्तियाँ अक्सर बदलती हैं — हर करियर पेज पर देखें कि आज क्या खुला है।",
    secScams: "नौकरी और वीज़ा ठगी से कैसे बचें",
    faqTitle: "आम सवाल",
    cta: "घर से काम वाली नौकरियाँ देखें"
  },
  sectors: [
    { title: "निर्माण और बड़ी परियोजनाएँ", note: "NEOM, रेड सी, क़िद्दिया और दिरइया की परियोजनाएँ मुख्य ठेकेदारों और भर्ती एजेंसियों के ज़रिए इंजीनियर, तकनीशियन, ड्राइवर, सेफ़्टी अफ़सर और साइट वर्कर लगातार लेती रहती हैं।" },
    { title: "रिटेल, आतिथ्य और खान-पान", note: "मॉल, होटल और रेस्तराँ सेल्स स्टाफ़, कैशियर, बरिस्ता, रसोइए और हाउसकीपिंग रखते हैं, और पर्यटन बढ़ने से रियाद, जेद्दा, मक्का और मदीना में ये पद खुले रहते हैं।" },
    { title: "डिलीवरी, लॉजिस्टिक्स और गोदाम", note: "ई-कॉमर्स ड्राइवर, राइडर, गोदाम में पिकिंग-पैकिंग करने वाले और डिस्पैच स्टाफ़ रखती है, अक्सर ट्रेनिंग के साथ।" },
    { title: "स्वास्थ्य, दफ़्तर और तकनीक", note: "अस्पताल, बैंक, टेलीकॉम और सरकारी ठेकेदार नर्स, तकनीशियन, अकाउंटेंट, प्रशासनिक और आईटी स्टाफ़ रखते हैं। नियंत्रित पेशों के लिए संबंधित सऊदी लाइसेंस चाहिए।" }
  ],
  boards: {
    bayt:       "मध्य पूर्व की सबसे बड़ी जॉब साइटों में से एक। शहर, क्षेत्र और अनुभव से फ़िल्टर करें और सीधे नियोक्ता को आवेदन भेजें।",
    gulftalent: "खाड़ी पर केंद्रित साइट, सऊदी अरब और बाक़ी GCC में पेशेवर व तकनीकी रिक्तियों के साथ।",
    naukrigulf: "खाड़ी का जॉब बोर्ड, जिसका इस्तेमाल भारत, पाकिस्तान और बांग्लादेश के उम्मीदवार बड़ी संख्या में करते हैं; हर अनुभव स्तर की नौकरियाँ।",
    linkedin:   "स्थान सऊदी अरब चुनें, मौजूदा रिक्तियाँ देखें और नियोक्ता के अपने पेज पर आवेदन करें।",
    indeed:     "दुनिया के सबसे बड़े जॉब सर्च इंजन का सऊदी संस्करण — कोई भी पद और शहर मुफ़्त में खोजें।"
  },
  official: {
    qiwa:    "मंत्रालय का श्रम प्लेटफ़ॉर्म। आपका रोज़गार अनुबंध, पदनाम और वर्क परमिट यहाँ दिखना चाहिए — यात्रा या काम शुरू करने से पहले जाँच लें।",
    hrsd:    "मानव संसाधन एवं सामाजिक विकास मंत्रालय: श्रमिक अधिकार, वेतन सुरक्षा और शिकायत के आधिकारिक रास्ते।",
    jadarat: "राष्ट्रीय रोज़गार पोर्टल, जहाँ निजी क्षेत्र के नियोक्ता राज्य में काम करने के पात्र उम्मीदवारों के लिए रिक्तियाँ प्रकाशित करते हैं।",
    musaned: "घरेलू कामगारों की भर्ती का एकमात्र आधिकारिक रास्ता। यह लाइसेंसी कार्यालय और अनुबंध की असली लागत दिखाता है।"
  },
  employers: {
    aramco:  "राष्ट्रीय ऊर्जा कंपनी इंजीनियरिंग, तकनीकी, संचालन और कॉर्पोरेट पदों पर भर्ती करती है और अपने प्रशिक्षण कार्यक्रम भी चलाती है।",
    sabic:   "रसायन और विनिर्माण कंपनी, पूरे देश में प्लांट और दफ़्तर, इंजीनियरिंग व संचालन में भर्ती।",
    neom:    "लाल सागर तट की विशाल परियोजना, निर्माण, आतिथ्य, तकनीक और संचालन में भर्ती करती है।",
    redsea:  "पश्चिमी तट पर पर्यटन परियोजना, होटल, निर्माण, पर्यावरण और सहायक सेवाओं के लिए भर्ती।",
    almarai: "खाद्य और डेयरी कंपनी जो पूरे सऊदी अरब में ड्राइवर, उत्पादन, गोदाम और सेल्स स्टाफ़ नियमित रूप से लेती है।",
    alshaya: "कई जाने-माने मॉल ब्रांड चलाने वाली रिटेल कंपनी, स्टोर, गोदाम और सहायक टीमों के लिए भर्ती।"
  },
  scams: [
    "असली नियोक्ता कभी कामगार से नौकरी के पैसे नहीं माँगता। सऊदी अरब में भर्ती का खर्च नियोक्ता की ज़िम्मेदारी है, आपकी नहीं।",
    "\"फ़्री वीज़ा\" या WhatsApp, Facebook या किसी एजेंट से मिला वीज़ा कभी न खरीदें। उस पर काम करना ग़ैरक़ानूनी है और आप बिना किसी सुरक्षा के रह जाते हैं।",
    "केवल मंत्रालय से लाइसेंस प्राप्त भर्ती कार्यालयों का उपयोग करें। घरेलू काम के लिए सिर्फ़ Musaned।",
    "अपना पासपोर्ट कभी किसी को न सौंपें, और सत्यापित ऑफ़र से पहले बैंक विवरण या पहचान दस्तावेज़ न भेजें।",
    "यात्रा से पहले अनुबंध Qiwa पर जाँचें: नियोक्ता का नाम, पदनाम और वेतन वही होना चाहिए जो आपको बताया गया था।"
  ],
  faqs: [
    { q: "क्या मैं सऊदी अरब के बाहर से आवेदन कर सकता हूँ?", a: "हाँ। नियोक्ता और लाइसेंसी भर्ती कार्यालय विदेश से भी भर्ती करते हैं, और यहाँ दी गई हर जॉब साइट किसी भी देश से इस्तेमाल की जा सकती है। बस पुष्टि करें कि नियोक्ता वास्तव में मौजूद है और किसी ने आपसे पैसे नहीं माँगे।" },
    { q: "क्या अरबी आना ज़रूरी है?", a: "यह पद पर निर्भर करता है। इंजीनियरिंग, स्वास्थ्य, तकनीक और बहुराष्ट्रीय दफ़्तरों में अक्सर अंग्रेज़ी चलती है, जबकि ग्राहक से जुड़े रिटेल, आतिथ्य और सरकारी कामों में आमतौर पर अरबी को प्राथमिकता दी जाती है। विज्ञापन में शर्त लिखी होती है।" },
    { q: "क्या वहाँ पहुँचकर नियोक्ता बदला जा सकता है?", a: "श्रम सुधार पहल के तहत प्रवासी कामगार तय शर्तें पूरी होने पर आधिकारिक प्लेटफ़ॉर्म के ज़रिए नियोक्ता बदल सकता है। इस पर भरोसा करने से पहले Qiwa पर मौजूदा नियम देख लें।" },
    { q: "ऑफ़र स्वीकार करने से पहले क्या जाँचूँ?", a: "Qiwa पर अनुबंध, पदनाम, वेतन, काम के घंटे, रहने और आने-जाने की व्यवस्था, भर्ती का खर्च कौन दे रहा है, और यह कि आपसे कोई भुगतान नहीं माँगा गया।" }
  ],
  foot: {
    disclosure: "Jobs World नौकरी खोजने की एक मुफ़्त गाइड है। हम एक स्वतंत्र प्रकाशक हैं और इस साइट पर नामित किसी नियोक्ता या सेवा से संबद्ध, उनके द्वारा अनुमोदित या उनके भर्ती एजेंट नहीं हैं।",
    title: "अस्वीकरण",
    lines: [
      "Jobs World एक स्वतंत्र गाइड है। हम <strong>नियोक्ता, भर्ती एजेंट या रोज़गार एजेंसी नहीं हैं</strong>, और हम नौकरी के आवेदन न लेते हैं, न आगे भेजते हैं।",
      "हम इस साइट पर नामित किसी नियोक्ता, जॉब साइट या सरकारी सेवा से संबद्ध नहीं हैं और न उनकी ओर से काम करते हैं। सभी नाम और ट्रेडमार्क उनके स्वामियों के हैं।",
      "<strong>हम किसी नौकरी के पैसे नहीं लेते, और आपसे कभी भुगतान, बैंक विवरण या पहचान दस्तावेज़ नहीं माँगेंगे।</strong> कोई वैध नियोक्ता उम्मीदवार से नौकरी के बदले पैसे नहीं माँगता।",
      "इस पेज पर नियोक्ताओं, जॉब साइटों और सरकारी सेवाओं का क्रम हमारे संपादकों ने इस आधार पर चुना है कि नौकरी खोजने वाले के लिए क्या ज़्यादा उपयोगी है। यहाँ दिखने के लिए किसी ने पैसे नहीं दिए।",
      "हम किसी नौकरी की रिक्तियों की संख्या या वेतन नहीं बताते। रिक्तियाँ और वेतन लगातार बदलते हैं — हमेशा नियोक्ता के अपने विज्ञापन से पुष्टि करें।",
      "आवेदन पूरी तरह नियोक्ता, जॉब साइट या सरकारी सेवा की अपनी वेबसाइट पर होता है। आप वहाँ जो कुछ जमा करते हैं, वह हम न देखते हैं न संग्रहित करते हैं।",
      "यह साइट विज्ञापन से चलती है।",
      "बाहरी लिंक केवल सुविधा के लिए हैं; तीसरे पक्ष की सामग्री, भर्ती के निर्णयों या तौर-तरीक़ों के लिए हम ज़िम्मेदार नहीं हैं। सुधार और हटाने के अनुरोध का स्वागत है — About पेज देखें।"
    ],
    linkAll: "सभी नौकरियाँ",
    linkAbout: "हमारे बारे में",
    langLabel: "इसे दूसरी भाषा में पढ़ें"
  }
};

ME_T.bengali = {
  hubName: "বাংলা",
  close: "বন্ধ করুন",
  quietLead: "তিনটি ছোট প্রশ্ন, আর সৌদি আরবে কাজ খোঁজার আপনার বিনামূল্যের গাইড খুলে যাবে।",
  kicker: "সৌদি আরবে চাকরি",
  stepFmt: "ধাপ {n} / {t}",
  micro: "বিনামূল্যে · রেজিস্ট্রেশন লাগে না · আবেদন অফিশিয়াল সাইটে",
  qs: [
    { q: "আপনি কী ধরনের চাকরি খুঁজছেন?", options: ["ফুল-টাইম", "পার্ট-টাইম", "যেকোনো চাকরি"] },
    { q: "আপনি কখন শুরু করতে পারবেন?",   options: ["এখনই", "এই সপ্তাহে", "এই মাসে"] },
    { q: "কোন শিফট আপনার জন্য ভালো?",    options: ["সকাল", "বিকেল", "যেকোনো শিফট"] }
  ],
  ready: {
    h1: "আপনার চাকরির গাইড প্রস্তুত",
    head: "সৌদি আরবে চাকরি",
    btn: "চাকরিগুলো দেখান",
    micro: "প্রথমে একটি ছোট বিজ্ঞাপনের ভিডিও চলবে।",
    loading: "লোড হচ্ছে…",
    almost: "প্রায় হয়ে গেছে",
    finish: "গাইড খুলতে ছোট ভিডিওটি শেষ করুন।",
    again: "চাকরিগুলো দেখান",
    skip: "এড়িয়ে গাইড খুলুন",
    tipsTitle: "আবেদনের আগে",
    tips: [
      "আবেদন করুন নিয়োগকর্তার নিজস্ব ওয়েবসাইটে বা পরিচিত কোনো জব সাইটে — কখনোই ব্যক্তিগত মেসেজের মাধ্যমে নয়।",
      "কোনো নিয়োগকর্তা বা লাইসেন্সপ্রাপ্ত রিক্রুটিং অফিস চাকরি বা ভিসার জন্য আপনার কাছে টাকা চাইতে পারে না।",
      "যাত্রা বা কাজ শুরুর আগে আপনার চুক্তি Qiwa-তে দেখে নিন।"
    ]
  },
  guide: {
    title: "সৌদি আরবে চাকরি — কোথায় খুঁজবেন, কারা নিয়োগ দিচ্ছে, প্রতারণা এড়াবেন কীভাবে",
    desc: "সৌদি আরবে কাজ খোঁজার বিনামূল্যের গাইড: কোন খাতগুলো নিয়োগ দিচ্ছে, প্রধান জব সাইট, সরকারি অফিশিয়াল সেবা, নিয়োগকর্তাদের ক্যারিয়ার পেজ, এবং চাকরি ও ভিসা প্রতারণা এড়ানোর উপায়।",
    h1: "সৌদি আরবে চাকরি: কোথায় খুঁজবেন, কারা নিয়োগ দিচ্ছে, আর নিজেকে নিরাপদ রাখবেন কীভাবে",
    lead: "সৌদি আরবে নির্মাণ, খুচরা বিক্রি, আতিথেয়তা, লজিস্টিকস, স্বাস্থ্যসেবা ও সেবা খাতে নিয়োগ চলতেই থাকে, আর নিয়োগকর্তারা সারা বছর প্রকাশ্যে শূন্যপদ ঘোষণা করেন। এই বিনামূল্যের গাইডে আছে এই শূন্যপদগুলো কোথায় প্রকাশিত হয়, কোন সরকারি সেবা দিয়ে যাচাই করবেন চাকরি ও চুক্তি আসল কি না, এবং কোন ফি ও ভিসার প্রস্তাব থেকে দূরে থাকবেন।",
    secSectors: "চাকরি কোথায় আছে",
    secSectorsLead: "সৌদি শ্রমবাজারের যে অংশগুলোতে সবচেয়ে বেশি নিয়োগ হয়। প্রতিটি শূন্যপদের নিজস্ব শর্ত থাকে — বিজ্ঞপ্তিটি পড়ুন।",
    secBoards: "সৌদি আরবের জন্য জব সাইট",
    secBoardsLead: "নিজে খুঁজুন এবং সরাসরি আবেদন করুন। খোঁজা বিনামূল্যে এবং শূন্যপদ প্রতিদিন বদলায়।",
    secOfficial: "সরকারি অফিশিয়াল সেবা",
    secOfficialLead: "এগুলো সৌদি সরকারের নিজস্ব প্ল্যাটফর্ম। কোনো কিছুতে রাজি হওয়ার আগে নিয়োগকর্তা, ওয়ার্ক পারমিট বা চুক্তি যাচাই করতে এগুলো ব্যবহার করুন।",
    secEmployers: "সৌদি আরবে নিয়োগ দেওয়া প্রতিষ্ঠান",
    secEmployersLead: "বড় প্রতিষ্ঠান যারা নিজেরাই শূন্যপদ প্রকাশ করে। শূন্যপদ প্রায়ই বদলায় — প্রতিটি ক্যারিয়ার পেজে আজ কী খোলা আছে দেখুন।",
    secScams: "চাকরি ও ভিসা প্রতারণা এড়াবেন কীভাবে",
    faqTitle: "সাধারণ প্রশ্ন",
    cta: "ঘরে বসে কাজের চাকরি দেখুন"
  },
  sectors: [
    { title: "নির্মাণ ও বড় প্রকল্প", note: "NEOM, রেড সি, কিদ্দিয়া ও দিরিয়া প্রকল্পগুলো প্রধান ঠিকাদার ও রিক্রুটিং অফিসের মাধ্যমে প্রকৌশলী, টেকনিশিয়ান, ড্রাইভার, সেফটি অফিসার ও সাইট শ্রমিক নিয়োগ দিতে থাকে।" },
    { title: "খুচরা বিক্রি, আতিথেয়তা ও খাবার", note: "শপিং মল, হোটেল ও রেস্তোরাঁয় সেলস স্টাফ, ক্যাশিয়ার, বারিস্তা, বাবুর্চি ও হাউসকিপিং নেওয়া হয়; পর্যটন বাড়ায় রিয়াদ, জেদ্দা, মক্কা ও মদিনায় এসব পদ খোলা থাকে।" },
    { title: "ডেলিভারি, লজিস্টিকস ও গুদাম", note: "ই-কমার্স ড্রাইভার, রাইডার, গুদামের প্যাকার-পিকার ও ডিসপ্যাচ স্টাফ নেয়, প্রায়ই প্রশিক্ষণসহ।" },
    { title: "স্বাস্থ্য, অফিস ও প্রযুক্তি", note: "হাসপাতাল, ব্যাংক, টেলিকম ও সরকারি ঠিকাদাররা নার্স, টেকনিশিয়ান, হিসাবরক্ষক, প্রশাসনিক ও আইটি কর্মী নেয়। নিয়ন্ত্রিত পেশার জন্য সংশ্লিষ্ট সৌদি লাইসেন্স লাগে।" }
  ],
  boards: {
    bayt:       "মধ্যপ্রাচ্যের সবচেয়ে বড় জব সাইটগুলোর একটি। শহর, খাত ও অভিজ্ঞতা অনুযায়ী ফিল্টার করে সরাসরি আবেদন করুন।",
    gulftalent: "উপসাগরকেন্দ্রিক সাইট, সৌদি আরব ও বাকি জিসিসিতে পেশাগত ও কারিগরি শূন্যপদসহ।",
    naukrigulf: "উপসাগরীয় জব বোর্ড, যা ভারত, পাকিস্তান ও বাংলাদেশের প্রার্থীরা ব্যাপকভাবে ব্যবহার করেন; সব স্তরের অভিজ্ঞতার চাকরি।",
    linkedin:   "লোকেশন সৌদি আরব দিন, বর্তমান শূন্যপদ দেখুন এবং নিয়োগকর্তার নিজস্ব পেজে আবেদন করুন।",
    indeed:     "বিশ্বের বৃহত্তম জব সার্চ ইঞ্জিনের সৌদি সংস্করণ — যেকোনো পদ ও শহর বিনামূল্যে খুঁজুন।"
  },
  official: {
    qiwa:    "মন্ত্রণালয়ের শ্রম প্ল্যাটফর্ম। আপনার চাকরির চুক্তি, পদবি ও ওয়ার্ক পারমিট এখানে দেখা যাওয়ার কথা — যাত্রা বা কাজ শুরুর আগে যাচাই করুন।",
    hrsd:    "মানবসম্পদ ও সামাজিক উন্নয়ন মন্ত্রণালয়: শ্রম অধিকার, মজুরি সুরক্ষা এবং অভিযোগের অফিশিয়াল পথ।",
    jadarat: "জাতীয় কর্মসংস্থান পোর্টাল, যেখানে বেসরকারি খাতের নিয়োগকর্তারা দেশে কাজের যোগ্য প্রার্থীদের জন্য শূন্যপদ প্রকাশ করেন।",
    musaned: "গৃহকর্মী নিয়োগের একমাত্র অফিশিয়াল পথ। এখানে লাইসেন্সপ্রাপ্ত অফিস ও চুক্তির প্রকৃত খরচ দেখা যায়।"
  },
  employers: {
    aramco:  "জাতীয় জ্বালানি কোম্পানি প্রকৌশল, কারিগরি, পরিচালন ও কর্পোরেট পদে নিয়োগ দেয় এবং নিজস্ব প্রশিক্ষণ কর্মসূচিও চালায়।",
    sabic:   "রসায়ন ও উৎপাদন প্রতিষ্ঠান, সারা দেশে কারখানা ও অফিস, প্রকৌশল ও পরিচালন পদে নিয়োগ।",
    neom:    "লোহিত সাগর উপকূলের বিশাল প্রকল্প, নির্মাণ, আতিথেয়তা, প্রযুক্তি ও পরিচালনায় নিয়োগ দেয়।",
    redsea:  "পশ্চিম উপকূলে পর্যটন প্রকল্প, হোটেল, নির্মাণ, পরিবেশ ও সহায়ক সেবায় নিয়োগ।",
    almarai: "খাদ্য ও দুগ্ধ কোম্পানি, সারা সৌদি আরবে নিয়মিত ড্রাইভার, উৎপাদন, গুদাম ও সেলস কর্মী নেয়।",
    alshaya: "বহু পরিচিত মল ব্র্যান্ড পরিচালনাকারী খুচরা প্রতিষ্ঠান, স্টোর, গুদাম ও সহায়ক দলে নিয়োগ।"
  },
  scams: [
    "আসল নিয়োগকর্তা কখনো কর্মীর কাছে চাকরির জন্য টাকা চায় না। সৌদি আরবে নিয়োগের খরচ নিয়োগকর্তার দায়িত্ব, আপনার নয়।",
    "\"ফ্রি ভিসা\" বা WhatsApp, Facebook বা দালালের দেওয়া ভিসা কখনো কিনবেন না। সেটিতে কাজ করা বেআইনি এবং আপনি সম্পূর্ণ অরক্ষিত থাকবেন।",
    "শুধু মন্ত্রণালয়ের লাইসেন্সপ্রাপ্ত রিক্রুটিং অফিস ব্যবহার করুন। গৃহকর্মের জন্য কেবলই Musaned।",
    "পাসপোর্ট কখনো কারও হাতে তুলে দেবেন না, এবং যাচাই করা অফার পাওয়ার আগে ব্যাংক তথ্য বা পরিচয়পত্র পাঠাবেন না।",
    "যাত্রার আগে চুক্তি Qiwa-তে দেখুন: নিয়োগকর্তার নাম, পদবি ও বেতন আপনাকে যা বলা হয়েছে তার সঙ্গে মিলতে হবে।"
  ],
  faqs: [
    { q: "আমি কি সৌদি আরবের বাইরে থেকে আবেদন করতে পারি?", a: "হ্যাঁ। নিয়োগকর্তা ও লাইসেন্সপ্রাপ্ত রিক্রুটিং অফিস বিদেশ থেকেও নিয়োগ দেয়, আর এখানে দেওয়া প্রতিটি জব সাইট যেকোনো দেশ থেকে ব্যবহার করা যায়। শুধু নিশ্চিত করুন প্রতিষ্ঠানটি সত্যিই আছে এবং কেউ আপনার কাছে টাকা চায়নি।" },
    { q: "আরবি জানা কি বাধ্যতামূলক?", a: "পদের উপর নির্ভর করে। প্রকৌশল, স্বাস্থ্যসেবা, প্রযুক্তি ও বহুজাতিক অফিসে প্রায়ই ইংরেজিতে কাজ চলে, আর ক্রেতার সঙ্গে সরাসরি কাজ করা খুচরা, আতিথেয়তা ও সরকারি সংশ্লিষ্ট পদে সাধারণত আরবি পছন্দ করা হয়। বিজ্ঞপ্তিতে শর্ত লেখা থাকে।" },
    { q: "সেখানে পৌঁছে কি নিয়োগকর্তা বদলানো যায়?", a: "শ্রম সংস্কার উদ্যোগের আওতায় নির্ধারিত শর্ত পূরণ হলে প্রবাসী কর্মী অফিশিয়াল প্ল্যাটফর্মের মাধ্যমে নিয়োগকর্তা বদলাতে পারেন। এর উপর নির্ভর করার আগে Qiwa-তে বর্তমান নিয়ম দেখে নিন।" },
    { q: "অফার নেওয়ার আগে কী যাচাই করব?", a: "Qiwa-তে চুক্তি, পদবি, বেতন, কর্মঘণ্টা, থাকা ও যাতায়াত, নিয়োগের খরচ কে দিচ্ছে, এবং আপনার কাছে কোনো টাকা চাওয়া হয়নি — এগুলো।" }
  ],
  foot: {
    disclosure: "Jobs World চাকরি খোঁজার একটি বিনামূল্যের গাইড। আমরা একটি স্বাধীন প্রকাশক এবং এই সাইটে উল্লিখিত কোনো নিয়োগকর্তা বা সেবার সঙ্গে যুক্ত নই, তাদের অনুমোদিত নই এবং তাদের রিক্রুটারও নই।",
    title: "দাবি অস্বীকার",
    lines: [
      "Jobs World একটি স্বাধীন গাইড। আমরা <strong>নিয়োগকর্তা, রিক্রুটার বা কর্মসংস্থান সংস্থা নই</strong>, এবং আমরা চাকরির আবেদন গ্রহণ, প্রক্রিয়া বা অন্যত্র পাঠাই না।",
      "এই সাইটে উল্লিখিত কোনো নিয়োগকর্তা, জব সাইট বা সরকারি সেবার সঙ্গে আমরা যুক্ত নই এবং তাদের পক্ষে কাজ করি না। সব নাম ও ট্রেডমার্ক তাদের মালিকদের।",
      "<strong>আমরা কোনো চাকরির জন্য টাকা নিই না, এবং কখনোই আপনার কাছে অর্থ, ব্যাংক তথ্য বা পরিচয়পত্র চাইব না।</strong> কোনো বৈধ নিয়োগকর্তা প্রার্থীর কাছে চাকরির বিনিময়ে টাকা চায় না।",
      "এই পাতায় নিয়োগকর্তা, জব সাইট ও সরকারি সেবার ক্রম আমাদের সম্পাদকেরা ঠিক করেছেন — চাকরিপ্রার্থীর জন্য কোনটি বেশি কাজে লাগে সেই বিবেচনায়। এখানে থাকার জন্য কেউ টাকা দেয়নি।",
      "আমরা কোনো চাকরির শূন্যপদের সংখ্যা বা বেতন উল্লেখ করি না। শূন্যপদ ও বেতন প্রতিনিয়ত বদলায় — সবসময় নিয়োগকর্তার নিজস্ব বিজ্ঞপ্তি থেকে যাচাই করুন।",
      "আবেদন সম্পূর্ণভাবে নিয়োগকর্তা, জব সাইট বা সরকারি সেবার নিজস্ব ওয়েবসাইটে হয়। সেখানে আপনি যা জমা দেন তা আমরা দেখি না বা সংরক্ষণ করি না।",
      "এই সাইট বিজ্ঞাপনের মাধ্যমে পরিচালিত।",
      "বাইরের লিংক শুধু সুবিধার জন্য; তৃতীয় পক্ষের বিষয়বস্তু, নিয়োগ সিদ্ধান্ত বা কার্যপদ্ধতির জন্য আমরা দায়ী নই। সংশোধন ও অপসারণের অনুরোধ স্বাগত — About পাতা দেখুন।"
    ],
    linkAll: "সব চাকরি",
    linkAbout: "আমাদের সম্পর্কে",
    langLabel: "অন্য ভাষায় পড়ুন"
  }
};

/* Merge meta + translations into one list the builders iterate. */
const ME_LANGS = ME_LANG_META.map((m) => ({ ...m, t: ME_T[m.slug] }));

/* ---------- /me/ ARMS (root §7 — split at the ad-buy, one hypothesis each) ----------
 * The funnel SHAPE is a parameter, so both arms come from one set of builders and one modal
 * engine. Point campaign A at the champion and campaign B at the arm; CPC attributes per
 * campaign in FB/Google and every impression attributes per URL prefix in GAM.
 *
 * CHAMPION `/me/<lang>/` — page-per-question, ads on every step (4 ad-bearing pageviews + guide).
 * QUIET    `/me/x/quiet/<lang>/` — owner spec 2026-08-14: "until the rewarded ad no ads are shown,
 *   super simple popup with nothing." ONE page; the three questions run inside a stripped modal
 *   (close X + question + options, no progress bar, no step label, no sub-lines); ZERO display
 *   slots and no anchor anywhere before the reward; the guide after the reward keeps its full ad
 *   load. HYPOTHESIS: a completely ad-free run-up lifts reward-completion enough that the guide's
 *   impressions plus the higher completion beat the champion's four in-funnel pageviews. That is a
 *   real trade — the champion earns on every step, this arm earns nothing until the video — so it
 *   ships as an ARM to be measured, not as the default. Compare reward_grant rate and revenue per
 *   session between the two prefixes before promoting either.
 * -------------------------------------------------------------------------- */
const ME_CHAMPION = { id: "", base: `${B}me/`, dir: "me/", ads: true, noindex: false };
const ME_QUIET    = { id: "quiet", base: `${B}me/x/quiet/`, dir: "me/x/quiet/", ads: false, noindex: true };

/* ---------- /me/ helpers ---------- */
const meBase = (lang, arm) => `${(arm || ME_CHAMPION).base}${lang.slug}/`;

/* hreflang cluster for a given /me/ page "kind" ("" = the landing/Q1, "jobs/" = the guide). */
function meAlternates(kind) {
  return ME_LANGS.map((l) => ({ hreflang: l.code, href: `${meBase(l)}${kind}` }))
    .concat([{ hreflang: "x-default", href: `${B}me/` }]);
}

/* Translated footer (root §5: the disclaimer must be readable by the visitor it protects).
 * The language switcher stays INSIDE the current arm, so a visitor who switches language does not
 * silently cross into the other experiment arm and pollute both readings. */
function meFooter(lang, arm) {
  const f = lang.t.foot;
  const others = ME_LANGS.filter((l) => l.slug !== lang.slug)
    .map((l) => `<a href="${meBase(l, arm)}"><bdi lang="${l.code}">${esc(l.t.hubName)}</bdi></a>`).join(" · ");
  return `  <p class="disclosure">${esc(f.disclosure)}</p>
  <div class="site-disclaimer">
  <h2>${esc(f.title)}</h2>
  <ul>
${f.lines.map((l) => `    <li>${l}</li>`).join("\n")}
  </ul>
</div>
  <p class="foot-links"><a href="${B}">${esc(f.linkAll)}</a> · <a href="${B}about/">${esc(f.linkAbout)}</a></p>
  <p class="foot-links foot-langs"><span>${esc(f.langLabel)}:</span> ${others}</p>`;
}

/* Progress bar with a translated "Step {n} of {t}" label. */
function meBar(lang, step, total) {
  const pct = Math.round((step / total) * 100);
  const label = lang.t.stepFmt.replace("{n}", step).replace("{t}", total);
  return `<div class="fbar-wrap">
  <div class="fbar-row"><span class="fbar-step">${esc(label)}</span><span class="fbar-pct">${pct}%</span></div>
  <div class="fbar"><span style="width:${pct}%"></span></div>
</div>`;
}

/* Outbound list. `sponsored` is false for the government services — they are not a commercial
 * relationship and must not be marked as one (root §5: never disclose a relationship we lack). */
function mePlaceList(items, descMap, sponsored) {
  const rel = sponsored === false ? "nofollow noopener" : "nofollow noopener sponsored";
  return `<ul class="place-list">
${items.map((it) => `  <li class="place">
    <span class="place-ic">${icon(it.icon || "briefcase", 20)}</span>
    <span class="place-main">
      <a class="place-name" href="${esc(it.url)}" target="_blank" rel="${rel}">${esc(it.name)} ${icon("external", 14)}</a>
      <span class="place-desc">${esc(descMap[it.id] || "")}</span>
    </span>
  </li>`).join("\n")}
</ul>`;
}

function meFaq(title, faqs) {
  return `<section class="content-block"><h2>${esc(title)}</h2>
${faqs.map((f) => `<details class="faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n")}
</section>`;
}

/* ---------- /me/<lang>/[2|3]/ — one question per page (pageview = ad impressions) ---------- */
function buildMeQuestion(lang, qi) {
  const t = lang.t;
  const n = qi + 1, total = 4;                       // 3 questions + the reward step
  const q = t.qs[qi];
  const base = meBase(lang);
  const nextUrl = qi === t.qs.length - 1 ? `${base}ready/` : `${base}${n + 1}/`;
  const first = qi === 0;

  // data-po-no-intercept: the Price Optimiser SDK installs a capture-phase click interceptor that
  // can swallow a funnel-continuation click behind an interstitial and never resume (memory
  // `partner-script-nav-trap`). Every link that ADVANCES this funnel must carry it.
  const picks = q.options.map((label, oi) =>
    `<a class="pick" href="${esc(nextUrl)}" data-po-no-intercept>
    <span class="pick-ic">${icon(ME_Q_ICONS[qi][oi], 22)}</span>
    <span class="pick-label">${esc(label)}</span>
    <span class="pick-go">${icon("chevron", 20)}</span>
  </a>`).join("\n");

  const body = `${meBar(lang, n, total)}

${adSlot("leaderboard")}

<div class="q-head">
  ${first ? `<p class="q-kicker">${icon("pin", 15)} ${esc(t.kicker)}</p>` : ""}
  <h1>${esc(q.q)}</h1>
</div>

<div class="pick-list">
${picks}
</div>

<p class="micro center">${icon("shield", 14)} ${esc(t.micro)}</p>

${adSlot("inContent")}`;

  write(`me/${lang.slug}/${first ? "" : n + "/"}index.html`, page({
    title: `${q.q} | ${esc(t.kicker)}`,
    desc: first ? t.guide.desc : q.q,
    // Only the paid LANDING (Q1) is indexable and hreflang-clustered — the inner steps are
    // near-identical single-question pages and have no business in the index (thin/doorway).
    noindex: !first,
    canonical: first ? base : "",
    alternates: first ? meAlternates("") : null,
    lang: lang.code,
    dir: lang.dir,
    foot: meFooter(lang),
    bodyAttrs: `data-fn="jobs_me_${lang.slug}" data-step="${n}" data-steps="${total}" data-step-name="q${n}"`,
    body
  }));
}

/* ---------- /me/<lang>/ready/ — the opt-in rewarded step ----------
 * Deliberately quiet (owner: "don't say watch this ad to see the rewarded content"): one CTA and
 * ONE small line naming the sponsored video. That line is the disclosure Google's rewarded policy
 * requires — a full-screen video with no warning at all is an unexpected interstitial. Never-trap
 * plumbing is shared with every other funnel (Jobs.initMeReward -> playRewarded): the guide opens
 * on granted / no-fill / error / SDK-absent / timeout, and an escape link appears on early close. */
function buildMeReady(lang) {
  const t = lang.t, r = t.ready, base = meBase(lang);

  const body = `${meBar(lang, 4, 4)}

${adSlot("leaderboard")}

<div class="reward-gate" id="reward-gate">
  <span class="reward-ic">${icon("check", 34)}</span>
  <h2 id="reward-title">${esc(r.h1)}</h2>
  <p id="reward-msg">${esc(r.head)}</p>
  <button class="btn" type="button" id="me-reward">${icon("arrow", 18)} ${esc(r.btn)}</button>
  <p class="micro center reward-note">${esc(r.micro)}</p>
  <p class="reward-escape" id="reward-escape" hidden><a href="#" id="me-escape">${esc(r.skip)}</a></p>
</div>

<section class="content-block">
  <h2>${esc(r.tipsTitle)}</h2>
  <ul class="ticks">${r.tips.map((x) => `<li>${icon("shield", 18)}<span>${esc(x)}</span></li>`).join("")}</ul>
</section>`;

  const cfg = {
    next: `${base}jobs/`, fn: `jobs_me_${lang.slug}`,
    loading: r.loading, almost: r.almost, finish: r.finish, again: r.again
  };

  write(`me/${lang.slug}/ready/index.html`, page({
    title: `${r.h1} | ${esc(t.kicker)}`,
    desc: r.h1,
    noindex: true,          // a one-button step page — never index it
    lang: lang.code,
    dir: lang.dir,
    foot: meFooter(lang),
    bodyAttrs: `data-fn="jobs_me_${lang.slug}" data-step="4" data-steps="4" data-step-name="reward"`,
    body,
    pageScript: `Jobs.initMeReward(${JSON.stringify(cfg)});`
  }));
}

/* ---------- /me/<lang>/jobs/ — the Saudi Arabia guide (rewarded payoff + the ad load) ----------
 * Real, useful, country-specific content: it is what the paid click was promised, what keeps
 * Google Ads landing-page relevance high (= lower CPC), and what keeps a monetized page off the
 * thin-doorway list. No invented openings counts, no salary figures (root §4 Fight 2).
 *
 * AD LOAD: leaderboard + in-content + results, each used ONCE. The SDK fills a slot by #id, so a
 * page may only carry one div per registered id — the older guides render adSlot("inContent")
 * twice and the second copy is a duplicate id that never fills (dead weight, invalid HTML). Do
 * not repeat a placement here to "add density"; ask thebesads to register another unit instead. */
function buildMeGuide(lang, armIn) {
  const arm = armIn || ME_CHAMPION;
  const t = lang.t, g = t.guide;

  const sectorRows = t.sectors.map((s) =>
    `<li>${icon("briefcase", 18)}<span><strong>${esc(s.title)}.</strong> ${esc(s.note)}</span></li>`).join("\n");

  const body = `<div class="results-head">
  <span class="results-check">${icon("check", 30)}</span>
  <h1>${esc(g.h1)}</h1>
</div>
${byline()}

${adSlot("leaderboard")}

<section class="content-block">
  <p class="lead">${esc(g.lead)}</p>
</section>

<section class="content-block">
  <h2>${esc(g.secSectors)}</h2>
  <p>${esc(g.secSectorsLead)}</p>
  <ul class="ticks">
${sectorRows}
  </ul>
</section>

${adSlot("inContent")}

<section class="content-block">
  <h2>${esc(g.secBoards)}</h2>
  <p>${esc(g.secBoardsLead)}</p>
  ${mePlaceList(ME_BOARDS, t.boards, true)}
</section>

${adSlot("results")}

<section class="content-block">
  <h2>${esc(g.secOfficial)}</h2>
  <p>${esc(g.secOfficialLead)}</p>
  ${mePlaceList(ME_OFFICIAL, t.official, false)}
</section>

<section class="content-block">
  <h2>${esc(g.secEmployers)}</h2>
  <p>${esc(g.secEmployersLead)}</p>
  ${mePlaceList(ME_EMPLOYERS, t.employers, true)}
</section>

<section class="content-block">
  <h2>${esc(g.secScams)}</h2>
  <ul class="ticks">${t.scams.map((x) => `<li>${icon("shield", 18)}<span>${esc(x)}</span></li>`).join("")}</ul>
</section>

${meFaq(g.faqTitle, t.faqs)}

<div class="hero-ctas center">
  <a class="btn" href="${B}remote/" data-po-no-intercept>${esc(g.cta)}${arrow()}</a>
</div>`;

  // The arm's guide is the SAME content at its own URL (noindex, so no duplicate-content problem):
  // separate URLs are what make the arm's revenue readable on its own in GAM (root §7). Only the
  // champion carries the canonical + hreflang cluster.
  write(`${arm.dir}${lang.slug}/jobs/index.html`, page({
    title: `${g.title} | ${SITE.name}`,
    desc: g.desc,
    canonical: arm.noindex ? "" : `${meBase(lang, arm)}jobs/`,
    alternates: arm.noindex ? null : meAlternates("jobs/"),
    noindex: arm.noindex,
    lang: lang.code,
    dir: lang.dir,
    foot: meFooter(lang, arm),
    bodyAttrs: `data-fn="jobs_me${arm.id ? "_" + arm.id : ""}_${lang.slug}" data-step-name="guide"`,
    body,
    wide: true
  }));
}

/* ---------- /me/x/quiet/<lang>/ — the QUIET arm's single page ----------
 * Owner spec 2026-08-14: no ads at all until the rewarded video, and the quiz is a "super simple
 * popup with nothing". So: the modal is stripped to a close X + the question + its three options,
 * the page carries NO adSlot() units and sets hideAnchor, and the rewarded ask is the same one CTA
 * plus the single quiet sponsored line. Ads resume on the guide, which is after the video.
 *
 * WHY THERE IS STILL A PAGE UNDERNEATH: the modal opens on load and covers everything, and it must
 * always be closeable (X / backdrop / Esc). A modal over a BLANK page is a dead end when closed —
 * which is the definition of a forced interstitial / doorway, the banned pattern this whole site is
 * built to avoid (jobs CLAUDE.md, root §4 Fight 1). So the page behind is the smallest honest thing
 * that still works if the visitor dismisses the popup: brand, headline, one line, and a button that
 * reopens it. Do NOT strip it to nothing, and do NOT make the modal non-dismissable.
 * -------------------------------------------------------------------------- */
function buildMeQuietLanding(lang) {
  const t = lang.t, arm = ME_QUIET;
  const total = t.qs.length + 1;

  const body = `<section class="hero-card home-hero">
  <div class="hero-body">
    <span class="hero-brand">
      <span class="hero-brand-badge">${logoMark()}</span>
      <span class="hero-brand-name">${esc(SITE.name)}</span>
    </span>
    <h1>${esc(t.kicker)}</h1>
    <p class="lead">${esc(t.quietLead)}</p>
    <div class="hero-ctas">
      <button class="btn" type="button" data-usa-open>${esc(t.ready.btn)}${arrow()}</button>
    </div>
    <p class="micro center light">${icon("shield", 14)} ${esc(t.micro)}</p>
  </div>
</section>

${usaModal({ bare: true, total, close: t.close, ariaLabel: t.kicker })}`;
  // NO adSlot() and hideAnchor — nothing may render before the rewarded video on this arm.

  const cfg = {
    questions: t.qs.map((q, qi) => ({
      key: "q" + (qi + 1), q: q.q,
      options: q.options.map((label, oi) => ({ id: String(oi), label }))
    })),
    resultsUrl: `${meBase(lang, arm)}jobs/`,
    autoDelay: 0,
    fn: `jobs_me_quiet_${lang.slug}`,
    copy: {
      title: t.ready.h1, sub: t.ready.micro, btn: t.ready.btn,
      loading: t.ready.loading, almost: t.ready.almost, finish: t.ready.finish,
      again: t.ready.again, skip: t.ready.skip, stepFmt: t.stepFmt
    }
  };

  write(`${arm.dir}${lang.slug}/index.html`, page({
    title: `${t.kicker} | ${SITE.name}`,
    desc: t.guide.desc,
    noindex: true,          // paid-only experiment arm — never index it (root §7)
    lang: lang.code,
    dir: lang.dir,
    foot: meFooter(lang, arm),
    body,
    wide: true,
    hideHeader: true,
    hideAnchor: true,       // no ad may render before the rewarded video on this arm
    prefetch: cfg.resultsUrl,   // warm the payoff guide (+ its ad slots) while the quiz is answered
    pageScript: `Jobs.initUsaModal(${JSON.stringify(cfg)});`
  }));
}

/* ---------- /me/ — language hub (indexable entry + the hreflang x-default) ---------- */
function buildMeHub() {
  // The hub itself stays LTR so every row reads identically; the native name is wrapped in <bdi>
  // so Arabic/Urdu still shape and order correctly inside an LTR row (setting dir="rtl" on the row
  // mirrored the whole card and flipped its chevron, which made the list look broken).
  const cards = ME_LANGS.map((l) => `<a class="pick" href="${meBase(l)}" data-po-no-intercept hreflang="${l.code}">
    <span class="pick-ic">${icon("users", 22)}</span>
    <span class="pick-label"><bdi lang="${l.code}">${esc(l.t.hubName)}</bdi><span class="pick-sub">${esc(l.english)}</span></span>
    <span class="pick-go">${icon("chevron", 20)}</span>
  </a>`).join("\n");

  const body = `<div class="q-head">
  <p class="q-kicker">${icon("pin", 15)} Saudi Arabia</p>
  <h1>Jobs in Saudi Arabia</h1>
</div>

<section class="content-block">
  <p class="lead">Answer three quick questions and open a free guide to finding work in the Kingdom — the sectors hiring, the main job sites, the official government services, and the job and visa scams to avoid. Choose your language.</p>
</section>

${adSlot("leaderboard")}

<div class="pick-list">
${cards}
</div>

<p class="micro center">${icon("shield", 14)} Free · No sign-up · Apply on official sites</p>

${adSlot("inContent")}`;

  write("me/index.html", page({
    title: `Jobs in Saudi Arabia — Free Guide in 5 Languages | ${SITE.name}`,
    desc: "A free guide to finding work in Saudi Arabia, in Arabic, English, Urdu, Hindi and Bengali: the sectors hiring, the main job sites, official government services, and how to avoid job and visa scams.",
    canonical: `${B}me/`,
    alternates: meAlternates(""),
    body
  }));
}
/* ----------------------------------------------------------------------------
 * /generic/ — the neutral paid entry point: a dead-simple pop-up quiz that leads to the USA
 * content page (owner spec 2026-08-14: "the popup with content leading to usa page, keep it
 * dead simple"). Purpose: a brand-safe landing URL for broad creatives that don't name a niche
 * ("jobs hiring now"), so that campaign gets its OWN URL (CPC attributes per campaign, root §7).
 *
 * SHAPE — identical to the /me/x/quiet/ arm, US-facing, and it OWNS NO CONTENT:
 *   /generic/  bare pop-up (close X + question + 3 options, nothing else), opens on load
 *      -> opt-in rewarded video
 *      -> /usa/remote-jobs/  the EXISTING USA content guide, with its full display ad load.
 * Reusing that guide is the whole point of "dead simple": one US guide to maintain, and the
 * page the visitor lands on is already a real article rather than a thin new duplicate.
 *
 * NO DISPLAY SLOTS AND NO ANCHOR HERE — the modal opens on load and covers the page, so an ad
 * behind the blur would be a non-viewable impression Google can read as an ad hidden by an
 * interstitial (root §5, the 2026-08-08 fix). Monetization is the rewarded video and the guide.
 *
 * The page BEHIND the pop-up is minimal but not empty, and the pop-up is always dismissable
 * (X / backdrop / Esc): a modal over a blank page is a dead end when closed, which is exactly
 * the forced-interstitial / doorway pattern that gets the ad account banned. Do not strip it to
 * nothing, do not make the modal non-dismissable, and do not auto-forward.
 * -------------------------------------------------------------------------- */
const GENERIC_MODAL = {
  // The same three low-friction questions as the Saudi funnel (owner's set). They only build
  // investment before the rewarded ask — the guide is static content and does not depend on them.
  questions: [
    { key: "type",     q: "What kind of job are you looking for?", options: ["Full-time", "Part-time", "Any available role"] },
    { key: "start",    q: "When can you start?",                   options: ["Immediately", "This week", "This month"] },
    { key: "schedule", q: "Which shift works best for you?",       options: ["Morning", "Afternoon", "Any shift"] }
  ]
};

function buildGenericLanding() {
  const total = GENERIC_MODAL.questions.length + 1;

  const body = `<section class="hero-card home-hero">
  <div class="hero-body">
    <span class="hero-brand">
      <span class="hero-brand-badge">${logoMark()}</span>
      <span class="hero-brand-name">${esc(SITE.name)}</span>
    </span>
    <h1>Jobs Hiring Now</h1>
    <p class="lead">Three quick questions, and your free guide to the roles hiring right now opens.</p>
    <div class="hero-ctas">
      <button class="btn" type="button" data-usa-open>Show my jobs${arrow()}</button>
    </div>
    <p class="micro center light">${icon("shield", 14)} Free · No sign-up · Apply on official sites</p>
  </div>
</section>

${usaModal({ bare: true, total, close: "Close", ariaLabel: "Jobs hiring now" })}`;

  const cfg = {
    questions: GENERIC_MODAL.questions.map((q) => ({
      key: q.key, q: q.q,
      options: q.options.map((label, oi) => ({ id: String(oi), label }))
    })),
    resultsUrl: `${B}usa/remote-jobs/`,   // the existing USA content guide = the rewarded payoff
    autoDelay: 0,
    fn: "jobs_generic",
    copy: {
      title: "Your job guide is ready",
      sub: "A short sponsored video plays first.",
      btn: "Show my jobs",
      loading: "Loading…",
      almost: "Almost there",
      finish: "Finish the short video to open your guide.",
      again: "Show my jobs",
      skip: "Skip and open my guide"
    }
  };

  write("generic/index.html", page({
    title: `Jobs Hiring Now | ${SITE.name}`,
    desc: "Answer three quick questions and get a free guide to jobs hiring now and the reputable places to apply. Free, no sign-up.",
    noindex: true,     // paid entry point whose payoff lives at /usa/remote-jobs/ — keep it out of the index
    body,
    wide: true,
    hideHeader: true,
    hideAnchor: true,  // no ad may render behind the pop-up
    prefetch: cfg.resultsUrl,   // warm the payoff guide (+ its ad slots) while the quiz is answered
    pageScript: `Jobs.initUsaModal(${JSON.stringify(cfg)});`
  }));
}

/* ---------- /remote-jobs-worldwide/south-africa/ — SA-specific guide (added 2026-08-20) --------
 * WHY A GEO PAGE EXISTS AT ALL: it is what makes aggressive ad copy legal. A claim is only safe
 * if the landing page proves it, so every hard line we want to run at South African traffic —
 * "paid in dollars, not rands", "your afternoon is their morning", "US firms do hire from SA" —
 * is stated here as a checkable fact with the mechanism behind it. Generic copy on a generic page
 * has to hedge; specific copy on a specific page does not. It is also +1 ad-bearing pageview with
 * a full slot load, and it can rank for "remote jobs from South Africa" as the global page cannot.
 *
 * Everything here is verifiable and carries NO earnings figures (root §4 Fight 2). SAST is UTC+2
 * with no daylight saving, so the overlap arithmetic is fixed and true year-round; the payment
 * rails are the ones the platforms actually publish; the BPO employers genuinely run South African
 * operations. Load shedding is in here because leaving it out is what marks a page as foreign. */
const SA_ADVANTAGES = [
  "South Africa is UTC+2 all year — no daylight saving to track. Your afternoon covers a US East Coast morning, and your working day lines up almost exactly with the UK and Western Europe.",
  "English is a first or fluent language for most of the workforce, which is the reason global companies built their offshore support operations here in the first place.",
  "South African labour is priced below US and Western European rates, so international employers and clients treat the country as a serious hiring market rather than an exception.",
  "The country already hosts a large offshore support industry, so 'work from home for a company abroad' is an established, ordinary thing here — not an unusual request."
];

const SA_PAY_NOTES = [
  "Upwork, Fiverr, Toptal and similar bill the client in USD or EUR and hold the money until the work is approved, so you are not chasing an overseas client for payment.",
  "Payoneer, Wise and PayPal all operate in South Africa, and most platforms also support a direct transfer to a local bank account. PayPal withdrawals in South Africa are processed through First National Bank.",
  "You are paid in the client's currency and it converts on the way in. Conversion rates and withdrawal fees differ noticeably between the payout options — compare them before you pick one.",
  "South African tax residents are taxed on worldwide income, so foreign earnings must be declared to SARS. Sort that out before your first payout, not at year end.",
  "No reputable platform charges you to join or to apply. They take a published percentage of what you earn. An upfront fee means it is not a platform."
];

const SA_PRACTICAL = [
  "Load shedding is the first thing an international employer will ask about. A UPS or inverter for your router and laptop, and a backup mobile data plan, is what turns 'unreliable' into 'covered' on an application.",
  "Fibre or stable LTE and a quiet room are standard requirements for any support role. The posting will state the minimum line speed it needs.",
  "For voice roles, expect a headset requirement and an accent or clarity check. Many international employers hire South African agents specifically for English-language support.",
  "Contract and freelance work means no paid leave, no UIF, and your own tax — price your rate with all three included rather than comparing it straight against a local salary."
];

const SA_EMPLOYERS = [
  { name: "Teleperformance South Africa", url: "https://www.teleperformance.com/en-us/locations/south-africa-site/", icon: "users",  desc: "Global customer-experience employer with large South African operations and work-at-home programmes. Search their site for current openings." },
  { name: "Concentrix",                   url: "https://jobs.concentrix.com/",                                       icon: "spark",  desc: "Runs offshore support delivery from South Africa and regularly recruits remote and hybrid support agents." },
  { name: "WNS",                          url: "https://www.wns.com/careers",                                        icon: "building", desc: "Business-process company with a long-established South African footprint across support, finance and analytics roles." },
  { name: "CCI Global",                   url: "https://www.cciglobal.com/careers/",                                  icon: "briefcase", desc: "Africa-focused outsourcing group hiring contact-centre and support staff across South African sites." },
  { name: "iSON Xperiences",              url: "https://isonxperiences.com/",                                         icon: "wifi",   desc: "Pan-African customer-experience provider with South African delivery centres and entry-level support intakes." },
  { name: "Amazon Jobs — South Africa",   url: "https://www.amazon.jobs/en/locations/south-africa",                   icon: "box",    desc: "Amazon runs a Cape Town operation and posts customer service and corporate roles, including virtual positions, for South Africa." }
];

function buildSouthAfricaGuide() {
  const faqs = [
    { q: "Can a South African legally work for a US company?", a: "Yes. If you live and work in South Africa you are not entering the United States, so no visa is involved. What varies is how the company engages you — usually as an independent contractor, sometimes as an employee through an employer-of-record service. Anyone offering to sell you a US work visa is running a scam." },
    { q: "Will I actually be paid in dollars?", a: "If you work through an international freelance platform or contract directly with an overseas client, yes — you are billed in the client's currency, normally USD or EUR, and it converts when it reaches your account. If you are hired by a South African branch of a global company, you are paid in rands like any local role." },
    { q: "How does the money reach my South African bank account?", a: "Most platforms support a direct transfer to a local bank account, and Payoneer, Wise and PayPal all operate in South Africa. PayPal withdrawals here are processed through First National Bank. Each platform lists its own payout options when you sign up." },
    { q: "Do I have to declare foreign income to SARS?", a: "South African tax residents are taxed on worldwide income, so yes — foreign earnings must be declared whatever currency they arrived in. Get advice before your first payout rather than at year end." },
    { q: "Does the time difference make US work impossible?", a: "No. South Africa is UTC+2 year-round, so your afternoon covers a US East Coast morning, and your standard working day overlaps the UK and Western Europe almost completely. Most postings state the overlap hours they need." },
    { q: "What about load shedding?", a: "It is the first thing an international employer asks about. A UPS or inverter for your router and laptop plus a backup mobile data plan is usually enough, and saying so directly on an application is far better than hoping it does not come up." },
    { q: "Do I need a degree or matric?", a: "For customer support, data work, annotation and transcription, usually not — most of these test you rather than ask for qualifications, and training is common. Freelance work depends on demonstrable skill rather than formal credentials." },
    { q: "How much can I earn?", a: "It varies too much to state a figure — it depends on the work, your experience and the client's market, and rates are set per role or per contract. Any site that guarantees you a specific monthly income is a scam, and that is true whether the figure is in rands or dollars." }
  ];

  const body = `<div class="results-head">
  <span class="results-check">${icon("check", 30)}</span>
  <h1>Remote Jobs From South Africa: Who Hires Here, and How You Get Paid</h1>
</div>
${byline()}

${adSlot("leaderboard")}

<section class="content-block">
  <p class="lead">Most jobs advertised as "US remote" will not take a South African application — and it is not your CV. This free guide explains what actually stops it, which international companies and platforms do hire from South Africa, how money in dollars reaches a South African bank account, and how to spot the job scams that target this market.</p>
</section>

<section class="content-block">
  <div class="card">
    <h2>Why your applications get rejected</h2>
    <p>When a company employs you, it has to run payroll, tax and benefits in the country you live in. Setting that up in South Africa costs an American employer real money, so their postings stay inside the states they already operate in. That "United States only" line is an accounting limit, not an assessment of you.</p>
    <p>It is also the gap job fraud sells into. Nobody can sell you a US job or a work visa. What genuinely exists is contract and freelance work for overseas clients, companies that hire internationally through an employer-of-record, and global employers who already run South African operations — all three are below.</p>
  </div>
</section>

<section class="content-block">
  <h2>What South Africa actually has going for it</h2>
  <ul class="ticks">${SA_ADVANTAGES.map((t) => `<li>${icon("check", 18)}<span>${esc(t)}</span></li>`).join("")}</ul>
</section>

${adSlot("inContent")}

<section class="content-block">
  <h2>Getting paid in dollars, into a South African account</h2>
  <p>This is the part most guides skip, and it is the part that decides whether overseas work is worth it. Here is how the money actually moves.</p>
  <ul class="ticks">${SA_PAY_NOTES.map((t) => `<li>${icon("dollar", 18)}<span>${esc(t)}</span></li>`).join("")}</ul>
</section>

<section class="content-block">
  <h2>Platforms that connect South Africans with overseas clients</h2>
  <p>Contract and freelance work is the most common route from South Africa to an international client, because country hiring limits do not apply the same way. All of these are free to join.</p>
  ${placeList(GLOBAL_PLATFORMS)}
</section>

${adSlot("results")}

<section class="content-block">
  <h2>International companies that hire across countries</h2>
  <p>Remote-first employers whose postings name the countries they can hire in. Check that line before applying — it is the fastest way to tell a real opportunity from a wasted afternoon.</p>
  ${placeList(GLOBAL_EMPLOYERS)}
</section>

<section class="content-block">
  <h2>Global employers already hiring in South Africa</h2>
  <p>These companies run South African operations, which means they can employ you directly here — no employer-of-record, no contractor arrangement. Openings change often, so search each careers page for what is live today.</p>
  ${placeList(SA_EMPLOYERS)}
</section>

${adSlot("inContent2")}

<section class="content-block">
  <h2>Remote job boards worth searching</h2>
  ${placeList(GLOBAL_BOARDS)}
</section>

<section class="content-block">
  <h2>What you need before you apply</h2>
  <ul class="ticks">${SA_PRACTICAL.map((t) => `<li>${icon("shield", 18)}<span>${esc(t)}</span></li>`).join("")}</ul>
</section>

${adSlot("inContent3")}

<section class="content-block">
  <div class="card">
    <h2>Job scams targeting South Africans</h2>
    <p>Unemployment here makes this market a target, and the same handful of frauds run constantly. None of them survive these five checks.</p>
    <ul class="ticks">
      <li>${icon("shield", 18)}<span>Nobody can sell you a US job or a work visa. Any offer built on that promise is a fraud, whoever it comes from.</span></li>
      <li>${icon("shield", 18)}<span>A real employer or platform never charges a joining fee, a placement fee, a training fee, or asks you to buy equipment from them.</span></li>
      <li>${icon("shield", 18)}<span>"Jobs" arriving by WhatsApp or Telegram offering daily payments for simple tasks are task fraud, not employment. Blocking is the correct response.</span></li>
      <li>${icon("shield", 18)}<span>Any specific guaranteed monthly income — in rands or in dollars — is a scam signal. Real work pays per hour, per task or per contract, and the figure is not promised in an advert.</span></li>
      <li>${icon("shield", 18)}<span>Never send your ID, banking details or a copy of your qualifications before you have a verified, signed contract.</span></li>
    </ul>
  </div>
</section>

${faqHTML(faqs)}

<div class="hero-ctas center">
  <a class="btn" href="${B}remote-jobs-worldwide/" data-po-no-intercept>See the full international guide${arrow()}</a>
</div>`;

  write("remote-jobs-worldwide/south-africa/index.html", page({
    title: `Remote Jobs From South Africa — Who Hires Here & How You Get Paid | ${SITE.name}`,
    desc: "A free guide to remote work from South Africa: why US listings reject local applications, the platforms and companies that do hire here, how dollar payments reach a South African bank account, and how to spot job scams.",
    canonical: `${B}remote-jobs-worldwide/south-africa/`,
    body,
    wide: true
  }));
}

/* ---------- /worldwide-bkp/ — BACKUP two-page modal lander (demoted from /worldwide/ 2026-08-28) ----------
 * Was the champion at /worldwide/ (added 2026-08-20); the single-page SPA twin was promoted into
 * /worldwide/ on 2026-08-28 and this two-page shape now backs up at /worldwide-bkp/ (fn
 * jobs_worldwide_bkp). Kept so we can fall back or A/B the two shapes.
 * The sibling of /generic/, and the reason /remote-jobs-worldwide/ is a funnel and not just an
 * article: it gives the "remote jobs from <country>" campaigns their OWN landing URL, so CPC
 * attributes per campaign in Google/FB and RPM attributes per URL prefix in GAM (root §7 — split at
 * the ad-buy, never client-side). Identical shape to /generic/ (bare pop-up on load -> opt-in
 * rewarded video -> the guide) and reuses the one modal engine; only the copy and the payoff differ.
 *
 * The questions are geo-NEUTRAL on purpose: they build investment before the rewarded ask, and
 * asking "which country are you in?" would telegraph a multi-country campaign and undercut the
 * "this is for me" feel (same reasoning as /packing-jobs/, owner decision 2026-08-08). The guide is
 * static content and does not depend on the answers.
 *
 * NO display slots and hideAnchor — the modal opens on load and covers the page (root §5, the
 * 2026-08-08 rule). Monetization is the rewarded video plus the guide's own full ad load. */
const WORLDWIDE_MODAL = {
  questions: [
    { key: "type",  q: "What kind of remote work are you looking for?", options: ["Full-time", "Part-time or flexible", "Any remote work"] },
    { key: "exp",   q: "Have you worked remotely before?",              options: ["Yes", "No, this would be my first", "A little"] },
    { key: "start", q: "When could you start?",                         options: ["Immediately", "This month", "Just looking for now"] }
  ]
};

function buildWorldwideLanding() {
  const total = WORLDWIDE_MODAL.questions.length + 1;

  const body = `<section class="hero-card home-hero">
  <div class="hero-body">
    <span class="hero-brand">
      <span class="hero-brand-badge">${logoMark()}</span>
      <span class="hero-brand-name">${esc(SITE.name)}</span>
    </span>
    <h1>Remote Jobs You Can Do From Any Country</h1>
    <p class="lead">Three quick questions, and your free guide to the companies and platforms that hire internationally opens.</p>
    <div class="hero-ctas">
      <button class="btn" type="button" data-usa-open>Show my guide${arrow()}</button>
    </div>
    <p class="micro center light">${icon("shield", 14)} Free · No sign-up · Apply on official sites</p>
  </div>
</section>

${usaModal({ bare: true, total, close: "Close", ariaLabel: "Remote jobs from any country" })}`;

  const cfg = {
    questions: WORLDWIDE_MODAL.questions.map((q) => ({
      key: q.key, q: q.q,
      options: q.options.map((label, oi) => ({ id: String(oi), label }))
    })),
    resultsUrl: `${B}remote-jobs-worldwide/`,   // the international guide = the rewarded payoff
    autoDelay: 0,
    fn: "jobs_worldwide_bkp",   // BACKUP: the old two-page shape, demoted from /worldwide/ 2026-08-28 when the SPA won the slot
    copy: {
      title: "Your guide is ready",
      sub: "A short sponsored video plays first.",
      btn: "Show my guide",
      loading: "Loading…",
      almost: "Almost there",
      finish: "Finish the short video to open your guide.",
      again: "Show my guide",
      skip: "Skip and open my guide"
    }
  };

  // Demoted 2026-08-28: this two-page modal lander was the champion at /worldwide/; the single-page
  // (SPA) twin was promoted into /worldwide/ (see buildWorldwidePre) and this build now backs up here.
  write("worldwide-bkp/index.html", page({
    title: `Remote Jobs You Can Do From Any Country | ${SITE.name}`,
    desc: "Answer three quick questions and get a free guide to the companies and platforms that hire remotely across countries. Free, no sign-up.",
    noindex: true,     // paid/backup entry point whose payoff lives at /remote-jobs-worldwide/ — keep it out of the index
    body,
    wide: true,
    hideHeader: true,
    hideAnchor: true,  // no ad may render behind the pop-up
    prefetch: cfg.resultsUrl,   // warm the payoff guide (+ its ad slots) while the quiz is answered
    pageScript: `Jobs.initUsaModal(${JSON.stringify(cfg)});`
  }));
}

/* ---------- /worldwide/sa/ — SOUTH AFRICA paid entry (added 2026-08-20) ----------
 * Same engine and same shape as /worldwide/, pointed at the SA guide. It exists so the South
 * African campaigns get their OWN landing URL: CPC attributes per campaign in Google Ads and RPM
 * attributes per URL prefix in GAM, which is the whole point of splitting at the ad-buy (root §7).
 * The hero names South Africa because the creative does — ad-to-page promise match is both a
 * Quality Score input (lower CPC) and the first thing a policy reviewer checks.
 * NO display slots + hideAnchor: the modal opens on load and covers the page (root §5). */
function buildSaLanding() {
  const total = WORLDWIDE_MODAL.questions.length + 1;

  const body = `<section class="hero-card home-hero">
  <div class="hero-body">
    <span class="hero-brand">
      <span class="hero-brand-badge">${logoMark()}</span>
      <span class="hero-brand-name">${esc(SITE.name)}</span>
    </span>
    <h1>Remote Jobs From South Africa</h1>
    <p class="lead">Three quick questions, and your free guide opens — who hires from South Africa, and how you get paid.</p>
    <div class="hero-ctas">
      <button class="btn" type="button" data-usa-open>Show my guide${arrow()}</button>
    </div>
    <p class="micro center light">${icon("shield", 14)} Free · No sign-up · Apply on official sites</p>
  </div>
</section>

${usaModal({ bare: true, total, close: "Close", ariaLabel: "Remote jobs from South Africa" })}`;

  const cfg = {
    questions: WORLDWIDE_MODAL.questions.map((q) => ({
      key: q.key, q: q.q,
      options: q.options.map((label, oi) => ({ id: String(oi), label }))
    })),
    resultsUrl: `${B}remote-jobs-worldwide/south-africa/`,   // the SA guide = the rewarded payoff
    autoDelay: 0,
    fn: "jobs_sa",
    copy: {
      title: "Your guide is ready",
      sub: "A short sponsored video plays first.",
      btn: "Show my guide",
      loading: "Loading…",
      almost: "Almost there",
      finish: "Finish the short video to open your guide.",
      again: "Show my guide",
      skip: "Skip and open my guide"
    }
  };

  write("worldwide/sa/index.html", page({
    title: `Remote Jobs From South Africa | ${SITE.name}`,
    desc: "Answer three quick questions and get a free guide to the companies and platforms that hire remotely from South Africa, and how you get paid. Free, no sign-up.",
    noindex: true,     // paid entry point whose payoff lives at /remote-jobs-worldwide/south-africa/
    body,
    wide: true,
    hideHeader: true,
    hideAnchor: true,  // no ad may render behind the pop-up
    prefetch: cfg.resultsUrl,   // warm the payoff guide (+ its ad slots) while the quiz is answered
    pageScript: `Jobs.initUsaModal(${JSON.stringify(cfg)});`
  }));
}

/* ----------------------------------------------------------------------------
 * AD-BUILDER TOOL  ->  dist/create-ads/   (internal, noindex, password-gated)
 *
 * Turns our remote-jobs funnel into ready-to-upload paid-social / display / native creatives
 * in seconds. Draws each ad on an HTML5 <canvas> (generated brand background OR our one licensed
 * photo + native chrome + benefit headline + CTA + brand mark) and exports PNGs — 100% client-side,
 * zero dependencies, using our OWN same-origin image (so the canvas never taints).
 *
 * Flow the owner asked for: SIZE first -> STYLE (template) -> ANGLE (14 remote-work audiences:
 * seniors, stay-at-home parents, students, no-experience, near-me, …). Each angle maps to a real
 * funnel URL (the per-angle landers under /remote/, or the generic /remote/) so the operator knows
 * where to point the campaign — split the ad-buy by angle URL and reporting separates by arm (root §7).
 *
 * Template set is grounded in what actually gets LOW CPC / HIGH CTR for JOB ads (research 2026):
 *  - Employment ads run a low ~0.47% CTR, so we lean NATIVE / feed-blending (job-listing card, "new
 *    job alert", search-result, clean editorial) — non-salesy creative wins the auction on quality
 *    score => cheaper clicks.
 *  - BENEFIT-led ("what's in it for me" in 2s): pay badge, no-commute / no-experience checklist.
 *  - REAL PEOPLE photos convert ~2x — we use our one licensed CC0 couple-at-home photo (never a
 *    ripped stock/employer image, root rule).
 *  - DIRECT / high-intent: "Now Hiring", a qualifier question, and our trust / anti-scam angle
 *    (the funnel's whole differentiator). Purple + amber accents test high on CTR, so they're in
 *    the accent cycle.
 *
 * Compliance is baked in (root §4 Fight 2): every line is TRUE framing — "hiring nationwide",
 * "$15-28/hr commonly advertised", "no experience needed for many roles", "no fees, no sign-up".
 * NEVER an invented specific stat ("92% get hired") or an unrealistic income promise ("$5k/week
 * from home") — those are exactly what gets a Facebook/Google AD ACCOUNT banned, which zeroes all
 * revenue. Pay ranges mirror data/remote-jobs.json. (Employment is a Meta Special Ad Category —
 * that restricts TARGETING at the ad-buy, not this creative; the copy here stays inclusive.)
 *
 * The password is a CLIENT-SIDE deterrent only (view-source-able). The page is noindex + unlinked,
 * loads NO ad SDK, and never touches paid traffic.
 * -------------------------------------------------------------------------- */
const AD_ADMIN_PASS = "admin";   // gate for /create-ads (client-side deterrent only)

// The 14 remote-work ad ANGLES. Each maps to a funnel URL (per-angle landers where they exist,
// else generic /remote/). head uses "|" for line breaks. All copy is TRUE framing (no invented
// stats / income promises). pay ranges mirror data/remote-jobs.json.
const REMOTE_AD_ANGLES = [
  { id:"seniors",  aud:"For 50+",         role:"Remote Jobs — Ages 50+",        head:"Remote Jobs|for People 50+",           sub:"Experience is valued — customer service & data entry, hiring nationwide.", pay:"$15–28/hr", term:"remote jobs for seniors", url:"remote/seniors/" },
  { id:"parents",  aud:"For Parents",     role:"Flexible Remote Work",               head:"Work From Home,|Around Your Family",    sub:"Flexible, part-time remote roles for stay-at-home parents. No commute.",        pay:"$15–28/hr", term:"work from home jobs for moms", url:"remote/parents/" },
  { id:"students", aud:"For Students",    role:"Entry-Level Remote Jobs",            head:"Remote Jobs That|Fit Around Class",     sub:"Entry-level work-from-home roles — many need no experience.",               pay:"$15–22/hr", term:"remote jobs for students", url:"remote/students/" },
  { id:"noexp",    aud:"No Experience",   role:"Remote Jobs — No Experience",   head:"Remote Jobs —|No Experience Needed", sub:"Many roles provide full training. Start working from home.",                  pay:"$15–22/hr", term:"work from home no experience", url:"remote/" },
  { id:"nodegree", aud:"No Degree",       role:"Work From Home — No Degree",    head:"Work From Home,|No Degree Required",    sub:"Real remote roles that don’t need a college degree.",                       pay:"$15–25/hr", term:"remote jobs no degree", url:"remote/" },
  { id:"parttime", aud:"Part-Time",       role:"Part-Time Remote Jobs",              head:"Part-Time Remote|Jobs Hiring Now",      sub:"Choose your hours — flexible work-from-home shifts.",                       pay:"$15–25/hr", term:"part time remote jobs", url:"remote/" },
  { id:"nearme",   aud:"Near You",        role:"Remote Jobs Near You",               head:"Remote Jobs|Hiring in Your Area",       sub:"Work-from-home roles open to applicants nationwide.",                            pay:"$15–28/hr", term:"remote jobs near me hiring", url:"remote/" },
  { id:"side",     aud:"Extra Income",    role:"Flexible Side Income",               head:"Earn From Home|in Your Spare Time",     sub:"Flexible remote roles to add a second income. Honest, hourly work.",             pay:"$15–25/hr", term:"side income from home", url:"remote/" },
  { id:"dataentry",aud:"Data Entry",      role:"Remote Data Entry Clerk",            head:"Remote Data Entry|Jobs Hiring",         sub:"Enter and check information from home. Great entry-level start.",                 pay:"$15–20/hr", term:"data entry jobs remote", url:"remote/" },
  { id:"support",  aud:"Customer Service",role:"Customer Service (Remote)",          head:"Customer Service Jobs|You Can Do From Home", sub:"Handle calls, chats, or emails from a queue — training is common.",     pay:"$15–22/hr", term:"customer service work from home", url:"remote/" },
  { id:"va",       aud:"Virtual Assistant",role:"Virtual Assistant (Remote)",        head:"Become a|Virtual Assistant",           sub:"Manage schedules & email from home. Flexible remote work.",                      pay:"$16–25/hr", term:"virtual assistant jobs hiring", url:"remote/" },
  { id:"veterans", aud:"For Veterans",    role:"Remote Jobs for Veterans",           head:"Remote Jobs|for Veterans",             sub:"Flexible work-from-home roles hiring nationwide.",                               pay:"$15–28/hr", term:"remote jobs for veterans", url:"remote/" },
  { id:"between",  aud:"Between Jobs",     role:"Remote Roles Hiring Now",            head:"Between Jobs?|Work From Home",         sub:"Remote roles hiring now — no commute, quick to start.",                     pay:"$15–28/hr", term:"remote jobs hiring immediately", url:"remote/" },
  { id:"legit",    aud:"Legit · No Scams", role:"Verified Remote Jobs",         head:"Legit Work-From-Home|Jobs (No Scams)", sub:"No fees, no sign-up. Only reputable job boards.",                                pay:"$15–28/hr", term:"legitimate work from home jobs", url:"remote/" }
];

function buildRemoteAds(remoteProp) {
  // The one licensed/PD photo the site owns (couple working at home, CC0). Same-origin so the
  // canvas never taints on export. Absent -> the "Real Photo" templates simply fall back to a
  // generated background, so the tool still works.
  var photo = null;
  if (remoteProp && remoteProp.image && remoteProp.image.src) {
    photo = {
      src: /^https?:/.test(remoteProp.image.src) ? remoteProp.image.src : B + remoteProp.image.src,
      credit: remoteProp.image.credit || "",
      license: remoteProp.image.license || ""
    };
  }
  var safe = function (o) { return JSON.stringify(o).replace(/</g, "\\u003c"); };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Ad Builder — ${esc(SITE.name)} (internal)</title>
<style>
  :root{ --brand:#0b57d0; --brand-dark:#083e93; --accent:#2f8bff; --bg:#eef3fb; --card:#fff;
         --ink:#0f2033; --ink-soft:#5b6b80; --line:#d6e0ef; --radius:16px;
         --tint:#dfeafd; --sans:-apple-system,"Segoe UI",Roboto,Arial,sans-serif; }
  *{box-sizing:border-box}
  body{margin:0;font-family:var(--sans);color:var(--ink);background:var(--bg);-webkit-text-size-adjust:100%}
  h1,h2,h3{margin:0}
  button{font-family:inherit;cursor:pointer}
  .hide{display:none!important}
  .gate{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .gate-box{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
            box-shadow:0 10px 30px rgba(15,32,51,.10);padding:28px;width:100%;max-width:360px;text-align:center}
  .gate-box h1{font-size:22px;margin-bottom:6px}
  .gate-box p{color:var(--ink-soft);font-size:14px;margin:0 0 18px}
  .gate-box input{width:100%;padding:14px 16px;font-size:17px;border:2px solid var(--line);border-radius:12px;margin-bottom:12px}
  .gate-box input:focus{outline:none;border-color:var(--brand)}
  .gate-box .err{color:#c0392b;font-size:14px;min-height:18px;margin-bottom:8px}
  .btn{background:var(--brand);color:#fff;border:none;border-radius:12px;padding:14px 20px;font-size:16px;font-weight:700;width:100%}
  .btn:hover{background:var(--brand-dark)}
  .btn.sm{width:auto;padding:10px 16px;font-size:14px}
  .top{position:sticky;top:0;z-index:20;background:rgba(238,243,251,.94);backdrop-filter:blur(6px);
       border-bottom:1px solid var(--line);padding:12px 16px}
  .top-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;max-width:1200px;margin:0 auto}
  .wrap{max-width:1200px;margin:0 auto;padding:18px 16px 60px}
  .note{background:#eaf2ff;border:1px solid var(--accent);color:#0b3a7a;border-radius:12px;
        padding:10px 14px;font-size:13px;margin:0 auto 16px;max-width:1200px;line-height:1.5}
  .grp{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--brand-dark);margin:22px 0 8px}
  .grp:first-child{margin-top:4px}
  .tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
  .ex-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
  .ex{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
  .ex .stage{position:relative;background:#101826;display:flex;align-items:center;justify-content:center;padding:10px}
  .ex canvas{max-width:100%;max-height:360px;height:auto;width:auto;display:block;box-shadow:0 6px 18px rgba(0,0,0,.3)}
  .arrow{position:absolute;top:50%;transform:translateY(-50%);width:36px;height:36px;border-radius:50%;
         border:none;background:rgba(255,255,255,.92);color:#0f2033;font-size:19px;font-weight:800;
         display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.3)}
  .arrow:hover{background:#fff}
  .arrow.l{left:10px} .arrow.r{right:10px}
  .ex .foot{padding:10px 12px}
  .ex .foot .name{font-size:14px;font-weight:700}
  .ex .foot .sub{font-size:12px;color:var(--ink-soft);margin:2px 0 2px}
  .ex .foot .lic{font-size:11px;color:var(--ink-soft);margin:3px 0 8px;line-height:1.35;max-height:34px;overflow:hidden}
  .ex .foot .btn{font-size:14px;padding:11px}
  .crumbs{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-right:auto}
  .crumb{background:none;border:none;font:inherit;font-size:14px;font-weight:700;color:var(--ink-soft);
         display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:9px;max-width:44vw;
         overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .crumb .cn{flex:none;display:inline-flex;width:20px;height:20px;border-radius:50%;background:var(--line);
             color:var(--ink);align-items:center;justify-content:center;font-size:12px}
  .crumb.active{color:var(--ink)} .crumb.active .cn{background:var(--brand);color:#fff}
  .crumb.done{color:var(--brand-dark);cursor:pointer} .crumb.done:hover{background:var(--tint)}
  .crumb.done .cn{background:var(--tint);color:var(--brand-dark)}
  .crumb.todo{opacity:.45;cursor:default}
  .csep{color:var(--ink-soft);opacity:.5}
  .step-h{font-size:16px;margin:2px 0 15px;font-weight:700}
  .step-h span{color:var(--ink-soft);font-weight:400;font-size:13px}
  .acc-row{display:flex;gap:8px;align-items:center;margin:0 0 14px;flex-wrap:wrap}
  .acc-row .lbl{font-size:13px;color:var(--ink-soft);font-weight:600}
  .sw{width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px var(--line);cursor:pointer}
  .sw.on{box-shadow:0 0 0 2px var(--brand);transform:scale(1.08)}
  .size-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px}
  .size-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;cursor:pointer;
             display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center;transition:transform .08s,box-shadow .12s,border-color .12s}
  .size-card:hover{border-color:var(--brand);transform:translateY(-2px);box-shadow:0 10px 22px rgba(15,32,51,.12)}
  .size-thumb{width:100%;height:96px;display:flex;align-items:center;justify-content:center}
  .size-ar{background:linear-gradient(135deg,#cfe0f8,#a9c6f0);border:1px solid #a9c6f0;border-radius:4px;max-width:100%;max-height:96px}
  .size-card b{font-size:13px} .size-card small{color:var(--ink-soft);font-size:12px}
  .tcard{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;cursor:pointer;
         padding:0;text-align:left;transition:transform .08s,box-shadow .12s,border-color .12s}
  .tcard:hover{transform:translateY(-2px);box-shadow:0 12px 26px rgba(15,32,51,.14);border-color:var(--brand)}
  .tcard .st{background:#101826;display:flex;align-items:center;justify-content:center;padding:10px;min-height:150px}
  .tcard .st canvas{max-width:100%;max-height:260px;height:auto;width:auto;display:block;box-shadow:0 5px 16px rgba(0,0,0,.3)}
  .tcard .m{padding:9px 11px}
  .tcard .m b{font-size:13px;display:block} .tcard .m span{font-size:11px;color:var(--ink-soft)}
  @media(max-width:520px){ .crumb{font-size:13px;max-width:38vw} }
</style>
</head>
<body>

<!-- GATE -->
<div id="gate" class="gate">
  <form class="gate-box" id="gateForm">
    <h1>${esc(SITE.name)} Ad Builder</h1>
    <p>Internal tool — remote-jobs paid creatives. Enter the admin password.</p>
    <input id="pw" type="password" autocomplete="current-password" placeholder="Password" autofocus>
    <div class="err" id="pwErr"></div>
    <button class="btn" type="submit">Enter</button>
  </form>
</div>

<!-- APP -->
<div id="app" class="hide">
  <div class="top">
    <div class="top-row">
      <nav class="crumbs" aria-label="Steps">
        <button class="crumb" id="crumbSize"><span class="cn">1</span> <span class="cl">Size</span></button>
        <span class="csep">&rsaquo;</span>
        <button class="crumb" id="crumbTpl"><span class="cn">2</span> <span class="cl">Style</span></button>
        <span class="csep">&rsaquo;</span>
        <button class="crumb" id="crumbAngle"><span class="cn">3</span> <span class="cl">Angle</span></button>
      </nav>
      <button class="btn sm hide" id="dlAllBtn">Download all PNGs</button>
    </div>
  </div>

  <div class="note">
    Every headline uses honest framing (no invented "% hired" claims, no unrealistic income promises)
    and pay ranges mirror our real data — that is what keeps the Facebook / Google ad account alive.
    The "Real Photo" styles use our one licensed CC0 photo (credit shown on the card); all other styles
    are generated and brand-safe. Point each angle's campaign at the funnel URL shown on its card.
  </div>

  <div class="wrap">
    <div id="stepSize"></div>
    <div id="stepTpl" class="hide"></div>
    <div id="stepAngle" class="hide"></div>
  </div>
</div>

<script>
(function(){
  "use strict";
  var PASS = ${safe(AD_ADMIN_PASS)};
  var ANGLES = ${safe(REMOTE_AD_ANGLES)};
  var SITE_NAME = ${safe(SITE.name)};
  var PHOTO = ${safe(photo)};
  var BASE = ${safe(B)};

  /* ---------- gate (client-side deterrent only) ---------- */
  var gate = document.getElementById("gate"), app = document.getElementById("app");
  function unlock(){ gate.classList.add("hide"); app.classList.remove("hide"); initApp(); }
  document.getElementById("gateForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    var v = document.getElementById("pw").value;
    if(v===PASS){ try{ sessionStorage.setItem("jgm_ad_ok","1"); }catch(e){} unlock(); }
    else { document.getElementById("pwErr").textContent = "Incorrect password."; }
  });

  /* ---------- ad sizes (popular Facebook + Google + native formats) ---------- */
  var SIZES = [
    {g:"Facebook / Instagram", label:"Feed Portrait (1080x1350)", w:1080, h:1350},
    {g:"Facebook / Instagram", label:"Feed Square (1080x1080)",   w:1080, h:1080},
    {g:"Facebook / Instagram", label:"Link / Landscape (1200x628)", w:1200, h:628},
    {g:"Facebook / Instagram", label:"Story / Reel (1080x1920)",  w:1080, h:1920},
    {g:"Google Display", label:"Medium Rectangle (300x250)", w:300, h:250},
    {g:"Google Display", label:"Large Rectangle (336x280)",  w:336, h:280},
    {g:"Google Display", label:"Half Page (300x600)",        w:300, h:600},
    {g:"Google Display", label:"Leaderboard (728x90)",       w:728, h:90},
    {g:"Google Display", label:"Large Mobile Banner (320x100)", w:320, h:100},
    {g:"Google Display", label:"Mobile Banner (320x50)",     w:320, h:50},
    {g:"Google Display", label:"Wide Skyscraper (160x600)",  w:160, h:600},
    {g:"Google Display", label:"Billboard (970x250)",        w:970, h:250},
    {g:"Google Display", label:"Square (250x250)",           w:250, h:250},
    {g:"Native", label:"Native Landscape (1200x628)", w:1200, h:628},
    {g:"Native", label:"Native Square (1200x1200)",  w:1200, h:1200},
    {g:"Native", label:"Native Portrait (960x1200)", w:960, h:1200}
  ];

  /* ---------- accent palette (cycled with arrows for A/B creative variety) ----------
     Blue = brand. Purple + Amber test HIGH on CTR (research). Green reads money / trust. */
  var ACCENTS = [
    {name:"Blue",   a:"#2f8bff", b:"#0b57d0", solid:"#0b57d0", chip:"#0b57d0", onSolid:"#fff"},
    {name:"Teal",   a:"#12b3c4", b:"#0a5f6b", solid:"#0a6b78", chip:"#0a6b78", onSolid:"#fff"},
    {name:"Purple", a:"#8b5cf6", b:"#5b21b6", solid:"#5b21b6", chip:"#5b21b6", onSolid:"#fff"},
    {name:"Amber",  a:"#f8b34a", b:"#c2740a", solid:"#d98216", chip:"#a8560a", onSolid:"#3a2405"},
    {name:"Green",  a:"#22c07a", b:"#047857", solid:"#047857", chip:"#047857", onSolid:"#fff"}
  ];
  var INK = "#0f2033", INKSOFT = "#5b6b80";
  var SANS = 'Arial, "Helvetica Neue", sans-serif';
  var DEFAULT_BULLETS = ["Work from home", "No commute", "Training for many roles", "Flexible hours"];
  var TRUST_BULLETS   = ["No fees to start", "No sign-up or email", "Reputable job boards only"];

  /* ---------- 12 templates across the 4 research-backed groups ----------
     Flags read by the renderer: bg grad|solid|light|photo; card; header notif|search;
     badge hiring|pay; ic (glyph); bullets; ribbon; headSrc role|head; trust. */
  var TEMPLATES = [
    // Native / feed-blending  (non-salesy => cheaper clicks on quality score)
    {id:"listing", name:"Job Listing Card", group:"Native (feed-blending)", bg:"grad",  card:true, headSrc:"role", payPill:true, loc:true, cta:"View Job"},
    {id:"alert",   name:"New Job Alert",    group:"Native (feed-blending)", bg:"grad",  card:true, header:"notif", cta:"See Openings"},
    {id:"search",  name:"Search Result",    group:"Native (feed-blending)", bg:"light", card:true, header:"search", cta:"See Results"},
    {id:"minimal", name:"Clean Editorial",  group:"Native (feed-blending)", bg:"light", ic:"laptop", cta:"See Remote Jobs"},
    // Benefit-led  ("what's in it for me" in 2 seconds)
    {id:"checklist",name:"Benefit Checklist",group:"Benefit-led", bg:"grad", bullets:true, cta:"See Openings"},
    {id:"pay",      name:"Pay Badge",        group:"Benefit-led", bg:"grad", badge:"pay", cta:"See Openings"},
    {id:"flexible", name:"Flexible Hours",   group:"Benefit-led", bg:"light", card:true, ic:"clock", cta:"See Openings"},
    // Photo (real people ~2x CTR) — our one licensed CC0 photo
    {id:"photo",       name:"Real Photo",        group:"Photo (real people)", bg:"photo", cta:"Work From Home"},
    {id:"photoribbon", name:"Photo + Now Hiring", group:"Photo (real people)", bg:"photo", ribbon:true, cta:"Apply From Home"},
    // Direct / high-intent
    {id:"nowhiring", name:"Now Hiring Banner", group:"Direct / high-intent", bg:"solid", badge:"hiring", cta:"See Openings"},
    {id:"question",  name:"Qualifier Question",group:"Direct / high-intent", bg:"grad", ic:"help", cta:"See If You Qualify"},
    {id:"trust",     name:"Legit / No Scams",   group:"Direct / high-intent", bg:"light", card:true, ic:"shield", trust:true, cta:"See Verified Jobs"}
  ];

  /* ---------- helpers ---------- */
  function fmt(s, a){
    return String(s).split("{head}").join(a.head).split("{sub}").join(a.sub)
      .split("{pay}").join(a.pay).split("{aud}").join(a.aud)
      .split("{role}").join(a.role).split("{term}").join(a.term);
  }
  function lines2(s){ return String(s).split("|"); }
  var imgCache = {};
  function loadImg(url){
    if(!url) return Promise.resolve(null);
    if(imgCache[url]) return imgCache[url];
    imgCache[url] = new Promise(function(res){
      var im = new Image();
      im.onload = function(){ res(im); };
      im.onerror = function(){ res(null); };
      im.src = url;
    });
    return imgCache[url];
  }
  function rr(ctx,x,y,w,h,r){ r=Math.min(r,w/2,h/2); ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
  function cover(ctx,img,x,y,w,h){
    if(!img){ ctx.fillStyle="#33465e"; ctx.fillRect(x,y,w,h); return; }
    var s=Math.max(w/img.width, h/img.height), iw=img.width*s, ih=img.height*s;
    ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
    ctx.drawImage(img, x+(w-iw)/2, y+(h-ih)/2, iw, ih); ctx.restore();
  }
  var clampN=function(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); };
  function wrapLines(ctx,text,maxW){
    var out=[], paras=String(text).split("|");
    for(var p=0;p<paras.length;p++){
      var words=paras[p].split(" "), line="";
      for(var i=0;i<words.length;i++){
        var t=line?line+" "+words[i]:words[i];
        if(ctx.measureText(t).width>maxW && line){ out.push(line); line=words[i]; }
        else line=t;
      }
      if(line) out.push(line);
    }
    return out;
  }
  /* fit text into a box bounded by BOTH width and height (never overflows either) */
  function fitBox(ctx,text,boxW,boxH,weight,font,hiPx){
    var px=Math.max(9,Math.round(hiPx));
    while(px>=9){
      ctx.font=weight+" "+px+"px "+font;
      var lh=px*1.14, lines=wrapLines(ctx,text,boxW);
      var wOK=true; for(var i=0;i<lines.length;i++){ if(ctx.measureText(lines[i]).width>boxW){ wOK=false; break; } }
      if(wOK && lines.length*lh<=boxH) return {px:px, lines:lines, lh:lh};
      px -= Math.max(1, Math.round(px*0.06));
    }
    ctx.font=weight+" 9px "+font;
    return {px:9, lines:wrapLines(ctx,text,boxW), lh:9*1.14};
  }
  function fitOneLine(ctx,text,maxW,weight,font,hiPx){
    var px=Math.max(8,Math.round(hiPx));
    while(px>=8){ ctx.font=weight+" "+px+"px "+font; if(ctx.measureText(text).width<=maxW) return px; px-=1; }
    return 8;
  }
  function ctaPill(ctx,text,cx,cy,scale,fill,textColor,arrow){
    var tc=textColor||"#fff";
    ctx.font="800 "+(22*scale)+"px "+SANS;
    var tw=ctx.measureText(text).width, padX=26*scale, h=54*scale, aw=arrow?20*scale:0;
    var w=tw+padX*2+aw, x=cx-w/2, y=cy-h/2;
    rr(ctx,x,y,w,h,h/2); ctx.fillStyle=fill; ctx.fill();
    ctx.fillStyle=tc; ctx.textAlign="left"; ctx.textBaseline="middle";
    ctx.fillText(text, x+padX, cy+scale);
    if(arrow){ var ax=x+padX+tw+11*scale; ctx.beginPath(); ctx.moveTo(ax,cy-7*scale);
      ctx.lineTo(ax+9*scale,cy); ctx.lineTo(ax,cy+7*scale); ctx.lineWidth=4*scale;
      ctx.strokeStyle=tc; ctx.lineJoin="round"; ctx.lineCap="round"; ctx.stroke(); }
    ctx.textBaseline="alphabetic";
    return w;
  }
  function chip(ctx,text,x,y,scale,fill,textColor){
    ctx.font="800 "+(15*scale)+"px "+SANS;
    var tw=ctx.measureText(text).width, padX=12*scale, h=28*scale;
    rr(ctx,x,y,tw+padX*2,h,h/2); ctx.fillStyle=fill; ctx.fill();
    ctx.fillStyle=textColor||"#fff"; ctx.textAlign="left"; ctx.textBaseline="middle";
    ctx.fillText(text, x+padX, y+h/2+scale*0.6); ctx.textBaseline="alphabetic";
    return tw+padX*2;
  }
  function brandMark(ctx,x,y,scale,onDark){
    ctx.font="800 "+(15*scale)+"px "+SANS;
    var t=SITE_NAME, tw=ctx.measureText(t).width, r=6*scale, gap=8*scale;
    ctx.beginPath(); ctx.arc(x+r, y+r, r, 0, 7);
    ctx.fillStyle=onDark?"#fff":"#0b57d0"; ctx.fill();
    ctx.fillStyle=onDark?"rgba(255,255,255,.92)":"#0f2033"; ctx.textAlign="left"; ctx.textBaseline="middle";
    ctx.fillText(t, x+r*2+gap, y+r+scale*0.5); ctx.textBaseline="alphabetic";
  }
  function scrim(ctx,W,H){
    // Full-height scrim: dark top (behind the headline) + dark bottom (behind CTA/brand), photo
    // peeks through the middle. Keeps white text legible over a bright photo at BOTH ends.
    var g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,"rgba(8,20,38,.64)"); g.addColorStop(0.42,"rgba(8,20,38,.18)");
    g.addColorStop(0.72,"rgba(8,20,38,.30)"); g.addColorStop(1,"rgba(8,20,38,.88)");
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }
  // simple stroked glyph inside an accent disc
  function glyph(ctx,name,cx,cy,r,disc,fg){
    if(disc){ ctx.beginPath(); ctx.arc(cx,cy,r,0,7); ctx.fillStyle=disc; ctx.fill(); }
    ctx.strokeStyle=fg; ctx.fillStyle=fg; ctx.lineWidth=Math.max(2,r*0.16);
    ctx.lineCap="round"; ctx.lineJoin="round";
    var u=r*0.52;
    if(name==="laptop"){
      ctx.strokeRect(cx-u, cy-u*0.7, u*2, u*1.25);
      ctx.beginPath(); ctx.moveTo(cx-u*1.35, cy+u*0.75); ctx.lineTo(cx+u*1.35, cy+u*0.75); ctx.stroke();
    } else if(name==="clock"){
      ctx.beginPath(); ctx.arc(cx,cy,u,0,7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx,cy-u*0.6);
      ctx.moveTo(cx,cy); ctx.lineTo(cx+u*0.5,cy); ctx.stroke();
    } else if(name==="shield"){
      ctx.beginPath(); ctx.moveTo(cx,cy-u); ctx.lineTo(cx+u*0.85,cy-u*0.55);
      ctx.lineTo(cx+u*0.85,cy+u*0.2); ctx.quadraticCurveTo(cx+u*0.85,cy+u*0.85, cx,cy+u*1.05);
      ctx.quadraticCurveTo(cx-u*0.85,cy+u*0.85, cx-u*0.85,cy+u*0.2);
      ctx.lineTo(cx-u*0.85,cy-u*0.55); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx-u*0.38,cy+u*0.05); ctx.lineTo(cx-u*0.08,cy+u*0.38);
      ctx.lineTo(cx+u*0.45,cy-u*0.3); ctx.stroke();
    } else if(name==="help"){
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.font="800 "+(r*1.15)+"px "+SANS; ctx.fillText("?",cx,cy+r*0.05);
      ctx.textAlign="left"; ctx.textBaseline="alphabetic";
    } else if(name==="bell"){
      ctx.beginPath(); ctx.moveTo(cx-u*0.8,cy+u*0.4);
      ctx.quadraticCurveTo(cx-u*0.8,cy-u*0.7, cx,cy-u*0.85);
      ctx.quadraticCurveTo(cx+u*0.8,cy-u*0.7, cx+u*0.8,cy+u*0.4); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx,cy+u*0.75,u*0.22,0,7); ctx.fillStyle=fg; ctx.fill();
    } else if(name==="search"){
      ctx.beginPath(); ctx.arc(cx-u*0.2,cy-u*0.2,u*0.62,0,7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx+u*0.3,cy+u*0.3); ctx.lineTo(cx+u*0.85,cy+u*0.85); ctx.stroke();
    }
  }
  function checkRow(ctx,text,x,y,sz,accent,textColor){
    var r=sz*0.62;
    ctx.beginPath(); ctx.arc(x+r,y,r,0,7); ctx.fillStyle=accent; ctx.fill();
    ctx.strokeStyle="#fff"; ctx.lineWidth=Math.max(2,sz*0.14); ctx.lineCap="round"; ctx.lineJoin="round";
    ctx.beginPath(); ctx.moveTo(x+r-r*0.42,y+r*0.02); ctx.lineTo(x+r-r*0.08,y+r*0.38);
    ctx.lineTo(x+r+r*0.45,y-r*0.35); ctx.stroke();
    ctx.fillStyle=textColor; ctx.font="700 "+(sz*1.05)+"px "+SANS;
    ctx.textAlign="left"; ctx.textBaseline="middle"; ctx.fillText(text, x+r*2+sz*0.5, y+sz*0.05);
    ctx.textBaseline="alphabetic";
  }

  /* ---------- backgrounds ---------- */
  function paintBg(ctx,W,H,tpl,acc,img){
    if(tpl.bg==="photo" && img){ cover(ctx,img,0,0,W,H); scrim(ctx,W,H); return; }
    if(tpl.bg==="photo"){ // graceful fallback: gradient
      var gg=ctx.createLinearGradient(0,0,W,H); gg.addColorStop(0,acc.a); gg.addColorStop(1,acc.b);
      ctx.fillStyle=gg; ctx.fillRect(0,0,W,H); return;
    }
    if(tpl.bg==="solid"){ ctx.fillStyle=acc.solid; ctx.fillRect(0,0,W,H); return; }
    if(tpl.bg==="light"){ ctx.fillStyle="#eef3fb"; ctx.fillRect(0,0,W,H); return; }
    var g=ctx.createLinearGradient(0,0,W,H); g.addColorStop(0,acc.a); g.addColorStop(1,acc.b);
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    // faint dot texture (matches the site banners)
    ctx.fillStyle="rgba(255,255,255,.06)";
    for(var yy=W*0.04; yy<H; yy+=W*0.06){ for(var xx=W*0.04; xx<W; xx+=W*0.06){ ctx.beginPath(); ctx.arc(xx,yy,Math.max(1,W*0.004),0,7); ctx.fill(); } }
  }

  /* text color model for a template's content zone */
  function isDarkText(tpl){ return tpl.bg==="light"; }

  /* ---------- content stack: badge -> head -> sub -> bullets -> cta -> brand ----------
     Lays the blocks top-down inside rect, each fitted so nothing overflows or overlaps.
     Used by both the full-panel and the right column of the wide layout. */
  function contentStack(ctx, rx, ry, rw, rh, tpl, ang, acc, dark, align, brandOn){
    var ink = dark ? INK : "#fff";
    var soft = dark ? INKSOFT : "rgba(255,255,255,.86)";
    var scale = clampN(Math.min(rw, rh)/430, 0.42, 1.7);
    var pillFill = dark ? acc.solid : "#fff";
    var pillText = dark ? "#fff" : acc.b;
    var cx = align==="center" ? rx+rw/2 : rx;
    var y = ry;

    // ---- badge (pay / hiring) ----
    if(tpl.badge==="pay"){
      var pf = fitOneLine(ctx, ang.pay, rw, "900", SANS, rh*0.20);
      ctx.font="900 "+pf+"px "+SANS; ctx.fillStyle=dark?acc.solid:"#fff";
      ctx.textAlign=align==="center"?"center":"left"; ctx.textBaseline="top";
      ctx.fillText(ang.pay, cx, y);
      ctx.font="700 "+(pf*0.34)+"px "+SANS; ctx.fillStyle=soft;
      ctx.fillText("commonly advertised", cx, y+pf*1.02);
      y += pf*1.5;
    } else if(tpl.badge==="hiring"){
      ctx.textAlign="left";
      var bw = chip(ctx, "NOW HIRING", align==="center"? cx - 0 : rx, y, scale*1.05, dark?acc.solid:"rgba(255,255,255,.18)", "#fff");
      if(align==="center"){ /* redo centered */ }
      y += 34*scale;
    }

    // ---- reserve cta + brand at the BOTTOM ----
    var ctaH = 54*scale;
    var brandH = brandOn ? 24*scale : 0;
    var bottomY = ry+rh;
    var ctaCY = bottomY - (brandOn ? brandH+10*scale : 0) - ctaH/2;
    var contentBottom = ctaCY - ctaH/2 - 12*scale;

    // ---- bullets (reserve above cta) ----
    var bulletList = tpl.trust ? TRUST_BULLETS : DEFAULT_BULLETS;
    var bulletsH = 0, bsz = 0;
    if(tpl.bullets || tpl.trust){
      bsz = clampN(rh*0.05, 12, 30*scale);
      var per = bsz*2.05;
      bulletsH = bulletList.length*per;
    }

    // ---- headline + sub area (between y and contentBottom-bulletsH) ----
    var areaTop = y + 6*scale;
    var areaBottom = contentBottom - (bulletsH ? bulletsH+10*scale : 0);
    var areaH = Math.max(30, areaBottom-areaTop);

    var subText = (tpl.headSrc==="role") ? ang.sub : ang.sub;
    var showSub = !!subText && areaH > rh*0.22 && !tpl.badge;
    var headBoxH = showSub ? areaH*0.66 : areaH;
    var headText = (tpl.headSrc==="role") ? ang.role : ang.head;
    var headWeight = "900";
    var fh = fitBox(ctx, headText, rw, headBoxH, headWeight, SANS, Math.min(rw*0.14, headBoxH));
    ctx.font=headWeight+" "+fh.px+"px "+SANS; ctx.fillStyle=ink;
    ctx.textAlign=align==="center"?"center":"left"; ctx.textBaseline="top";
    if(!dark){ ctx.shadowColor="rgba(0,0,0,.35)"; ctx.shadowBlur=rw*0.015; ctx.shadowOffsetY=rw*0.003; }
    var hy=areaTop;
    for(var i=0;i<fh.lines.length;i++){ ctx.fillText(fh.lines[i], cx, hy+i*fh.lh); }
    ctx.shadowColor="transparent";
    var afterHead = hy + fh.lines.length*fh.lh;

    // ---- sub ----
    if(showSub){
      var subBoxH = areaBottom - afterHead - 6*scale;
      if(subBoxH > 14){
        var fs = fitBox(ctx, subText, rw, subBoxH, "600", SANS, Math.min(fh.px*0.5, subBoxH*0.9, 30*scale));
        ctx.font="600 "+fs.px+"px "+SANS; ctx.fillStyle=soft; ctx.textBaseline="top";
        if(!dark){ ctx.shadowColor="rgba(0,0,0,.5)"; ctx.shadowBlur=rw*0.012; ctx.shadowOffsetY=rw*0.002; }
        var sy=afterHead+8*scale;
        for(var j=0;j<fs.lines.length;j++){ ctx.fillText(fs.lines[j], cx, sy+j*fs.lh); }
        ctx.shadowColor="transparent";
      }
    }

    // ---- bullets ----
    if(bulletsH){
      var by = areaBottom + 8*scale, bx = align==="center" ? rx+rw*0.14 : rx;
      for(var k=0;k<bulletList.length;k++){
        checkRow(ctx, bulletList[k], bx, by+bsz*0.6+k*(bsz*2.05), bsz*0.62, acc.solid, ink);
      }
    }

    // ---- CTA ----
    var ccx = align==="center" ? rx+rw/2 : rx + ( (function(){ ctx.font="800 "+(22*scale)+"px "+SANS; return ctx.measureText(fmt(tpl.cta,ang)).width+52*scale+20*scale; })() )/2;
    ctaPill(ctx, fmt(tpl.cta,ang), ccx, ctaCY, scale, pillFill, pillText, true);

    // ---- brand ----
    if(brandOn){ brandMark(ctx, align==="center"? rx+rw/2 - measureBrand(ctx,scale)/2 : rx, bottomY-brandH+2*scale, scale, !dark); }
  }
  function measureBrand(ctx,scale){ ctx.font="800 "+(15*scale)+"px "+SANS; return 12*scale + ctx.measureText(SITE_NAME).width + 8*scale; }

  /* ---------- chrome ---------- */
  // white "native" card inset; returns the inner content rect
  function cardPanel(ctx,W,H,pad){
    var m=pad, x=m, y=m, w=W-m*2, h=H-m*2, r=Math.min(W,H)*0.045;
    ctx.save(); ctx.shadowColor="rgba(8,20,38,.28)"; ctx.shadowBlur=W*0.03; ctx.shadowOffsetY=W*0.01;
    rr(ctx,x,y,w,h,r); ctx.fillStyle="#fff"; ctx.fill(); ctx.restore();
    ctx.lineWidth=Math.max(1,W*0.002); ctx.strokeStyle="#e2e9f4"; rr(ctx,x,y,w,h,r); ctx.stroke();
    var ip=Math.min(W,H)*0.07;
    return {x:x+ip, y:y+ip, w:w-ip*2, h:h-ip*2};
  }
  function notifHeader(ctx,rx,ry,rw,acc,scale){
    var r=16*scale;
    glyph(ctx,"bell", rx+r, ry+r, r, acc.solid, "#fff");
    ctx.fillStyle=INK; ctx.font="800 "+(15*scale)+"px "+SANS; ctx.textAlign="left"; ctx.textBaseline="middle";
    ctx.fillText("New remote job alert", rx+r*2+10*scale, ry+r*0.75);
    ctx.fillStyle=INKSOFT; ctx.font="600 "+(12*scale)+"px "+SANS;
    ctx.fillText("Just now · hiring nationwide", rx+r*2+10*scale, ry+r*1.55);
    ctx.textBaseline="alphabetic";
    return ry + r*2 + 12*scale;
  }
  function searchHeader(ctx,rx,ry,rw,ang,acc,scale){
    var h=40*scale, r=h/2;
    rr(ctx,rx,ry,rw,h,r); ctx.fillStyle="#f1f5fb"; ctx.fill();
    ctx.lineWidth=Math.max(1,scale); ctx.strokeStyle="#d6e0ef"; ctx.stroke();
    glyph(ctx,"search", rx+h*0.55, ry+h/2, h*0.32, null, INKSOFT);
    var term = ang.term;
    var tf = fitOneLine(ctx, term, rw-h*1.5, "600", SANS, 15*scale);
    ctx.font="600 "+tf+"px "+SANS; ctx.fillStyle=INK; ctx.textAlign="left"; ctx.textBaseline="middle";
    ctx.fillText(term, rx+h, ry+h/2); ctx.textBaseline="alphabetic";
    ctx.fillStyle=INKSOFT; ctx.font="700 "+(13*scale)+"px "+SANS;
    ctx.fillText("Remote openings · apply on reputable boards", rx, ry+h+18*scale);
    return ry + h + 30*scale;
  }
  function ribbon(ctx,W,H){
    ctx.save(); var s=Math.min(W,H)*0.34;
    ctx.translate(W,0); ctx.rotate(Math.PI/2*0.5);
    ctx.fillStyle="#e8730c"; ctx.fillRect(-s, -s*0.28, s*2, s*0.28);
    ctx.fillStyle="#fff"; ctx.font="800 "+(s*0.13)+"px "+SANS; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("NOW HIRING", 0, -s*0.14); ctx.restore();
  }
  function listingCard(ctx,rx,ry,rw,rh,ang,acc,scale){
    // role title + pay pill + "Remote" location row + accent apply button, inside a card
    ctx.fillStyle=INK; ctx.textAlign="left"; ctx.textBaseline="top";
    var rf=fitBox(ctx, ang.role, rw, rh*0.34, "900", SANS, Math.min(rw*0.11, rh*0.2));
    ctx.font="900 "+rf.px+"px "+SANS;
    for(var i=0;i<rf.lines.length;i++){ ctx.fillText(rf.lines[i], rx, ry+i*rf.lh); }
    var y=ry+rf.lines.length*rf.lh+10*scale;
    // meta rows
    ctx.font="700 "+(15*scale)+"px "+SANS; ctx.fillStyle=INKSOFT;
    glyph(ctx,"laptop", rx+8*scale, y+8*scale, 8*scale, null, acc.solid);
    ctx.fillStyle=INKSOFT; ctx.textBaseline="middle"; ctx.fillText("Remote · Work from home", rx+22*scale, y+8*scale);
    y += 26*scale;
    var pw = chip(ctx, ang.pay+" · F/T · P/T", rx, y, scale, "#eaf2ff", acc.b);
    y += 34*scale;
    ctx.textBaseline="alphabetic";
    // apply button pinned bottom-left
    ctaPill(ctx, "View Job", rx + (function(){ctx.font="800 "+(22*scale)+"px "+SANS; return ctx.measureText("View Job").width+52*scale+20*scale;})()/2, ry+rh-27*scale, scale, acc.solid, "#fff", true);
  }

  /* ---------- layout classes ---------- */
  function layoutClass(W,H){
    if(H<=140) return "strip";
    if(W/H>=1.7) return "wide";
    return "panel";
  }

  // very short strips (leaderboards, mobile banners): accent block left, headline + cta right
  function drawStrip(ctx,W,H,tpl,ang,acc,img){
    var iw=Math.min(H*1.2, W*0.4);
    if(tpl.bg==="photo" && img){ cover(ctx,img,0,0,iw,H); }
    else { var g=ctx.createLinearGradient(0,0,iw,H); g.addColorStop(0,acc.a); g.addColorStop(1,acc.b); ctx.fillStyle=g; ctx.fillRect(0,0,iw,H); }
    ctx.fillStyle=acc.solid; ctx.fillRect(iw,0,W-iw,H);
    var pad=Math.max(6,H*0.16), px=iw+pad, pw=W-iw-pad*1.4;
    var head=fmt(tpl.headSrc==="role"?"{role}":"{head}", ang).split("|").join(" ");
    if(H>=74){
      var fh=fitBox(ctx, head, pw, H*0.52, "900", SANS, H*0.34);
      ctx.font="900 "+fh.px+"px "+SANS; ctx.fillStyle="#fff"; ctx.textAlign="left"; ctx.textBaseline="top";
      for(var i=0;i<fh.lines.length;i++){ ctx.fillText(fh.lines[i], px, pad*0.6+i*fh.lh); }
      var cta=fmt(tpl.cta,ang)+" ›", cpx=fitOneLine(ctx,cta,pw,"800",SANS,H*0.24);
      ctx.font="800 "+cpx+"px "+SANS; ctx.textBaseline="alphabetic"; ctx.fillText(cta, px, H-pad*0.7);
    } else {
      var cta2=fmt(tpl.cta,ang)+" ›", cpx2=fitOneLine(ctx, head+"  "+cta2, pw, "800", SANS, H*0.4);
      ctx.font="800 "+cpx2+"px "+SANS; ctx.fillStyle="#fff"; ctx.textAlign="left"; ctx.textBaseline="middle";
      ctx.fillText(head, px, H*0.5);
    }
    ctx.textBaseline="alphabetic";
  }

  // landscape: left media/accent panel, right content stack
  function drawWide(ctx,W,H,tpl,ang,acc,img){
    var lw=Math.round(W*0.42);
    if(tpl.bg==="photo" && img){ cover(ctx,img,0,0,lw,H); scrim(ctx,lw,H); }
    else { var g=ctx.createLinearGradient(0,0,lw,H); g.addColorStop(0,acc.a); g.addColorStop(1,acc.b); ctx.fillStyle=g; ctx.fillRect(0,0,lw,H); }
    // right panel background: light for light/native templates else white card feel
    var rightLight = (tpl.bg==="light");
    ctx.fillStyle = rightLight ? "#eef3fb" : "#ffffff";
    ctx.fillRect(lw,0,W-lw,H);
    // decorative icon or badge on the left panel
    if(tpl.ic){ glyph(ctx, tpl.ic, lw*0.5, H*0.42, Math.min(lw,H)*0.16, "rgba(255,255,255,.16)", "#fff"); }
    else if(tpl.bg!=="photo"){ chip(ctx,"Work From Home", lw*0.12, H*0.12, clampN(H/300,0.6,1.3), "rgba(255,255,255,.18)","#fff"); }
    var pad=clampN(H*0.12,16,54);
    contentStack(ctx, lw+pad, pad, W-lw-pad*2, H-pad*2, tpl, ang, acc, true /*dark text on light/white*/, "left", true);
  }

  // square / portrait / tall
  function drawPanel(ctx,W,H,tpl,ang,acc,img){
    var pad=clampN(W*0.06,14,64);
    paintBg(ctx,W,H,tpl,acc,img);
    if(tpl.ribbon) ribbon(ctx,W,H);

    // card templates: draw a white card and lay content dark inside it
    if(tpl.card){
      var rect=cardPanel(ctx,W,H,pad);
      var scale=clampN(Math.min(rect.w,rect.h)/430,0.42,1.7);
      var cy=rect.y;
      if(tpl.header==="notif"){ cy=notifHeader(ctx,rect.x,rect.y,rect.w,acc,scale);
        contentStack(ctx, rect.x, cy, rect.w, rect.y+rect.h-cy, tpl, ang, acc, true, "left", true); return; }
      if(tpl.header==="search"){ cy=searchHeader(ctx,rect.x,rect.y,rect.w,ang,acc,scale);
        contentStack(ctx, rect.x, cy, rect.w, rect.y+rect.h-cy, tpl, ang, acc, true, "left", true); return; }
      if(tpl.headSrc==="role" && tpl.payPill){ listingCard(ctx,rect.x,rect.y,rect.w,rect.h,ang,acc,scale); return; }
      if(tpl.ic){ var gr=Math.min(rect.w,rect.h)*0.11; glyph(ctx,tpl.ic,rect.x+gr,rect.y+gr,gr,acc.solid,"#fff");
        contentStack(ctx, rect.x, rect.y+gr*2+10*scale, rect.w, rect.h-(gr*2+10*scale), tpl, ang, acc, true, "left", true); return; }
      contentStack(ctx, rect.x, rect.y, rect.w, rect.h, tpl, ang, acc, true, "left", true);
      return;
    }

    // non-card templates
    var dark = isDarkText(tpl);
    var align = (tpl.bg==="photo" || tpl.bg==="solid" || tpl.id==="pay" || tpl.id==="question") ? "left" : "left";
    // minimal editorial: light bg, an accent rule + icon, centered-left content
    if(tpl.id==="minimal"){
      var gr2=Math.min(W,H)*0.09; glyph(ctx,"laptop", pad+gr2, pad+gr2, gr2, acc.solid, "#fff");
      ctx.fillStyle=acc.solid; ctx.fillRect(pad, pad+gr2*2+H*0.02, W*0.16, Math.max(3,H*0.008));
      contentStack(ctx, pad, pad+gr2*2+H*0.03, W-pad*2, H-(pad+gr2*2+H*0.03)-pad, tpl, ang, acc, true, "left", true);
      return;
    }
    if(tpl.ic && !tpl.card){
      var gr3=Math.min(W,H)*0.10; glyph(ctx,tpl.ic, pad+gr3, pad+gr3, gr3, dark?acc.solid:"rgba(255,255,255,.22)", "#fff");
      contentStack(ctx, pad, pad+gr3*2+H*0.02, W-pad*2, H-(pad+gr3*2+H*0.02)-pad, tpl, ang, acc, dark, "left", true);
      return;
    }
    // default: photo/solid/grad overlay, content bottom-weighted
    contentStack(ctx, pad, pad, W-pad*2, H-pad*2, tpl, ang, acc, dark, "left", true);
  }

  function render(canvas, tpl, ang, accIdx, size){
    canvas.width=size.w; canvas.height=size.h;
    var ctx=canvas.getContext("2d");
    var acc=ACCENTS[accIdx % ACCENTS.length];
    var needPhoto = (tpl.bg==="photo" && PHOTO);
    return loadImg(needPhoto?PHOTO.src:null).then(function(img){
      var W=size.w,H=size.h,cls=layoutClass(W,H);
      ctx.clearRect(0,0,W,H); ctx.fillStyle="#0e1726"; ctx.fillRect(0,0,W,H);
      if(cls==="strip") drawStrip(ctx,W,H,tpl,ang,acc,img);
      else if(cls==="wide") drawWide(ctx,W,H,tpl,ang,acc,img);
      else drawPanel(ctx,W,H,tpl,ang,acc,img);
      return canvas;
    });
  }

  /* ---------- app: Size -> Style -> Angle ---------- */
  var state={ size:null, tpl:null, acc:0, idx:{} };
  ANGLES.forEach(function(a){ state.idx[a.id]=0; });
  var SAMPLE=ANGLES[0];

  function initApp(){
    buildSizeStep();
    document.getElementById("dlAllBtn").addEventListener("click", downloadAll);
    document.getElementById("crumbSize").addEventListener("click", goSize);
    document.getElementById("crumbTpl").addEventListener("click", function(){ if(state.size) goTpl(); });
    document.getElementById("crumbAngle").addEventListener("click", function(){ if(state.tpl) goAngle(); });
    goSize();
  }
  function previewSize(s){
    var cap=560, lng=Math.max(s.w,s.h);
    if(lng<=cap) return {w:s.w,h:s.h};
    var k=cap/lng; return {w:Math.round(s.w*k), h:Math.round(s.h*k)};
  }
  function setCrumbs(step){
    var cs=document.getElementById("crumbSize"), ct=document.getElementById("crumbTpl"), ca=document.getElementById("crumbAngle");
    cs.querySelector(".cl").textContent = state.size ? (state.size.w+"×"+state.size.h) : "Size";
    ct.querySelector(".cl").textContent = state.tpl ? state.tpl.name : "Style";
    cs.className="crumb "+(step===1?"active":"done");
    ct.className="crumb "+(step===2?"active":(state.tpl?"done":"todo"));
    ca.className="crumb "+(step===3?"active":(state.tpl?"done":"todo"));
    document.getElementById("dlAllBtn").classList.toggle("hide", step!==3);
  }
  function showStep(id){
    ["stepSize","stepTpl","stepAngle"].forEach(function(s){ document.getElementById(s).classList.toggle("hide", s!==id); });
    window.scrollTo(0,0);
  }

  /* STEP 1 — size */
  function buildSizeStep(){
    var host=document.getElementById("stepSize"); host.innerHTML="";
    var h=document.createElement("div"); h.className="step-h";
    h.innerHTML="Choose an ad size <span>&mdash; the platform &amp; format you are buying</span>"; host.appendChild(h);
    var groups={}, order=[];
    SIZES.forEach(function(s){ if(!groups[s.g]){ groups[s.g]=[]; order.push(s.g); } groups[s.g].push(s); });
    order.forEach(function(g){
      var gh=document.createElement("div"); gh.className="grp"; gh.textContent=g; host.appendChild(gh);
      var grid=document.createElement("div"); grid.className="size-grid"; host.appendChild(grid);
      groups[g].forEach(function(s){
        var card=document.createElement("div"); card.className="size-card";
        var tb=document.createElement("div"); tb.className="size-thumb";
        var ar=document.createElement("div"); ar.className="size-ar";
        var mx=Math.max(s.w,s.h);
        ar.style.width=Math.max(10,Math.round(s.w/mx*96))+"px";
        ar.style.height=Math.max(10,Math.round(s.h/mx*96))+"px";
        tb.appendChild(ar);
        var b=document.createElement("b"); b.textContent=s.w+"×"+s.h;
        var sm=document.createElement("small"); sm.textContent=s.label.replace(/\\s*\\(.*\\)/,"");
        card.appendChild(tb); card.appendChild(b); card.appendChild(sm);
        card.addEventListener("click", function(){ state.size=s; buildTplStep(); goTpl(); });
        grid.appendChild(card);
      });
    });
  }
  function goSize(){ setCrumbs(1); showStep("stepSize"); }

  /* STEP 2 — style (previews at the chosen size) */
  function buildTplStep(){
    var host=document.getElementById("stepTpl"); host.innerHTML="";
    var ps=previewSize(state.size);
    var h=document.createElement("div"); h.className="step-h";
    h.innerHTML="Choose a style <span>&mdash; shown at "+state.size.w+"×"+state.size.h+", your selected size</span>";
    host.appendChild(h);
    var groups={}, order=[];
    TEMPLATES.forEach(function(t){ if(!groups[t.group]){ groups[t.group]=[]; order.push(t.group); } groups[t.group].push(t); });
    order.forEach(function(g){
      var gh=document.createElement("div"); gh.className="grp"; gh.textContent=g; host.appendChild(gh);
      var grid=document.createElement("div"); grid.className="tpl-grid"; host.appendChild(grid);
      groups[g].forEach(function(t){
        var card=document.createElement("div"); card.className="tcard";
        var st=document.createElement("div"); st.className="st";
        var cv=document.createElement("canvas"); st.appendChild(cv);
        var m=document.createElement("div"); m.className="m"; m.innerHTML="<b></b><span></span>";
        m.querySelector("b").textContent=t.name;
        m.querySelector("span").textContent=t.group;
        card.appendChild(st); card.appendChild(m);
        card.addEventListener("click", function(){ state.tpl=t; buildAngleStep(); goAngle(); });
        grid.appendChild(card);
        render(cv, t, SAMPLE, state.acc, ps);
      });
    });
  }
  function goTpl(){ setCrumbs(2); showStep("stepTpl"); }

  /* STEP 3 — angle (full-res ads, one per audience; pick + download) */
  function buildAngleStep(){
    var host=document.getElementById("stepAngle"); host.innerHTML="";
    var h=document.createElement("div"); h.className="step-h";
    h.innerHTML="Choose an angle <span>&mdash; "+state.tpl.name+" at "+state.size.w+"×"+state.size.h+"; "+ANGLES.length+" audiences. Download the ones you'll run.</span>";
    host.appendChild(h);
    // accent swatch row
    var ar=document.createElement("div"); ar.className="acc-row";
    var lbl=document.createElement("span"); lbl.className="lbl"; lbl.textContent="Accent:"; ar.appendChild(lbl);
    ACCENTS.forEach(function(a,ai){
      var sw=document.createElement("button"); sw.className="sw"+(ai===state.acc?" on":"");
      sw.style.background="linear-gradient(135deg,"+a.a+","+a.b+")"; sw.title=a.name;
      sw.addEventListener("click", function(){ state.acc=ai;
        [].forEach.call(ar.querySelectorAll(".sw"), function(el,ei){ el.className="sw"+(ei===ai?" on":""); });
        redrawAll(); });
      ar.appendChild(sw);
    });
    host.appendChild(ar);
    var grid=document.createElement("div"); grid.className="ex-grid"; host.appendChild(grid);
    ANGLES.forEach(function(a){
      var card=document.createElement("div"); card.className="ex"; card._ang=a;
      var stage=document.createElement("div"); stage.className="stage";
      var cv=document.createElement("canvas"); stage.appendChild(cv); card._cv=cv;
      card.appendChild(stage);
      var foot=document.createElement("div"); foot.className="foot";
      var nm=document.createElement("div"); nm.className="name"; nm.textContent=a.aud;
      var sub=document.createElement("div"); sub.className="sub"; sub.textContent="→ /"+a.url;
      var lic=document.createElement("div"); lic.className="lic";
      var dl=document.createElement("button"); dl.className="btn"; dl.textContent="Download PNG";
      dl.addEventListener("click", function(){ downloadOne(cv,a); });
      foot.appendChild(nm); foot.appendChild(sub); foot.appendChild(lic); foot.appendChild(dl);
      card.appendChild(foot); grid.appendChild(card);
      lic.textContent = licLine();
      render(cv, state.tpl, a, state.acc, state.size);
    });
  }
  function goAngle(){ setCrumbs(3); showStep("stepAngle"); }
  function licLine(){
    if(state.tpl.bg==="photo" && PHOTO){ return "["+(PHOTO.license||"")+"] "+(PHOTO.credit||""); }
    return "Generated — no photo, brand-safe";
  }
  function redrawAll(){
    var cards=document.querySelectorAll("#stepAngle .ex");
    [].forEach.call(cards, function(card){ render(card._cv, state.tpl, card._ang, state.acc, state.size); card.querySelector(".lic").textContent=licLine(); });
  }

  function fileName(a){ return "remote-"+a.id+"-"+state.tpl.id+"-"+ACCENTS[state.acc].name.toLowerCase()+"-"+state.size.w+"x"+state.size.h+".png"; }
  function saveCanvas(cv,name){
    cv.toBlob(function(b){
      if(!b){ alert("Export blocked — open this tool on the live domain or a local http server (not file://) so the canvas can save."); return; }
      var url=URL.createObjectURL(b), aEl=document.createElement("a"); aEl.href=url; aEl.download=name;
      document.body.appendChild(aEl); aEl.click();
      setTimeout(function(){ URL.revokeObjectURL(url); aEl.remove(); }, 4000);
    }, "image/png");
  }
  function downloadOne(cv,a){ saveCanvas(cv, fileName(a)); }
  function downloadAll(){
    var btn=document.getElementById("dlAllBtn"); btn.disabled=true; var old=btn.textContent;
    var off=document.createElement("canvas"), i=0;
    function next(){
      if(i>=ANGLES.length){ btn.disabled=false; btn.textContent=old; return; }
      var a=ANGLES[i]; btn.textContent="Saving "+(i+1)+"/"+ANGLES.length+"...";
      render(off, state.tpl, a, state.acc, state.size).then(function(){
        saveCanvas(off, fileName(a)); i++; setTimeout(next, 350);
      });
    }
    next();
  }

  try{ if(sessionStorage.getItem("jgm_ad_ok")==="1"){ unlock(); } }catch(e){}
})();
</script>
</body>
</html>`;

  write("create-ads/index.html", html);
}

/* ---------- run ---------- */
function main() {
  if (!fs.existsSync(DATA_DIR)) { console.error("No data/ folder."); process.exit(1); }
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  const props = files.map((f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8")));
  const byId = {};
  props.forEach((p) => { byId[p.id] = p; });

  // clean dist
  fs.rmSync(OUT_DIR, { recursive: true, force: true });

  // assets
  fs.mkdirSync(path.join(OUT_DIR, "assets"), { recursive: true });
  ["styles.css", "jobs.js"].forEach((f) =>
    fs.copyFileSync(path.join(SRC_DIR, f), path.join(OUT_DIR, "assets", f)));
  // licensed/PD photos fetched by fetch-images.js live in src/img -> assets/img
  const imgSrc = path.join(SRC_DIR, "img");
  if (fs.existsSync(imgSrc)) fs.cpSync(imgSrc, path.join(OUT_DIR, "assets", "img"), { recursive: true });

  buildHome(props);
  buildAbout();
  // Champion funnel at /find/ — the DEFAULT for all traffic (owner decision 2026-07-26): the full
  // 7-question onboarding AND the opt-in rewarded gate on the results page. + chat variant.
  const champion = { dir: "", base: B, questions: INTAKE.questions, noindex: false, rewardGate: true };
  champion.questions.forEach((_, qi) => buildFindQuestion(champion, qi));
  buildMatching(champion);
  buildResults(champion, props, byId);
  buildChat(props);
  // A/B CONTROL arm: identical 7-question funnel but NO reward gate, at /x/no-gate/ (noindex).
  // The gate is on 100% of the default now, so this control is how we detect whether the gate is
  // helping or SUPPRESSING conversion (a gate can cost downstream clicks). Split some paid traffic
  // here and compare results-through / apply rate vs the champion. Promote the winner (root §7).
  const noGateArm = { dir: "x/no-gate/", base: B + "x/no-gate/", questions: INTAKE.questions, noindex: true, rewardGate: false };
  noGateArm.questions.forEach((_, qi) => buildFindQuestion(noGateArm, qi));
  buildMatching(noGateArm);
  buildResults(noGateArm, props, byId);
  // USA MODAL LANDER — /usa/ entry whose intake is an opt-in pop-up modal quiz that opens on load
  // (see USA_MODAL). The modal's rewarded video lands the visitor on the /usa/remote-jobs/ CONTENT
  // GUIDE (explainer + reputable boards/employers with outbound links + in-content display ads).
  buildUsaLanding(props, byId);
  buildUsaGuide(byId["remote-jobs"]);
  buildPackingLanding();
  buildPackingGuide();
  // WORLDWIDE packing funnel — geo-neutral sibling of /usa-packing-jobs/ for running the packing
  // creatives as a WORLD campaign (see WORLD_PACKING_MODAL). Same modal engine + rewarded plumbing.
  buildWorldPackingLanding();
  buildWorldPackingGuide();
  // SAUDI ARABIA multi-language funnel — /me/<language>/ (3 questions -> opt-in rewarded video ->
  // a real Saudi jobs guide), emitted in the five languages that cover the Kingdom's labour market.
  // Page-per-question (not the modal shape) so every step carries its ad load — session depth.
  buildMeHub();
  ME_LANGS.forEach((l) => {
    l.t.qs.forEach((_, qi) => buildMeQuestion(l, qi));
    buildMeReady(l);
    buildMeGuide(l);
    // QUIET arm (ME_QUIET): same 3 questions in a stripped pop-up, ZERO ads before the rewarded
    // video, then the same guide at the arm's own URL. Noindex, paid traffic only — split at the
    // ad-buy and compare reward completion + revenue per session against the champion.
    buildMeQuietLanding(l);
    buildMeGuide(l, ME_QUIET);
  });
  buildWorldwideGuide();   // international guide — payoff for /worldwide/, split out of /usa/remote-jobs/
  buildWorldwideLanding(); // BACKUP two-page shape at /worldwide-bkp/ (demoted 2026-08-28)
  buildWorldwidePre();     // CHAMPION single-page (SPA) /worldwide/ — guide blurred behind overlay, reveal in-page (promoted 2026-08-28)
  buildWorldwideUs();      // /worldwide-us/ — jobguidedaily.com CLONE on the SAME SPA engine (own skin), noindex (added 2026-09-01)
  buildWorldwideUsApply(); // /worldwide-us/apply/ — how-to-apply GUIDE, payoff of the advertorial's "Apply now" rewarded gate (added 2026-09-03)
  buildWorldwideUsx();     // /worldwide-usx/ — /worldwide-us/ CLONE with a "job board" front screen before the intake popup (added 2026-09-08)
  buildWorldwideUsxApply();// /worldwide-usx/apply/ — how-to-apply GUIDE payoff for the /worldwide-usx/ apply gate (added 2026-09-08)
  buildWorldwideUsy();     // /worldwide-usy/ — /worldwide-usx/ TWIN: popup opens immediately on load + 2nd gate is a direct interstitial (added 2026-09-14)
  buildWorldwideUsyApply();// /worldwide-usy/apply/ — how-to-apply GUIDE payoff for /worldwide-usy/ (same 2-page guide as usx) (added 2026-09-14)
  buildSouthAfricaGuide(); // SA-specific guide — the page that makes the SA ad copy provable
  buildSaLanding();        // SA paid entry (own URL so CPC/RPM attribute to the SA campaigns)
  buildGenericLanding();   // neutral paid lander that hands off to the /usa/ funnel
  // REMOTE FUNNEL — dedicated work-from-home experience at /remote/ (own questions, own
  // trust-first copy, own role-based results). Landing pages (generic + per ad angle) feed
  // the shared /remote/find/ funnel; all matches lead to the genuine remote-jobs destination.
  const remoteProp = byId["remote-jobs"];
  if (remoteProp) {
    const remoteCopy = {
      matchHead: "Matching you with remote jobs",
      matchLead: "Scanning verified remote employers…",
      matchWaitLine: "Please wait — checking current work-from-home openings."
    };
    const remoteMicro = `${icon("shield", 14)} Free · No sign-up · No email needed`;
    // Champion remote funnel — opt-in rewarded gate ON the results (owner decision 2026-07-26).
    const remote = {
      dir: "remote/", base: B + "remote/", questions: REMOTE_INTAKE.questions,
      noindex: true, rewardGate: true, micro: remoteMicro, copy: remoteCopy
    };
    remote.questions.forEach((_, qi) => buildFindQuestion(remote, qi));
    buildMatching(remote);
    buildRemoteResults(remote, remoteProp);
    buildRemoteLanding(null, remoteProp, 0);                       // generic /remote/ (indexable)
    REMOTE_ANGLES.forEach((a) => buildRemoteLanding(a, remoteProp, a.banner || 0)); // /remote/<angle>/
    // A/B CONTROL: identical remote funnel with NO reward gate, at /remote/x/no-gate/ (noindex).
    // The gate is on 100% of remote traffic, so this control detects whether it suppresses the
    // apply-through (a rewarded gate can cost downstream clicks). Split some paid traffic here and
    // compare results-through / apply-rate vs the gated champion; promote the winner (root §7).
    const remoteNoGate = {
      dir: "remote/x/no-gate/", base: B + "remote/x/no-gate/", questions: REMOTE_INTAKE.questions,
      noindex: true, rewardGate: false, micro: remoteMicro, copy: remoteCopy
    };
    remoteNoGate.questions.forEach((_, qi) => buildFindQuestion(remoteNoGate, qi));
    buildMatching(remoteNoGate);
    buildRemoteResults(remoteNoGate, remoteProp);
  }
  // genuine article/property funnels (the destinations the matches lead into)
  props.forEach((p, i) => {
    buildLanding(p, byId, i);
    buildOpenings(p, byId, i);
    buildApply(p, byId, i);
  });
  buildRemoteAds(remoteProp);   // internal ad-builder tool (noindex, password-gated) → dist/create-ads/
  buildTestVideoAd();           // OUTSTREAM VIDEO test surface (noindex) → dist/test-video-ad/
  buildMeta(props);
  buildVersionPage();

  // home + about + champion funnel (CHAMPION_COUNT q + matching + results) + chat
  //  + no-gate control arm + /v + property funnels (×3) + REMOTE funnel (landing + 3 angle landers
  //  + gated funnel [8Q + matching + results] + no-gate control [8Q + matching + results]).
  const championFunnel = CHAMPION_COUNT + 2, armFunnel = INTAKE.questions.length + 2;
  const remotePages = byId["remote-jobs"] ? (1 + REMOTE_ANGLES.length + (REMOTE_INTAKE.questions.length + 2) * 2) : 0;
  const pages = 2 + championFunnel + 1 /*chat*/ + armFunnel /*no-gate control arm*/ + 2 /*usa lander + guide*/ + 1 /*/v*/ + props.length * 3 + remotePages;
  console.log(`Built ${props.length} properties + champion (7Q + reward gate) + no-gate control + REMOTE funnel (8Q + gate, +3 angle landers + no-gate control) → ${pages} pages into dist/`);
  console.log("Ad slots render as EMPTY reserved containers — the Price Optimiser SDK fills them by #id (no AdSense <ins>).");
  console.log(`Version endpoint → dist/v/ (v${SITE.version}, built ${BUILT_AT}). Visit /v after deploy to confirm it shipped.`);
}

main();
