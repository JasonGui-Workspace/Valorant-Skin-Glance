#!/usr/bin/env node
/**
 * valorant-shop.mjs — fetch your VALORANT daily store using a Riot ssid cookie
 *
 * Zero dependencies, Node.js 18+.
 *
 * Usage:
 *   cp .env.example .env, put SSID=eyJ... in .env, then:
 *   node valorant-shop.mjs                                   # reads SSID from .env; the refreshed cookie is written back to .env
 *   SSID="eyJ..." node valorant-shop.mjs                     # the SSID environment variable takes precedence over .env
 *   node valorant-shop.mjs --html                            # write valorant-shop.html (with skin images) and open it in the default browser (--no-open: write only)
 *   node valorant-shop.mjs --browser                         # troubleshoot auth failures: use a browser User-Agent and Node's default TLS settings
 *   node valorant-shop.mjs --json                            # print the raw storefront JSON
 *   node valorant-shop.mjs --lang zh-CN                      # language for skin names, default en-US
 *
 * Getting your ssid: sign in at https://auth.riotgames.com in a browser (tick "Stay signed in"),
 * then F12 → Application → Cookies → auth.riotgames.com → copy the value of ssid.
 *
 * ⚠️ This uses undocumented Riot client endpoints. They can break at any time and using them
 *    is against Riot's developer policy — only use it on your own account.
 *    Your ssid is equivalent to a logged-in session; never share it.
 */

// Command:
// node valorant-shop.mjs --html

import https from "node:https";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// ---------- Arguments ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const LANG = opt("--lang", "en-US");
const OUTPUT_JSON = flag("--json");
const OUTPUT_HTML = flag("--html");
const NO_OPEN = flag("--no-open");
const BROWSER = flag("--browser"); // troubleshooting: send the auth request with a browser UA and Node's default TLS settings
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const HTML_FILE = new URL("valorant-shop.html", import.meta.url);
const VERBOSE = flag("--verbose");

if (flag("--help") || flag("-h")) {
  console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
  process.exit(0);
}

// ---------- HTTP: mimic the client's TLS fingerprint to reduce the chance of Cloudflare blocking ----------
const TLS_CIPHERS = [
  "TLS_CHACHA20_POLY1305_SHA256", "TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384",
  "ECDHE-ECDSA-CHACHA20-POLY1305", "ECDHE-RSA-CHACHA20-POLY1305",
  "ECDHE-ECDSA-AES128-SHA256", "ECDHE-RSA-AES128-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384", "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-ECDSA-AES128-SHA", "ECDHE-RSA-AES128-SHA",
  "ECDHE-ECDSA-AES256-SHA", "ECDHE-RSA-AES256-SHA",
].join(":");
const TLS_SIGALGS = [
  "ecdsa_secp256r1_sha256", "rsa_pss_rsae_sha256", "rsa_pkcs1_sha256",
  "ecdsa_secp384r1_sha384", "rsa_pss_rsae_sha384", "rsa_pkcs1_sha384",
  "rsa_pss_rsae_sha512", "rsa_pkcs1_sha512", "rsa_pkcs1_sha1",
].join(":");
const USER_AGENT = "ShooterGame/13 Windows/10.0.19043.1.256.64bit";

