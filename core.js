/* AV Field Tools - core: pure functions and reference data. No DOM. Tested with node (test.js). */
(function (root) {
  'use strict';
  const C = {};

  // ---------- helpers ----------
  const r1 = (x) => Math.round(x * 10) / 10;
  const r2 = (x) => Math.round(x * 100) / 100;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  C.round = { r1, r2, r3 };

  // ---------- display and projection ----------
  C.ASPECTS = { '16:9': 16 / 9, '16:10': 16 / 10, '4:3': 4 / 3, '21:9': 21 / 9 };
  C.diagToWH = function (diag, aspect) {
    const a = typeof aspect === 'number' ? aspect : C.ASPECTS[aspect];
    const h = diag / Math.sqrt(a * a + 1);
    return { w: r1(h * a), h: r1(h) };
  };
  C.whToDiag = function (w, h) { return r1(Math.sqrt(w * w + h * h)); };
  // legacy 4-6-8 rule: farthest viewer distance from image height
  C.viewingDistances = function (imageH) {
    return { analytical: r1(imageH * 4), basic: r1(imageH * 6), passive: r1(imageH * 8) };
  };
  // element height check: angle subtended by the smallest element at a viewer distance (same units)
  C.elementArcMinutes = function (elementH, distance) {
    return r1(Math.atan(elementH / distance) * 180 / Math.PI * 60);
  };
  C.elementVerdict = function (arcmin) {
    if (arcmin >= 15) return 'comfortable';
    if (arcmin >= 9) return 'marginal';
    return 'too small';
  };
  C.throwDistance = function (ratio, imageW) { return r1(ratio * imageW); };
  C.imageWidthFromThrow = function (ratio, distance) { return r1(distance / ratio); };
  C.throwRange = function (minRatio, maxRatio, imageW) {
    return { min: r1(minRatio * imageW), max: r1(maxRatio * imageW) };
  };

  // ---------- video bandwidth ----------
  // approximate CVT-RB blanking; TMDS 8b/10b overhead below 2.1 (FRL uses 16b/18b)
  C.hdmiBandwidth = function (w, h, fps, bpc, chroma) {
    const hTotal = w * 1.08, vTotal = h * 1.035;
    const chromaFactor = chroma === '4:2:0' ? 1.5 : chroma === '4:2:2' ? 2 : 3;
    const raw = hTotal * vTotal * fps * bpc * chromaFactor;
    const tmds = raw * 10 / 8;
    const gbps = r2(tmds / 1e9);
    let rating = 'Ultra High Speed (48 Gb/s)';
    if (gbps <= 10.2) rating = 'High Speed (10.2 Gb/s)';
    else if (gbps <= 18) rating = 'Premium High Speed (18 Gb/s)';
    else if (gbps > 48) rating = 'Exceeds HDMI 2.1 FRL (48 Gb/s)';
    return { gbps, rating };
  };

  // ---------- audio ----------
  C.tapImpedance = function (watts, lineV) { return r1((lineV || 70.7) * (lineV || 70.7) / watts); };
  C.line70Load = function (taps, ampWatts) {
    const total = taps.reduce((s, t) => s + t.count * t.watts, 0);
    const pct = ampWatts ? Math.round(total / ampWatts * 100) : null;
    return { total, pct, ok: pct === null ? null : pct <= 80, minAmp: Math.ceil(total / 0.8) };
  };
  C.splAtDistance = function (spl1, d1, d2) { return r1(spl1 - 20 * Math.log10(d2 / d1)); };
  // amplifier power needed for a target SPL at distance (m) given sensitivity (dB 1W/1m), with headroom dB
  C.powerForSpl = function (targetSpl, distanceM, sensitivity, headroomDb) {
    const needed = targetSpl + 20 * Math.log10(distanceM) + (headroomDb || 0) - sensitivity;
    return r1(Math.pow(10, needed / 10));
  };
  C.dbFromPower = function (p2, p1) { return r1(10 * Math.log10(p2 / p1)); };
  C.dbFromVoltage = function (v2, v1) { return r1(20 * Math.log10(v2 / v1)); };
  C.dbuToVolts = function (dbu) { return r3(0.7746 * Math.pow(10, dbu / 20)); };
  C.dbvToVolts = function (dbv) { return r3(Math.pow(10, dbv / 20)); };
  C.voltsToDbu = function (v) { return r1(20 * Math.log10(v / 0.7746)); };
  C.voltsToDbv = function (v) { return r1(20 * Math.log10(v)); };
  C.AWG_OHM_PER_KFT = { 10: 0.999, 12: 1.588, 14: 2.525, 16: 4.016, 18: 6.385, 20: 10.15, 22: 16.14, 24: 25.67 };
  C.speakerCableLoss = function (awg, lengthFt, loadOhms) {
    const r = C.AWG_OHM_PER_KFT[awg] * 2 * lengthFt / 1000; // round trip
    const loss = r1(-20 * Math.log10(loadOhms / (loadOhms + r)));
    const powerLostPct = Math.round((1 - Math.pow(loadOhms / (loadOhms + r), 2)) * 100);
    return { cableOhms: r2(r), lossDb: loss, powerLostPct };
  };
  C.speakerCableMaxRun = function (awg, loadOhms, lossDb) {
    const ratio = Math.pow(10, -(lossDb || 0.5) / 20);
    const rRound = loadOhms * (1 / ratio - 1);
    return Math.floor(rRound / 2 / C.AWG_OHM_PER_KFT[awg] * 1000);
  };

  // ---------- power and racks ----------
  C.POE = [
    { cls: 0, pse: 15.4, pd: 12.95, std: '802.3af' }, { cls: 1, pse: 4.0, pd: 3.84, std: '802.3af' },
    { cls: 2, pse: 7.0, pd: 6.49, std: '802.3af' }, { cls: 3, pse: 15.4, pd: 12.95, std: '802.3af' },
    { cls: 4, pse: 30, pd: 25.5, std: '802.3at' }, { cls: 5, pse: 45, pd: 40, std: '802.3bt' },
    { cls: 6, pse: 60, pd: 51, std: '802.3bt' }, { cls: 7, pse: 75, pd: 62, std: '802.3bt' }, { cls: 8, pse: 90, pd: 71.3, std: '802.3bt' }];
  C.poeBudget = function (devices, switchBudgetW) {
    // devices: [{cls, count}]
    let total = 0;
    devices.forEach(d => { const c = C.POE.find(p => p.cls === Number(d.cls)); if (c) total += c.pse * d.count; });
    total = r1(total);
    return { totalW: total, budgetW: switchBudgetW, ok: switchBudgetW ? total <= switchBudgetW : null, pct: switchBudgetW ? Math.round(total / switchBudgetW * 100) : null };
  };
  C.rackHeat = function (watts) { return { btuHr: Math.round(watts * 3.412), kcalHr: Math.round(watts * 0.86), tonsAC: r2(watts * 3.412 / 12000) }; };
  C.circuitLoad = function (watts, volts, breakerA) {
    const amps = r1(watts / volts);
    const cont = r1(breakerA * 0.8);
    return { amps, continuousLimitA: cont, ok: amps <= cont, pct: Math.round(amps / cont * 100) };
  };
  C.rackUnitsInches = function (ru) { return r2(ru * 1.75); };

  // ---------- networking ----------
  C.ipToInt = function (ip) {
    const p = String(ip).trim().split('.');
    if (p.length !== 4) return null;
    let n = 0;
    for (const s of p) { if (!/^\d{1,3}$/.test(s) || Number(s) > 255) return null; n = n * 256 + Number(s); }
    return n;
  };
  C.intToIp = function (n) { return [24, 16, 8, 0].map(s => (n >>> s) & 255).join('.'); };
  C.subnet = function (ip, cidr) {
    const n = C.ipToInt(ip); const bits = Number(cidr);
    if (n === null || !(bits >= 0 && bits <= 32)) return null;
    const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
    const net = (n & mask) >>> 0; const bcast = (net | (~mask >>> 0)) >>> 0;
    const usable = bits >= 31 ? (bits === 31 ? 2 : 1) : Math.max(0, bcast - net - 1);
    return { network: C.intToIp(net), mask: C.intToIp(mask), broadcast: C.intToIp(bcast), first: C.intToIp(bits >= 31 ? net : net + 1), last: C.intToIp(bits >= 31 ? bcast : bcast - 1), usable, cidr: bits };
  };
  C.sameSubnet = function (ipA, ipB, cidr) {
    const a = C.subnet(ipA, cidr), b = C.subnet(ipB, cidr);
    return a && b ? a.network === b.network : null;
  };
  C.maskToCidr = function (mask) {
    const n = C.ipToInt(mask); if (n === null) return null;
    const b = n.toString(2); if (/01/.test(b)) return null;
    return b.split('1').length - 1;
  };

  // ---------- OCR post-processing ----------
  const HEX_FIX = { O: '0', o: '0', Q: '0', D: '0', I: '1', l: '1', '|': '1', S: '5', s: '5', B: '8', Z: '2', z: '2', G: '6' };
  C.normalizeMac = function (raw) {
    let s = String(raw).replace(/[^0-9A-Za-z]/g, '');
    if (s.length !== 12) return null;
    s = s.split('').map(ch => /[0-9A-Fa-f]/.test(ch) ? ch : (HEX_FIX[ch] || ch)).join('').toUpperCase();
    if (!/^[0-9A-F]{12}$/.test(s)) return null;
    return s.match(/.{2}/g).join(':');
  };
  C.extractMacs = function (text) {
    const out = new Set();
    const re = /\b([0-9A-Za-z]{2}[:\-\s.]?){5}[0-9A-Za-z]{2}\b/g;
    let m;
    const t = String(text);
    while ((m = re.exec(t)) !== null) {
      const mac = C.normalizeMac(m[0]);
      if (mac && !/^00:00:00/.test(mac)) out.add(mac);
    }
    // 12-char runs without separators that look hex-ish
    (t.match(/\b[0-9A-Fa-f]{12}\b/g) || []).forEach(s => { const mac = C.normalizeMac(s); if (mac) out.add(mac); });
    return [...out];
  };
  C.extractIps = function (text) {
    const out = new Set();
    (String(text).match(/\b\d{1,3}(\.\d{1,3}){3}\b/g) || []).forEach(ip => { if (C.ipToInt(ip) !== null) out.add(ip); });
    return [...out];
  };
  C.extractSerials = function (text) {
    const t = String(text).replace(/[\r\n]+/g, '\n');
    const out = [];
    const seen = new Set();
    const push = (v, score) => { const k = v.toUpperCase(); if (!seen.has(k) && v.length >= 6) { seen.add(k); out.push({ value: v, score }); } };
    // keyword-led: S/N, SN, Serial, Ser. No
    const kw = /(?:S\s*\/\s*N|S\.?N\.?|SERIAL(?:\s*(?:NO|NUMBER|#))?|SER\.?\s*NO\.?)\s*[:#.]?\s*([A-Z0-9\-]{6,})/gi;
    let m;
    while ((m = kw.exec(t)) !== null) push(m[1], 3);
    // generic: tokens with letters and digits, 7 to 24 chars, not a MAC or IP
    (t.match(/\b[A-Z0-9][A-Z0-9\-]{6,23}\b/gi) || []).forEach(tok => {
      if (/[A-Za-z]/.test(tok) && /\d/.test(tok) && !C.normalizeMac(tok) && C.ipToInt(tok) === null) push(tok, 1);
    });
    return out.sort((a, b) => b.score - a.score).map(o => o.value);
  };
  C.extractModel = function (text) {
    const lines = String(text).split(/\n/);
    for (const l of lines) { const m = l.match(/(?:MODEL|MDL|TYPE|P\/N|PN)\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-\/ ]{2,30})/i); if (m) return m[1].trim(); }
    return '';
  };

  // ---------- package builders ----------
  C.csvEscape = function (v) { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  C.toCsv = function (rows, cols) {
    return [cols.map(c => C.csvEscape(c.label)).join(',')].concat(rows.map(r => cols.map(c => C.csvEscape(r[c.key])).join(','))).join('\n');
  };
  C.DEVICE_COLS = [{ key: 'room', label: 'Room' }, { key: 'name', label: 'Device' }, { key: 'model', label: 'Model' }, { key: 'location', label: 'Location' }, { key: 'serial', label: 'Serial' }, { key: 'mac', label: 'MAC' }, { key: 'ip', label: 'IP' }, { key: 'vlan', label: 'VLAN' }, { key: 'switchport', label: 'Switch / Port' }, { key: 'note', label: 'Note' }];
  C.PUNCH_COLS = [{ key: 'room', label: 'Room' }, { key: 'item', label: 'Item' }, { key: 'severity', label: 'Severity' }, { key: 'party', label: 'Party' }, { key: 'status', label: 'Status' }, { key: 'note', label: 'Note' }];
  C.summaryText = function (job, devices, punch, meta) {
    const d = meta && meta.date ? meta.date : new Date().toISOString().slice(0, 10);
    const open = punch.filter(p => p.status !== 'Closed');
    const lines = [];
    lines.push(`Job ${job.number || '-'} | ${job.client || ''}${job.site ? ' | ' + job.site : ''} | ${d}${meta && meta.tech ? ' | ' + meta.tech : ''}`);
    lines.push(`Devices: ${devices.length}   Punch items: ${punch.length} (${open.length} open, ${open.filter(p => p.severity === 'Safety').length} safety)`);
    if (devices.length) {
      lines.push(''); lines.push('DEVICES');
      devices.forEach(v => lines.push(`- ${v.room ? v.room + ' | ' : ''}${v.name || ''}${v.model ? ' ' + v.model : ''} | ${v.location || ''} | SN ${v.serial || '-'} | MAC ${v.mac || '-'} | IP ${v.ip || '-'}${v.vlan ? ' VLAN ' + v.vlan : ''}${v.switchport ? ' | ' + v.switchport : ''}`));
    }
    if (punch.length) {
      lines.push(''); lines.push('PUNCH LIST');
      punch.forEach(p => lines.push(`- [${(p.severity || 'F')[0]}] ${p.room ? p.room + ': ' : ''}${p.item} (${p.party || '-'}, ${p.status || 'Open'})`));
    }
    return lines.join('\n');
  };
  C.subjectLine = function (job, devices, punch, meta) {
    const d = meta && meta.date ? meta.date : new Date().toISOString().slice(0, 10);
    const open = punch.filter(p => p.status !== 'Closed').length;
    const parts = [`Job ${job.number || '-'}`];
    if (job.site) parts.push(job.site);
    parts.push(d);
    if (devices.length) parts.push(`${devices.length} devices`);
    if (punch.length) parts.push(`${open} open punch`);
    return parts.join(' | ');
  };

  // ---------- reference data ----------
  C.REF = {
    pinout: [['1', 'White/Green', 'White/Orange', 'TX+', 'A'], ['2', 'Green', 'Orange', 'TX-', 'A'], ['3', 'White/Orange', 'White/Green', 'RX+', 'A'], ['4', 'Blue', 'Blue', '-', 'B+'], ['5', 'White/Blue', 'White/Blue', '-', 'B+'], ['6', 'Orange', 'Green', 'RX-', 'A'], ['7', 'White/Brown', 'White/Brown', '-', 'B-'], ['8', 'Brown', 'Brown', '-', 'B-']],
    cable: [['Cat 5e', '100 MHz', '1G 100 m; 2.5G only above that', 'Legacy control, 100 Mb devices'], ['Cat 6', '250 MHz', '1G 100 m; 10G to 55 m', 'HDBaseT short runs, general LAN'], ['Cat 6A', '500 MHz', '10G 100 m', 'HDBaseT, AV-over-IP, PoE++'], ['Cat 7 / 7A', '600 / 1000 MHz', '10G 100 m', 'Shielded, high-EMI spaces']],
    fiber: [['OM1', '62.5/125', 'Orange', '1G 275 m, 10G 33 m'], ['OM2', '50/125', 'Orange', '1G 550 m, 10G 82 m'], ['OM3', '50/125', 'Aqua', '1G 550 m, 10G 300 m'], ['OM4', '50/125', 'Aqua / violet', '1G 550 m, 10G 400 m'], ['OS2', '9/125', 'Yellow', '10G 10 km']],
    ports: [['mDNS / Bonjour', 'UDP 5353, 224.0.0.251', 'Discovery for Dante, Q-SYS, NVX, NDI, AirPlay'], ['PTP clock', 'UDP 319 / 320, 224.0.1.129', 'Dante and AES67 clocking'], ['LLDP', 'MAC 01:80:C2:00:00:0E', 'Switch name and port at the drop'], ['CDP', 'MAC 01:00:0C:CC:CC:CC', 'Cisco equivalent; Windows also sends LLDP'], ['Dante audio', 'UDP 4321, 14336-14600', 'Multicast and unicast flows'], ['Dante control', 'UDP 4440-4455, 8700-8708, 8751', 'Controller and device control'], ['Q-SYS QRC', 'TCP 1710', 'Third-party control of a Core'], ['Crestron CIP', 'TCP 41794 (secure 41796)', 'Panels and processors'], ['AMX ICSP', 'TCP/UDP 1319', 'Masters and panels'], ['Extron SIS', 'Telnet 23, SSH 22023', 'Device control'], ['Shure', 'TCP 2202', 'Command strings'], ['Biamp TTP', 'Telnet 23, SSH 22', 'Tesira text protocol'], ['SNMP', 'UDP 161 / 162', 'Monitoring'], ['NTP', 'UDP 123', 'Time; certificates and calendars break without it'], ['DHCP / DNS', 'UDP 67-68 / 53', '169.254.x.x = no DHCP reply'], ['Teams media', 'UDP 3478-3481', 'Transport relays'], ['Zoom media', 'UDP 8801-8810', 'Falls back to TCP 443']],
    subnets: [['/16', '255.255.0.0', '65,534'], ['/20', '255.255.240.0', '4,094'], ['/22', '255.255.252.0', '1,022'], ['/23', '255.255.254.0', '510'], ['/24', '255.255.255.0', '254'], ['/25', '255.255.255.128', '126'], ['/26', '255.255.255.192', '62'], ['/27', '255.255.255.224', '30'], ['/28', '255.255.255.240', '14'], ['/29', '255.255.255.248', '6'], ['/30', '255.255.255.252', '2']],
    hdmi: [['1.4', '10.2 Gb/s', '1080p60, 4K30', 'High Speed'], ['2.0', '18 Gb/s', '4K60 4:4:4 8-bit, HDR', 'Premium High Speed'], ['2.1', '48 Gb/s', '4K120, 8K60, eARC', 'Ultra High Speed']],
    resolutions: [['XGA', '1024 x 768', '4:3'], ['WXGA', '1280 x 800', '16:10'], ['720p', '1280 x 720', '16:9'], ['1080p', '1920 x 1080', '16:9'], ['WUXGA', '1920 x 1200', '16:10'], ['QHD', '2560 x 1440', '16:9'], ['UHD 4K', '3840 x 2160', '16:9'], ['DCI 4K', '4096 x 2160', '17:9']],
    taps: [['0.5 W', '10,000'], ['1 W', '5,000'], ['2 W', '2,500'], ['5 W', '1,000'], ['10 W', '500'], ['15 W', '333'], ['25 W', '200'], ['50 W', '100'], ['100 W', '50'], ['200 W', '25']],
    db: [['+3 dB', 'x2 power', 'Barely noticeable'], ['+6 dB', 'x2 voltage', 'Half the distance to a point source'], ['+10 dB', 'x10 power', 'About twice as loud'], ['+20 dB', 'x10 voltage', ''], ['-6 dB per doubling of distance', '', '100 dB at 1 m = 94 at 2 m, 88 at 4 m']],
    levels: [['Pro line', '+4 dBu', '1.228 V'], ['Consumer line', '-10 dBV', '0.316 V'], ['Mic level', '-60 to -40 dBu', '1 to 10 mV'], ['0 dBu', '0.775 V', '1 mW into 600 ohms']],
    racks: [['1 RU', '1.75 in / 44.45 mm'], ['12 RU', '21 in'], ['24 RU', '42 in'], ['42 RU', '73.5 in'], ['45 RU', '78.75 in'], ['Rail hole centers', '18.31 in / 465 mm'], ['Hole pattern', '5/8, 5/8, 1/2 in repeating']],
    serial: [['RS-232 DB9 (DTE)', 'Pin 2 RX, 3 TX, 5 GND', 'Swap 2/3 between two DTE devices'], ['RS-232 3.5 mm', 'Tip TX, ring RX, sleeve GND (varies)', 'Check the manual'], ['RS-485 / 422', 'A/B twisted pair, ground reference', '120 ohm termination on long runs'], ['IR', 'TTL or 38 kHz modulated', 'Confirm modulated vs demodulated'], ['Contact closure', 'Dry contact, N.O. or N.C.', 'Confirm sense voltage']],
    standards: [['ANSI/AVIXA 10', 'Performance verification (APV)'], ['ANSI/AVIXA V202.01', 'Display image size (DISCAS)'], ['ANSI/AVIXA V201.01', 'Image system contrast ratio: passive 7:1, basic 15:1, analytical 50:1, video 80:1'], ['ANSI/AVIXA A102.01', 'Audio coverage uniformity: 6 dB window'], ['ANSI/AVIXA F502.01 / .02', 'Rack building / rack design'], ['ANSI/AVIXA F501.01', 'Cable labeling'], ['ANSI/AVIXA 2M', 'Design and coordination processes']],
    conversions: [['inches to mm', '25.4'], ['feet to meters', '0.3048'], ['pounds to kg', '0.4536'], ['watts to BTU/hr', '3.412'], ['ft-lb to N-m', '1.356']]
  };
  C.PLATFORMS = [{"name": "Q-SYS (QSC)", "tool": "Q-SYS Designer, at the same version as the Core firmware. Core Manager web UI at the Core's IP for network, users, firmware and status. Q-SYS Reflect for remote monitoring.", "first": ["Designer version equals Core firmware version. A mismatch blocks Save to Core and Run; update one to match the other before anything else.", "Which Core port you are on. LAN A carries Q-LAN audio and peripherals; control PCs and third-party devices must reach the interface the design expects.", "Core Manager > Status: PTP clock, peripheral status and alerts, before you open the design."], "faults": [["Peripherals (touch panels, I/O frames, amps) show missing in Designer", "Same subnet as the Core's LAN A? Inventory names match? After a Core update the Core pushes firmware to peripherals; wait for it to finish."], ["Audio dropouts or clicks on Q-LAN", "IGMP snooping with a querier on every switch, EEE off, QoS DSCP per the Q-SYS network guide, and one PTP grand master. Dante or AES67 on the same VLAN can fight for clock leader."], ["Touch panel UCI blank or stuck connecting", "Panel points at the Core's IP and the right design; the UCI is assigned to that panel in the design; the design is Running, not Emulating."], ["Third-party control cannot connect", "QRC is TCP 1710 on the Core. External control needs the control PIN and the Named Controls exposed in the design."], ["Design runs but no audio at the outputs", "Meter block by block from input to output: mutes and gain on the output block, analog/AES routing, and the amplifier's own input select."]], "ports": ["QRC control: TCP 1710", "Core Manager: HTTPS/HTTP at the Core IP", "Q-LAN audio: multicast with PTPv2 (IEEE 1588-2008) on LAN A", "Discovery: same subnet as LAN A, or add the Core by IP in Designer"], "backup": ["The .qsys design file, dated", "Core Manager settings (network, users)", "Core firmware and Designer version in the handover"]}, {"name": "Biamp Tesira", "tool": "Tesira software; the device firmware must match the software's bundled firmware. Biamp Launch for automatic setup on Parle and TesiraFORTE X systems.", "first": ["Device appears in Tesira's Network Discovery. The control port and the AVB or Dante ports are separate networks on most units; you talk to the control port.", "Firmware on the device vs the Tesira software version; update from Device Maintenance before loading a file.", "System audit after sending the configuration: no red items."], "faults": [["Device not found in Network Discovery", "Laptop on the same subnet as the control port. Discovery uses broadcast and will not cross VLANs; add the device by IP if routed."], ["AVB stream will not connect between units", "AVB needs an AVB-capable switch with gPTP and MSRP enabled on every port in the path, and the units in the same AVB domain. Unmanaged switches do not pass AVB."], ["Dante card visible in Dante Controller but no audio", "Subscriptions in Dante Controller, then the Dante input and output blocks in the Tesira file; sample rate and clock leader must agree."], ["Configuration will not send", "Compile errors, DSP resource over-allocation, or a device in the file that is not on the network. Read the Send Configuration log."], ["Control system commands ignored", "Tesira Text Protocol over Telnet TCP 23 or SSH TCP 22; instance tags must match the file exactly; the system must be in a running state."]], "ports": ["TTP control: Telnet TCP 23, SSH TCP 22", "Web page: HTTP at the device IP", "AVB: gPTP and MSRP on AVB-capable switches", "Dante (when fitted): standard Dante ports"], "backup": ["The .tmf file and an export of the equipment table", "Firmware and software versions", "Screenshot of each device's network settings page"]}, {"name": "Shure (MXA arrays, IntelliMix, wireless)", "tool": "Shure Designer for configuration, coverage and routing; Shure Update Utility for firmware; Wireless Workbench for RF coordination; Shure Web Device Discovery to find devices on the network.", "first": ["Every Shure device visible in Designer on the same firmware family; mixed firmware breaks routing and Designer features.", "Dante: device names and subscriptions in Dante Controller; encryption settings must match across every device in the path.", "Wireless: scan the RF environment on site in Wireless Workbench before coordinating, and coordinate against everything else in the building."], "faults": [["MXA array picks up the wrong area", "Set coverage lobes or automatic coverage in Designer; add exclusion zones over displays and HVAC; check the array's mounting orientation mark."], ["Echo or double talk on calls", "The IntelliMix AEC reference (P300, ANIUSB, MXA IntelliMix) must be the far-end audio, not the room mix; check the reference routing in Designer."], ["Wireless dropouts", "Coordinate in Workbench from the site scan, place antennas with line of sight to the stage, and check for TV or other systems on the same bands."], ["Device not found in Designer", "Same subnet as the device's control interface; Shure Web Device Discovery to find the IP; mDNS must be allowed on the switch."], ["Dante audio missing", "Subscriptions, clock and encryption mismatch in Dante Controller; run Dante Updater after the Shure firmware update."]], "ports": ["Shure command strings: TCP 2202", "Web UI: HTTP at the device IP", "Discovery: mDNS via Shure Web Device Discovery", "Audio: Dante"], "backup": ["Designer project and each device's settings export", "Wireless Workbench show file with the coordinated frequencies", "Firmware version per device"]}, {"name": "Crestron control (3-Series and 4-Series)", "tool": "Crestron Toolbox for discovery, Text Console, firmware and program loads. SIMPL Windows, SIMPL# or Construct for the program; VT Pro-e or CH5 for panels. XiO Cloud for fleet management.", "first": ["Processor reachable in Toolbox (Ethernet Autodiscovery). On a 4-Series, create the admin account at first boot before anything else works.", "IP table on each panel and device points at the processor with the right IP ID: 'ipt' in Text Console shows what the processor sees.", "Program slot loaded and running: 'progcomments' and 'err' in Text Console."], "faults": [["Touch panel shows not connected", "Panel IP table (processor IP and IP ID), panel authentication matching the processor, and the panel project loaded with the same IP ID the program expects."], ["Program changes do not take effect", "Wrong program slot, or the processor still runs the previous compile; reload the .lpz and reboot; 'progreset' if needed."], ["RS-232 device does not respond", "Baud and pinout (straight or null cable depends on the device), and the driver's command set; send the command manually from Text Console to isolate."], ["Control-subnet devices unreachable from the LAN", "Processors with a control subnet only route to the LAN when configured; devices on the control subnet get DHCP from the processor."], ["Panel joins then drops", "Duplicate IP IDs, firmware mismatch, or a second processor answering on the same IP."]], "ports": ["CIP control: TCP 41794 (secure CIP 41796)", "Console: SSH TCP 22 (Text Console)", "Web UI and XiO: HTTPS at the device IP", "Autodiscovery: broadcast on the local subnet"], "backup": ["Source, compiled .lpz and panel projects, dated", "IP table and Ethernet settings exported from Toolbox", "Processor firmware and program version in the handover"]}, {"name": "Crestron DM NVX", "tool": "Each NVX's web UI at its IP. DM NVX Director for multi-unit routing and multicast management. Crestron Toolbox for discovery and firmware.", "first": ["Every NVX on a 1 Gb non-blocking switch with IGMP snooping and one querier per VLAN. Without the querier the whole VLAN floods.", "Each transmitter has a unique multicast address (Director assigns them); receivers subscribe by transmitter name or address.", "Identical firmware across every NVX in the system; mixed firmware causes join failures."], "faults": [["Receiver shows no video after a route", "IGMP querier present? Receiver's multicast address matches the transmitter? Stream started on the transmitter (Auto Initiate) and the input has an active source?"], ["Video freezes or tears", "A 4K60 stream uses most of a 1 Gb link; check port bandwidth, IGMP snooping timers, and that EEE is off."], ["Blank image on a protected source", "HDCP mode on the transmitter input and receiver output; the display's HDCP version; force a resolution the display supports."], ["USB does not follow the video", "USB routing is a separate pairing; check the pairing and that the USB device or hub is powered."], ["Cannot log in to the web UI", "First login requires creating an admin user; if the credentials are lost, factory reset from the recessed button and reconfigure."]], "ports": ["Web UI: HTTPS at the device IP", "Video: multicast on the AV VLAN, up to 1 Gb per stream", "Director: HTTPS at the Director's IP", "Discovery: Crestron Toolbox autodiscovery"], "backup": ["Each NVX's settings export, or the Director configuration", "The multicast address plan and the switch VLAN and IGMP settings", "Firmware version per unit"]}, {"name": "AMX (NetLinx)", "tool": "NetLinx Studio for programming and device discovery; TPDesign for Modero panels; the master's web UI for network, users and security.", "first": ["Master reachable in NetLinx Studio (listen for masters on the subnet, or add by IP); Telnet or SSH console for diagnostics.", "System number and device numbers: panels and devices address the master's system; duplicates knock each other offline.", "Master and panel firmware compatibility per the AMX matrix; update the master first."], "faults": [["Panel shows the AMX logo and no page", "Panel's master IP and system number; the panel file's device number matches the program; a panel with no connection shows the default page."], ["Program compiles but devices are offline", "Device tree in NetLinx Studio: D:P:S addresses in code match the physical ports; serial devices on the right port and baud."], ["Master reboots or runs slow", "Runaway loops or timeline flooding in code; read the console for errors; check free memory."], ["Cannot connect to the master", "ICSP authentication enabled: user credentials in NetLinx Studio's connection settings; firewall open on TCP 1319."], ["SVSi N-Series encoder or decoder not showing", "N-Command or NetLinx integration configured; same VLAN, IGMP for multicast, and matching firmware."]], "ports": ["ICSP (master and panels): TCP/UDP 1319", "Console: Telnet 23 or SSH 22", "Web UI: HTTP/HTTPS at the master IP", "Discovery: broadcast on the local subnet"], "backup": ["Workspace, source, compiled TKN and panel files, dated", "Master settings and device list export", "Master and panel firmware versions"]}, {"name": "Extron", "tool": "Extron Toolbelt for discovery, firmware and configuration; Global Configurator Pro and GUI Designer for IP Link Pro control; PCS (Product Configuration Software) for switchers; DSP Configurator for DMP.", "first": ["Device reachable in Toolbelt. Many units use the serial number as the initial password; change it and record where it lives.", "EDID Minder and Key Minder on switchers: every source sees an EDID even when no display is selected.", "DTP and HDBaseT runs on the cable category and shielding the distance rating requires for the resolution in use."], "faults": [["No image over a DTP or XTP run", "Cable length and category, both ends powered, matching DTP modes, and HDCP support at the display; a short known-good cable isolates the run."], ["Wrong resolution or no signal from a laptop", "EDID Minder assignment for that input; force a specific EDID; check the scaler's output rate."], ["Control commands ignored", "SIS commands over Telnet TCP 23 or SSH; the device may require a login first; test the command from Toolbelt's terminal."], ["IP Link Pro program not running", "Global Configurator Pro build uploaded and the controller rebooted; driver versions match the device firmware."], ["Audio missing on a DMP", "DSP Configurator: input gain, mix matrix crosspoints, output mutes and the AEC reference; meter each stage."]], "ports": ["SIS control: Telnet TCP 23, SSH TCP 22023", "Web UI: HTTP/HTTPS at the device IP", "Discovery: Extron Toolbelt (broadcast on the subnet)", "NAV AV-over-IP: multicast on the AV VLAN, NAVigator for management"], "backup": ["Device configurations exported from Toolbelt and PCS", "Global Configurator Pro project and DSP Configurator file", "Firmware versions"]}, {"name": "Dante (Audinate)", "tool": "Dante Controller for routing, clocking and diagnostics; Dante Updater for firmware; Dante Domain Manager when devices span subnets; Dante Virtual Soundcard for laptop test signals.", "first": ["Every device green in Dante Controller: one clock leader (grand master), no clock warnings.", "All Dante devices on one subnet unless Dante Domain Manager is in place; Dante discovery does not cross VLANs.", "Switch: IGMP snooping with a querier, EEE off, QoS with PTP clock traffic (DSCP 56) above audio (DSCP 46)."], "faults": [["Subscriptions show orange or red", "Orange: subscribed but not receiving (flow limits or multicast blocked). Red: source missing (device renamed or offline). Re-subscribe after any rename."], ["Clock unlocked, audio glitches", "More than one preferred leader, EEE on the switch, or PTP blocked; set one preferred leader and enable clock lock."], ["Device visible but the subscription fails", "Sample rate or encoding mismatch between devices; latency set too low for the network path."], ["Devices missing from Controller", "Laptop on a different subnet or on Wi-Fi; Dante wants the wired primary network; laptop firewall blocking mDNS."], ["Dropouts with many channels", "Unicast flow limits per device; use multicast flows for one-to-many; check switch bandwidth and IGMP."]], "ports": ["PTP clock: UDP 319 / 320", "Audio: UDP 4321 (multicast), 14336-14600 (unicast)", "Control and discovery: UDP 4440-4455, 8700-8708, 8751, mDNS 5353", "Controller PC: wired, same subnet, firewall open for the above"], "backup": ["A preset from Dante Controller (device names and subscriptions)", "Screenshots of the Clock Status and Network Status tabs", "Dante firmware per device"]}, {"name": "Microsoft Teams Rooms", "tool": "Teams admin center and the Teams Rooms Pro Management portal. On the device, Settings with the admin password (Windows units ship with 'sfb'). OEM tools for firmware: Logitech Sync, Crestron XiO Cloud, Poly Lens, Yealink.", "first": ["Resource account in Microsoft 365 with a Teams Rooms Pro or Basic license and the room mailbox set to auto-accept.", "Device signed in with the resource account and the calendar showing today's meetings.", "Every peripheral (camera, mic, speaker) certified for Teams Rooms and selected in the room's device settings, not the OS default."], "faults": [["Cannot sign in", "Modern authentication and MFA: the resource account needs a conditional access exemption; password expiry on the account; time and date on the device."], ["Meetings not on the calendar", "Mailbox calendar processing set by the tenant admin (auto accept, keep the subject, keep comments); the invite must include the room as a resource."], ["No audio or camera in the call", "Device selection in Teams Rooms settings; USB through the correct hub; peripheral firmware; a second app holding the device."], ["One-touch join missing", "Invite sent without the room as a resource, or third-party meeting join disabled in the room settings."], ["Console or display sleeps or goes black", "Windows power settings on MTRoW, HDMI-CEC on the display, console firmware; front-of-room display set as the extended display."]], "ports": ["Teams service: HTTPS 443 plus the Microsoft 365 URL and IP allow list", "Media: UDP 3478-3481 to the Teams transport relays", "Management: Teams Rooms Pro portal, Windows Update or the OEM update path", "Local admin: on-device Settings (Windows) or the OEM admin menu (Android)"], "backup": ["Resource account name and license type (never the password)", "Peripheral models, serials and firmware", "Room settings export from the Pro Management portal where available"]}, {"name": "Zoom Rooms", "tool": "Zoom web portal (Room Management > Zoom Rooms) and Zoom Device Management; the Zoom Rooms app on the room PC, Mac or appliance; the Zoom Rooms Controller app on the tablet.", "first": ["Zoom Rooms license assigned and the room activated with the activation code from the portal, or by signing in.", "Calendar integration set in the portal (Exchange, Microsoft 365 or Google service account) with the room resource assigned.", "Controller on the same network as the room, or paired with the pairing code shown on the room display."], "faults": [["Controller cannot find the room", "Different networks or discovery blocked; enter the pairing code from the room display."], ["Calendar empty", "Service account permissions on the room mailbox, the right resource assigned in the portal, and the room's time zone."], ["Wrong microphone or speaker in the meeting", "Device selection on the controller; lock the devices in the portal; firmware on the DSP or USB bridge."], ["Content sharing fails", "Wireless sharing needs the laptop and room to reach each other (sharing key or AirPlay); HDMI sharing needs the capture device selected as the share source."], ["Room signs out or shows offline", "App update pending, PC sleeping, or activation expired; check the last check-in in Zoom Device Management."]], "ports": ["Zoom service: HTTPS 443, plus Zoom's published IP ranges", "Media: UDP 8801-8810 (falls back to TCP 443)", "Management: Zoom Device Management in the portal", "Controller pairing: local discovery or pairing code"], "backup": ["Room name, license and calendar resource", "Appliance model, serial and app version", "Screenshot of the room's device settings"]}];

  if (typeof module !== 'undefined' && module.exports) module.exports = C; else root.AVCore = C;
})(typeof window !== 'undefined' ? window : globalThis);
