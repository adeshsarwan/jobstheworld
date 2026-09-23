#!/usr/bin/env node
/* fetch-images.js — LEGAL job/industry photos from Wikimedia Commons (see ../CLAUDE.md).
 *
 * WHY (and why NOT company logos): trademarked/copyrighted logos on ad-monetized pages
 * imply an endorsement we don't have and risk Google Ads/AdSense trademark suspension +
 * DMCA. So instead each job gets a REAL, openly-licensed PHOTO of the work context
 * (warehouse, retail, delivery, cafe, care, office…) with its license + attribution stored.
 *
 * WHAT: for each data/*.json we run a Commons search from its `imageQuery`, keep the first
 * result with a permissive license (PD / CC0 / CC BY / CC BY-SA), download an ~800px thumb
 * into src/img/, and write an `image` object back into the JSON. build.js renders it as the
 * card + hero banner (with a credit caption).
 *
 * USAGE:  node fetch-images.js          (fill jobs missing an image)
 *         node fetch-images.js --force  (re-fetch everything)
 *   Requires internet. No API key. YOU are responsible for a final license eyeball.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const DATA_DIR = path.join(__dirname, "data");
const IMG_DIR = path.join(__dirname, "src", "img");
const FORCE = process.argv.includes("--force");
const UA = "worktrendhub/1.0 (https://worktrendhub.com; chandrakanth527@gmail.com) node-https";
const API = "https://commons.wikimedia.org/w/api.php";

// Targeted, verified public-domain logo searches per brand (avoids sub-brand/photo mismatches).
const LOGO_QUERY = {
  "mcdonalds": "McDonald's logo", "walmart": "Walmart logo", "amazon-warehouse": "Amazon logo",
  "target": "Target Corporation logo", "ups": "United Parcel Service logo", "costco": "Costco Wholesale logo",
  "starbucks": "Starbucks logo", "fedex": "FedEx logo"
};
// Reject titles that are sub-brands, events, or photos rather than the corporate mark.
const LOGO_REJECT = /championship|barbecue|st\.?\s*jude|prime\b|prime video|awards|museum|arena|stadium|restaurant|store\b|building|truck|sign|night|photo|storefront|shop\b|cup\b/i;

// Fallback query if a data file has no imageQuery, keyed by icon.
const ICON_QUERY = {
  box: "warehouse workers logistics", cart: "retail store shopping", truck: "delivery van courier",
  food: "restaurant kitchen staff", spark: "cleaning staff janitor", laptop: "person laptop working from home",
  users: "call center customer service", heart: "caregiver home care", building: "hotel reception hospitality",
  shield: "security guard officer", briefcase: "office desk administrative"
};

const OK_LICENSE = /(public domain|^pd|cc0|cc[ -]by|attribution|no restrictions)/i;
const BAD_LICENSE = /(fair use|non[- ]free|all rights)/i;
const HEADERS = { "User-Agent": UA, "Accept": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

function getJSONOnce(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: HEADERS }, (res) => {
      let d = ""; res.on("data", (c) => (d += c));
      res.on("end", () => {
        if (res.statusCode === 429 || res.statusCode >= 500) { const e = new Error("HTTP " + res.statusCode); e.retryable = true; return reject(e); }
        try { resolve(JSON.parse(d)); } catch (_) { const e = new Error("non-JSON body"); e.retryable = true; reject(e); }
      });
    }).on("error", (e) => { e.retryable = true; reject(e); });
  });
}
async function getJSON(url) {
  let delay = 3000;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try { return await getJSONOnce(url); }
    catch (e) { if (!e.retryable || attempt === 5) throw e; await sleep(delay); delay *= 2; }
  }
}
function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": UA } }, (res) => {
      if (res.statusCode >= 300 && res.headers.location) return resolve(download(res.headers.location, dest));
      if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
      const file = fs.createWriteStream(dest);
      res.pipe(file); file.on("finish", () => file.close(() => resolve()));
    }).on("error", reject);
  });
}

/* mode "photo": landscape bitmap for category banners.
 * mode "logo":  brand wordmark — accept PNG/SVG(->PNG thumb), any aspect, PD/CC ONLY
 *               (a fair-use/non-free logo is rejected -> falls back to the monogram tile). */