/** Minimal https request that does not follow redirects */
function request(url, { method = "GET", headers = {}, body } = {}) {
  if (VERBOSE) console.error(`→ ${method} ${url.split("?")[0]}`);
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9", ...headers },
      ...(BROWSER ? {} : { ciphers: TLS_CIPHERS, sigalgs: TLS_SIGALGS }),
      minVersion: "TLSv1.2",
      timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (VERBOSE) console.error(`← ${res.statusCode}`);
        resolve({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`Request timed out: ${url}`)));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getJson(url, init) {
  const res = await request(url, init);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${init?.method || "GET"} ${url.split("?")[0]} returned ${res.status}: ${res.text.slice(0, 300)}`);
  }
  return res.json();
}

// ---------- Cookie handling ----------
function parseCookieString(str) {
  const jar = {};
  for (const part of str.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) jar[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return jar;
}
const stringifyCookies = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

// Read the .env next to this script (KEY=VALUE, supports # comments and quotes); does not touch process.env
const ENV_FILE = new URL(".env", import.meta.url);
function readDotEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}

/** Write the refreshed cookie back to the SSID line of .env (append it if missing) */
function saveSsidToEnv(value) {
  const text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";
  const line = `SSID=${value}`;
  const next = /^SSID=.*$/m.test(text)
    ? text.replace(/^SSID=.*$/m, () => line)
    : text + (text && !text.endsWith("\n") ? "\n" : "") + line + "\n";
  fs.writeFileSync(ENV_FILE, next, { mode: 0o600 });
}

let cookieFromDotEnv = false;
function loadCookies() {
  let raw = (process.env.SSID || "").trim();
  if (!raw) {
    raw = (readDotEnv().SSID || "").trim();
    cookieFromDotEnv = Boolean(raw);
  }
  if (!raw) {
    console.error("Missing SSID: set SSID in .env (see .env.example) or via the SSID environment variable. Run with --help for usage.");
    process.exit(1);
  }
  // Only treat it as a full cookie string when it looks like "name=value"; a bare ssid value
  // may end with "=" (base64 padding), so that alone must not trigger cookie-string parsing.
  return /^[A-Za-z][\w-]*=[^=]/.test(raw) ? parseCookieString(raw) : { ssid: raw };
}

// ---------- Riot auth flow ----------

/** Step 1: cookie reauth → access_token / id_token, plus the refreshed cookies */
async function cookieReauth(jar) {
  const url = "https://auth.riotgames.com/authorize?" + new URLSearchParams({
    redirect_uri: "https://playvalorant.com/opt_in",
    client_id: "play-valorant-web-prod",
    response_type: "token id_token",
    scope: "account openid",
    nonce: "1",
  });
  const res = await request(url, {
    headers: {
      Cookie: stringifyCookies(jar),
      ...(BROWSER && { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }),
    },
  });

  if (res.status === 403) {
    throw new Error("auth.riotgames.com returned 403; Cloudflare may be blocking you (common on datacenter IPs). Try again from a home network.");
  }
  const location = res.headers.location;
  if (!location) throw new Error(`reauth returned no redirect (HTTP ${res.status}); try again later.`);
  if (location.includes("/login") || !location.includes("access_token")) {
    // Diagnostics only include cookie names/lengths and the redirect URL without its query, so the ssid value is never leaked
    const sent = Object.entries(jar).map(([k, v]) => `${k.length > 20 ? `<odd name, ${k.length} chars>` : k}(${v.length} chars)`).join(", ");
    const target = new URL(location, "https://auth.riotgames.com");
    throw new Error(
      "Cookie is invalid or expired. Sign in again in your browser and copy a fresh ssid.\n" +
      `  HTTP ${res.status}, redirected to: ${target.origin}${target.pathname}\n` +
      `  Cookies sent: ${sent}`,
    );
  }

  // Riot rotates the ssid via set-cookie; merge the new values back into the jar
  for (const sc of res.headers["set-cookie"] || []) {
    const [pair] = sc.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }

  const params = new URLSearchParams(new URL(location).hash.slice(1));
  return { accessToken: params.get("access_token"), idToken: params.get("id_token"), jar };
}

/** Step 2: entitlements token */
async function getEntitlementsToken(accessToken) {
  const data = await getJson("https://entitlements.auth.riotgames.com/api/token/v1", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: "{}",
  });
  return data.entitlements_token;
}

/** Step 3a: puuid is the JWT's sub claim, no extra request needed */
function puuidFromToken(accessToken) {
  const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
  return payload.sub;
}

/** Step 3b: region → shard */
async function getShard(accessToken, idToken) {
  const data = await getJson("https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
  const region = data.affinities?.live;
  // latam / br use the na shard for the store endpoint
  const shard = { latam: "na", br: "na" }[region] || region;
  return { region, shard };
}

// ---------- Client version / platform header ----------
async function getClientVersion() {
  const data = await getJson("https://valorant-api.com/v1/version");
  return data.data.riotClientVersion;
}

function clientPlatformHeader() {
  const json = JSON.stringify({
    platformType: "PC",
    platformOS: "Windows",
    platformOSVersion: "10.0.19042.1.256.64bit",
    platformChipset: "Unknown",
  }, null, "\t").replace(/\n/g, "\r\n");
  return Buffer.from(json).toString("base64");
}

/** Step 4: storefront */
async function getStorefront({ accessToken, entitlementsToken, puuid, shard, clientVersion }) {
  return getJson(`https://pd.${shard}.a.pvp.net/store/v3/storefront/${puuid}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Riot-Entitlements-JWT": entitlementsToken,
      "X-Riot-ClientVersion": clientVersion,
      "X-Riot-ClientPlatform": clientPlatformHeader(),
      "Content-Type": "application/json",
    },
    body: "{}",
  });
}

