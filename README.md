# AV Field Tools (PWA) v1.0

Calculators, reference tables, a device-label reader, job records and a one-tap package for the PM. Installs to a phone home screen, works offline, keeps every photo and record on the phone.

## Deploy in 10 minutes (GitHub Pages, free)
1. Create a GitHub account if you don't have one, then a new public repository named `avfieldtools` (any name works).
2. Upload everything in this folder except `node_modules/`, `smoke.js`, `test.js` and `platforms.json`: `index.html`, `core.js`, `app.js`, `sw.js`, `manifest.webmanifest`, the `icons/` folder.
3. Repository Settings > Pages > Source: Deploy from a branch, Branch: main, folder: / (root). Save.
4. In a minute the app is live at `https://<your-user>.github.io/avfieldtools/`. Open it on a phone and add it to the home screen.
5. Optional custom domain: buy the domain, add it under Settings > Pages > Custom domain, and add the DNS records GitHub shows. HTTPS is automatic. Camera, share sheet and offline mode all need HTTPS, which Pages provides.

Updating: run `node bump.mjs 1.2.3` (any new version number) before uploading. It stamps the version into every script URL, `app.js` and `sw.js`, so no browser or GitHub Pages cache can serve a stale file. Then upload everything. On a phone that already has the app: Settings, Check for updates and reload; the version line confirms.

## Turning on the paid tier (when the Lemon Squeezy product exists)
1. In Lemon Squeezy create a product "AV Field Tools" (one-time, license keys enabled, activation limit 3).
2. In `app.js` set `PRO_REQUIRED = true`. Records, Scan and Send then ask for a license key; Calculators and Reference stay free.
3. The app validates keys against Lemon Squeezy's public license endpoint from the phone, once, then remembers. No server of ours involved.

## What the app does today
- Calculators (11): projector throw, display size and viewing distance with a readability check, video bandwidth to cable rating, 70 V line load, SPL and amplifier power, speaker cable loss, PoE budget, rack heat and circuit, subnet, levels and decibels, conversions.
- Reference (16 screens): the book's tables plus all ten platform quick guides.
- Scan: photograph a device label (serial, MAC, IP and model recognised on the phone and validated), photograph a problem into a punch item, photograph a field book page (page code read; filed under the job).
- Records: jobs, devices, punch items with severity, party and status, filed pages.
- Send: subject line and text summary, devices and punch as .csv, punch photos and page photos, through the phone share sheet into Mail or Teams, or as a .zip, or copied as text.

## What it does not do yet
- Reading the boxes and bubbles on field book pages (v1.1). Pages currently travel as straightened photos with the page type.
- Handwriting. Serials and MACs come from printed labels; typed corrections are one tap away.
- Anything on a server. There is none.

## Testing
`node test.js` runs the calculator and parsing unit tests. `node smoke.js` (needs `npm install jsdom fake-indexeddb`) walks the UI headlessly: every calculator, every reference screen, job and record creation, package build.
