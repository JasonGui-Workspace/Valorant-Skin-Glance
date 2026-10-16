<p align="right">English | <a href="README.zh.md">中文</a></p>

<h1 align="center">Valorant Skin Glance</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933.svg" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen.svg" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey.svg" alt="Platform">
</p>

<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white" alt="Node.js"></a>
  <a href="https://developer.mozilla.org/docs/Web/JavaScript"><img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black" alt="JavaScript"></a>
  <a href="https://developer.mozilla.org/docs/Web/HTML"><img src="https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white" alt="HTML5"></a>
  <a href="https://developer.mozilla.org/docs/Web/CSS"><img src="https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white" alt="CSS3"></a>
</p>

A tiny, zero-dependency Node.js script that shows your current VALORANT store — daily skins, featured bundles and the Night Market — either in the terminal or as a local HTML page with skin images, rarity colors and live countdowns.

> **Note:** This runs locally on your machine — no backend, login form or database involved. It relies on unofficial Riot APIs that can change at any time. See [Disclaimer](#disclaimer) before using it.

---

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Acknowledgements](#acknowledgements)
- [Screenshot](#screenshot)
- [Disclaimer](#disclaimer)
- [Why This Approach Lowers Your Risk](#why-this-approach-lowers-your-risk)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
  - [1. Get Your `ssid`](#1-get-your-ssid)
  - [2. Add It to `.env`](#2-add-it-to-env)
- [Commands](#commands)
- [Keeping Your Session Alive](#keeping-your-session-alive)
- [Troubleshooting](#troubleshooting)
- [How It Works](#how-it-works)
  - [1. Signing in with the `ssid` cookie](#1-signing-in-with-the-ssid-cookie)
  - [2. Getting what the store endpoint needs](#2-getting-what-the-store-endpoint-needs)
  - [3. Fetching the store](#3-fetching-the-store)
  - [4. Turning UUIDs into something readable](#4-turning-uuids-into-something-readable)
  - [5. Output](#5-output)
  - [Why the TLS settings?](#why-the-tls-settings)
  - [Limitations](#limitations)

---

## Acknowledgements

This tool was inspired by these projects:

- [giorgi-o/skinpeek](https://github.com/giorgi-o/skinpeek)
- [krizad/valorant-store-bot](https://github.com/krizad/valorant-store-bot)

---

## Screenshot

<p align="center">
  <img src="public/screenshot.png" alt="Valorant Skin Glance screenshot" width="720">
</p>

The `--html` page lists the daily offers, featured bundles and, when it is active, the Night Market.

---

## Disclaimer

This project relies on **unofficial, undocumented Riot APIs** and authenticates with your account's `ssid` session cookie. Please read this before using it:

- **The APIs are unofficial and can change at any time.** Riot does not publish or support these endpoints. If Riot updates its auth flow, store endpoints or anti-bot protection, this tool may stop working until it is updated.
- It is **not affiliated with or endorsed by Riot Games**. VALORANT and Riot Games are trademarks of Riot Games, Inc.
- Using these endpoints is **against Riot's developer policy**. Use it on **your own account only**, at your own risk.
- Your `ssid` is equivalent to a logged-in session. **Never share it, paste it into issues, or commit it to git.**
- Skin names and images come from the community API [valorant-api.com](https://valorant-api.com).

---

## Why This Approach Lowers Your Risk

Many third-party VALORANT store tools ask for your Riot username and password, or collect them on a server. This tool is designed to avoid that:

- **No username or password, ever.** The script never asks for them and has no login form. It cannot see your password, and there is no password to leak, log or store.
- **The credential comes from the official Riot site.** The only secret you provide is the `ssid` session cookie, which you get by signing in yourself on Riot's own website (`auth.riotgames.com`). Your password and any multi-factor code only ever go to Riot.
- **Nothing is uploaded to a database or server of ours.** There is no backend. The script runs on your machine and keeps the `ssid` in a local `.env` file (permissions `600`). It is only ever sent to `auth.riotgames.com`, the same host your browser sends it to.
- **Few network destinations.** Riot's own hosts (auth, entitlements, geo and your regional store server) and [valorant-api.com](https://valorant-api.com) for names and images. No credentials are sent to valorant-api.com. The generated HTML page also loads fonts from Google Fonts and images from valorant-api.com's CDN in your browser.
- **Easy to audit.** The whole tool is one dependency-free file, `valorant-shop.mjs`, so there is no `node_modules` tree of third-party code that could read your cookie.

This reduces risk compared with password-based tools, but it does not remove it. An `ssid` is still a logged-in session: anyone who gets it can act as you until it is invalidated. Keep `.env` private, don't commit it to git (add `.env` and `valorant-shop.html` to your `.gitignore`), and if it ever leaks, sign out of all devices in your Riot account settings.

---

## Requirements

- Node.js 18 or newer
- A Riot account that is signed in on a browser (to copy the `ssid` cookie once)

No `npm install` is needed.

---

## Quick Start

### 1. Get Your `ssid`

1. Sign in at <https://auth.riotgames.com> in your browser and tick **Stay signed in**.
2. Open DevTools (F12) → **Application** → **Cookies** → `https://auth.riotgames.com`.
3. Copy the **value** of the `ssid` cookie.

Tip: use a private/incognito window for this and don't keep using that browser session afterwards. Riot rotates the cookie on every re-authentication, so a session that keeps running in the browser can invalidate the copy you gave the script.

### 2. Add It to `.env`

```bash
cp .env.example .env
```

Then paste the value into `.env`:

```
SSID=eyJ...
```

You may also paste a whole cookie string (e.g. `ssid=...; clid=...`).

---

## Commands

Open a terminal in the project folder and run the command that fits your needs.

```bash
node valorant-shop.mjs                  # print your store in the terminal
node valorant-shop.mjs --html           # (recommended) write valorant-shop.html and open it in your browser
node valorant-shop.mjs --html --no-open # write the HTML file without opening it
node valorant-shop.mjs --json           # print the raw storefront JSON
node valorant-shop.mjs --lang zh-CN     # language for skin names and page text (default: en-US)
node valorant-shop.mjs --browser        # troubleshooting: browser User-Agent + Node's default TLS settings
node valorant-shop.mjs --verbose        # log each HTTP request
node valorant-shop.mjs --help           # show usage
```

The `SSID` environment variable takes precedence over `.env`:

```bash
SSID="eyJ..." node valorant-shop.mjs
```

---

## Keeping Your Session Alive

Riot issues a fresh `ssid` each time the script authenticates. When the value comes from `.env`, the script writes the new cookie back to `.env` (file mode `600`), so running it regularly keeps the session going. If you pass `SSID` through the environment, nothing is written back.

How long a session lasts without use is up to Riot and is not documented. Run the script every few days, and avoid running two copies at the same time, since they would overwrite each other's cookie.

---

## Troubleshooting

| Message | What to Try |
|---------|-------------|
| `Missing SSID` | Create `.env` from `.env.example` and fill in `SSID`, or set the `SSID` environment variable |
| `Cookie is invalid or expired` (redirected to `/login`) | Sign in again in a private window, copy a fresh `ssid` and run the script right away. Don't reuse that browser session |
| Still failing with a fresh cookie | Make sure you copied the full `ssid` value, then try `--browser` (browser User-Agent and default TLS settings) as a last resort |
| `returned 403` / Cloudflare | Datacenter and VPN IPs are often blocked. Try from a home network |
| A request suddenly returns 4xx/5xx or unexpected data | Riot may have changed the unofficial API. Check whether a newer version of this tool is available |
| Anything else | Run with `--verbose` and check which request fails |

The error output only contains cookie **names and lengths**, never their values, so it is safe to share when asking for help.

---

## How It Works

The VALORANT game client talks to Riot's servers over HTTP APIs, and the store is just one of those calls. This script performs the same calls the client would make, using the login session you already have in your browser instead of a username and password.

```
.env (ssid) ──► auth.riotgames.com ──► access token + ID token
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                       ▼                       ▼
         entitlements token         PUUID (from JWT)      region / shard lookup
                  └───────────────────────┼───────────────────────┘
                                          ▼
                     pd.{shard}.a.pvp.net  storefront  ──► raw offer UUIDs
                                          │
                     valorant-api.com  ───┘  UUIDs ──► names, images, rarity
                                          ▼
                              terminal output  /  valorant-shop.html
```

### 1. Signing in with the `ssid` cookie

When you sign in to Riot in a browser, `auth.riotgames.com` sets a long-lived session cookie called `ssid`. The script sends a request to the OAuth `authorize` endpoint with that cookie, using the same client ID as the VALORANT website (`play-valorant-web-prod`). If the session is still valid, Riot responds with a redirect whose URL fragment contains an **access token** and an **ID token**. The script reads them from the `Location` header without following the redirect. If the session is invalid, Riot redirects to the login page instead, which the script reports as an expired cookie.

The same response also rotates the cookie. The script merges the new `Set-Cookie` values and, if the `ssid` came from `.env`, saves them back so the next run starts from the latest value.

### 2. Getting what the store endpoint needs

The store endpoint wants a few more things, all derived from the access token:

- **Entitlements token** – requested from `entitlements.auth.riotgames.com` with the access token as a bearer token. It proves which content your account owns.
- **PUUID** – your player ID. It is the `sub` claim inside the access token (a JWT), so no extra request is needed.
- **Region and shard** – `riot-geo.pas.si.riotgames.com` returns your account's region (e.g. `na`, `eu`, `ap`, `kr`), which decides the server hostname `pd.{shard}.a.pvp.net`. LATAM and BR use the `na` shard.
- **Client version** – the store endpoint expects the current VALORANT client version header. It is read from valorant-api.com so it stays up to date without being hard-coded.

### 3. Fetching the store

The script sends `POST https://pd.{shard}.a.pvp.net/store/v3/storefront/{puuid}` with the access token, entitlements token, client version and a platform header. The response contains:

- the daily offers (`SkinsPanelLayout`) and the seconds until they rotate,
- featured bundles (`FeaturedBundle`),
- the Night Market (`BonusStore`), when it is active.

Everything in it is a bare UUID, such as a skin level ID, with prices keyed by currency ID (VP is `85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741`).

### 4. Turning UUIDs into something readable

The community-maintained [valorant-api.com](https://valorant-api.com) maps UUIDs to display names, images and rarity tiers. The script downloads the skin and content-tier tables once per run and looks each offer up in them. The rarity tier supplies the accent color on the HTML page. Names are localized with `--lang`.

### 5. Output

In terminal mode the result is printed as plain text. With `--html`, the script builds a single self-contained page next to the script (`valorant-shop.html`) and opens it with your OS's default handler. The countdowns on the page are computed in the browser from the absolute end times, so they keep ticking while the page is open. Re-run the script to get a fresh store.

### Why the TLS settings?

Riot's auth endpoint sits behind Cloudflare, which can reject requests whose TLS fingerprint looks unlike the real game client. The script therefore requests the same cipher suites and signature algorithms in the same order as the client and sends the client's User-Agent. The `--browser` flag switches the auth request to a browser User-Agent and Node's default TLS settings, as a fallback.

### Limitations

- Everything above depends on unofficial Riot endpoints and may break whenever Riot changes them.
- The script does not handle multi-factor prompts or username/password login; it only reuses an existing browser session.
- Only the daily store, featured bundles and the Night Market are shown.