// ---------- Resolve UUIDs to names via valorant-api.com ----------
const VP = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";
const KC = "85ca954a-41f2-ce94-9b45-8ca3dd39a00d"; // Kingdom Credits

async function lookup(path) {
  try {
    const d = await getJson(`https://valorant-api.com/v1/${path}?language=${LANG}`);
    return d.data?.displayName || null;
  } catch { return null; }
}
const skinName = (levelUuid) => lookup(`weapons/skinlevels/${levelUuid}`);
const bundleName = (uuid) => lookup(`bundles/${uuid}`);

const fmtTime = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
};

async function printStore(store) {
  // Daily store
  const daily = store.SkinsPanelLayout;
  const offers = daily.SingleItemStoreOffers || [];
  console.log(`\n🛒 Daily store (refreshes in ${fmtTime(daily.SingleItemOffersRemainingDurationInSeconds)})`);
  const names = await Promise.all(daily.SingleItemOffers.map(skinName));
  daily.SingleItemOffers.forEach((id, i) => {
    const offer = offers.find((o) => o.OfferID === id);
    const price = offer?.Cost?.[VP];
    console.log(`  • ${names[i] || id}${price ? `  —  ${price} VP` : ""}`);
  });

  // Bundles
  const bundles = store.FeaturedBundle?.Bundles || [];
  if (bundles.length) {
    console.log("\n🎁 Bundles");
    for (const b of bundles) {
      const name = (await bundleName(b.DataAssetID)) || b.DataAssetID;
      const price = b.TotalDiscountedCost?.[VP] ?? b.TotalBaseCost?.[VP];
      console.log(`  • ${name}${price ? `  —  ${price} VP` : ""}  (${fmtTime(b.DurationRemainingInSeconds)} left)`);
    }
  }

  // Night market
  const night = store.BonusStore;
  if (night?.BonusStoreOffers?.length) {
    console.log(`\n🌙 Night market (${fmtTime(night.BonusStoreRemainingDurationInSeconds)} left)`);
    for (const o of night.BonusStoreOffers) {
      const itemId = o.Offer.Rewards?.[0]?.ItemID;
      const name = (await skinName(itemId)) || itemId;
      console.log(`  • ${name}  —  ${o.Offer.Cost?.[VP]} → ${o.DiscountCosts?.[VP]} VP (-${o.DiscountPercent}%)`);
    }
  }

  // Accessory store (Kingdom Credits)
  const acc = store.AccessoryStore?.AccessoryStoreOffers || [];
  if (acc.length) {
    console.log(`\n🪙 Accessory store: ${acc.length} items, priced ${acc.map((o) => o.Offer?.Cost?.[KC]).filter(Boolean).join(" / ")} KC (names depend on the item type and are omitted here)`);
  }
}