async function searchCommons(query, mode) {
  const isLogo = mode === "logo";
  const extra = isLogo ? "" : " filetype:bitmap";
  const url = API + "?" + [
    "action=query", "format=json", "maxlag=5", "generator=search",
    "gsrsearch=" + encodeURIComponent(query + extra), "gsrnamespace=6", "gsrlimit=12",
    "prop=imageinfo", "iiprop=" + encodeURIComponent("url|extmetadata|mime|size"),
    "iiurlwidth=" + (isLogo ? "400" : "800")
  ].join("&");
  const res = await getJSON(url);
  const pages = ((res.query || {}).pages) || {};
  const list = Object.values(pages).sort((a, b) => (a.index || 0) - (b.index || 0));
  const logoCands = [];
  for (const p of list) {
    const ii = (p.imageinfo || [])[0];
    if (!ii) continue;
    const okMime = isLogo ? /image\/(jpeg|png|svg)/.test(ii.mime || "") : /image\/(jpeg|png)/.test(ii.mime || "");
    if (!okMime) continue;
    const em = ii.extmetadata || {};
    const lic = clean((em.LicenseShortName || {}).value);
    if (!lic || BAD_LICENSE.test(lic) || !OK_LICENSE.test(lic)) continue;  // PD/CC only
    const title = clean(p.title).replace(/^File:/, "");
    const hit = {
      thumb: ii.thumburl, w: ii.thumbwidth, h: ii.thumbheight, title,
      artist: clean((em.Artist || {}).value) || "Unknown", license: lic, source: ii.descriptionurl || ii.url
    };
    if (isLogo) {
      if (!/logo|wordmark/i.test(title) || LOGO_REJECT.test(title)) continue; // real corporate mark only
      if ((ii.thumbwidth || 0) < 120) continue;
      logoCands.push(hit);
    } else {
      if ((ii.thumbwidth || 0) < 500) continue;
      if ((ii.thumbwidth || 1) / (ii.thumbheight || 1) < 1.05) continue;
      return hit;
    }
  }
  // Logos: prefer the shortest title (closest to a plain "<Brand> logo"), SVG-derived thumbs first.
  if (isLogo && logoCands.length) {
    logoCands.sort((a, b) => a.title.length - b.title.length);
    return logoCands[0];
  }
  return null;
}

async function main() {
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  let added = 0, missed = 0;

  for (const f of files) {
    const fp = path.join(DATA_DIR, f);
    const p = JSON.parse(fs.readFileSync(fp, "utf8"));
    const isEmployer = p.type === "employer";
    const field = isEmployer ? "logo" : "image";           // employers -> logo, categories -> photo
    if (p[field] && p[field].src && !FORCE) continue;

    const query = isEmployer
      ? (LOGO_QUERY[p.id] || `${p.employer} logo`)
      : (p.imageQuery || ICON_QUERY[p.icon] || (p.category || "jobs") + " workplace");
    try {
      const hit = await searchCommons(query, isEmployer ? "logo" : "photo");
      await sleep(2500);
      if (!hit) { console.log(`-  ${p.id}: no PD/CC ${field} for "${query}" (will use monogram tile)`); missed++; continue; }
      const ext = /\.png/i.test(hit.thumb) ? "png" : (/\.jpe?g/i.test(hit.thumb) ? "jpg" : "png");
      const fname = `${p.id}-${field}.${ext}`;
      await download(hit.thumb, path.join(IMG_DIR, fname));
      p[field] = {
        src: `assets/img/${fname}`,
        alt: isEmployer ? `${p.employer} logo` : `${p.category} — ${hit.title}`,
        credit: `${hit.title} — ${hit.artist} (${hit.license}) via Wikimedia Commons`,
        license: hit.license, source: hit.source, w: hit.w || 400, h: hit.h || 300,
        trademark: isEmployer ? `${p.employer} is a trademark of its owner; used for identification only.` : undefined
      };
      fs.writeFileSync(fp, JSON.stringify(p, null, 2) + "\n");
      added++; console.log(`+  ${p.id}: ${fname}  [${hit.license}]`);
    } catch (e) { console.log(`!  ${p.id}: ${e.message}`); missed++; }
  }
  console.log(`\nDone. Added ${added}, missed ${missed}. Review licenses/trademarks, then run: node build.js`);
}

main();
