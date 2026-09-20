/* AV Field Tools - app UI. Depends on core.js (window.AVCore). */
(function () {
  'use strict';
  const C = window.AVCore;
  const APP_VERSION = '1.1.1';
  const PRO_REQUIRED = false;                 // flip to true once the Lemon Squeezy product exists
  // Licence keys are signed offline and checked on the device. No payment provider, no server, no network call.
  const PUBLIC_KEY = {"kty":"EC","crv":"P-256","x":"REPLACE_WITH_YOUR_PUBLIC_KEY_X","y":"REPLACE_WITH_YOUR_PUBLIC_KEY_Y"};
  const PRODUCT = 'avft';
  const CDN = {
    tesseract: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js',
    jsqr: 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js',
    jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
  };

  // ---------- tiny DOM helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === false || v === null || v === undefined) continue;
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  let toastTimer;
  function toast(msg) {
    let t = $('.toast'); if (!t) { t = h('div', { class: 'toast' }); document.body.append(t); }
    t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2200);
  }
  const today = () => new Date().toISOString().slice(0, 10);
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s);
    });
  }

  // ---------- IndexedDB ----------
  const DB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('avfieldtools', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          for (const s of ['jobs', 'devices', 'punch', 'pages']) {
            const st = d.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
            if (s !== 'jobs') st.createIndex('jobId', 'jobId');
          }
          d.createObjectStore('kv', { keyPath: 'key' });
        };
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    tx(store, mode, fn) {
      return this.open().then(d => new Promise((res, rej) => {
        const t = d.transaction(store, mode); const s = t.objectStore(store); const req = fn(s);
        t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      }));
    },
    put(store, obj) { return this.tx(store, 'readwrite', s => s.put(obj)); },
    del(store, id) { return this.tx(store, 'readwrite', s => s.delete(id)); },
    get(store, id) { return this.tx(store, 'readonly', s => s.get(id)); },
    all(store) { return this.tx(store, 'readonly', s => s.getAll()); },
    byJob(store, jobId) { return this.tx(store, 'readonly', s => s.index('jobId').getAll(jobId)); },
    async clearAll() { for (const s of ['jobs', 'devices', 'punch', 'pages', 'kv']) await this.tx(s, 'readwrite', st => st.clear()); }
  };
  const S = { cache: {} };
  S.get = async (k, dflt) => { if (k in S.cache) return S.cache[k]; const r = await DB.get('kv', k); S.cache[k] = r ? r.value : dflt; return S.cache[k]; };
  S.set = async (k, v) => { S.cache[k] = v; await DB.put('kv', { key: k, value: v }); };

  // ---------- state / router ----------
  const state = { tab: 'calc', sub: null, jobId: null };
  const view = $('#view');
  function go(tab, sub) { state.tab = tab; state.sub = sub || null; render(); window.scrollTo(0, 0); }
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
  $('#gearBtn').addEventListener('click', () => go('settings'));
  async function render() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
    view.innerHTML = '';
    const pro = await isPro();
    const gated = ['scan', 'rec', 'send'].includes(state.tab) && !pro;
    if (gated) return view.append(lockScreen());
    const fn = { calc: renderCalc, ref: renderRef, scan: renderScan, rec: renderRecords, send: renderSend, settings: renderSettings }[state.tab];
    await fn();
    updateChip();
  }
  async function isPro() { if (!PRO_REQUIRED) return true; return !!(await S.get('pro', false)); }
  function lockScreen() {
    return h('div', null, h('h2', null, 'Records, label reader and send'),
      h('div', { class: 'lock' }, h('p', null, 'These three tabs are the paid part of AV Field Tools: photograph labels into device records, keep punch items with photos, and send your PM a package instead of a pile of pictures. One-time purchase, no account, nothing leaves your phone.'),
        h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => go('settings') }, 'Enter a license key')),
        h('p', { class: 'muted small' }, 'Calculators and reference stay free.')));
  }
  async function updateChip() {
    const chip = $('#jobChip'); const job = state.jobId ? await DB.get('jobs', state.jobId) : null;
    chip.hidden = !job; if (job) chip.textContent = job.number || job.client || 'job';
  }

  // ---------- calculators ----------
  const CALCS = [
    { id: 'throw', title: 'Projector throw', sub: 'Lens ratio and image width to mounting distance', fields: [
        { key: 'rmin', label: 'Throw ratio (min zoom)', type: 'number', value: 1.2, step: 0.01 }, { key: 'rmax', label: 'Throw ratio (max zoom, optional)', type: 'number', value: 1.8, step: 0.01 },
        { key: 'w', label: 'Image width (in)', type: 'number', value: 120 }, { key: 'd', label: 'Or: distance available (in), for the image width it gives', type: 'number', value: '' }],
      compute(v) {
        const out = [];
        if (v.w) { const r = C.throwRange(v.rmin, v.rmax || v.rmin, v.w); out.push({ l: 'Lens to screen', v: `${r.min} to ${r.max} in`, n: `${C.round.r1(r.min / 12)} to ${C.round.r1(r.max / 12)} ft` }); }
        if (v.d) out.push({ l: 'Image width at that distance', v: `${C.imageWidthFromThrow(v.rmax || v.rmin, v.d)} to ${C.imageWidthFromThrow(v.rmin, v.d)} in`, n: 'measure to the lens, not the body' });
        return out;
      } },
    { id: 'display', title: 'Display size and viewing distance', sub: 'Diagonal to width and height, 16:9 or 16:10, plus the readability check', fields: [
        { key: 'diag', label: 'Diagonal (in)', type: 'number', value: 75 }, { key: 'aspect', label: 'Aspect', type: 'select', value: '16:9', options: ['16:9', '16:10', '4:3', '21:9'] },
        { key: 'elem', label: 'Smallest text height on screen (in), optional', type: 'number', value: '' }, { key: 'far', label: 'Farthest viewer (in), optional', type: 'number', value: '' }],
      compute(v) {
        const wh = C.diagToWH(v.diag, v.aspect); const vd = C.viewingDistances(wh.h); const out = [
          { l: 'Width x height', v: `${wh.w} x ${wh.h} in` },
          { l: 'Farthest viewer, 4-6-8 rule', v: `${vd.analytical} / ${vd.basic} / ${vd.passive} in`, n: 'analytical / basic decision / passive. DISCAS for submittals.' }];
        if (v.elem && v.far) { const a = C.elementArcMinutes(v.elem, v.far); const verdict = C.elementVerdict(a); out.push({ l: 'Smallest text at the farthest seat', v: `${a} arc-min, ${verdict}`, n: '15 or more reads comfortably; under 9 will not be read', tone: verdict === 'too small' ? 'bad' : verdict === 'comfortable' ? 'ok' : '' }); }
        return out;
      } },
    { id: 'hdmi', title: 'Video bandwidth', sub: 'Resolution and refresh to Gb/s and the cable rating you need', fields: [
        { key: 'w', label: 'Width (px)', type: 'number', value: 3840 }, { key: 'hh', label: 'Height (px)', type: 'number', value: 2160 }, { key: 'fps', label: 'Refresh (Hz)', type: 'number', value: 60 },
        { key: 'bpc', label: 'Bits per color', type: 'select', value: '8', options: ['8', '10', '12'] }, { key: 'chroma', label: 'Chroma', type: 'select', value: '4:4:4', options: ['4:4:4', '4:2:2', '4:2:0'] }],
      compute(v) { const r = C.hdmiBandwidth(v.w, v.hh, v.fps, Number(v.bpc), v.chroma); return [{ l: 'Approximate TMDS data rate', v: `${r.gbps} Gb/s` }, { l: 'Cable rating', v: r.rating, n: 'blanking estimated; treat as a sanity check' }]; } },
    { id: 'line70', title: '70 V line load', sub: 'Tap totals against the amplifier rating', fields: [
        { key: 'c1', label: 'Speakers', type: 'number', value: 8 }, { key: 'w1', label: 'Tap (W)', type: 'number', value: 10 },
        { key: 'c2', label: 'Speakers', type: 'number', value: 0 }, { key: 'w2', label: 'Tap (W)', type: 'number', value: 5 },
        { key: 'c3', label: 'Speakers', type: 'number', value: 0 }, { key: 'w3', label: 'Tap (W)', type: 'number', value: 2 },
        { key: 'amp', label: 'Amplifier channel rating (W at 70 V)', type: 'number', value: 120 }],
      pairs: true,
      compute(v) { const r = C.line70Load([{ count: v.c1 || 0, watts: v.w1 || 0 }, { count: v.c2 || 0, watts: v.w2 || 0 }, { count: v.c3 || 0, watts: v.w3 || 0 }], v.amp); return [
        { l: 'Total tap load', v: `${r.total} W` }, { l: 'Of amplifier rating', v: r.pct === null ? '-' : `${r.pct}%`, n: '80% is the usual ceiling', tone: r.ok === false ? 'bad' : r.ok ? 'ok' : '' },
        { l: 'Smallest amplifier for this load', v: `${r.minAmp} W` }, { l: 'Impedance of a 10 W tap', v: `${C.tapImpedance(10)} ohms`, n: 'Z = 5,000 / W at 70.7 V' }]; } },
    { id: 'spl', title: 'SPL and amplifier power', sub: 'Sensitivity, distance and target level to watts', fields: [
        { key: 'sens', label: 'Speaker sensitivity (dB, 1 W / 1 m)', type: 'number', value: 90 }, { key: 'dist', label: 'Distance to listener (m)', type: 'number', value: 6 },
        { key: 'target', label: 'Target SPL at listener (dB)', type: 'number', value: 85 }, { key: 'head', label: 'Headroom (dB)', type: 'number', value: 10 },
        { key: 'spl1', label: 'Or: SPL at 1 m, to see level at the distance above', type: 'number', value: '' }],
      compute(v) { const out = [{ l: 'Amplifier power needed', v: `${C.powerForSpl(v.target, v.dist, v.sens, v.head)} W`, n: 'point source, free field' }];
        if (v.spl1) out.push({ l: `SPL at ${v.dist} m`, v: `${C.splAtDistance(v.spl1, 1, v.dist)} dB` }); return out; } },
    { id: 'cable', title: 'Speaker cable loss', sub: 'Gauge, run and load to dB lost, and the longest run for 0.5 dB', fields: [
        { key: 'awg', label: 'Wire gauge (AWG)', type: 'select', value: '14', options: ['10', '12', '14', '16', '18', '20', '22', '24'] }, { key: 'len', label: 'One-way run (ft)', type: 'number', value: 100 },
        { key: 'load', label: 'Load (ohms; 70 V line = 5,000 / total W)', type: 'number', value: 8 }],
      compute(v) { const r = C.speakerCableLoss(Number(v.awg), v.len, v.load); return [
        { l: 'Loss on this run', v: `${r.lossDb} dB`, n: `${r.powerLostPct}% of the power heats the cable (${r.cableOhms} ohms round trip)`, tone: r.lossDb > 1 ? 'bad' : r.lossDb <= 0.5 ? 'ok' : '' },
        { l: 'Longest run for 0.5 dB', v: `${C.speakerCableMaxRun(Number(v.awg), v.load, 0.5)} ft` }, { l: 'Longest run for 1 dB', v: `${C.speakerCableMaxRun(Number(v.awg), v.load, 1)} ft` }]; } },
    { id: 'poe', title: 'PoE budget', sub: 'Device classes against the switch budget', fields: [
        { key: 'n3', label: 'Class 3 devices (15.4 W)', type: 'number', value: 0 }, { key: 'n4', label: 'Class 4 devices (30 W)', type: 'number', value: 0 },
        { key: 'n6', label: 'Class 6 devices (60 W)', type: 'number', value: 0 }, { key: 'n8', label: 'Class 8 devices (90 W)', type: 'number', value: 0 },
        { key: 'budget', label: 'Switch PoE budget (W)', type: 'number', value: 370 }],
      compute(v) { const r = C.poeBudget([{ cls: 3, count: v.n3 || 0 }, { cls: 4, count: v.n4 || 0 }, { cls: 6, count: v.n6 || 0 }, { cls: 8, count: v.n8 || 0 }], v.budget); return [
        { l: 'Total at the ports', v: `${r.totalW} W` }, { l: 'Of switch budget', v: r.pct === null ? '-' : `${r.pct}%`, n: 'PSE class wattage, worst case', tone: r.ok === false ? 'bad' : r.ok ? 'ok' : '' }]; } },
    { id: 'rack', title: 'Rack heat and circuit', sub: 'Watts to BTU/hr and amps against the breaker', fields: [
        { key: 'w', label: 'Continuous draw (W)', type: 'number', value: 1200 }, { key: 'v', label: 'Supply (V)', type: 'select', value: '120', options: ['120', '208', '230', '240'] },
        { key: 'brk', label: 'Breaker (A)', type: 'number', value: 20 }],
      compute(v) { const heat = C.rackHeat(v.w); const c = C.circuitLoad(v.w, Number(v.v), v.brk); return [
        { l: 'Cooling load', v: `${heat.btuHr} BTU/hr`, n: `${heat.tonsAC} tons of AC` }, { l: 'Current', v: `${c.amps} A`, n: `continuous limit ${c.continuousLimitA} A (80% of ${v.brk} A)`, tone: c.ok ? 'ok' : 'bad' }]; } },
    { id: 'subnet', title: 'Subnet', sub: 'Address and prefix to network, range and broadcast; check a second address', fields: [
        { key: 'ip', label: 'IP address', type: 'text', value: '10.20.10.77', mono: true }, { key: 'cidr', label: 'Prefix (/24) or mask', type: 'text', value: '24', mono: true },
        { key: 'ip2', label: 'Second address to check (optional)', type: 'text', value: '', mono: true }],
      compute(v) { let cidr = String(v.cidr).replace('/', '').trim(); if (cidr.includes('.')) cidr = C.maskToCidr(cidr); const s = C.subnet(v.ip, cidr);
        if (!s) return [{ l: 'Check the address and prefix', v: 'invalid', tone: 'bad' }];
        const out = [{ l: 'Network', v: `${s.network}/${s.cidr}`, n: `mask ${s.mask}` }, { l: 'Usable range', v: `${s.first} to ${s.last}`, n: `${s.usable} hosts, broadcast ${s.broadcast}` }];
        if (v.ip2) { const same = C.sameSubnet(v.ip, v.ip2, cidr); out.push({ l: `${v.ip2} on the same subnet`, v: same === null ? 'invalid' : same ? 'yes' : 'no', tone: same ? 'ok' : 'bad' }); }
        return out; } },
    { id: 'levels', title: 'Levels and decibels', sub: 'dBu, dBV and volts; ratios to dB', fields: [
        { key: 'dbu', label: 'dBu', type: 'number', value: 4 }, { key: 'dbv', label: 'dBV', type: 'number', value: -10 }, { key: 'volts', label: 'Volts RMS', type: 'number', value: 1 },
        { key: 'p1', label: 'Power ratio: from (W)', type: 'number', value: 100 }, { key: 'p2', label: 'to (W)', type: 'number', value: 200 }],
      compute(v) { return [{ l: `${v.dbu} dBu`, v: `${C.dbuToVolts(v.dbu)} V` }, { l: `${v.dbv} dBV`, v: `${C.dbvToVolts(v.dbv)} V`, n: `${C.round.r1(v.dbv + 2.21)} dBu` },
        { l: `${v.volts} V`, v: `${C.voltsToDbu(v.volts)} dBu`, n: `${C.voltsToDbv(v.volts)} dBV` }, { l: `${v.p1} W to ${v.p2} W`, v: `${C.dbFromPower(v.p2, v.p1)} dB` }]; } },
    { id: 'convert', title: 'Conversions', sub: 'Inches, feet, pounds, watts', fields: [
        { key: 'inch', label: 'Inches', type: 'number', value: 42 }, { key: 'ft', label: 'Feet', type: 'number', value: 10 }, { key: 'lb', label: 'Pounds', type: 'number', value: 100 }, { key: 'ru', label: 'Rack units', type: 'number', value: 12 }],
      compute(v) { return [{ l: `${v.inch} in`, v: `${C.round.r1(v.inch * 25.4)} mm` }, { l: `${v.ft} ft`, v: `${C.round.r2(v.ft * 0.3048)} m` }, { l: `${v.lb} lb`, v: `${C.round.r1(v.lb * 0.4536)} kg` }, { l: `${v.ru} RU`, v: `${C.rackUnitsInches(v.ru)} in`, n: `${C.round.r1(v.ru * 44.45)} mm` }]; } }
  ];
  const calcValues = {};
  async function renderCalc() {
    if (!state.sub) {
      view.append(h('h2', null, 'Calculators'), h('ul', { class: 'list' }, CALCS.map(c => h('li', null, h('button', { onclick: () => go('calc', c.id) }, h('span', { class: 't' }, h('b', null, c.title), h('span', null, c.sub)), h('span', { class: 'k' }, '\u203A'))))));
      return;
    }
    const c = CALCS.find(x => x.id === state.sub); if (!c) return go('calc');
    const vals = calcValues[c.id] || (calcValues[c.id] = Object.fromEntries(c.fields.map(f => [f.key, f.value])));
    const readout = h('div', { class: 'readout' });
    const update = () => {
      readout.innerHTML = '';
      const v = {}; for (const f of c.fields) { const raw = vals[f.key]; v[f.key] = f.type === 'number' ? (raw === '' || raw === null ? '' : Number(raw)) : raw; }
      let res; try { res = c.compute(v); } catch (e) { res = [{ l: 'Check the inputs', v: '-', tone: 'bad' }]; }
      for (const r of res) readout.append(h('div', { class: 'line ' + (r.tone || '') }, h('span', { class: 'l' }, r.l, r.n ? h('span', { class: 'n' }, r.n) : null), h('span', { class: 'v' }, r.v)));
    };
    const fieldEls = c.fields.map(f => {
      const input = f.type === 'select' ? h('select', { onchange: e => { vals[f.key] = e.target.value; update(); } }, f.options.map(o => h('option', { value: o, selected: String(vals[f.key]) === o ? true : false }, o)))
        : h('input', { type: f.type === 'number' ? 'number' : 'text', inputmode: f.type === 'number' ? 'decimal' : 'text', step: f.step || 'any', value: vals[f.key], class: f.mono ? 'mono' : '', oninput: e => { vals[f.key] = e.target.value; update(); } });
      return h('label', { class: 'field' }, h('span', null, f.label), input);
    });
    const form = c.pairs ? h('div', null, h('div', { class: 'row' }, fieldEls.slice(0, 2)), h('div', { class: 'row' }, fieldEls.slice(2, 4)), h('div', { class: 'row' }, fieldEls.slice(4, 6)), fieldEls.slice(6)) : h('div', null, fieldEls);
    view.append(h('button', { class: 'back', onclick: () => go('calc') }, '\u2039 Calculators'), h('h2', null, c.title), readout, form);
    update();
  }

  // ---------- reference ----------
  const REFS = [
    { id: 'pinout', title: 'RJ45 pinouts and PoE pairs', cols: ['Pin', 'T568A', 'T568B', '10/100', 'PoE'], rows: C.REF.pinout },
    { id: 'poe', title: 'PoE standards and classes', cols: ['Class', 'PSE W', 'PD W', 'Standard'], rows: C.POE.map(p => [String(p.cls), String(p.pse), String(p.pd), p.std]) },
    { id: 'cable', title: 'Category cable', cols: ['Category', 'Bandwidth', 'Reach', 'Typical use'], rows: C.REF.cable },
    { id: 'fiber', title: 'Fiber', cols: ['Type', 'Core (um)', 'Jacket', 'Reach (spec)'], rows: C.REF.fiber },
    { id: 'ports', title: 'Ports and addresses on an AV network', cols: ['Service', 'Port / address', 'Notes'], rows: C.REF.ports, mono: [1] },
    { id: 'subnets', title: 'Subnet cheat sheet', cols: ['CIDR', 'Mask', 'Usable hosts'], rows: C.REF.subnets, mono: [0, 1] },
    { id: 'hdmi', title: 'HDMI versions', cols: ['HDMI', 'Bandwidth', 'Formats', 'Cable'], rows: C.REF.hdmi },
    { id: 'res', title: 'Resolutions', cols: ['Name', 'Pixels', 'Aspect'], rows: C.REF.resolutions },
    { id: 'taps', title: '70 V taps', cols: ['Tap', 'Ohms at 70.7 V'], rows: C.REF.taps },
    { id: 'db', title: 'Decibel facts', cols: ['Change', 'Meaning', 'Note'], rows: C.REF.db },
    { id: 'levels', title: 'Line and mic levels', cols: ['Level', 'dB', 'Volts'], rows: C.REF.levels },
    { id: 'racks', title: 'Rack units', cols: ['Item', 'Value'], rows: C.REF.racks },
    { id: 'serial', title: 'Serial and contact control', cols: ['Interface', 'Wiring', 'Note'], rows: C.REF.serial },
    { id: 'standards', title: 'AVIXA standards', cols: ['Standard', 'Covers'], rows: C.REF.standards },
    { id: 'conv', title: 'Conversions', cols: ['From / to', 'Multiply by'], rows: C.REF.conversions }
  ];
  function refTable(r) {
    return h('div', { class: 'tablewrap' }, h('table', { class: 'ref' }, h('thead', null, h('tr', null, r.cols.map(c => h('th', null, c)))),
      h('tbody', null, r.rows.map(row => h('tr', null, row.map((cell, i) => h('td', { class: (r.mono || []).includes(i) ? 'mono' : '' }, cell)))))));
  }
  async function renderRef() {
    if (state.sub === 'platforms') {
      view.append(h('button', { class: 'back', onclick: () => go('ref') }, '\u2039 Reference'), h('h2', null, 'Platform quick guides'));
      for (const p of C.PLATFORMS) view.append(h('details', { class: 'plat' }, h('summary', null, p.name), h('div', { class: 'body' },
        h('h4', null, 'Tools and where the configuration lives'), h('p', null, p.tool),
        h('h4', null, 'Check first'), h('ol', null, p.first.map(t => h('li', null, t))),
        h('h4', null, 'Five faults and the fix'), h('ul', null, p.faults.map(f => h('li', { class: 'fault' }, h('b', null, f[0]), f[1]))),
        h('h4', null, 'Discovery and ports'), h('ul', null, p.ports.map(t => h('li', null, t))),
        h('h4', null, 'Back up before you leave'), h('ul', null, p.backup.map(t => h('li', null, t))))));
      view.append(h('p', { class: 'muted small' }, 'Ports and behaviours move with firmware. Confirm against the version on site before asking IT to open anything.'));
      return;
    }
    if (state.sub) {
      const r = REFS.find(x => x.id === state.sub); if (!r) return go('ref');
      view.append(h('button', { class: 'back', onclick: () => go('ref') }, '\u2039 Reference'), h('h2', null, r.title), refTable(r));
      return;
    }
    view.append(h('h2', null, 'Reference'), h('ul', { class: 'list' },
      h('li', null, h('button', { onclick: () => go('ref', 'platforms') }, h('span', { class: 't' }, h('b', null, 'Platform quick guides'), h('span', null, 'Q-SYS, Tesira, Shure, Crestron, NVX, AMX, Extron, Dante, Teams Rooms, Zoom Rooms')), h('span', { class: 'k' }, '\u203A'))),
      REFS.map(r => h('li', null, h('button', { onclick: () => go('ref', r.id) }, h('span', { class: 't' }, h('b', null, r.title)), h('span', { class: 'k' }, '\u203A'))))));
  }

  // ---------- images ----------
  function fileToCanvas(file, maxDim) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => { const s = Math.min(1, maxDim / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); res(cv); };
      img.onerror = () => rej(new Error('Could not read the image')); img.src = url;
    });
  }
  const canvasToBlob = (cv, q) => new Promise(res => cv.toBlob(res, 'image/jpeg', q || 0.82));
  function prepForOcr(cv) {
    const out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height; const ctx = out.getContext('2d'); ctx.drawImage(cv, 0, 0);
    const im = ctx.getImageData(0, 0, out.width, out.height); const d = im.data;
    for (let i = 0; i < d.length; i += 4) { const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; const c = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128)); d[i] = d[i + 1] = d[i + 2] = c; }
    ctx.putImageData(im, 0, 0); return out;
  }
  let ocrWorker = null;
  async function ocr(cv, onProgress) {
    await loadScript(CDN.tesseract);
    if (!ocrWorker) ocrWorker = await window.Tesseract.createWorker('eng', 1, { logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); } });
    const { data } = await ocrWorker.recognize(prepForOcr(cv));
    return data.text || '';
  }

  // ---------- jobs helper ----------
  async function ensureJob() {
    const jobs = await DB.all('jobs');
    if (state.jobId && jobs.find(j => j.id === state.jobId)) return jobs.find(j => j.id === state.jobId);
    const last = await S.get('lastJob', null);
    const j = jobs.find(x => x.id === last) || jobs[jobs.length - 1] || null;
    if (j) state.jobId = j.id;
    return j;
  }
  function jobPicker(jobs, current, onChange) {
    return h('label', { class: 'field' }, h('span', null, 'Job'), h('select', { onchange: async e => { state.jobId = Number(e.target.value); await S.set('lastJob', state.jobId); onChange(); } },
      jobs.map(j => h('option', { value: j.id, selected: j.id === current ? true : false }, `${j.number || ''} ${j.client || ''}`.trim() || 'job ' + j.id))));
  }

  // ---------- scan ----------
  const SEV = ['Safety', 'Functional', 'Cosmetic'], PARTY = ['AV', 'GC', 'ELEC', 'IT', 'OWN'], STATUS = ['Open', 'In progress', 'Fixed', 'Verified', 'Closed'];
  async function renderScan() {
    const job = await ensureJob(); const jobs = await DB.all('jobs');
    view.append(h('h2', null, 'Scan'));
    if (!job) { view.append(h('div', { class: 'empty' }, 'Create a job first so scans have somewhere to go.'), h('button', { class: 'btn block', onclick: () => go('rec', 'newjob') }, 'Create a job')); return; }
    view.append(jobPicker(jobs, job.id, () => render()));
    const labelIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: e => { if (e.target.files[0]) labelFlow(e.target.files[0], job); e.target.value = ''; } });
    const pageIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: e => { if (e.target.files[0]) pageFlow(e.target.files[0], job); e.target.value = ''; } });
    const punchIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: e => { if (e.target.files[0]) punchFlow(e.target.files[0], job); e.target.value = ''; } });
    view.append(labelIn, pageIn, punchIn,
      h('button', { class: 'btn block', onclick: () => labelIn.click() }, 'Photograph a device label'),
      h('p', { class: 'muted small' }, 'Reads the serial, MAC, IP and model off the label and starts a device record. Fill the camera frame with the label, straight on, no glare.'),
      h('button', { class: 'btn secondary block', onclick: () => punchIn.click() }, 'Photograph a problem'),
      h('p', { class: 'muted small' }, 'Starts a punch item with the photo attached.'),
      h('button', { class: 'btn secondary block', onclick: () => pageIn.click() }, 'Photograph a field book page'),
      h('p', { class: 'muted small' }, 'Reads the page code and files the page under this job. Box and bubble reading arrives in a later version; the page still travels with the package.'),
      h('div', { class: 'note' }, 'Photos stay on this phone until you send them. The label reader downloads once (about 10 MB) the first time you use it and needs a connection for that.'));
  }
  async function labelFlow(file, job) {
    view.innerHTML = '';
    const cv = await fileToCanvas(file, 1600).catch(err => { toast(err.message); return null; }); if (!cv) return render();
    const bar = h('div', { class: 'progress' }, h('i')); const status = h('p', { class: 'muted small' }, 'Reading the label\u2026');
    view.append(h('h2', null, 'Device label'), h('img', { class: 'preview', src: cv.toDataURL('image/jpeg', 0.7) }), status, bar);
    let text = '';
    try { text = await ocr(cv, p => { bar.firstChild.style.width = Math.round(p * 100) + '%'; }); }
    catch (e) { status.textContent = 'The label reader could not load (offline?). You can still type the details.'; }
    bar.remove();
    const macs = C.extractMacs(text), ips = C.extractIps(text), serials = C.extractSerials(text), model = C.extractModel(text);
    status.textContent = text ? `Found ${macs.length} MAC, ${serials.length} serial candidate${serials.length === 1 ? '' : 's'}, ${ips.length} IP. Tap to fill, then check against the label.` : status.textContent;
    const rec = { jobId: job.id, room: '', name: '', model: model, location: '', serial: serials[0] || '', mac: macs[0] || '', ip: ips[0] || '', vlan: '', switchport: '', note: '', created: Date.now() };
    const photo = await canvasToBlob(cv, 0.75);
    const form = deviceForm(rec, { macs, serials, ips, raw: text }, async r => { r.photo = photo; await DB.put('devices', r); toast('Device saved'); go('rec', 'devices'); });
    view.append(form);
  }
  function chipRow(label, opts, onPick) {
    if (!opts.length) return null;
    return h('div', null, h('span', { class: 'muted small' }, label), h('div', { class: 'chips' }, opts.slice(0, 6).map(o => h('button', { class: 'chip', onclick: () => onPick(o) }, o))));
  }
  function deviceForm(rec, cands, onSave) {
    const f = {};
    const mk = (key, label, mono, placeholder) => { f[key] = h('input', { type: 'text', value: rec[key] || '', class: mono ? 'mono' : '', placeholder: placeholder || '', autocapitalize: mono ? 'characters' : 'sentences' }); return h('label', { class: 'field' }, h('span', null, label), f[key]); };
    const wrap = h('div', null,
      h('div', { class: 'row' }, mk('room', 'Room'), mk('name', 'Device (what it is)', false, 'DSP, display, codec')),
      mk('model', 'Model'), mk('location', 'Location / rack and RU'),
      cands ? chipRow('Serial candidates', cands.serials, v => { f.serial.value = v; }) : null, mk('serial', 'Serial', true),
      cands ? chipRow('MAC candidates', cands.macs, v => { f.mac.value = v; }) : null, mk('mac', 'MAC', true, 'AA:BB:CC:DD:EE:FF'),
      cands ? chipRow('IP candidates', cands.ips, v => { f.ip.value = v; }) : null,
      h('div', { class: 'row' }, mk('ip', 'IP', true), mk('vlan', 'VLAN', true)),
      mk('switchport', 'Switch / port (from LLDP)', true), mk('note', 'Note'),
      cands && cands.raw ? h('details', { class: 'plat' }, h('summary', null, 'Everything the reader saw'), h('div', { class: 'body' }, h('pre', { class: 'pkg' }, cands.raw))) : null,
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => {
        for (const k in f) rec[k] = f[k].value.trim();
        if (rec.mac) { const m = C.normalizeMac(rec.mac); if (!m) return toast('MAC must be 12 hex characters'); rec.mac = m; }
        if (rec.ip && C.ipToInt(rec.ip) === null) return toast('IP address is not valid');
        if (!rec.name && !rec.serial && !rec.mac) return toast('Give it at least a name, serial or MAC');
        onSave(rec);
      } }, 'Save device'), h('button', { class: 'btn secondary', onclick: () => go('rec', 'devices') }, 'Cancel')));
    return wrap;
  }
  async function punchFlow(file, job) {
    const cv = await fileToCanvas(file, 1400).catch(err => { toast(err.message); return null; }); if (!cv) return;
    const photo = await canvasToBlob(cv, 0.75);
    view.innerHTML = ''; view.append(h('h2', null, 'Punch item'), h('img', { class: 'preview', src: cv.toDataURL('image/jpeg', 0.6) }));
    view.append(punchForm({ jobId: job.id, room: '', item: '', severity: 'Functional', party: 'AV', status: 'Open', note: '', created: Date.now() }, async r => { r.photo = photo; await DB.put('punch', r); toast('Punch item saved'); go('rec', 'punch'); }));
  }
  function punchForm(rec, onSave) {
    const room = h('input', { type: 'text', value: rec.room }), item = h('textarea', { value: rec.item, placeholder: 'What is wrong, where, what it needs' }), note = h('input', { type: 'text', value: rec.note || '' });
    const sel = (opts, cur) => h('select', null, opts.map(o => h('option', { value: o, selected: o === cur ? true : false }, o)));
    const sev = sel(SEV, rec.severity), party = sel(PARTY, rec.party), status = sel(STATUS, rec.status);
    return h('div', null, h('label', { class: 'field' }, h('span', null, 'Room'), room), h('label', { class: 'field' }, h('span', null, 'Item'), item),
      h('div', { class: 'row3' }, h('label', { class: 'field' }, h('span', null, 'Severity'), sev), h('label', { class: 'field' }, h('span', null, 'Party'), party), h('label', { class: 'field' }, h('span', null, 'Status'), status)),
      h('label', { class: 'field' }, h('span', null, 'Note'), note),
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => { rec.room = room.value.trim(); rec.item = item.value.trim(); rec.severity = sev.value; rec.party = party.value; rec.status = status.value; rec.note = note.value.trim(); if (!rec.item) return toast('Describe the item'); onSave(rec); } }, 'Save punch item'),
        h('button', { class: 'btn secondary', onclick: () => go('rec', 'punch') }, 'Cancel')));
  }
  async function pageFlow(file, job) {
    const cv = await fileToCanvas(file, 1800).catch(err => { toast(err.message); return null; }); if (!cv) return;
    let code = null;
    try { await loadScript(CDN.jsqr); const ctx = cv.getContext('2d'); const im = ctx.getImageData(0, 0, cv.width, cv.height); const q = window.jsQR(im.data, im.width, im.height); if (q && /^AVFB2\|/.test(q.data)) code = q.data; } catch (e) { /* offline: keep going */ }
    const parts = code ? code.split('|') : [];
    const TEMPLATES = { JD: 'Job Day', RC: 'Room Check', PL: 'Punch List', DR: 'Device Record', SS: 'Site Survey', HO: 'Handover' };
    const rec = { jobId: job.id, template: parts[1] || '', templateName: TEMPLATES[parts[1]] || 'Page', pageNo: parts[4] || '', room: '', note: '', created: Date.now(), photo: await canvasToBlob(cv, 0.8) };
    view.innerHTML = '';
    const room = h('input', { type: 'text' }), note = h('input', { type: 'text' });
    view.append(h('h2', null, code ? `${rec.templateName}${rec.pageNo ? ', page ' + rec.pageNo : ''}` : 'Page photo'), h('img', { class: 'preview', src: cv.toDataURL('image/jpeg', 0.5) }),
      h('p', { class: 'muted small' }, code ? 'Page code read. It is filed under this job and goes into the package.' : 'No page code found. Filed as a plain page photo.'),
      h('label', { class: 'field' }, h('span', null, 'Room (optional)'), room), h('label', { class: 'field' }, h('span', null, 'Note (optional)'), note),
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: async () => { rec.room = room.value.trim(); rec.note = note.value.trim(); await DB.put('pages', rec); toast('Page filed'); go('rec', 'pages'); } }, 'File this page'), h('button', { class: 'btn secondary', onclick: () => go('scan') }, 'Cancel')));
  }

  // ---------- records ----------
  async function renderRecords() {
    const jobs = await DB.all('jobs');
    if (state.sub === 'newjob' || (state.sub && state.sub.startsWith('editjob'))) return jobForm(state.sub === 'newjob' ? null : await DB.get('jobs', Number(state.sub.split(':')[1])));
    const job = await ensureJob();
    if (!jobs.length) { view.append(h('h2', null, 'Records'), h('div', { class: 'empty' }, 'No jobs yet. A job holds its devices, punch items and page photos, and is what you send.'), h('button', { class: 'btn block', onclick: () => go('rec', 'newjob') }, 'Create a job')); return; }
    if (state.sub === 'devices') return devicesScreen(job);
    if (state.sub === 'punch') return punchScreen(job);
    if (state.sub === 'pages') return pagesScreen(job);
    if (state.sub && state.sub.startsWith('device:')) { const d = await DB.get('devices', Number(state.sub.split(':')[1])); view.append(h('button', { class: 'back', onclick: () => go('rec', 'devices') }, '\u2039 Devices'), h('h2', null, 'Edit device'), deviceForm(d, null, async r => { await DB.put('devices', r); toast('Saved'); go('rec', 'devices'); }), h('button', { class: 'btn danger block', onclick: async () => { if (confirm('Delete this device?')) { await DB.del('devices', d.id); go('rec', 'devices'); } } }, 'Delete device')); return; }
    if (state.sub && state.sub.startsWith('punch:')) { const p = await DB.get('punch', Number(state.sub.split(':')[1])); view.append(h('button', { class: 'back', onclick: () => go('rec', 'punch') }, '\u2039 Punch list'), h('h2', null, 'Edit punch item'), punchForm(p, async r => { await DB.put('punch', r); toast('Saved'); go('rec', 'punch'); }), h('button', { class: 'btn danger block', onclick: async () => { if (confirm('Delete this item?')) { await DB.del('punch', p.id); go('rec', 'punch'); } } }, 'Delete item')); return; }
    const [devices, punch, pages] = await Promise.all([DB.byJob('devices', job.id), DB.byJob('punch', job.id), DB.byJob('pages', job.id)]);
    const open = punch.filter(p => p.status !== 'Closed').length;
    view.append(h('h2', null, 'Records'), jobPicker(jobs, job.id, () => render()),
      h('div', { class: 'btns' }, h('button', { class: 'btn secondary', onclick: () => go('rec', 'editjob:' + job.id) }, 'Edit job'), h('button', { class: 'btn secondary', onclick: () => go('rec', 'newjob') }, 'New job')),
      h('ul', { class: 'list' },
        h('li', null, h('button', { onclick: () => go('rec', 'devices') }, h('span', { class: 't' }, h('b', null, `Devices (${devices.length})`), h('span', null, 'Serials, MACs, addresses, switch ports')), h('span', { class: 'k' }, '\u203A'))),
        h('li', null, h('button', { onclick: () => go('rec', 'punch') }, h('span', { class: 't' }, h('b', null, `Punch items (${punch.length}, ${open} open)`), h('span', null, 'Severity, party, status, photos')), h('span', { class: 'k' }, '\u203A'))),
        h('li', null, h('button', { onclick: () => go('rec', 'pages') }, h('span', { class: 't' }, h('b', null, `Field book pages (${pages.length})`), h('span', null, 'Photographed pages filed under this job')), h('span', { class: 'k' }, '\u203A')))),
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => go('send') }, 'Send this job')));
  }
  function jobForm(job) {
    const j = job || { number: '', client: '', site: '', pm: '', created: Date.now() };
    const number = h('input', { type: 'text', value: j.number, class: 'mono', autocapitalize: 'characters' }), client = h('input', { type: 'text', value: j.client }), site = h('input', { type: 'text', value: j.site }), pm = h('input', { type: 'email', value: j.pm || '' });
    view.append(h('button', { class: 'back', onclick: () => go('rec') }, '\u2039 Records'), h('h2', null, job ? 'Edit job' : 'New job'),
      h('label', { class: 'field' }, h('span', null, 'Job number'), number), h('label', { class: 'field' }, h('span', null, 'Client'), client), h('label', { class: 'field' }, h('span', null, 'Site'), site), h('label', { class: 'field' }, h('span', null, 'PM email (for the package)'), pm),
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: async () => { j.number = number.value.trim(); j.client = client.value.trim(); j.site = site.value.trim(); j.pm = pm.value.trim(); if (!j.number && !j.client) return toast('Give the job a number or a client'); const id = await DB.put('jobs', j); state.jobId = j.id || id; await S.set('lastJob', state.jobId); toast(job ? 'Saved' : 'Job created'); go('rec'); } }, job ? 'Save job' : 'Create job'),
        job ? h('button', { class: 'btn danger', onclick: async () => { if (!confirm('Delete this job and everything in it?')) return; for (const s of ['devices', 'punch', 'pages']) { const rows = await DB.byJob(s, job.id); for (const r of rows) await DB.del(s, r.id); } await DB.del('jobs', job.id); state.jobId = null; go('rec'); } }, 'Delete job') : null));
  }
  function thumb(blob) { if (!blob) return h('div', { class: 'thumb' }); const img = h('img', { class: 'thumb', alt: '' }); img.src = URL.createObjectURL(blob); return img; }
  async function devicesScreen(job) {
    const rows = await DB.byJob('devices', job.id);
    view.append(h('button', { class: 'back', onclick: () => go('rec') }, '\u2039 Records'), h('h2', null, `Devices, ${job.number || job.client}`),
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => go('scan') }, 'Photograph a label'), h('button', { class: 'btn secondary', onclick: () => { view.innerHTML = ''; view.append(h('h2', null, 'New device'), deviceForm({ jobId: job.id, created: Date.now() }, null, async r => { await DB.put('devices', r); toast('Device saved'); go('rec', 'devices'); })); } }, 'Type one in')));
    if (!rows.length) return view.append(h('div', { class: 'empty' }, 'No devices yet. Photograph a label to start one.'));
    for (const d of rows) view.append(h('div', { class: 'rec' }, thumb(d.photo), h('div', { class: 't' }, h('b', null, `${d.room ? d.room + ' \u00B7 ' : ''}${d.name || d.model || 'device'}${d.name && d.model ? ' (' + d.model + ')' : ''}`), h('div', { class: 'mono' }, [d.serial ? 'SN ' + d.serial : null, d.mac, d.ip ? d.ip + (d.vlan ? ' VLAN ' + d.vlan : '') : null].filter(Boolean).join('  ')), h('div', { class: 'meta' }, [d.location, d.switchport].filter(Boolean).join(' \u00B7 '))), h('button', { class: 'act', onclick: () => go('rec', 'device:' + d.id) }, 'Edit')));
  }
  async function punchScreen(job) {
    const rows = await DB.byJob('punch', job.id);
    view.append(h('button', { class: 'back', onclick: () => go('rec') }, '\u2039 Records'), h('h2', null, `Punch list, ${job.number || job.client}`),
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => go('scan') }, 'Photograph a problem'), h('button', { class: 'btn secondary', onclick: () => { view.innerHTML = ''; view.append(h('h2', null, 'New punch item'), punchForm({ jobId: job.id, room: '', item: '', severity: 'Functional', party: 'AV', status: 'Open', created: Date.now() }, async r => { await DB.put('punch', r); toast('Saved'); go('rec', 'punch'); })); } }, 'Type one in')));
    if (!rows.length) return view.append(h('div', { class: 'empty' }, 'No punch items. That is either very good or too early.'));
    for (const p of rows) view.append(h('div', { class: 'rec' }, thumb(p.photo), h('div', { class: 't' }, h('b', null, h('span', { class: 'badge ' + p.severity[0] }, p.severity[0]), p.room ? p.room + ': ' : '', p.item), h('div', { class: 'meta' }, `${p.party} \u00B7 ${p.status}${p.note ? ' \u00B7 ' + p.note : ''}`)), h('button', { class: 'act', onclick: () => go('rec', 'punch:' + p.id) }, 'Edit')));
  }
  async function pagesScreen(job) {
    const rows = await DB.byJob('pages', job.id);
    view.append(h('button', { class: 'back', onclick: () => go('rec') }, '\u2039 Records'), h('h2', null, `Field book pages, ${job.number || job.client}`), h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => go('scan') }, 'Photograph a page')));
    if (!rows.length) return view.append(h('div', { class: 'empty' }, 'No pages filed yet.'));
    for (const p of rows) view.append(h('div', { class: 'rec' }, thumb(p.photo), h('div', { class: 't' }, h('b', null, `${p.templateName}${p.pageNo ? ', page ' + p.pageNo : ''}`), h('div', { class: 'meta' }, [p.room, p.note, new Date(p.created).toLocaleDateString()].filter(Boolean).join(' \u00B7 '))), h('button', { class: 'act', onclick: async () => { if (confirm('Remove this page photo?')) { await DB.del('pages', p.id); go('rec', 'pages'); } } }, 'Remove')));
  }

  // ---------- send ----------
  async function renderSend() {
    const job = await ensureJob(); const jobs = await DB.all('jobs');
    view.append(h('h2', null, 'Send to the PM'));
    if (!job) return view.append(h('div', { class: 'empty' }, 'Create a job and add something to it first.'));
    view.append(jobPicker(jobs, job.id, () => render()));
    const [devices, punch, pages] = await Promise.all([DB.byJob('devices', job.id), DB.byJob('punch', job.id), DB.byJob('pages', job.id)]);
    const tech = await S.get('tech', ''); const meta = { date: today(), tech };
    const opt = { devices: true, punch: true, punchPhotos: true, pages: true, labelPhotos: false };
    const toggles = h('div', { class: 'chips' }, Object.keys(opt).map(k => { const b = h('button', { class: 'chip on', onclick: () => { opt[k] = !opt[k]; b.classList.toggle('on', opt[k]); refresh(); } }, { devices: `devices (${devices.length})`, punch: `punch (${punch.length})`, punchPhotos: 'punch photos', pages: `page photos (${pages.length})`, labelPhotos: 'label photos' }[k]); if (!opt[k]) b.classList.remove('on'); return b; }));
    const subj = h('input', { type: 'text', class: 'mono' }); const pre = h('pre', { class: 'pkg' }); const count = h('p', { class: 'muted small' });
    function build() {
      const d = opt.devices ? devices : [], p = opt.punch ? punch : [];
      const text = C.summaryText(job, d, p, meta); const subject = C.subjectLine(job, d, p, meta);
      const files = [];
      if (d.length) files.push(new File([C.toCsv(d, C.DEVICE_COLS)], `${job.number || 'job'}-devices.csv`, { type: 'text/csv' }));
      if (p.length) files.push(new File([C.toCsv(p, C.PUNCH_COLS)], `${job.number || 'job'}-punch.csv`, { type: 'text/csv' }));
      if (opt.punchPhotos) p.forEach((it, i) => { if (it.photo) files.push(new File([it.photo], `punch-${String(i + 1).padStart(2, '0')}-${(it.room || 'room').replace(/[^\w-]/g, '_')}.jpg`, { type: 'image/jpeg' })); });
      if (opt.pages) pages.forEach((pg, i) => { if (pg.photo) files.push(new File([pg.photo], `page-${(pg.template || 'photo').toLowerCase()}${pg.pageNo ? '-' + pg.pageNo : ''}-${i + 1}.jpg`, { type: 'image/jpeg' })); });
      if (opt.labelPhotos) d.forEach((dv, i) => { if (dv.photo) files.push(new File([dv.photo], `label-${String(i + 1).padStart(2, '0')}-${(dv.serial || dv.name || 'device').replace(/[^\w-]/g, '_')}.jpg`, { type: 'image/jpeg' })); });
      return { text, subject, files };
    }
    let pkg;
    function refresh() { pkg = build(); subj.value = pkg.subject; pre.textContent = pkg.text; count.textContent = `${pkg.files.length} attachment${pkg.files.length === 1 ? '' : 's'}: ${pkg.files.map(f => f.name).join(', ') || 'none'}`; }
    const shareBtn = h('button', { class: 'btn block', onclick: async () => {
      const data = { title: subj.value, text: pkg.text, files: pkg.files };
      if (navigator.canShare && navigator.canShare({ files: pkg.files }) && navigator.share) { try { await navigator.share(data); } catch (e) { if (e.name !== 'AbortError') toast('Sharing failed: ' + e.message); } }
      else if (navigator.share) { try { await navigator.share({ title: subj.value, text: pkg.text }); toast('Shared text only; download the files below'); } catch (e) { if (e.name !== 'AbortError') toast('Sharing failed'); } }
      else toast('This browser cannot share files. Use the buttons below.');
    } }, 'Share package (Mail, Teams, Files)');
    const mailBtn = h('a', { class: 'btn secondary block', href: '#', onclick: e => { e.preventDefault(); location.href = `mailto:${encodeURIComponent(job.pm || '')}?subject=${encodeURIComponent(subj.value)}&body=${encodeURIComponent(pkg.text)}`; } }, 'Email the text (attachments separate)');
    const copyBtn = h('button', { class: 'btn secondary block', onclick: async () => { try { await navigator.clipboard.writeText(`${subj.value}\n\n${pkg.text}`); toast('Copied'); } catch (e) { toast('Copy failed; select the text instead'); } } }, 'Copy text for Teams');
    const zipBtn = h('button', { class: 'btn secondary block', onclick: async () => {
      try { await loadScript(CDN.jszip); const z = new window.JSZip(); z.file('summary.txt', `${subj.value}\n\n${pkg.text}`); pkg.files.forEach(f => z.file(f.name, f)); const blob = await z.generateAsync({ type: 'blob' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(job.number || 'job').replace(/[^\w-]/g, '_')}-${today()}.zip`; document.body.append(a); a.click(); a.remove(); }
      catch (e) { toast('Zip needs a connection the first time'); } } }, 'Download everything as a .zip');
    view.append(toggles, h('label', { class: 'field' }, h('span', null, 'Subject'), subj), pre, count, shareBtn, mailBtn, copyBtn, zipBtn,
      h('div', { class: 'btns' }, h('button', { class: 'btn secondary', onclick: () => { const f = pkg.files.find(x => x.name.endsWith('devices.csv')); if (!f) return toast('No devices in this job'); dl(f); } }, 'Devices .csv'), h('button', { class: 'btn secondary', onclick: () => { const f = pkg.files.find(x => x.name.endsWith('punch.csv')); if (!f) return toast('No punch items in this job'); dl(f); } }, 'Punch .csv')),
      h('p', { class: 'muted small' }, 'The .csv files open straight into Excel on OneDrive. The share sheet sends text and files together into Mail or Teams on a phone; on a desktop browser use the downloads.'));
    refresh();
  }
  function dl(file) { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.append(a); a.click(); a.remove(); }

  // ---------- settings ----------
  async function renderSettings() {
    const tech = h('input', { type: 'text', value: await S.get('tech', '') }), company = h('input', { type: 'text', value: await S.get('company', '') });
    const key = h('input', { type: 'text', class: 'mono', value: await S.get('licenseKey', ''), placeholder: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX' });
    const pro = await S.get('pro', false);
    view.append(h('h2', null, 'Settings'),
      h('label', { class: 'field' }, h('span', null, 'Your name or initials (goes on the package)'), tech), h('label', { class: 'field' }, h('span', null, 'Company'), company),
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: async () => { await S.set('tech', tech.value.trim()); await S.set('company', company.value.trim()); toast('Saved'); } }, 'Save')),
      h('h3', null, PRO_REQUIRED ? (pro ? 'License: active' : 'License') : 'License (not required in this build)'),
      h('label', { class: 'field' }, h('span', null, 'License key from your purchase email'), key),
      h('div', { class: 'btns' }, h('button', { class: 'btn secondary', onclick: async () => {
        const k = key.value.trim(); if (!k) return toast('Paste the key first');
        const r = await window.License.verify(k, PUBLIC_KEY, PRODUCT);
        if (r.valid) { await S.set('pro', true); await S.set('licenseKey', k); toast('Licence active'); go('settings'); } else toast(r.reason); } }, 'Activate')),
      h('h3', null, 'Install on your phone'),
      h('p', { class: 'muted small' }, 'iPhone: open this page in Safari, tap Share, then Add to Home Screen. Android: use the Install button at the top, or the browser menu, Add to Home screen. Once installed it works without a connection, except the label reader on first use.'),
      h('h3', null, 'Your data'),
      h('p', { class: 'muted small' }, 'Jobs, devices, punch items and photos live in this browser on this phone. Nothing is uploaded anywhere until you share it. Clearing the browser site data removes everything, so send a package before you do.'),
      h('div', { class: 'btns' }, h('button', { class: 'btn danger', onclick: async () => { if (confirm('Delete every job, device, punch item and photo on this phone?')) { await DB.clearAll(); S.cache = {}; state.jobId = null; toast('Cleared'); go('calc'); } } }, 'Delete all data')),
      h('h3', null, 'Updates'),
      h('p', { class: 'muted small' }, `This page is AV Field Tools ${APP_VERSION}. If the number does not match what was uploaded, use the button.`),
      h('div', { class: 'btns' }, h('button', { class: 'btn secondary', onclick: async () => { toast('Fetching the latest files'); try { const keys = await caches.keys(); for (const k of keys) await caches.delete(k); if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); for (const r of regs) await r.unregister(); } for (const u of ['./', './index.html', './app.js', './core.js', './license.js', './sw.js']) { try { await fetch(u, { cache: 'reload' }); } catch (e) { /* offline */ } } } catch (e) { /* fall through */ } location.replace(location.pathname + '?r=' + Date.now()); } }, 'Check for updates and reload')),
      h('p', { class: 'muted small' }, `AV Field Tools ${APP_VERSION}`));
  }

  // ---------- PWA ----------
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#installBtn').hidden = true; });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

  // ---------- init ----------
  render();
})();