// ---------- HTML page ----------
async function fetchData(path) {
  try { return (await getJson(`https://valorant-api.com/v1/${path}?language=${LANG}`)).data; }
  catch { return null; }
}

/** Skin level UUID → { name, icon, tier }; looks in the full skins table first (includes rarity), falls back to the single skin-level endpoint */
async function buildSkinResolver() {
  const [skins, tiers] = await Promise.all([fetchData("weapons/skins"), fetchData("contenttiers")]);
  const tierById = new Map((tiers || []).map((t) => [t.uuid, {
    name: t.displayName, icon: t.displayIcon, color: `#${t.highlightColor.slice(0, 6)}`, // highlightColor is RRGGBBAA
  }]));
  const skinByLevel = new Map();
  for (const s of skins || []) for (const l of s.levels) skinByLevel.set(l.uuid, s);

  return async (levelUuid) => {
    const s = skinByLevel.get(levelUuid);
    if (s) {
      return {
        name: s.displayName,
        icon: s.displayIcon || s.levels[0]?.displayIcon || s.chromas?.[0]?.fullRender || null,
        tier: tierById.get(s.contentTierUuid) || null,
      };
    }
    const l = await fetchData(`weapons/skinlevels/${levelUuid}`);
    return { name: l?.displayName || levelUuid, icon: l?.displayIcon || null, tier: null };
  };
}

