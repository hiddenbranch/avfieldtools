#!/usr/bin/env node
/* Stamp a version into app.js, sw.js and every script tag in index.html so no browser or CDN cache can serve a stale file.
   Usage: node bump.mjs 1.4.2 */
import { readFileSync, writeFileSync } from 'node:fs';
const v = process.argv[2]; if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error('usage: node bump.mjs 1.2.3'); process.exit(1); }
const prefix = readFileSync('sw.js', 'utf8').match(/const VERSION = '([a-z]+)-/)[1];
let html = readFileSync('index.html', 'utf8');
html = html.replace(/<script src="([a-z]+\.js)(\?v=[^"]*)?"><\/script>/g, `<script src="$1?v=${v}"></script>`);
html = html.replace(/href="manifest\.webmanifest(\?v=[^"]*)?"/, `href="manifest.webmanifest?v=${v}"`);
writeFileSync('index.html', html);
let app = readFileSync('app.js', 'utf8'); app = app.replace(/const APP_VERSION = '[^']*';/, `const APP_VERSION = '${v}';`); writeFileSync('app.js', app);
let sw = readFileSync('sw.js', 'utf8');
sw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${prefix}-${v}';`);
const scripts = [...html.matchAll(/src="([a-z]+\.js\?v=[^"]*)"/g)].map(m => './' + m[1]);
sw = sw.replace(/const SHELL = \[[^\]]*\];/, `const SHELL = ['./', './index.html', ${scripts.map(s => `'${s}'`).join(', ')}, './manifest.webmanifest?v=${v}', './icons/icon-192.png', './icons/icon-512.png'];`);
writeFileSync('sw.js', sw);
console.log(`stamped ${v}: index.html script tags, app.js APP_VERSION, sw.js VERSION and SHELL`);