/** Shape the storefront into what the page needs (names, images, prices, end times) */
async function collectView(store, region) {
  const skin = await buildSkinResolver();
  const now = Date.now();

  const daily = store.SkinsPanelLayout;
  const offers = daily.SingleItemStoreOffers || [];
  const dailyItems = await Promise.all(daily.SingleItemOffers.map(async (id) => ({
    ...(await skin(id)),
    price: offers.find((o) => o.OfferID === id)?.Cost?.[VP] ?? null,
  })));

  const bundles = await Promise.all((store.FeaturedBundle?.Bundles || []).map(async (b) => {
    const d = await fetchData(`bundles/${b.DataAssetID}`);
    return {
      name: d?.displayName || b.DataAssetID,
      icon: d?.displayIcon || d?.verticalPromoImage || null,
      price: b.TotalDiscountedCost?.[VP] ?? b.TotalBaseCost?.[VP] ?? null,
      basePrice: b.TotalBaseCost?.[VP] ?? null,
      endsAt: now + b.DurationRemainingInSeconds * 1000,
    };
  }));

  const nightOffers = store.BonusStore?.BonusStoreOffers || [];
  const nightItems = await Promise.all(nightOffers.map(async (o) => ({
    ...(await skin(o.Offer.Rewards?.[0]?.ItemID)),
    price: o.DiscountCosts?.[VP] ?? null,
    basePrice: o.Offer.Cost?.[VP] ?? null,
    percent: o.DiscountPercent,
  })));

  return {
    region,
    generatedAt: new Date(now),
    daily: { items: dailyItems, endsAt: now + daily.SingleItemOffersRemainingDurationInSeconds * 1000 },
    bundles,
    night: nightItems.length
      ? { items: nightItems, endsAt: now + store.BonusStore.BonusStoreRemainingDurationInSeconds * 1000 }
      : null,
  };
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STR = LANG.startsWith("zh")
  ? { title: "我的商店", daily: "每日商店", bundles: "捆绑包", night: "夜市", untilRefresh: "后刷新", untilEnd: "后结束", noImage: "无图片", region: "区服", generated: "生成于" }
  : { title: "My store", daily: "Daily offers", bundles: "Featured bundles", night: "Night market", untilRefresh: "until refresh", untilEnd: "left", noImage: "No image", region: "Region", generated: "Generated" };

const countdown = (endsAt, suffix) => `<span class="cd-wrap"><time class="cd" data-end="${endsAt}"></time> ${suffix}</span>`;
const vp = (n) => `<span class="num">${n}</span><small>VP</small>`;
// Show a "No image" placeholder when the image is missing or fails to load
const artHtml = (it) => (it.icon
  ? `<img src="${esc(it.icon)}" alt="${esc(it.name)}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">`
  : "") + `<span class="noimg"${it.icon ? " hidden" : ""}>${STR.noImage}</span>`;

function skinCard(it, prices) {
  return `
    <article class="skin" style="--tier:${it.tier?.color || "#6b7686"}">
      <div class="art">${artHtml(it)}</div>
      <div class="info">
        <div>
          <h3>${esc(it.name)}</h3>
          ${it.tier ? `<p class="tier"><img src="${esc(it.tier.icon)}" alt="">${esc(it.tier.name)}</p>` : ""}
        </div>
        <p class="prices">${prices}</p>
      </div>
    </article>`;
}

function renderHtml(v) {
  const dailyCards = v.daily.items.map((it) => skinCard(it, it.price == null ? "" : vp(it.price))).join("");

  const bundleCards = v.bundles.map((b) => `
    <article class="bundle">
      <div class="bundle-art">${artHtml(b)}</div>
      <div class="bundle-info">
        <h3>${esc(b.name)}</h3>
        <p class="prices">${b.basePrice != null && b.basePrice !== b.price ? `<s>${b.basePrice}</s>` : ""}${b.price == null ? "" : vp(b.price)}</p>
        <p class="left">${countdown(b.endsAt, STR.untilEnd)}</p>
      </div>
    </article>`).join("");

  const nightCards = v.night?.items.map((it) => skinCard(it,
    `${it.basePrice != null ? `<s>${it.basePrice}</s>` : ""}${it.price == null ? "" : vp(it.price)}<span class="off">-${it.percent}%</span>`)).join("") || "";

  return `<!doctype html>
<html lang="${esc(LANG.split("-")[0])}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${esc(STR.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root { --bg: #10151d; --panel: #171f2b; --ink: #eef1f5; --mute: #8e9aab; --line: #273142; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 "Hanken Grotesk", system-ui, sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 40px 16px 64px; }
h1, h2, h3, .num { font-family: "Big Shoulders Display", "Arial Narrow", sans-serif; }
h1 { margin: 0; font-size: clamp(56px, 11vw, 112px); line-height: .88; font-weight: 800; letter-spacing: -.01em; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 20px; margin: 16px 0 0; color: var(--mute); font-size: 14px; }
section { margin-top: 56px; }
.sec-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 16px; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
h2 { margin: 0; font-size: 34px; line-height: 1; font-weight: 700; }
.cd-wrap { color: var(--mute); font-size: 15px; }
.cd { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.grid { display: grid; gap: 14px; grid-template-columns: 1fr; }
.skin { background: var(--panel); box-shadow: inset 4px 0 0 var(--tier); clip-path: polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 0 100%); }
.art { display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); place-items: center; height: 200px; padding: 14px 28px; background: radial-gradient(ellipse 70% 80% at 50% 62%, color-mix(in srgb, var(--tier) 48%, transparent), transparent 72%); }
.art img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 10px 14px rgba(0, 0, 0, .55)); }
.noimg { color: var(--mute); font-size: 14px; }
.info { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 4px 20px 18px 24px; }
h3 { margin: 0; font-size: 28px; line-height: 1.05; font-weight: 700; }
.tier { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; color: var(--tier); font-size: 14px; font-weight: 500; }
.tier img { width: 18px; height: 18px; }
.prices { display: flex; align-items: baseline; gap: 6px; margin: 0; white-space: nowrap; }
.prices .num { font-size: 34px; line-height: 1; font-weight: 700; }
.prices small { color: var(--mute); font-size: 12px; font-weight: 600; }
.prices s { color: var(--mute); font-size: 15px; }
.off { margin-left: 6px; padding: 1px 7px; background: var(--tier); color: #10151d; font-size: 13px; font-weight: 600; }
.night .art { height: 140px; }
.night h3 { font-size: 22px; }
.night .info { flex-wrap: wrap; align-items: flex-start; }
.night .prices .num { font-size: 28px; }
.bundle { display: grid; grid-template-columns: 1fr; background: var(--panel); margin-bottom: 14px; }
.bundle-art { display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); place-items: center; height: 240px; padding: 12px; background: #0c1118; }
.bundle-art img { width: 100%; height: 100%; object-fit: contain; }
.bundle-info { display: flex; flex-direction: column; justify-content: center; gap: 10px; padding: 20px 24px; }
.bundle-info h3 { font-size: 36px; }
.left { margin: 0; }
footer { margin-top: 56px; color: var(--mute); font-size: 13px; }
@media (min-width: 760px) {
  .grid.daily { grid-template-columns: repeat(2, 1fr); }
  .grid.night { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
  .bundle { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); }
  .bundle-art { height: 280px; }
}
</style>
</head>
<body>
<main>
  <header>
    <h1>${esc(STR.title)}</h1>
    <p class="meta"><span>${esc(STR.region)}: ${esc(v.region)}</span><span>${esc(STR.generated)} ${esc(v.generatedAt.toLocaleString(LANG))}</span></p>
  </header>

  <section>
    <div class="sec-head"><h2>${esc(STR.daily)}</h2>${countdown(v.daily.endsAt, STR.untilRefresh)}</div>
    <div class="grid daily">${dailyCards}</div>
  </section>
${v.bundles.length ? `
  <section>
    <div class="sec-head"><h2>${esc(STR.bundles)}</h2></div>
    ${bundleCards}
  </section>` : ""}
${v.night ? `
  <section>
    <div class="sec-head"><h2>${esc(STR.night)}</h2>${countdown(v.night.endsAt, STR.untilEnd)}</div>
    <div class="grid night">${nightCards}</div>
  </section>` : ""}
  <footer>Images and names: valorant-api.com</footer>
</main>
<script>
function fmt(ms) {
  if (ms <= 0) return "0m";
  var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d ? d + "d " + h + "h" : h + "h " + String(m).padStart(2, "0") + "m";
}
function tick() {
  document.querySelectorAll("time.cd").forEach(function (t) { t.textContent = fmt(Number(t.dataset.end) - Date.now()); });
}
tick();
setInterval(tick, 30000);
</script>
</body>
</html>
`;
}

function openFile(path) {
  const [cmd, ...pre] = process.platform === "darwin" ? ["open"]
    : process.platform === "win32" ? ["cmd", "/c", "start", ""]
    : ["xdg-open"];
  spawn(cmd, [...pre, path], { detached: true, stdio: "ignore" }).unref();
}

// ---------- Main ----------
async function main() {
  const jar = loadCookies();

  const { accessToken, idToken } = await cookieReauth(jar);
  // Persist the rotated cookie
  if (cookieFromDotEnv) saveSsidToEnv(stringifyCookies(jar));

  const puuid = puuidFromToken(accessToken);
  const [entitlementsToken, { region, shard }, clientVersion] = await Promise.all([
    getEntitlementsToken(accessToken),
    getShard(accessToken, idToken),
    getClientVersion(),
  ]);
  if (VERBOSE) console.error({ puuid, region, shard, clientVersion });

  const store = await getStorefront({ accessToken, entitlementsToken, puuid, shard, clientVersion });

  if (OUTPUT_JSON) {
    console.log(JSON.stringify(store, null, 2));
  } else if (OUTPUT_HTML) {
    fs.writeFileSync(HTML_FILE, renderHtml(await collectView(store, region)));
    const file = fileURLToPath(HTML_FILE);
    console.log(`Generated: ${file}`);
    if (!NO_OPEN) openFile(file);
  } else {
    console.log(`Region: ${region} (shard: ${shard})  Client version: ${clientVersion}`);
    await printStore(store);
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
